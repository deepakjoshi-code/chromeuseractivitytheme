# PRD Gap Review — Aura

**Reviewer:** Product (self-review) + Architecture sanity pass
**Reviewed:** PRD v1.0 draft → findings folded into **PRD v1.1**
**Verdict:** 11 gaps found. 10 closed in v1.1. 1 accepted with rationale. **Cleared to implement.**

---

## Method

The v1.0 draft was reviewed against five lenses: *technical feasibility*, *privacy*,
*failure modes*, *user control*, and *testability*. Each finding is rated
**Blocker** (cannot ship), **Major** (ships badly), **Minor** (polish).

---

## G-01 — Blocker — The core premise was not implementable as written

**Finding.** The v1.0 draft said the extension would "change the browser theme". Chrome
exposes **no runtime theme API**. `chrome.theme.update()` is Firefox-only; Chrome themes are
static packaged resources and only one can be active. There is no way to recolour the tab
strip, toolbar, or omnibox from an extension at runtime. The entire product as originally
framed was impossible.

**Impact.** Would have been discovered mid-implementation, after architecture was committed.

**Resolution (v1.1 §3).** Added an explicit platform-constraint section with a
surface-by-surface capability table. Re-centred the product on the **New Tab page as hero
surface**, with ambient page framing and the toolbar badge as secondary. Firefox parity moved
to v2 behind the same engine. **Status: closed.**

---

## G-02 — Blocker — No sensitive-content firewall

**Finding.** v1.0 happily described theming on any detected topic. Nothing stopped the
browser from visibly reacting to a search for a medical diagnosis, a bankruptcy filing, or a
job hunt — in front of a partner, a colleague, or a screen-share.

**Impact.** A single such incident is an unrecoverable trust and PR failure. This is the
product's sharpest edge and v1.0 did not mention it.

**Resolution (v1.1 §6 P4/P9).** Added a hard sensitive-category firewall covering health,
finance, legal, adult, dating, mental health, job-hunting, religion and politics. On match,
classification is *abandoned* — nothing scored, nothing stored, theme falls back to neutral.
Made **non-disableable from the UI** (P9) and a **release blocker** in §10.
**Status: closed.**

---

## G-03 — Blocker — Theme flicker was unaddressed

**Finding.** v1.0 said "change the theme as the user's activity changes" with no stability
model. Real browsing is a rapid interleave of tabs; naive per-signal theming produces a
strobe light and instant uninstall.

**Resolution (v1.1 §7.3).** Specified a five-part stability model: confidence floor (0.35),
switch margin (0.15), dwell requirement (2 signals or 1500 ms), score decay (5-min half-life),
and a hard rate limit (1 change / 10 s). Also added A10 (never re-theme mid-typing).
**Status: closed.**

---

## G-04 — Major — No explainability, so misclassification reads as surveillance

**Finding.** v1.0 had a popup showing the current theme but not *why*. When the browser turns
tropical while you read a work doc, the difference between "cute bug" and "this thing is
watching me" is entirely whether it can tell you what it saw.

**Resolution (v1.1 B1).** Popup must render a plain-language reason: *"Tropical — because
'island', 'beach' in the page title."* Classifier is therefore required to be explainable,
which in turn drove the §7.2 decision to use deterministic weighted keywords over ML.
**Status: closed.**

---

## G-05 — Major — No negative feedback path

**Finding.** The user could change the theme but could not tell the system it was *wrong*.
Without this the same misfire repeats forever.

**Resolution (v1.1 B3).** Added **"Not this"**: reverts the theme and down-weights that
category for that domain persistently. Cheap to implement, high trust return.
**Status: closed.**

---

## G-06 — Major — Personas conflicted and the conflict was unresolved

**Finding.** v1.0 targeted both "delight-seeking planner" and "focused engineer" with one
experience. These want opposite things. Unresolved, the product would have shipped as
confetti for people who wanted calm.

**Resolution (v1.1 §4 + §7.4).** Named the tension explicitly and resolved it with a
four-level **intensity** control (Off / Subtle / Balanced / Expressive) plus per-category
muting. Default is Balanced. **Status: closed.**

---

## G-07 — Major — Permission scope would fail store review

**Finding.** Ambient page tinting as drafted implied `<all_urls>` host permissions. Combined
with "reads what you browse", this is a likely Chrome Web Store rejection and a scary install
prompt that would suppress adoption.

**Resolution (v1.1 Risks + B9).** Ambient framing is off by default and uses `activeTab` plus
**optional** host permissions requested only at the moment the user enables it. Core detection
needs only `tabs`. Permissions must be justified line-by-line in Options (P8).
**Status: closed.**

---

## G-08 — Major — Data retention was undefined

**Finding.** v1.0 described an activity log and a signal buffer with no caps, no TTL, and no
statement about what is stored. "We store your browsing" with no bound is indefensible.

**Resolution (v1.1 P5–P7, P10).** Raw URLs never persisted (host + matched keywords only);
in-memory signal buffer capped with a 30-min TTL; activity log a 50-entry ring buffer;
query strings stripped. Plus B11 one-click erase. **Status: closed.**

---

## G-09 — Minor — Accessibility was absent

**Finding.** A product whose entire value is *changing colours and adding motion* had no
contrast, motion, or colour-scheme requirements. Animated gradients are an accessibility
hazard.

**Resolution (v1.1 A8, A9).** `prefers-reduced-motion` must disable all motion; every theme
must define both light and dark palettes and follow `prefers-color-scheme`. Text contrast
against theme gradients is specified as a WCAG AA requirement in the implementation.
**Status: closed.**

---

## G-10 — Minor — Success metrics assumed telemetry the privacy goal forbids

**Finding.** v1.0 listed engagement metrics. G4 promises zero data leaves the device. These
are contradictory; the metrics were unmeasurable as stated.

**Resolution (v1.1 §9).** Metrics reframed as moderated-study and local-self-report measures,
with the contradiction called out in the section preamble. **Status: closed.**

---

## G-11 — Minor — Extensibility of the theme set was unstated

**Finding.** The theme list is the part most likely to grow weekly. Nothing required it to be
cheap to extend, so it would have been hard-coded across the engine.

**Resolution (v1.1 §8).** Added the requirement that a new theme is a **data-only** change:
one taxonomy entry plus one theme entry, zero engine edits. This is now an architectural
constraint and is covered by an integration test.
**Status: closed.**

---

## Accepted gap (not closed)

### A-01 — Classification quality ceiling of a keyword classifier

A deterministic keyword-and-host classifier will plateau well short of semantic
understanding. It will miss paraphrase ("somewhere warm with a beach" → tropical) and
misfire on polysemy ("Java", "Python", "Amazon" as a river).

**Accepted for v1**, because the alternative (a bundled model) costs megabytes of download,
breaks the one-sentence explainability requirement (B1) that G-04 made load-bearing, and is
not needed to validate the core hypothesis: *does context-reactive theming feel good?*
The stability model (§7.3) and "Not this" (B3) bound the damage from misfires.

Mitigation path for v2: add a small on-device embedding model behind the same
`classify(signal) -> {theme, confidence, reasons}` interface, so the swap is contained. The
architecture must therefore keep the classifier behind exactly that interface — recorded as
an architectural constraint.

---

## Conclusion

No open Blockers or Majors. The one accepted gap is bounded, justified, and has a contained
upgrade path that constrains the architecture in a documented way.

**Cleared to proceed to architecture and implementation.**
