#!/usr/bin/env node
/**
 * store-assets.mjs — generate every image the Chrome Web Store listing needs.
 *
 * Store requirements this satisfies:
 *   screenshots  1280x800, at least one, up to five
 *   promo tile   440x280 (small promo tile)
 *   marquee      1400x560 (optional, but needed for featuring)
 *   icon         128x128 (already in src/assets/icons)
 *
 * Screenshots are produced from the REAL pages driven by the REAL engine, so
 * the listing cannot drift from what the product actually does.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createChromeMock } from '../test/helpers/chrome-mock.js';
import * as engine from '../src/core/engine.js';
import * as store from '../src/core/storage.js';
import { THEMES } from '../src/core/themes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'store', 'assets');
mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  try {
    const file = join(SRC, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(SRC)) return res.writeHead(403).end();
    // Read before writing the header, or a missing file sends headers twice.
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

/** Drive the real engine over a session and return the state the pages consume. */
async function stateFor(steps) {
  const ns = createChromeMock();
  let t = 0;
  for (const step of steps) { t += 9000; await engine.handleSignal(ns, { tabId: 1, ...step }, t); }
  return { state: await engine.getFullState(ns, t + 1000), log: await store.getLog(ns) };
}

const stub = ({ state, log }) => {
  globalThis.chrome = {
    runtime: {
      lastError: null, openOptionsPage() {},
      sendMessage(m, cb) {
        const r = { ok: true, state, log, settings: state.settings };
        if (cb) setTimeout(() => cb(r), 0);
        return Promise.resolve(r);
      },
      onMessage: { addListener() {} }
    },
    tabs: { query: async () => [{ id: 1, url: 'https://example.com/' }], sendMessage: async () => {} },
    permissions: { contains: async () => false, request: async () => false },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  };
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--disable-background-networking', '--no-first-run', '--force-device-scale-factor=1']
});

/** Screenshot a page as a PNG buffer at its natural size. */
async function shot(url, data, { width, height, dark = false }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(stub, data);
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const buffer = await page.screenshot();
  await ctx.close();
  return buffer;
}

/**
 * Compose a 1280x800 store screenshot: a caption, and the real UI shown at a
 * readable size on a background drawn from the theme itself.
 */
async function compose(name, { caption, sub, image, themeKey, dark = false, scale = 1, width = 1400, height = 560 }) {
  const palette = THEMES[themeKey][dark ? 'dark' : 'light'];
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await page.setContent(`
    <style>
      *{box-sizing:border-box;margin:0}
      body{width:${width}px;height:${height}px;display:flex;flex-direction:column;
           align-items:center;justify-content:center;gap:26px;overflow:hidden;
           font:400 16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
           color:${palette.text};background:${palette.bg};position:relative}
      .glow{position:absolute;inset:-12%;z-index:0;opacity:.85;
        background:
          radial-gradient(56% 52% at 16% 18%, ${palette.gradient[0]} 0%, transparent 66%),
          radial-gradient(50% 48% at 84% 26%, ${palette.gradient[1]} 0%, transparent 64%),
          radial-gradient(60% 58% at 50% 96%, ${palette.gradient[2]} 0%, transparent 68%)}
      .txt{position:relative;z-index:1;text-align:center;max-width:80%}
      h1{font-size:34px;font-weight:600;letter-spacing:-.02em;margin-bottom:8px}
      p{font-size:17px;color:${palette.textMuted}}
      .shot{position:relative;z-index:1;border-radius:12px;overflow:hidden;
            box-shadow:0 18px 50px rgba(0,0,0,.22),0 2px 8px rgba(0,0,0,.10)}
      .shot img{display:block;width:${Math.round(1 * scale)}px}
    </style>
    <div class="glow"></div>
    <div class="txt"><h1>${caption}</h1><p>${sub}</p></div>
    <div class="shot"><img src="data:image/png;base64,${image.toString('base64')}"></div>
  `);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await page.context().close();
  console.log(`  ${name}.png  ${width}x${height}`);
}

