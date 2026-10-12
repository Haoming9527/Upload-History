import { type View, type Confirmation } from './lib/types';
import { useArchive } from './data/archive-client';
import { useState, type ReactNode } from 'react';
import { Feedback, CaptureWarning } from './components/Feedback';
import { request } from '../shared/messages';
import { Brand, Icon } from './components/Icons';
import { errorText, pageUrl } from './lib/format';
import { Popup } from './features/popup/Popup';
import { Onboarding, AccessNotice } from './features/onboarding/Onboarding';
import { SettingsPage } from './features/settings/SettingsPage';
import { History } from './features/history/History';
import { StorageMeter } from './components/RecordPresentation';
import { ConfirmDialog } from './components/ConfirmDialog';
import './styles/index.css';

export function App({ view }: { view: View }) {
  const { state, error, setError, notice, busy, action, refresh } = useArchive(view === 'popup');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const feedback = (
    <>
      <Feedback error={error || state?.error || ''} notice={notice} dismiss={() => setError('')} />
      <CaptureWarning
        message={state?.captureWarning}
        busy={busy}
        dismiss={() => void action(() => request({ type: 'ui:dismiss-warning' }))}
      />
    </>
  );
  if (!state)
    return (
      <main className={view === 'popup' ? 'popup loading-shell' : 'loading-shell'}>
        <Brand />
        <div className="loading-message" role="status">
          {error ? 'Your archive could not be opened.' : 'Opening your history…'}
        </div>
        {error && (
          <>
            <Feedback error={error} notice="" dismiss={() => setError('')} />
            <button
              className="button"
              onClick={() => void refresh().catch((error) => setError(errorText(error)))}
            >
              Try again
            </button>
          </>
        )}
      </main>
    );
  if (view === 'popup')
    return (
      <main className="popup">
        {feedback}
        <Popup state={state} action={action} busy={busy} />
      </main>
    );
  const isOptions = view === 'options';
  let content: ReactNode;
  if (!state.settings.consented)
    content = (
      <div className="onboarding-page">
        <Onboarding action={action} busy={busy} />
      </div>
    );
  else
    content = isOptions ? (
      <SettingsPage
        state={state}
        action={action}
        busy={busy}
        confirm={(value) => {
          setError('');
          setConfirmation(value);
        }}
      />
    ) : (
      <History
        state={state}
        action={action}
        busy={busy}
        confirm={(value) => {
          setError('');
          setConfirmation(value);
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-link" href={pageUrl('history')} aria-label="Upload History home">
          <Brand />
        </a>
        <nav aria-label="Main navigation">
          <a
            href={pageUrl('history')}
            className={!isOptions ? 'nav-link active' : 'nav-link'}
            aria-current={!isOptions ? 'page' : undefined}
          >
            <Icon name="archive" />
            Your history<span>{state.usage.records}</span>
          </a>
          <a
            href={pageUrl('options')}
            className={isOptions ? 'nav-link active' : 'nav-link'}
            aria-current={isOptions ? 'page' : undefined}
          >
            <Icon name="settings" />
            Settings
          </a>
        </nav>
        <div className="sidebar-bottom">
          {state.settings.consented && (
            <>
              <div className="sidebar-recording">
                <span
                  className={`recording-dot ${state.settings.paused || !state.hasAccess ? 'inactive' : ''}`}
                />
                <span>
                  {state.settings.paused
                    ? 'Recording paused'
                    : !state.hasAccess
                      ? 'Access is limited'
                      : 'Recording enabled'}
                </span>
                <button
                  className="icon-button"
                  title={state.settings.paused ? 'Resume recording' : 'Pause recording'}
                  aria-label={state.settings.paused ? 'Resume recording' : 'Pause recording'}
                  disabled={busy}
                  onClick={() =>
                    void action(() =>
                      request({ type: 'ui:settings', patch: { paused: !state.settings.paused } }),
                    )
                  }
                >
                  <Icon name={state.settings.paused ? 'play' : 'pause'} size={15} />
                </button>
              </div>
              <StorageMeter state={state} />
            </>
          )}
          <a className="privacy-link" href={pageUrl('privacy')} target="_blank" rel="noreferrer">
            <Icon name="shield" size={15} />
            Private by design
          </a>
          <span className="version-note">
            Upload History · {chrome.runtime.getManifest().version}
          </span>
        </div>
      </aside>
      <main className="main-content">
        <div className="global-feedback">
          {feedback}
          {state.settings.consented && !state.hasAccess && (
            <AccessNotice action={action} busy={busy} />
          )}
        </div>
        {content}
      </main>
      <ConfirmDialog
        confirmation={confirmation}
        close={() => setConfirmation(null)}
        action={action}
        busy={busy}
        error={error}
      />
    </div>
  );
}
