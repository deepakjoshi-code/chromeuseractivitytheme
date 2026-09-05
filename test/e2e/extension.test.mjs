/**
 * End-to-end test against a REAL Chrome with the extension loaded unpacked.
 *
 * This is the layer docs/TESTING.md listed as "not covered": chrome.tabs event
 * wiring, service-worker wake, the New Tab override, badge painting, and the
 * message protocol between the worker and the page shells. None of it is
 * reachable from node:test, and all of it is load-bearing for a release.
 *
 * Trick that makes it possible offline: --host-resolver-rules maps every
 * hostname to a local server, so the extension sees genuine hosts like
 * `google.com` and `github.com` while no packet leaves the machine.
 *
 * The local server speaks TLS with a throwaway self-signed certificate, and
 * Chrome is launched with --ignore-certificate-errors. This is not optional:
 * google.com, github.com and etsy.com are all on Chrome's HSTS preload list, so
 * a plain http:// navigation to them is force-upgraded to https:// before it
 * ever reaches the network stack. Serving HTTP would fail with
 * ERR_SSL_PROTOCOL_ERROR on exactly the hosts this suite needs most.
 *
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;

/** A throwaway certificate for the local stand-in server. Never leaves the box. */
function selfSignedCert() {
  const dir = mkdtempSync(join(tmpdir(), 'aura-cert-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '1', '-subj', '/CN=localhost'
  ], { stdio: 'ignore' });
  return { key: readFileSync(keyPath), cert: readFileSync(certPath), dir };
}

/** Serves a plausible page for any host, with a title driven by the path/query. */
function startSite() {
  const tls = selfSignedCert();
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'x.test'}`);
    const title = url.searchParams.get('title')
      || url.searchParams.get('q')
      || url.searchParams.get('search_query')
      || url.pathname.replace(/[/_-]+/g, ' ').trim()
      || 'Untitled';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
      <body><h1>${title}</h1></body></html>`);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port, certDir: tls.dir }));
  });
}

let site, ctx, profile, extensionId;

test.before(async () => {
  site = await startSite();
  profile = mkdtempSync(join(tmpdir(), 'aura-e2e-'));

  /*
   * Playwright's default headless browser is the "headless shell", which cannot
   * load extensions — the service worker never registers and the extension id
   * is null. `channel: 'chromium'` selects the full build, which can.
   * CHROMIUM_PATH overrides for environments shipping their own binary; the two
   * options are mutually exclusive, so only one is ever passed.
   */
  const binary = CHROMIUM ? { executablePath: CHROMIUM } : { channel: 'chromium' };

  ctx = await chromium.launchPersistentContext(profile, {
    ...binary,
    headless: true,
    args: [
      `--disable-extensions-except=${SRC}`,
      `--load-extension=${SRC}`,
      // Every hostname resolves to the local server: real hosts, zero egress.
      `--host-resolver-rules=MAP * 127.0.0.1:${site.port}, EXCLUDE localhost`,
      '--ignore-certificate-errors',
      // Chrome inherits http(s)_proxy from the environment. Left alone it would
      // CONNECT through that proxy instead of honouring the resolver rules
      // above — which both breaks the suite and attempts real egress. Neither
      // is acceptable in a test for an extension that promises zero network.
      '--no-proxy-server',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  let worker = ctx.serviceWorkers()[0];
  if (!worker) {
    worker = await ctx.waitForEvent('serviceworker', { timeout: 30000 }).catch(() => null);
  }
  if (!worker) {
    throw new Error(
      'No service worker registered — the extension did not load. Most likely a ' +
      'Chromium build that cannot load extensions (the headless shell).');
  }
  extensionId = new URL(worker.url()).host;
});

test.after(async () => {
  if (ctx) await ctx.close();
  if (site) {
    site.server.close();
    rmSync(site.certDir, { recursive: true, force: true });
  }
  if (profile) rmSync(profile, { recursive: true, force: true });
});

const ext = (path) => `chrome-extension://${extensionId}/${path}`;

/** Read the extension's own storage from inside an extension page. */
async function readStorage(key) {
  const page = await ctx.newPage();
  await page.goto(ext('options/options.html'));
  const value = await page.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k]), key);
  await page.close();
  return value;
}

/** Visit a page as the user would, and give the worker time to react. */
async function visit(page, url, { settle = 700 } = {}) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(settle);
}

/* ------------------------------------------------------------- the basics */

