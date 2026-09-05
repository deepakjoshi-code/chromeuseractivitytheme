# Privacy Policy — Aura

**Last updated:** 5 September 2026
**Applies to:** Aura — Context-Aware Themes, all versions

## The short version

Aura does not collect, transmit, sell, or share any data. It cannot: the
extension makes no network requests of any kind, and its content security policy
blocks outbound connections at the browser level.

There is no server. There is no account. There is no analytics.

## What Aura reads

To choose a theme, Aura reads two things about the tab you are currently
viewing:

- the page **title**
- the page **address**, from which it extracts the hostname, the path, and — on
  recognised search engines — your search terms

That is the entire input. Aura does **not** read page content, form fields,
passwords, cookies, browsing history, bookmarks, or downloads, and does not
request the permissions that would allow it to.

## What Aura stores, and where

Everything is stored locally in your browser profile, using
`chrome.storage.local` and `chrome.storage.session`. Nothing leaves your device.

| Stored | Contents | Lifetime |
| --- | --- | --- |
| Settings | Expression level, colour scheme, muted themes, blocked sites | Until changed or erased |
| Current theme | The active theme and the words that justified it | Until changed or erased |
| Pin | A theme you pinned, and when it expires | Until cleared or expired |
| Activity log | Up to 50 entries: hostname, matched theme, matched words, timestamp | Until you clear it |
| Context state | Decaying scores for recent topics | Cleared when you restart your browser |

**Full web addresses are never written to storage.** Before anything is stored, a
URL is reduced to its hostname; the query string, fragment, port, and any
credentials are discarded. Page titles are never stored.

## What Aura refuses to react to

Aura will not classify or theme anything that matches a sensitive topic —
including health and medical, finance and banking, legal matters, job hunting,
dating, adult content, personal crisis, religion, and politics.

When Aura sees one of these it scores nothing, stores nothing, logs nothing, and
**leaves your theme exactly as it was**. It does not switch to a neutral theme,
because a browser that visibly changed the moment you opened a private page would
itself be telling anyone near your screen that something private is on it.

This behaviour cannot be turned off.

Aura is also disabled in Incognito windows and cannot be enabled there.

## Permissions

| Permission | Why |
| --- | --- |
| `tabs` | Read the active tab's title and address — the only input to theming |
| `storage` | Save your settings and the current theme, locally |
| `activeTab` | Draw the optional ambient glow on the tab you are viewing |
| `scripting` | Register the ambient glow overlay, only after you enable it |
| Host access | **Optional.** Requested only when you switch on the ambient glow. Never requested at install. Used to attach a decorative overlay; page content is never read. |

Aura does not request access to browsing history, bookmarks, cookies, downloads,
page content, or any other host at install time.

## Third parties

None. Aura contains no third-party libraries, no SDKs, no trackers, and no
remote code. It loads no external scripts, stylesheets, fonts, or images.

## Your control

- **See everything Aura has recorded** — Settings → "What Aura has seen"
- **Clear the log** — one button, same section
- **Erase everything** — Settings → "Erase everything" removes all settings,
  history, pins and rejections
- **Uninstall** — removes the extension and all of its stored data

## Children

Aura collects no data from anyone, including children under 13.

## Changes

Any change to this policy will be published in this file and reflected in the
extension's version history. Because Aura has no server and no accounts, a policy
change can only ever take effect through an extension update you receive from the
Chrome Web Store.

## Contact

Questions or reports: <https://github.com/deepakjoshi-code/chromeuseractivitytheme/issues>
