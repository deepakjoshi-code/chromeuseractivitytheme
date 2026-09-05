/**
 * service-worker.js — the MV3 shell.
 *
 * This file binds chrome.* events to engine.js and does nothing else clever.
 * All decisions live in core/, which is why this file has no tests of its own
 * and core/ has many (ARCHITECTURE.md §11).
 *
 * Lifecycle constraints (ARCHITECTURE.md §5): the worker is killed after ~30s
 * idle, so there is no long-lived in-memory state and no setInterval. Decay is
 * computed lazily from timestamps.
 */

import { MSG } from '../core/messages.js';
import * as engine from '../core/engine.js';
import * as store from '../core/storage.js';
import { getTheme, resolveTheme } from '../core/themes.js';
import { sanitizeUrl } from '../core/privacy.js';
import { NEUTRAL } from '../core/taxonomy.js';

/*
 * PRD P1, layer 3 of 3 — runtime zero-network guard.
 * The manifest CSP (`connect-src 'none'`) and the static repo scan are the other
 * two. This one makes an accidental future call fail loudly and locally.
 */
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
  try {
    Object.defineProperty(globalThis, name, {
      configurable: false,
      writable: false,
      value: function AuraNetworkBlocked() {
        throw new Error(`Aura: ${name} is blocked. This extension makes no network requests.`);
      }
    });
  } catch {
    // Some builds define these non-configurable; the CSP still covers us.
  }
}

const now = () => Date.now();

/* ----------------------------------------------------------------- badge */

async function paintBadge(category) {
  const theme = getTheme(category);
  try {
    await chrome.action.setBadgeBackgroundColor({ color: theme.light.accent });
    await chrome.action.setBadgeText({ text: ' ' });
    await chrome.action.setTitle({ title: `Aura — ${theme.label}` });
  } catch {
    // Action APIs can be unavailable during startup races. Non-fatal.
  }
}

/* ------------------------------------------------------------- broadcast */

/**
 * Best-effort fan-out. `runtime.sendMessage` rejects when nothing is listening,
 * which is the normal case, so the rejection is swallowed. Pages also pull state
 * on load rather than depending on this push (ARCHITECTURE.md §5).
 */
function broadcast(payload) {
  try {
    chrome.runtime.sendMessage({ type: MSG.THEME_CHANGED, payload }).catch(() => {});
  } catch {
    // no listeners
  }
}

/* --------------------------------------------------------------- ambient */

const AMBIENT_SCRIPT_ID = 'aura-ambient';

/**
 * The ambient overlay is registered at RUNTIME rather than declared in the
 * manifest. A declared content script with `<all_urls>` would force a host
 * permission prompt at install for a feature that is off by default — the
 * scariest possible first impression for a product whose pitch is privacy
 * (gap G-07). Registration happens only once the user enables ambient AND
 * grants the optional permission.
 */
async function syncAmbientRegistration(settings) {
  const shouldRegister = Boolean(settings.enabled && settings.ambient);

  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
  } catch {
    granted = false;
  }

  let registered = [];
  try {
    registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AMBIENT_SCRIPT_ID] });
  } catch {
    registered = [];
  }
  const isRegistered = registered.length > 0;

  try {
    if (shouldRegister && granted && !isRegistered) {
      await chrome.scripting.registerContentScripts([{
        id: AMBIENT_SCRIPT_ID,
        matches: ['http://*/*', 'https://*/*'],
        js: ['content/ambient.js'],
        css: ['content/ambient.css'],
        runAt: 'document_idle',
        allFrames: false
      }]);
    } else if ((!shouldRegister || !granted) && isRegistered) {
      await chrome.scripting.unregisterContentScripts({ ids: [AMBIENT_SCRIPT_ID] });
    }
  } catch {
    // Registration races (two events at once) are safe to ignore; the next
    // settings change re-syncs.
  }
}

/** The payload the content script needs: colours resolved, no core imports. */
async function ambientPayload(host) {
  const settings = await store.getSettings(chrome);
  const active = await store.getActiveTheme(chrome);
  const enabled = engine.shouldRunAmbient(settings, host);
  return {
    enabled,
    intensity: settings.intensity,
    vars: enabled ? resolveTheme(active.category, 'light', settings.intensity) : {}
  };
}

