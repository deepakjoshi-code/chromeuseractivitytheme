import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, containsTerm, normalizeHost, hostMatches, tokenizePath }
  from '../../src/core/text.js';

test('normalizeText lowercases, strips punctuation and pads with spaces', () => {
  assert.equal(normalizeText('Birthday Cake!'), ' birthday cake ');
  assert.equal(normalizeText('  multiple   spaces  '), ' multiple spaces ');
});

test('normalizeText strips diacritics so accented input still matches', () => {
  assert.equal(normalizeText('Café Piñata'), ' cafe pinata ');
});

test('normalizeText handles non-string and empty input without throwing', () => {
  for (const input of [null, undefined, 42, {}, '']) {
    assert.equal(normalizeText(input), ' ');
  }
});

test('containsTerm matches whole words only', () => {
  const n = normalizeText('the cake is ready');
  assert.equal(containsTerm(n, 'cake'), true);
  assert.equal(containsTerm(n, 'ake'), false, 'must not match a substring');
  assert.equal(containsTerm(n, 'cakes'), false);
});

test('containsTerm matches multi-word phrases', () => {
  const n = normalizeText('best birthday cake ideas');
  assert.equal(containsTerm(n, 'birthday cake'), true);
  assert.equal(containsTerm(n, 'cake birthday'), false);
});

test('normalizeHost strips www and lowercases', () => {
  assert.equal(normalizeHost('WWW.Example.COM'), 'example.com');
  assert.equal(normalizeHost(undefined), '');
});

test('hostMatches respects the dot boundary', () => {
  assert.equal(hostMatches('github.com', '/', 'github.com'), true);
  assert.equal(hostMatches('api.github.com', '/', 'github.com'), true);
  assert.equal(hostMatches('notgithub.com', '/', 'github.com'), false,
    'suffix matching must not leak across a domain boundary');
  assert.equal(hostMatches('github.com.evil.test', '/', 'github.com'), false);
});

test('hostMatches supports host+path patterns', () => {
  assert.equal(hostMatches('nytimes.com', '/cooking/recipes/1', 'nytimes.com/cooking'), true);
  assert.equal(hostMatches('nytimes.com', '/politics', 'nytimes.com/cooking'), false);
});

test('tokenizePath drops short tokens and bare numeric ids', () => {
  assert.deepEqual(tokenizePath('/travel/hawaii/12345/at'), ['travel', 'hawaii']);
});
