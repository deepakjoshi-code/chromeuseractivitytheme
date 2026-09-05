/**
 * Stability engine tests (PRD §7.3, gap G-03).
 * Time is injected everywhere, so none of these sleep or flake.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, ingest, decide, commit, decayScores, toConfidence,
  topCategory, evidenceOf, DEFAULT_CONFIG
} from '../../src/core/scoring.js';
import { NEUTRAL } from '../../src/core/taxonomy.js';

const C = DEFAULT_CONFIG;
const hit = (category, confidence = 0.8) => ({ category, confidence });

/** Drive a sequence of [category, confidence, dtMs] and return the trace. */
function run(steps, config = C) {
  let state = createState(0);
  let t = 0;
  const trace = [];
  for (const [category, confidence, dt] of steps) {
    t += dt;
    state = ingest(state, hit(category, confidence), t, config);
    const decision = decide(state, t, config);
    state = commit(state, decision, t);
    trace.push({ t, decision, active: state.active });
  }
  return { state, trace, t };
}

/* --------------------------------------------------------------- basics */

test('a fresh state starts neutral with no evidence', () => {
  const state = createState(0);
  assert.equal(state.active, NEUTRAL);
  assert.deepEqual(state.scores, {});
  assert.equal(topCategory(state.scores), null);
});

test('confidence is bounded, monotonic and zero for no evidence', () => {
  assert.equal(toConfidence(0), 0);
  assert.equal(toConfidence(-5), 0);
  assert.ok(toConfidence(1) < toConfidence(2));
  assert.ok(toConfidence(1e6) < 1);
});

/* ---------------------------------------------------------------- dwell */

test('a single signal does not change the theme (dwell, mechanism 5)', () => {
  const { trace } = run([['celebration', 0.8, 100]]);
  assert.equal(trace[0].decision.changed, false);
  assert.equal(trace[0].decision.reason, 'dwell-not-met');
});

test('a second corroborating signal satisfies dwell and the theme changes', () => {
  const { trace } = run([['celebration', 0.8, 100], ['celebration', 0.8, 200]]);
  assert.equal(trace[1].decision.changed, true);
  assert.equal(trace[1].decision.category, 'celebration');
});

test('dwell can also be satisfied by elapsed time alone', () => {
  const { trace } = run([['celebration', 0.9, 100], ['celebration', 0.05, C.dwellMs + 100]]);
  assert.equal(trace[1].decision.changed, true);
});

/* ---------------------------------------------------------------- floor */

test('weak evidence never crosses the confidence floor', () => {
  const { trace } = run([
    ['coding', 0.12, 100], ['coding', 0.12, 200], ['coding', 0.12, 300]
  ]);
  assert.ok(trace.every((step) => !step.decision.changed));
  assert.ok(trace.some((step) => step.decision.reason === 'below-floor'));
});

/* --------------------------------------------------------------- margin */

test('a challenger with only a slight lead is held off by the margin', () => {
  let state = createState(0);
  state = ingest(state, hit('celebration', 0.9), 100, C);
  state = ingest(state, hit('celebration', 0.9), 200, C);
  state = commit(state, decide(state, 200, C), 200);
  assert.equal(state.active, 'celebration');

  // Give coding a lead too small to clear 1.35x, while the incumbent is still fresh.
  state = ingest(state, hit('coding', 0.9), 8000, C);
  state = ingest(state, hit('coding', 0.9), 8100, C);
  const decision = decide(state, 8200, C);
  assert.ok(8200 - 200 < C.stalenessMs, 'the staleness waiver must not be in play here');
  assert.equal(decision.changed, false);
  assert.equal(decision.reason, 'below-margin');
});

test('a decisive challenger clears the margin and takes over', () => {
  let state = createState(0);
  state = ingest(state, hit('celebration', 0.5), 100, C);
  state = ingest(state, hit('celebration', 0.5), 200, C);
  state = commit(state, decide(state, 200, C), 200);

  let t = 200;
  for (let i = 0; i < 4; i++) { t += 4000; state = ingest(state, hit('coding', 0.9), t, C); }
  t += 4000;
  const decision = decide(state, t, C);
  assert.equal(decision.changed, true);
  assert.equal(decision.category, 'coding');
});

/*
 * The regression this file exists for: the margin was originally specified as an
 * absolute gap on saturated confidence. Because confidence saturates, a long
 * session would drive every category toward 1.0 and no challenger could ever
 * clear a fixed absolute gap — the first theme of the day would lock in forever.
 */
test('REGRESSION: a heavily reinforced incumbent is displaced in bounded time', () => {
  let state = createState(0);
  let t = 0;
  for (let i = 0; i < 25; i++) { t += 1000; state = ingest(state, hit('celebration', 0.95), t, C); }
  state = commit(state, decide(state, t, C), t);
  assert.equal(state.active, 'celebration');

  // Both contexts are now saturated at the evidence ceiling.
  const lastCelebration = t;
  for (let i = 0; i < 10; i++) { t += 1000; state = ingest(state, hit('coding', 0.95), t, C); }

  assert.ok(evidenceOf(decayScores(state.scores, state.decayedAt, t, C), 'coding') > 2.5);
  assert.ok(t - lastCelebration < C.stalenessMs, 'the incumbent is still fresh here');
  assert.equal(decide(state, t, C).changed, false,
    'while both contexts are saturated and recent, the incumbent holds');

  // Once celebration has been quiet past the staleness window, coding takes over.
  const after = lastCelebration + C.stalenessMs + 1000;
  const decision = decide(state, after, C);
  assert.equal(decision.changed, true,
    'saturation must not make an entrenched incumbent unbeatable');
  assert.equal(decision.category, 'coding');
  assert.ok(after - lastCelebration <= 20000,
    'a decisive switch must land within ~20s, not most of a minute');
});

