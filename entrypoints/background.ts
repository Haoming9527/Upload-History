import { defineBackground } from 'wxt/utils/define-background';
import { Archive } from '../src/storage/archive';
import {
  CHUNK_BYTES,
  DEFAULT_SETTINGS,
  HOST_PATTERNS,
  type AppState,
  type ArchiveRecord,
  type Message,
  type Settings,
} from '../src/shared/types';
import { fromBase64, toBase64 } from '../src/shared/messages';
import {
  captureMode,
  effectiveMode,
  limitsFor,
  policyChanged,
  sanitizeUrl,
  validateMetadata,
  validateSettings,
  webOrigin,
} from '../src/shared/policy';

export default defineBackground(() => {
  const archive = new Archive();
  let settings: Settings = { ...DEFAULT_SETTINGS, siteModes: {} };
  let initializationError: string | undefined;
  let captureWarning: string | undefined;
  let captureEpoch = crypto.randomUUID();
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const owners = new Map<
    string,
    {
      token: string;
      tabId: number;
      documentId?: string;
      frameId?: number;
      site: string;
      lastSeen: number;
    }
  >();
  const downloads = new Map<string, { bytes: Uint8Array; expires: number; owner: string }>();
  const rates = new Map<string, { count: number; since: number }>();
  const ready = initialize();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = mutationQueue.then(task, task);
    mutationQueue = next.catch(() => undefined);
    return next;
  }

  async function initialize() {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const stored = await chrome.storage.local.get('settings');
    const storedWarning = (await chrome.storage.session.get('captureWarning')).captureWarning;
    captureWarning = typeof storedWarning === 'string' ? storedWarning : undefined;
    try {
      settings = validateSettings(stored.settings ?? {});
    } catch {
      settings = { ...DEFAULT_SETTINGS, siteModes: {} };
    }
    try {
      await archive.recover();
      await archive.cleanup();
    } catch {
      initializationError =
        'The local archive could not be opened. Its encryption key or stored data may be unavailable. Existing data has not been replaced.';
    }
    await chrome.alarms.create('archive-cleanup', { periodInMinutes: 60 });
    // Waking the worker for a selection must not replace the listener holding that File.
    await syncCapture(false);
    await updateBadge();
  }

  async function syncCapture(injectExisting = true) {
    const access = await chrome.permissions.getAll();
    const matches = [
      ...new Set((access.origins ?? []).filter((pattern) => /^https?:\/\//.test(pattern))),
    ].sort();
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: ['upload-history-capture'],
    });
    if (!settings.consented || !matches.length) {
      if (existing.length)
        await chrome.scripting.unregisterContentScripts({ ids: ['upload-history-capture'] });
      return;
    }
    const desired: chrome.scripting.RegisteredContentScript = {
      id: 'upload-history-capture',
      js: ['content-scripts/capture.js'],
      matches,
      allFrames: true,
      runAt: 'document_start',
      persistAcrossSessions: true,
      matchOriginAsFallback: true,
      world: 'ISOLATED',
    };
    const normalized = (script: chrome.scripting.RegisteredContentScript) =>
      JSON.stringify({
        js: script.js ?? [],
        css: script.css ?? [],
        matches: [...(script.matches ?? [])].sort(),
        excludeMatches: [...(script.excludeMatches ?? [])].sort(),
        allFrames: script.allFrames ?? false,
        runAt: script.runAt ?? 'document_idle',
        persistAcrossSessions: script.persistAcrossSessions ?? true,
        matchOriginAsFallback: script.matchOriginAsFallback ?? false,
        world: script.world ?? 'ISOLATED',
      });
    if (!existing[0]) await chrome.scripting.registerContentScripts([desired]);
    else if (normalized(existing[0]) !== normalized(desired)) {
      // Update future-document registration in place, without a registration gap.
      await chrome.scripting.updateContentScripts([{ ...desired, css: [], excludeMatches: [] }]);
    }
    if (!injectExisting) return;
    // Existing tabs need listeners too; restricted and inaccessible frames are expected failures.
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(
      tabs
        .filter((tab) => tab.id && webOrigin(tab.url ?? ''))
        .map((tab) =>
          chrome.scripting.executeScript({
            target: { tabId: tab.id!, allFrames: true },
            files: ['content-scripts/capture.js'],
          }),
        ),
    );
  }

  async function hasGlobalAccess() {
    return chrome.permissions.contains({ origins: HOST_PATTERNS });
  }

  async function notifyPolicyChanged() {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(
      tabs
        .filter((tab) => tab.id)
        .map((tab) => chrome.tabs.sendMessage(tab.id!, { type: 'capture:policy-changed' })),
    );
  }

  async function warnAboutCapture(message: string) {
    captureWarning = message;
    await chrome.storage.session.set({ captureWarning });
    await updateBadge(true);
  }

  async function context(sender: chrome.runtime.MessageSender) {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab?.id === undefined ||
      sender.tab.incognito ||
      (sender.documentLifecycle && sender.documentLifecycle !== 'active')
    )
      throw new Error('Capture is unavailable in this context.');
    const tab = await chrome.tabs.get(sender.tab.id);
    const site = webOrigin(tab.url ?? '');
    if (webOrigin(sender.tab.url ?? '') !== site)
      throw new Error('The website changed before capture completed.');
    const frameOrigin = webOrigin(sender.url ?? '') ?? webOrigin(sender.origin ?? '');
    if (
      !site ||
      !frameOrigin ||
      !(await chrome.permissions.contains({ origins: [`${site}/*`, `${frameOrigin}/*`] }))
    )
      throw new Error('Website access is not enabled.');
    return { site, frameOrigin, tab, mode: captureMode(settings, site, frameOrigin) };
  }

  function isUI(sender: chrome.runtime.MessageSender) {
    if (sender.id !== chrome.runtime.id) return false;
    return ['history.html', 'popup.html', 'options.html'].some(
      (path) => sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(path),
    );
  }

  async function owner(id: string, token: string, sender: chrome.runtime.MessageSender) {
    const saved = owners.get(id);
    if (
      !saved ||
      saved.token !== token ||
      saved.tabId !== sender.tab?.id ||
      saved.documentId !== sender.documentId ||
      saved.frameId !== sender.frameId
    )
      throw new Error('This save has ended.');
    const ctx = await context(sender);
    if (ctx.site !== saved.site || ctx.mode !== 'copies') throw new Error('Recording was stopped.');
    return saved;
  }

  async function updateBadge(failure = false) {
    const warning = failure || Boolean(captureWarning);
    const text = !settings.consented ? '' : settings.paused ? 'Ⅱ' : warning ? '!' : '';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: warning ? '#b64137' : '#62718b' });
    await chrome.action.setTitle({
      title: settings.paused
        ? 'Upload History — recording paused'
        : warning
          ? 'Upload History — a file could not be saved. Open history for details.'
          : 'Upload History',
    });
  }

  async function handle(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
    await ready;
    if (!message || typeof message !== 'object' || typeof message.type !== 'string')
      throw new Error('Invalid request.');
    if (message.type.startsWith('ui:')) {
      if (!isUI(sender)) throw new Error('Archive access is restricted to extension pages.');
    } else if (message.type.startsWith('capture:')) {
      if (!sender.tab || sender.id !== chrome.runtime.id)
        throw new Error('Invalid capture sender.');
    } else throw new Error('Unknown request.');

    if (message.type === 'capture:policy') {
      try {
        const ctx = await context(sender);
        return {
          mode: initializationError ? 'disabled' : ctx.mode,
          maxFileBytes: limitsFor(settings).maxFileBytes,
          epoch: captureEpoch,
        };
      } catch {
        return {
          mode: 'disabled',
          maxFileBytes: limitsFor(settings).maxFileBytes,
          epoch: captureEpoch,
        };
      }
    }
    if (message.type === 'ui:state') {
      let currentSite: string | undefined;
      if (typeof message.tabId === 'number') {
        try {
          currentSite = webOrigin((await chrome.tabs.get(message.tabId)).url ?? '');
        } catch {
          /* tab closed */
        }
      }
      let records: ArchiveRecord[] = [];
      let usage = { usedBytes: 0, reservedBytes: 0, records: 0, saved: 0 };
      if (!initializationError) {
        try {
          for (const [id, save] of owners)
            if (Date.now() - save.lastSeen > 120000) {
              await archive.fail(
                id,
                save.token,
                'Saving stopped before the file was complete. Select it again to retry.',
              );
              owners.delete(id);
            }
          await archive.cleanup();
          [records, usage] = await Promise.all([archive.list(), archive.usage()]);
        } catch {
          initializationError =
            'The archive could not be read. Its data or encryption key may be damaged. Clear all history in Settings only if you want to permanently discard it and start again.';
        }
      }
      const hasAccess = await hasGlobalAccess();
      return {
        settings,
        records,
        usage,
        hasAccess,
        currentSite,
        currentMode: currentSite ? effectiveMode(settings, currentSite) : undefined,
        error: initializationError,
        captureWarning,
      } satisfies AppState;
    }
    if (message.type === 'ui:dismiss-warning') {
      captureWarning = undefined;
      await chrome.storage.session.remove('captureWarning');
      await updateBadge();
      return;
    }
    if (message.type === 'ui:clear') {
      captureEpoch = crypto.randomUUID();
      owners.clear();
      downloads.clear();
      await notifyPolicyChanged();
      await archive.clear();
      initializationError = undefined;
      captureWarning = undefined;
      await chrome.storage.session.remove('captureWarning');
      await updateBadge();
      return;
    }
    if (message.type === 'ui:settings') {
      const next = validateSettings(message.patch, settings);
      if (next.consented && !settings.consented && !(await hasGlobalAccess()))
        throw new Error('Grant website access before enabling recording.');
      const changed = policyChanged(settings, next);
      if (changed) {
        captureEpoch = crypto.randomUUID();
        owners.clear();
        if (!initializationError) await archive.cancelPending();
      }
      settings = next;
      await chrome.storage.local.set({ settings });
      if (changed) {
        await notifyPolicyChanged();
        await syncCapture();
      }
      await updateBadge();
      return settings;
    }
    if (initializationError) throw new Error(initializationError);

    switch (message.type) {
      case 'capture:skipped': {
        if (
          message.epoch !== captureEpoch ||
          !Number.isInteger(message.count) ||
          message.count < 1 ||
          message.count > 10000
        )
          return;
        const ctx = await context(sender);
        if (ctx.mode === 'disabled') return;
        if (message.reason !== 'queue-full' && message.reason !== 'queue-expired')
          throw new Error('Invalid capture warning.');
        await warnAboutCapture(
          message.reason === 'queue-full'
            ? 'Some selected files were not recorded because too many were waiting to be saved. Wait for current copies to finish, then select the missing files again in smaller batches.'
            : 'Some selected files were not recorded because they waited too long to be saved. Select those files again to retry.',
        );
        return;
      }
      case 'capture:begin': {
        if (message.epoch !== captureEpoch)
          throw new Error('Recording changed after this file was selected.');
        const ctx = await context(sender);
        if (ctx.mode === 'disabled') throw new Error('Recording is disabled.');
        const rateKey = `${sender.tab!.id}:${sender.documentId ?? sender.frameId}`;
        const now = Date.now();
        for (const [key, entry] of rates) if (now - entry.since > 60000) rates.delete(key);
        const rate = rates.get(rateKey) ?? { count: 0, since: now };
        if (++rate.count > 180) {
          await warnAboutCapture(
            'Some files were not recorded because many files were selected in a short time. Wait a minute, then select the missing files again.',
          );
          throw new Error('Too many file selections. Try again in a minute.');
        }
        rates.set(rateKey, rate);
        const metadata = validateMetadata(message.metadata);
        const record: ArchiveRecord = {
          ...metadata,
          pageUrl: sanitizeUrl(sender.url ?? ''),
          pageTitle: metadata.pageTitle.slice(0, 1024),
          id: crypto.randomUUID(),
          site: ctx.site,
          frameOrigin: ctx.frameOrigin,
          capturedAt: now,
          expiresAt: settings.retentionDays ? now + settings.retentionDays * 86400000 : null,
          kept: false,
          mode: ctx.mode,
          status: ctx.mode === 'logs' ? 'logs' : 'saving',
        };
        let result;
        try {
          result = await archive.begin(record, limitsFor(settings));
        } catch (error) {
          await warnAboutCapture(
            'A recent file could not be recorded. Check the archive storage budget, then select the file again. Existing saved copies were preserved.',
          );
          throw error;
        }
        if (result.token)
          owners.set(result.record.id, {
            token: result.token,
            tabId: sender.tab!.id!,
            documentId: sender.documentId,
            frameId: sender.frameId,
            site: ctx.site,
            lastSeen: now,
          });
        if (result.record.status === 'failed') await updateBadge(true);
        return result;
      }
      case 'capture:chunk': {
        const save = await owner(message.id, message.token, sender);
        if (
          typeof message.data !== 'string' ||
          message.data.length > Math.ceil(CHUNK_BYTES / 3) * 4 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(message.data)
        )
          throw new Error('Invalid file chunk.');
        const bytes = fromBase64(message.data);
        if (
          !bytes.length ||
          bytes.length > CHUNK_BYTES ||
          !Number.isInteger(message.index) ||
          message.index < 0
        )
          throw new Error('Invalid file chunk.');
        await archive.append(message.id, message.token, message.index, bytes);
        save.lastSeen = Date.now();
        return;
      }
      case 'capture:finish': {
        await owner(message.id, message.token, sender);
        const record = await archive.finish(message.id, message.token);
        owners.delete(message.id);
        return record;
      }
      case 'capture:fail': {
        const saved = owners.get(message.id);
        if (
          saved?.token !== message.token ||
          saved?.tabId !== sender.tab?.id ||
          saved.documentId !== sender.documentId
        )
          throw new Error('This save has ended.');
        await archive.fail(
          message.id,
          message.token,
          'The file could not be copied completely. Keep the original and try selecting it again.',
        );
        owners.delete(message.id);
        await updateBadge(true);
        return;
      }
      case 'ui:delete': {
        if (
          !Array.isArray(message.ids) ||
          message.ids.length > 10000 ||
          message.ids.some((id) => typeof id !== 'string' || id.length > 100)
        )
          throw new Error('Invalid record selection.');
        for (const id of message.ids) owners.delete(id);
        downloads.clear();
        await archive.delete(message.ids);
        return;
      }
      case 'ui:keep': {
        if (typeof message.id !== 'string' || typeof message.kept !== 'boolean')
          throw new Error('Invalid retention request.');
        await archive.keep(message.id, message.kept, settings.retentionDays);
        return;
      }
      case 'ui:download': {
        await archive.cleanup();
        for (const [key, ticket] of downloads)
          if (ticket.expires < Date.now()) downloads.delete(key);
        if (downloads.size >= 2) throw new Error('Wait for the current downloads to finish.');
        const { record, bytes } = await archive.download(message.id);
        const ticket = crypto.randomUUID();
        downloads.set(ticket, {
          bytes,
          expires: Date.now() + 120000,
          owner: sender.documentId ?? sender.url!,
        });
        return {
          ticket,
          name: record.name,
          mime: record.mime,
          size: bytes.length,
          chunks: Math.ceil(bytes.length / CHUNK_BYTES),
        };
      }
      case 'ui:download-chunk': {
        const ticket = downloads.get(message.ticket);
        if (
          !ticket ||
          ticket.expires < Date.now() ||
          ticket.owner !== (sender.documentId ?? sender.url)
        )
          throw new Error('Download expired. Please try again.');
        if (
          !Number.isInteger(message.index) ||
          message.index < 0 ||
          message.index >= Math.ceil(ticket.bytes.length / CHUNK_BYTES)
        )
          throw new Error('Invalid download chunk.');
        ticket.expires = Date.now() + 120000;
        return {
          data: toBase64(
            ticket.bytes.subarray(message.index * CHUNK_BYTES, (message.index + 1) * CHUNK_BYTES),
          ),
        };
      }
      case 'ui:download-end': {
        const ticket = downloads.get(message.ticket);
        if (ticket?.owner === (sender.documentId ?? sender.url)) downloads.delete(message.ticket);
        return;
      }
      default:
        throw new Error('Unknown request.');
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    enqueue(() => handle(message, sender)).then(
      (data) => respond({ ok: true, data }),
      () => {
        // Avoid leaking file metadata through thrown browser/IndexedDB error messages.
        respond({
          ok: false,
          error:
            'This action could not be completed. Check recording permissions, available storage, and the record status, then try again.',
        });
      },
    );
    return true;
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'archive-cleanup')
      void enqueue(async () => {
        await ready;
        if (!initializationError) await archive.cleanup();
      });
  });
  chrome.permissions.onAdded.addListener(() => {
    void enqueue(async () => {
      await ready;
      await syncCapture();
    });
  });
  chrome.permissions.onRemoved.addListener(() => {
    void enqueue(async () => {
      await ready;
      captureEpoch = crypto.randomUUID();
      owners.clear();
      if (!initializationError) await archive.cancelPending();
      await notifyPolicyChanged();
      await syncCapture();
    });
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void enqueue(async () => {
      await ready;
      for (const [id, save] of owners)
        if (save.tabId === tabId) {
          if (!initializationError)
            await archive.fail(id, save.token, 'The tab closed before this copy finished saving.');
          owners.delete(id);
        }
    });
  });
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install')
      void chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    if (details.reason === 'update')
      void enqueue(async () => {
        await ready;
        await syncCapture();
      });
  });
});
