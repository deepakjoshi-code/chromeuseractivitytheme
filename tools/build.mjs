#!/usr/bin/env node
/**
 * build.mjs — produce the Chrome Web Store upload package.
 *
 * There is no bundler and no transpile step: `src/` is already the extension.
 * This script's job is therefore verification and zipping, in that order. It
 * refuses to produce a package that would fail review or ship a dev file.
 *
 * Usage: npm run build
 */
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const problems = [];
const notes = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

/* ------------------------------------------------------------ inventory */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(SRC).map((f) => relative(SRC, f)).sort();

/* ---------------------------------------------------------- validation */

check(manifest.manifest_version === 3, 'manifest_version must be 3');
check(manifest.version === pkg.version,
  `manifest version ${manifest.version} != package.json ${pkg.version}`);
check(/^\d+(\.\d+){0,3}$/.test(manifest.version),
  `"${manifest.version}" is not a valid Chrome version (digits and dots only)`);
check(manifest.incognito === 'not_allowed', 'incognito must be not_allowed');
check(Array.isArray(manifest.host_permissions) && manifest.host_permissions.length === 0,
  'host_permissions must be empty at install');
check(/connect-src 'none'/.test(manifest.content_security_policy?.extension_pages || ''),
  "CSP must contain connect-src 'none'");

const referenced = [
  manifest.background?.service_worker,
  manifest.chrome_url_overrides?.newtab,
  manifest.action?.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {})
].filter(Boolean);
for (const rel of referenced) {
  check(existsSync(join(SRC, rel)), `manifest references a missing file: ${rel}`);
}
// Registered at runtime, so the manifest cannot vouch for these.
for (const rel of ['content/ambient.js', 'content/ambient.css']) {
  check(existsSync(join(SRC, rel)), `missing runtime-registered file: ${rel}`);
}

// Nothing that should never ship.
const FORBIDDEN = [/(^|\/)\./, /\.map$/, /\.test\.js$/, /(^|\/)node_modules\//, /~$/, /\.orig$/, /\.DS_Store$/];
for (const file of files) {
  for (const pattern of FORBIDDEN) {
    check(!pattern.test(file), `file must not be packaged: ${file}`);
  }
}

// The zero-network promise, re-checked at package time (PRD P1).
const NETWORK = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/new\s+XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+WebSocket/, 'WebSocket'],
  [/new\s+EventSource/, 'EventSource'],
  [/\bsendBeacon\s*\(/, 'sendBeacon()'],
  [/importScripts\s*\(/, 'importScripts()']
];
for (const file of files.filter((f) => extname(f) === '.js')) {
  const source = readFileSync(join(SRC, file), 'utf8');
  for (const [pattern, name] of NETWORK) {
    check(!pattern.test(source), `${file} performs a network call (${name})`);
  }
}

if (manifest.version_name) notes.push(`version_name: ${manifest.version_name}`);
if (!manifest.version.startsWith('1.')) {
  notes.push('pre-1.0 version — remember to upload to an unlisted or beta channel');
}

/* --------------------------------------------------------------- report */

if (problems.length) {
  console.error('\nBuild refused. Fix these first:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error('');
  process.exit(1);
}

/* ------------------------------------------------------------------ zip */

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const zipName = `aura-${manifest.version}.zip`;
const zipPath = join(DIST, zipName);

// Zip from inside src/ so the manifest sits at the archive root, which is what
// the Chrome Web Store requires.
execFileSync('zip', ['-r', '-q', '-X', zipPath, '.', '-x', '.*', '-x', '*/.*'], { cwd: SRC });

const size = statSync(zipPath).size;

console.log(`\n  Aura ${manifest.version}${manifest.version_name ? ` — ${manifest.version_name}` : ''}`);
console.log(`  ${files.length} files, ${(size / 1024).toFixed(1)} KB packed`);
console.log(`  → ${relative(ROOT, zipPath)}\n`);
console.log('  Checks passed:');
console.log('    manifest v3, version matches package.json');
console.log('    incognito not_allowed, no install-time host permissions');
console.log("    CSP connect-src 'none', no network calls in any source file");
console.log('    every referenced file present, no dev files packaged');
for (const note of notes) console.log(`\n  Note: ${note}`);
console.log('');
