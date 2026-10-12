import { type AppState, type RecordingMode } from '../../../shared/types';
import { type Action } from '../../lib/types';
import { Brand, Icon } from '../../components/Icons';
import { pageUrl, displaySite } from '../../lib/format';
import { Onboarding, AccessNotice } from '../onboarding/Onboarding';
import { request } from '../../../shared/messages';
import { FileGlyph, Status, StorageMeter } from '../../components/RecordPresentation';
import { downloadRecord } from '../../data/archive-client';

export function Popup({ state, action, busy }: { state: AppState; action: Action; busy: boolean }) {
  const recent = state.records.slice(0, 3);
  const currentMode = state.currentSite
    ? (state.settings.siteModes[state.currentSite] ?? state.settings.defaultMode)
    : state.settings.defaultMode;
  return (
    <>
      <header className="popup-header">
        <Brand compact />
        <a
          className="icon-button"
          href={pageUrl('options')}
          target="_blank"
          rel="noreferrer"
          aria-label="Open settings"
          title="Settings"
        >
          <Icon name="settings" />
        </a>
      </header>
      {!state.settings.consented ? (
        <Onboarding action={action} busy={busy} compact />
      ) : (
        <>
          <section className="recording-panel">
            <div className="recording-heading">
              <span
                className={`recording-dot ${state.settings.paused || !state.hasAccess ? 'inactive' : ''}`}
              />
              <strong>
                {state.settings.paused
                  ? 'Recording paused'
                  : !state.hasAccess
                    ? 'Website access needed'
                    : 'Ready to remember'}
              </strong>
              <button
                className="icon-button"
                aria-label={state.settings.paused ? 'Resume recording' : 'Pause recording'}
                title={state.settings.paused ? 'Resume recording' : 'Pause recording'}
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    request({ type: 'ui:settings', patch: { paused: !state.settings.paused } }),
                  )
                }
              >
                <Icon name={state.settings.paused ? 'play' : 'pause'} size={17} />
              </button>
            </div>
            <p>
              {state.settings.paused
                ? 'Your saved history remains available.'
                : 'File selections are recorded on enabled websites.'}
            </p>
            {state.currentSite ? (
              <div className="current-site">
                <label htmlFor="current-site-mode">{displaySite(state.currentSite)}</label>
                <select
                  id="current-site-mode"
                  aria-label="Recording mode for current site"
                  value={currentMode}
                  disabled={busy}
                  onChange={(event) => {
                    const site = state.currentSite;
                    if (site)
                      void action(() =>
                        request({
                          type: 'ui:settings',
                          patch: {
                            siteModes: {
                              ...state.settings.siteModes,
                              [site]: event.target.value as RecordingMode,
                            },
                          },
                        }),
                      );
                  }}
                >
                  <option value="copies">Save copies</option>
                  <option value="logs">Log only</option>
                  <option value="disabled">Off on this site</option>
                </select>
              </div>
            ) : (
              <p className="subtle">Open a website to change its recording setting.</p>
            )}
            {state.currentSite && (
              <p className="site-rule-note">
                Embedded uploaders also follow their own site rules. Logs-only or off rules take
                priority.
              </p>
            )}
          </section>
          {!state.hasAccess && <AccessNotice action={action} busy={busy} />}
          <section className="popup-recents">
            <div className="section-heading">
              <h2>Recently attached</h2>
              <span className="count-label">{state.usage.records}</span>
            </div>
            {recent.length ? (
              <div>
                {recent.map((record) => (
                  <div className="recent-row" key={record.id}>
                    <FileGlyph name={record.name} />
                    <a
                      className="recent-main"
                      href={`${pageUrl('history')}#${encodeURIComponent(record.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong title={record.name}>{record.name}</strong>
                      <span>{displaySite(record.site)}</span>
                      <Status record={record} />
                    </a>
                    {record.status === 'saved' && (
                      <button
                        className="icon-button"
                        aria-label={`Download ${record.name}`}
                        title="Download copy"
                        disabled={busy}
                        onClick={() => void action(() => downloadRecord(record.id))}
                      >
                        <Icon name="download" size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="popup-empty">
                <Icon name="file" size={31} />
                <strong>Your next attachment starts here.</strong>
                <p>Choose a file on a website. Its history will appear here automatically.</p>
              </div>
            )}
          </section>
          <footer className="popup-footer">
            <StorageMeter state={state} compact />
            <a
              className="button button-primary button-wide"
              href={pageUrl('history')}
              target="_blank"
              rel="noreferrer"
            >
              Open your history
              <Icon name="arrow" size={18} />
            </a>
          </footer>
        </>
      )}
    </>
  );
}
