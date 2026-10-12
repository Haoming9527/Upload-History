import type { CSSProperties } from 'react';

export type IconName =
  | 'archive'
  | 'settings'
  | 'search'
  | 'download'
  | 'close'
  | 'file'
  | 'arrow'
  | 'shield'
  | 'pause'
  | 'play'
  | 'check'
  | 'trash'
  | 'pin'
  | 'external'
  | 'alert';
const paths: Record<IconName, React.ReactNode> = {
  archive: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M3 4h18v4H3zM9 12h6" />
    </>
  ),
  settings: (
    <>
      <path d="m9.5 3-.5 2a7.4 7.4 0 0 0-1.5.9l-2-.6-2.5 4.4 1.5 1.4a8 8 0 0 0 0 1.8L3 14.3l2.5 4.4 2-.6A7.4 7.4 0 0 0 9 19l.5 2h5l.5-2a7.4 7.4 0 0 0 1.5-.9l2 .6 2.5-4.4-1.5-1.4a8 8 0 0 0 0-1.8L21 9.7l-2.5-4.4-2 .6A7.4 7.4 0 0 0 15 5l-.5-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  play: <path d="m7 4 14 8-14 8z" />,
  check: <path d="m5 12 4 4L19 6" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
    </>
  ),
  pin: (
    <>
      <path d="m8 3 8 0-1 6 4 4v2H5v-2l4-4zM12 15v6" />
    </>
  ),
  external: (
    <>
      <path d="M14 3h7v7M21 3 11 13M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2zM12 9v5" />
      <path d="M12 17h.01" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg width="31" height="31" viewBox="0 0 32 32" fill="none">
          <path d="M7 8h15v19H7z" fill="currentColor" opacity=".22" />
          <path d="M11 4h11l5 5v15H11z" fill="currentColor" />
          <path d="M21 4v6h6M16 14h6M16 18h4" stroke="white" strokeWidth="1.5" />
        </svg>
      </span>
      <span>
        Upload<span className="brand-second">History</span>
      </span>
    </div>
  );
}
