# Architecture — Aura

**Status:** v1.0 · derived from `PRD.md` v1.1 and `PRD-REVIEW.md`
**Target:** Chrome MV3, Chrome 116+

---

## 1. Principles

1. **Pure core, thin shell.** All decision logic is dependency-free ES modules that never
   touch `chrome.*`. Platform access lives only in the service worker and page shells. This
   makes the whole engine unit-testable under plain Node with no browser mock.
2. **Explainable by construction.** `classify()` returns its reasons as data, not as a log
   line. The popup renders them directly (PRD B1).
3. **One swappable classifier seam.** Everything talks to
   `classify(signal, ctx) -> Classification`. Per `PRD-REVIEW.md` A-01, a future model
   implementation must be a drop-in behind this signature.
4. **Data-only theme extension.** Adding a theme touches `taxonomy.js` + `themes.js` only
   (PRD §8), enforced by an integration test.
5. **Fail neutral.** Any error, any uncertainty, any sensitive match → `neutral`. Never a
   wrong theme, never a crash surfaced to the user.

## 2. Component map

```
                    ┌──────────────────── chrome.tabs events ─────────────────┐
                    │                                                          │
                    ▼                                                          │
        ┌───────────────────────┐                                              │
        │  background/          │   MV3 service worker (ephemeral)             │
        │  service-worker.js    │   • owns the event loop                      │
        └───────────┬───────────┘   • rehydrates state from storage on wake    │
                    │                                                          │
   ┌────────────────┼──────────────────────────────────────────┐               │
   ▼                ▼                ▼                          ▼               │
┌────────┐   ┌────────────┐   ┌────────────┐            ┌─────────────┐        │
│privacy │──▶│ classifier │──▶│  scoring   │───────────▶│   themes    │        │
│  .js   │   │    .js     │   │    .js     │  decision  │    .js      │        │
└────────┘   └─────┬──────┘   └────────────┘            └─────────────┘        │
  firewall         │ uses            hysteresis /            palettes           │
  (P4/P9)          ▼ taxonomy.js     decay / margin                            │
             ┌────────────┐                                                     │
             │ taxonomy.js│  keywords · host priors · sensitive patterns        │
             └────────────┘                                                     │
                    │                                                           │
                    ▼  storage.js (chrome.storage.local wrapper, mockable)      │
        ┌───────────────────────────────────────────────────┐                   │
        │  settings · pin · activity log · domain rejections │                  │
        └───────────────────────────────────────────────────┘                   │
                    │                                                           │
   ┌────────────────┼───────────────┬──────────────────┬─────────────┐          │
   ▼                ▼               ▼                  ▼             └──────────┘
┌────────┐   ┌───────────┐   ┌────────────┐   ┌───────────────┐
│ newtab │   │  popup    │   │  options   │   │ content/      │
│  (A)   │   │   (B)     │   │    (B)     │   │ ambient.js (A7)│
└────────┘   └───────────┘   └────────────┘   └───────────────┘
 hero surface  explain+pin      settings         opt-in overlay
```

## 3. Module contracts

### `core/taxonomy.js` — data only
```js
CATEGORIES = { celebration: { label, keywords:[{t,w}], hosts:[{h,w}], negatives:[] }, ... }
SENSITIVE_PATTERNS = [ /regex/, ... ]        // PRD P4
SEARCH_ENGINES = [ { host, param }, ... ]    // query extraction
```

### `core/privacy.js` — the firewall (PRD P4, P5, P10)
```js
isSensitive(text) -> boolean
sanitizeUrl(rawUrl) -> { host, pathTokens, query } | null   // never returns raw URL
redactForLog(signal, reasons) -> { host, terms[], at }      // what may be persisted
```
Runs **before** the classifier. A sensitive match aborts the pipeline entirely — the signal is
not scored, not buffered, not logged.

### `core/classifier.js` — the swappable seam
```js
classify(signal, { mutedCategories, domainRejections }) -> {
  category: string,          // taxonomy key or 'neutral'
  confidence: number,        // 0..1
  reasons: [{ term, weight, source }],   // drives PRD B1
  sensitive: boolean
}
```
Scoring: `Σ (weight × sourceMultiplier)`, where source multipliers are
`query 1.0 · host 0.9 · title 0.6 · path 0.3`, normalised by a saturating curve
`c = s / (s + K)` with `K = 3.0` so confidence is bounded and comparable across categories.
Negative keywords subtract, which is how `amazon.com` (shopping) is prevented from firing on
`amazon rainforest` (nature).

### `core/scoring.js` — stability (PRD §7.3)
Pure reducer, no clocks of its own — time is injected, so tests are deterministic.
```js
createState() -> ContextState
ingest(state, classification, now) -> ContextState   // decay + accumulate
decide(state, now, config) -> { changed, category, confidence } // floor/margin/dwell/ratelimit
```

### `core/themes.js`
```js
THEMES[key] = { label, description, motif, light:{...}, dark:{...} }
resolveTheme(key, scheme, intensity) -> CSSVariableMap
```

