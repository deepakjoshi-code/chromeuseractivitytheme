import test from 'node:test';
import assert from 'node:assert/strict';
import { createChromeMock, createChromeMockWithoutSession } from '../helpers/chrome-mock.js';
import * as store from '../../src/core/storage.js';
import { KEYS } from '../../src/core/messages.js';
import { NEUTRAL } from '../../src/core/taxonomy.js';

test('settings default sensibly, and ambient is OFF by default (gap G-07)', async () => {
  const settings = await store.getSettings(createChromeMock());
  assert.equal(settings.enabled, true);
  assert.equal(settings.intensity, 'balanced');
  assert.equal(settings.ambient, false, 'ambient must never default to on');
  assert.deepEqual(settings.blocklist, []);
  assert.deepEqual(settings.mutedCategories, []);
});

test('stored settings from an older version gain new defaults on read', async () => {
  const ns = createChromeMock();
  await ns.storage.local.set({ [KEYS.SETTINGS]: { intensity: 'subtle' } });
  const settings = await store.getSettings(ns);
  assert.equal(settings.intensity, 'subtle', 'the stored value wins');
  assert.equal(settings.enabled, true, 'missing keys are backfilled from defaults');
  assert.equal(settings.showReason, true);
});

test('updateSettings merges rather than replaces', async () => {
  const ns = createChromeMock();
  await store.updateSettings(ns, { intensity: 'expressive' });
  const settings = await store.updateSettings(ns, { enabled: false });
  assert.equal(settings.intensity, 'expressive');
  assert.equal(settings.enabled, false);
});

test('the active theme defaults to neutral', async () => {
  const active = await store.getActiveTheme(createChromeMock());
  assert.equal(active.category, NEUTRAL);
  assert.equal(active.confidence, 0);
});

/* ------------------------------------------------------------------- pins */

test('an indefinite pin persists', async () => {
  const ns = createChromeMock();
  await store.setPin(ns, 'tropical', null);
  assert.equal((await store.getActivePin(ns, 1e12)).category, 'tropical');
});

test('an expired pin is treated as absent and cleaned up', async () => {
  const ns = createChromeMock();
  await store.setPin(ns, 'tropical', 5000);
  assert.equal((await store.getActivePin(ns, 4999)).category, 'tropical');
  assert.equal(await store.getActivePin(ns, 5000), null, 'expiry is inclusive');
  assert.equal(await store.getPin(ns), null, 'the expired pin is removed, not just hidden');
});

/* -------------------------------------------------------------------- log */

test('the activity log is newest-first and hard-capped (PRD P7)', async () => {
  const ns = createChromeMock();
  for (let i = 0; i < store.LOG_LIMIT + 25; i++) {
    await store.appendLog(ns, { host: `h${i}.com`, category: 'coding', confidence: 1, terms: [], at: i });
  }
  const log = await store.getLog(ns);
  assert.equal(log.length, store.LOG_LIMIT, 'the ring buffer must not grow without bound');
  assert.equal(log[0].host, `h${store.LOG_LIMIT + 24}.com`, 'newest entry first');
});

test('a corrupt log value degrades to an empty array', async () => {
  const ns = createChromeMock();
  await ns.storage.local.set({ [KEYS.LOG]: 'not-an-array' });
  assert.deepEqual(await store.getLog(ns), []);
});

/* ------------------------------------------------------------- rejections */

test('rejections accumulate per host without duplicates', async () => {
  const ns = createChromeMock();
  await store.addRejection(ns, 'example.com', 'tropical');
  await store.addRejection(ns, 'example.com', 'tropical');
  await store.addRejection(ns, 'example.com', 'vegas');
  await store.addRejection(ns, 'other.com', 'coding');
  const rejections = await store.getRejections(ns);
  assert.deepEqual(rejections['example.com'], ['tropical', 'vegas']);
  assert.deepEqual(rejections['other.com'], ['coding']);
});

test('addRejection ignores incomplete input', async () => {
  const ns = createChromeMock();
  await store.addRejection(ns, null, 'tropical');
  await store.addRejection(ns, 'example.com', null);
  assert.deepEqual(await store.getRejections(ns), {});
});

/* ---------------------------------------------------------- context state */

test('context state round-trips through session storage', async () => {
  const ns = createChromeMock();
  const state = { scores: { coding: { value: 1.5, lastSeen: 10 } }, decayedAt: 10, active: 'coding' };
  await store.setContextState(ns, state);
  assert.deepEqual(await store.getContextState(ns), state);
});

test('context state degrades gracefully where session storage is unavailable', async () => {
  const ns = createChromeMockWithoutSession();
  await store.setContextState(ns, { scores: {} });
  assert.equal(await store.getContextState(ns), null);
});

/* -------------------------------------------------------------- erase all */

test('eraseAll clears every store and restores defaults (PRD B11)', async () => {
  const ns = createChromeMock();
  await store.updateSettings(ns, { enabled: false, blocklist: ['x.com'] });
  await store.setActiveTheme(ns, { category: 'vegas', confidence: 1, reasons: [], at: 1 });
  await store.setPin(ns, 'vegas', null);
  await store.appendLog(ns, { host: 'x.com', category: 'vegas', confidence: 1, terms: [], at: 1 });
  await store.addRejection(ns, 'x.com', 'coding');
  await store.setContextState(ns, { scores: { vegas: { value: 2, lastSeen: 1 } }, decayedAt: 1 });

  await store.eraseAll(ns);

  assert.deepEqual(await store.getLog(ns), []);
  assert.deepEqual(await store.getRejections(ns), {});
  assert.equal(await store.getPin(ns), null);
  assert.equal((await store.getActiveTheme(ns)).category, NEUTRAL);
  assert.equal(await store.getContextState(ns), null);
  assert.equal((await store.getSettings(ns)).enabled, true);
  assert.deepEqual((await store.getSettings(ns)).blocklist, []);
});

test('eraseAll leaves nothing behind in raw storage but the fresh defaults', async () => {
  const ns = createChromeMock();
  await store.appendLog(ns, { host: 'secret.com', category: 'vegas', confidence: 1, terms: ['x'], at: 1 });
  await store.eraseAll(ns);
  const raw = JSON.stringify(await ns.storage.local.get(null));
  assert.ok(!raw.includes('secret.com'), 'erased data must not survive anywhere');
});

test('storage helpers throw a clear error when chrome.storage is absent', async () => {
  await assert.rejects(() => store.getSettings({}), /chrome\.storage unavailable/);
});
