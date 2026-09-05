#!/usr/bin/env node
/**
 * verify-package.mjs — load the built .zip in real Chrome and smoke-test it.
 *
 * The e2e suite loads `src/`. This loads what actually ships: unzip the
 * artifact into a clean directory and drive it. It catches the class of bug
 * where a file exists in the working tree but never made it into the package.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/manifest.json'), 'utf8'));
const zip = join(ROOT, 'dist', `aura-${manifest.version}.zip`);

const unpacked = mkdtempSync(join(tmpdir(), 'aura-pkg-'));
execFileSync('unzip', ['-q', zip, '-d', unpacked]);
console.log(`\n  unpacked ${zip.replace(ROOT + '/', '')} → ${readdirSync(unpacked).length} top-level entries`);

/**
 * Chrome launch options for loading an unpacked extension.
 *
 * Playwright's default headless browser is the "headless shell", which cannot
 * load extensions at all — the service worker simply never registers, and the
 * extension id comes back null. Selecting `channel: 'chromium'` gets the full
 * Chromium build with the new headless mode, which can. CHROMIUM_PATH overrides
 * for environments that ship their own binary (the two options are mutually
 * exclusive, so only ever pass one).
 */
function extensionLaunchOptions(unpackedDir) {
  const binary = process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : { channel: 'chromium' };
  return {
    ...binary,
    headless: true,
    args: [
      `--disable-extensions-except=${unpackedDir}`,
      `--load-extension=${unpackedDir}`,
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  };
}

const profile = mkdtempSync(join(tmpdir(), 'aura-profile-'));
const ctx = await chromium.launchPersistentContext(profile, extensionLaunchOptions(unpacked));

const failures = [];
const ok = (condition, label) => {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) failures.push(label);
};

let worker = ctx.serviceWorkers()[0];
if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 30000 }).catch(() => null);
ok(Boolean(worker), 'service worker registers from the packaged build');

if (!worker) {
  console.error('\n  No service worker registered — the extension did not load.');
  console.error('  Most likely cause: a Chromium build that cannot load extensions');
  console.error('  (the headless shell). Every later check would fail as a cascade,');
  console.error('  so stopping here.\n');
  await ctx.close();
  process.exit(1);
}

const id = new URL(worker.url()).host;
const ext = (p) => `chrome-extension://${id}/${p}`;

for (const [label, path, probe] of [
  ['New Tab page loads', 'newtab/newtab.html', '#clock'],
  ['popup loads', 'popup/popup.html', '#gallery .swatch'],
  ['options page loads', 'options/options.html', '#intensity']
]) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = (m.location() && m.location().url) || '';
    if (!from.endsWith('/favicon.ico')) errors.push(m.text());
  });
  await page.goto(ext(path), { waitUntil: 'load' });
  await page.waitForTimeout(700);
  ok(await page.locator(probe).first().isVisible().catch(() => false), label);
  ok(errors.length === 0, `${label} — no console errors${errors.length ? `: ${errors[0]}` : ''}`);
  await page.close();
}

// The promises that must survive packaging.
const page = await ctx.newPage();
await page.goto(ext('options/options.html'));
const granted = await page.evaluate(() =>
  chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }));
ok(granted === false, 'no host permission held at install');

const shipped = await page.evaluate(() => chrome.runtime.getManifest());
ok(shipped.version === manifest.version, `packaged version is ${manifest.version}`);
ok(shipped.incognito === 'not_allowed', 'incognito disabled in the packaged manifest');
ok(/connect-src 'none'/.test(shipped.content_security_policy.extension_pages),
  "packaged CSP blocks network (connect-src 'none')");
await page.close();

await ctx.close();
rmSync(unpacked, { recursive: true, force: true });
rmSync(profile, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n  PACKAGE VERIFICATION FAILED (${failures.length})\n`);
  process.exit(1);
}
console.log('\n  Package verified: the artifact in dist/ loads and works in Chrome.\n');
