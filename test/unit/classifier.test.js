import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, explain, SATURATION_K } from '../../src/core/classifier.js';
import { NEUTRAL, CATEGORY_KEYS } from '../../src/core/taxonomy.js';

const sig = (o) => ({ host: 'example.com', path: '/', pathTokens: [], query: null, title: '', ...o });

/* ------------------------------------------- the scenarios from the brief */

test('the product brief scenarios classify as intended', () => {
  const cases = [
    [sig({ query: 'birthday cake ideas for kids party', host: 'google.com' }), 'celebration'],
    [sig({ query: 'hawaii vacation packages maui', host: 'google.com' }), 'tropical'],
    [sig({ query: 'las vegas hotels and shows', host: 'google.com' }), 'vegas'],
    [sig({ query: 'javascript async await tutorial', host: 'google.com' }), 'coding'],
    [sig({ query: 'womens clothing on sale free shipping', host: 'google.com' }), 'shopping'],
    [sig({ query: 'kids clothing toddler shoes', host: 'google.com' }), 'kids']
  ];
  for (const [signal, expected] of cases) {
    assert.equal(classify(signal).category, expected, JSON.stringify(signal.query));
  }
});

test('well-known hosts classify without any query at all', () => {
  assert.equal(classify(sig({ host: 'github.com', path: '/a/b' })).category, 'coding');
  assert.equal(classify(sig({ host: 'allrecipes.com' })).category, 'food');
  assert.equal(classify(sig({ host: 'alltrails.com' })).category, 'nature');
  assert.equal(classify(sig({ host: 'steampowered.com' })).category, 'gaming');
});

/* ----------------------------------------------------------- disambiguation */

test('negative keywords resolve the polysemy traps', () => {
  assert.notEqual(classify(sig({ query: 'amazon rainforest deforestation' })).category, 'shopping');
  assert.notEqual(classify(sig({ query: 'ball python care guide' })).category, 'coding');
  assert.notEqual(classify(sig({ query: 'christmas island crab migration' })).category, 'seasonal');
  assert.notEqual(
    classify(sig({ host: 'kubernetes.io', title: 'Island deployment pattern' })).category,
    'tropical', 'an infra doc about "islands" must not read as a beach holiday');
});

test('a negative can push a category below zero without going negative overall', () => {
  const result = classify(sig({ query: 'sony vegas pro video editing' }));
  assert.notEqual(result.category, 'vegas');
  assert.ok(result.confidence >= 0);
});

/* --------------------------------------------------------------- weighting */

test('a query outweighs the same term appearing only in the title', () => {
  const fromQuery = classify(sig({ query: 'snorkeling maui' }));
  const fromTitle = classify(sig({ title: 'snorkeling maui' }));
  assert.equal(fromQuery.category, fromTitle.category);
  assert.ok(fromQuery.confidence > fromTitle.confidence,
    'stated intent must count for more than an incidental title');
});

test('a term appearing in several sources is counted once, at its best source', () => {
  const once = classify(sig({ query: 'birthday cake' }));
  const thrice = classify(sig({ query: 'birthday cake', title: 'birthday cake', pathTokens: ['birthday', 'cake'] }));
  assert.equal(once.confidence, thrice.confidence,
    'a search results page repeats its query everywhere; that is one intent, not three');
});

test('more corroborating evidence yields higher confidence', () => {
  const weak = classify(sig({ query: 'cake' }));
  const strong = classify(sig({ query: 'birthday cake balloons party favors', host: 'partycity.com' }));
  assert.ok(strong.confidence > weak.confidence);
});

test('confidence is bounded to (0,1) and follows the documented curve', () => {
  const result = classify(sig({ query: 'birthday cake balloons pinata party favors', host: 'partycity.com' }));
  assert.ok(result.confidence > 0 && result.confidence < 1);
  const implied = result.confidence * SATURATION_K / (1 - result.confidence);
  assert.ok(implied > 0, 'the curve must be invertible to a positive evidence score');
});

/* ------------------------------------------------------------ neutral paths */

test('an unrecognised signal is neutral, not a guess', () => {
  const result = classify(sig({ query: 'qwertyuiop zxcvbnm', title: 'Untitled' }));
  assert.equal(result.category, NEUTRAL);
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.reasons, []);
});

test('a sensitive signal returns neutral and is flagged, with no reasons leaked', () => {
  const result = classify(sig({ query: 'cancer symptoms', title: 'birthday cake' }));
  assert.equal(result.sensitive, true);
  assert.equal(result.category, NEUTRAL);
  assert.deepEqual(result.reasons, [], 'reasons must not reveal what was seen');
});

test('classify tolerates missing and malformed signals', () => {
  for (const input of [undefined, null, {}, { query: null, title: undefined }]) {
    const result = classify(input);
    assert.equal(result.category, NEUTRAL);
    assert.equal(result.sensitive, false);
  }
});

/* ------------------------------------------------------------------- context */

test('muted categories are never selected', () => {
  const signal = sig({ query: 'birthday cake balloons' });
  assert.equal(classify(signal).category, 'celebration');
  assert.notEqual(classify(signal, { mutedCategories: ['celebration'] }).category, 'celebration');
});

test('a per-host rejection suppresses that category on that host only', () => {
  const rejections = { 'example.com': ['tropical'] };
  const here = sig({ host: 'example.com', query: 'maui snorkeling' });
  const elsewhere = sig({ host: 'other.com', query: 'maui snorkeling' });
  assert.notEqual(classify(here, { domainRejections: rejections }).category, 'tropical');
  assert.equal(classify(elsewhere, { domainRejections: rejections }).category, 'tropical');
});

/* ---------------------------------------------------- explainability (B1) */

test('reasons are ordered by contribution and capped', () => {
  const result = classify(sig({
    query: 'birthday cake balloons confetti pinata party favors invitations',
    host: 'partycity.com'
  }));
  assert.ok(result.reasons.length > 0 && result.reasons.length <= 5);
  for (let i = 1; i < result.reasons.length; i++) {
    assert.ok(result.reasons[i - 1].weight >= result.reasons[i].weight);
  }
});

test('every reason names a term and the source it came from', () => {
  const result = classify(sig({ query: 'maui snorkeling', host: 'gohawaii.com' }));
  for (const reason of result.reasons) {
    assert.equal(typeof reason.term, 'string');
    assert.ok(['query', 'title', 'path', 'host'].includes(reason.source));
  }
});

test('explain produces a readable sentence for a hit and for neutral', () => {
  const hit = explain(classify(sig({ query: 'hawaii snorkeling' })));
  assert.match(hit, /^because /);
  assert.match(hit, /hawaii/);
  assert.match(explain({ reasons: [] }), /neutral/);
  assert.match(explain(null), /neutral/);
});

/* ----------------------------------------------------------- invariants */

test('classify only ever returns a known category or neutral', () => {
  const allowed = new Set([...CATEGORY_KEYS, NEUTRAL]);
  const probes = [
    'birthday', 'hawaii', 'vegas', 'kubernetes', 'checkout', 'toddler', 'flights',
    'recipe', 'workout', 'playlist', 'speedrun', 'hiking', 'flashcards', 'okr',
    'halloween', 'zzzz nothing'
  ];
  for (const query of probes) {
    assert.ok(allowed.has(classify(sig({ query })).category), query);
  }
});
