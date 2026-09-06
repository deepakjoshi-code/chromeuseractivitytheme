/**
 * ambient.js — Experience A's optional garnish (PRD A7).
 *
 * Constraints this file exists to respect:
 *   - it must never alter the host page's DOM or cascade beyond its own element
 *   - it must never intercept a click (`pointer-events: none`)
 *   - it must remove itself completely when disabled
 *
 * Not an ES module: content scripts do not support `import`. Colours therefore
 * arrive already resolved from the service worker rather than being computed
 * here from core/themes.js.
 */
(function () {
  'use strict';

  var ROOT_ID = 'aura-ambient-root';
  /**
   * Tint strength per intensity level.
   *
   * These are higher than a plain alpha wash could safely go because the layer
   * blends rather than covers. Measured on a white page with a tropical tint at
   * 0.60: background #ffffff becomes #cbf6f0 while body-text contrast only moves
   * from 16.1 to 14.1 — still more than double the WCAG AAA threshold of 7.
   */
  var STRENGTH = { subtle: 0.25, balanced: 0.45, expressive: 0.62 };
  var MESSAGE = 'aura/ambient-update';
  var element = null;

  function remove() {
    if (element && element.parentNode) element.parentNode.removeChild(element);
    element = null;
  }

  function ensure() {
    if (element && element.isConnected) return element;
    element = document.createElement('div');
    element.id = ROOT_ID;
    element.setAttribute('aria-hidden', 'true');
    // Inline, so we depend on nothing the page might override or strip.
    element.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      'z-index:2147483646',
      'opacity:0',
      'transition:opacity 600ms cubic-bezier(0.22,0.61,0.36,1)'
    ].join(';');
    (document.body || document.documentElement).appendChild(element);
    return element;
  }

  /**
   * Is the page itself dark? Decides which blend mode and palette to use.
   *
   * This reads one computed background COLOUR. It does not read text, markup, or
   * anything else about the page, and nothing read here is stored or sent.
   */
  function pageIsDark() {
    try {
      var target = document.body || document.documentElement;
      var colour = getComputedStyle(target).backgroundColor || '';
      var parts = colour.match(/\d+(\.\d+)?/g);
      if (!parts || parts.length < 3 || (parts.length > 3 && Number(parts[3]) < 0.5)) {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      return (0.299 * Number(parts[0]) + 0.587 * Number(parts[1]) + 0.114 * Number(parts[2])) < 128;
    } catch (e) {
      return false;
    }
  }

  function apply(payload) {
    if (!payload || !payload.enabled) {
      remove();
      return;
    }

    var vars = payload.vars || {};
    /*
     * Build the glow from the ACCENT, not the gradient stops.
     *
     * The gradient stops are designed to sit close to a theme's own background,
     * which makes them near-white in every light palette — composited at low
     * opacity over a white page they render as #fafafb, i.e. invisible. The
     * accent is the one colour in each palette that is genuinely saturated, so
     * it is the only one that reads as light spilling in from the edges.
     */
    /*
     * Blend rather than cover.
     *
     * A plain translucent layer dims everything under it equally, so the only
     * safe place for colour was the margins. Multiply over a light page leaves
     * dark text mathematically untouched — black times any colour is still
     * black — while turning white background into the tint. Screen does the
     * mirror on a dark page, lifting the background toward the colour while
     * leaving light text light. That is what lets the middle of the page carry
     * the theme without costing a single point of readability.
     */
    var dark = pageIsDark();
    var palette = dark ? (payload.dark || {}) : (payload.light || {});
    var accent = palette.accent || vars['--aura-accent'] || 'transparent';
    var stops = palette.gradient || [accent, accent, accent];

    var node = ensure();
    node.style.mixBlendMode = dark ? 'screen' : 'multiply';
    /*
     * Edge-weighted on purpose.
     *
     * This layer sits ON TOP of the page and changes nothing beneath it, which
     * means any colour it carries also tints the text under it. So the coverage
     * is shaped: a vignette that is fully transparent through the middle, where
     * the reading happens, and strongest at the edges and corners, where there
     * is usually nothing but background. The result reads as coloured light
     * around the page rather than a filter over it.
     */
    // Full coverage now — the middle carries colour too — with the corners
    // stronger so the page still reads as lit from its edges.
    node.style.background = [
      'radial-gradient(62% 52% at 0% 0%, ' + stops[0] + ' 0%, transparent 72%)',
      'radial-gradient(58% 50% at 100% 0%, ' + stops[1] + ' 0%, transparent 70%)',
      'radial-gradient(74% 42% at 50% 100%, ' + stops[2] + ' 0%, transparent 74%)',
      'linear-gradient(160deg, ' + stops[0] + ' 0%, ' + stops[1] + ' 50%, ' + stops[2] + ' 100%)'
    ].join(',');

    // A frame of layout before opacity, so the first paint animates in.
    requestAnimationFrame(function () {
      if (!element) return;
      var strength = STRENGTH[payload.intensity] || STRENGTH.balanced;
      element.style.opacity = String(strength);
    });
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message && message.type === MESSAGE) apply(message.payload);
  });

  // Pull on load: the worker may have been asleep when this page opened.
  try {
    chrome.runtime.sendMessage({ type: 'aura/get-ambient' }, function (response) {
      void chrome.runtime.lastError;
      if (response && response.payload) apply(response.payload);
    });
  } catch (e) {
    /* worker unavailable; the overlay simply stays absent */
  }

  window.addEventListener('pagehide', remove, { once: true });
})();
