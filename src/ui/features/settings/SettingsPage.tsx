import { type AppState, type RecordingMode } from '../../../shared/types';
import { type Action, type Confirmation } from '../../lib/types';
import { useState, useEffect, type FormEvent } from 'react';
import { request } from '../../../shared/messages';
import { Icon } from '../../components/Icons';
import { StorageMeter } from '../../components/RecordPresentation';
import { modes, pageUrl } from '../../lib/format';

export function SettingsPage({
  state,
  action,
  busy,
  confirm,
}: {
  state: AppState;
  action: Action;
  busy: boolean;
  confirm: (value: Confirmation) => void;
}) {
  const storageSettings = {
    retentionDays: state.settings.retentionDays,
    maxFileMiB: state.settings.maxFileMiB,
    budgetMiB: state.settings.budgetMiB,
  };
  const [draft, setDraft] = useState(storageSettings);
  const [retention, setRetention] = useState(
    [0, 7, 30, 90].includes(state.settings.retentionDays)
      ? String(state.settings.retentionDays)
      : 'custom',
  );
  const [siteToAdd, setSiteToAdd] = useState('');
  const [siteModeToAdd, setSiteModeToAdd] = useState<RecordingMode>('disabled');
  const fingerprint = JSON.stringify([
    state.settings.retentionDays,
    state.settings.maxFileMiB,
    state.settings.budgetMiB,
  ]);
  useEffect(() => {
    setDraft(storageSettings);
    setRetention(
      [0, 7, 30, 90].includes(state.settings.retentionDays)
        ? String(state.settings.retentionDays)
        : 'custom',
    );
  }, [fingerprint]);
  const save = (event: FormEvent) => {
    event.preventDefault();
    void action(
      () =>
        request({
          type: 'ui:settings',
          patch: {
            retentionDays: draft.retentionDays,
            maxFileMiB: draft.maxFileMiB,
            budgetMiB: draft.budgetMiB,
          },
        }),
      'Settings saved.',
    );
  };
  const clear = () =>
    confirm({
      title: 'Clear your entire history?',
      description:
        'All records and saved file copies, including kept records, will be permanently deleted. Your original files and website submissions are unaffected. Recording settings will stay the same.',
      label: 'Clear all history',
      perform: () => request({ type: 'ui:clear' }),
      success: 'All history and saved copies deleted.',
    });
  const addSite = (event: FormEvent) => {
    event.preventDefault();
    void action(async () => {
      const value = siteToAdd.trim();
      let url: URL;
      try {
        url = new URL(value.includes('://') ? value : `https://${value}`);
      } catch {
        throw new Error('Enter a website address, such as https://school.example.edu.');
      }
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        throw new Error('Enter an HTTP or HTTPS website address without sign-in details.');
      await request({
        type: 'ui:settings',
        patch: { siteModes: { ...state.settings.siteModes, [url.origin]: siteModeToAdd } },
      });
      setSiteToAdd('');
    }, 'Website setting saved.');
  };
  return (
    <div className="settings-page">
      <header className="page-heading">
        <div>
          <h1>
            Make it yours<span className="heading-dot">.</span>
          </h1>
          <p>A few controls for what you keep, and for how long.</p>
        </div>
      </header>
      <form onSubmit={save} className="settings-form">
        <section className="settings-section">
          <div className="settings-section-title">
            <Icon name="archive" />
            <h2>Recording</h2>
          </div>
          <div className="setting-line">
            <div>
              <label htmlFor="paused">Pause all recording</label>
              <p>Stop new captures. Existing history stays available.</p>
            </div>
            <input
              id="paused"
              className="switch"
              type="checkbox"
              role="switch"
              checked={state.settings.paused}
              disabled={busy}
              onChange={(event) => {
                const paused = event.target.checked;
                void action(
                  () => request({ type: 'ui:settings', patch: { paused } }),
                  'Recording preference saved.',
                );
              }}
            />
          </div>
          <div className="setting-line">
            <div>
              <label htmlFor="default-mode">Default for websites</label>
              <p>Applies unless you set a different mode for a website.</p>
            </div>
            <select
              id="default-mode"
              value={state.settings.defaultMode}
              disabled={busy}
              onChange={(event) => {
                const defaultMode = event.target.value as RecordingMode;
                void action(
                  () => request({ type: 'ui:settings', patch: { defaultMode } }),
                  'Recording preference saved.',
                );
              }}
            >
              <option value="copies">Save file copies</option>
              <option value="logs">Log filenames only</option>
              <option value="disabled">Recording off</option>
            </select>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <Icon name="settings" />
            <h2>Storage & retention</h2>
          </div>
          <StorageMeter state={state} />
          <div className="setting-line">
            <div>
              <label htmlFor="retention">Automatically remove records after</label>
              <p>Applies to new records. Kept records stay until you delete them.</p>
            </div>
            <div className="field-pair">
              <select
                id="retention"
                value={retention}
                onChange={(event) => {
                  setRetention(event.target.value);
                  if (event.target.value !== 'custom')
                    setDraft({ ...draft, retentionDays: Number(event.target.value) });
                  else if (!draft.retentionDays) setDraft({ ...draft, retentionDays: 90 });
                }}
              >
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="0">Until I delete them</option>
                <option value="custom">Custom days</option>
              </select>
              {retention === 'custom' && (
                <label className="number-field">
                  <span className="sr-only">Custom retention days</span>
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    required
                    value={draft.retentionDays}
                    onChange={(event) =>
                      setDraft({ ...draft, retentionDays: Number(event.target.value) })
                    }
                  />
                  <span>days</span>
                </label>
              )}
            </div>
          </div>
          <div className="setting-line">
            <div>
              <label htmlFor="file-limit">Maximum file size</label>
              <p>Applies to new copies. Larger files keep a record, but no saved copy.</p>
            </div>
            <label className="number-field">
              <input
                id="file-limit"
                type="number"
                required
                min="1"
                max="50"
                step="1"
                value={draft.maxFileMiB}
                onChange={(event) => setDraft({ ...draft, maxFileMiB: Number(event.target.value) })}
              />
              <span>MiB</span>
            </label>
          </div>
          <div className="setting-line">
            <div>
              <label htmlFor="budget">Storage budget</label>
              <p>
                When full, new files are logged without a copy. History details can exceed this
                budget.
              </p>
            </div>
            <label className="number-field">
              <input
                id="budget"
                type="number"
                required
                min="50"
                max="2000"
                step="1"
                value={draft.budgetMiB}
                onChange={(event) => setDraft({ ...draft, budgetMiB: Number(event.target.value) })}
              />
              <span>MiB</span>
            </label>
          </div>
          <p className="settings-help">
            Changing limits preserves existing copies and lets active copies finish. Copies up to 50
            MiB are supported. Keep a separate backup of important files; this archive is removed if
            you uninstall the extension or clear the Chrome profile.
          </p>
        </section>
        <div className="save-settings">
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
      <section className="settings-section site-settings">
        <div className="settings-section-title">
          <Icon name="external" />
          <h2>Website preferences</h2>
        </div>
        <p className="section-description">
          Use a different recording mode for any website. Each address applies to that exact site,
          including its HTTP or HTTPS scheme.
        </p>
        {Object.entries(state.settings.siteModes).length > 0 && (
          <div className="site-list">
            {Object.entries(state.settings.siteModes)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([origin, mode]) => (
                <div className="site-setting-row" key={origin}>
                  <span title={origin}>{origin}</span>
                  <select
                    aria-label={`Recording mode for ${origin}`}
                    value={mode}
                    disabled={busy}
                    onChange={(event) =>
                      void action(() =>
                        request({
                          type: 'ui:settings',
                          patch: {
                            siteModes: {
                              ...state.settings.siteModes,
                              [origin]: event.target.value as RecordingMode,
                            },
                          },
                        }),
                      )
                    }
                  >
                    {Object.entries(modes).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    aria-label={`Reset ${origin} to default`}
                    title="Use default setting"
                    disabled={busy}
                    onClick={() => {
                      const updated = { ...state.settings.siteModes };
                      delete updated[origin];
                      void action(
                        () => request({ type: 'ui:settings', patch: { siteModes: updated } }),
                        'Website reset to the default mode.',
                      );
                    }}
                  >
                    <Icon name="close" size={17} />
                  </button>
                </div>
              ))}
          </div>
        )}
        <form className="add-site" onSubmit={addSite}>
          <label>
            <span className="sr-only">Website address</span>
            <input
              required
              type="text"
              placeholder="https://school.example.edu"
              value={siteToAdd}
              onChange={(event) => setSiteToAdd(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Recording mode for new website</span>
            <select
              value={siteModeToAdd}
              onChange={(event) => setSiteModeToAdd(event.target.value as RecordingMode)}
            >
              {Object.entries(modes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit" disabled={busy}>
            Add website
          </button>
        </form>
      </section>
      <section className="settings-section privacy-section">
        <div className="settings-section-title">
          <Icon name="shield" />
          <h2>Your data stays here</h2>
        </div>
        <p>
          File copies and history are saved locally in this Chrome profile. There are no accounts,
          analytics, or uploads to us. Copies are encrypted with a key stored in the same profile;
          someone with access to your unlocked profile can view them.
        </p>
        <p>
          Deleting a record removes its saved copy too. Uninstalling removes this archive. Download
          important copies before uninstalling.
        </p>
        <a href={pageUrl('privacy')} target="_blank" rel="noreferrer">
          Read the privacy policy
          <Icon name="external" size={13} />
        </a>
      </section>
      <section className="danger-zone">
        <div>
          <h2>Start with a clean slate</h2>
          <p>Permanently delete all records and saved copies.</p>
        </div>
        <button
          className="button button-text-danger"
          type="button"
          disabled={busy || (state.records.length === 0 && !state.error)}
          onClick={clear}
        >
          <Icon name="trash" size={17} />
          Clear all history
        </button>
      </section>
    </div>
  );
}
