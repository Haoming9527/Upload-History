import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { request, fromBase64 } from '../shared/messages';
import { HOST_PATTERNS, MIB } from '../shared/types';
import type {
  AppState,
  ArchiveRecord,
  DownloadTicket,
  RecordingMode,
  Settings,
} from '../shared/types';
import { Brand, Icon } from './icons';
import './styles.css';

type View = 'popup' | 'history' | 'options';
type Action = (work: () => Promise<unknown>, success?: string) => Promise<boolean>;
const modes: Record<RecordingMode, string> = {
  copies: 'Save copies',
  logs: 'Log filenames only',
  disabled: 'Off on this site',
};
const statusLabels = {
  saved: 'Copy saved',
  saving: 'Saving copy',
  logs: 'Log only',
  failed: 'Copy not saved',
};
const pageUrl = (view: 'history' | 'options' | 'privacy') => chrome.runtime.getURL(`${view}.html`);
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'This action could not be completed. Try again.';

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < MIB) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KiB`;
  return `${(value / MIB).toFixed(value < 10 * MIB ? 1 : 0)} MiB`;
}

function displaySite(site: string) {
  try {
    return new URL(site).hostname;
  } catch {
    return site;
  }
}

function dateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  );
}

function shortDate(value: number) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function Status({ record }: { record: ArchiveRecord }) {
  return (
    <span className={`status status-${record.status}`}>
      <span aria-hidden="true" />
      {statusLabels[record.status]}
    </span>
  );
}

function FileGlyph({ name, large = false }: { name: string; large?: boolean }) {
  const extension = name.includes('.') ? name.split('.').pop()?.slice(0, 5) : '';
  return (
    <span className={`file-glyph ${large ? 'file-glyph-large' : ''}`} aria-hidden="true">
      <Icon name="file" size={large ? 36 : 25} />
      {extension && <span>{extension}</span>}
    </span>
  );
}

function useArchive(popup: boolean) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const tabId = useRef<number | undefined>(undefined);
  const live = useRef(true);
  const refresh = useCallback(async () => {
    const next = await request<AppState>({
      type: 'ui:state',
      ...(tabId.current === undefined ? {} : { tabId: tabId.current }),
    });
    if (live.current) setState(next);
  }, []);
  useEffect(() => {
    live.current = true;
    const update = () => {
      void refresh().catch((error) => {
        if (live.current) setError(errorText(error));
      });
    };
    const start = async () => {
      if (popup) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId.current = tab?.id;
      }
      await refresh();
    };
    void start().catch((error) => {
      if (live.current) setError(errorText(error));
    });
    window.addEventListener('focus', update);
    chrome.storage.onChanged.addListener(update);
    chrome.permissions.onAdded.addListener(update);
    chrome.permissions.onRemoved.addListener(update);
    const interval = window.setInterval(update, 5000);
    return () => {
      live.current = false;
      window.removeEventListener('focus', update);
      chrome.storage.onChanged.removeListener(update);
      chrome.permissions.onAdded.removeListener(update);
      chrome.permissions.onRemoved.removeListener(update);
      window.clearInterval(interval);
    };
  }, [popup, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const action: Action = useCallback(
    async (work, success) => {
      setBusy(true);
      setError('');
      setNotice('');
      try {
        await work();
        await refresh();
        if (success) setNotice(success);
        return true;
      } catch (error) {
        setError(errorText(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  return { state, error, setError, notice, busy, action, refresh };
}

async function downloadRecord(id: string) {
  const ticket = await request<DownloadTicket>({ type: 'ui:download', id });
  try {
    const bytes = new Uint8Array(ticket.size);
    let offset = 0;
    for (let index = 0; index < ticket.chunks; index++) {
      const chunk = await request<{ data: string }>({
        type: 'ui:download-chunk',
        ticket: ticket.ticket,
        index,
      });
      const decoded = fromBase64(chunk.data);
      if (offset + decoded.byteLength > bytes.byteLength)
        throw new Error('The saved copy could not be read completely. Try again.');
      bytes.set(decoded, offset);
      offset += decoded.byteLength;
    }
    if (offset !== ticket.size)
      throw new Error('The saved copy could not be read completely. Try again.');
    const url = URL.createObjectURL(
      new Blob([bytes.buffer], { type: ticket.mime || 'application/octet-stream' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = ticket.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally {
    await request({ type: 'ui:download-end', ticket: ticket.ticket });
  }
}

function Feedback({
  error,
  notice,
  dismiss,
}: {
  error: string;
  notice: string;
  dismiss: () => void;
}) {
  return (
    <>
      {error && (
        <div className="feedback feedback-error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
          <button className="icon-button" onClick={dismiss} aria-label="Dismiss error">
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="feedback feedback-success" role="status">
          <Icon name="check" />
          <span>{notice}</span>
        </div>
      )}
    </>
  );
}

function CaptureWarning({
  message,
  dismiss,
  busy,
}: {
  message?: string;
  dismiss: () => void;
  busy: boolean;
}) {
  if (!message) return null;
  return (
    <div className="feedback feedback-warning" role="status">
      <Icon name="alert" />
      <span>{message}</span>
      <button
        className="icon-button"
        onClick={dismiss}
        disabled={busy}
        aria-label="Dismiss capture warning"
      >
        <Icon name="close" size={17} />
      </button>
    </div>
  );
}

function Onboarding({
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

function AccessNotice({ action, busy }: { action: Action; busy: boolean }) {
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

function StorageMeter({ state, compact = false }: { state: AppState; compact?: boolean }) {
  const total = state.settings.budgetMiB * MIB;
  const used = state.usage.usedBytes;
  const reserved = state.usage.reservedBytes;
  const percent = Math.min(100, ((used + reserved) / total) * 100);
  return (
    <div className={`storage-meter ${compact ? 'storage-compact' : ''}`}>
      <div className="storage-heading">
        <span>Local storage</span>
        <span>
          {formatBytes(used)} <span className="subtle">/ {state.settings.budgetMiB} MiB</span>
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label="Archive storage"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(used + reserved, total)}
        aria-valuetext={`${formatBytes(used)} used, ${formatBytes(reserved)} reserved`}
      >
        <span
          className={percent > 85 ? 'meter-fill meter-warning' : 'meter-fill'}
          style={{ width: `${percent}%` }}
        />
      </div>
      {reserved > 0 && <small>{formatBytes(reserved)} reserved for files being saved</small>}
      {!compact && <p>Stored on this device only.</p>}
    </div>
  );
}

function Popup({ state, action, busy }: { state: AppState; action: Action; busy: boolean }) {
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

type Confirmation = {
  title: string;
  description: string;
  label: string;
  perform: () => Promise<unknown>;
  success: string;
};

function ConfirmDialog({
  confirmation,
  close,
  action,
  busy,
  error,
}: {
  confirmation: Confirmation | null;
  close: () => void;
  action: Action;
  busy: boolean;
  error: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="confirm-title"
    >
      <div className="dialog-icon">
        <Icon name="trash" size={24} />
      </div>
      <h2 id="confirm-title">{confirmation?.title}</h2>
      <p>{confirmation?.description}</p>
      {error && (
        <div className="feedback feedback-error dialog-error" role="alert">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button className="button" onClick={close} disabled={busy} autoFocus>
          Cancel
        </button>
        <button
          className="button button-danger"
          disabled={busy}
          onClick={() => {
            if (confirmation)
              void action(confirmation.perform, confirmation.success).then((ok) => {
                if (ok) close();
              });
          }}
        >
          {busy ? 'Deleting…' : confirmation?.label}
        </button>
      </div>
    </dialog>
  );
}

function Detail({
  record,
  close,
  action,
  busy,
  remove,
}: {
  record: ArchiveRecord;
  close: () => void;
  action: Action;
  busy: boolean;
  remove: () => void;
}) {
  return (
    <aside className="detail-panel" aria-label={`Details for ${record.name}`}>
      <div className="detail-top">
        <span>Attachment details</span>
        <button className="icon-button" onClick={close} aria-label="Close details">
          <Icon name="close" />
        </button>
      </div>
      <FileGlyph name={record.name} large />
      <h2>{record.name}</h2>
      <Status record={record} />
      <div className="detail-actions">
        {record.status === 'saved' && (
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void action(() => downloadRecord(record.id))}
          >
            <Icon name="download" size={17} />
            Download copy
          </button>
        )}
        <button
          className={`button ${record.kept ? 'button-kept' : ''}`}
          disabled={busy}
          aria-pressed={record.kept}
          onClick={() =>
            void action(() => request({ type: 'ui:keep', id: record.id, kept: !record.kept }))
          }
        >
          <Icon name="pin" size={17} />
          {record.kept ? 'Kept' : 'Keep'}
        </button>
      </div>
      {record.status === 'failed' && (
        <div className="detail-warning">
          <Icon name="alert" size={18} />
          <p>
            {record.failure || 'The copy could not be saved. The file details are still recorded.'}
          </p>
        </div>
      )}
      {record.status === 'saving' && (
        <p className="detail-note">
          This file is being saved. It will be available to download when the copy is complete.
        </p>
      )}
      {record.status === 'logs' && (
        <p className="detail-note">
          Only the attachment details were recorded. There is no saved file to download.
        </p>
      )}
      <dl className="detail-list">
        <div>
          <dt>Website</dt>
          <dd>{displaySite(record.site)}</dd>
        </div>
        <div>
          <dt>Page</dt>
          <dd>
            {record.pageTitle || 'Untitled page'}
            <a className="detail-url" href={record.pageUrl} target="_blank" rel="noreferrer">
              {record.pageUrl}
              <Icon name="external" size={13} />
            </a>
          </dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>{dateTime(record.capturedAt)}</dd>
        </div>
        <div>
          <dt>File size</dt>
          <dd>{formatBytes(record.size)}</dd>
        </div>
        <div>
          <dt>Added by</dt>
          <dd>
            {record.method === 'drop'
              ? 'Dragging a file onto the page'
              : 'Choosing a file on the page'}
          </dd>
        </div>
        <div>
          <dt>File modified</dt>
          <dd>{record.lastModified ? dateTime(record.lastModified) : 'Not available'}</dd>
        </div>
        <div>
          <dt>Removal</dt>
          <dd>
            {record.kept
              ? 'Kept until you delete it'
              : record.expiresAt
                ? dateTime(record.expiresAt)
                : 'Until you delete it'}
          </dd>
        </div>
        {record.mime && (
          <div>
            <dt>File type</dt>
            <dd>{record.mime}</dd>
          </div>
        )}
      </dl>
      <button className="button button-text-danger" onClick={remove} disabled={busy}>
        <Icon name="trash" size={16} />
        Delete this record
      </button>
    </aside>
  );
}

function History({
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
  const [query, setQuery] = useState('');
  const [site, setSite] = useState('all');
  const [status, setStatus] = useState('all');
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState(() => {
    try {
      return decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return '';
    }
  });
  const sites = useMemo(
    () => [...new Set(state.records.map((record) => record.site))].sort(),
    [state.records],
  );
  const filtered = useMemo(
    () =>
      state.records.filter((record) => {
        const text = `${record.name} ${record.site} ${record.pageTitle}`.toLocaleLowerCase();
        const threshold =
          period !== 'all' && period !== 'custom' ? Date.now() - Number(period) * 86_400_000 : 0;
        const from =
          period === 'custom' && fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : threshold;
        const to =
          period === 'custom' && toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Infinity;
        return (
          text.includes(query.toLocaleLowerCase()) &&
          (site === 'all' || record.site === site) &&
          (status === 'all' || record.status === status || (status === 'kept' && record.kept)) &&
          record.capturedAt >= from &&
          record.capturedAt <= to
        );
      }),
    [state.records, query, site, status, period, fromDate, toDate],
  );
  const detail = state.records.find((record) => record.id === detailId);
  const selection = [...selected].filter((id) => state.records.some((record) => record.id === id));
  const allSelected = filtered.length > 0 && filtered.every((record) => selected.has(record.id));
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        !allSelected && filtered.some((record) => selected.has(record.id));
  }, [filtered, selected, allSelected]);
  useEffect(() => {
    const update = () => {
      try {
        setDetailId(decodeURIComponent(window.location.hash.slice(1)));
      } catch {
        setDetailId('');
      }
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const deleteRecords = (ids: string[]) =>
    confirm({
      title: ids.length === 1 ? 'Delete this record?' : `Delete ${ids.length} records?`,
      description:
        'The selected history and any saved copies will be permanently removed. Your original files and website submissions are unaffected.',
      label: ids.length === 1 ? 'Delete record' : 'Delete records',
      perform: async () => {
        await request({ type: 'ui:delete', ids });
        setSelected(new Set());
        if (ids.includes(detailId)) setDetailId('');
      },
      success: ids.length === 1 ? 'Record deleted.' : `${ids.length} records deleted.`,
    });
  const hasFilters = Boolean(query || site !== 'all' || status !== 'all' || period !== 'all');
  return (
    <div className={`history-layout ${detail ? 'has-details' : ''}`}>
      <div className="history-main">
        <header className="page-heading">
          <div>
            <h1>
              Your upload history<span className="heading-dot">.</span>
            </h1>
            <p>The files you attached, with a little context.</p>
          </div>
          <span className="record-total">
            {state.usage.records} {state.usage.records === 1 ? 'record' : 'records'}
          </span>
        </header>
        <div className="history-toolbar">
          <label className="search-field">
            <Icon name="search" size={19} />
            <span className="sr-only">Search filenames, websites, or page titles</span>
            <input
              type="search"
              placeholder="Find a file, website, or page…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="filters">
            <label>
              <span className="sr-only">Filter by website</span>
              <select value={site} onChange={(event) => setSite(event.target.value)}>
                <option value="all">All websites</option>
                {sites.map((value) => (
                  <option key={value} value={value}>
                    {displaySite(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="saved">Copy saved</option>
                <option value="saving">Saving copy</option>
                <option value="logs">Log only</option>
                <option value="failed">Copy not saved</option>
                <option value="kept">Kept records</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by date</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                <option value="all">Any time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="custom">Choose dates</option>
              </select>
            </label>
          </div>
        </div>
        {period === 'custom' && (
          <div className="date-range">
            <label>
              From
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
          </div>
        )}
        {selection.length > 0 && (
          <div className="selection-bar">
            <span>{selection.length} selected</span>
            <button className="button button-small" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
            <button
              className="button button-small button-text-danger"
              disabled={busy}
              onClick={() => deleteRecords(selection)}
            >
              <Icon name="trash" size={15} />
              Delete selected
            </button>
          </div>
        )}
        {state.records.length === 0 ? (
          <div className="history-empty">
            <div className="empty-documents">
              <FileGlyph name="" large />
              <span className="empty-plus">+</span>
            </div>
            <h2>Make your next file easier to find.</h2>
            <p>
              Attach a file on a website and it will appear here. Your history helps you remember
              what you selected, where, and when.
            </p>
            <div className="empty-instruction">
              <span className="recording-dot" />{' '}
              {state.settings.paused
                ? 'Resume recording to start your history.'
                : 'Recording starts on enabled websites.'}
            </div>
            <p className="subtle">Reload website tabs that were open before you enabled access.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="history-empty">
            <Icon name="search" size={36} />
            <h2>No matching attachments.</h2>
            <p>Try another filename, website, or date.</p>
            <button
              className="button"
              onClick={() => {
                setQuery('');
                setSite('all');
                setStatus('all');
                setPeriod('all');
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="ledger-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="select-cell">
                    <input
                      type="checkbox"
                      ref={selectAll}
                      aria-label="Select all visible records"
                      checked={allSelected}
                      onChange={() =>
                        setSelected((previous) => {
                          const next = new Set(previous);
                          filtered.forEach((record) =>
                            allSelected ? next.delete(record.id) : next.add(record.id),
                          );
                          return next;
                        })
                      }
                    />
                  </th>
                  <th>File</th>
                  <th className="site-cell">Website</th>
                  <th>Status</th>
                  <th className="time-cell">Recorded</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr
                    key={record.id}
                    className={`${detailId === record.id ? 'is-open ' : ''}${selected.has(record.id) ? 'is-selected' : ''}`}
                  >
                    <td className="select-cell">
                      <input
                        type="checkbox"
                        checked={selected.has(record.id)}
                        aria-label={`Select ${record.name}`}
                        onChange={() =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (next.has(record.id)) next.delete(record.id);
                            else next.add(record.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="file-cell-button"
                        onClick={() => setDetailId(record.id)}
                        aria-label={`View details for ${record.name}`}
                      >
                        <FileGlyph name={record.name} />
                        <span className="file-cell-text">
                          <strong title={record.name}>{record.name}</strong>
                          <span>
                            {formatBytes(record.size)}
                            {record.kept && (
                              <span className="kept-label">
                                <Icon name="pin" size={11} />
                                Kept
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="site-cell">
                      <span title={record.site}>{displaySite(record.site)}</span>
                      <small title={record.pageTitle}>{record.pageTitle || 'Untitled page'}</small>
                    </td>
                    <td>
                      <Status record={record} />
                    </td>
                    <td className="time-cell">
                      <time
                        dateTime={new Date(record.capturedAt).toISOString()}
                        title={dateTime(record.capturedAt)}
                      >
                        {shortDate(record.capturedAt)}
                      </time>
                    </td>
                    <td className="row-actions">
                      {record.status === 'saved' ? (
                        <button
                          className="icon-button"
                          aria-label={`Download ${record.name}`}
                          title="Download copy"
                          disabled={busy}
                          onClick={() => void action(() => downloadRecord(record.id))}
                        >
                          <Icon name="download" size={18} />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          aria-label={`View details for ${record.name}`}
                          title="View details"
                          onClick={() => setDetailId(record.id)}
                        >
                          <Icon name="arrow" size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="ledger-footer">
          <span>
            {hasFilters
              ? `${filtered.length} of ${state.records.length} records`
              : 'Your files. Your device.'}
          </span>
        </footer>
      </div>
      {detail && (
        <Detail
          record={detail}
          close={() => setDetailId('')}
          action={action}
          busy={busy}
          remove={() => deleteRecords([detail.id])}
        />
      )}
    </div>
  );
}

function SettingsPage({
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
              <p>Larger files keep a record, but no saved copy.</p>
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
              <p>When full, new files are logged without a copy.</p>
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
            Copies up to 50 MiB are supported. Keep a separate backup of important files; this
            archive is removed if you uninstall the extension or clear the Chrome profile.
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
