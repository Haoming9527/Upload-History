import { type Confirmation, type Action } from '../lib/types';
import { useRef, useEffect } from 'react';
import { Icon } from './Icons';

export function ConfirmDialog({
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
