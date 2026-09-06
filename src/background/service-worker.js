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
import { sanitizeUrl, originsForHosts } from '../core/privacy.js';
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
  const sites = settings.ambientSites || [];
  const origins = originsForHosts(sites);
  const shouldRegister = Boolean(settings.enabled && settings.ambient && origins.length > 0);

  // Only the listed sites are ever requested or registered, so the access we
  // hold matches the access the options page promises.
  let granted = false;
  try {
    granted = origins.length > 0 &&
      await chrome.permissions.contains({ origins });
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
        matches: origins,
        js: ['content/ambient.js'],
        css: ['content/ambient.css'],
        runAt: 'document_idle',
        allFrames: false
      }]);
    } else if (isRegistered && (!shouldRegister || !granted)) {
      await chrome.scripting.unregisterContentScripts({ ids: [AMBIENT_SCRIPT_ID] });
    } else if (isRegistered && shouldRegister && granted) {
      // The allow-list may have changed since registration; re-point it.
      await chrome.scripting.updateContentScripts([{ id: AMBIENT_SCRIPT_ID, matches: origins }]);
    }
  } catch {
    // Registration races (two events at once) are safe to ignore; the next
    // settings change re-syncs.
  }

  // Registering only affects pages loaded from now on. Without this, enabling
  // ambient appears to do nothing until every open tab is manually reloaded.
  if (shouldRegister && granted) await injectIntoOpenTabs(settings);
}

/**
 * Inject the overlay into tabs that are already open and eligible.
 *
 * Failures here are expected and ignored: restricted pages (chrome://, the Web
 * Store), tabs that navigated away mid-call, and tabs where the script is
 * already present all reject, and none of them are problems.
 */
async function injectIntoOpenTabs(settings) {
  const origins = originsForHosts(settings.ambientSites || []);
  if (origins.length === 0) return;

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: origins });
  } catch {
    return;
  }

  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || tab.incognito) continue;
    const sanitized = sanitizeUrl(tab.url);
    if (!sanitized || !engine.shouldRunAmbient(settings, sanitized.host)) continue;

    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/ambient.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/ambient.js'] });
      await updateAmbientForTab(tab.id, tab.url);
    } catch {
      // Not injectable; the next navigation in that tab will pick it up.
    }
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

  const result = await engine.handleSignal(
    chrome, { url: tab.url, title: tab.title, tabId: tab.id }, now());

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
      /*
       * The host permission is NOT requested here. chrome.permissions.request()
       * needs a user gesture in a foreground page; from a worker it throws. The
       * options page owns that call and only stores `ambient: true` once access
       * has actually been granted (see options.js).
       */
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

/*
 * Re-sync when access is GRANTED, not just when it is revoked.
 *
 * Without this the feature could never start: the options page saves the
 * settings first, so the worker syncs while the permission is still missing and
 * declines to register — and the grant that arrives a moment later told nobody.
 * The user saw the prompt, clicked Allow, and got nothing. This also covers a
 * grant made directly from chrome://extensions.
 */
if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(async () => {
    await syncAmbientRegistration(await store.getSettings(chrome));
  });
}

chrome.runtime.onStartup.addListener(async () => {
  const active = await store.getActiveTheme(chrome);
  await paintBadge(active.category);
  await syncAmbientRegistration(await store.getSettings(chrome));
});
