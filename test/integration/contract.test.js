/**
 * Contract tests: manifest validity, permission minimalism, the zero-network
 * guarantee, and the data-only extensibility invariant.
 *
 * These are the checks that stop a well-meaning future change from quietly
 * breaking a promise made in the PRD.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORY_KEYS, NEUTRAL } from '../../src/core/taxonomy.js';
import { THEMES, THEME_KEYS } from '../../src/core/themes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));

function walk(dir, extensions) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.includes(extname(full))) out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------- manifest */

test('the manifest is MV3 and declares the surfaces the PRD requires', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, 'module');
  assert.ok(manifest.chrome_url_overrides.newtab, 'the New Tab page is the hero surface');
  assert.ok(manifest.action.default_popup);
  assert.ok(manifest.options_page);
});

test('Aura is disabled in Incognito and cannot be enabled there (PRD P3)', () => {
  assert.equal(manifest.incognito, 'not_allowed');
});

test('install-time permissions are minimal and contain no host access (gap G-07)', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage', 'tabs']);
  assert.deepEqual(manifest.host_permissions, [],
    'host access must be optional, requested only when ambient is switched on');
  assert.ok(manifest.optional_host_permissions.length > 0);
});

test('the manifest requests none of the invasive permissions we promised to avoid', () => {
  const forbidden = ['history', 'bookmarks', 'cookies', 'webRequest', 'webNavigation',
                     'downloads', 'management', 'privacy', 'topSites', 'browsingData'];
  for (const permission of forbidden) {
    assert.ok(!manifest.permissions.includes(permission), `must not request "${permission}"`);
  }
});

test('the CSP forbids all network connections (PRD P1, layer 1)', () => {
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /connect-src 'none'/, 'connect-src must be none');
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.ok(!/unsafe-eval/.test(csp));
  assert.ok(!/script-src[^;]*https?:/.test(csp), 'no remote script origins');
});

test('every file the manifest references exists', () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.chrome_url_overrides.newtab,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ];
  for (const relative of referenced) {
    assert.ok(existsSync(join(SRC, relative)), `missing: ${relative}`);
  }
});

test('the dynamically registered content script and its stylesheet exist', () => {
  // Registered at runtime rather than declared, so the manifest cannot vouch for it.
  assert.ok(existsSync(join(SRC, 'content/ambient.js')));
  assert.ok(existsSync(join(SRC, 'content/ambient.css')));
});

/* -------------------------------------------------------- zero network */

test('no source file performs a network call (PRD P1, layer 2)', () => {
  const patterns = [
    [/\bfetch\s*\(/, 'fetch()'],
    [/new\s+XMLHttpRequest/, 'XMLHttpRequest'],
    [/new\s+WebSocket/, 'WebSocket'],
    [/new\s+EventSource/, 'EventSource'],
    [/\bsendBeacon\s*\(/, 'navigator.sendBeacon()'],
    [/\bimport\s*\(\s*['"`]https?:/, 'dynamic import from a URL'],
    [/importScripts\s*\(/, 'importScripts()']
  ];
  const violations = [];
  for (const file of walk(SRC, ['.js'])) {
    const source = readFileSync(file, 'utf8');
    for (const [pattern, name] of patterns) {
      if (pattern.test(source)) violations.push(`${file.replace(ROOT, '.')}: ${name}`);
    }
  }
  assert.deepEqual(violations, [], `network usage found:\n${violations.join('\n')}`);
});

test('the only external URL in the source is the search-box navigation', () => {
  const allowed = new Set([
    'https://www.google.com/search?q=',
    // Beta feedback link in the options page. A navigation the user clicks,
    // never a request the extension makes.
    'https://github.com/deepakjoshi-code/chromeuseractivitytheme/issues'
  ]);
  const found = [];
  for (const file of walk(SRC, ['.js', '.css', '.html'])) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
      const url = match[0];
      if (allowed.has(url)) continue;
      if (url.startsWith('http://*/') || url.startsWith('https://*/')) continue;  // permission patterns
      if (url.startsWith('http://www.w3.org/')) continue;                          // SVG namespace
      found.push(`${file.replace(ROOT, '.')}: ${url}`);
    }
  }
  assert.deepEqual(found, [], `unexpected external URLs:\n${found.join('\n')}`);
});

test('the service worker installs the runtime network guard (PRD P1, layer 3)', () => {
  const source = readFileSync(join(SRC, 'background/service-worker.js'), 'utf8');
  assert.match(source, /AuraNetworkBlocked/);
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
    assert.ok(source.includes(`'${name}'`), `the guard must cover ${name}`);
  }
});

test('no page loads a remote script or stylesheet', () => {
  for (const file of walk(SRC, ['.html'])) {
    const html = readFileSync(file, 'utf8');
    assert.ok(!/<script[^>]+src=["']https?:/i.test(html), `${file}: remote script`);
    assert.ok(!/<link[^>]+href=["']https?:/i.test(html), `${file}: remote stylesheet`);
  }
});

test('no page uses an inline event handler or inline script, per the CSP', () => {
  for (const file of walk(SRC, ['.html'])) {
    const html = readFileSync(file, 'utf8');
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), `${file}: inline handler`);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html),
      `${file}: inline script body`);
  }
});

/* ------------------------------------------- extensibility (PRD §8, G-11) */

test('taxonomy and themes stay in one-to-one correspondence', () => {
  for (const key of CATEGORY_KEYS) {
    assert.ok(THEMES[key], `taxonomy category "${key}" has no theme`);
  }
  const extra = THEME_KEYS.filter((k) => k !== NEUTRAL && !CATEGORY_KEYS.includes(k));
  assert.deepEqual(extra, [], 'every theme needs a taxonomy entry to be reachable');
  assert.equal(THEME_KEYS.length, CATEGORY_KEYS.length + 1, 'themes = categories + neutral');
});

test('adding a theme is a data-only change: the engine hard-codes no category', () => {
  const dataFiles = ['taxonomy.js', 'themes.js'];
  const offenders = [];
  for (const file of walk(join(SRC, 'core'), ['.js'])) {
    if (dataFiles.some((name) => file.endsWith(name))) continue;
    const source = readFileSync(file, 'utf8');
    for (const key of CATEGORY_KEYS) {
      if (new RegExp(`['"\`]${key}['"\`]`).test(source)) {
        offenders.push(`${file.replace(ROOT, '.')} hard-codes "${key}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every category carries the data the classifier needs', () => {
  for (const key of CATEGORY_KEYS) {
    const theme = THEMES[key];
    assert.ok(theme.label.length > 0, `${key} needs a label`);
  }
});

/* -------------------------------------------------------------- versions */

test('the manifest version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version);
});
