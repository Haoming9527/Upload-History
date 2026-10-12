import { describe, expect, it, vi } from 'vitest';
import {
  CapturePipeline,
  MAX_QUEUED_FILES,
  MAX_QUEUE_AGE_MS,
  type CaptureItem,
} from '../../src/capture/pipeline';
import { captureMetadata, capturePolicyChanged } from '../../src/capture/metadata';
import {
  CHUNK_BYTES,
  DEFAULT_SETTINGS,
  type ArchiveRecord,
  type Message,
  type RecordingMode,
} from '../../src/shared/types';
import { fromBase64 } from '../../src/shared/messages';

function item(bytes = new Uint8Array([1, 2, 3])): CaptureItem {
  const file = new File([bytes], 'assignment.pdf', { type: 'application/pdf', lastModified: 123 });
  return {
    file,
    metadata: captureMetadata(file, 'input', 'Assignment', 'https://school.example/task')!,
  };
}

function harness(
  mode: RecordingMode = 'copies',
  options: { blockChunk?: Promise<void>; noToken?: boolean } = {},
) {
  const messages: Message[] = [];
  let counter = 0;
  const send = async <T>(message: Message): Promise<T> => {
    messages.push(message);
    if (message.type === 'capture:policy')
      return { mode, maxFileBytes: 10 * CHUNK_BYTES, epoch: 'initial-epoch' } as T;
    if (message.type === 'capture:begin') {
      const record: ArchiveRecord = {
        ...message.metadata,
        id: String(++counter),
        site: 'school.example',
        frameOrigin: 'https://school.example',
        capturedAt: 1,
        expiresAt: null,
        kept: false,
        mode: mode === 'logs' ? 'logs' : 'copies',
        status: mode === 'logs' ? 'logs' : options.noToken ? 'failed' : 'saving',
      };
      return { record, token: mode === 'copies' && !options.noToken ? 'token' : undefined } as T;
    }
    if (message.type === 'capture:chunk') await options.blockChunk;
    return undefined as T;
  };
  return {
    send,
    messages,
    count: (type: Message['type']) => messages.filter((message) => message.type === type).length,
  };
}