test('the extension loads and its service worker registers', async () => {
  assert.match(extensionId, /^[a-p]{32}$/, 'expected a real extension id');
  const workers = ctx.serviceWorkers().map((w) => w.url());
  assert.ok(workers.some((u) => u.endsWith('/background/service-worker.js')));
});

test('the New Tab override serves our page, not Chrome\'s', async () => {
  const page = await ctx.newPage();
  await page.goto(ext('newtab/newtab.html'));
  await page.waitForTimeout(400);
  assert.equal(await page.title(), 'New Tab');
  assert.ok(await page.isVisible('#clock'));
  assert.ok(await page.isVisible('#search-input'));
  await page.close();
});

test('the popup renders and talks to the service worker', async () => {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ext('popup/popup.html'));
  await page.waitForTimeout(600);

  // 16 swatches means the gallery was built from the real theme data.
  assert.equal(await page.locator('#gallery .swatch').count(), 16);
  // A reason line means GET_STATE round-tripped through the worker.
  assert.notEqual((await page.textContent('#theme-reason')).trim(), 'Reading your activity…');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the options page renders with no console errors', async () => {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(ext('options/options.html'));
  await page.waitForTimeout(600);
  assert.ok(await page.isVisible('#intensity'));
  assert.equal(await page.locator('#muted label').count(), 15, 'one toggle per category');
  assert.deepEqual(errors, []);
  await page.close();
});

/* ------------------------------------------- the pipeline, through Chrome */

test('real browsing drives a real theme change', async () => {
  const page = await ctx.newPage();
  // Genuinely different pages: the engine de-duplicates the same page in the
  // same tab, so hammering one URL is (correctly) a single signal.
  for (const q of ['hawaii+vacation+packages', 'maui+snorkeling+tours',
                   'best+beach+resort+maui', 'kauai+travel+guide']) {
    await visit(page, `https://www.google.com/search?q=${q}`);
  }
  const active = await readStorage('activeTheme');
  assert.equal(active.category, 'tropical', `got ${JSON.stringify(active)}`);
  assert.ok(active.confidence > 0.35);
  await page.close();
});

test('the New Tab page paints the detected theme', async () => {
  const page = await ctx.newPage();
  await page.goto(ext('newtab/newtab.html'));
  await page.waitForTimeout(700);
  assert.equal((await page.textContent('#theme-label')).trim(), 'Tropical');
  assert.match(await page.textContent('#theme-reason'), /because/);

  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--aura-bg').trim());
  assert.match(bg, /^#[0-9a-f]{6}$/i);
  assert.notEqual(bg, '#f7f7f8', 'the neutral fallback should have been replaced');
  await page.close();
});

test('a switch to engineering work re-themes the browser within ~20s', async () => {
  const page = await ctx.newPage();
  const started = Date.now();
  const pages = [
    'https://github.com/acme/api/pull/1?title=Fix+merge+conflict+Pull+Request',
    'https://stackoverflow.com/q/1?title=javascript+async+await+ordering',
    'https://github.com/acme/api/pull/2?title=Add+unit+test+npm+install',
    'https://kubernetes.io/docs/ingress?title=Ingress+Kubernetes+docs',
    'https://github.com/acme/api/actions?title=GitHub+Actions+ci+pipeline',
    'https://developer.mozilla.org/regex?title=regex+async+await+MDN'
  ];
  // Spaced like real reading, which is also what lets the previous context go
  // stale — the mechanism that breaks a tie between two saturated contexts.
  for (const url of pages) await visit(page, url, { settle: 3000 });

  const active = await readStorage('activeTheme');
  assert.equal(active.category, 'coding', `got ${JSON.stringify(active)}`);
  assert.ok(Date.now() - started < 30000, 'a decisive switch must not take forever');
  await page.close();
});

/* --------------------------------------------------- the privacy promises */

test('a sensitive page leaves the theme untouched and logs nothing', async () => {
  const before = await readStorage('activeTheme');
  const logBefore = (await readStorage('log')) || [];

  const page = await ctx.newPage();
  for (const q of ['cancer+diagnosis+symptoms', 'chemotherapy+side+effects', 'oncology+second+opinion']) {
    await visit(page, `https://www.google.com/search?q=${q}`);
  }
  await page.close();

  const after = await readStorage('activeTheme');
  assert.equal(after.category, before.category, 'the theme must not react at all');

  const logAfter = (await readStorage('log')) || [];
  assert.equal(logAfter.length, logBefore.length, 'nothing may be logged');
  assert.ok(!JSON.stringify(logAfter).match(/cancer|diagnosis|symptom/i));
});

test('a banking host is ignored even though it is an ordinary web page', async () => {
  const before = await readStorage('activeTheme');
  const page = await ctx.newPage();
  await visit(page, 'https://www.chase.com/accounts?title=Birthday+cake+party+balloons');
  await page.close();
  assert.equal((await readStorage('activeTheme')).category, before.category);
});

test('the stored activity log never contains a URL or a page title', async () => {
  const log = (await readStorage('log')) || [];
  assert.ok(log.length > 0, 'expected some activity by now');
  const raw = JSON.stringify(log);
  assert.ok(!raw.includes('http'), 'no URLs');
  assert.ok(!raw.includes('Pull Request'), 'no titles');
  for (const entry of log) {
    assert.deepEqual(Object.keys(entry).sort(), ['at', 'category', 'confidence', 'host', 'terms']);
  }
});

test('no host permission is held until the user asks for ambient', async () => {
  const page = await ctx.newPage();
  await page.goto(ext('options/options.html'));
  const granted = await page.evaluate(() =>
    chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }));
  assert.equal(granted, false, 'Aura must hold no host access at install');
  await page.close();
});

