import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = process.cwd();
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const run = await mkdtemp(path.join(artifacts, 'browser-'));
const extension = path.join(run, 'extension');
await cp(path.join(root, '.output/chrome-mv3'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
assert.equal(manifest.chrome_url_overrides, undefined, 'Must not replace browser history');
assert.equal(manifest.host_permissions, undefined, 'Website access must be optional');
assert.equal(manifest.content_scripts, undefined, 'No injection before consent');
assert.deepEqual(manifest.permissions, ['storage', 'scripting', 'alarms']);
assert.equal(manifest.incognito, 'not_allowed');
// Chromium cannot automate its native optional-host permission prompt. Pregrant
// access in this test copy only; every bundled script is the production build.
manifest.host_permissions = ['http://*/*', 'https://*/*'];
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));

const fixture = await readFile('tests/fixtures/upload.html');
const fixtureJS = await readFile('tests/fixtures/fixture.js');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
  if (req.url === '/fixture.js') res.end(fixtureJS);
  else if (req.url === '/frame')
    res.end(
      '<!doctype html><title>Embedded assignment</title><label>Embedded file <input id="embedded" type="file"></label>',
    );
  else res.end(fixture);
});
await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const altOrigin = `http://localhost:${port}`;
const profile = path.join(run, 'profile');
const errors = [];
const checks = [];
let context;
let ui;
let extensionId;
const screenshotDir = path.join(artifacts, 'screenshots');
await mkdir(screenshotDir, { recursive: true });

async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 20000 }));
  extensionId = new URL(worker.url()).host;
  ui = await context.newPage();
  await ui.goto(`chrome-extension://${extensionId}/history.html`);
  await ui.waitForFunction(() => !!document.querySelector('button'));
  return worker;
}
async function request(message) {
  const response = await ui.evaluate((message) => chrome.runtime.sendMessage(message), message);
  assert.equal(response.ok, true, `${message.type}: ${response.error}`);
  return response.data;
}
async function state() {
  return request({ type: 'ui:state' });
}
async function attach(locator, input) {
  const directory = await mkdtemp(path.join(run, 'selection-'));
  const files = Array.isArray(input) ? input : [input];
  const paths = [];
  for (const file of files) {
    const filePath = path.join(directory, file.name);
    await writeFile(filePath, file.buffer);
    paths.push(filePath);
  }
  // Disk paths use Chromium's native file picker protocol and trusted events.
  // Playwright's buffer convenience helper synthesizes untrusted change events.
  await locator.setInputFiles(paths);
}
async function waitRecord(name, status = 'saved') {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const records = (await state()).records;
    const record = records.find((r) => r.name === name && r.status === status);
    if (record) return record;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(
    `Record ${name} did not reach ${status}: ${JSON.stringify((await state()).records.map((r) => ({ name: r.name, status: r.status, failure: r.failure })))}`,
  );
}
function check(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
}
async function downloadBytes(id) {
  const ticket = await request({ type: 'ui:download', id });
  const parts = [];
  for (let i = 0; i < ticket.chunks; i++)
    parts.push(
      Buffer.from(
        (await request({ type: 'ui:download-chunk', ticket: ticket.ticket, index: i })).data,
        'base64',
      ),
    );
  await request({ type: 'ui:download-end', ticket: ticket.ticket });
  return Buffer.concat(parts);
}

