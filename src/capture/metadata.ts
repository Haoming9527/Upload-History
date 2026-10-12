import type { CaptureMetadata, CaptureMethod, Settings } from '../shared/types';

function boundedText(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum);
}

export function captureMetadata(
  file: File,
  method: CaptureMethod,
  title: string,
  url: string,
): CaptureMetadata | null {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || typeof file.name !== 'string')
    return null;
  return {
    name: boundedText(file.name, 512) || 'unnamed-file',
    size: file.size,
    mime: boundedText(file.type, 128),
    lastModified:
      Number.isSafeInteger(file.lastModified) && file.lastModified >= 0 ? file.lastModified : 0,
    pageTitle: boundedText(title, 256),
    pageUrl: url.slice(0, 4096),
    method,
  };
}

export function capturePolicyChanged(oldValue: unknown, newValue: unknown): boolean {
  if (!oldValue || !newValue || typeof oldValue !== 'object' || typeof newValue !== 'object')
    return true;
  const previous = oldValue as Partial<Settings>;
  const next = newValue as Partial<Settings>;
  return (
    previous.consented !== next.consented ||
    previous.paused !== next.paused ||
    previous.defaultMode !== next.defaultMode ||
    previous.maxFileMiB !== next.maxFileMiB ||
    JSON.stringify(previous.siteModes) !== JSON.stringify(next.siteModes)
  );
}
