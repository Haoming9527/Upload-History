import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Archive, RECORD_ALLOWANCE } from '../../src/storage/archive';
import { CHUNK_BYTES, type ArchiveRecord } from '../../src/shared/types';

const LIMITS = { maxFileBytes: 50 * 1024 * 1024, budgetBytes: 500 * 1024 * 1024 };
const instances: Archive[] = [];

function setup() {
  const name = `archive-test-${crypto.randomUUID()}`;
  const archive = new Archive(name);
  instances.push(archive);
  return { archive, name };
}

function record(size: number, extra: Partial<ArchiveRecord> = {}): ArchiveRecord {
  const capturedAt = Date.now();
  return {
    id: crypto.randomUUID(),
    name: 'private-assignment.txt',
    size,
    mime: 'text/plain',
    lastModified: capturedAt,
    pageTitle: 'Private assignment portal',
    pageUrl: 'https://school.example/assignment',
    method: 'input',
    site: 'school.example',
    frameOrigin: 'https://uploads.example',
    capturedAt,
    expiresAt: capturedAt + 90 * 86400000,
    kept: false,
    mode: 'copies',
    status: 'saving',
    ...extra,
  };
}

async function save(archive: Archive, bytes: Uint8Array, extra: Partial<ArchiveRecord> = {}) {
  const result = await archive.begin(record(bytes.length, extra), LIMITS);
  expect(result.token).toBeTypeOf('string');
  for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTES, index++) {
    await archive.append(
      result.record.id,
      result.token!,
      index,
      bytes.subarray(offset, offset + CHUNK_BYTES),
    );
  }
  return archive.finish(result.record.id, result.token!);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(instances.splice(0).map((archive) => archive.close()));
});