test('no content script is injected into pages by default', async () => {
  const page = await ctx.newPage();
  await visit(page, 'https://example.com/?title=Hello');
  assert.equal(await page.locator('#aura-ambient-root').count(), 0,
    'the ambient overlay is opt-in and must be absent');
  await page.close();
});

/* ------------------------------------------------------- Studio controls */

test('picking a theme in the popup applies it immediately', async () => {
  const page = await ctx.newPage();
  await page.goto(ext('popup/popup.html'));
  await page.waitForTimeout(500);
  await page.click('#gallery .swatch[data-key="vegas"]');
  await page.waitForTimeout(500);
  assert.equal((await page.textContent('#theme-label')).trim(), 'Neon Nights');
  await page.close();

  assert.equal((await readStorage('activeTheme')).category, 'vegas');
});

test('pinning holds the theme against contrary browsing', async () => {
  const popup = await ctx.newPage();
  await popup.goto(ext('popup/popup.html'));
  await popup.waitForTimeout(500);
  await popup.click('#btn-pin');
  await popup.waitForTimeout(200);
  await popup.click('#pin-durations button[data-minutes="60"]');
  await popup.waitForTimeout(500);
  await popup.close();

  assert.equal((await readStorage('pin')).category, 'vegas');

  const page = await ctx.newPage();
  for (const q of ['birthday+cake+ideas', 'kids+party+games', 'party+favors+balloons', 'pinata+birthday']) {
    await visit(page, `https://www.google.com/search?q=${q}`);
  }
  await page.close();

  assert.equal((await readStorage('activeTheme')).category, 'vegas', 'a pin outranks detection');
});

test('settings written in the options page reach the worker', async () => {
  const page = await ctx.newPage();
  await page.goto(ext('options/options.html'));
  await page.waitForTimeout(500);
  await page.click('#intensity button[data-value="subtle"]');
  await page.waitForTimeout(500);
  await page.close();

  assert.equal((await readStorage('settings')).intensity, 'subtle');
});

test('erase all really empties storage', async () => {
  const page = await ctx.newPage();
  await page.goto(ext('options/options.html'));
  await page.waitForTimeout(500);
  await page.click('#erase');           // arms
  await page.waitForTimeout(150);
  await page.click('#erase');           // confirms
  await page.waitForTimeout(1200);
  await page.close();

  assert.deepEqual((await readStorage('log')) || [], []);
  // After a clear the key is absent entirely; the storage layer's reader is what
  // normalises that to null, so assert on absence rather than on a exact value.
  assert.ok(!(await readStorage('pin')), 'no pin may survive an erase');
  assert.deepEqual((await readStorage('rejections')) || {}, {});
  assert.equal((await readStorage('settings')).intensity, 'balanced');
});

test('switching back to an already-open tab does not re-log it', async () => {
  const a = await ctx.newPage();
  await visit(a, 'https://www.etsy.com/search?q=handmade+birthday+card&title=handmade+birthday+card');
  const b = await ctx.newPage();
  await visit(b, 'https://example.com/?title=Something+else');

  const before = ((await readStorage('log')) || []).length;
  for (let i = 0; i < 4; i++) {           // alt-tab back and forth
    await a.bringToFront();
    await a.waitForTimeout(350);
    await b.bringToFront();
    await b.waitForTimeout(350);
  }
  const after = ((await readStorage('log')) || []).length;
  await a.close();
  await b.close();

  assert.equal(after, before,
    'tab switching is not new activity and must not inflate the log');
});
