/**
 * popup.js — Experience B, the control surface (PRD B1-B5).
 *
 * The popup's job is legibility. Everything the engine decided must be visible
 * and reversible from here in one click, because a context-reading product that
 * cannot explain itself reads as surveillance (gap G-04).
 */

import { MSG } from '../core/messages.js';
import { THEMES, THEME_KEYS, resolveTheme, getTheme } from '../core/themes.js';
import { NEUTRAL } from '../core/taxonomy.js';

const els = {
  label: document.getElementById('theme-label'),
  reason: document.getElementById('theme-reason'),
  meter: document.getElementById('meter'),
  meterCaption: document.getElementById('meter-caption'),
  meterWrap: document.getElementById('meter-wrap'),
  enabled: document.getElementById('enabled'),
  pin: document.getElementById('btn-pin'),
  reject: document.getElementById('btn-reject'),
  durations: document.getElementById('pin-durations'),
  gallery: document.getElementById('gallery'),
  options: document.getElementById('btn-options')
};

let state = null;

function send(type, extra = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...extra }, (response) => {
        void chrome.runtime.lastError;
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function schemeFor(settings) {
  if (settings.scheme === 'light' || settings.scheme === 'dark') return settings.scheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ----------------------------------------------------------------- gallery */

function buildGallery() {
  const fragment = document.createDocumentFragment();

  for (const key of THEME_KEYS) {
    const theme = THEMES[key];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.key = key;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.title = `${theme.label} — ${theme.description}`;

    const palette = theme.light;
    button.style.background =
      `linear-gradient(140deg, ${palette.gradient[0]}, ${palette.gradient[1]} 55%, ${palette.gradient[2]})`;

    const name = document.createElement('span');
    name.className = 'sw-name';
    name.textContent = theme.label;
    name.style.color = palette.text;
    // The scrim is the theme's own surface colour, so the swatch still reads as
    // one object rather than a label pasted on top of it.
    name.style.background = `color-mix(in srgb, ${palette.surface} 72%, transparent)`;
    button.append(name);

    button.addEventListener('click', async () => {
      const response = await send(MSG.SET_THEME, { category: key });
      if (response && response.state) render(response.state);
    });

    fragment.append(button);
  }
  els.gallery.append(fragment);
}

/* ------------------------------------------------------------------ render */

function render(next) {
  if (!next) return;
  state = next;

  const scheme = schemeFor(state.settings);
  const vars = resolveTheme(state.active.category, scheme, 'balanced');
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }

  const theme = getTheme(state.active.category);
  els.label.textContent = theme.label;
  els.reason.textContent = state.settings.enabled
    ? state.explanation
    : 'Aura is off — nothing is being read.';

  const percent = Math.round((state.active.confidence || 0) * 100);
  els.meter.style.width = `${percent}%`;
  els.meterCaption.textContent = state.pin
    ? 'pinned — detection paused'
    : `${percent}% confidence`;
  els.meterWrap.setAttribute('aria-label', `Detection confidence ${percent} percent`);

  els.enabled.checked = state.settings.enabled;

  const pinned = Boolean(state.pin);
  els.pin.setAttribute('aria-pressed', String(pinned));
  els.pin.textContent = pinned ? 'Unpin' : 'Pin';
  els.reject.disabled = pinned || state.active.category === NEUTRAL;
  if (!pinned) els.durations.hidden = true;

  for (const swatch of els.gallery.children) {
    swatch.setAttribute('aria-selected', String(swatch.dataset.key === state.active.category));
  }
}

/* ---------------------------------------------------------------- controls */

els.enabled.addEventListener('change', async () => {
  const response = await send(MSG.UPDATE_SETTINGS, { patch: { enabled: els.enabled.checked } });
  if (response && response.state) render(response.state);
});

els.pin.addEventListener('click', async () => {
  if (state && state.pin) {
    const response = await send(MSG.CLEAR_PIN);
    if (response && response.state) render(response.state);
    return;
  }
  // Offer a duration rather than assuming forever (PRD B2).
  els.durations.hidden = !els.durations.hidden;
});

for (const button of els.durations.querySelectorAll('button')) {
  button.addEventListener('click', async () => {
    const minutes = Number(button.dataset.minutes);
    const response = await send(MSG.SET_PIN, {
      category: state ? state.active.category : NEUTRAL,
      durationMs: minutes > 0 ? minutes * 60 * 1000 : 0
    });
    els.durations.hidden = true;
    if (response && response.state) render(response.state);
  });
}

els.reject.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = null;
  try { host = tab && tab.url ? new URL(tab.url).hostname.replace(/^www\./, '') : null; }
  catch { host = null; }

  const response = await send(MSG.REJECT_CURRENT, { host });
  if (response && response.state) render(response.state);
});

els.options.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === MSG.THEME_CHANGED) render(message.payload);
});

/* -------------------------------------------------------------------- init */

buildGallery();
send(MSG.GET_STATE).then((response) => {
  if (response && response.state) render(response.state);
});