describe('encrypted archive', () => {
  it('recovers independent identical bytes after closing and reopening the database', async () => {
    const { archive, name } = setup();
    const bytes = new Uint8Array(CHUNK_BYTES + 137);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
    const original = bytes.slice();
    const saved = await save(archive, bytes);
    bytes.fill(0); // Neither caller buffers nor a File reference are the stored copy.
    await archive.close();
    const reopened = new Archive(name);
    instances.push(reopened);
    await reopened.recover();
    expect((await reopened.download(saved.id)).bytes).toEqual(original);
    expect(saved.status).toBe('saved');
    expect(saved.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await reopened.usage()).reservedBytes).toBe(0);
  });

  it('stores separate occurrences with the same filename', async () => {
    const { archive } = setup();
    const first = await save(archive, new Uint8Array([1, 2]));
    const second = await save(archive, new Uint8Array([3, 4]));
    expect(first.name).toBe(second.name);
    expect(first.id).not.toBe(second.id);
    expect((await archive.download(first.id)).bytes).toEqual(new Uint8Array([1, 2]));
    expect((await archive.download(second.id)).bytes).toEqual(new Uint8Array([3, 4]));
  });

  it('encrypts metadata and binary contents with a non-extractable persisted key', async () => {
    const { archive, name } = setup();
    const saved = await save(archive, new TextEncoder().encode('secret assignment contents'));
    const raw = await openDB(name);
    const stored = await raw.get('records', saved.id);
    const chunks = await raw.getAll('chunks');
    const key = await raw.get('keys', 'archive');
    expect(JSON.stringify(stored)).not.toContain('private-assignment');
    expect(JSON.stringify(stored)).not.toContain('school.example');
    expect(new TextDecoder().decode(chunks[0].data)).not.toContain('secret assignment contents');
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    raw.close();
  });

  it('logs metadata without hashing or storing file chunks', async () => {
    const { archive, name } = setup();
    const hash = vi.spyOn(crypto.subtle, 'digest');
    const result = await archive.begin(record(100_000_000, { mode: 'logs' }), LIMITS);
    expect(result.record.status).toBe('logs');
    expect(result.token).toBeUndefined();
    expect(hash).not.toHaveBeenCalled();
    const raw = await openDB(name);
    expect(await raw.count('chunks')).toBe(0);
    raw.close();
    expect(await archive.usage()).toEqual({
      usedBytes: RECORD_ALLOWANCE,
      reservedBytes: 0,
      records: 1,
      saved: 0,
    });
    await expect(archive.download(result.record.id)).rejects.toThrow('No saved copy');
  });

  it('reserves capacity across simultaneous captures and preserves existing copies', async () => {
    const { archive } = setup();
    const limits = {
      maxFileBytes: CHUNK_BYTES,
      budgetBytes: 2 * RECORD_ALLOWANCE + CHUNK_BYTES + 64,
    };
    const [first, second] = await Promise.all([
      archive.begin(record(CHUNK_BYTES), limits),
      archive.begin(record(CHUNK_BYTES), limits),
    ]);
    expect(first.record.status).toBe('saving');
    expect(second.record.status).toBe('failed');
    expect(second.record.failure).toContain('budget');
    expect((await archive.usage()).reservedBytes).toBe(CHUNK_BYTES + 64);
    await archive.append(first.record.id, first.token!, 0, new Uint8Array(CHUNK_BYTES).fill(7));
    await archive.finish(first.record.id, first.token!);
    expect((await archive.download(first.record.id)).bytes[0]).toBe(7);
    expect((await archive.usage()).usedBytes).toBe(limits.budgetBytes);
  });

  it('preserves failure details for oversized files and rejects metadata when completely full', async () => {
    const { archive } = setup();
    const result = await archive.begin(record(101), {
      maxFileBytes: 100,
      budgetBytes: RECORD_ALLOWANCE,
    });
    expect(result.record.status).toBe('failed');
    expect(result.record.failure).toContain('maximum');
    expect(result.token).toBeUndefined();
    await expect(
      archive.begin(record(0), { maxFileBytes: 100, budgetBytes: RECORD_ALLOWANCE }),
    ).rejects.toThrow('No space');
    expect((await archive.list()).length).toBe(1);
  });

  it('rejects late writes after deletion, including when the caller reuses an id', async () => {
    const { archive } = setup();
    const first = await archive.begin(record(3), LIMITS);
    await archive.append(first.record.id, first.token!, 0, new Uint8Array([1, 2, 3]));
    await archive.delete([first.record.id]);
    await expect(archive.finish(first.record.id, first.token!)).rejects.toThrow('cancelled');
    const second = await archive.begin(record(3, { id: first.record.id }), LIMITS);
    expect(second.token).not.toBe(first.token);
    await expect(
      archive.append(first.record.id, first.token!, 0, new Uint8Array([1, 2, 3])),
    ).rejects.toThrow('cancelled');
    await archive.append(second.record.id, second.token!, 0, new Uint8Array([4, 5, 6]));
    await archive.finish(second.record.id, second.token!);
    expect((await archive.download(second.record.id)).bytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('does not resurrect records after clear or a delayed failure report', async () => {
    const { archive, name } = setup();
    const pending = await archive.begin(record(3), LIMITS);
    await archive.clear();
    await expect(
      archive.append(pending.record.id, pending.token!, 0, new Uint8Array([1, 2, 3])),
    ).rejects.toThrow('cancelled');
    await archive.fail(pending.record.id, pending.token!, 'late failure');
    expect(await archive.list()).toEqual([]);
    const raw = await openDB(name);
    expect(await raw.count('chunks')).toBe(0);
    raw.close();
  });

  it('marks interrupted saves failed and releases their partial chunks and reservation', async () => {
    const { archive, name } = setup();
    const pending = await archive.begin(record(CHUNK_BYTES + 1), LIMITS);
    await archive.append(pending.record.id, pending.token!, 0, new Uint8Array(CHUNK_BYTES));
    await archive.close();
    const reopened = new Archive(name);
    instances.push(reopened);
    await reopened.recover();
    expect((await reopened.list())[0]?.status).toBe('failed');
    expect((await reopened.list())[0]?.failure).toContain('interrupted');
    expect(await reopened.usage()).toEqual({
      usedBytes: RECORD_ALLOWANCE,
      reservedBytes: 0,
      records: 1,
      saved: 0,
    });
    const raw = await openDB(name);
    expect(await raw.count('chunks')).toBe(0);
    raw.close();
    await expect(reopened.finish(pending.record.id, pending.token!)).rejects.toThrow('cancelled');
  });

  it('cancels only the requested site and preserves already saved copies', async () => {
    const { archive } = setup();
    const saved = await save(archive, new Uint8Array([9]));
    const pending = await archive.begin(record(1), LIMITS);
    const other = await archive.begin(record(1, { site: 'other.example' }), LIMITS);
    await archive.cancelPending('school.example');
    await expect(
      archive.append(pending.record.id, pending.token!, 0, new Uint8Array([1])),
    ).rejects.toThrow('cancelled');
    await archive.append(other.record.id, other.token!, 0, new Uint8Array([2]));
    await archive.finish(other.record.id, other.token!);
    expect((await archive.download(saved.id)).bytes[0]).toBe(9);
  });

  it('keeps pinned records while deleting expired copies and their chunks', async () => {
    const { archive, name } = setup();
    const kept = await save(archive, new Uint8Array([1]));
    const expired = await save(archive, new Uint8Array([2]));
    await archive.keep(kept.id, true, 90);
    await archive.cleanup(Date.now() + 91 * 86400000);
    expect((await archive.list()).map((item) => item.id)).toEqual([kept.id]);
    expect((await archive.download(kept.id)).record.expiresAt).toBeNull();
    await expect(archive.download(expired.id)).rejects.toThrow('No saved copy');
    const raw = await openDB(name);
    expect(await raw.count('chunks')).toBe(1);
    raw.close();
    await archive.keep(kept.id, false, 90);
    expect((await archive.list())[0]?.expiresAt).toBe(kept.capturedAt + 90 * 86400000);
  });

  it('rejects incomplete, out-of-order, oversized, and duplicate chunks', async () => {
    const { archive } = setup();
    const pending = await archive.begin(record(3), LIMITS);
    await expect(archive.finish(pending.record.id, pending.token!)).rejects.toThrow('incomplete');
    await expect(
      archive.append(pending.record.id, pending.token!, 1, new Uint8Array(3)),
    ).rejects.toThrow('order');
    await expect(
      archive.append(pending.record.id, pending.token!, 0, new Uint8Array(2)),
    ).rejects.toThrow('size');
    await expect(
      archive.append(pending.record.id, pending.token!, 0, new Uint8Array(CHUNK_BYTES + 1)),
    ).rejects.toThrow('Invalid');
    await archive.append(pending.record.id, pending.token!, 0, new Uint8Array(3));
    await expect(
      archive.append(pending.record.id, pending.token!, 0, new Uint8Array(3)),
    ).rejects.toThrow('order');
    expect((await archive.finish(pending.record.id, pending.token!)).status).toBe('saved');
  });

  it('removes an expiring save and rejects its late completion', async () => {
    const { archive } = setup();
    const pending = await archive.begin(record(1), LIMITS);
    await archive.append(pending.record.id, pending.token!, 0, new Uint8Array([1]));
    await archive.cleanup(Date.now() + 91 * 86400000);
    await expect(archive.finish(pending.record.id, pending.token!)).rejects.toThrow('cancelled');
    expect(await archive.list()).toEqual([]);
    expect((await archive.usage()).usedBytes).toBe(0);
  });

  it('supports unpinning when the configured retention is unlimited', async () => {
    const { archive } = setup();
    const saved = await save(archive, new Uint8Array([1]));
    await archive.keep(saved.id, true, 0);
    await archive.keep(saved.id, false, 0);
    await archive.cleanup(Date.now() + 1000 * 86400000);
    expect((await archive.list())[0]).toMatchObject({ kept: false, expiresAt: null });
  });

  it('saves empty files without inventing a chunk', async () => {
    const { archive } = setup();
    const saved = await save(archive, new Uint8Array());
    expect((await archive.download(saved.id)).bytes.length).toBe(0);
    expect(saved.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('detects tampered encrypted chunks and metadata', async () => {
    const { archive, name } = setup();
    const saved = await save(archive, new Uint8Array([1, 2, 3]));
    const raw = await openDB(name);
    const chunk = await raw.get('chunks', [saved.id, 0]);
    const chunkBytes = new Uint8Array(chunk.data);
    chunkBytes[0] = chunkBytes[0]! ^ 1;
    await raw.put('chunks', chunk);
    await expect(archive.download(saved.id)).rejects.toThrow('integrity');
    const stored = await raw.get('records', saved.id);
    const metadataBytes = new Uint8Array(stored.metadata.data);
    metadataBytes[0] = metadataBytes[0]! ^ 1;
    await raw.put('records', stored);
    await expect(archive.list()).rejects.toThrow('integrity');
    raw.close();
  });

  it('never silently replaces a missing existing key; clear provides explicit recovery', async () => {
    const { archive, name } = setup();
    await save(archive, new Uint8Array([42]));
    const raw = await openDB(name);
    await raw.delete('keys', 'archive');
    await expect(archive.list()).rejects.toThrow('key is missing');
    expect(await raw.get('keys', 'archive')).toBeUndefined();
    await archive.clear();
    const fresh = await save(archive, new Uint8Array([7]));
    expect((await archive.download(fresh.id)).bytes[0]).toBe(7);
    raw.close();
  });
});