test('two concurrently active contexts do not flip-flop', () => {
  let state = createState(0);
  let t = 0;
  state = ingest(state, hit('coding', 0.9), (t += 1000), C);
  state = ingest(state, hit('coding', 0.9), (t += 1000), C);
  state = commit(state, decide(state, t, C), t);
  assert.equal(state.active, 'coding');

  // Interleave the two contexts steadily for five minutes.
  let changes = 0;
  for (let i = 0; i < 60; i++) {
    t += 5000;
    state = ingest(state, hit(i % 2 === 0 ? 'work' : 'coding', 0.9), t, C);
    const decision = decide(state, t, C);
    if (decision.changed) changes++;
    state = commit(state, decision, t);
  }
  assert.ok(changes <= 1,
    `an interleaved session must not strobe (saw ${changes} changes)`);
});

/* ------------------------------------------------------------ staleness */

test('the margin is waived once the incumbent has gone quiet', () => {
  let state = createState(0);
  state = ingest(state, hit('celebration', 0.9), 100, C);
  state = ingest(state, hit('celebration', 0.9), 200, C);
  state = commit(state, decide(state, 200, C), 200);

  // Long enough for the incumbent to be stale, short enough that it has not decayed away.
  const later = 200 + C.stalenessMs + 1000;
  state = ingest(state, hit('coding', 0.8), later, C);
  state = ingest(state, hit('coding', 0.8), later + 100, C);
  state = ingest(state, hit('coding', 0.8), later + 200, C);
  state = ingest(state, hit('coding', 0.8), later + 300, C);   // satisfies dwell
  const decision = decide(state, later + 400, C);
  assert.equal(decision.changed, true, 'the user has plainly moved on');
  assert.equal(decision.category, 'coding');
});

/* ----------------------------------------------------------- rate limit */

test('two accepted changes cannot happen inside the rate-limit window', () => {
  let state = createState(0);
  state = ingest(state, hit('celebration', 0.9), 100, C);
  state = ingest(state, hit('celebration', 0.9), 200, C);
  state = commit(state, decide(state, 200, C), 200);

  let t = 300;
  for (let i = 0; i < 6; i++) { t += 200; state = ingest(state, hit('coding', 0.95), t, C); }
  const decision = decide(state, t, C);
  assert.equal(decision.changed, false);
  assert.equal(decision.reason, 'rate-limited');
  assert.ok(t - 200 < C.rateLimitMs);
});

test('the very first change is not rate-limited', () => {
  const { trace } = run([['coding', 0.9, 10], ['coding', 0.9, 10]]);
  assert.equal(trace[1].decision.changed, true);
});

/* ----------------------------------------------------------------- decay */

test('evidence halves every half-life', () => {
  const scores = { coding: { value: 1, lastSeen: 0 } };
  const after = decayScores(scores, 0, C.halfLifeMs, C);
  assert.ok(Math.abs(after.coding.value - 0.5) < 1e-9);
});

test('decay prunes negligible evidence so session state stays small', () => {
  const scores = { coding: { value: 1, lastSeen: 0 } };
  assert.deepEqual(decayScores(scores, 0, C.halfLifeMs * 20, C), {});
});

test('decay never runs backwards for a non-advancing clock', () => {
  const scores = { coding: { value: 1, lastSeen: 0 } };
  assert.equal(decayScores(scores, 100, 50, C).coding.value, 1);
});

test('a fully decayed context drifts home to neutral', () => {
  let state = createState(0);
  state = ingest(state, hit('celebration', 0.9), 100, C);
  state = ingest(state, hit('celebration', 0.9), 200, C);
  state = commit(state, decide(state, 200, C), 200);
  assert.equal(state.active, 'celebration');

  const decision = decide(state, 200 + C.halfLifeMs * 20, C);
  assert.equal(decision.changed, true);
  assert.equal(decision.category, NEUTRAL);
  assert.equal(decision.reason, 'evidence-decayed');
});

/* -------------------------------------------------------------- ceiling */

test('evidence is capped so one long session cannot ossify', () => {
  let state = createState(0);
  let t = 0;
  for (let i = 0; i < 200; i++) { t += 10; state = ingest(state, hit('coding', 0.99), t, C); }
  assert.ok(evidenceOf(state.scores, 'coding') <= C.maxEvidence + 1e-9);
});

/* ------------------------------------------------------------- neutrals */

test('neutral and zero-confidence classifications add no evidence', () => {
  let state = createState(0);
  state = ingest(state, hit(NEUTRAL, 0.9), 100, C);
  state = ingest(state, hit('coding', 0), 200, C);
  state = ingest(state, null, 300, C);
  assert.deepEqual(state.scores, {});
  assert.equal(decide(state, 300, C).changed, false);
});

test('commit is a no-op for a rejected decision', () => {
  const state = createState(0);
  assert.equal(commit(state, { changed: false }, 500), state);
});

test('reducers do not mutate the state they are given', () => {
  const state = createState(0);
  const frozen = JSON.stringify(state);
  ingest(state, hit('coding', 0.8), 100, C);
  decide(state, 100, C);
  commit(state, { changed: true, category: 'coding' }, 100);
  assert.equal(JSON.stringify(state), frozen);
});
