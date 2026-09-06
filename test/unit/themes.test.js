import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_KEYS, INTENSITY, INTENSITY_LEVELS, getTheme, resolveTheme }
  from '../../src/core/themes.js';
import { NEUTRAL } from '../../src/core/taxonomy.js';

const HEX = /^#[0-9a-f]{6}$/i;
const PALETTE_KEYS = ['bg', 'surface', 'text', 'textMuted', 'accent', 'onAccent', 'gradient'];

test('every theme defines a complete light and dark palette (PRD A9)', () => {
  for (const key of THEME_KEYS) {
    const theme = THEMES[key];
    assert.equal(typeof theme.label, 'string', `${key}.label`);
    assert.ok(theme.label.length > 0, `${key}.label must not be empty`);
    assert.ok(theme.description.length > 0, `${key}.description`);
    assert.ok(theme.motif.includes('<'), `${key}.motif must be SVG markup`);

    for (const scheme of ['light', 'dark']) {
      const palette = theme[scheme];
      assert.ok(palette, `${key}.${scheme} missing`);
      for (const field of PALETTE_KEYS) {
        assert.ok(palette[field] !== undefined, `${key}.${scheme}.${field} missing`);
      }
      assert.equal(palette.gradient.length, 3, `${key}.${scheme}.gradient needs 3 stops`);
    }
  }
});

test('every colour is a valid 6-digit hex value', () => {
  for (const key of THEME_KEYS) {
    for (const scheme of ['light', 'dark']) {
      const palette = THEMES[key][scheme];
      for (const field of ['bg', 'surface', 'text', 'textMuted', 'accent', 'onAccent']) {
        assert.match(palette[field], HEX, `${key}.${scheme}.${field} = ${palette[field]}`);
      }
      for (const [i, stop] of palette.gradient.entries()) {
        assert.match(stop, HEX, `${key}.${scheme}.gradient[${i}]`);
      }
    }
  }
});

test('motifs reference no external resources (PRD P1, §6)', () => {
  for (const key of THEME_KEYS) {
    const motif = THEMES[key].motif;
    assert.ok(!/https?:|url\(|<image|xlink:href/i.test(motif),
      `${key}.motif must be self-contained`);
  }
});

test('a neutral theme exists and is the fallback for unknown keys', () => {
  assert.ok(THEMES[NEUTRAL]);
  assert.equal(getTheme('does-not-exist'), THEMES[NEUTRAL]);
  assert.equal(getTheme(undefined), THEMES[NEUTRAL]);
  assert.equal(getTheme(null), THEMES[NEUTRAL]);
});

test('theme labels are unique, so the gallery is never ambiguous', () => {
  const labels = THEME_KEYS.map((k) => THEMES[k].label);
  assert.equal(new Set(labels).size, labels.length);
});

test('resolveTheme emits the full CSS variable contract', () => {
  const expected = [
    '--aura-bg', '--aura-surface', '--aura-text', '--aura-text-muted',
    '--aura-accent', '--aura-on-accent', '--aura-grad-1', '--aura-grad-2',
    '--aura-grad-3', '--aura-grad-opacity', '--aura-motif-opacity', '--aura-motion'
  ].sort();
  assert.deepEqual(Object.keys(resolveTheme('tropical', 'light', 'balanced')).sort(), expected);
});

test('resolveTheme values are always strings, as CSS custom properties require', () => {
  for (const value of Object.values(resolveTheme('coding', 'dark', 'expressive'))) {
    assert.equal(typeof value, 'string');
  }
});

test('resolveTheme picks the requested scheme and falls back to light', () => {
  assert.equal(resolveTheme('tropical', 'dark')['--aura-bg'], THEMES.tropical.dark.bg);
  assert.equal(resolveTheme('tropical', 'light')['--aura-bg'], THEMES.tropical.light.bg);
  assert.equal(resolveTheme('tropical', 'nonsense')['--aura-bg'], THEMES.tropical.light.bg);
});

test('intensity progressively increases expression (PRD §7.4)', () => {
  const opacities = INTENSITY_LEVELS.map(
    (level) => Number(resolveTheme('tropical', 'light', level)['--aura-grad-opacity'])
  );
  for (let i = 1; i < opacities.length; i++) {
    assert.ok(opacities[i] >= opacities[i - 1], 'intensity levels must be ordered');
  }
  assert.equal(INTENSITY.off.gradientOpacity, 0);
  assert.equal(INTENSITY.off.motion, false);
  assert.equal(INTENSITY.subtle.motion, false, 'subtle must not animate');
});

test('ambient is available at every level except Off', () => {
  // Ambient is now the whole in-page experience, not a garnish on top of the
  // most expressive setting, so gating it behind Expressive only hid it.
  for (const level of ['subtle', 'balanced', 'expressive']) {
    assert.equal(INTENSITY[level].ambient, true, `${level} should allow ambient`);
  }
  assert.equal(INTENSITY.off.ambient, false, 'Off means off');
});

test('an unknown intensity falls back to balanced rather than throwing', () => {
  assert.deepEqual(resolveTheme('coding', 'light', 'nope'), resolveTheme('coding', 'light', 'balanced'));
});
