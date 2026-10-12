import { type ArchiveRecord } from '../../../shared/types';
import { type Action } from '../../lib/types';
import { Icon } from '../../components/Icons';
import { FileGlyph, Status } from '../../components/RecordPresentation';
import { downloadRecord } from '../../data/archive-client';
import { request } from '../../../shared/messages';
import { displaySite, pageUrl, dateTime, formatBytes } from '../../lib/format';

export function Detail({
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
