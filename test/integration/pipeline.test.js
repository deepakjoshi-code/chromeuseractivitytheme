/**
 * End-to-end pipeline tests: raw tab signal -> stored theme, through the real
 * privacy firewall, classifier, scoring engine and storage layer, against the
 * chrome mock. Nothing is stubbed except the browser itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChromeMock } from '../helpers/chrome-mock.js';
import * as engine from '../../src/core/engine.js';
import * as store from '../../src/core/storage.js';
import { NEUTRAL } from '../../src/core/taxonomy.js';

/** Feed a signal repeatedly until the engine accepts a change, or give up. */
async function drive(ns, signal, { start = 0, step = 6000, times = 6 } = {}) {
  let t = start;
  const outcomes = [];
  for (let i = 0; i < times; i++) {
    t += step;
    outcomes.push(await engine.handleSignal(ns, signal, t));
  }
  return { outcomes, t };
}

const search = (query) => ({
  url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  title: `${query} - Google Search`
});

/* ------------------------------------------------------- the happy paths */

test('a sustained search for a Hawaii holiday themes the browser tropical', async () => {
  const ns = createChromeMock();
  await drive(ns, search('hawaii vacation packages maui snorkeling'));
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');
});

test('a sustained search for a kids party themes the browser celebration', async () => {
  const ns = createChromeMock();
  await drive(ns, search('kids birthday party cake balloons'));
  assert.equal((await store.getActiveTheme(ns)).category, 'celebration');
});

test('working on GitHub themes the browser for focus', async () => {
  const ns = createChromeMock();
  await drive(ns, {
    url: 'https://github.com/acme/service/pull/42',
    title: 'Fix merge conflict in scheduler by dev · Pull Request #42'
  });
  assert.equal((await store.getActiveTheme(ns)).category, 'coding');
});

test('the accepted change carries the reasons that justify it (PRD B1)', async () => {
  const ns = createChromeMock();
  const { outcomes } = await drive(ns, search('las vegas casino shows'));
  const accepted = outcomes.find((o) => o.outcome === engine.OUTCOME.CHANGED);
  assert.ok(accepted, 'expected a change');
  assert.equal(accepted.category, 'vegas');
  assert.ok(accepted.reasons.length > 0);
  const state = await engine.getFullState(ns, 100000);
  assert.match(state.explanation, /^because /);
});

/* ------------------------------------------------------------- firewall */

test('a sensitive page changes NOTHING and leaks nothing (PRD P4)', async () => {
  const ns = createChromeMock();
  await drive(ns, search('hawaii vacation maui'));
  const before = await store.getActiveTheme(ns);
  assert.equal(before.category, 'tropical');

  const result = await engine.handleSignal(ns, search('cancer diagnosis symptoms'), 500000);
  assert.equal(result.outcome, engine.OUTCOME.SENSITIVE);

  const after = await store.getActiveTheme(ns);
  assert.equal(after.category, 'tropical',
    'the theme must NOT snap to neutral — that would itself reveal a private page');
  assert.deepEqual(after, before);

  const raw = JSON.stringify(await ns.storage.local.get(null))
            + JSON.stringify(await ns.storage.session.get(null));
  assert.ok(!/cancer|diagnosis|symptom/i.test(raw),
    'no trace of the sensitive signal may be persisted anywhere');
});

test('a sensitive host is blocked even with entirely benign page text', async () => {
  const ns = createChromeMock();
  const result = await engine.handleSignal(
    ns, { url: 'https://www.chase.com/party-planning', title: 'Birthday cake ideas' }, 1000);
  assert.equal(result.outcome, engine.OUTCOME.SENSITIVE);
});

test('repeated sensitive signals never accumulate evidence', async () => {
  const ns = createChromeMock();
  await drive(ns, search('bankruptcy filing lawyer'), { times: 10 });
  assert.equal((await store.getActiveTheme(ns)).category, NEUTRAL);
  assert.equal(await store.getContextState(ns), null, 'nothing was ever scored');
});

/* ---------------------------------------------------------- gating paths */

test('a disabled extension reads nothing at all', async () => {
  const ns = createChromeMock();
  await store.updateSettings(ns, { enabled: false });
  const result = await engine.handleSignal(ns, search('hawaii vacation'), 1000);
  assert.equal(result.outcome, engine.OUTCOME.DISABLED);
  assert.deepEqual(await store.getLog(ns), [], 'a disabled extension must not log');
});

test('blocklisted hosts are skipped, subdomains included (PRD B8)', async () => {
  const ns = createChromeMock();
  await store.updateSettings(ns, { blocklist: ['corp.example.com'] });
  const result = await engine.handleSignal(
    ns, { url: 'https://wiki.corp.example.com/party', title: 'Birthday cake' }, 1000);
  assert.equal(result.outcome, engine.OUTCOME.BLOCKLISTED);
  assert.deepEqual(await store.getLog(ns), []);
});

test('internal browser pages are ignored', async () => {
  const ns = createChromeMock();
  for (const url of ['chrome://settings', 'about:blank', 'file:///tmp/x.html']) {
    assert.equal((await engine.handleSignal(ns, { url }, 1000)).outcome, engine.OUTCOME.IGNORED_URL);
  }
});

test('muted categories are never applied (PRD B7)', async () => {
  const ns = createChromeMock();
  await store.updateSettings(ns, { mutedCategories: ['celebration'] });
  await drive(ns, search('birthday cake balloons party'));
  assert.notEqual((await store.getActiveTheme(ns)).category, 'celebration');
});

