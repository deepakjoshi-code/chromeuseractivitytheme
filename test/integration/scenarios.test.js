/**
 * User-journey tests, written from the PRD's personas (§4, §5).
 *
 * Where pipeline.test.js checks mechanisms, this file checks that the mechanisms
 * add up to the experience the PRD promised.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChromeMock } from '../helpers/chrome-mock.js';
import * as engine from '../../src/core/engine.js';
import * as store from '../../src/core/storage.js';
import { NEUTRAL } from '../../src/core/taxonomy.js';

const MINUTE = 60 * 1000;
const search = (q) => ({ url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, title: `${q} - Google Search`, tabId: 1 });

/** Replay a browsing session as [signal, dtMs] pairs. */
async function browse(ns, steps, start = 0) {
  let t = start;
  const themes = [];
  for (const [signal, dt] of steps) {
    t += dt;
    await engine.handleSignal(ns, signal, t);
    themes.push((await store.getActiveTheme(ns)).category);
  }
  return { themes, t };
}

test('Maya plans a birthday party, then switches to booking a holiday', async () => {
  const ns = createChromeMock();

  const { t } = await browse(ns, [
    [search('birthday cake ideas for 6 year old'), 2000],
    [search('kids party games indoor'), 8000],
    [{ url: 'https://www.partycity.com/balloons', title: 'Balloons & Party Favors' }, 9000],
    [search('birthday party decorations'), 9000]
  ]);
  assert.equal((await store.getActiveTheme(ns)).category, 'celebration');

  // A week's worth of party planning done; now she's booking Hawaii.
  await browse(ns, [
    [search('hawaii vacation packages'), 2 * MINUTE],
    [search('maui snorkeling tours'), 9000],
    [{ url: 'https://www.gohawaii.com/islands/maui', title: 'Maui travel guide' }, 9000],
    [search('best beach resort maui'), 9000]
  ], t);

  assert.equal((await store.getActiveTheme(ns)).category, 'tropical',
    'the theme must follow her to the new plan');
});

