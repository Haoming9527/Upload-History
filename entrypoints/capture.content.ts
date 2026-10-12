import { defineContentScript } from 'wxt/utils/define-content-script';
import { request } from '../src/shared/messages';
import { captureMetadata, capturePolicyChanged } from '../src/capture/metadata';
import { CapturePipeline, type CaptureItem } from '../src/capture/pipeline';
import { ShadowRootDiscovery } from '../src/capture/shadow-roots';

const INITIALIZED = '__uploadHistoryCaptureV1';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  allFrames: true,
  matchOriginAsFallback: true,
  runAt: 'document_start',
  main(context) {
    const frame = globalThis as unknown as Record<string, unknown>;
    if (frame[INITIALIZED]) return;
    const pipeline = new CapturePipeline({ send: request });
    const events = new WeakSet<Event>();
    const interactions = new WeakSet<Event>();
    const listenedRoots = new Set<Document | ShadowRoot>();
    let discovery: ShadowRootDiscovery;

    const capture = (event: Event) => {
      if (!event.isTrusted || events.has(event)) return;
      discovery.inspectEventPath(event);
      let files: File[] = [];
      const method = event.type === 'drop' ? 'drop' : 'input';
      if (method === 'drop') {
        const list = (event as DragEvent).dataTransfer?.files;
        if (list) files = Array.from(list);
      } else {
        const input = event
          .composedPath()
          .find((node) => node instanceof HTMLInputElement && node.type === 'file');
        if (input instanceof HTMLInputElement && input.files) files = Array.from(input.files);
      }
      if (!files.length) return;
      events.add(event);
      // Snapshot File references while DataTransfer/FileList is accessible, without reading any bytes.
      const items: CaptureItem[] = [];
      for (const file of files) {
        if (!(file instanceof File)) continue;
        const metadata = captureMetadata(file, method, document.title, location.href);
        if (metadata) items.push({ file, metadata });
      }
      pipeline.enqueue(items);
    };

    const discoverOnInteraction = (event: Event) => {
      if (event.isTrusted && !interactions.has(event)) {
        interactions.add(event);
        discovery.inspectEventPath(event, true);
      }
    };
    const listen = (root: Document | ShadowRoot) => {
      if (listenedRoots.has(root)) return;
      listenedRoots.add(root);
      root.addEventListener('change', capture, { capture: true, passive: true });
      root.addEventListener('drop', capture, { capture: true, passive: true });
      root.addEventListener('pointerdown', discoverOnInteraction, { capture: true, passive: true });
      root.addEventListener('focusin', discoverOnInteraction, { capture: true, passive: true });
      root.addEventListener('keydown', discoverOnInteraction, { capture: true, passive: true });
    };
    const settingsChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      const settings = changes.settings;
      if (
        area === 'local' &&
        settings &&
        capturePolicyChanged(settings.oldValue, settings.newValue)
      )
        pipeline.policyChanged();
    };
    const policyMessage = (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (
        sender.id === chrome.runtime.id &&
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'capture:policy-changed'
      )
        pipeline.policyChanged();
    };
    const cleanup = () => {
      pipeline.dispose();
      discovery.dispose();
      chrome.storage.onChanged.removeListener(settingsChanged);
      chrome.runtime.onMessage.removeListener(policyMessage);
      for (const root of listenedRoots) {
        root.removeEventListener('change', capture, true);
        root.removeEventListener('drop', capture, true);
        root.removeEventListener('pointerdown', discoverOnInteraction, true);
        root.removeEventListener('focusin', discoverOnInteraction, true);
        root.removeEventListener('keydown', discoverOnInteraction, true);
      }
      listenedRoots.clear();
      if (frame[INITIALIZED] === cleanup) delete frame[INITIALIZED];
    };
    frame[INITIALIZED] = cleanup;
    discovery = new ShadowRootDiscovery(document, listen);
    listen(document);
    chrome.storage.onChanged.addListener(settingsChanged);
    chrome.runtime.onMessage.addListener(policyMessage);
    context.onInvalidated(cleanup);
  },
});
