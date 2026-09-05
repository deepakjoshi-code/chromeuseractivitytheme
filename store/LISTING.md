# Chrome Web Store listing — Aura 0.9.0 (beta)

Everything the submission form asks for, ready to paste. Assets are in `store/assets/`.

---

## Item details

**Name**
```
Aura — Context-Aware Themes
```

**Short description** (132 char max — this is 129)
```
Your browser, in the mood you're in. Your New Tab adapts to what you're doing — entirely on your device, with zero network.
```

**Category:** Appearance / Themes
**Language:** English (United States)

---

## Detailed description

```
Aura makes your New Tab page reflect what you're actually doing.

Planning a birthday party? Your New Tab turns warm and festive. Booking a trip to
Maui? Sunlit and tropical. Deep in a pull request? A quiet, dark workspace that
stays out of your way.

All of it is decided on your own machine, from the title and address of the tab
you're on. Aura makes no network requests of any kind — there is nothing to send
because nothing is sent.


HOW IT WORKS

Aura reads the title and address of your active tab and matches them against an
on-device list of topics. When it's confident, and the context has held steady
for a moment, your New Tab cross-fades to a matching palette. It won't flicker,
it won't chase every tab you touch, and it settles back to neutral when you stop.

Fifteen themes, each with a full light and dark palette:
Celebration · Tropical · Neon Nights · Focus · Marketplace · Playtime ·
Wanderlust · Kitchen · Momentum · Amplify · Arcade · Wildwood · Study Hall ·
Workday · Season


IT TELLS YOU WHY

Click the Aura icon and it says, in one plain sentence, what it saw:
"Tropical — because 'maui', 'snorkeling' in your search."

If it's wrong, hit "Not this". The theme reverts and Aura stops making that
guess on that site. Or pin a theme for an hour, for the day, or until you unpin
it, and detection pauses entirely.


PRIVACY, IN PLAIN TERMS

• Zero network. No analytics, no telemetry, no accounts, no sync. The extension's
  security policy blocks outbound connections outright.
• Aura is disabled in Incognito and cannot be enabled there.
• Aura never reacts to anything that looks like health, money, legal trouble, job
  hunting, dating, adult content, politics or religion. It scores nothing, stores
  nothing, and leaves your theme exactly as it was. There is no switch for this.
• Full web addresses are never stored. The activity log — which you can read and
  clear at any time — keeps only the site's host and the words that matched.
• No host access is requested when you install. It's only asked for if you turn
  on the optional ambient page glow.
• Aura does not request access to your browsing history, bookmarks, cookies,
  downloads, or the contents of any page.
• One click erases everything.


MAKE IT YOURS

• Four expression levels, from Off through Subtle and Balanced to Expressive
• Mute any theme you never want to see
• Block any site from being read at all — subdomains included
• Force light or dark, or follow your system
• Read and clear the full record of what Aura has seen


A NOTE ON THIS BETA

Chrome does not let any extension recolour its own tab strip, toolbar or omnibox
— there is no API for it, in any extension. Aura themes the surfaces it can
genuinely own: your New Tab page, its own popup and settings, the toolbar badge,
and an optional soft glow at the edges of pages you allow.

Detection is deliberately conservative in 0.9.0 — it would rather show you a
neutral page than a wrong one. If a theme never fires when it should, or fires
when it shouldn't, the feedback link in Settings goes straight to the issue
tracker.

Open source. Read every line before you trust it.
```

---

## Privacy practices tab

**Single purpose**
```
Aura adapts the extension's own New Tab page to the user's current browsing
context, using the title and address of the active tab, evaluated entirely
on the user's device.
```

**Permission justifications**

| Permission | Justification to paste |
| --- | --- |
| `tabs` | Aura reads the title and URL of the user's active tab. This is the only input to the theme-matching engine and there is no alternative API that provides it. Nothing read is transmitted; URLs are reduced to a hostname before anything is stored. |
| `storage` | Stores the user's settings, the currently selected theme, and a capped, user-clearable local record of matches. All storage is local to the device. |
| `activeTab` | Used to draw the optional ambient glow overlay on the tab the user is viewing, only if the user enables that feature. |
| `scripting` | Registers the ambient glow content script at runtime, only after the user enables the feature and grants host access. Registering at runtime is what allows Aura to request no host permissions at install time. |
| Host permissions (`http://*/*`, `https://*/*`) | Declared as **optional** only. Requested at the moment the user switches on the ambient page glow, never at install. Used solely to attach a decorative, non-interactive overlay element. Page content is never read. |

**Remote code:** No. All code is contained in the package; no remote scripts, no `eval`, and the CSP sets `connect-src 'none'`.

**Data usage — declare NONE of the following are collected:**

| Category | Collected? |
| --- | --- |
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |

> Aura reads the active tab's title and URL transiently in memory to choose a
> theme. It is not collected: nothing is transmitted off the device, and what is
> written to local storage is reduced to a hostname plus the matched keywords.

**Certifications:** tick all three — data is not sold, not used for unrelated purposes, and not used to determine creditworthiness.

**Privacy policy URL**
```
https://github.com/deepakjoshi-code/chromeuseractivitytheme/blob/main/PRIVACY.md
```

---

## Assets checklist

| Asset | Required | File |
| --- | --- | --- |
| Icon 128×128 | ✅ | `src/assets/icons/icon128.png` |
| Screenshot 1280×800 (≥1, ≤5) | ✅ | `store/assets/screenshot-*.png` (5 provided) |
| Small promo tile 440×280 | recommended | `store/assets/promo-small.png` |
| Marquee 1400×560 | optional | `store/assets/promo-marquee.png` |

Suggested screenshot order: `tropical` → `celebration` → `coding` → `popup` → `privacy`.

---

## Submission steps

1. `npm run build` → `dist/aura-0.9.0.zip`
2. Chrome Web Store Developer Dashboard → **New item** → upload the zip
3. Fill **Store listing** from the copy above; upload assets from `store/assets/`
4. Fill **Privacy practices** from the table above; paste the privacy policy URL
5. **Distribution:** set visibility to **Unlisted** for the beta, so it installs by
   link without appearing in search while detection quality is still being tuned
6. Submit for review

> Review for a first submission typically takes a few days. The `tabs` permission
> plus a New Tab override is a combination reviewers look at closely — the
> permission justifications above are written to answer that directly.
