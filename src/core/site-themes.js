/**
 * site-themes.js — per-site page tinting (Route 2).
 *
 * The ambient overlay sits *on top* of a page and so can never change the page's
 * own background; it can only wash over content. To make a page genuinely look
 * themed, its background has to be restyled underneath the text — and that means
 * knowing something about the site.
 *
 * This file holds that knowledge as data. Adding a site is one entry here plus a
 * host in the permission list; no engine changes. The trade-off is honest: these
 * selectors are a contract with someone else's markup and will need maintenance
 * when a site redesigns. That is the cost of the effect looking real rather than
 * like a colour filter over the screen.
 *
 * Pure data + pure functions. No chrome.*, no DOM.
 */

export const SITE_ADAPTERS = [
  {
    id: 'google-search',
    label: 'Google Search',
    hosts: [
      'google.com', 'google.co.uk', 'google.co.in', 'google.ca', 'google.com.au',
      'google.de', 'google.fr', 'google.es', 'google.it', 'google.nl',
      'google.co.jp', 'google.com.br', 'google.com.mx'
    ],
    pathPrefixes: ['/search'],
    /*
     * Elements that paint their own opaque background over the page. Each must be
     * cleared or the tint is hidden behind a white slab. Selectors that no longer
     * exist are harmless — they simply match nothing — which is why an
     * over-inclusive list is safer here than a minimal one.
     */
    clearBackground: [
      'body', '#main', '#cnt', '#rcnt', '#center_col', '#search', '#rso',
      '#appbar', '#topabar', '#taw', '#botstuff', '#bottomads',
      '.sfbg', '#searchform', '#hdtb-sc', '#before-appbar'
    ]
  }
];

/** The adapter for a host+path, or null. Longest host match wins. */
export function adapterFor(host, path) {
  if (typeof host !== 'string' || host.length === 0) return null;
  const h = host.toLowerCase().replace(/^www\./, '');
  const p = typeof path === 'string' ? path.toLowerCase() : '/';

  let best = null;
  let bestLength = 0;
  for (const adapter of SITE_ADAPTERS) {
    for (const candidate of adapter.hosts) {
      const matches = h === candidate || h.endsWith('.' + candidate);
      if (!matches || candidate.length <= bestLength) continue;
      const pathOk = !adapter.pathPrefixes ||
        adapter.pathPrefixes.some((prefix) => p.startsWith(prefix));
      if (!pathOk) continue;
      best = adapter;
      bestLength = candidate.length;
    }
  }
  return best;
}

/** Every host any adapter covers — what page theming needs permission for. */
export function adapterHosts() {
  const hosts = [];
  for (const adapter of SITE_ADAPTERS) {
    for (const host of adapter.hosts) if (!hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

/**
 * Build the stylesheet that tints a page.
 *
 * Deliberately narrow: it sets a background and clears backgrounds that would
 * cover it. It never touches colour, font, size or layout — so text stays
 * exactly as the site rendered it, and a tint that turns out wrong is ugly
 * rather than unreadable.
 *
 * @param {object} adapter        from SITE_ADAPTERS
 * @param {[string,string,string]} gradient  three stops, already scheme-correct
 * @returns {string} CSS
 */
export function buildPageCss(adapter, gradient) {
  if (!adapter || !Array.isArray(gradient) || gradient.length < 3) return '';
  const [one, two, three] = gradient;

  const surface =
    `radial-gradient(58% 55% at 12% 8%, ${one} 0%, transparent 62%),` +
    `radial-gradient(52% 50% at 88% 14%, ${two} 0%, transparent 60%),` +
    `radial-gradient(64% 58% at 50% 96%, ${three} 0%, transparent 64%)`;

  const cleared = adapter.clearBackground.join(',\n');

  return [
    `html.aura-themed {`,
    `  background-image: ${surface} !important;`,
    `  background-attachment: fixed !important;`,
    `  background-repeat: no-repeat !important;`,
    `  background-size: cover !important;`,
    `}`,
    `html.aura-themed ${cleared.split(',\n').join(',\nhtml.aura-themed ')} {`,
    `  background-color: transparent !important;`,
    `  background-image: none !important;`,
    `}`
  ].join('\n');
}
