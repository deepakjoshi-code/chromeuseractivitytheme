/**
 * The sensitive-content firewall is a RELEASE BLOCKER (PRD §10, gap G-02).
 * A failure here must never be waved through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isIgnoredUrl, isSensitiveHost, isSensitiveText, isSensitiveSignal,
  extractSearchQuery, sanitizeUrl, redactForLog, isBlocklisted, hostInList,
  originsForHosts
} from '../../src/core/privacy.js';

/* ------------------------------------------------------------ ignored URLs */

test('internal and non-web schemes are ignored entirely', () => {
  for (const url of [
    'chrome://extensions', 'chrome-extension://abc/page.html', 'about:blank',
    'file:///home/user/notes.txt', 'devtools://devtools/bundled/x.html',
    'view-source:https://example.com', 'data:text/html,<h1>x', 'javascript:alert(1)'
  ]) {
    assert.equal(isIgnoredUrl(url), true, `${url} must be ignored`);
  }
});

test('ordinary web URLs are not ignored', () => {
  assert.equal(isIgnoredUrl('https://example.com/page'), false);
  assert.equal(isIgnoredUrl('http://example.com'), false);
});

test('empty and non-string URLs are ignored rather than throwing', () => {
  for (const url of ['', null, undefined, 12, {}]) assert.equal(isIgnoredUrl(url), true);
});

/* ------------------------------------------------------- sensitive content */

test('sensitive TEXT is caught across every protected domain', () => {
  const cases = [
    'early cancer symptoms', 'chemotherapy side effects', 'am i depressed quiz',
    'suicide hotline number', 'ivf success rates', 'std testing near me',
    'filing for bankruptcy', 'my bank account balance', 'divorce lawyer near me',
    'dui lawyer consultation', 'best job search sites', 'interview questions to ask',
    'free porn videos', 'tinder profile tips', 'deportation defense',
    'domestic violence shelter near me', 'adderall dosage', 'my credit score'
  ];
  for (const text of cases) {
    assert.equal(isSensitiveText(text), true, `must flag: "${text}"`);
  }
});

test('benign text is NOT flagged (the firewall must not swallow the product)', () => {
  const cases = [
    'birthday cake ideas', 'hawaii vacation packages', 'las vegas shows',
    'kubernetes ingress tutorial', 'kids winter jacket size 5', 'best ramen recipe',
    'hiking trails near yosemite', 'guitar chords wonderwall', 'lego star wars set',
    'marathon training plan', 'christmas decorations'
  ];
  for (const text of cases) {
    assert.equal(isSensitiveText(text), false, `must NOT flag: "${text}"`);
  }
});

test('sensitive matching is case- and punctuation-insensitive', () => {
  assert.equal(isSensitiveText('CANCER Symptoms?!'), true);
  assert.equal(isSensitiveText('Bank-Account balance'), true);
});

test('sensitive HOSTS are caught regardless of page text', () => {
  for (const host of [
    'webmd.com', 'www.chase.com', 'secure.bankofamerica.com',
    'indeed.com', 'betterhelp.com', 'pornhub.com', 'tinder.com'
  ]) {
    assert.equal(isSensitiveHost(host), true, `${host} must be sensitive`);
  }
  assert.equal(isSensitiveHost('github.com'), false);
});

test('host sensitivity respects the dot boundary', () => {
  assert.equal(isSensitiveHost('notchase.com'), false);
  assert.equal(isSensitiveHost('chase.com.example.test'), false);
});

test('a sensitive term in ANY field vetoes the whole signal', () => {
  assert.equal(isSensitiveSignal({ host: 'example.com', query: 'cake', title: 'cancer diagnosis' }), true,
    'a benign query must not rescue a sensitive title');
  assert.equal(isSensitiveSignal({ host: 'example.com', query: 'my symptoms', title: 'Party ideas' }), true,
    'a benign title must not rescue a sensitive query');
  assert.equal(isSensitiveSignal({ host: 'webmd.com', query: 'birthday cake' }), true,
    'a benign query must not rescue a sensitive host');
  assert.equal(isSensitiveSignal({ host: 'example.com', pathTokens: ['bankruptcy', 'filing'] }), true,
    'the path is checked too');
});

test('isSensitiveSignal tolerates a partial or empty signal', () => {
  assert.equal(isSensitiveSignal({}), false);
  assert.equal(isSensitiveSignal(), false);
});

/* --------------------------------------------------------- URL sanitation */

