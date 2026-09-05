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
    var a = vars['--aura-grad-1'] || 'transparent';
    var b = vars['--aura-grad-2'] || 'transparent';
    var c = vars['--aura-accent'] || 'transparent';

    var node = ensure();
    node.style.background = [
      'radial-gradient(46% 34% at 0% 0%, ' + a + ' 0%, transparent 62%)',
      'radial-gradient(42% 32% at 100% 0%, ' + b + ' 0%, transparent 60%)',
      'radial-gradient(58% 26% at 50% 100%, ' + c + ' 0%, transparent 66%)'
    ].join(',');

    // A frame of layout before opacity, so the first paint animates in.
    requestAnimationFrame(function () {
      if (!element) return;
      var strength = payload.intensity === 'expressive' ? 0.22 : 0.13;
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