/* ---------------------------------------------------------------- pinning */

test('a pin overrides detection entirely (PRD B2)', async () => {
  const ns = createChromeMock();
  await engine.pinTheme(ns, 'coding', 0, 1000);
  const { outcomes } = await drive(ns, search('hawaii vacation maui snorkeling'), { start: 2000 });
  assert.ok(outcomes.every((o) => o.outcome === engine.OUTCOME.PINNED));
  assert.equal((await store.getActiveTheme(ns)).category, 'coding');
});

test('a timed pin releases detection once it expires', async () => {
  const ns = createChromeMock();
  await engine.pinTheme(ns, 'coding', 10000, 1000);
  assert.equal((await engine.handleSignal(ns, search('hawaii maui'), 5000)).outcome, engine.OUTCOME.PINNED);
  const after = await engine.handleSignal(ns, search('hawaii maui'), 20000);
  assert.notEqual(after.outcome, engine.OUTCOME.PINNED);
});

test('getFullState reports the pinned theme and says so', async () => {
  const ns = createChromeMock();
  await engine.pinTheme(ns, 'vegas', 0, 1000);
  const state = await engine.getFullState(ns, 2000);
  assert.equal(state.active.category, 'vegas');
  assert.equal(state.explanation, 'pinned by you');
  assert.equal(state.pin.category, 'vegas');
});

/* ------------------------------------------------------- "Not this" (B3) */

test('rejecting a theme reverts it and stops it recurring on that host', async () => {
  const ns = createChromeMock();
  const signal = { url: 'https://example.com/islands', title: 'Bali beach resort tropical island vacation' };
  await drive(ns, signal);
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');

  await engine.rejectCurrent(ns, 'example.com', 100000);
  assert.equal((await store.getActiveTheme(ns)).category, NEUTRAL);
  assert.deepEqual((await store.getRejections(ns))['example.com'], ['tropical']);

  await drive(ns, signal, { start: 200000 });
  assert.notEqual((await store.getActiveTheme(ns)).category, 'tropical',
    'the same misfire must not immediately return');
});

test('a rejection is scoped to its host', async () => {
  const ns = createChromeMock();
  await store.addRejection(ns, 'example.com', 'tropical');
  await drive(ns, { url: 'https://elsewhere.test/x', title: 'Bali beach resort tropical island vacation' });
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');
});

/* -------------------------------------------------------------- logging */

test('the log records host and matched terms but never the title or URL', async () => {
  const ns = createChromeMock();
  await engine.handleSignal(ns, {
    url: 'https://www.google.com/search?q=birthday+cake&session=SECRETTOKEN',
    title: 'A very private page title'
  }, 1000);

  const log = await store.getLog(ns);
  assert.equal(log.length, 1);
  assert.equal(log[0].host, 'google.com');
  assert.ok(log[0].terms.length > 0);
  const raw = JSON.stringify(log);
  assert.ok(!raw.includes('SECRETTOKEN'));
  assert.ok(!raw.includes('private page title'));
});

test('neutral classifications are not logged', async () => {
  const ns = createChromeMock();
  await engine.handleSignal(ns, { url: 'https://example.com/zzz', title: 'qwertyuiop' }, 1000);
  assert.deepEqual(await store.getLog(ns), []);
});

/* --------------------------------------------------------------- ambient */

test('ambient stays off unless every gate opens (PRD A7, gap G-07)', async () => {
  const base = {
    enabled: true, ambient: true, intensity: 'expressive',
    ambientSites: ['example.com'], blocklist: []
  };
  assert.equal(engine.shouldRunAmbient(base, 'example.com'), true);
  assert.equal(engine.shouldRunAmbient({ ...base, enabled: false }, 'example.com'), false);
  assert.equal(engine.shouldRunAmbient({ ...base, ambient: false }, 'example.com'), false);
  assert.equal(engine.shouldRunAmbient({ ...base, intensity: 'balanced' }, 'example.com'), false,
    'ambient requires the expressive intensity level');
  assert.equal(engine.shouldRunAmbient({ ...base, ambientSites: [] }, 'example.com'), false,
    'an empty allow-list must never mean "everywhere"');
  assert.equal(engine.shouldRunAmbient(base, 'other.com'), false);
  assert.equal(engine.shouldRunAmbient({ ...base, blocklist: ['example.com'] }, 'example.com'), false,
    'the blocklist outranks the ambient allow-list');
});

/* ------------------------------------------------------- manual override */

test('a manual theme choice applies immediately (PRD B4)', async () => {
  const ns = createChromeMock();
  await engine.setThemeManually(ns, 'vegas', 1000);
  const state = await engine.getFullState(ns, 1000);
  assert.equal(state.active.category, 'vegas');
  assert.equal(state.theme.label, 'Neon Nights');
});

test('a manual choice of an unknown theme falls back to neutral', async () => {
  const ns = createChromeMock();
  await engine.setThemeManually(ns, 'not-a-theme', 1000);
  assert.equal((await store.getActiveTheme(ns)).category, NEUTRAL);
});

/* -------------------------------------------------------------- hygiene */

test('the engine never throws on malformed input', async () => {
  const ns = createChromeMock();
  for (const raw of [undefined, null, {}, { url: null }, { url: 123 }, { url: 'https://', title: null }]) {
    await assert.doesNotReject(() => engine.handleSignal(ns, raw, 1000));
  }
});
