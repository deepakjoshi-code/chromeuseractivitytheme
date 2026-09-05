/**
 * scoring.js — context stability (PRD §7.3, gap G-03).
 *
 * Naive per-signal theming turns the browser into a strobe light. This module
 * is the damper. It is a pure reducer: `now` is always injected, never read
 * from a clock, which is what makes MV3's lazy decay (ARCHITECTURE.md §5) and
 * deterministic tests both possible from one implementation.
 *
 * Mechanisms (PRD §7.3):
 *   1. decay       — evidence has a 2-minute half-life
 *   2. floor       — never theme below 0.35 confidence
 *   3. margin      — a challenger must carry 35% more evidence than the incumbent
 *   4. staleness   — unless the incumbent has gone quiet for 15s, in which case
 *                    the margin is waived (the user has plainly moved on)
 *   5. dwell       — and the challenger must hold the lead for 1.5s or 2 signals
 *   6. rate limit  — at most one change per 10s
 *
 * IMPLEMENTATION NOTE (deviation from PRD §7.3 as first drafted):
 * The margin was specified as an absolute +0.15 on confidence. That is wrong.
 * Confidence saturates (`v/(v+K)`), so as evidence accumulates every category
 * crowds toward 1.0 and a fixed absolute margin becomes unreachable — the
 * incumbent would lock in permanently after a long session. The margin is
 * therefore applied in the *evidence* domain as a scale-free ratio, which
 * behaves identically at low evidence and correctly at high evidence. The
 * confidence floor stays in the saturated domain, where an absolute threshold
 * is exactly what is wanted. PRD §7.3 has been updated to match.
 */

import { NEUTRAL } from './taxonomy.js';

export const DEFAULT_CONFIG = {
  confidenceFloor: 0.35,
  /** Challenger must carry this much more evidence than the incumbent (1.35x). */
  switchRatio: 0.35,
  /**
   * If the incumbent context has had no reinforcement for this long, waive the
   * ratio entirely. Lowered from 45s after real-browser testing: switching from
   * holiday-planning to a GitHub session left the browser on the old theme for
   * most of a minute, because both contexts sat at the evidence ceiling and the
   * ratio can never be cleared by a tie. 15s of continuous new-context browsing
   * is an unambiguous signal that the user has moved on, and interleaved
   * browsing never reaches it (the anti-strobe test pins that).
   */
  stalenessMs: 15 * 1000,
  dwellMs: 1500,
  dwellSignals: 2,
  /*
   * Half-life. Tuned down from the PRD's original 5 minutes: this product
   * answers "what are you doing NOW", and at a 5-minute half-life a morning's
   * context still outweighs the last two minutes of browsing. At 2 minutes a
   * genuine context switch resolves in well under a minute while dwell, the
   * floor and the rate limit still absorb short-timescale noise.
   */
  halfLifeMs: 2 * 60 * 1000,
  rateLimitMs: 10 * 1000,
  /** Evidence below this is pruned so session state stays small. */
  pruneBelow: 0.02,
  /** Ceiling on accumulated evidence, so one long session cannot ossify. */
  maxEvidence: 3.0,
  /** Saturating curve for accumulated evidence -> 0..1 confidence. */
  saturationK: 1.0
};

export function createState(now = 0) {
  return {
    /** category -> { value, lastSeen } */
    scores: {},
    decayedAt: now,
    active: NEUTRAL,
    activeSince: now,
    lastChangeAt: 0,   // 0 = never changed, so the first change is not rate-limited
    leader: null,
    leaderSince: 0,
    leaderSignals: 0
  };
}

/** Accumulated evidence -> bounded confidence. Monotonic. */
export function toConfidence(evidence, config = DEFAULT_CONFIG) {
  if (!(evidence > 0)) return 0;
  return evidence / (evidence + config.saturationK);
}

/** Bring every score forward to `now` with an exponential half-life. Pure. */
export function decayScores(scores, from, now, config = DEFAULT_CONFIG) {
  const elapsed = now - from;
  const factor = elapsed > 0 ? Math.pow(0.5, elapsed / config.halfLifeMs) : 1;
  const next = {};
  for (const [category, entry] of Object.entries(scores)) {
    const value = entry.value * factor;
    if (value >= config.pruneBelow) next[category] = { value, lastSeen: entry.lastSeen };
  }
  return next;
}

