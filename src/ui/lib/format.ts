import { type RecordingMode, MIB } from '../../shared/types';

export const modes: Record<RecordingMode, string> = {
  copies: 'Save copies',
  logs: 'Log filenames only',
  disabled: 'Off on this site',
};

export const statusLabels = {
  saved: 'Copy saved',
  saving: 'Saving copy',
  logs: 'Log only',
  failed: 'Copy not saved',
};

export const pageUrl = (view: 'history' | 'options' | 'privacy') =>
  chrome.runtime.getURL(`${view}.html`);

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'This action could not be completed. Try again.';

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < MIB) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KiB`;
  return `${(value / MIB).toFixed(value < 10 * MIB ? 1 : 0)} MiB`;
}

export function displaySite(site: string) {
  try {
    return new URL(site).hostname;
  } catch {
    return site;
  }
}

export function dateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  );
}

export function shortDate(value: number) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