try {
  let worker = await launch();
  const upload = await context.newPage();
  await upload.goto(`${origin}/assignment?token=should-not-be-stored#private`);
  await attach(upload.locator('#single'), {
    name: 'before-consent.txt',
    buffer: Buffer.from('before'),
  });
  assert.equal((await state()).records.length, 0);
  await ui.screenshot({ path: path.join(screenshotDir, 'onboarding.png'), fullPage: true });
  check('No recording before consent');
  await ui.getByRole('button', { name: 'Enable Upload History', exact: true }).click();
  await ui.getByRole('heading', { name: /Your upload history/ }).waitFor();
  await upload.reload();

  const original = Buffer.from(
    'An independent assignment snapshot.\n' + 'Byte integrity. '.repeat(45000),
  );
  const originalPath = path.join(run, 'assignment.txt');
  await writeFile(originalPath, original);
  await upload.locator('#single').setInputFiles(originalPath);
  const saved = await waitRecord('assignment.txt');
  assert.equal(saved.sha256, createHash('sha256').update(original).digest('hex'));
  assert.equal(saved.pageUrl, `${origin}/assignment`);
  assert.equal(saved.site, origin);
  assert.deepEqual(await downloadBytes(saved.id), original);
  await unlink(originalPath);
  check(
    'Real file selection, chunk transfer, sanitized location and identical recovery after source deletion',
  );

  await attach(upload.locator('#single'), {
    name: 'assignment.txt',
    buffer: Buffer.from('replacement'),
  });
  const deadline = Date.now() + 10000;
  while (
    (await state()).records.filter((r) => r.name === 'assignment.txt' && r.status === 'saved')
      .length < 2 &&
    Date.now() < deadline
  )
    await new Promise((r) => setTimeout(r, 100));
  const twins = (await state()).records.filter((r) => r.name === 'assignment.txt');
  assert.equal(twins.length, 2);
  assert.notEqual(twins[0].sha256, twins[1].sha256);
  check('Same-name replacements keep independent copies');

  // Wake the MV3 worker from a file event in an existing page. Reinjecting the
  // content script during startup would dispose the pipeline holding this file.
  await ui.goto(`chrome-extension://${extensionId}/privacy.html`); // No UI polling to wake it.
  const lifecycle = await context.newCDPSession(ui);
  const versions = new Map();
  lifecycle.on('ServiceWorker.workerVersionUpdated', ({ versions: updated }) => {
    for (const version of updated) versions.set(version.versionId, version);
  });
  await lifecycle.send('ServiceWorker.enable');
  const workerDeadline = Date.now() + 10000;
  let activeVersion;
  while (!activeVersion && Date.now() < workerDeadline) {
    activeVersion = [...versions.values()].find(
      (v) =>
        v.scriptURL === `chrome-extension://${extensionId}/background.js` &&
        v.runningStatus === 'running',
    );
    if (!activeVersion) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(activeVersion, 'Extension worker version must be observable');
  await lifecycle.send('ServiceWorker.stopWorker', { versionId: activeVersion.versionId });
  const stoppedDeadline = Date.now() + 10000;
  while (
    versions.get(activeVersion.versionId)?.runningStatus !== 'stopped' &&
    Date.now() < stoppedDeadline
  )
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(versions.get(activeVersion.versionId)?.runningStatus, 'stopped');
  await attach(upload.locator('#single'), {
    name: 'after-worker-sleep.txt',
    buffer: Buffer.from('wake once'),
  });
  await ui.goto(`chrome-extension://${extensionId}/history.html`);
  const afterSleep = await waitRecord('after-worker-sleep.txt');
  assert.deepEqual(await downloadBytes(afterSleep.id), Buffer.from('wake once'));
  await lifecycle.detach();
  check('A single file selection wakes a stopped service worker without losing the file');

  await upload.getByRole('button', { name: 'Add another upload control' }).click();
  await attach(upload.locator('#dynamic-file'), {
    name: 'dynamic.zip',
    buffer: Buffer.from('zip test'),
  });
  await waitRecord('dynamic.zip');
  await attach(upload.locator('#open-file'), { name: 'shadow.txt', buffer: Buffer.from('shadow') });
  await waitRecord('shadow.txt');
  await attach(upload.frameLocator('#frame').locator('#embedded'), {
    name: 'embedded.pdf',
    buffer: Buffer.from('%PDF-test'),
  });
  await waitRecord('embedded.pdf');
  await upload.locator('#frame').evaluate((frame, url) => (frame.src = url), `${altOrigin}/frame`);
  await attach(upload.frameLocator('#frame').locator('#embedded'), {
    name: 'cross-origin.pdf',
    buffer: Buffer.from('frame'),
  });
  const cross = await waitRecord('cross-origin.pdf');
  assert.equal(cross.site, origin);
  assert.equal(cross.frameOrigin, altOrigin);
  check('Dynamic controls, open shadow DOM, same-origin and cross-origin frames');

  const closedPath = path.join(run, 'closed.txt');
  await writeFile(closedPath, 'closed shadow');
  const cdp = await context.newCDPSession(upload);
  const dom = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  function findClosed(node) {
    if (node.attributes?.includes('closed-file')) return node;
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
      const found = findClosed(child);
      if (found) return found;
    }
  }
  const closedNode = findClosed(dom.root);
  assert.ok(closedNode);
  await cdp.send('DOM.setFileInputFiles', {
    files: [closedPath],
    backendNodeId: closedNode.backendNodeId,
  });
  await waitRecord('closed.txt');
  check('Closed shadow DOM file input');

  const dropPath = path.join(run, 'drop.txt');
  await writeFile(dropPath, 'real browser drop');
  const box = await upload.locator('#drop').boundingBox();
  const data = { items: [], files: [dropPath], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'])
    await cdp.send('Input.dispatchDragEvent', { type, x: box.x + 40, y: box.y + 20, data });
  await waitRecord('drop.txt');
  check('Trusted file drag and drop');

  await request({ type: 'ui:settings', patch: { defaultMode: 'logs' } });
  // Instrument the same isolated world used by production capture, not page JS.
  const uploadTabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(url)).id,
    origin,
  );
  await worker.evaluate(
    async (tabId) =>
      chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: () => {
          globalThis.__archiveFileReads = 0;
          const original = Blob.prototype.arrayBuffer;
          Blob.prototype.arrayBuffer = function (...args) {
            globalThis.__archiveFileReads++;
            return original.apply(this, args);
          };
        },
      }),
    uploadTabId,
  );
  await attach(upload.locator('#single'), {
    name: 'metadata-only.txt',
    buffer: Buffer.from('must not be read'),
  });
  await waitRecord('metadata-only.txt', 'logs');
  const reads = await worker.evaluate(
    async (tabId) =>
      (
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => globalThis.__archiveFileReads,
        })
      )[0].result,
    uploadTabId,
  );
  assert.equal(reads, 0);
  check('Logs-only capture performs zero Blob content reads');

  await request({ type: 'ui:settings', patch: { defaultMode: 'copies', paused: true } });
  const count = (await state()).records.length;
  await attach(upload.locator('#single'), {
    name: 'paused.txt',
    buffer: Buffer.from('do not save'),
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await state()).records.length, count);
  await request({
    type: 'ui:settings',
    patch: { paused: false, siteModes: { [origin]: 'disabled' } },
  });
  await attach(upload.frameLocator('#frame').locator('#embedded'), {
    name: 'excluded.txt',
    buffer: Buffer.from('do not save'),
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await state()).records.length, count);
  check('Pause and top-site exclusions stop capture, including embedded uploaders');
  await request({ type: 'ui:settings', patch: { siteModes: {}, maxFileMiB: 1 } });
  await attach(upload.locator('#single'), {
    name: 'oversize.bin',
    buffer: Buffer.alloc(1024 * 1024 + 1, 17),
  });
  const failed = await waitRecord('oversize.bin', 'failed');
  assert.match(failed.failure, /maximum file size/);
  check('Over-limit file remains visible with a clear failure reason');
  await request({ type: 'ui:settings', patch: { maxFileMiB: 50 } });

  await upload.evaluate(() => (document.title = '<img onerror=alert(1)> hostile page title'));
  await attach(upload.locator('#multiple'), [
    { name: 'zero.txt', buffer: Buffer.alloc(0) },
    { name: "report & 'notes'.txt", buffer: Buffer.from('unusual filename') },
  ]);
  await waitRecord('zero.txt');
  await waitRecord("report & 'notes'.txt");
  check('Multiple attachments, empty files, unusual filenames and hostile page titles');

  const large = Buffer.alloc(50 * 1024 * 1024, 91);
  await attach(upload.locator('#single'), { name: 'size-limit.bin', buffer: large });
  const largest = await waitRecord('size-limit.bin');
  assert.equal(largest.sha256, createHash('sha256').update(large).digest('hex'));
  assert.deepEqual(await downloadBytes(largest.id), large);
  check('The full 50 MiB file limit saves and recovers identical bytes');
  await request({ type: 'ui:settings', patch: { budgetMiB: 50 } });
  await attach(upload.locator('#single'), { name: 'no-space.txt', buffer: Buffer.from('no room') });
  const warningDeadline = Date.now() + 10000;
  while (!(await state()).captureWarning && Date.now() < warningDeadline)
    await new Promise((r) => setTimeout(r, 100));
  assert.ok((await state()).captureWarning);
  assert.equal((await state()).records.find((r) => r.id === largest.id).status, 'saved');
  await request({ type: 'ui:dismiss-warning' });
  assert.equal((await state()).captureWarning, undefined);
  await request({ type: 'ui:settings', patch: { budgetMiB: 500 } });
  check('A full archive warns visibly and preserves existing copies');

  await request({ type: 'ui:keep', id: saved.id, kept: true });
  assert.equal((await state()).records.find((r) => r.id === saved.id).expiresAt, null);
  await ui.reload();
  await ui.getByRole('button', { name: 'Download assignment.txt' }).first().waitFor();
  await ui.screenshot({ path: path.join(screenshotDir, 'history.png'), fullPage: true });
  await ui.setViewportSize({ width: 390, height: 844 });
  await ui.screenshot({ path: path.join(screenshotDir, 'history-mobile.png'), fullPage: true });
  assert.equal(
    await ui.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  await ui.setViewportSize({ width: 1440, height: 1000 });
  const downloadPromise = ui.waitForEvent('download');
  await ui.getByRole('button', { name: 'Download assignment.txt' }).first().click();
  const downloaded = await downloadPromise;
  const downloadedBytes = await readFile(await downloaded.path());
  assert.ok(downloadedBytes.equals(Buffer.from('replacement')) || downloadedBytes.equals(original));
  check('Real UI download, Keep control state and narrow-screen layout');

  await ui.goto(`chrome-extension://${extensionId}/options.html`);
  await ui.getByRole('button', { name: 'Save settings', exact: true }).waitFor();
  const initialSettings = (await state()).settings;
  await ui.locator('#retention').selectOption('7');
  await ui.locator('#file-limit').fill('12');
  await ui.locator('#budget').fill('600');
  await ui.locator('#default-mode').selectOption('logs');
  await ui.getByText('Recording preference saved.', { exact: true }).waitFor();
  assert.equal((await state()).settings.defaultMode, 'logs');
  assert.equal((await state()).settings.maxFileMiB, initialSettings.maxFileMiB);
  assert.equal(await ui.locator('#file-limit').inputValue(), '12');
  await ui.locator('#paused').click();
  await ui.waitForFunction(
    () => document.querySelector('#paused').checked && !document.querySelector('#paused').disabled,
  );
  assert.equal((await state()).settings.paused, true);
  assert.equal(await ui.locator('#retention').inputValue(), '7');
  await ui.getByRole('button', { name: 'Save settings', exact: true }).click();
  await ui.getByText('Settings saved.', { exact: true }).waitFor();
  const updatedSettings = (await state()).settings;
  assert.equal(updatedSettings.retentionDays, 7);
  assert.equal(updatedSettings.maxFileMiB, 12);
  assert.equal(updatedSettings.budgetMiB, 600);
  assert.equal(updatedSettings.defaultMode, 'logs');
  assert.equal(updatedSettings.paused, true);
  await ui.reload();
  assert.equal(await ui.locator('#default-mode').inputValue(), 'logs');
  assert.equal(await ui.locator('#paused').isChecked(), true);
  await request({ type: 'ui:settings', patch: initialSettings });
  await ui.reload();
  check('Recording preferences autosave while storage drafts wait for Save settings');
  await ui.screenshot({ path: path.join(screenshotDir, 'settings.png'), fullPage: true });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 720 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await upload.bringToFront();
  await popup.reload();
  await popup.locator('#current-site-mode').selectOption('logs');
  await popup.waitForFunction(() => !document.querySelector('#current-site-mode').disabled);
  assert.equal((await state()).settings.siteModes[origin], 'logs');
  await attach(upload.locator('#single'), {
    name: 'popup-mode.txt',
    buffer: Buffer.from('logs only'),
  });
  await waitRecord('popup-mode.txt', 'logs');
  await popup.reload();
  assert.equal(await popup.locator('#current-site-mode').inputValue(), 'logs');
  await popup.locator('#current-site-mode').selectOption('copies');
  await popup.waitForFunction(() => !document.querySelector('#current-site-mode').disabled);
  assert.equal((await state()).settings.siteModes[origin], 'copies');
  check('Popup site mode persists immediately and affects the next file selection');
  await popup.waitForTimeout(500);
  await popup.screenshot({ path: path.join(screenshotDir, 'popup.png'), fullPage: true });
  await ui.goto(`chrome-extension://${extensionId}/history.html`);
  await context.close();
  worker = await launch();
  assert.deepEqual(await downloadBytes(saved.id), original);
  check('Browser restart preserves the encryption key and independent saved bytes');

  const current = (await state()).records;
  await request({ type: 'ui:delete', ids: [saved.id] });
  assert.equal((await state()).records.length, current.length - 1);
  const rejected = await ui.evaluate(
    (id) => chrome.runtime.sendMessage({ type: 'ui:download', id }),
    saved.id,
  );
  assert.equal(rejected.ok, false);
  const oldKeyCipher = await worker.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('upload-history-archive');
      r.onsuccess = () => resolve(r.result);
    });
    const key = await new Promise((resolve) => {
      const r = db.transaction('keys').objectStore('keys').get('archive');
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode('key rotation test'),
      ),
    );
    return { iv: Array.from(iv), data: Array.from(cipher) };
  });
  await request({ type: 'ui:clear' });
  assert.equal((await state()).records.length, 0);
  const raw = await worker.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('upload-history-archive');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const counts = {};
    for (const name of ['records', 'chunks', 'keys'])
      counts[name] = await new Promise((resolve) => {
        const r = db.transaction(name).objectStore(name).count();
        r.onsuccess = () => resolve(r.result);
      });
    db.close();
    return counts;
  });
  assert.deepEqual(raw, { records: 0, chunks: 0, keys: 1 }); // Reading the empty archive creates a fresh key.
  const keyChanged = await worker.evaluate(async (cipher) => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('upload-history-archive');
      r.onsuccess = () => resolve(r.result);
    });
    const key = await new Promise((resolve) => {
      const r = db.transaction('keys').objectStore('keys').get('archive');
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    try {
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(cipher.iv) },
        key,
        new Uint8Array(cipher.data),
      );
      return false;
    } catch {
      return true;
    }
  }, oldKeyCipher);
  assert.equal(keyChanged, true);
  check('Delete and Clear all remove records and chunks, and rotate the archive key');
  assert.deepEqual(errors, []);
  check('No browser page errors');
  await writeFile(
    path.join(artifacts, 'browser-test-results.json'),
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        errors,
        testRun: run,
        permissionPrompt:
          'Native optional-host prompt pregranted in test manifest; manual verification required.',
      },
      null,
      2,
    ),
  );
  console.log(`Verified ${checks.length} browser scenarios. Screenshots: ${screenshotDir}`);
} finally {
  if (context) await context.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
