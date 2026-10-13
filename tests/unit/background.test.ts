import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  CHUNK_BYTES,
  HOST_PATTERNS,
  type AppState,
  type BeginResult,
  type CapturePolicy,
  type DownloadTicket,
  type Reply,
  type Settings,
} from '../../src/shared/types';

vi.mock('wxt/utils/define-background', () => ({
  defineBackground: (start: () => void) => start(),
}));

type EventCallback = (...args: any[]) => unknown;
function event<T extends EventCallback = EventCallback>() {
  const listeners: T[] = [];
  return {
    addListener: vi.fn((listener: T) => {
      listeners.push(listener);
    }),
    fire: (...args: Parameters<T>) => {
      for (const listener of listeners) listener(...args);
    },
  };
}

const EXTENSION_ID = 'upload-history-test-extension';
const SITE = 'https://school.example';
const contentSender: chrome.runtime.MessageSender = {
  id: EXTENSION_ID,
  url: `${SITE}/submit?private-token=secret#upload`,
  origin: SITE,
  documentId: 'document-one',
  frameId: 0,
  documentLifecycle: 'active',
  tab: { id: 7, url: `${SITE}/submit`, incognito: false } as chrome.tabs.Tab,
};
const uiSender: chrome.runtime.MessageSender = {
  id: EXTENSION_ID,
  url: `chrome-extension://${EXTENSION_ID}/history.html`,
  documentId: 'history-document',
};
const metadata = {
  name: 'assignment.txt',
  size: 3,
  mime: 'text/plain',
  lastModified: 100,
  pageTitle: 'Assignment submission',
  pageUrl: 'https://untrusted.example/forged',
  method: 'input',
};

