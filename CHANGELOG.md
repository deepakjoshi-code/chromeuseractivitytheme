# Changelog

All notable changes to Aura. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.9.1] — 2026-09-05

### Fixed
- **Ambient page glow never activated.** Turning it on appeared to work — the
  checkbox stayed ticked and the setting saved — but no glow ever appeared.
  `chrome.permissions.request()` was being called from the service worker, which
  has no user gesture, so Chrome rejected it; the rejection was caught and
  ignored, host access was never granted, and the content script was never
  registered. The request now happens in the options page from the checkbox's own
  click, and `ambient: true` is only stored once access has actually been
  granted — a declined prompt un-ticks the box and says so, instead of leaving a
  setting that claims a feature is on while it is inert.
- **Enabling ambient glow only affected pages loaded afterwards.** Registering a
  content script does not touch tabs that are already open, so the feature looked
  dead until every tab was manually reloaded. Eligible open tabs are now injected
  immediately.
- **Revoked host access left the setting stuck on.** If access is removed from
  chrome://extensions, the options page now reconciles on load and turns the
  setting off rather than showing a checkbox that cannot do anything.

### Notes
Found by hand during beta testing, not by any suite — `docs/TESTING.md` had
already recorded permission prompts as undrivable headlessly, and that is exactly
where the defect was. Regression tests now assert the request is made from a page
and never from the worker.

## [0.9.0] — 2026-09-05 — first beta

First public beta. Feature-complete against the v1 PRD; released pre-1.0 because
classification quality is still being tuned against real browsing.

### Added
- **Ambient experience** — the New Tab page adapts to the current browsing
  context, cross-fading between 15 themes plus a neutral resting state. Every
  theme ships a full light and dark palette, all clearing WCAG AA contrast.
- **Studio experience** — a popup that explains its choice in one plain sentence,
  with pin (1 hour / today / until unpinned), "Not this" per-site rejection, a
  full theme gallery, and a one-click kill switch.
- **Settings** — four expression levels, per-theme muting, a per-site blocklist,
  forced light/dark, and the activity log with clear and erase-everything.
- **Sensitive-content firewall** — health, finance, legal, job hunting, dating,
  adult, crisis, religion and politics are never classified, stored or logged,
  and the displayed theme is left untouched.
- **Optional ambient page glow** — off by default, per-site, and the only feature
  that ever requests host access.

### Privacy
- Zero network access, enforced three ways: manifest CSP `connect-src 'none'`, a
  static source scan in the build, and a runtime guard that makes `fetch` throw.
- No host permissions requested at install; the ambient content script is
  registered at runtime only after the user opts in.
- Disabled in Incognito by manifest.
- Full URLs are never persisted — the activity log keeps hostname and matched
  terms only, capped at 50 entries.

### Known limitations
- Chrome exposes no runtime theme API, so the browser's own tab strip, toolbar
  and omnibox cannot be themed by any extension. Aura themes its New Tab page,
  its own surfaces, the toolbar badge, and an optional page overlay.
- Classification is a deterministic keyword and host-prior engine. It misses
  paraphrase ("somewhere warm with a beach") and can misfire on ambiguous words.
  "Not this" and per-theme muting are the intended remedies while this improves.
- Firefox is not yet supported.

### Fixed during beta hardening
Found by an end-to-end suite running against real Chrome with the extension
loaded — none of these were reachable from the mocked test layers:
- Switching back to an already-open tab re-scored and re-logged that page, so
  alt-tabbing inflated a context's evidence and flooded the activity log. Signals
  are now de-duplicated per tab within a 30-second window.
- A tab event already in flight could append to the activity log immediately
  *after* "Erase everything" ran. Writes now carry an erase epoch and are dropped
  if an erase happened underneath them.
- A decisive context switch could sit unreflected for most of a minute when both
  the old and new contexts had reached the evidence ceiling. The staleness window
  that breaks that tie was cut from 45s to 15s.
