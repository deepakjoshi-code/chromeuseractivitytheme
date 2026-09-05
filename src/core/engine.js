/**
 * engine.js — pipeline orchestration (ARCHITECTURE.md §4).
 *
 * Deliberately NOT the service worker. The worker is a thin shell that binds
 * chrome events to these functions; everything decision-shaped lives here, where
 * it runs under plain Node against a mock chrome namespace. `now` is always
 * injected for the same reason it is in scoring.js.
 */

import { classify, explain } from './classifier.js';
import { sanitizeUrl, isBlocklisted, hostInList, redactForLog, isSensitiveSignal } from './privacy.js';
import { createState, ingest, decide, commit, DEFAULT_CONFIG } from './scoring.js';
import { NEUTRAL } from './taxonomy.js';
import { getTheme, THEMES, INTENSITY } from './themes.js';
import * as store from './storage.js';

/** Every outcome the pipeline can produce. Tests assert on these. */
export const OUTCOME = {
  DISABLED: 'disabled',
  IGNORED_URL: 'ignored-url',
  BLOCKLISTED: 'blocklisted',
  SENSITIVE: 'sensitive',
  PINNED: 'pinned',
  NO_CHANGE: 'no-change',
  CHANGED: 'changed'
};

async function loadContextState(chromeNs, now) {
  const stored = await store.getContextState(chromeNs);
  if (stored && stored.scores && typeof stored.decayedAt === 'number') return stored;
  return createState(now);
}

/**
 * Process one browsing signal.
 *
 * @param {object} chromeNs
 * @param {{url:string, title?:string}} raw
 * @param {number} now epoch ms
 * @returns {Promise<{outcome:string, category?:string, confidence?:number, reasons?:Array, reason?:string}>}
 */
export async function handleSignal(chromeNs, raw, now) {
  const settings = await store.getSettings(chromeNs);
  if (!settings.enabled) return { outcome: OUTCOME.DISABLED };

  const sanitized = sanitizeUrl(raw && raw.url);
  if (!sanitized) return { outcome: OUTCOME.IGNORED_URL };

  if (isBlocklisted(sanitized.host, settings.blocklist)) {
    return { outcome: OUTCOME.BLOCKLISTED };
  }

  const signal = { ...sanitized, title: (raw && raw.title) || '' };

  /*
   * PRD P4 — the firewall. Note what this does NOT do: it does not force the
   * theme to neutral.
   *
   * Reverting to neutral the instant a sensitive page is opened is itself a
   * signal. A partner watching the screen would learn that *something private*
   * is being read, which is most of the harm the firewall exists to prevent.
   * Holding the previous theme leaks nothing at all. So: abort silently, score
   * nothing, log nothing, change nothing. (PRD P4 updated to match.)
   */
  if (isSensitiveSignal(signal)) {
    return { outcome: OUTCOME.SENSITIVE };
  }

  // A pin outranks detection entirely (PRD B2).
  const pin = await store.getActivePin(chromeNs, now);
  if (pin) return { outcome: OUTCOME.PINNED, category: pin.category };

  const rejections = await store.getRejections(chromeNs);
  const classification = classify(signal, {
    mutedCategories: settings.mutedCategories,
    domainRejections: rejections
  });

  let state = await loadContextState(chromeNs, now);
  state = ingest(state, classification, now, DEFAULT_CONFIG);
  const decision = decide(state, now, DEFAULT_CONFIG);
  state = commit(state, decision, now);
  await store.setContextState(chromeNs, state);

  if (classification.category !== NEUTRAL && classification.confidence > 0) {
    await store.appendLog(chromeNs, redactForLog(signal, classification, now));
  }

  if (!decision.changed) {
    return {
      outcome: OUTCOME.NO_CHANGE,
      category: decision.category,
      confidence: decision.confidence,
      reason: decision.reason
    };
  }

  const active = {
    category: decision.category,
    confidence: decision.confidence,
    // Keep the winning classification's reasons only if it is the theme that won,
    // otherwise the explanation would describe the wrong category (PRD B1).
    reasons: decision.category === classification.category ? classification.reasons : [],
    at: now
  };
  await store.setActiveTheme(chromeNs, active);

  return {
    outcome: OUTCOME.CHANGED,
    category: active.category,
    confidence: active.confidence,
    reasons: active.reasons,
    reason: decision.reason
  };
}

/** Everything a page shell needs in one round trip (ARCHITECTURE.md §5). */
export async function getFullState(chromeNs, now) {
  const [settings, active, pin] = await Promise.all([
    store.getSettings(chromeNs),
    store.getActiveTheme(chromeNs),
    store.getActivePin(chromeNs, now)
  ]);

  const category = pin ? pin.category : active.category;
  const theme = getTheme(category);

  return {
    settings,
    active: { ...active, category },
    pin,
    explanation: pin
      ? 'pinned by you'
      : explain(active),
    theme: {
      key: category,
      label: theme.label,
      description: theme.description,
      motif: theme.motif
    }
  };
}

/** Manual theme selection (PRD B4). Applies immediately and pins nothing. */
export async function setThemeManually(chromeNs, category, now) {
  const key = THEMES[category] ? category : NEUTRAL;
  const active = { category: key, confidence: 1, reasons: [], at: now, manual: true };
  await store.setActiveTheme(chromeNs, active);
  return active;
}

/** Pin / unpin (PRD B2). */
export async function pinTheme(chromeNs, category, durationMs, now) {
  const key = THEMES[category] ? category : NEUTRAL;
  const until = durationMs && durationMs > 0 ? now + durationMs : null;
  await store.setPin(chromeNs, key, until);
  await store.setActiveTheme(chromeNs, {
    category: key, confidence: 1, reasons: [], at: now, manual: true
  });
  return { category: key, until };
}

export async function unpinTheme(chromeNs) {
  return store.clearPin(chromeNs);
}

/**
 * "Not this" (PRD B3 / gap G-05).
 *
 * Reverts to neutral AND records a per-host rejection so the same misfire does
 * not repeat on that site. Also clears the accumulated evidence for the rejected
 * category, otherwise the decayed score would immediately re-elect it.
 */
export async function rejectCurrent(chromeNs, host, now) {
  const active = await store.getActiveTheme(chromeNs);
  const category = active.category;
  if (category && category !== NEUTRAL) {
    await store.addRejection(chromeNs, host, category);
  }

  const state = await loadContextState(chromeNs, now);
  if (state.scores && state.scores[category]) delete state.scores[category];
  const cleared = { ...state, active: NEUTRAL, activeSince: now, lastChangeAt: now,
    leader: null, leaderSince: now, leaderSignals: 0 };
  await store.setContextState(chromeNs, cleared);

  await store.setActiveTheme(chromeNs, {
    category: NEUTRAL, confidence: 0, reasons: [], at: now
  });
  return { category: NEUTRAL, rejected: category, host };
}

/**
 * Whether the ambient overlay should run on this host right now (PRD A7).
 * Three independent gates, all of which must pass.
 */
export function shouldRunAmbient(settings, host) {
  if (!settings.enabled || !settings.ambient) return false;
  const level = INTENSITY[settings.intensity] || INTENSITY.balanced;
  if (!level.ambient) return false;
  if (isBlocklisted(host, settings.blocklist)) return false;
  const sites = settings.ambientSites || [];
  if (sites.length === 0) return false;   // explicit opt-in per site, never blanket
  return hostInList(host, sites);
}
