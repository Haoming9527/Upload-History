import { HOST_PATTERNS, type Settings } from '../shared/types';
import { webOrigin } from '../shared/policy';

export async function syncCapture(settings: Settings, injectExisting = true) {
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

export async function hasGlobalAccess() {
  return chrome.permissions.contains({ origins: HOST_PATTERNS });
}

export async function notifyPolicyChanged() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id)
      .map((tab) => chrome.tabs.sendMessage(tab.id!, { type: 'capture:policy-changed' })),
  );
}