describe('capture privacy and streaming', () => {
  it('never calls a file byte-reading API in logs mode', async () => {
    const capture = item();
    const slice = vi.spyOn(capture.file, 'slice');
    const arrayBuffer = vi.spyOn(capture.file, 'arrayBuffer');
    const text = vi.spyOn(capture.file, 'text');
    const stream = vi.spyOn(capture.file, 'stream');
    const background = harness('logs');
    const pipeline = new CapturePipeline(background);
    pipeline.enqueue([capture]);
    await vi.waitFor(() => expect(background.count('capture:begin')).toBe(1));
    expect(slice).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(background.count('capture:chunk')).toBe(0);
    expect(background.count('capture:finish')).toBe(0);
  });

  it('does not read a rejected or oversized copy', async () => {
    const capture = item();
    const slice = vi.spyOn(capture.file, 'slice');
    const background = harness('copies', { noToken: true });
    new CapturePipeline(background).enqueue([capture]);
    await vi.waitFor(() => expect(background.count('capture:begin')).toBe(1));
    expect(slice).not.toHaveBeenCalled();
    expect(background.count('capture:finish')).toBe(0);
  });

  it('streams exact ordered chunks after begin and then commits once', async () => {
    const bytes = Uint8Array.from({ length: CHUNK_BYTES + 3 }, (_, index) => index % 256);
    const background = harness();
    new CapturePipeline(background).enqueue([item(bytes)]);
    await vi.waitFor(() => expect(background.count('capture:finish')).toBe(1));
    expect(background.messages.map((message) => message.type)).toEqual([
      'capture:policy',
      'capture:begin',
      'capture:chunk',
      'capture:chunk',
      'capture:finish',
    ]);
    expect(background.messages.find((message) => message.type === 'capture:begin')?.epoch).toBe(
      'initial-epoch',
    );
    const chunks = background.messages.filter((message) => message.type === 'capture:chunk');
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
    expect(fromBase64(chunks[0]!.data)).toEqual(bytes.subarray(0, CHUNK_BYTES));
    expect(fromBase64(chunks[1]!.data)).toEqual(bytes.subarray(CHUNK_BYTES));
  });

  it('stops before reading the next chunk when settings change', async () => {
    let release!: () => void;
    const blockChunk = new Promise<void>((resolve) => {
      release = resolve;
    });
    const background = harness('copies', { blockChunk });
    const capture = item(new Uint8Array(CHUNK_BYTES + 1));
    const slice = vi.spyOn(capture.file, 'slice');
    const pipeline = new CapturePipeline(background);
    pipeline.enqueue([capture]);
    await vi.waitFor(() => expect(background.count('capture:chunk')).toBe(1));
    pipeline.policyChanged();
    release();
    await vi.waitFor(() => expect(background.count('capture:fail')).toBe(1));
    expect(slice).toHaveBeenCalledTimes(1);
    expect(background.count('capture:finish')).toBe(0);
  });

  it('limits active copies to two and reports overflow and stale queued references without metadata', async () => {
    let release!: () => void;
    let now = 1;
    const blockChunk = new Promise<void>((resolve) => {
      release = resolve;
    });
    const background = harness('copies', { blockChunk });
    const pipeline = new CapturePipeline({ ...background, now: () => now });
    expect(pipeline.enqueue(Array.from({ length: 100 }, () => item()))).toBe(MAX_QUEUED_FILES);
    await vi.waitFor(() => expect(background.count('capture:chunk')).toBe(2));
    expect(background.count('capture:begin')).toBe(2);
    now += MAX_QUEUE_AGE_MS + 1;
    release();
    await vi.waitFor(() => expect(background.count('capture:finish')).toBe(2));
    await vi.waitFor(() => {
      const expired = background.messages.filter(
        (message) => message.type === 'capture:skipped' && message.reason === 'queue-expired',
      );
      expect(
        expired.reduce(
          (count, message) => count + (message.type === 'capture:skipped' ? message.count : 0),
          0,
        ),
      ).toBe(MAX_QUEUED_FILES - 2);
    });
    const warnings = background.messages.filter((message) => message.type === 'capture:skipped');
    expect(warnings.find((message) => message.reason === 'queue-full')).toEqual({
      type: 'capture:skipped',
      count: 100 - MAX_QUEUED_FILES,
      reason: 'queue-full',
      epoch: 'initial-epoch',
    });
    expect(
      warnings.every(
        (message) => Object.keys(message).sort().join(',') === 'count,epoch,reason,type',
      ),
    ).toBe(true);
    expect(background.count('capture:begin')).toBe(2);
    pipeline.dispose();
  });

  it('does not warn about skipped captures when recording is disabled', async () => {
    const background = harness('disabled');
    const pipeline = new CapturePipeline(background);
    pipeline.enqueue(Array.from({ length: 100 }, () => item()));
    // Flush policy and queued worker continuations without waiting on a warning that must not happen.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(background.count('capture:skipped')).toBe(0);
    expect(background.count('capture:begin')).toBe(0);
    pipeline.dispose();
  });

  it('drops pending overflow warnings after a policy change', async () => {
    let resolvePolicy!: (policy: { mode: 'copies'; maxFileBytes: number; epoch: string }) => void;
    const policy = new Promise((resolve) => {
      resolvePolicy = resolve;
    });
    const messages: Message[] = [];
    const send = async <T>(message: Message): Promise<T> => {
      messages.push(message);
      if (message.type === 'capture:policy') return (await policy) as T;
      throw new Error('No capture or warning should be sent after invalidation');
    };
    const pipeline = new CapturePipeline({ send });
    pipeline.enqueue(Array.from({ length: 100 }, () => item()));
    pipeline.policyChanged();
    resolvePolicy({ mode: 'copies', maxFileBytes: CHUNK_BYTES, epoch: 'old-epoch' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(messages.map((message) => message.type)).toEqual(['capture:policy']);
    pipeline.dispose();
  });

  it('records deliberate repeated selections separately', async () => {
    const background = harness('logs');
    const pipeline = new CapturePipeline(background);
    const selection = item();
    pipeline.enqueue([selection]);
    pipeline.enqueue([selection]);
    await vi.waitFor(() => expect(background.count('capture:begin')).toBe(2));
    const starts = background.messages.filter((message) => message.type === 'capture:begin');
    expect(starts[0]!.captureId).not.toBe(starts[1]!.captureId);
  });

  it('sends the event policy epoch so the worker can reject a begin racing with clear', async () => {
    const selection = item();
    const slice = vi.spyOn(selection.file, 'slice');
    let currentEpoch = 'before-clear';
    const messages: Message[] = [];
    const send = async <T>(message: Message): Promise<T> => {
      messages.push(message);
      if (message.type === 'capture:policy') {
        const policy = { mode: 'copies', maxFileBytes: CHUNK_BYTES, epoch: currentEpoch };
        currentEpoch = 'after-clear';
        return policy as T;
      }
      if (message.type === 'capture:begin' && message.epoch !== currentEpoch)
        throw new Error('Expired capture policy');
      throw new Error('Unexpected capture');
    };
    new CapturePipeline({ send }).enqueue([selection]);
    await vi.waitFor(() =>
      expect(messages.filter((message) => message.type === 'capture:begin')).toHaveLength(1),
    );
    expect(messages.find((message) => message.type === 'capture:begin')?.epoch).toBe(
      'before-clear',
    );
    expect(slice).not.toHaveBeenCalled();
    expect(messages.some((message) => message.type === 'capture:chunk')).toBe(false);
  });
});

describe('capture metadata and setting invalidation', () => {
  it('bounds metadata and strips control characters without reading contents', () => {
    const capture = item();
    const metadata = captureMetadata(
      capture.file,
      'drop',
      'a\u0000'.repeat(500),
      'https://school.example/',
    )!;
    expect(metadata.pageTitle).toHaveLength(256);
    expect(metadata.pageTitle).not.toContain('\u0000');
    expect(metadata.method).toBe('drop');
  });

  it('ignores retention-only edits but cancels on recording or site changes', () => {
    expect(capturePolicyChanged(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, retentionDays: 30 })).toBe(
      false,
    );
    expect(capturePolicyChanged(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, paused: true })).toBe(
      true,
    );
    expect(
      capturePolicyChanged(DEFAULT_SETTINGS, {
        ...DEFAULT_SETTINGS,
        siteModes: { 'school.example': 'logs' },
      }),
    ).toBe(true);
  });
});
