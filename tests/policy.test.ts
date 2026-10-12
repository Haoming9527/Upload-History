import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import {
  captureMode,
  effectiveMode,
  sanitizeUrl,
  validateSettings,
  webOrigin,
} from '../src/shared/policy';

describe('recording policy', () => {
  it('does not record before consent or during pause', () => {
    expect(effectiveMode(DEFAULT_SETTINGS, 'https://school.test')).toBe('disabled');
    expect(
      effectiveMode({ ...DEFAULT_SETTINGS, consented: true, paused: true }, 'https://school.test'),
    ).toBe('disabled');
  });
  it('uses exact top-level origins for site exclusions', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      consented: true,
      siteModes: { 'https://school.test': 'disabled' as const },
    };
    expect(effectiveMode(settings, 'https://school.test')).toBe('disabled');
    expect(effectiveMode(settings, 'https://other.school.test')).toBe('copies');
  });
  it('discards credentials, query data, and fragments', () => {
    expect(sanitizeUrl('https://user:secret@school.test/assignment?token=private#student')).toBe(
      'https://school.test/assignment',
    );
    expect(webOrigin('chrome://settings')).toBeUndefined();
  });
  it('never bypasses a restrictive embedded-origin preference', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      consented: true,
      siteModes: { 'https://widget.test': 'logs' as const },
    };
    expect(captureMode(settings, 'https://school.test', 'https://widget.test')).toBe('logs');
    expect(
      captureMode(
        { ...settings, siteModes: { 'https://widget.test': 'disabled' } },
        'https://school.test',
        'https://widget.test',
      ),
    ).toBe('disabled');
    expect(
      captureMode(
        { ...settings, defaultMode: 'logs', siteModes: { 'https://school.test': 'copies' } },
        'https://school.test',
        'https://widget.test',
      ),
    ).toBe('copies');
  });
  it('rejects overbroad site rules and malformed storage settings', () => {
    expect(() => validateSettings({ siteModes: { '*': 'disabled' } })).toThrow();
    expect(() => validateSettings({ maxFileMiB: 51 })).toThrow();
    expect(() => validateSettings({ consented: 'yes' })).toThrow();
    expect(() => validateSettings({ siteModes: { 'https://school.test/path': 'logs' } })).toThrow();
  });
});
