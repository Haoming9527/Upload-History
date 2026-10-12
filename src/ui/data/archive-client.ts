import { useState, useRef, useCallback, useEffect } from 'react';
import { type AppState, type DownloadTicket } from '../../shared/types';
import { request, fromBase64 } from '../../shared/messages';
import { errorText } from '../lib/format';
import { type Action } from '../lib/types';

export function useArchive(popup: boolean) {
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

export async function downloadRecord(id: string) {
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
