/**
 * MV3 service-worker lifecycle (ARCHITECTURE.md §5).
 *
 * The worker is killed after ~30s idle. These tests simulate that by simply not
 * carrying any JS state between calls — which is exactly what the engine's
 * stateless design makes possible — and asserting the storage layer carries
 * everything that matters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChromeMock } from '../helpers/chrome-mock.js';
import * as engine from '../../src/core/engine.js';
import * as store from '../../src/core/storage.js';
import { NEUTRAL } from '../../src/core/taxonomy.js';
import { KEYS } from '../../src/core/messages.js';

const search = (q) => ({ url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, title: q });

test('accumulated context survives a worker sleep/wake cycle', async () => {
  const ns = createChromeMock();
  await engine.handleSignal(ns, search('hawaii maui snorkeling'), 1000);

  const persisted = await store.getContextState(ns);
  assert.ok(persisted, 'context must be written to session storage, not held in memory');
  assert.ok(persisted.scores.tropical.value > 0);

  // ... worker dies here; nothing is carried over but storage ...
  await engine.handleSignal(ns, search('hawaii maui snorkeling'), 7000);
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical',
    'evidence from before the sleep must still count');
});

test('decay is applied lazily across a long sleep, with no timer', async () => {
  const ns = createChromeMock();
  await engine.handleSignal(ns, search('hawaii maui snorkeling'), 1000);
  const before = (await store.getContextState(ns)).scores.tropical.value;

  // Twenty minutes pass with the worker unloaded. No interval ran.
  await engine.handleSignal(ns, { url: 'https://example.com/zzz', title: 'qqq' }, 1000 + 20 * 60 * 1000);
  const after = (await store.getContextState(ns)).scores.tropical;

  assert.ok(!after || after.value < before, 'evidence must have decayed purely from timestamps');
});

test('a browser restart clears context but keeps settings and the last theme', async () => {
  const ns = createChromeMock();
  await store.updateSettings(ns, { intensity: 'subtle', blocklist: ['x.com'] });
  await engine.handleSignal(ns, search('hawaii maui snorkeling'), 1000);
  await engine.handleSignal(ns, search('hawaii maui snorkeling'), 7000);
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');

  // chrome.storage.session is cleared on browser restart.
  await ns.storage.session.clear();

  assert.equal(await store.getContextState(ns), null, 'context is per-sitting');
  assert.equal((await store.getSettings(ns)).intensity, 'subtle', 'settings persist');
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical',
    'the last theme persists so the next new tab is not a jarring blank');
});

test('a corrupt context state degrades to a fresh one instead of throwing', async () => {
  const ns = createChromeMock();
  for (const corrupt of [{ nonsense: true }, { scores: {} }, 'a string', 42]) {
    await ns.storage.session.set({ [KEYS.CONTEXT]: corrupt });
    await assert.doesNotReject(() => engine.handleSignal(ns, search('birthday cake balloons'), 1000));
  }
});

test('state is JSON-serialisable, as chrome.storage requires', async () => {
  const ns = createChromeMock();
  await engine.handleSignal(ns, search('hawaii maui snorkeling'), 1000);
  const state = await store.getContextState(ns);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('getFullState works before anything has ever been classified', async () => {
  const state = await engine.getFullState(createChromeMock(), 1000);
  assert.equal(state.active.category, NEUTRAL);
  assert.ok(state.theme.label);
  assert.ok(state.theme.motif);
  assert.equal(state.settings.enabled, true);
  assert.match(state.explanation, /neutral/);
});

test('concurrent signals do not corrupt stored state', async () => {
  const ns = createChromeMock();
  await Promise.all([
    engine.handleSignal(ns, search('hawaii maui'), 1000),
    engine.handleSignal(ns, search('birthday cake'), 1100),
    engine.handleSignal(ns, search('kubernetes docker'), 1200)
  ]);
  const state = await store.getContextState(ns);
  assert.ok(state && typeof state.decayedAt === 'number');
  assert.ok(Object.values(state.scores).every((entry) => typeof entry.value === 'number'));
});