### `core/messages.js`
Typed message constants shared by worker and all page shells. One place, no string literals
scattered across surfaces.

## 4. Classification pipeline

```
tab event
  └─▶ ignore? (chrome://, extension pages, blocklisted site, incognito)   → drop
  └─▶ sanitizeUrl → { host, pathTokens, query }                           (P5/P10)
  └─▶ isSensitive(query + title + host)?  → ABORT, force neutral          (P4)
  └─▶ classify(signal)                                                    (explainable)
  └─▶ muted category / domain-rejected? → drop
  └─▶ scoring.ingest(state, classification, now)                          (decay+accumulate)
  └─▶ scoring.decide(state, now, config)                                  (hysteresis)
  └─▶ changed? → persist active theme, badge tint, broadcast THEME_CHANGED
```

## 5. MV3 service-worker lifecycle

The worker is killed after ~30 s idle. Consequences the design must absorb:

- **No in-memory-only state that matters.** `ContextState` is serialised to
  `chrome.storage.session` on every mutation and rehydrated on wake. Session storage is
  cleared on browser restart, which is the correct semantic — context should not survive a
  restart.
- **No `setInterval` for decay.** Decay is computed lazily from timestamps at read time. This
  is why `scoring.js` takes `now` as a parameter rather than calling `Date.now()`.
- **Broadcast is best-effort.** `runtime.sendMessage` rejects when no page is listening; every
  send is wrapped and the rejection swallowed. Pages also *pull* state on load rather than
  relying solely on push.

## 6. New Tab performance (PRD §9: ≤100 ms first paint)

The theme must be on screen in the first frame — a flash of unthemed content is the single
most visible defect on the hero surface.

- The active theme's CSS variables are mirrored into `chrome.storage.local` under a single
  key so the new tab reads **one** value.
- `newtab.js` applies variables **before** any other work, then renders content.
- Motifs are inline SVG data — no network, no image decode, no layout shift.
- Fonts are system stacks only. Zero web fonts.

## 7. Ambient content script (PRD A7, off by default)

A single fixed-position `div` with `pointer-events: none`, `z-index: 2147483646`, holding an
edge gradient. It never modifies site DOM, never injects stylesheets into the page's cascade
beyond its own scoped element, and is removed cleanly on disable. Runs only where the user has
granted optional host permission.

## 8. Storage schema

| Store | Key | Contents | Lifetime |
| --- | --- | --- | --- |
| `local` | `settings` | intensity, enabled, ambient, muted[], blocklist[], scheme | permanent |
| `local` | `activeTheme` | `{ category, confidence, reasons, at }` | permanent |
| `local` | `pin` | `{ category, until \| null }` | until cleared |
| `local` | `log` | ring buffer, 50 entries, redacted (P7) | until cleared |
| `local` | `rejections` | `{ "host": ["category"] }` from "Not this" (B3) | until cleared |
| `session` | `contextState` | decaying score map | until browser restart |

## 9. Permissions — line-by-line justification (PRD P8)

| Permission | Why | Could we avoid it? |
| --- | --- | --- |
| `tabs` | Read active tab title + URL — the entire signal source. | No. |
| `storage` | Settings, active theme, log. | No. |
| `activeTab` | Ambient overlay on the tab the user is on. | No, and it is the narrow choice. |
| `optional_host_permissions: <all_urls>` | Ambient overlay on non-active tabs. **Optional**, requested only when the user enables ambient. | Yes — and we do. Not requested at install. |
| `chrome_url_overrides.newtab` | The hero surface. | No. |
| `incognito: not_allowed` | Hard privacy guarantee (P3). | It is a restriction, not a grant. |

Explicitly **not** requested: `history`, `bookmarks`, `cookies`, `webRequest`, `scripting` on
all sites, and any host permission at install time.

## 10. Zero-network enforcement (PRD P1)

Three independent layers:
1. **Manifest CSP** — `connect-src 'none'` in `content_security_policy.extension_pages`.
2. **Static test** — a repo scan fails the build on `fetch(`, `XMLHttpRequest`, `WebSocket`,
   `sendBeacon`, or `import(` from a URL in `src/`.
3. **Runtime guard** — the service worker overwrites `globalThis.fetch` with a throwing stub at
   startup, so an accidental future call fails loudly in development.

## 11. Testing strategy

| Layer | Scope | Tool |
| --- | --- | --- |
| Unit | `core/*` — pure functions, no mocks needed | `node:test` |
| Integration | full pipeline; `chrome.*` fake; SW lifecycle; extensibility invariant | `node:test` + `test/helpers/chrome-mock.js` |
| Contract | manifest validity, permission set, CSP, no-network scan, asset presence | `node:test` |
| Accessibility | WCAG AA contrast for every theme × light/dark × text role | `node:test` (computed) |

Rationale for `node:test`: zero dependencies, no install step, no supply chain. The pure-core
principle (§1) is what makes this sufficient.

## 12. Deferred to v2

Firefox `theme.update()` parity · on-device embedding classifier (A-01) · theme scheduling by
time of day · user-authored themes · sync.
