import {
  DEFAULT_SETTINGS,
  MIB,
  type RecordingMode,
  type Settings,
  type CaptureMetadata,
} from './types';

export function webOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function sanitizeUrl(value: string): string {
  const origin = webOrigin(value);
  if (!origin) return '';
  const url = new URL(value);
  return `${origin}${url.pathname}`.slice(0, 2048);
}

export function effectiveMode(settings: Settings, site: string): RecordingMode {
  if (!settings.consented || settings.paused || !webOrigin(site)) return 'disabled';
  return Object.hasOwn(settings.siteModes, site) ? settings.siteModes[site]! : settings.defaultMode;
}

export function captureMode(settings: Settings, site: string, frameOrigin: string): RecordingMode {
  const topMode = effectiveMode(settings, site);
  if (!Object.hasOwn(settings.siteModes, frameOrigin)) return topMode;
  const frameMode = settings.siteModes[frameOrigin];
  if (topMode === 'disabled' || frameMode === 'disabled') return 'disabled';
  if (topMode === 'logs' || frameMode === 'logs') return 'logs';
  return topMode;
}

const isMode = (value: unknown): value is RecordingMode =>
  value === 'copies' || value === 'logs' || value === 'disabled';
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export function validateSettings(value: unknown, current: Settings = DEFAULT_SETTINGS): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid settings.');
  const patch = value as Record<string, unknown>;
  const next = { ...current, siteModes: { ...current.siteModes } };
  for (const [key, item] of Object.entries(patch)) {
    if (key === 'consented' || key === 'paused') {
      if (typeof item !== 'boolean') throw new Error('Invalid recording setting.');
      next[key] = item;
    } else if (key === 'defaultMode') {
      if (!isMode(item)) throw new Error('Invalid recording mode.');
      next.defaultMode = item;
    } else if (key === 'retentionDays') {
      if (!integer(item, 0, 3650)) throw new Error('Retention must be 0 to 3650 days.');
      next.retentionDays = item;
    } else if (key === 'maxFileMiB') {
      if (!integer(item, 1, 50)) throw new Error('The tested file-size range is 1 to 50 MiB.');
      next.maxFileMiB = item;
    } else if (key === 'budgetMiB') {
      if (!integer(item, 50, 2000)) throw new Error('The archive budget must be 50 to 2000 MiB.');
      next.budgetMiB = item;
    } else if (key === 'siteModes') {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        Object.keys(item).length > 500
      )
        throw new Error('Invalid site settings.');
      const modes: Record<string, RecordingMode> = {};
      for (const [site, mode] of Object.entries(item)) {
        if (webOrigin(site) !== site || !isMode(mode))
          throw new Error('Site rules must use an exact http or https origin.');
        modes[site] = mode;
      }
      next.siteModes = modes;
    } else throw new Error('Unknown setting.');
  }
  return next;
}

export function validateMetadata(value: unknown): CaptureMetadata {
  if (!value || typeof value !== 'object') throw new Error('Invalid file metadata.');
  const m = value as Record<string, unknown>;
  if (
    typeof m.name !== 'string' ||
    !m.name ||
    m.name.length > 1024 ||
    !integer(m.size, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(m.lastModified, 0, Number.MAX_SAFE_INTEGER) ||
    typeof m.mime !== 'string' ||
    m.mime.length > 256 ||
    typeof m.pageTitle !== 'string' ||
    m.pageTitle.length > 1024 ||
    typeof m.pageUrl !== 'string' ||
    m.pageUrl.length > 8192 ||
    (m.method !== 'input' && m.method !== 'drop')
  )
    throw new Error('Invalid file metadata.');
  return m as unknown as CaptureMetadata;
}

export function limitsFor(settings: Settings) {
  return { maxFileBytes: settings.maxFileMiB * MIB, budgetBytes: settings.budgetMiB * MIB };
}

export function policyChanged(a: Settings, b: Settings) {
  return (
    a.consented !== b.consented ||
    a.paused !== b.paused ||
    a.defaultMode !== b.defaultMode ||
    JSON.stringify(a.siteModes) !== JSON.stringify(b.siteModes)
  );
}
