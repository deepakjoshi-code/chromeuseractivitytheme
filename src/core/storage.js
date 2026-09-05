/**
 * storage.js — the only module that knows chrome.storage exists.
 *
 * The chrome namespace is injected (defaulting to the real global) so the whole
 * persistence layer runs under plain Node against test/helpers/chrome-mock.js
 * with no browser and no bundler.
 */

import { KEYS } from './messages.js';
import { NEUTRAL } from './taxonomy.js';

export const DEFAULT_SETTINGS = {
  enabled: true,
  /** 'off' | 'subtle' | 'balanced' | 'expressive' (PRD §7.4) */
  intensity: 'balanced',
  /** 'system' | 'light' | 'dark' */
  scheme: 'system',
  /** Ambient page overlay, OFF by default (PRD A7 / gap G-07). */
  ambient: false,
  /** Hosts where the ambient overlay is permitted. */
  ambientSites: [],
  /** Categories the user never wants to see (PRD B7). */
  mutedCategories: [],
  /** Hosts that are never classified or themed (PRD B8). */
  blocklist: [],
  /** Show the "why" line on the new tab. */
  showReason: true
};

/** PRD P7: the activity log is a bounded ring buffer. */
export const LOG_LIMIT = 50;

function api(chromeNs) {
  const ns = chromeNs || (typeof chrome !== 'undefined' ? chrome : undefined);
  if (!ns || !ns.storage) throw new Error('chrome.storage unavailable');
  return ns.storage;
}

async function readLocal(chromeNs, key, fallback) {
  const result = await api(chromeNs).local.get(key);
  return result && result[key] !== undefined ? result[key] : fallback;
}

async function writeLocal(chromeNs, key, value) {
  await api(chromeNs).local.set({ [key]: value });
  return value;
}

/* ------------------------------------------------------------------ settings */

export async function getSettings(chromeNs) {
  const stored = await readLocal(chromeNs, KEYS.SETTINGS, {});
  // Merge so a settings object written by an older version gains new defaults.
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

export async function updateSettings(chromeNs, patch) {
  const current = await getSettings(chromeNs);
  const next = { ...current, ...(patch || {}) };
  await writeLocal(chromeNs, KEYS.SETTINGS, next);
  return next;
}

/* -------------------------------------------------------------- active theme */

export async function getActiveTheme(chromeNs) {
  return readLocal(chromeNs, KEYS.ACTIVE, {
    category: NEUTRAL,
    confidence: 0,
    reasons: [],
    at: 0
  });
}

export async function setActiveTheme(chromeNs, active) {
  return writeLocal(chromeNs, KEYS.ACTIVE, active);
}

/* ------------------------------------------------------------------- pinning */

export async function getPin(chromeNs) {
  return readLocal(chromeNs, KEYS.PIN, null);
}

/**
 * @param {string} category
 * @param {number|null} until epoch ms, or null for indefinite (PRD B2)
 */
export async function setPin(chromeNs, category, until = null) {
  return writeLocal(chromeNs, KEYS.PIN, { category, until });
}

export async function clearPin(chromeNs) {
  return writeLocal(chromeNs, KEYS.PIN, null);
}

/** A pin with an elapsed `until` is treated as absent and cleaned up lazily. */
export async function getActivePin(chromeNs, now) {
  const pin = await getPin(chromeNs);
  if (!pin) return null;
  if (pin.until && now >= pin.until) {
    await clearPin(chromeNs);
    return null;
  }
  return pin;
}

/* -------------------------------------------------------------- activity log */

export async function getLog(chromeNs) {
  const log = await readLocal(chromeNs, KEYS.LOG, []);
  return Array.isArray(log) ? log : [];
}

/** Newest first, hard-capped at LOG_LIMIT (PRD P7). */
export async function appendLog(chromeNs, entry) {
  const log = await getLog(chromeNs);
  const next = [entry, ...log].slice(0, LOG_LIMIT);
  await writeLocal(chromeNs, KEYS.LOG, next);
  return next;
}

export async function clearLog(chromeNs) {
  return writeLocal(chromeNs, KEYS.LOG, []);
}

/* ------------------------------------------------------------ "Not this" (B3) */

export async function getRejections(chromeNs) {
  return readLocal(chromeNs, KEYS.REJECTIONS, {});
}

export async function addRejection(chromeNs, host, category) {
  if (!host || !category) return getRejections(chromeNs);
  const rejections = await getRejections(chromeNs);
  const existing = rejections[host] || [];
  if (!existing.includes(category)) {
    rejections[host] = [...existing, category];
    await writeLocal(chromeNs, KEYS.REJECTIONS, rejections);
  }
  return rejections;
}

/* ------------------------------------------------- context state (session) */

/**
 * Session storage, not local: the MV3 worker is killed on idle, so state must
 * survive a wake — but it should NOT survive a browser restart. Context is a
 * property of the current sitting (ARCHITECTURE.md §5).
 */
export async function getContextState(chromeNs) {
  const storage = api(chromeNs);
  if (!storage.session) return null;
  const result = await storage.session.get(KEYS.CONTEXT);
  return (result && result[KEYS.CONTEXT]) || null;
}

export async function setContextState(chromeNs, state) {
  const storage = api(chromeNs);
  if (!storage.session) return state;
  await storage.session.set({ [KEYS.CONTEXT]: state });
  return state;
}

/* --------------------------------------------------------- erase all (B11) */

export async function eraseAll(chromeNs) {
  const storage = api(chromeNs);
  await storage.local.clear();
  if (storage.session) await storage.session.clear();
  await writeLocal(chromeNs, KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}
