import { type ArchiveRecord, type AppState, MIB } from '../../shared/types';
import { statusLabels, formatBytes } from '../lib/format';
import { Icon } from './Icons';

export function Status({ record }: { record: ArchiveRecord }) {
  return (
    <span className={`status status-${record.status}`}>
      <span aria-hidden="true" />
      {statusLabels[record.status]}
    </span>
  );
}

export function FileGlyph({ name, large = false }: { name: string; large?: boolean }) {
  const extension = name.includes('.') ? name.split('.').pop()?.slice(0, 5) : '';
  return (
    <span className={`file-glyph ${large ? 'file-glyph-large' : ''}`} aria-hidden="true">
      <Icon name="file" size={large ? 36 : 25} />
      {extension && <span>{extension}</span>}
    </span>
  );
}

export function StorageMeter({ state, compact = false }: { state: AppState; compact?: boolean }) {
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
