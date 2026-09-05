# PRD — Aura: Context-Aware Browser Theming

**Owner:** Product
**Status:** v1.1 (post gap-review; see `PRD-REVIEW.md`)
**Last updated:** 2026-09-05

---

## 1. Problem statement

The browser looks identical whether you are planning a child's birthday party, booking a
Hawaii holiday, debugging a service, or buying school shoes. The single most-used piece of
software on a person's computer has zero awareness of what the person is actually doing.

Meanwhile, the moments people care about — a trip they are excited for, a party they are
planning — are exactly the moments where a little atmosphere makes the tool feel personal
rather than industrial.

**Aura** makes the browser reflect what you are doing right now: search "Hawaii vacation" and
the browser turns warm, tropical and sunlit. Open a pull request and it turns into a calm,
focused dark workspace. Shop for a birthday cake and it turns festive.

## 2. Goals and non-goals

### Goals
- **G1** Detect the user's *current activity context* from ordinary browsing signals, on-device.
- **G2** Translate that context into a coherent visual theme within ~1 second of a context switch.
- **G3** Keep the user in control at all times: see it, understand it, pin it, mute it, kill it.
- **G4** Be provably private: no browsing data leaves the device, ever. Zero network calls.
- **G5** Never be embarrassing: sensitive activity must never be reflected visually.

### Non-goals (v1)
- No cloud sync of themes or history.
- No ML model download / no LLM inference. v1 is a deterministic on-device classifier.
- No theming of *other people's websites' content* beyond an opt-in ambient frame.
- No monetisation, accounts, or telemetry.
- No mobile (Chrome on Android does not support extensions).

## 3. The hard platform constraint (read this first)

> **Chrome has no runtime theme API.** Unlike Firefox (`browser.theme.update()`), a Chrome
> extension **cannot** recolour the browser's own chrome (tab strip, toolbar, omnibox) at
> runtime. Chrome themes are static, packaged, and only one may be active at a time.

This kills the naive framing of "the extension repaints the browser". The PRD therefore
defines the product around the surfaces an extension *can* legitimately own:

| Surface | Can we theme it? | How |
| --- | --- | --- |
| New Tab page | **Yes, fully** | `chrome_url_overrides.newtab` — our own page |
| Extension popup / options | **Yes, fully** | our own pages |
| Toolbar icon + badge | **Yes** | `chrome.action.setIcon` / `setBadgeBackgroundColor` |
| Web page ambience (edges, tint) | **Yes, opt-in** | content script overlay, `pointer-events:none` |
| Tab strip / toolbar / omnibox | **No** | no API exists in Chrome |

**Product decision:** the New Tab page is the hero surface. It is the moment of intent — the
user is between tasks and looking at a blank canvas — and it is the moment where atmosphere is
most welcome and least intrusive. Ambient page tinting is a secondary, **off-by-default**,
per-site-controllable garnish.

Firefox parity (where the real chrome *can* be themed) is tracked as a v2 item, behind the
same core engine.

## 4. Target users

| Persona | Description | Primary need |
| --- | --- | --- |
| **Maya, the planner** | Plans trips, parties, home projects across dozens of tabs. Non-technical. | Wants delight; wants the browser to "get" the mood of what she is planning. |
| **Dev, the builder** | Engineer, 60+ tabs, lives in docs/GitHub/localhost. | Wants low-distraction focus states, not confetti. Needs an instant off switch. |
| **Sam, the parent-shopper** | Buys for kids, compares prices, browses school lists. | Wants the browser to feel light and useful, and to *never* surface anything private. |

These three drive a key tension the design must resolve: **delight for Maya must not become
distraction for Dev.** Resolved via intensity levels (§7.4) and per-category muting.

## 5. The two experiences

The product ships as **two complementary experiences** on one engine.

---

### Experience A — "Ambient" (passive, zero-touch)

*The product working without being asked.*

The user installs Aura and does nothing else. As they browse, the New Tab page — and,
optionally, a soft frame around web pages — quietly matches what they are doing.

**Narrative flow**

1. Maya searches `birthday cake ideas for 6 year old`.
2. Aura's on-device classifier scores the signal → `celebration` (confidence 0.82).
3. Confidence clears the threshold and holds through the hysteresis window (§7.3).
4. Maya opens a new tab. Instead of a blank grid, she gets a warm confetti-gradient canvas,
   a soft "Celebration" label, the time, and her search box. It feels like the browser is
   in on the plan.
5. She switches to reviewing a PR. Within a second of the context settling, the next new tab
   is a deep, quiet slate-and-cyan workspace.

**Requirements**

