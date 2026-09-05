# Testing — Aura

**Runner:** `node:test`, zero dependencies (except Playwright for the optional visual pass).
**Command:** `npm test`

```
npm test              # everything: 152 assertions across unit + integration
npm run test:unit
npm run test:integration
npm run test:visual   # renders every page in Chromium and screenshots it
```

## Why there is no test framework

`core/` is pure: no `chrome.*`, no clocks, no I/O (ARCHITECTURE.md §1). Time is injected,
the chrome namespace is injected. That leaves nothing that needs mocking beyond
`chrome.storage`, which `test/helpers/chrome-mock.js` covers in ~50 lines. A framework would
add a supply chain to a product whose entire pitch is "this thing touches nothing".

## Layers

| Layer | File | What it protects |
| --- | --- | --- |
| Text utilities | `unit/text.test.js` | word-boundary matching, host suffix boundaries, diacritics |
| **Privacy firewall** | `unit/privacy.test.js` | **release blocker** — sensitive detection, URL redaction |
| Classifier | `unit/classifier.test.js` | the brief's scenarios, polysemy traps, explainability |
| Stability | `unit/scoring.test.js` | flicker, decay, margin, staleness, the saturation regression |
| Themes | `unit/themes.test.js` | palette completeness, intensity ordering |
| Accessibility | `unit/contrast.test.js` | WCAG AA for 16 themes × 2 schemes × 6 pairings |
| Storage | `unit/storage.test.js` | defaults, migration, ring buffer, pin expiry, erase |
| Pipeline | `integration/pipeline.test.js` | signal → theme, end to end through real modules |
| Journeys | `integration/scenarios.test.js` | the PRD personas, start to finish |
| Lifecycle | `integration/lifecycle.test.js` | MV3 worker death, lazy decay, browser restart |
| Contract | `integration/contract.test.js` | manifest, permissions, CSP, zero-network, extensibility |
| Visual | `visual/render.mjs` | every page actually renders, in light and dark |

## The tests that exist because of a specific risk

Each of these traces to a numbered finding in `PRD-REVIEW.md`.

- **`a sensitive page changes NOTHING and leaks nothing`** (G-02) — asserts not only that the
  theme is unchanged but that no trace of the sensitive terms exists in either storage area.
  It also asserts the theme does *not* revert to neutral, because reverting is itself a tell.
- **`REGRESSION: a heavily reinforced incumbent is displaced in bounded time`** (G-03) — the
  first margin design was an absolute gap on a saturating value, which made an entrenched
  theme permanent. This test would have caught it.
- **`two concurrently active contexts do not flip-flop`** (G-03) — the opposite failure: an
  interleaved session must settle, not strobe. Asserts ≤1 change over 60 interleaved signals.
- **`Dev's work session is never interrupted by a wrongly-detected holiday`** (A-01) — pins the
  negative-keyword disambiguation that keeps "island architecture" out of the tropics.
- **`adding a theme is a data-only change`** (G-11) — greps `core/` for hard-coded category
  names outside the two data files. Adding a theme must not require an engine edit.
- **`install-time permissions are minimal and contain no host access`** (G-07) — the store
  review and first-impression risk.
- **`the only external URL in the source is the search-box navigation`** (P1) — the
  zero-network promise, enforced by static scan rather than good intentions.

## Bugs the suite and the visual pass actually caught

Recorded because "what did testing find" is the honest measure of whether it was worth writing.

1. **`study.dark.accent` was `#d0a busy`** — a corrupted colour value. Caught by the contrast
   test's hex validation before it ever rendered.
2. **The switch margin was mathematically unreachable at high evidence.** Caught by the
   regression test above; fixed by moving the margin into the evidence domain, and the PRD was
   corrected to match.
3. **A 5-minute decay half-life made the engine too sticky** for a "what are you doing now"
   product — a morning's context outweighed the last two minutes. Caught while making the
   staleness test pass; half-life cut to 2 minutes.
4. **`display: flex` on `.pin-durations` silently defeated `el.hidden = true`**, so the popup
   showed its pin-duration row on open. Caught by the visual pass, not by any assertion —
   which is exactly why the visual pass exists. Fixed with a `[hidden]` guard in all three
   stylesheets.
5. **The New Tab motif tiled into wallpaper** and the reason line truncated mid-sentence.
   Both caught by looking at the screenshots.

## Not covered

- No real Chrome extension host is exercised: `chrome.tabs` event wiring, `chrome.action`
  badge painting, `permissions.request` and `scripting.registerContentScripts` are only
  reachable in a real browser profile. They live in `background/service-worker.js`, which is
  kept deliberately thin and logic-free for exactly this reason.
- The ambient content script's DOM behaviour on real sites is unverified.
- Classifier quality is asserted on curated cases, not measured on a corpus. PRD §9's
  correct-context target is a moderated-study metric, not a unit test.
