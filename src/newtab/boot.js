/**
 * boot.js — synchronous first-paint theming. Classic script, no imports.
 *
 * Reads the CSS-variable mirror that newtab.js writes to localStorage on every
 * theme change. localStorage is synchronous; chrome.storage is not. Awaiting
 * chrome.storage here would put a flash of unthemed content on the hero surface
 * every single time a tab is opened (ARCHITECTURE.md §6).
 *
 * Everything here is wrapped defensively: a corrupt or absent mirror must
 * degrade to the stylesheet's neutral defaults, never to an exception.
 */
(function () {
  'use strict';
  try {
    var raw = localStorage.getItem('aura:vars');
    if (!raw) return;
    var vars = JSON.parse(raw);
    if (!vars || typeof vars !== 'object') return;
    var root = document.documentElement;
    for (var name in vars) {
      // Only ever write our own namespace, whatever the mirror contains.
      if (name.indexOf('--aura-') === 0 && typeof vars[name] === 'string') {
        root.style.setProperty(name, vars[name]);
      }
    }
    root.setAttribute('data-aura-booted', '1');
  } catch (e) {
    /* neutral defaults from the stylesheet stand */
  }
})();