| ID | Requirement | Priority |
| --- | --- | --- |
| A1 | Classify context from tab title + URL + extracted search query, fully on-device. | P0 |
| A2 | Update the active theme within **1s** of a stable context switch. | P0 |
| A3 | New Tab page renders the active theme: gradient, accent, motif, typography, label. | P0 |
| A4 | New Tab shows clock, greeting, search box, and recent-context chips. | P0 |
| A5 | Transitions between themes must be animated and gentle (≥400ms cross-fade), never a flash. | P0 |
| A6 | Toolbar icon badge tints to the active theme's accent so the state is visible from anywhere. | P1 |
| A7 | Ambient page frame (edge glow + optional tint), **off by default**, per-site toggleable. | P1 |
| A8 | Motion respects `prefers-reduced-motion`; all animation stops when set. | P0 |
| A9 | Full light/dark support — every theme defines both, follows `prefers-color-scheme`. | P0 |
| A10 | Theme must never change while the user is *typing* into the new tab search box. | P1 |

---

### Experience B — "Studio" (active, in-control)

*The product as an instrument the user plays.*

The popup and options page turn Aura from a black box into something legible and tunable.

**Narrative flow**

1. Dev sees the browser go tropical while he is reading a Kubernetes doc about "island
   deployments". He clicks the Aura icon.
2. The popup says, plainly: **"Tropical — because 'island', 'beach' in the page title."**
   That single sentence converts a creepy moment into an understandable one.
3. He clicks **Not this** → the theme reverts and `tropical` is down-weighted for this domain.
4. He clicks **Pin** on `Focus` so his workday stays calm regardless of what he reads.
5. In Options he sets intensity to **Subtle**, mutes `celebration`, and turns off ambient
   page tinting for `*.corp.internal`.

**Requirements**

| ID | Requirement | Priority |
| --- | --- | --- |
| B1 | Popup shows current theme, confidence, and a **plain-language reason** ("because X, Y"). | P0 |
| B2 | **Pin** — lock a theme indefinitely or for a duration; detection pauses while pinned. | P0 |
| B3 | **Not this** — reject current classification; suppress that category for the domain. | P0 |
| B4 | Manual theme picker — browse and apply any theme from the gallery. | P0 |
| B5 | Global **on/off** kill switch, reachable in one click from the popup. | P0 |
| B6 | Options: intensity (Off / Subtle / Balanced / Expressive). | P0 |
| B7 | Options: per-category mute list. | P1 |
| B8 | Options: site blocklist — never classify or theme on these domains. | P0 |
| B9 | Options: ambient page frame toggle + per-site allow/deny. | P1 |
| B10 | Options: **Activity log** — last N classifications, what was seen, why. Clearable. | P0 |
| B11 | One-click **Erase all data**. | P0 |
| B12 | Options: import/export settings as JSON (no history included). | P2 |

---

## 6. Privacy — the product's spine

Aura reads what you browse. That is only acceptable if the contract is absolute and legible.

| ID | Requirement | Priority |
| --- | --- | --- |
| P1 | **Zero network.** No `fetch`/`XMLHttpRequest`/`WebSocket` to any origin. Enforced by CSP and by test. | P0 |
| P2 | All classification happens on-device, synchronously, in the service worker. | P0 |
| P3 | Never active in **Incognito** — default `incognito: "not_allowed"` in the manifest. | P0 |
| P4 | **Sensitive-category firewall.** If a signal matches health, finance/banking, legal, adult, dating, mental-health, job-hunting, religion, or politics → classification is **abandoned**: nothing is scored, nothing is stored, nothing is logged, and **the currently displayed theme is left untouched**. | P0 |
| P5 | Raw URLs are **never persisted**. The activity log stores eTLD+1 host + matched keywords only. | P0 |
| P6 | Signal buffer is in-memory, capped, and TTL-expired (30 min). | P0 |
| P7 | Activity log capped at 50 entries, ring-buffered, user-clearable. | P0 |
| P8 | The permission set must be minimal and justifiable line-by-line in the options page. | P0 |
| P9 | The sensitive-category firewall must be **impossible to disable** from the UI. | P0 |
| P10 | Query strings are stripped from all stored/logged data except the extracted search term, which itself passes through the sensitive filter first. | P0 |

> **Revised during implementation (P4).** The firewall was first specified to fall back to
> *neutral* on a sensitive match. That is a leak. Snapping the browser to neutral the moment a
> private page opens is itself an observable signal — anyone watching the screen learns that
> something private is being read, which is most of the harm the firewall exists to prevent.
> Holding the previous theme reveals nothing. The rule is therefore **change nothing**, not
> **change to neutral**.

## 7. Detection design (product-level)

### 7.1 Signals used (v1)
1. **Search queries** — extracted from known search-engine URLs (Google, Bing, DuckDuckGo,
   YouTube, Amazon, Etsy, etc.). Highest weight: this is stated intent.
