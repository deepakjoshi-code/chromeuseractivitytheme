/**
 * classifier.js — the swappable decision seam.
 *
 * Contract (ARCHITECTURE.md §3 / PRD-REVIEW A-01):
 *
 *   classify(signal, ctx) -> { category, confidence, reasons, sensitive }
 *
 * Any future implementation (e.g. an on-device embedding model) must satisfy
 * exactly this signature so the swap stays contained to this file.
 *
 * v1 is a deterministic weighted keyword + host-prior scorer. It was chosen
 * over a model because PRD B1 requires the popup to explain itself in one
 * sentence — `reasons` is the data that makes that possible.
 */

import { CATEGORIES, SOURCE_WEIGHTS, NEUTRAL } from './taxonomy.js';
import { normalizeText, containsTerm, hostMatches } from './text.js';
import { isSensitiveSignal } from './privacy.js';

/**
 * Saturation constant for the score -> confidence curve `c = s / (s + K)`.
 *
 * K = 3.0 means a single weight-3 keyword in a search query lands at 0.50,
 * two strong signals at ~0.67, and a host prior plus two keywords at ~0.75.
 * The curve is bounded, monotonic, and comparable across categories, which is
 * what the hysteresis margin in scoring.js relies on.
 */
export const SATURATION_K = 3.0;

const EMPTY_CTX = { mutedCategories: [], domainRejections: {} };

/**
 * Find the strongest source in which `term` appears.
 * Returns { multiplier, source } or null.
 *
 * We take the MAX rather than the sum: a search results page repeats the query
 * in its title and often its path, and summing would triple-count one intent.
 */
function bestSourceFor(term, texts) {
  let best = null;
  for (const { source, normalized } of texts) {
    if (!containsTerm(normalized, term)) continue;
    const multiplier = SOURCE_WEIGHTS[source];
    if (!best || multiplier > best.multiplier) best = { multiplier, source };
  }
  return best;
}

/** Score one category against the prepared signal texts. */
function scoreCategory(key, category, signal, texts) {
  let score = 0;
  const reasons = [];

  for (const [term, weight] of category.keywords) {
    const hit = bestSourceFor(term, texts);
    if (!hit) continue;
    const contribution = weight * hit.multiplier;
    score += contribution;
    reasons.push({ term, weight: contribution, source: hit.source });
  }

  for (const [pattern, weight] of category.hosts) {
    if (!hostMatches(signal.host, signal.path, pattern)) continue;
    const contribution = weight * SOURCE_WEIGHTS.host;
    score += contribution;
    reasons.push({ term: pattern, weight: contribution, source: 'host' });
  }

  // Negatives are decisive disambiguators ("amazon rainforest" is not shopping,
  // "island deployment" is not tropical). They subtract at full source weight.
  for (const [term, weight] of category.negatives || []) {
    const hit = bestSourceFor(term, texts);
    if (!hit) continue;
    score -= weight * hit.multiplier;
  }

  if (score <= 0) return null;

  reasons.sort((a, b) => b.weight - a.weight);
  return { key, score, reasons };
}

/**
 * @param {{host?:string, path?:string, pathTokens?:string[], query?:string|null, title?:string}} signal
 * @param {{mutedCategories?:string[], domainRejections?:Record<string,string[]>}} [ctx]
 */
export function classify(signal, ctx = EMPTY_CTX) {
  const safeSignal = signal || {};

  // The firewall runs first and unconditionally (PRD P4).
  if (isSensitiveSignal(safeSignal)) {
    return { category: NEUTRAL, confidence: 0, reasons: [], sensitive: true };
  }

  const texts = [
    { source: 'query', normalized: normalizeText(safeSignal.query) },
    { source: 'title', normalized: normalizeText(safeSignal.title) },
    { source: 'path', normalized: normalizeText((safeSignal.pathTokens || []).join(' ')) }
  ];

  const muted = new Set(ctx.mutedCategories || []);
  const rejectedHere = new Set(
    ((ctx.domainRejections || {})[safeSignal.host]) || []
  );

  let winner = null;
  for (const [key, category] of Object.entries(CATEGORIES)) {
    if (muted.has(key) || rejectedHere.has(key)) continue;
    const result = scoreCategory(key, category, safeSignal, texts);
    if (!result) continue;
    if (!winner || result.score > winner.score) winner = result;
  }

  if (!winner) {
    return { category: NEUTRAL, confidence: 0, reasons: [], sensitive: false };
  }

  return {
    category: winner.key,
    confidence: winner.score / (winner.score + SATURATION_K),
    reasons: winner.reasons.slice(0, 5),
    sensitive: false
  };
}

/**
 * Render `reasons` as the one-line human explanation the popup shows (PRD B1).
 * e.g. "because 'hawaii', 'snorkeling' in your search"
 */
export function explain(classification) {
  const reasons = (classification && classification.reasons) || [];
  if (reasons.length === 0) return 'no strong signal — showing a neutral theme';

  const sourceLabel = {
    query: 'in your search',
    host: 'from the site you are on',
    title: 'in the page title',
    path: 'in the page address'
  };

  const top = reasons.slice(0, 3);
  const terms = top.map((r) => `“${r.term}”`).join(', ');
  const source = sourceLabel[top[0].source] || 'in what you are viewing';
  return `because ${terms} ${source}`;
}
