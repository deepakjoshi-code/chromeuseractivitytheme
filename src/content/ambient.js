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
  /** How strong the tint is. Expressive is the most this should ever be. */
  var STRENGTH = { subtle: 0.14, balanced: 0.26, expressive: 0.40 };
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
    var accent = vars['--aura-accent'] || 'transparent';
    var warm = vars['--aura-grad-2'] || accent;

    var node = ensure();
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
    node.style.background = [
      'radial-gradient(58% 46% at 0% 0%, ' + accent + ' 0%, transparent 70%)',
      'radial-gradient(54% 44% at 100% 0%, ' + warm + ' 0%, transparent 68%)',
      'radial-gradient(70% 36% at 50% 100%, ' + accent + ' 0%, transparent 72%)',
      'radial-gradient(128% 108% at 50% 50%, transparent 34%, ' + accent + ' 100%)'
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
