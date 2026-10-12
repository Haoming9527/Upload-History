import type { IDBPDatabase } from 'idb';
import type { ArchiveRecord } from '../shared/types';
import type { ArchiveDB, Cipher, StoredRecord } from './schema';

const MAX_METADATA_BYTES = 14 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function archiveKey(db: IDBPDatabase<ArchiveDB>): Promise<CryptoKey> {
  const existing = await db.get('keys', 'archive');
  if (existing) {
    if (
      existing.type !== 'secret' ||
      existing.extractable ||
      existing.algorithm.name !== 'AES-GCM'
    ) {
      throw new Error('The archive encryption key is invalid. Clear the archive to start again.');
    }
    return existing;
  }
  if ((await db.count('records')) || (await db.count('chunks'))) {
    throw new Error(
      'The archive encryption key is missing. Existing copies cannot be recovered. Clear the archive to start again.',
    );
  }
  const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const tx = db.transaction(['keys', 'records', 'chunks'], 'readwrite');
  const raced = await tx.objectStore('keys').get('archive');
  if (raced) {
    await tx.done;
    return raced;
  }
  if ((await tx.objectStore('records').count()) || (await tx.objectStore('chunks').count())) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error('The archive encryption key is missing. Clear the archive to start again.');
  }
  await tx.objectStore('keys').put(generated, 'archive');
  await tx.done;
  return generated;
}

export async function encrypt(
  key: CryptoKey,
  bytes: Uint8Array<ArrayBuffer>,
  context: string,
): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    key,
    bytes,
  );
  return { iv, data };
}

export async function decrypt(
  key: CryptoKey,
  cipher: Cipher,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: cipher.iv, additionalData: encoder.encode(context) },
        key,
        cipher.data,
      ),
    );
  } catch {
    throw new Error(
      'The saved archive data failed its integrity check. This copy cannot be recovered.',
    );
  }
}

export function encryptRecord(
  key: CryptoKey,
  record: ArchiveRecord,
  generation: string,
): Promise<Cipher> {
  const bytes = encoder.encode(JSON.stringify(record));
  if (bytes.length > MAX_METADATA_BYTES) throw new Error('File details exceed the metadata limit.');
  return encrypt(key, bytes, `upload-history:v1:record:${record.id}:${generation}`);
}

export async function readRecord(key: CryptoKey, row: StoredRecord): Promise<ArchiveRecord> {
  let record: ArchiveRecord;
  try {
    record = JSON.parse(
      decoder.decode(
        await decrypt(key, row.metadata, `upload-history:v1:record:${row.id}:${row.generation}`),
      ),
    ) as ArchiveRecord;
  } catch {
    throw new Error('The archive metadata failed its integrity check.');
  }
  if (
    record.id !== row.id ||
    record.size !== row.size ||
    record.status !== row.status ||
    record.expiresAt !== row.expiresAt ||
    record.kept !== row.kept
  ) {
    throw new Error('The archive metadata does not match its storage index.');
  }
  return record;
}
