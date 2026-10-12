import { type AppState } from '../../../shared/types';
import { type Action, type Confirmation } from '../../lib/types';
import { useState, useMemo, useRef, useEffect } from 'react';
import { request } from '../../../shared/messages';
import { Icon } from '../../components/Icons';
import { displaySite, formatBytes, dateTime, shortDate } from '../../lib/format';
import { FileGlyph, Status } from '../../components/RecordPresentation';
import { downloadRecord } from '../../data/archive-client';
import { Detail } from './Detail';

export function History({
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
