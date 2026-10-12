import { Icon } from './Icons';

export function Feedback({
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

export function CaptureWarning({
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
