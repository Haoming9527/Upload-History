import { toBase64 } from '../shared/messages';
import {
  CHUNK_BYTES,
  type BeginResult,
  type CaptureMetadata,
  type CapturePolicy,
  type Message,
} from '../shared/types';

export const MAX_QUEUED_FILES = 64;
export const MAX_QUEUE_AGE_MS = 120_000;
const COPY_FAILURE = 'The local copy was interrupted or could not be saved.';

export interface CaptureItem {
  file: File;
  metadata: CaptureMetadata;
}
interface QueuedItem extends CaptureItem {
  queuedAt: number;
  generation: number;
  policy: Promise<CapturePolicy>;
}
interface Dependencies {
  send: <T>(message: Message) => Promise<T>;
  now?: () => number;
  uuid?: () => string;
}

/** File references are captured synchronously, but bytes are read only after begin grants a copy token. */
export class CapturePipeline {
  private readonly queue: QueuedItem[] = [];
  private generation = 0;
  private active = 0;
  private disposed = false;
  private readonly now: () => number;
  private readonly uuid: () => string;

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now;
    this.uuid = dependencies.uuid ?? (() => crypto.randomUUID());
  }

  enqueue(items: CaptureItem[]): number {
    if (this.disposed || !items.length) return 0;
    // Refresh once for every trusted event; never use a stale cached permission.
    const policy = this.dependencies
      .send<CapturePolicy>({ type: 'capture:policy' })
      .catch((): CapturePolicy => ({ mode: 'disabled', maxFileBytes: 0, epoch: '' }));
    const available = MAX_QUEUED_FILES - this.queue.length;
    const accepted = items.slice(0, available);
    const queuedAt = this.now();
    const generation = this.generation;
    for (const item of accepted)
      this.queue.push({ ...item, queuedAt, generation: this.generation, policy });
    if (accepted.length < items.length)
      void this.notifySkipped(items.length - accepted.length, 'queue-full', generation, policy);
    this.pump();
    return accepted.length;
  }

  policyChanged(): void {
    this.generation++;
    this.queue.length = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.policyChanged();
  }

  private pump(): void {
    while (!this.disposed && this.active < 2 && this.queue.length) {
      const item = this.queue.shift()!;
      this.active++;
      void this.capture(item).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private current(item: QueuedItem): boolean {
    return !this.disposed && item.generation === this.generation;
  }

  private async notifySkipped(
    count: number,
    reason: 'queue-full' | 'queue-expired',
    generation: number,
    eventPolicy: Promise<CapturePolicy>,
  ): Promise<void> {
    try {
      const policy = await eventPolicy;
      if (this.disposed || generation !== this.generation || policy.mode === 'disabled') return;
      await this.dependencies.send({ type: 'capture:skipped', count, reason, epoch: policy.epoch });
    } catch {
      /* Revoked consent or a cleared archive also invalidates its pending warnings. */
    }
  }

  private discardExpiredBatch(item: QueuedItem): number {
    let count = 1;
    const now = this.now();
    for (let index = this.queue.length - 1; index >= 0; index--) {
      const queued = this.queue[index]!;
      if (
        queued.policy === item.policy &&
        queued.generation === item.generation &&
        now - queued.queuedAt > MAX_QUEUE_AGE_MS
      ) {
        this.queue.splice(index, 1);
        count++;
      }
    }
    return count;
  }

  private async capture(item: QueuedItem): Promise<void> {
    let begun: BeginResult | undefined;
    try {
      const policy = await item.policy;
      if (!this.current(item) || policy.mode === 'disabled') return;
      if (this.now() - item.queuedAt > MAX_QUEUE_AGE_MS) {
        await this.notifySkipped(
          this.discardExpiredBatch(item),
          'queue-expired',
          item.generation,
          item.policy,
        );
        return;
      }
      begun = await this.dependencies.send<BeginResult>({
        type: 'capture:begin',
        captureId: this.uuid(),
        epoch: policy.epoch,
        metadata: item.metadata,
      });
      // Logs and rejected copies have no token. Do not even call File.slice in these cases.
      if (!begun.token) return;
      // The worker checked current limits at admission; selection-time limits may be stale.
      const ensureCurrent = () => {
        if (!this.current(item) || policy.mode !== 'copies' || begun?.record.mode !== 'copies')
          throw new Error('Copy unavailable');
      };
      ensureCurrent();
      let index = 0;
      for (let offset = 0; offset < item.file.size; offset += CHUNK_BYTES) {
        ensureCurrent();
        const bytes = new Uint8Array(
          await item.file.slice(offset, offset + CHUNK_BYTES).arrayBuffer(),
        );
        ensureCurrent();
        await this.dependencies.send({
          type: 'capture:chunk',
          id: begun.record.id,
          token: begun.token,
          index: index++,
          data: toBase64(bytes),
        });
      }
      ensureCurrent();
      await this.dependencies.send({
        type: 'capture:finish',
        id: begun.record.id,
        token: begun.token,
      });
    } catch {
      if (begun?.token) {
        try {
          await this.dependencies.send({
            type: 'capture:fail',
            id: begun.record.id,
            token: begun.token,
            reason: COPY_FAILURE,
          });
        } catch {
          /* The worker may already have cancelled the record, or the extension was disabled. */
        }
      }
    }
  }
}