test('sanitizeUrl never returns the raw URL, the query string, or the hash', () => {
  const result = sanitizeUrl(
    'https://user:pw@www.Example.com:8443/Travel/Hawaii?utm_source=nl&token=SECRET#frag'
  );
  const serialized = JSON.stringify(result);
  assert.equal(result.host, 'example.com');
  assert.ok(!serialized.includes('SECRET'), 'query-string values must never survive');
  assert.ok(!serialized.includes('utm_source'));
  assert.ok(!serialized.includes('frag'), 'the hash must never survive');
  assert.ok(!serialized.includes('user'), 'credentials must never survive');
  assert.ok(!serialized.includes('8443'), 'the port must never survive');
});

test('sanitizeUrl returns null for ignored, malformed and non-http URLs', () => {
  assert.equal(sanitizeUrl('chrome://settings'), null);
  assert.equal(sanitizeUrl('not a url at all'), null);
  assert.equal(sanitizeUrl('ftp://files.example.com/x'), null);
  assert.equal(sanitizeUrl(''), null);
});

test('search queries are extracted from known engines', () => {
  const cases = [
    ['https://www.google.com/search?q=hawaii+vacation', 'hawaii vacation'],
    ['https://duckduckgo.com/?q=birthday+cake', 'birthday cake'],
    ['https://search.yahoo.com/search?p=vegas+shows', 'vegas shows'],
    ['https://www.youtube.com/results?search_query=guitar+lesson', 'guitar lesson'],
    ['https://www.amazon.com/s?k=kids+shoes', 'kids shoes'],
    ['https://www.ebay.com/sch/i.html?_nkw=vinyl+records', 'vinyl records']
  ];
  for (const [url, expected] of cases) {
    assert.equal(sanitizeUrl(url).query, expected, url);
  }
});

test('a non-search URL yields a null query', () => {
  assert.equal(sanitizeUrl('https://github.com/foo/bar/pull/12').query, null);
});

test('extremely long queries are truncated', () => {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', 'a'.repeat(5000));
  assert.equal(extractSearchQuery(url).length, 200);
});

/* ----------------------------------------------------------------- logging */

test('redactForLog stores host, category and terms only (PRD P5)', () => {
  const entry = redactForLog(
    { host: 'google.com', title: 'private page title', query: 'birthday cake', path: '/search' },
    { category: 'celebration', confidence: 0.8123, reasons: [{ term: 'cake' }, { term: 'birthday' }] },
    1000
  );
  assert.deepEqual(Object.keys(entry).sort(), ['at', 'category', 'confidence', 'host', 'terms']);
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('private page title'), 'the title must never be logged');
  assert.ok(!serialized.includes('/search'), 'the path must never be logged');
  assert.equal(entry.confidence, 0.81, 'confidence is rounded, not stored at full precision');
});

test('redactForLog caps the number of stored terms', () => {
  const reasons = Array.from({ length: 10 }, (_, i) => ({ term: `t${i}` }));
  assert.equal(redactForLog({ host: 'x.com' }, { category: 'c', confidence: 1, reasons }, 0).terms.length, 4);
});

test('redactForLog survives a signal with no host', () => {
  assert.equal(redactForLog({}, { category: 'c', confidence: 0, reasons: [] }, 0).host, '(unknown)');
});

/* ------------------------------------------------------------- host lists */

test('blocklist matching includes subdomains but respects the boundary', () => {
  assert.equal(isBlocklisted('mail.corp.example.com', ['example.com']), true);
  assert.equal(isBlocklisted('example.com', ['example.com']), true);
  assert.equal(isBlocklisted('notexample.com', ['example.com']), false);
  assert.equal(isBlocklisted('example.com', []), false);
  assert.equal(isBlocklisted('example.com', undefined), false);
});

test('host lists tolerate messy user input', () => {
  assert.equal(hostInList('shop.example.com', ['  Example.COM  ', '']), true);
});

/* ------------------------------------------------- permission scoping ---- */

test('originsForHosts requests the listed sites only, never all sites', () => {
  const origins = originsForHosts(['github.com', 'wikipedia.org']);
  assert.deepEqual(origins, [
    'https://*.github.com/*', 'http://*.github.com/*',
    'https://*.wikipedia.org/*', 'http://*.wikipedia.org/*'
  ]);
  for (const origin of origins) {
    assert.ok(!/^https?:\/\/\*\//.test(origin),
      'a blanket wildcard would make Chrome say "all your data on all websites"');
  }
});

test('originsForHosts normalises messy input and drops empties', () => {
  assert.deepEqual(originsForHosts(['  WWW.Example.COM ', '', null]),
    ['https://*.example.com/*', 'http://*.example.com/*']);
});

test('originsForHosts returns nothing for an empty list', () => {
  assert.deepEqual(originsForHosts([]), []);
  assert.deepEqual(originsForHosts(undefined), []);
});
