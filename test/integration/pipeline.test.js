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

const search = (query) => ({
  url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  title: `${query} - Google Search`,
  tabId: 1
});

/** A realistic mini-session: a user refining a search across several queries. */
const session = (...queries) => queries.map(search);

/**
 * Replay a browsing session.
 *
 * Signals must be genuinely distinct pages, because the engine de-duplicates
 * the same page in the same tab within DEDUPE_MS — repeating one identical
 * signal is a tab switch, not new activity.
 */
async function drive(ns, signals, { start = 0, step = 6000 } = {}) {
  const list = Array.isArray(signals) ? signals : [signals];
  let t = start;
  const outcomes = [];
  for (const signal of list) {
    t += step;
    outcomes.push(await engine.handleSignal(ns, { tabId: 1, ...signal }, t));
  }
  return { outcomes, t };
}

/* ------------------------------------------------------- the happy paths */

test('a sustained search for a Hawaii holiday themes the browser tropical', async () => {
  const ns = createChromeMock();
  await drive(ns, session(
    'hawaii vacation packages', 'maui snorkeling tours', 'best beach resort maui',
    'hawaii flights deals', 'kauai or maui island'));
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');
});

test('a sustained search for a kids party themes the browser celebration', async () => {
  const ns = createChromeMock();
  await drive(ns, session(
    'birthday cake ideas', 'kids party games', 'party favors and balloons',
    'pinata for birthday party', 'birthday party decorations'));
  assert.equal((await store.getActiveTheme(ns)).category, 'celebration');
});

test('working on GitHub themes the browser for focus', async () => {
  const ns = createChromeMock();
  await drive(ns, [
    { url: 'https://github.com/acme/service/pull/42', title: 'Fix merge conflict in scheduler · Pull Request #42' },
    { url: 'https://github.com/acme/service/pull/43', title: 'Add unit test for retry budget · Pull Request #43' },
    { url: 'https://stackoverflow.com/questions/9/async-await', title: 'javascript async await ordering' },
    { url: 'https://kubernetes.io/docs/ingress/', title: 'Ingress | Kubernetes' }
  ]);
  assert.equal((await store.getActiveTheme(ns)).category, 'coding');
});

test('the accepted change carries the reasons that justify it (PRD B1)', async () => {
  const ns = createChromeMock();
  const { outcomes } = await drive(ns, session(
    'las vegas casino shows', 'vegas hotels on the strip', 'bellagio fountain show',
    'best vegas nightclub', 'vegas sportsbook odds'));
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
  await drive(ns, session(
    'hawaii vacation maui', 'maui snorkeling', 'beach resort oahu', 'kauai travel guide'));
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
  await drive(ns, session(
    'bankruptcy filing lawyer', 'chapter 7 bankruptcy cost', 'debt collector rights',
    'foreclosure timeline', 'credit score after bankruptcy'));
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
  await drive(ns, session(
    'birthday cake ideas', 'kids party games', 'party favors balloons',
    'pinata birthday', 'birthday decorations'));
  assert.notEqual((await store.getActiveTheme(ns)).category, 'celebration');
});

/* ---------------------------------------------------------------- pinning */

test('a pin overrides detection entirely (PRD B2)', async () => {
  const ns = createChromeMock();
  await engine.pinTheme(ns, 'coding', 0, 1000);
  const { outcomes } = await drive(ns, session(
    'hawaii vacation maui', 'maui snorkeling tours', 'beach resort oahu',
    'kauai travel guide'), { start: 2000 });
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
  const pages = [
    { url: 'https://example.com/islands/bali', title: 'Bali beach resort tropical island' },
    { url: 'https://example.com/islands/maui', title: 'Maui snorkeling and luau guide' },
    { url: 'https://example.com/islands/fiji', title: 'Fiji overwater bungalow vacation' },
    { url: 'https://example.com/islands/aruba', title: 'Aruba beach vacation packages' }
  ];
  await drive(ns, pages);
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');

  await engine.rejectCurrent(ns, 'example.com', 100000);
  assert.equal((await store.getActiveTheme(ns)).category, NEUTRAL);
  assert.deepEqual((await store.getRejections(ns))['example.com'], ['tropical']);

  await drive(ns, pages, { start: 200000 });
  assert.notEqual((await store.getActiveTheme(ns)).category, 'tropical',
    'the same misfire must not immediately return');
});

test('a rejection is scoped to its host', async () => {
  const ns = createChromeMock();
  await store.addRejection(ns, 'example.com', 'tropical');
  await drive(ns, [
    { url: 'https://elsewhere.test/bali', title: 'Bali beach resort tropical island' },
    { url: 'https://elsewhere.test/maui', title: 'Maui snorkeling and luau guide' },
    { url: 'https://elsewhere.test/fiji', title: 'Fiji overwater bungalow vacation' },
    { url: 'https://elsewhere.test/aruba', title: 'Aruba beach vacation packages' }
  ]);
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
  assert.equal(engine.shouldRunAmbient({ ...base, intensity: 'balanced' }, 'example.com'), true,
    'ambient is available below Expressive');
  assert.equal(engine.shouldRunAmbient({ ...base, intensity: 'off' }, 'example.com'), false,
    'Off means off');
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

/* ------------------------------------ typed searches take over at once ---- */

test('each new typed search re-themes immediately, one search per subject', async () => {
  const ns = createChromeMock();
  const journey = [
    ['hawaii vacation packages', 'tropical'],
    ['kids party ideas', 'celebration'],
    ['kubernetes ingress tutorial', 'coding'],
    ['maui snorkeling tours', 'tropical']
  ];

  let t = 0;
  for (const [query, expected] of journey) {
    t += 6000;
    await engine.handleSignal(ns, { ...search(query), tabId: 1 }, t);
    assert.equal((await store.getActiveTheme(ns)).category, expected,
      `"${query}" should have themed as ${expected} on its own`);
  }
});

test('a typed search displaces the previous subject rather than queueing behind it', async () => {
  const ns = createChromeMock();
  await engine.handleSignal(ns, { ...search('hawaii vacation maui'), tabId: 1 }, 5000);
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');

  // Without displacement, the evidence banked by Hawaii would outweigh a single
  // new query and the browser would sit there looking broken.
  await engine.handleSignal(ns, { ...search('birthday cake balloons'), tabId: 1 }, 11000);
  assert.equal((await store.getActiveTheme(ns)).category, 'celebration');
});

test('browsing without typing is still damped — no strobing on incidental pages', async () => {
  const ns = createChromeMock();
  await engine.handleSignal(ns, { ...search('hawaii vacation maui'), tabId: 1 }, 5000);
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');

  // A page merely visited, not searched for, must not seize the screen at once.
  const result = await engine.handleSignal(ns,
    { url: 'https://github.com/acme/api/pull/1', title: 'Fix merge conflict · PR #1', tabId: 1 }, 11000);
  assert.equal(result.outcome, engine.OUTCOME.NO_CHANGE);
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');
});
