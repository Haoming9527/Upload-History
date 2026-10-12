import { archiveKey, encrypt, decrypt, encryptRecord, readRecord, digest } from './crypto';
import type { ArchiveDB, StoredRecord } from './schema';
import { openDB, type IDBPDatabase } from 'idb';
import {
  CHUNK_BYTES,
  type ArchiveLimits,
  type ArchiveRecord,
  type ArchiveUsage,
  type BeginResult,
  type DownloadData,
} from '../shared/types';

// Budget accounting is conservative, not a measurement of IndexedDB's disk files.
export const RECORD_ALLOWANCE = 16 * 1024;
const MAX_RECORDS = 10_000;
const CHUNK_ALLOWANCE = 64;
const DAY = 86_400_000;

// The background worker owns persistence. This also serializes multiple instances
// in one worker (including tests), without holding an IDB transaction over crypto.
const queues = new Map<string, Promise<void>>();

function buffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function chunkCost(size: number): number {
  return size + Math.ceil(size / CHUNK_BYTES) * CHUNK_ALLOWANCE;
}

export class Archive {
  private database?: Promise<IDBPDatabase<ArchiveDB>>;

  constructor(private readonly name = 'upload-history-archive') {}

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(this.name) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    queues.set(this.name, tail);
    void tail.then(() => {
      if (queues.get(this.name) === tail) queues.delete(this.name);
    });
    return result;
  }

  private db(): Promise<IDBPDatabase<ArchiveDB>> {
    this.database ??= openDB<ArchiveDB>(this.name, 1, {
      upgrade(db) {
        db.createObjectStore('keys');
        db.createObjectStore('records', { keyPath: 'id' });
        db.createObjectStore('chunks', { keyPath: ['id', 'index'] }).createIndex('by-record', 'id');
      },
      blocking: () => {
        void this.database?.then((db) => db.close());
        this.database = undefined;
      },
      terminated: () => {
        this.database = undefined;
      },
    });
    return this.database;
  }

  private summarize(rows: StoredRecord[]): ArchiveUsage {
    return rows.reduce<ArchiveUsage>(
      (usage, row) => ({
        usedBytes: usage.usedBytes + row.chargedBytes,
        reservedBytes: usage.reservedBytes + row.reservedBytes,
        records: usage.records + 1,
        saved: usage.saved + (row.status === 'saved' ? 1 : 0),
      }),
      { usedBytes: 0, reservedBytes: 0, records: 0, saved: 0 },
    );
  }

  private async remove(db: IDBPDatabase<ArchiveDB>, ids: string[]): Promise<void> {
    const tx = db.transaction(['records', 'chunks'], 'readwrite');
    for (const id of new Set(ids)) {
      const keys = await tx.objectStore('chunks').index('by-record').getAllKeys(id);
      for (const key of keys) await tx.objectStore('chunks').delete(key);
      await tx.objectStore('records').delete(id);
    }
    await tx.done;
  }

  private async expire(db: IDBPDatabase<ArchiveDB>, key: CryptoKey, now: number): Promise<void> {
    const ids: string[] = [];
    for (const row of await db.getAll('records')) {
      if (row.expiresAt !== null && row.expiresAt <= now && !row.kept) {
        const record = await readRecord(key, row);
        if (!record.kept && record.expiresAt !== null && record.expiresAt <= now) ids.push(row.id);
      }
    }
    if (ids.length) await this.remove(db, ids);
  }

  begin(input: ArchiveRecord, limits: ArchiveLimits): Promise<BeginResult> {
    // Snapshot caller metadata before it can change while waiting in the queue.
    const record: ArchiveRecord = structuredClone(input);
    return this.run(async () => {
      if (
        !record.id ||
        record.id.length > 128 ||
        !validCount(record.size) ||
        !validCount(record.capturedAt) ||
        (record.expiresAt !== null && !validCount(record.expiresAt)) ||
        !['copies', 'logs'].includes(record.mode) ||
        !validCount(limits.maxFileBytes) ||
        !validCount(limits.budgetBytes)
      )
        throw new Error('Invalid archive record or limits.');
      const db = await this.db();
      const key = await archiveKey(db);
      await this.expire(db, key, Date.now());
      const rows = await db.getAll('records');
      if (rows.some((row) => row.id === record.id)) throw new Error('This capture already exists.');
      if (rows.length >= MAX_RECORDS)
        throw new Error('The archive record limit is reached. Delete records to save more.');
      const usage = this.summarize(rows);
      const remaining = limits.budgetBytes - usage.usedBytes - usage.reservedBytes;
      if (remaining < RECORD_ALLOWANCE)
        throw new Error('The archive is full. No space remains to save file details.');
      record.status = record.mode === 'logs' ? 'logs' : 'saving';
      delete record.failure;
      delete record.sha256;
      record.expiresAt = record.kept ? null : record.expiresAt;
      if (record.mode === 'copies' && record.size > limits.maxFileBytes) {
        record.status = 'failed';
        record.failure = 'The file exceeds your maximum file size.';
      } else if (
        record.mode === 'copies' &&
        chunkCost(record.size) > remaining - RECORD_ALLOWANCE
      ) {
        record.status = 'failed';
        record.failure = 'The archive storage budget is full. Existing copies were preserved.';
      }
      const generation = crypto.randomUUID();
      const row: StoredRecord = {
        id: record.id,
        generation,
        metadata: await encryptRecord(key, record, generation),
        status: record.status,
        size: record.size,
        expiresAt: record.expiresAt,
        kept: record.kept,
        nextChunk: 0,
        receivedBytes: 0,
        chargedBytes: RECORD_ALLOWANCE,
        reservedBytes: record.status === 'saving' ? chunkCost(record.size) : 0,
      };
      await db.add('records', row);
      return { record, ...(record.status === 'saving' ? { token: generation } : {}) };
    });
  }

  private async pending(
    db: IDBPDatabase<ArchiveDB>,
    id: string,
    token: string,
  ): Promise<StoredRecord> {
    const row = await db.get('records', id);
    if (!row || row.generation !== token || row.status !== 'saving')
      throw new Error('This save was cancelled or is no longer active.');
    if (!row.kept && row.expiresAt !== null && row.expiresAt <= Date.now()) {
      await this.remove(db, [id]);
      throw new Error('This record expired before saving finished.');
    }
    return row;
  }

  append(id: string, token: string, index: number, input: Uint8Array): Promise<void> {
    if (!(input instanceof Uint8Array) || input.byteLength > CHUNK_BYTES)
      return Promise.reject(new Error('Invalid file chunk.'));
    const bytes = buffer(input);
    return this.run(async () => {
      const db = await this.db();
      const key = await archiveKey(db);
      const row = await this.pending(db, id, token);
      if (index !== row.nextChunk || !validCount(index))
        throw new Error('File chunks arrived out of order.');
      if (
        bytes.byteLength !== Math.min(CHUNK_BYTES, row.size - row.receivedBytes) ||
        bytes.byteLength === 0
      )
        throw new Error('The file chunk size does not match the selected file.');
      const cipher = await encrypt(key, bytes, `upload-history:v1:chunk:${id}:${token}:${index}`);
      await this.pending(db, id, token); // Expiry may have passed during encryption.
      const tx = db.transaction(['records', 'chunks'], 'readwrite');
      const current = await tx.objectStore('records').get(id);
      if (
        !current ||
        current.generation !== token ||
        current.status !== 'saving' ||
        current.nextChunk !== index
      ) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new Error('This save was cancelled.');
      }
      const cost = bytes.byteLength + CHUNK_ALLOWANCE;
      await tx.objectStore('chunks').add({ id, index, size: bytes.byteLength, ...cipher });
      await tx.objectStore('records').put({
        ...current,
        nextChunk: index + 1,
        receivedBytes: current.receivedBytes + bytes.byteLength,
        chargedBytes: current.chargedBytes + cost,
        reservedBytes: current.reservedBytes - cost,
      });
      await tx.done;
    });
  }

  private async readBytes(
    db: IDBPDatabase<ArchiveDB>,
    key: CryptoKey,
    row: StoredRecord,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const chunks = await db.getAllFromIndex('chunks', 'by-record', row.id);
    chunks.sort((left, right) => left.index - right.index);
    if (chunks.length !== Math.ceil(row.size / CHUNK_BYTES) || row.receivedBytes !== row.size)
      throw new Error('The saved copy is incomplete.');
    const bytes = new Uint8Array(row.size);
    let offset = 0;
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      const expected = Math.min(CHUNK_BYTES, row.size - offset);
      if (chunk.index !== index || chunk.size !== expected)
        throw new Error('The saved copy has invalid chunks.');
      const plain = await decrypt(
        key,
        chunk,
        `upload-history:v1:chunk:${row.id}:${row.generation}:${index}`,
      );
      if (plain.length !== expected) throw new Error('The saved copy has invalid chunk data.');
      bytes.set(plain, offset);
      offset += plain.length;
    }
    return bytes;
  }

  finish(id: string, token: string): Promise<ArchiveRecord> {
    return this.run(async () => {
      const db = await this.db();
      const key = await archiveKey(db);
      const row = await this.pending(db, id, token);
      const record = await readRecord(key, row);
      const bytes = await this.readBytes(db, key, row);
      record.sha256 = await digest(bytes);
      record.status = 'saved';
      delete record.failure;
      const metadata = await encryptRecord(key, record, row.generation);
      await this.pending(db, id, token); // Hashing a large copy may cross its expiry.
      const tx = db.transaction('records', 'readwrite');
      const current = await tx.store.get(id);
      if (!current || current.generation !== token || current.status !== 'saving') {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new Error('This save was cancelled.');
      }
      await tx.store.put({ ...current, metadata, status: 'saved', reservedBytes: 0 });
      await tx.done;
      return record;
    });
  }

  private async markFailed(
    db: IDBPDatabase<ArchiveDB>,
    key: CryptoKey,
    row: StoredRecord,
    reason: string,
  ): Promise<void> {
    const record = await readRecord(key, row);
    record.status = 'failed';
    record.failure = reason.slice(0, 240);
    delete record.sha256;
    const metadata = await encryptRecord(key, record, row.generation);
    const tx = db.transaction(['records', 'chunks'], 'readwrite');
    const current = await tx.objectStore('records').get(row.id);
    if (!current || current.generation !== row.generation || current.status !== 'saving') {
      await tx.done;
      return;
    }
    for (const chunkKey of await tx.objectStore('chunks').index('by-record').getAllKeys(row.id))
      await tx.objectStore('chunks').delete(chunkKey);
    await tx.objectStore('records').put({
      ...current,
      metadata,
      status: 'failed',
      receivedBytes: 0,
      nextChunk: 0,
      chargedBytes: RECORD_ALLOWANCE,
      reservedBytes: 0,
    });
    await tx.done;
  }

  fail(id: string, token: string, reason: string): Promise<void> {
    return this.run(async () => {
      const db = await this.db();
      const row = await db.get('records', id);
      if (!row || row.generation !== token || row.status !== 'saving') return;
      await this.markFailed(db, await archiveKey(db), row, reason);
    });
  }

  list(): Promise<ArchiveRecord[]> {
    return this.run(async () => {
      const db = await this.db();
      const key = await archiveKey(db);
      await this.expire(db, key, Date.now());
      const records = await Promise.all(
        (await db.getAll('records')).map((row) => readRecord(key, row)),
      );
      return records.sort((left, right) => right.capturedAt - left.capturedAt);
    });
  }

  download(id: string): Promise<DownloadData> {
    return this.run(async () => {
      const db = await this.db();
      const key = await archiveKey(db);
      await this.expire(db, key, Date.now());
      const row = await db.get('records', id);
      if (!row || row.status !== 'saved')
        throw new Error('No saved copy is available for this record.');
      const record = await readRecord(key, row);
      const bytes = await this.readBytes(db, key, row);
      if ((await digest(bytes)) !== record.sha256)
        throw new Error('The saved copy failed its integrity check.');
      return { record, bytes };
    });
  }

  delete(ids: string[]): Promise<void> {
    return this.run(async () => {
      await this.remove(await this.db(), ids);
    });
  }

  clear(): Promise<void> {
    return this.run(async () => {
      const db = await this.db();
      const tx = db.transaction(['records', 'chunks', 'keys'], 'readwrite');
      await Promise.all([
        tx.objectStore('records').clear(),
        tx.objectStore('chunks').clear(),
        tx.objectStore('keys').clear(),
      ]);
      await tx.done;
    });
  }

  keep(id: string, kept: boolean, retentionDays: number): Promise<void> {
    return this.run(async () => {
      if (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 3650)
        throw new Error('Invalid retention period.');
      const db = await this.db();
      const key = await archiveKey(db);
      await this.expire(db, key, Date.now());
      const row = await db.get('records', id);
      if (!row) throw new Error('This record is no longer available.');
      const record = await readRecord(key, row);
      record.kept = kept;
      record.expiresAt =
        kept || retentionDays === 0 ? null : record.capturedAt + retentionDays * DAY;
      if (record.expiresAt !== null && record.expiresAt <= Date.now()) {
        await this.remove(db, [id]);
        return;
      }
      await db.put('records', {
        ...row,
        kept,
        expiresAt: record.expiresAt,
        metadata: await encryptRecord(key, record, row.generation),
      });
    });
  }

  cleanup(now = Date.now()): Promise<void> {
    return this.run(async () => {
      if (!validCount(now)) throw new Error('Invalid cleanup time.');
      const db = await this.db();
      await this.expire(db, await archiveKey(db), now);
    });
  }

  cancelPending(site?: string): Promise<void> {
    return this.run(async () => {
      const db = await this.db();
      const key = await archiveKey(db);
      for (const row of await db.getAll('records')) {
        if (row.status !== 'saving') continue;
        const record = await readRecord(key, row);
        if (site === undefined || record.site === site)
          await this.markFailed(
            db,
            key,
            row,
            'Saving was cancelled because recording was paused or disabled.',
          );
      }
    });
  }

  recover(): Promise<void> {
    return this.run(async () => {
      const db = await this.db();
      const key = await archiveKey(db);
      await this.expire(db, key, Date.now());
      for (const row of await db.getAll('records')) {
        if (row.status === 'saving')
          await this.markFailed(
            db,
            key,
            row,
            'Saving was interrupted. Select the file again to save a new copy.',
          );
      }
      const ids = new Set(await db.getAllKeys('records'));
      const tx = db.transaction('chunks', 'readwrite');
      for (const chunkKey of await tx.store.getAllKeys())
        if (!ids.has(chunkKey[0])) await tx.store.delete(chunkKey);
      await tx.done;
    });
  }

  usage(): Promise<ArchiveUsage> {
    return this.run(async () => {
      const db = await this.db();
      const key = await archiveKey(db);
      await this.expire(db, key, Date.now());
      return this.summarize(await db.getAll('records'));
    });
  }

  close(): Promise<void> {
    return this.run(async () => {
      if (this.database) (await this.database).close();
      this.database = undefined;
    });
  }
}
