#!/usr/bin/env node
/**
 * overlay-proof.mjs — prove the ambient overlay changes nothing but colour.
 *
 * Give it any saved web page. It renders the page untouched, then renders it
 * again with Aura's overlay added exactly as the content script adds it, and
 * compares the two:
 *
 *   - every text node, in order            -> must be byte-identical
 *   - every element's bounding box         -> must be identical to the pixel
 *   - the number and tag of every element  -> must be identical
 *
 * Screenshots are a demonstration; this is a proof. If a single word or a single
 * pixel of layout moved, it fails and says which element.
 *
 * Validated with a negative control: injecting a 1px padding change alongside
 * the overlay makes it fail and name every element that moved. A proof that
 * cannot fail proves nothing.
 *
 * Usage: node tools/overlay-proof.mjs <file.html|file.mhtml> [theme] [intensity]
 */
import { chromium } from 'playwright';
import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { THEMES } from '../src/core/themes.js';

const STRENGTH = { subtle: 0.25, balanced: 0.45, expressive: 0.62 };

const [, , fileArg, themeArg = 'tropical', levelArg = 'expressive'] = process.argv;
if (!fileArg || !existsSync(resolve(fileArg))) {
  console.error('\n  usage: node tools/overlay-proof.mjs <saved-page> [theme] [intensity]\n');
  process.exit(1);
}
const url = 'file://' + resolve(fileArg);
const theme = THEMES[themeArg] || THEMES.tropical;
const name = basename(fileArg).replace(/\.[^.]+$/, '');

/** Exactly what content/ambient.js does — one element, nothing else touched. */
function addOverlay({ stops, mode, opacity }) {
  const el = document.createElement('div');
  el.id = 'aura-ambient-root';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
  el.style.mixBlendMode = mode;
  el.style.background = [
    `radial-gradient(62% 52% at 0% 0%, ${stops[0]} 0%, transparent 72%)`,
    `radial-gradient(58% 50% at 100% 0%, ${stops[1]} 0%, transparent 70%)`,
    `radial-gradient(74% 42% at 50% 100%, ${stops[2]} 0%, transparent 74%)`,
    `linear-gradient(160deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`
  ].join(',');
  el.style.opacity = String(opacity);
  (document.body || document.documentElement).appendChild(el);
}

/** A fingerprint of the page's words and geometry, ignoring our own element. */
function fingerprint() {
  const text = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement && node.parentElement.closest('#aura-ambient-root')) continue;
    const value = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (value) text.push(value);
  }

  const boxes = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.id === 'aura-ambient-root' || el.closest('#aura-ambient-root')) continue;
    const r = el.getBoundingClientRect();
    boxes.push(`${el.tagName}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`);
  }
  return { text, boxes };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: process.env.CHROMIUM_PATH ? undefined : 'chromium',
  args: ['--disable-background-networking', '--no-first-run', '--no-proxy-server']
});

async function render(withOverlay) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(600);
  if (withOverlay) {
    await page.evaluate(addOverlay, {
      stops: theme.light.gradient,
      mode: 'multiply',
      opacity: STRENGTH[levelArg] || STRENGTH.expressive
    });
    await page.waitForTimeout(250);
  }
  const data = await page.evaluate(fingerprint);
  await page.screenshot({
    path: `screenshots/${name}-${withOverlay ? 'with-aura' : 'original'}.png`,
    fullPage: false
  });
  await page.close();
  return data;
}

const before = await render(false);
const after = await render(true);
await browser.close();

/* ------------------------------------------------------------------ verdict */

const problems = [];

if (before.text.length !== after.text.length) {
  problems.push(`text node count changed: ${before.text.length} -> ${after.text.length}`);
} else {
  for (let i = 0; i < before.text.length; i++) {
    if (before.text[i] !== after.text[i]) {
      problems.push(`text changed at #${i}:\n      before: ${JSON.stringify(before.text[i])}\n      after:  ${JSON.stringify(after.text[i])}`);
      if (problems.length > 4) break;
    }
  }
}

if (before.boxes.length !== after.boxes.length) {
  problems.push(`element count changed: ${before.boxes.length} -> ${after.boxes.length}`);
} else {
  for (let i = 0; i < before.boxes.length; i++) {
    if (before.boxes[i] !== after.boxes[i]) {
      problems.push(`layout moved: ${before.boxes[i]}  ->  ${after.boxes[i]}`);
      if (problems.length > 8) break;
    }
  }
}

console.log(`\n  ${basename(fileArg)}  ·  theme: ${themeArg}  ·  intensity: ${levelArg}`);
console.log(`  ${before.text.length} text nodes, ${before.boxes.length} elements compared\n`);

if (problems.length) {
  console.error('  OVERLAY CHANGED THE PAGE:\n');
  for (const problem of problems) console.error(`    ✗ ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('    ✓ every word identical');
console.log('    ✓ every element in the same position, to the pixel');
console.log('    ✓ no elements added or removed from the page');
console.log(`\n  screenshots/${name}-original.png`);
console.log(`  screenshots/${name}-with-aura.png\n`);
