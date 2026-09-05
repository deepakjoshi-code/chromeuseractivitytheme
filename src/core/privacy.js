/**
 * privacy.js — the sensitive-content firewall (PRD P4, P5, P9, P10).
 *
 * Everything that reaches the classifier passes through here first. On a
 * sensitive match the pipeline ABORTS: the signal is not scored, not buffered,
 * not logged, and the theme falls back to neutral. There is deliberately no
 * way to disable this from the UI.
 *
 * This module also owns the rule that raw URLs are never persisted. Callers
 * outside this file should never see a full URL string again after
 * `sanitizeUrl` has run.
 */

import {
  SENSITIVE_PATTERNS,
  SENSITIVE_HOSTS,
  SEARCH_ENGINES,
  IGNORED_URL_PREFIXES
} from './taxonomy.js';
import { normalizeText, normalizeHost, hostMatches, tokenizePath } from './text.js';

/** True if this URL should never be looked at (chrome://, file://, etc.). */
export function isIgnoredUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return true;
  const lower = rawUrl.toLowerCase();
  return IGNORED_URL_PREFIXES.some((p) => lower.startsWith(p));
}

/** True if the host itself is categorically sensitive (banking, health, ...). */
export function isSensitiveHost(host) {
  const h = normalizeHost(host);
  if (!h) return false;
  return SENSITIVE_HOSTS.some((s) => h === s || h.endsWith('.' + s));
}

/**
 * True if any sensitive pattern matches the supplied free text.
 * Text is normalised first so "Pre-Natal" and "prenatal" behave alike.
 */
export function isSensitiveText(text) {
  const n = normalizeText(text);
  if (n.trim().length === 0) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(n));
}

/**
 * The single entry point the pipeline uses. Returns true if ANY part of the
 * signal is sensitive. Deliberately evaluates host and every text field —
 * a sensitive term in the title must veto a benign query and vice versa.
 */
export function isSensitiveSignal({ host, query, title, pathTokens } = {}) {
  if (isSensitiveHost(host)) return true;
  if (isSensitiveText(query)) return true;
  if (isSensitiveText(title)) return true;
  if (Array.isArray(pathTokens) && isSensitiveText(pathTokens.join(' '))) return true;
  return false;
}

/** Extract a search query from a known search engine URL, else null. */
export function extractSearchQuery(url) {
  const host = normalizeHost(url.hostname);
  // Longest host match wins so `search.yahoo.com` beats a bare `yahoo.com`.
  const engines = SEARCH_ENGINES
    .filter((e) => hostMatches(host, url.pathname, e.host))
    .sort((a, b) => b.host.length - a.host.length);

  for (const engine of engines) {
    for (const param of engine.params) {
      const value = url.searchParams.get(param);
      if (value && value.trim().length > 0) {
        return value.trim().slice(0, 200);   // bound it; queries can be pasted essays
      }
    }
  }
  return null;
}

/**
 * Convert a raw URL into the ONLY shape the rest of the system is allowed to
 * see. Returns null for ignored URLs.
 *
 * Note what is dropped and never returned: scheme, port, credentials, hash,
 * and the entire query string apart from a recognised search term (PRD P10).
 */
export function sanitizeUrl(rawUrl) {
  if (isIgnoredUrl(rawUrl)) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return {
    host: normalizeHost(url.hostname),
    path: url.pathname.toLowerCase(),
    pathTokens: tokenizePath(url.pathname),
    query: extractSearchQuery(url)
  };
}

/**
 * Build the redacted record that may be written to the activity log (PRD P5/P7).
 * Stores the host and the matched terms only — never the title, never the URL,
 * never the full search query.
 */
export function redactForLog(signal, classification, at) {
  return {
    host: normalizeHost(signal && signal.host) || '(unknown)',
    category: classification.category,
    confidence: Math.round(classification.confidence * 100) / 100,
    terms: (classification.reasons || []).slice(0, 4).map((r) => r.term),
    at
  };
}

/**
 * True if `host` matches any entry in `list`, with subdomain suffix semantics
 * (`example.com` matches `shop.example.com`). Used for both the never-theme
 * blocklist (PRD B8) and the ambient allow-list (PRD B9).
 */
export function hostInList(host, list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  const h = normalizeHost(host);
  if (!h) return false;
  return list.some((entry) => {
    const e = normalizeHost(String(entry).trim());
    return e.length > 0 && (h === e || h.endsWith('.' + e));
  });
}

/** True if the host is on the user's never-theme blocklist (PRD B8). */
export function isBlocklisted(host, blocklist) {
  return hostInList(host, blocklist);
}

/**
 * Chrome match patterns for a list of hosts.
 *
 * `*.example.com` matches the bare domain and its subdomains, which is the same
 * suffix semantics `hostInList` uses — so what the user typed, what Chrome
 * grants, and what the engine enforces all describe the same set.
 */
export function originsForHosts(hosts) {
  const origins = [];
  for (const entry of hosts || []) {
    // Guard before stringifying: String(null) is "null", which would produce a
    // bogus "*.null" origin and be sent to chrome.permissions.request verbatim.
    if (typeof entry !== 'string') continue;
    const host = normalizeHost(entry.trim());
    if (!host) continue;
    origins.push(`https://*.${host}/*`, `http://*.${host}/*`);
  }
  return origins;
}
