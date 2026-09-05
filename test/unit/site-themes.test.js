import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_ADAPTERS, adapterFor, adapterHosts, buildPageCss } from '../../src/core/site-themes.js';
import { THEMES } from '../../src/core/themes.js';

test('Google search matches, and only on search paths', () => {
  assert.equal(adapterFor('www.google.com', '/search').id, 'google-search');
  assert.equal(adapterFor('google.co.uk', '/search').id, 'google-search');
  assert.equal(adapterFor('google.com', '/maps'), null, 'Maps is not a search page');
  assert.equal(adapterFor('google.com', '/'), null, 'the homepage has its own look');
});

test('adapter host matching respects the dot boundary', () => {
  assert.equal(adapterFor('notgoogle.com', '/search'), null);
  assert.equal(adapterFor('google.com.evil.test', '/search'), null);
});

test('unknown sites get no adapter — page theming never guesses', () => {
  for (const host of ['wikipedia.org', 'github.com', 'example.com']) {
    assert.equal(adapterFor(host, '/search'), null, host);
  }
});

test('adapterFor tolerates malformed input', () => {
  for (const bad of [undefined, null, '', 42, {}]) {
    assert.equal(adapterFor(bad, '/search'), null);
  }
});

test('every adapter declares the fields the engine needs', () => {
  for (const adapter of SITE_ADAPTERS) {
    assert.ok(adapter.id && adapter.label);
    assert.ok(Array.isArray(adapter.hosts) && adapter.hosts.length > 0);
    assert.ok(Array.isArray(adapter.clearBackground) && adapter.clearBackground.length > 0);
  }
});

test('adapterHosts is the deduplicated union of every adapter host', () => {
  const hosts = adapterHosts();
  assert.equal(new Set(hosts).size, hosts.length);
  assert.ok(hosts.includes('google.com'));
});

/* ----------------------------------------------------------- generated CSS */

test('the stylesheet changes background only — never text or layout', () => {
  const css = buildPageCss(adapterFor('google.com', '/search'), THEMES.tropical.light.gradient);
  // Anchored so `background-color` does not read as the text `color` property.
  const forbidden = [
    [/(^|[^-\w])color\s*:/m, 'color'],
    [/(^|[^-\w])font(-[a-z]+)?\s*:/m, 'font'],
    [/(^|[^-\w])display\s*:/m, 'display'],
    [/(^|[^-\w])position\s*:/m, 'position'],
    [/(^|[^-\w])width\s*:/m, 'width'],
    [/(^|[^-\w])margin(-[a-z]+)?\s*:/m, 'margin'],
    [/(^|[^-\w])padding(-[a-z]+)?\s*:/m, 'padding']
  ];
  for (const [pattern, name] of forbidden) {
    assert.ok(!pattern.test(css),
      `page theming must not set ${name} — a wrong tint should be ugly, not unreadable`);
  }
  assert.match(css, /background-image/);
});

test('the stylesheet is scoped to our own class, so removing it fully reverts', () => {
  const css = buildPageCss(adapterFor('google.com', '/search'), THEMES.coding.light.gradient);
  for (const line of css.split('\n')) {
    if (!line.includes('{')) continue;
    assert.match(line, /html\.aura-themed/,
      'every rule must be gated on the class we add and remove');
  }
});

test('the theme gradient reaches the generated CSS', () => {
  const css = buildPageCss(adapterFor('google.com', '/search'), THEMES.celebration.light.gradient);
  for (const stop of THEMES.celebration.light.gradient) assert.ok(css.includes(stop));
});

test('buildPageCss degrades to nothing rather than emitting broken CSS', () => {
  assert.equal(buildPageCss(null, ['#fff', '#eee', '#ddd']), '');
  assert.equal(buildPageCss(SITE_ADAPTERS[0], null), '');
  assert.equal(buildPageCss(SITE_ADAPTERS[0], ['#fff']), '');
});
