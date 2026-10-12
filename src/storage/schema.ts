import type { DBSchema } from 'idb';
import type { ArchiveRecord } from '../shared/types';

export interface Cipher {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

export interface StoredRecord {
  id: string;
  generation: string;
  metadata: Cipher;
  status: ArchiveRecord['status'];
  size: number;
  expiresAt: number | null;
  kept: boolean;
  nextChunk: number;
  receivedBytes: number;
  chargedBytes: number;
  reservedBytes: number;
}

export interface StoredChunk extends Cipher {
  id: string;
  index: number;
  size: number;
}

export interface ArchiveDB extends DBSchema {
  keys: { key: string; value: CryptoKey };
  records: { key: string; value: StoredRecord };
  chunks: { key: [string, number]; value: StoredChunk; indexes: { 'by-record': string } };
}
