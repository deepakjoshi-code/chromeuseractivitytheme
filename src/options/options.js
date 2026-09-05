/**
 * options.js — Experience B, the full settings surface (PRD B6-B11).
 *
 * Settings are saved on change, not behind a Save button: every control here is
 * individually reversible and instantly visible, so a save step would only add
 * a way to lose work.
 */

import { MSG } from '../core/messages.js';
import { THEMES, THEME_KEYS } from '../core/themes.js';
import { NEUTRAL } from '../core/taxonomy.js';

const els = {
  intensity: document.getElementById('intensity'),
  scheme: document.getElementById('scheme'),
  showReason: document.getElementById('showReason'),
  ambient: document.getElementById('ambient'),
  ambientSites: document.getElementById('ambientSites'),
  muted: document.getElementById('muted'),
  blocklist: document.getElementById('blocklist'),
  log: document.getElementById('log'),
  clearLog: document.getElementById('clear-log'),
  erase: document.getElementById('erase'),
  eraseStatus: document.getElementById('erase-status'),
  saved: document.getElementById('saved')
};

let settings = null;

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

let toastTimer = null;
function toast(text) {
  els.saved.textContent = text;
  els.saved.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.saved.classList.remove('show'), 1800);
}

async function patch(changes, message = 'Saved') {
  const response = await send(MSG.UPDATE_SETTINGS, { patch: changes });
  if (response && response.settings) settings = response.settings;
  toast(message);
  return settings;
}

/** Textarea -> clean host list. Tolerates pasted URLs and stray whitespace. */
function parseHostList(value) {
  return value
    .split(/[\n,]+/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
    .map((line) => line.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
    .filter((host, index, all) => host.length > 0 && all.indexOf(host) === index);
}

/* ------------------------------------------------------------------ render */

function renderMutedGrid() {
  els.muted.replaceChildren();
  const muted = new Set(settings.mutedCategories || []);

  for (const key of THEME_KEYS) {
    if (key === NEUTRAL) continue;   // neutral is the fallback; muting it is meaningless
    const theme = THEMES[key];

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = muted.has(key);
    checkbox.addEventListener('change', async () => {
      const next = new Set(settings.mutedCategories || []);
      if (checkbox.checked) next.add(key); else next.delete(key);
      await patch({ mutedCategories: [...next] },
        checkbox.checked ? `${theme.label} muted` : `${theme.label} unmuted`);
    });

    const swatch = document.createElement('span');
    swatch.className = 'sw';
    swatch.style.background = theme.light.accent;

    const text = document.createElement('span');
    text.textContent = theme.label;

    label.append(checkbox, swatch, text);
    label.title = theme.description;
    els.muted.append(label);
  }
}

function renderSettings() {
  for (const button of els.intensity.querySelectorAll('button')) {
    button.setAttribute('aria-checked', String(button.dataset.value === settings.intensity));
  }
  els.scheme.value = settings.scheme;
  els.showReason.checked = settings.showReason;
  els.ambient.checked = settings.ambient;
  els.ambientSites.value = (settings.ambientSites || []).join('\n');
  els.blocklist.value = (settings.blocklist || []).join('\n');
  renderMutedGrid();
}

function renderLog(entries) {
  if (!entries || entries.length === 0) {
    els.log.replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'empty',
        textContent: 'Nothing recorded yet.'
      })
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'entry';

    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = (THEMES[entry.category] || THEMES[NEUTRAL]).label;

    const host = document.createElement('span');
    host.className = 'host';
    host.textContent = entry.host;

    const terms = document.createElement('span');
    terms.className = 'terms';
    terms.textContent = (entry.terms || []).map((t) => `“${t}”`).join(', ');

    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = new Date(entry.at).toLocaleString([], {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });

    row.append(cat, host, terms, when);
    fragment.append(row);
  }
  els.log.replaceChildren(fragment);
}

/* ---------------------------------------------------------------- bindings */

els.intensity.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-value]');
  if (!button) return;
  await patch({ intensity: button.dataset.value }, `Expression: ${button.textContent}`);
  renderSettings();
});

els.scheme.addEventListener('change', () => patch({ scheme: els.scheme.value }));
els.showReason.addEventListener('change', () => patch({ showReason: els.showReason.checked }));

els.ambient.addEventListener('change', async () => {
  // The worker requests the optional host permission when this flips on (gap G-07).
  await patch({ ambient: els.ambient.checked },
    els.ambient.checked ? 'Ambient glow on' : 'Ambient glow off');
});

for (const [element, key, label] of [
  [els.ambientSites, 'ambientSites', 'Allowed sites updated'],
  [els.blocklist, 'blocklist', 'Blocked sites updated']
]) {
  element.addEventListener('change', async () => {
    const list = parseHostList(element.value);
    await patch({ [key]: list }, label);
    element.value = list.join('\n');
  });
}

els.clearLog.addEventListener('click', async () => {
  await send(MSG.CLEAR_LOG);
  renderLog([]);
  toast('Log cleared');
});

els.erase.addEventListener('click', async () => {
  // Two-step, because it is irreversible (PRD B11).
  if (els.erase.dataset.armed !== '1') {
    els.erase.dataset.armed = '1';
    els.erase.textContent = 'Click again to confirm';
    els.eraseStatus.textContent = 'This cannot be undone.';
    setTimeout(() => {
      els.erase.dataset.armed = '0';
      els.erase.textContent = 'Erase all Aura data';
      els.eraseStatus.textContent = '';
    }, 5000);
    return;
  }

  const response = await send(MSG.ERASE_ALL);
  els.erase.dataset.armed = '0';
  els.erase.textContent = 'Erase all Aura data';
  els.eraseStatus.textContent = 'Everything erased.';
  if (response && response.settings) {
    settings = response.settings;
    renderSettings();
  }
  renderLog([]);
});

/* -------------------------------------------------------------------- init */

(async function init() {
  const [stateResponse, logResponse] = await Promise.all([
    send(MSG.GET_STATE),
    send(MSG.GET_LOG)
  ]);
  settings = (stateResponse && stateResponse.state && stateResponse.state.settings) || {};
  renderSettings();
  renderLog(logResponse && logResponse.log);
})();
