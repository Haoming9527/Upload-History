export type RecordingMode = 'copies' | 'logs' | 'disabled';
export type CopyStatus = 'saving' | 'saved' | 'logs' | 'failed';
export type CaptureMethod = 'input' | 'drop';

export interface Settings {
  consented: boolean;
  paused: boolean;
  defaultMode: RecordingMode;
  siteModes: Record<string, RecordingMode>;
  retentionDays: number;
  maxFileMiB: number;
  budgetMiB: number;
}

export interface CaptureMetadata {
  name: string;
  size: number;
  mime: string;
  lastModified: number;
  pageTitle: string;
  pageUrl: string;
  method: CaptureMethod;
}

export interface ArchiveRecord extends CaptureMetadata {
  id: string;
  site: string;
  frameOrigin: string;
  capturedAt: number;
  expiresAt: number | null;
  kept: boolean;
  mode: Exclude<RecordingMode, 'disabled'>;
  status: CopyStatus;
  failure?: string;
  sha256?: string;
}

export interface ArchiveLimits {
  maxFileBytes: number;
  budgetBytes: number;
}
export interface ArchiveUsage {
  usedBytes: number;
  reservedBytes: number;
  records: number;
  saved: number;
}
export interface BeginResult {
  record: ArchiveRecord;
  token?: string;
}
export interface DownloadData {
  record: ArchiveRecord;
  bytes: Uint8Array;
}

export interface AppState {
  settings: Settings;
  records: ArchiveRecord[];
  usage: ArchiveUsage;
  hasAccess: boolean;
  currentSite?: string;
  currentMode?: RecordingMode;
  error?: string;
  captureWarning?: string;
}

export type Message =
  | { type: 'capture:policy' }
  | { type: 'capture:begin'; captureId: string; epoch: string; metadata: CaptureMetadata }
  | { type: 'capture:chunk'; id: string; token: string; index: number; data: string }
  | { type: 'capture:finish'; id: string; token: string }
  | { type: 'capture:fail'; id: string; token: string; reason: string }
  | {
      type: 'capture:skipped';
      count: number;
      reason: 'queue-full' | 'queue-expired';
      epoch: string;
    }
  | { type: 'ui:state'; tabId?: number }
  | { type: 'ui:settings'; patch: Partial<Settings> }
  | { type: 'ui:delete'; ids: string[] }
  | { type: 'ui:clear' }
  | { type: 'ui:dismiss-warning' }
  | { type: 'ui:keep'; id: string; kept: boolean }
  | { type: 'ui:download'; id: string }
  | { type: 'ui:download-chunk'; ticket: string; index: number }
  | { type: 'ui:download-end'; ticket: string };

export interface Reply<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
export interface CapturePolicy {
  mode: RecordingMode;
  maxFileBytes: number;
  epoch: string;
}
export interface DownloadTicket {
  ticket: string;
  name: string;
  mime: string;
  size: number;
  chunks: number;
}

export const MIB = 1024 * 1024;
export const CHUNK_BYTES = 256 * 1024;
export const HOST_PATTERNS = ['http://*/*', 'https://*/*'];
export const DEFAULT_SETTINGS: Settings = {
  consented: false,
  paused: false,
  defaultMode: 'copies',
  siteModes: {},
  retentionDays: 90,
  maxFileMiB: 50,
  budgetMiB: 500,
};
