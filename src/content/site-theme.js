/**
 * site-theme.js — applies a per-site page tint (Route 2).
 *
 * Unlike the ambient overlay, this one changes the page's own background so the
 * tint sits *behind* the text rather than washing over it. Everything it does is
 * confined to one injected <style> element and one class on <html>; removing
 * both restores the page exactly.
 *
 * It never touches colour, font, size or layout. A wrong tint should be ugly,
 * never unreadable.
 *
 * Not an ES module: content scripts do not support import.
 */
(function () {
  'use strict';

  var STYLE_ID = 'aura-page-theme';
  var HTML_CLASS = 'aura-themed';
  var MESSAGE = 'aura/page-theme-update';

  function remove() {
    var style = document.getElementById(STYLE_ID);
    if (style && style.parentNode) style.parentNode.removeChild(style);
    document.documentElement.classList.remove(HTML_CLASS);
  }

  /**
   * Is the page itself dark? Decides which palette to tint with.
   *
   * Painting a light tint over a site in dark mode would leave dark text on a
   * light background in some places and light text on it in others — the one
   * outcome worse than no theme at all. Measuring the page beats assuming.
   */
  function pageIsDark() {
    try {
      var target = document.body || document.documentElement;
      var colour = getComputedStyle(target).backgroundColor || '';
      var parts = colour.match(/\d+(\.\d+)?/g);
      if (!parts || parts.length < 3) {
        // Transparent or unreadable: fall back to what the user's OS asked for.
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      var r = Number(parts[0]), g = Number(parts[1]), b = Number(parts[2]);
      var alpha = parts.length > 3 ? Number(parts[3]) : 1;
      if (alpha < 0.5) {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      // Rec. 601 luma is plenty for a light/dark decision.
      return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
    } catch (e) {
      return false;
    }
  }

  function apply(payload) {
    if (!payload || !payload.enabled) {
      remove();
      return;
    }

    var css = pageIsDark() ? payload.cssDark : payload.cssLight;
    if (!css) {
      remove();
      return;
    }

    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    document.documentElement.classList.add(HTML_CLASS);
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message && message.type === MESSAGE) apply(message.payload);
  });

  // Pull on load: the worker may have been asleep when this page opened.
  try {
    chrome.runtime.sendMessage({ type: 'aura/get-page-theme' }, function (response) {
      void chrome.runtime.lastError;
      if (response && response.payload) apply(response.payload);
    });
  } catch (e) {
    /* worker unavailable; the page is simply left alone */
  }

  window.addEventListener('pagehide', remove, { once: true });
}());