2. **Page title** — of the active tab. Medium weight.
3. **Hostname** — strong prior for well-known sites (`github.com` → coding).
4. **URL path segments** — weak weight, tokenised.

**Not used in v1:** page body text, form input, browsing history API, bookmarks, cookies.

### 7.2 Classifier
Deterministic, explainable, weighted keyword + host-prior scoring. Chosen over ML because:
(a) it must justify itself in one sentence to the user (B1); (b) zero download size;
(c) no data ever needed for training. See `ARCHITECTURE.md` §4.

### 7.3 Stability (the flicker problem)
Naive per-tab theming produces a strobe light. Required behaviour:
- **Confidence floor** — below 0.35 confidence the theme does not change.
- **Switch margin** — a challenger must carry **≥35% more accumulated evidence** than the
  incumbent to take over.
- **Staleness waiver** — if the incumbent context has had no reinforcement for 45s, the
  margin is waived. The user has plainly moved on; making them fight the damper is wrong.
- **Concurrent contexts hold.** If two contexts are *both* being actively reinforced, the
  incumbent keeps the screen until one of them goes quiet. Flip-flopping between two things
  the user is genuinely doing at once is worse than picking one and staying put.
- **Dwell time** — a new context must hold the lead for ≥2 qualifying signals *or* 1500 ms.
- **Decay** — a context's evidence halves every **2 minutes** without reinforcement.
- **Evidence ceiling** — accumulated evidence is capped so a long session cannot ossify.
- **Rate limit** — at most one theme change per 10 seconds.

> **Revised during implementation.** The switch margin was first specified as an absolute
> +0.15 on *confidence*. That is unimplementable as intended: confidence saturates, so after a
> long session every category crowds toward 1.0 and a fixed absolute gap becomes unreachable —
> the first theme of the day would lock in permanently. The margin is now expressed as a
> scale-free ratio in the evidence domain (identical behaviour when evidence is low, correct
> behaviour when it is high), with a staleness waiver and an evidence ceiling as backstops.
> The floor remains absolute, where a threshold is the right shape. The decay half-life was
> also shortened from 5 minutes to 2, because at 5 minutes a morning's accumulated context
> still outweighed the last two minutes of browsing — the opposite of what this product is for.

### 7.4 Intensity levels
| Level | New Tab | Ambient frame | Motion |
| --- | --- | --- | --- |
| Off | neutral only | none | none |
| Subtle | muted gradient, no motif | none | fade only |
| Balanced *(default)* | full gradient + motif | off | gentle |
| Expressive | full + parallax motif | on (if enabled) | full |

## 8. Theme taxonomy (v1)

15 themes + neutral fallback. Each defines: light palette, dark palette, accent, gradient
stops, motif (inline SVG), label, and a one-line description.

`celebration` · `tropical` · `vegas` · `coding` · `shopping` · `kids` · `travel` · `food` ·
`fitness` · `music` · `gaming` · `nature` · `study` · `work` · `seasonal` · **`neutral`**

Extensibility requirement: adding a theme must be a **data-only** change (one taxonomy entry
+ one theme entry), no engine changes.

## 9. Success metrics

Because there is no telemetry (G4), these are measured in moderated usability studies and a
local self-report prompt, not analytics.

| Metric | Target |
| --- | --- |
| Correct-context rate (judged by user, 20-task study) | ≥ 75% |
| "Not this" rejections per 100 new tabs | ≤ 5 |
| Time-to-theme after context switch | ≤ 1000 ms (p95) |
| New Tab render (first paint) | ≤ 100 ms |
| Uninstall reason "distracting" | < 10% |
| Sensitive-category leak incidents | **0** (release blocker) |

## 10. Release criteria

- [ ] All P0 requirements implemented.
- [ ] Sensitive-firewall test suite passes 100% (release blocker).
- [ ] Zero-network test passes (static scan + runtime guard).
- [ ] Unit + integration suites green.
- [ ] New Tab p95 first paint ≤ 100 ms on a mid-tier laptop.
- [ ] Manifest permissions justified in `docs/ARCHITECTURE.md` §9 and surfaced in Options.

## 11. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| No Chrome theme API undercuts the pitch | High | Reframe around New Tab as hero surface (§3); be explicit in store listing. |
| Misclassification feels creepy | High | Explainability (B1) + "Not this" (B3) + sensitive firewall (P4). |
| Theme flicker | Medium | Hysteresis engine (§7.3). |
| Ambient tint breaks a site's layout | Medium | Off by default; `pointer-events:none`; overlay-only; per-site kill. |
| Store review rejects broad host permissions | Medium | Ambient frame uses `activeTab`+opt-in `optional_host_permissions`, not blanket `<all_urls>`. |
| Perceived as spyware | High | Zero-network claim + open source + activity log + one-click erase. |
