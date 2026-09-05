/**
 * text.js — pure text/URL utilities shared by the privacy firewall and the
 * classifier. No imports, no chrome.*, no I/O.
 */

/**
 * Normalise arbitrary text into a space-padded, lowercase, alphanumeric-only
 * string. Padding with a leading/trailing space lets callers do word-boundary
 * matching with a plain `includes(' term ')` — which is both faster and safer
 * than building a RegExp from user-controlled data.
 */
export function normalizeText(input) {
  if (typeof input !== 'string' || input.length === 0) return ' ';
  return ' ' + input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics: "café" -> "cafe"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + ' ';
}

/** True if `normalized` (from normalizeText) contains `term` as whole word(s). */
export function containsTerm(normalized, term) {
  if (!term) return false;
  return normalized.includes(' ' + term + ' ');
}

/** Strip a leading `www.` and lowercase. Returns '' for falsy input. */
export function normalizeHost(host) {
  if (typeof host !== 'string') return '';
  return host.toLowerCase().replace(/^www\./, '');
}

/**
 * Match a host (and optionally a path) against a taxonomy host pattern.
 *
 * - `github.com`          matches `github.com` and `api.github.com`
 * - `nytimes.com/cooking` matches host `nytimes.com` with a path under /cooking
 *
 * Subdomain matching is suffix-based on a dot boundary, so `notgithub.com`
 * does NOT match `github.com`.
 */
export function hostMatches(host, path, pattern) {
  const h = normalizeHost(host);
  if (!h || !pattern) return false;

  const slash = pattern.indexOf('/');
  if (slash === -1) {
    return h === pattern || h.endsWith('.' + pattern);
  }

  const patHost = pattern.slice(0, slash);
  const patPath = pattern.slice(slash);
  const hostOk = h === patHost || h.endsWith('.' + patHost);
  if (!hostOk) return false;
  const p = typeof path === 'string' ? path.toLowerCase() : '';
  return p.startsWith(patPath);
}

/** Split a URL path into lowercase alphanumeric tokens, dropping numeric ids. */
export function tokenizePath(path) {
  if (typeof path !== 'string') return [];
  return path
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && t.length < 32 && !/^\d+$/.test(t));
}