const SESSIONS = {
  tropical: [
    { url: 'https://www.google.com/search?q=hawaii+vacation+packages', title: 'hawaii vacation packages - Google Search' },
    { url: 'https://www.google.com/search?q=maui+snorkeling+tours', title: 'maui snorkeling tours - Google Search' },
    { url: 'https://www.gohawaii.com/islands/maui', title: 'Maui travel guide — beach resort' }
  ],
  celebration: [
    { url: 'https://www.google.com/search?q=birthday+cake+ideas', title: 'birthday cake ideas - Google Search' },
    { url: 'https://www.partycity.com/balloons', title: 'Balloons, confetti and party favors' },
    { url: 'https://www.google.com/search?q=kids+party+pinata', title: 'kids party pinata - Google Search' }
  ],
  coding: [
    { url: 'https://github.com/acme/api/pull/88', title: 'Add retry budget · Pull Request #88' },
    { url: 'https://stackoverflow.com/questions/1/async-await', title: 'javascript async await ordering' },
    { url: 'https://kubernetes.io/docs/ingress/', title: 'Ingress | Kubernetes' }
  ]
};

console.log('\nStore assets →', join('store', 'assets'));

/* --- screenshots: the New Tab surfaces, shown full-bleed at store size --- */

for (const [name, steps] of Object.entries(SESSIONS)) {
  const data = await stateFor(steps);
  const dark = name === 'coding';
  const buffer = await shot(`${base}/newtab/newtab.html`, data, { width: 1280, height: 800, dark });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(OUT, `screenshot-${name}.png`), buffer);
  console.log(`  screenshot-${name}.png  1280x800  (${data.state.active.category})`);
}

/* --- screenshots: the Studio surfaces, composed onto a themed backdrop --- */

{
  const data = await stateFor(SESSIONS.tropical);
  const popup = await shot(`${base}/popup/popup.html`, data, { width: 340, height: 640 });
  await compose('screenshot-popup', {
    caption: 'It tells you why',
    sub: 'Every theme comes with the reason it was chosen — and one click to reject it.',
    image: popup, themeKey: 'tropical', scale: 300, width: 1280, height: 800
  });
}
{
  const data = await stateFor(SESSIONS.celebration);
  const options = await shot(`${base}/options/options.html`, data, { width: 900, height: 900 });
  await compose('screenshot-privacy', {
    caption: 'On-device, and provably so',
    sub: 'No network requests. No history or bookmark access. Sensitive topics are never themed.',
    image: options, themeKey: 'neutral', scale: 640, width: 1280, height: 800
  });
}

/* ----------------------------- promo tiles ----------------------------- */

async function tile(name, width, height, { title, tagline, iconSize, titleSize }) {
  const icon = (await readFile(join(SRC, 'assets/icons/icon128.png'))).toString('base64');
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await page.setContent(`
    <style>
      *{box-sizing:border-box;margin:0}
      body{width:${width}px;height:${height}px;display:flex;align-items:center;
        justify-content:center;gap:${Math.round(width * 0.045)}px;overflow:hidden;position:relative;
        font:400 16px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
        background:#12161d;color:#eef1f6}
      .glow{position:absolute;inset:-20%;
        background:
          radial-gradient(42% 60% at 14% 24%, #1b6f7d 0%, transparent 62%),
          radial-gradient(40% 58% at 82% 20%, #7a3f74 0%, transparent 62%),
          radial-gradient(52% 62% at 56% 104%, #b0682f 0%, transparent 66%);
        opacity:.85}
      .row{position:relative;display:flex;align-items:center;gap:${Math.round(width * 0.045)}px}
      img{width:${iconSize}px;height:${iconSize}px;border-radius:${Math.round(iconSize * 0.24)}px;
          box-shadow:0 8px 26px rgba(0,0,0,.4)}
      h1{font-size:${titleSize}px;font-weight:600;letter-spacing:-.02em}
      p{font-size:${Math.round(titleSize * 0.42)}px;color:#b9c2d0;margin-top:${Math.round(titleSize * 0.13)}px}
    </style>
    <div class="glow"></div>
    <div class="row">
      <img src="data:image/png;base64,${icon}">
      <div><h1>${title}</h1><p>${tagline}</p></div>
    </div>
  `);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await page.context().close();
  console.log(`  ${name}.png  ${width}x${height}`);
}

await tile('promo-small', 440, 280, { title: 'Aura', tagline: 'Your browser, in the mood you’re in', iconSize: 76, titleSize: 40 });
await tile('promo-marquee', 1400, 560, { title: 'Aura', tagline: 'Your browser, in the mood you’re in', iconSize: 190, titleSize: 96 });

await browser.close();
server.close();
console.log('');
