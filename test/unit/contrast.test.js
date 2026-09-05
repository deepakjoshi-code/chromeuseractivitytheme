/**
 * Accessibility gate (PRD A9, gap G-09).
 *
 * A product whose entire value is changing colours has no business shipping a
 * palette that cannot be read. Contrast is computed here rather than eyeballed,
 * so a new theme cannot be added without clearing the bar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_KEYS } from '../../src/core/themes.js';

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(match, `not a hex colour: ${hex}`);
  const value = parseInt(match[1], 16);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((value >> 16) & 255)
       + 0.7152 * channel((value >> 8) & 255)
       + 0.0722 * channel(value & 255);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('the contrast helper agrees with known reference values', () => {
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(contrast('#777777', '#ffffff') - 4.48) < 0.05);
  assert.equal(contrast('#123456', '#123456'), 1);
});

test('body and muted text clear WCAG AA (4.5:1) in every theme and scheme', () => {
  const failures = [];
  for (const key of THEME_KEYS) {
    for (const scheme of ['light', 'dark']) {
      const p = THEMES[key][scheme];
      for (const [name, fg, bg] of [
        ['text on bg', p.text, p.bg],
        ['text on surface', p.text, p.surface],
        ['muted on bg', p.textMuted, p.bg],
        ['muted on surface', p.textMuted, p.surface]
      ]) {
        const ratio = contrast(fg, bg);
        if (ratio < 4.5) failures.push(`${key}.${scheme}: ${name} = ${ratio.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(failures, [], `WCAG AA failures:\n${failures.join('\n')}`);
});

test('text on the accent colour clears WCAG AA', () => {
  const failures = [];
  for (const key of THEME_KEYS) {
    for (const scheme of ['light', 'dark']) {
      const p = THEMES[key][scheme];
      const ratio = contrast(p.onAccent, p.accent);
      if (ratio < 4.5) failures.push(`${key}.${scheme}: onAccent = ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the accent is distinguishable as a UI element (3:1 against surface)', () => {
  const failures = [];
  for (const key of THEME_KEYS) {
    for (const scheme of ['light', 'dark']) {
      const p = THEMES[key][scheme];
      const ratio = contrast(p.accent, p.surface);
      if (ratio < 3.0) failures.push(`${key}.${scheme}: accent on surface = ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('dark palettes really are darker than their light counterparts', () => {
  for (const key of THEME_KEYS) {
    assert.ok(luminance(THEMES[key].dark.bg) < luminance(THEMES[key].light.bg),
      `${key}: dark background must be darker than light`);
  }
});