async function updateAmbientForTab(tabId, url) {
  const sanitized = sanitizeUrl(url);
  if (!sanitized) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MSG.AMBIENT_UPDATE,
      payload: await ambientPayload(sanitized.host)
    });
  } catch {
    // No content script on this tab (not granted, or a restricted page).
  }
}

/* ------------------------------------------------------------- pipeline */

async function processTab(tab) {
  if (!tab || !tab.url) return;
  if (tab.incognito) return;   // belt and braces; manifest already forbids it (PRD P3)

  const result = await engine.handleSignal(chrome, { url: tab.url, title: tab.title }, now());

  if (result.outcome === engine.OUTCOME.CHANGED) {
    await paintBadge(result.category);
    broadcast(await engine.getFullState(chrome, now()));
  }
  if (typeof tab.id === 'number') {
    await updateAmbientForTab(tab.id, tab.url);
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await processTab(tab);
  } catch {
    // Tab closed between event and lookup.
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act once the page has settled, and only for the tab the user is on.
  if (changeInfo.status !== 'complete' && !changeInfo.title) return;
  if (!tab || !tab.active) return;
  await processTab(tab);
});

/* -------------------------------------------------------------- messages */

/**
 * Returning `true` keeps the message channel open for the async reply — this is
 * required by the callback-style API and is the classic MV3 footgun.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse({ ok: true, ...response }))
    .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
  return true;
});

async function handleMessage(message, sender) {
  const t = now();
  const senderHost = (() => {
    const s = sanitizeUrl(sender && sender.tab && sender.tab.url);
    return s ? s.host : null;
  })();

  switch (message && message.type) {
    case MSG.GET_STATE:
      return { state: await engine.getFullState(chrome, t) };

    case MSG.SET_THEME: {
      await engine.setThemeManually(chrome, message.category, t);
      const state = await engine.getFullState(chrome, t);
      await paintBadge(state.active.category);
      broadcast(state);
      return { state };
    }

    case MSG.SET_PIN: {
      await engine.pinTheme(chrome, message.category, message.durationMs, t);
      const state = await engine.getFullState(chrome, t);
      await paintBadge(state.active.category);
      broadcast(state);
      return { state };
    }

    case MSG.CLEAR_PIN: {
      await engine.unpinTheme(chrome);
      const state = await engine.getFullState(chrome, t);
      broadcast(state);
      return { state };
    }

    case MSG.REJECT_CURRENT: {
      const host = message.host || senderHost || (await activeTabHost());
      await engine.rejectCurrent(chrome, host, t);
      const state = await engine.getFullState(chrome, t);
      await paintBadge(state.active.category);
      broadcast(state);
      return { state };
    }

    case MSG.UPDATE_SETTINGS: {
      const settings = await store.updateSettings(chrome, message.patch);
      if (message.patch && message.patch.ambient === true) {
        // Host permission is requested only at the moment ambient is enabled
        // (gap G-07) — never at install time.
        try { await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] }); }
        catch { /* user declined; ambient simply stays inert */ }
      }
      await syncAmbientRegistration(settings);
      const state = await engine.getFullState(chrome, t);
      broadcast(state);
      return { settings, state };
    }

    case 'aura/get-ambient':
      return { payload: await ambientPayload(senderHost) };

    case MSG.GET_LOG:
      return { log: await store.getLog(chrome) };

    case MSG.CLEAR_LOG:
      return { log: await store.clearLog(chrome) };

    case MSG.ERASE_ALL: {
      const settings = await store.eraseAll(chrome);
      await paintBadge(NEUTRAL);
      const state = await engine.getFullState(chrome, t);
      broadcast(state);
      return { settings, state };
    }

    default:
      throw new Error(`unknown message: ${message && message.type}`);
  }
}

async function activeTabHost() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const s = sanitizeUrl(tab && tab.url);
    return s ? s.host : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- lifecycle */

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await store.getSettings(chrome);   // materialise defaults
  const active = await store.getActiveTheme(chrome);
  await paintBadge(active.category);
  await syncAmbientRegistration(settings);
});

/*
 * If the user revokes the optional host permission from chrome://extensions,
 * the registered content script must go with it — otherwise we would be left
 * holding a registration for access we no longer have.
 */
if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(async () => {
    await syncAmbientRegistration(await store.getSettings(chrome));
  });
}

chrome.runtime.onStartup.addListener(async () => {
  const active = await store.getActiveTheme(chrome);
  await paintBadge(active.category);
  await syncAmbientRegistration(await store.getSettings(chrome));
});
