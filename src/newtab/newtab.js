/**
 * newtab.js — Experience A, the hero surface (PRD A3-A5, A10).
 *
 * Responsibilities, in order:
 *   1. pull authoritative state from the worker
 *   2. apply it, and refresh the synchronous localStorage mirror boot.js reads
 *   3. keep the clock running and handle the three inline controls
 *
 * The typing guard (PRD A10) lives here: a theme change that lands while the
 * user is mid-query is queued, not applied. Repainting the page underneath
 * someone who is typing is the most jarring thing this product could do.
 */

import { MSG } from '../core/messages.js';
import { resolveTheme, getTheme } from '../core/themes.js';
import { NEUTRAL } from '../core/taxonomy.js';

const els = {
  clock: document.getElementById('clock'),
  greeting: document.getElementById('greeting'),
  label: document.getElementById('theme-label'),
  reason: document.getElementById('theme-reason'),
  motif: document.getElementById('motif'),
  form: document.getElementById('search-form'),
  input: document.getElementById('search-input'),
  pin: document.getElementById('btn-pin'),
  reject: document.getElementById('btn-reject'),
  options: document.getElementById('btn-options')
};

let current = null;
let pendingState = null;

/* -------------------------------------------------------------- utilities */

function send(type, extra = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...extra }, (response) => {
        void chrome.runtime.lastError;   // suppress "no receiver" noise
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function prefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function schemeFor(settings) {
  if (settings.scheme === 'light' || settings.scheme === 'dark') return settings.scheme;
  return prefersDark() ? 'dark' : 'light';
}

/** Build the motif as an inline data URI. No network, no decode cost (PRD §6). */
function motifBackground(theme, color) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460" viewBox="0 0 64 64" ` +
    `fill="${color}">${theme.motif}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* ------------------------------------------------------------------ render */

function applyState(state) {
  if (!state) return;
  current = state;

  const scheme = schemeFor(state.settings);
  const vars = resolveTheme(state.active.category, scheme, state.settings.intensity);
  const root = document.documentElement;

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.setAttribute('data-aura-motion', vars['--aura-motion']);

  // Refresh the mirror boot.js reads on the next new tab (ARCHITECTURE.md §6).
  try {
    localStorage.setItem('aura:vars', JSON.stringify(vars));
  } catch {
    /* storage disabled; we simply lose the first-paint optimisation */
  }

  const theme = getTheme(state.active.category);
  els.label.textContent = theme.label;
  els.reason.textContent = state.settings.showReason ? state.explanation : '';
  els.motif.style.backgroundImage = motifBackground(theme, vars['--aura-accent']);

  const pinned = Boolean(state.pin);
  els.pin.setAttribute('aria-pressed', String(pinned));
  els.pin.textContent = pinned ? 'Unpin' : 'Pin this theme';
  els.reject.hidden = pinned || state.active.category === NEUTRAL;
}

/**
 * PRD A10 — never re-theme while the user is typing. The state is held and
 * flushed on blur or submit.
 */
function isTyping() {
  return document.activeElement === els.input && els.input.value.trim().length > 0;
}

function receiveState(state) {
  if (isTyping()) {
    pendingState = state;
    return;
  }
  applyState(state);
}

function flushPending() {
  if (pendingState) {
    applyState(pendingState);
    pendingState = null;
  }
}

/* ------------------------------------------------------------------- clock */

function tick() {
  const d = new Date();
  els.clock.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const h = d.getHours();
  els.greeting.textContent =
    h < 5 ? 'Still up' :
    h < 12 ? 'Good morning' :
    h < 18 ? 'Good afternoon' :
    'Good evening';
}

/* ---------------------------------------------------------------- controls */

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = els.input.value.trim();
  if (!query) return;
  // A navigation, not a network request from this page — CSP connect-src stays 'none'.
  window.location.assign('https://www.google.com/search?q=' + encodeURIComponent(query));
});

els.input.addEventListener('blur', flushPending);

els.pin.addEventListener('click', async () => {
  const response = current && current.pin
    ? await send(MSG.CLEAR_PIN)
    : await send(MSG.SET_PIN, { category: current ? current.active.category : NEUTRAL });
  if (response && response.state) applyState(response.state);
});

els.reject.addEventListener('click', async () => {
  const response = await send(MSG.REJECT_CURRENT, {});
  if (response && response.state) applyState(response.state);
});

els.options.addEventListener('click', () => {
  try { chrome.runtime.openOptionsPage(); } catch { /* ignore */ }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === MSG.THEME_CHANGED) receiveState(message.payload);
});

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => applyState(current));
}

/* -------------------------------------------------------------------- init */

tick();
setInterval(tick, 1000);
els.input.focus();

send(MSG.GET_STATE).then((response) => {
  if (response && response.state) applyState(response.state);
});
