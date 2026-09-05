# Testing — Aura

**Runner:** `node:test`, zero dependencies (Playwright only for the browser passes).
**Command:** `npm test`

```
npm test              # 158 assertions, unit + integration, no dependencies
npm run test:unit
npm run test:integration
npm run test:e2e      # 17 assertions against REAL Chrome, extension loaded
npm run test:all      # both
npm run test:visual   # renders every page in Chromium and screenshots it
npm run verify        # build the .zip, then load THAT in Chrome and smoke-test it
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
| **End-to-end** | `e2e/extension.test.mjs` | **real Chrome**: worker registration, tab events, New Tab override, message protocol, permissions |
| Package | `tools/verify-package.mjs` | the built `.zip` — not the source tree — loads and works |

## The end-to-end layer

`npm run test:e2e` launches real Chrome with the extension loaded unpacked, then
browses. The trick that makes it work offline: `--host-resolver-rules` maps every
hostname to a local server, so the extension sees genuine hosts like `github.com`
while no packet leaves the machine.

This is the layer that was listed as "not covered" before the beta, and it
immediately found three defects the mocked layers could not (below).

> **Gotcha, if this ever fails only in CI.** Playwright's default headless browser is the
> *headless shell*, which cannot load extensions at all — the service worker never registers
> and the extension id comes back `null`, so every later assertion fails as a cascade. Both
> the e2e suite and `tools/verify-package.mjs` therefore pass `channel: 'chromium'` to select
> the full build (verified: the same run loads the extension under the full binary and fails
> to under the headless shell). `CHROMIUM_PATH` overrides for environments that ship their
> own binary; the two options are mutually exclusive, so only one is ever passed.

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

### Found only by real Chrome (beta hardening)

6. **Tab activation re-scored and re-logged the same page.** Chrome fires tab events on
   activation as well as navigation, so alt-tabbing to an already-open tab re-delivered a
   signal the engine had already counted — inflating that context's evidence and filling the
   activity log with duplicates. Every mocked test drove signals in one direction and never
   simulated a tab switch, so none of them could see it. Fixed with per-tab de-duplication
   inside a 30-second window; `switching back to an already-open tab does not re-log it` pins
   it, in the browser where it happened.
7. **An in-flight signal could write to the log after "Erase everything".** A tab event that
   started before the erase completed its write afterwards, leaving a record the user had
   explicitly destroyed. Fixed with an erase epoch: writes carry the epoch they began under
   and are dropped if an erase happened underneath them.
8. **A decisive context switch could take most of a minute.** With two contexts both at the
   evidence ceiling, the ratio margin is a tie that only the staleness waiver can break — and
   it was set to 45 seconds. Switching from holiday-planning to a GitHub session left the
   browser on the wrong theme far too long. Only visible with real timing; the mocked tests
   used synthetic clocks and happened to space signals widely. Staleness cut to 15 seconds,
   with the anti-strobe test pinning the other side of the trade.

## Not covered

- **`chrome.action` badge painting** is not asserted. Extension action badges are not
  readable from the page context, so verifying the colour would need a screenshot of browser
  chrome that headless Chrome does not expose.
- **The ambient overlay's behaviour on real sites** is unverified. The e2e suite asserts it is
  *absent* by default, which is the security-relevant half; the appearance half needs the
  optional host permission, and permission prompts cannot be driven headlessly.
- **Classifier quality** is asserted on curated cases, not measured on a corpus. PRD §9's
  75% correct-context target is a moderated-study metric, and the honest reason for shipping
  0.9.0 rather than 1.0.
- **Firefox** is not built or tested.
