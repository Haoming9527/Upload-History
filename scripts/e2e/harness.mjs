import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function createHarness() {
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
    // Let document_start discovery finish before the page creates its roots.
    // This reproduces a slow external script on CI instead of relying on timing.
    if (req.url === '/fixture.js') setTimeout(() => res.end(fixtureJS), 200);
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

  return {
    run,
    artifacts,
    origin,
    altOrigin,
    screenshotDir,
    errors,
    checks,
    get context() {
      return context;
    },
    get ui() {
      return ui;
    },
    get extensionId() {
      return extensionId;
    },
    launch,
    request,
    state,
    attach,
    waitRecord,
    check,
    downloadBytes,
    async close() {
      if (context) await context.close().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