test('Dev works through a normal engineering session without the theme strobing', async () => {
  const ns = createChromeMock();
  const pages = [
    { url: 'https://github.com/acme/api/pull/88', title: 'Add retry budget · Pull Request #88' },
    { url: 'https://stackoverflow.com/questions/1/async-await-ordering', title: 'javascript async await ordering' },
    { url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/', title: 'Ingress | Kubernetes' },
    { url: 'https://github.com/acme/api/actions', title: 'GitHub Actions · acme/api' },
    { url: 'https://developer.mozilla.org/en-US/docs/Web/API/fetch', title: 'fetch() - Web APIs | MDN' }
  ];

  let t = 0;
  let changes = 0;
  let previous = NEUTRAL;
  for (let i = 0; i < 24; i++) {
    t += 12000;
    await engine.handleSignal(ns, pages[i % pages.length], t);
    const current = (await store.getActiveTheme(ns)).category;
    if (current !== previous) changes++;
    previous = current;
  }

  assert.equal(previous, 'coding');
  assert.ok(changes <= 2, `a coherent session must settle, not strobe (saw ${changes} changes)`);
});

test("Dev's work session is never interrupted by a wrongly-detected holiday", async () => {
  const ns = createChromeMock();
  await browse(ns, [
    [{ url: 'https://github.com/acme/api/pull/1', title: 'Refactor scheduler · Pull Request #1' }, 5000],
    [{ url: 'https://github.com/acme/api/pull/2', title: 'Fix stack trace parsing · Pull Request #2' }, 9000],
    [{ url: 'https://github.com/acme/api/pull/3', title: 'Update npm install docs · Pull Request #3' }, 9000]
  ]);
  assert.equal((await store.getActiveTheme(ns)).category, 'coding');

  // One doc that happens to use holiday vocabulary must not flip the browser.
  await engine.handleSignal(ns, {
    url: 'https://kubernetes.io/docs/islands', title: 'Island architecture and the beach ball problem'
  }, 40000);
  assert.equal((await store.getActiveTheme(ns)).category, 'coding');
});

test('Dev rejects a misfire once and it does not come back on that site', async () => {
  const ns = createChromeMock();
  const wiki = [
    { url: 'https://internal.example.com/wiki/offsite', title: 'Bali offsite: beach resort and luau' },
    { url: 'https://internal.example.com/wiki/travel', title: 'Maui snorkeling trip notes' },
    { url: 'https://internal.example.com/wiki/budget', title: 'Fiji overwater bungalow costs' },
    { url: 'https://internal.example.com/wiki/agenda', title: 'Tropical island vacation agenda' }
  ];

  await browse(ns, wiki.map((page) => [page, 9000]));
  assert.equal((await store.getActiveTheme(ns)).category, 'tropical');

  await engine.rejectCurrent(ns, 'internal.example.com', 60000);
  await browse(ns, wiki.map((page) => [page, 9000]), 60000);
  assert.notEqual((await store.getActiveTheme(ns)).category, 'tropical');
});

test('Dev pins Focus and the theme stops moving for the rest of the day', async () => {
  const ns = createChromeMock();
  await engine.pinTheme(ns, 'coding', 8 * 60 * MINUTE, 0);

  await browse(ns, [
    [search('birthday cake ideas'), 5000],
    [search('hawaii vacation'), 9000],
    [{ url: 'https://www.partycity.com/balloons', title: 'Balloons' }, 9000]
  ]);
  assert.equal((await store.getActiveTheme(ns)).category, 'coding');
});

test('Sam shops for kids clothes and nothing private is ever recorded', async () => {
  const ns = createChromeMock();
  await browse(ns, [
    [search('kids winter jacket size 5'), 3000],
    [{ url: 'https://www.target.com/s?searchTerm=toddler+shoes', title: 'toddler shoes : Target' }, 9000],
    [search('back to school supplies list'), 9000],
    // Interleaved with genuinely private browsing.
    [search('pediatrician appointment symptoms fever'), 9000],
    [{ url: 'https://www.chase.com/accounts', title: 'Account summary' }, 9000],
    [search('kids shoes sale free shipping'), 9000]
  ]);

  const theme = (await store.getActiveTheme(ns)).category;
  assert.ok(['kids', 'shopping'].includes(theme), `expected a shopping-ish theme, got ${theme}`);

  const everything = JSON.stringify(await ns.storage.local.get(null))
                   + JSON.stringify(await ns.storage.session.get(null));
  for (const term of ['pediatrician', 'symptoms', 'fever', 'chase', 'accounts']) {
    assert.ok(!new RegExp(term, 'i').test(everything), `"${term}" must never be stored`);
  }
});

test('a private browsing detour does not disturb the theme Sam already had', async () => {
  const ns = createChromeMock();
  await browse(ns, [
    [search('kids winter jacket toddler'), 3000],
    [search('kids clothing sale'), 9000],
    [search('childrens clothing size guide'), 9000]
  ]);
  const before = (await store.getActiveTheme(ns)).category;

  await engine.handleSignal(ns, search('bankruptcy lawyer consultation'), 60000);
  assert.equal((await store.getActiveTheme(ns)).category, before,
    'the screen must not visibly react to a private detour');
});

test('after a long idle period the browser drifts back to neutral', async () => {
  const ns = createChromeMock();
  await browse(ns, [[search('las vegas shows casino'), 3000], [search('vegas hotels strip'), 9000]]);
  assert.equal((await store.getActiveTheme(ns)).category, 'vegas');

  // Comes back hours later to an unrelated page.
  await engine.handleSignal(ns, { url: 'https://example.com/', title: 'Example Domain' }, 6 * 60 * MINUTE);
  assert.equal((await store.getActiveTheme(ns)).category, NEUTRAL);
});

test('a full user journey leaves an honest, readable activity log (PRD B10)', async () => {
  const ns = createChromeMock();
  await browse(ns, [
    [search('birthday cake ideas'), 3000],
    [search('hawaii vacation maui'), 9000],
    [search('bankruptcy lawyer'), 9000]
  ]);

  const log = await store.getLog(ns);
  assert.ok(log.length >= 2);
  assert.ok(log.every((entry) => typeof entry.host === 'string' && Array.isArray(entry.terms)));
  assert.ok(!JSON.stringify(log).includes('bankruptcy'),
    'the sensitive detour must be absent from the log the user is shown');
});