/** The category with the most accumulated evidence, or null. */
export function topCategory(scores) {
  let best = null;
  let bestValue = 0;
  for (const [category, entry] of Object.entries(scores)) {
    if (entry.value > bestValue) {
      bestValue = entry.value;
      best = category;
    }
  }
  return best;
}

/** Convenience for callers and tests. */
export function evidenceOf(scores, category) {
  const entry = scores[category];
  return entry ? entry.value : 0;
}

/**
 * Fold one classification into the state.
 *
 * Neutral and sensitive classifications carry no evidence — they only advance
 * decay, which is how the theme drifts home when the user stops reinforcing a
 * context.
 */
export function ingest(state, classification, now, config = DEFAULT_CONFIG) {
  const scores = decayScores(state.scores, state.decayedAt, now, config);
  const next = { ...state, scores, decayedAt: now };

  const category = classification && classification.category;
  const confidence = (classification && classification.confidence) || 0;
  if (!category || category === NEUTRAL || confidence <= 0) return next;

  const previous = scores[category] ? scores[category].value : 0;
  scores[category] = {
    value: Math.min(previous + confidence, config.maxEvidence),
    lastSeen: now
  };

  // Track how long the front-runner has been in front (dwell).
  const leader = topCategory(scores);
  if (leader && leader === state.leader) {
    next.leaderSignals = (state.leaderSignals || 0) + 1;
  } else {
    next.leader = leader;
    next.leaderSince = now;
    next.leaderSignals = 1;
  }
  return next;
}

/**
 * Decide whether the active theme should change.
 *
 * `reason` names the gate that blocked a change — it exists so tests and the
 * debug view can assert on *why* the engine held steady, not just that it did.
 */
export function decide(state, now, config = DEFAULT_CONFIG) {
  const scores = decayScores(state.scores, state.decayedAt, now, config);
  const incumbent = state.active || NEUTRAL;
  const incumbentEvidence = evidenceOf(scores, incumbent);
  const incumbentConfidence = toConfidence(incumbentEvidence, config);

  const hold = (reason) => ({
    changed: false,
    category: incumbent,
    confidence: incumbentConfidence,
    reason
  });

  const rateLimited = state.lastChangeAt && now - state.lastChangeAt < config.rateLimitMs;
  const challenger = topCategory(scores);

  // Nothing left with any evidence: drift home to neutral.
  if (!challenger) {
    if (incumbent === NEUTRAL) return hold('already-neutral');
    if (rateLimited) return hold('rate-limited');
    return { changed: true, category: NEUTRAL, confidence: 0, reason: 'evidence-decayed' };
  }

  if (challenger === incumbent) return hold('unchanged');

  const challengerEvidence = evidenceOf(scores, challenger);
  const challengerConfidence = toConfidence(challengerEvidence, config);

  if (challengerConfidence < config.confidenceFloor) return hold('below-floor');

  // Margin, waived once the incumbent has clearly gone quiet.
  const incumbentEntry = scores[incumbent];
  const incumbentStale =
    !incumbentEntry || now - incumbentEntry.lastSeen >= config.stalenessMs;
  if (!incumbentStale && challengerEvidence < incumbentEvidence * (1 + config.switchRatio)) {
    return hold('below-margin');
  }

  const heldMs = now - (state.leaderSince || now);
  const dwellOk = heldMs >= config.dwellMs || (state.leaderSignals || 0) >= config.dwellSignals;
  if (state.leader === challenger && !dwellOk) return hold('dwell-not-met');

  if (rateLimited) return hold('rate-limited');

  return {
    changed: true,
    category: challenger,
    confidence: challengerConfidence,
    reason: 'accepted'
  };
}

/** Apply an accepted decision. Pure. */
export function commit(state, decision, now) {
  if (!decision.changed) return state;
  return {
    ...state,
    active: decision.category,
    activeSince: now,
    lastChangeAt: now,
    leader: decision.category,
    leaderSince: now,
    leaderSignals: 0
  };
}