async function harness(
  settingsPatch: Partial<Settings> = {},
  initialSession: Record<string, unknown> = {},
  initialScripts: chrome.scripting.RegisteredContentScript[] = [],
) {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  let allowed = true;
  let stored = { ...DEFAULT_SETTINGS, consented: true, ...settingsPatch };
  const session: Record<string, unknown> = { ...initialSession };
  let registeredScripts = structuredClone(initialScripts);
  const onMessage =
    event<
      (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        respond: (reply: Reply) => void,
      ) => unknown
    >();
  const onRemoved = event();
  const chromeMock = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`,
      onMessage,
      onInstalled: event(),
    },
    storage: {
      local: {
        setAccessLevel: vi.fn(async () => undefined),
        get: vi.fn(async () => ({ settings: stored })),
        set: vi.fn(async (value: { settings: Settings }) => {
          stored = value.settings;
        }),
      },
      session: {
        get: vi.fn(async (key: string) => (key in session ? { [key]: session[key] } : {})),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(session, values);
        }),
        remove: vi.fn(async (key: string) => {
          delete session[key];
        }),
      },
    },
    permissions: {
      getAll: vi.fn(async () => ({ origins: allowed ? HOST_PATTERNS : [] })),
      contains: vi.fn(async () => allowed),
      onAdded: event(),
      onRemoved,
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => structuredClone(registeredScripts)),
      unregisterContentScripts: vi.fn(async () => {
        registeredScripts = [];
      }),
      registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        registeredScripts = structuredClone(scripts);
      }),
      updateContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        registeredScripts = registeredScripts.map((script) => ({
          ...script,
          ...scripts.find((update) => update.id === script.id),
        }));
      }),
      executeScript: vi.fn(async () => []),
    },
    tabs: {
      get: vi.fn(async (id: number) => ({ id, url: `${SITE}/submit`, incognito: false })),
      query: vi.fn(async () => [{ id: 7, url: `${SITE}/submit` }]),
      sendMessage: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
      onRemoved: event(),
    },
    alarms: { create: vi.fn(async () => undefined), onAlarm: event() },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
    },
  };
  vi.stubGlobal('chrome', chromeMock);
  await import('../../entrypoints/background');
  function send<T = unknown>(message: unknown, sender = contentSender): Promise<Reply<T>> {
    return new Promise((resolve) =>
      onMessage.fire(message, sender, (reply) => resolve(reply as Reply<T>)),
    );
  }
  async function policy(): Promise<CapturePolicy> {
    const reply = await send<CapturePolicy>({ type: 'capture:policy' });
    expect(reply.ok).toBe(true);
    return reply.data!;
  }
  async function begin(epoch?: string): Promise<Reply<BeginResult>> {
    return send({
      type: 'capture:begin',
      captureId: crypto.randomUUID(),
      epoch: epoch ?? (await policy()).epoch,
      metadata,
    });
  }
  async function state(): Promise<AppState> {
    const reply = await send<AppState>({ type: 'ui:state' }, uiSender);
    expect(reply.ok).toBe(true);
    return reply.data!;
  }
  return {
    send,
    policy,
    begin,
    state,
    chromeMock,
    revoke: () => {
      allowed = false;
      onRemoved.fire({ origins: HOST_PATTERNS });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('background message security and capture lifecycle', () => {
  const persistedCapture: chrome.scripting.RegisteredContentScript = {
    id: 'upload-history-capture',
    js: ['content-scripts/capture.js'],
    matches: HOST_PATTERNS,
    allFrames: true,
    runAt: 'document_start',
    persistAcrossSessions: true,
    matchOriginAsFallback: true,
  };

  it('preserves existing listeners and unchanged registration when a capture wakes the worker', async () => {
    const app = await harness({}, {}, [persistedCapture]);
    const started = await app.begin();
    expect(started.ok).toBe(true);
    // WXT replaces an old content-script context on executeScript; that would drop the waking selection.
    expect(app.chromeMock.scripting.executeScript).not.toHaveBeenCalled();
    expect(app.chromeMock.scripting.unregisterContentScripts).not.toHaveBeenCalled();
    expect(app.chromeMock.scripting.registerContentScripts).not.toHaveBeenCalled();
    expect(app.chromeMock.scripting.updateContentScripts).not.toHaveBeenCalled();
  });

  it('repairs changed registration in place at worker startup without replacing current listeners', async () => {
    const app = await harness({}, {}, [{ ...persistedCapture, runAt: 'document_idle' }]);
    await app.policy();
    expect(app.chromeMock.scripting.updateContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: persistedCapture.id,
        runAt: 'document_start',
        world: 'ISOLATED',
      }),
    ]);
    expect(app.chromeMock.scripting.unregisterContentScripts).not.toHaveBeenCalled();
    expect(app.chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('still injects existing tabs after onboarding consent and added permissions', async () => {
    const app = await harness({ consented: false });
    await app.policy();
    expect(app.chromeMock.scripting.executeScript).not.toHaveBeenCalled();
    expect((await app.send({ type: 'ui:settings', patch: { consented: true } }, uiSender)).ok).toBe(
      true,
    );
    expect(app.chromeMock.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(app.chromeMock.scripting.executeScript).toHaveBeenCalledTimes(1);
    app.chromeMock.permissions.onAdded.fire({ origins: HOST_PATTERNS });
    await app.policy();
    expect(app.chromeMock.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(app.chromeMock.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(app.chromeMock.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });

  it('intentionally replaces listeners after an extension update, not an ordinary worker wake', async () => {
    const app = await harness({}, {}, [persistedCapture]);
    await app.policy();
    app.chromeMock.runtime.onInstalled.fire({ reason: 'update' });
    await app.policy();
    expect(app.chromeMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, allFrames: true },
      files: ['content-scripts/capture.js'],
    });
    expect(app.chromeMock.scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it('prevents content scripts from reading, deleting, or changing the archive', async () => {
    const app = await harness();
    const created = (await app.begin()).data!;
    for (const request of [
      { type: 'ui:state' },
      { type: 'ui:delete', ids: [created.record.id] },
      { type: 'ui:clear' },
      { type: 'ui:dismiss-warning' },
      { type: 'ui:settings', patch: { consented: false } },
      { type: 'ui:download', id: created.record.id },
    ]) {
      const reply = await app.send(request);
      expect(reply.ok).toBe(false);
      expect(reply.data).toBeUndefined();
    }
    const state = await app.state();
    expect(state.settings.consented).toBe(true);
    expect(state.records.map((record) => record.id)).toEqual([created.record.id]);
    expect(app.chromeMock.storage.local.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  });

  it('rejects foreign, tabless, incognito, stale-document, and navigated capture senders', async () => {
    const app = await harness();
    const { epoch } = await app.policy();
    const request = { type: 'capture:begin', captureId: 'capture', epoch, metadata };
    for (const sender of [
      { ...contentSender, id: 'another-extension' },
      { ...contentSender, tab: undefined },
      { ...contentSender, tab: { ...contentSender.tab, incognito: true } },
      { ...contentSender, documentLifecycle: 'cached' },
      { ...contentSender, tab: { ...contentSender.tab, url: 'https://previous.example/form' } },
    ])
      expect((await app.send(request, sender as chrome.runtime.MessageSender)).ok).toBe(false);
    const state = await app.state();
    expect(state.records).toEqual([]);
    expect(state.captureWarning).toBeUndefined();
  });

  it('archives a genuine capture with sender-derived location and downloads identical bytes through UI-only endpoints', async () => {
    const app = await harness();
    const start = await app.begin();
    expect(start.ok).toBe(true);
    const { record, token } = start.data!;
    expect(record).toMatchObject({
      site: SITE,
      frameOrigin: SITE,
      pageUrl: `${SITE}/submit`,
      name: metadata.name,
      status: 'saving',
    });
    expect(
      (await app.send({ type: 'capture:chunk', id: record.id, token, index: 0, data: 'AQID' })).ok,
    ).toBe(true);
    expect((await app.send({ type: 'capture:finish', id: record.id, token })).ok).toBe(true);
    const state = await app.state();
    expect(state.records[0]).toMatchObject({ id: record.id, status: 'saved' });
    const download = await app.send<DownloadTicket>(
      { type: 'ui:download', id: record.id },
      uiSender,
    );
    expect(download.ok).toBe(true);
    const chunk = await app.send<{ data: string }>(
      { type: 'ui:download-chunk', ticket: download.data!.ticket, index: 0 },
      uiSender,
    );
    expect(chunk.data?.data).toBe('AQID');
    expect(
      (await app.send({ type: 'ui:download-end', ticket: download.data!.ticket }, uiSender)).ok,
    ).toBe(true);
  });

  it('rejects an old selection epoch and all old writes after Clear all, while allowing a new selection', async () => {
    const app = await harness();
    const oldPolicy = await app.policy();
    const pending = (await app.begin(oldPolicy.epoch)).data!;
    expect((await app.send({ type: 'ui:clear' }, uiSender)).ok).toBe(true);
    expect((await app.begin(oldPolicy.epoch)).ok).toBe(false);
    expect(
      (
        await app.send({
          type: 'capture:chunk',
          id: pending.record.id,
          token: pending.token,
          index: 0,
          data: 'AQID',
        })
      ).ok,
    ).toBe(false);
    expect(
      (await app.send({ type: 'capture:finish', id: pending.record.id, token: pending.token })).ok,
    ).toBe(false);
    expect((await app.state()).records).toEqual([]);
    const newPolicy = await app.policy();
    expect(newPolicy.epoch).not.toBe(oldPolicy.epoch);
    const fresh = await app.begin(newPolicy.epoch);
    expect(fresh.ok).toBe(true);
    expect((await app.state()).records.map((record) => record.id)).toEqual([fresh.data!.record.id]);
  });

  it('binds file writes to the originating tab, document, frame, and token', async () => {
    const app = await harness();
    const { record, token } = (await app.begin()).data!;
    const chunk = { type: 'capture:chunk', id: record.id, token, index: 0, data: 'AQID' };
    for (const sender of [
      { ...contentSender, tab: { ...contentSender.tab, id: 8 } },
      { ...contentSender, documentId: 'other-document' },
      { ...contentSender, frameId: 12 },
    ])
      expect((await app.send(chunk, sender as chrome.runtime.MessageSender)).ok).toBe(false);
    expect((await app.send({ ...chunk, token: 'wrong-token' })).ok).toBe(false);
    expect((await app.send(chunk)).ok).toBe(true);
    expect((await app.send({ type: 'capture:finish', id: record.id, token })).ok).toBe(true);
    expect((await app.state()).records[0]?.status).toBe('saved');
  });

  it.each(['permission', 'pause', 'disabled-site', 'logs-only'] as const)(
    'stops an active copy after %s changes',
    async (change) => {
      const app = await harness();
      const oldPolicy = await app.policy();
      const { record, token } = (await app.begin(oldPolicy.epoch)).data!;
      if (change === 'permission') app.revoke();
      else {
        const patch =
          change === 'pause'
            ? { paused: true }
            : { siteModes: { [SITE]: change === 'logs-only' ? 'logs' : 'disabled' } };
        expect((await app.send({ type: 'ui:settings', patch }, uiSender)).ok).toBe(true);
      }
      expect(
        (await app.send({ type: 'capture:chunk', id: record.id, token, index: 0, data: 'AQID' }))
          .ok,
      ).toBe(false);
      expect((await app.send({ type: 'capture:finish', id: record.id, token })).ok).toBe(false);
      expect((await app.begin(oldPolicy.epoch)).ok).toBe(false);
      const state = await app.state();
      expect(state.records[0]?.status).toBe('failed');
      expect(state.usage.reservedBytes).toBe(0);
    },
  );

  it('requires consent even when Chrome has granted website permission', async () => {
    const app = await harness({ consented: false });
    const policy = await app.policy();
    expect(policy.mode).toBe('disabled');
    expect((await app.begin(policy.epoch)).ok).toBe(false);
    expect((await app.state()).records).toEqual([]);
    expect(app.chromeMock.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('persists a trusted current-epoch queue warning and lets only extension UI dismiss it', async () => {
    const app = await harness();
    const { epoch } = await app.policy();
    expect(
      (await app.send({ type: 'capture:skipped', epoch, count: 2, reason: 'queue-full' })).ok,
    ).toBe(true);
    const warning = (await app.state()).captureWarning;
    expect(warning).toMatch(/not recorded/);
    expect(warning).not.toContain(metadata.name);
    expect((await app.chromeMock.storage.session.get('captureWarning')).captureWarning).toBe(
      warning,
    );
    expect(app.chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
    expect((await app.send({ type: 'ui:dismiss-warning' })).ok).toBe(false);
    expect((await app.state()).captureWarning).toBe(warning);
    expect((await app.send({ type: 'ui:dismiss-warning' }, uiSender)).ok).toBe(true);
    expect((await app.state()).captureWarning).toBeUndefined();
    expect(await app.chromeMock.storage.session.get('captureWarning')).toEqual({});
    expect(app.chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  });

  it('does not resurrect a cleared warning from a stale queue notification or failed begin', async () => {
    const app = await harness();
    const { epoch } = await app.policy();
    const warning = { type: 'capture:skipped', epoch, count: 1, reason: 'queue-expired' };
    expect((await app.send(warning)).ok).toBe(true);
    expect((await app.state()).captureWarning).toBeTruthy();
    expect((await app.send({ type: 'ui:clear' }, uiSender)).ok).toBe(true);
    expect((await app.send(warning)).ok).toBe(true);
    expect((await app.begin(epoch)).ok).toBe(false);
    expect((await app.state()).captureWarning).toBeUndefined();
    expect(await app.chromeMock.storage.session.get('captureWarning')).toEqual({});
  });

  it('keeps a failed-copy record when pending copies exhaust the budget', async () => {
    const app = await harness({ budgetMiB: 50 });
    const { epoch } = await app.policy();
    // Reserve almost the entire budget without allocating or reading a large file.
    const pending = await app.send<BeginResult>({
      type: 'capture:begin',
      captureId: 'large-pending-copy',
      epoch,
      metadata: { ...metadata, size: 50 * 1024 * 1024 - 32 * 1024 },
    });
    expect(pending.data?.record.status).toBe('saving');
    const reply = await app.begin(epoch);
    expect(reply.ok).toBe(true);
    expect(reply.data?.record.status).toBe('failed');
    expect(reply.data?.record.failure).toContain('budget');
    const state = await app.state();
    expect(state.records).toHaveLength(2);
    expect(state.records.find((record) => record.id === pending.data!.record.id)?.status).toBe(
      'saving',
    );
    expect(state.captureWarning).toBeUndefined();
  });

  it('applies new limits to new captures without cancelling an admitted copy', async () => {
    const app = await harness();
    const { epoch } = await app.policy();
    const bytes = Buffer.alloc(1024 * 1024 + 1, 7);
    const message = {
      type: 'capture:begin',
      captureId: 'limit-change',
      epoch,
      metadata: { ...metadata, size: bytes.length },
    };
    const { record, token } = (await app.send<BeginResult>(message)).data!;
    expect(token).toBeTruthy();
    expect(
      (await app.send({ type: 'ui:settings', patch: { maxFileMiB: 1, budgetMiB: 50 } }, uiSender))
        .ok,
    ).toBe(true);
    expect((await app.policy()).epoch).toBe(epoch);
    for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTES, index++) {
      expect(
        (
          await app.send({
            type: 'capture:chunk',
            id: record.id,
            token,
            index,
            data: bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64'),
          })
        ).ok,
      ).toBe(true);
    }
    expect((await app.send({ type: 'capture:finish', id: record.id, token })).ok).toBe(true);
    const next = await app.send<BeginResult>(message);
    expect(next.data?.record.status).toBe('failed');
    expect(next.data?.record.failure).toContain('maximum');
    expect((await app.state()).records.find((row) => row.id === record.id)?.status).toBe('saved');
  });

  it('restores a session warning when the service worker starts', async () => {
    const warning = 'Some selected files were not recorded.';
    const app = await harness({}, { captureWarning: warning });
    expect((await app.state()).captureWarning).toBe(warning);
    expect(app.chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
  });
});
