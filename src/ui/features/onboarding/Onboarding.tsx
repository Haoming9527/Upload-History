import { type Action } from '../../lib/types';
import { useState } from 'react';
import { request } from '../../../shared/messages';
import { HOST_PATTERNS, type Settings } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { pageUrl } from '../../lib/format';

export function Onboarding({
  action,
  busy,
  compact = false,
}: {
  action: Action;
  busy: boolean;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<'copies' | 'logs'>('copies');
  const enable = () => {
    const grant = chrome.permissions.request({ origins: HOST_PATTERNS });
    void action(async () => {
      if (!(await grant))
        throw new Error(
          'Website access was not granted. Choose Enable Upload History again when you are ready.',
        );
      await request<Settings>({
        type: 'ui:settings',
        patch: { consented: true, defaultMode: mode, paused: false },
      });
      // Persistence is best effort and does not change the profile-loss warning.
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* Chrome may deny or not support this request. */
      }
    }, 'Upload History is ready. Reload open website tabs to start recording.');
  };
  return (
    <section className={`onboarding ${compact ? 'onboarding-compact' : ''}`}>
      <div className="onboarding-illustration" aria-hidden="true">
        <span className="paper-back" />
        <span className="paper-front">
          <Icon name="file" size={45} />
          <span className="paper-check">
            <Icon name="check" size={18} />
          </span>
        </span>
      </div>
      <h1>
        A little history.
        <br />A lot less searching.
      </h1>
      <p className="onboarding-intro">
        Remember the files you attach to websites, and find a saved copy when you need it.
      </p>
      <fieldset className="mode-choices">
        <legend>What would you like to remember?</legend>
        <label className={mode === 'copies' ? 'mode-choice chosen' : 'mode-choice'}>
          <input
            type="radio"
            name="onboarding-mode"
            value="copies"
            checked={mode === 'copies'}
            onChange={() => setMode('copies')}
          />
          <span>
            <strong>Files and their history</strong>
            <small>Save a local copy plus the filename, site, page title, and time.</small>
          </span>
          <Icon name="archive" />
        </label>
        <label className={mode === 'logs' ? 'mode-choice chosen' : 'mode-choice'}>
          <input
            type="radio"
            name="onboarding-mode"
            value="logs"
            checked={mode === 'logs'}
            onChange={() => setMode('logs')}
          />
          <span>
            <strong>Just the history</strong>
            <small>Remember file details and where you attached them. No file copies.</small>
          </span>
          <Icon name="file" />
        </label>
      </fieldset>
      <div className="privacy-explanation">
        <Icon name="shield" size={20} />
        <div>
          <strong>Saved in this Chrome profile</strong>
          <p>
            After you enable access, Upload History records file selections and drops on websites.
            Files and history stay on your device. There are no accounts, analytics, or uploads to
            us.
          </p>
          <p>
            Copies are encrypted with a key stored in this profile. Someone with access to your
            unlocked profile can view them. Uninstalling removes this archive.
          </p>
        </div>
      </div>
      <p className="subtle onboarding-limits">
        Cloud pickers and some upload controls may not be detected.
      </p>
      <button className="button button-primary button-wide" onClick={enable} disabled={busy}>
        Enable Upload History
        <Icon name="arrow" size={18} />
      </button>
      <p className="consent-note">
        This grants access to websites and starts recording automatically. You can pause or change
        any site later.{' '}
        <a href={pageUrl('privacy')} target="_blank" rel="noreferrer">
          Privacy policy
        </a>
      </p>
    </section>
  );
}

export function AccessNotice({ action, busy }: { action: Action; busy: boolean }) {
  const enable = () => {
    const permission = chrome.permissions.request({ origins: HOST_PATTERNS });
    void action(async () => {
      if (!(await permission))
        throw new Error(
          'Website access was not granted. Your existing history is still available.',
        );
    }, 'Website access enabled. Reload open tabs to start recording.');
  };
  return (
    <div className="access-notice">
      <Icon name="alert" />
      <div>
        <strong>Website access is off or limited</strong>
        <p>New attachments may not be recorded. Your saved history is still here.</p>
        <button className="button button-small" onClick={enable} disabled={busy}>
          Enable website access
        </button>
      </div>
    </div>
  );
}
