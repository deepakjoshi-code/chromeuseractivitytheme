/**
 * Visual harness: serves src/ over localhost, stubs the chrome.* surface with
 * state produced by the REAL engine, and screenshots each page in Chromium.
 *
 * This is not a unit test; it is the "does it actually look like anything"
 * check that a headless assertion suite cannot give you.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createChromeMock } from '../helpers/chrome-mock.js';
import * as engine from '../../src/core/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');
const OUT = process.env.OUT_DIR || join(ROOT, 'screenshots');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

/** Produce genuine engine state for a given browsing session. */
async function stateFor(steps, settings = {}) {
  const ns = createChromeMock();
  if (Object.keys(settings).length) {
    const store = await import('../../src/core/storage.js');
    await store.updateSettings(ns, settings);
  }
  let t = 0;
  for (const step of steps) {
    t += 9000;
    await engine.handleSignal(ns, step, t);
  }
  const state = await engine.getFullState(ns, t + 1000);
  const store = await import('../../src/core/storage.js');
  return { state, log: await store.getLog(ns) };
}

const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(SRC, path === '/' ? '/newtab/newtab.html' : path);
    if (!file.startsWith(SRC)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // Chromium's own telemetry/safe-browsing traffic is not the extension's, and
  // this environment has no egress for it. Turn it off so the run is quiet.
  args: [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--no-first-run',
    '--no-default-browser-check'
  ]
});
const failures = [];

async function shoot(name, page, url, { width = 1280, height = 800, dark = false, fullPage = false } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = (m.location() && m.location().url) || '';
    if (from.endsWith('/favicon.ico')) return;   // no favicon on an extension page
    errors.push(`${m.text()} @ ${from}`);
  });
  // The browser asks for /favicon.ico on every navigation; an extension page has none.
  page.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.push(`request failed: ${r.url()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) {
      errors.push(`HTTP ${r.status()} for ${r.url()}`);
    }
  });

  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });

  if (errors.length) failures.push(`${name}: ${errors.join(' | ')}`);
  return errors;
}

/** Build the chrome.* stub that the page shells talk to. */
function stub({ state, log }) {
  return ({ state, log }) => {
    const listeners = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        openOptionsPage() {},
        sendMessage(message, callback) {
          const reply = { ok: true, state, log, settings: state.settings, payload: {} };
          if (typeof callback === 'function') setTimeout(() => callback(reply), 0);
          return Promise.resolve(reply);
        },
        onMessage: { addListener: (fn) => listeners.push(fn) }
      },
      tabs: {
        query: async () => [{ id: 1, url: 'https://example.com/', title: 'Example' }],
        sendMessage: async () => {}
      },
      permissions: { contains: async () => false, request: async () => false },
      storage: { local: { get: async () => ({}), set: async () => {} } }
    };
  };
}

const sessions = {
  tropical: [
    { url: 'https://www.google.com/search?q=hawaii+vacation+packages', title: 'hawaii vacation packages - Google Search' },
    { url: 'https://www.google.com/search?q=maui+snorkeling+tours', title: 'maui snorkeling tours - Google Search' },
    { url: 'https://www.gohawaii.com/islands/maui', title: 'Maui travel guide — beach resort' }
  ],
  celebration: [
    { url: 'https://www.google.com/search?q=birthday+cake+ideas+for+6+year+old', title: 'birthday cake ideas - Google Search' },
    { url: 'https://www.partycity.com/balloons', title: 'Balloons, confetti & party favors' },
    { url: 'https://www.google.com/search?q=kids+party+decorations+pinata', title: 'kids party decorations pinata' }
  ],
  coding: [
    { url: 'https://github.com/acme/api/pull/88', title: 'Add retry budget · Pull Request #88' },
    { url: 'https://stackoverflow.com/questions/1/async-await', title: 'javascript async await ordering' },
    { url: 'https://kubernetes.io/docs/concepts/ingress/', title: 'Ingress | Kubernetes' }
  ],
  vegas: [
    { url: 'https://www.google.com/search?q=las+vegas+shows+casino', title: 'las vegas shows casino - Google Search' },
    { url: 'https://www.vegas.com/shows/', title: 'Las Vegas shows on the strip' },
    { url: 'https://www.google.com/search?q=vegas+hotels+bellagio', title: 'vegas hotels bellagio' }
  ]
};

for (const [name, steps] of Object.entries(sessions)) {
  const data = await stateFor(steps);
  console.log(`${name.padEnd(12)} -> ${data.state.active.category} (${(data.state.active.confidence * 100).toFixed(0)}%) — ${data.state.explanation}`);

  const context = await browser.newContext();
  await context.addInitScript(stub(data), data);
  const page = await context.newPage();
  await shoot(`newtab-${name}`, page, `${base}/newtab/newtab.html`);
  if (name === 'coding') {
    const darkPage = await context.newPage();
    await shoot('newtab-coding-dark', darkPage, `${base}/newtab/newtab.html`, { dark: true });
  }
  await context.close();
}

// Popup and options, using the tropical session.
{
  const data = await stateFor(sessions.tropical);
  const context = await browser.newContext();
  await context.addInitScript(stub(data), data);
  const page = await context.newPage();
  await shoot('popup', page, `${base}/popup/popup.html`, { width: 340, height: 520 });
  await context.close();
}
{
  const data = await stateFor(sessions.celebration, { blocklist: ['intranet.corp.example.com'], mutedCategories: ['vegas'] });
  const context = await browser.newContext();
  await context.addInitScript(stub(data), data);
  const page = await context.newPage();
  await shoot('options', page, `${base}/options/options.html`, { width: 900, height: 1000, fullPage: true });
  const darkPage = await context.newPage();
  await shoot('options-dark', darkPage, `${base}/options/options.html`, { width: 900, height: 1000, dark: true, fullPage: true });
  await context.close();
}

await browser.close();
server.close();

if (failures.length) {
  console.error('\nPAGE ERRORS:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('\nAll pages rendered with no console or page errors.');
