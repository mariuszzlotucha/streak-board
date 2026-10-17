<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Install Promotion (S-19)

- **Plan**: `context/changes/install-promotion/plan.md`
- **Scope**: Full plan (completed phases only; Phase 3 waits for the release)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria were re-run on 5c3da33 on 2026-10-18:

- `npm run test:unit`: 687/687 passed.
- `npm test`: 1159/1159 passed.
- `npm run lint`, `npx tsc --noEmit`, `npx astro check` (0 errors) and `node scripts/token-contrast.mjs` all pass.
- `npm run smoke` against the production preview: all steps passed.
- `npx playwright test tests/e2e/install-promotion.spec.ts`: 3 passed.

Manual rows 1.3, 2.7 and 2.8 are pending and none is ticked.

The "What We're NOT Doing" boundaries hold:

- no `fetch` handler;
- no landing-page promotion;
- no re-show after "Not now";
- no card for `none` on the dashboard;
- no server or DB change.

Without `fixedOffer` the island renders `""` on the server. The layout script and the island share one `install.*.js` chunk in `dist/client/_astro/`.

## Findings

### F1 — iOS in-app WebViews without a listed token get the Safari steps

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/pwa/install.ts:99-101
- **Detail**: Some messenger and mail apps open links in a WKWebView whose user agent has no listed token and no `Safari/` token, for example `…(KHTML, like Gecko) Mobile/15E148`. Those are classified `ios-safari`, so the user is told "Tap Share, then Add to Home Screen", but those views have no Add to Home Screen. Invite links travel through messengers, which is the friend's case in the frame.
  - Normal iOS browsers are not affected: Safari, CriOS, EdgiOS and FxiOS all carry `Safari/`.
  - The installed app is caught earlier by `standalone`.
  - SFSafariViewController sends the full Safari user agent and cannot be detected.
- **Fix**: In the iOS branch of `classifyInstall`, return `in-app` when the user agent lacks `Safari/`, and add a unit case with a WKWebView user agent.
  - Strength: It closes the gap for unknown iOS in-app browsers without listing every app, and it fails towards "open in Safari", which is always true there.
  - Tradeoff: An unusual iOS browser that omits `Safari/` would also be told to open Safari, which is still correct advice.
  - Confidence: MED — WebKit's own browsers and the three iOS browsers in scope all send `Safari/`; this was not checked on real devices.
  - Blind spot: There is no list of real WKWebView user agents from the group's apps; the owner's in-app check (3.5) covers that.
- **Decision**: FIXED — an iOS user agent without `Safari/` is `in-app` (`src/lib/pwa/install.ts`), with a WKWebView unit case; break-check red

### F2 — Settings `none` block contradicts itself and overclaims

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/account/InstallPrompt.tsx:28-30,41-42
- **Detail**: For `none`, the inline block shows the heading, then the reason "Open it from your home screen or dock like an app.", then "Your browser can't install StreakBoard; try Chrome, Edge or Safari."
  - The plan asks for "a short generic sentence", and the reason line contradicts the step under it.
  - The sentence is also false for browsers that land on `none` but can install from their own menu: Firefox on Android, and Samsung Internet, Opera or Yandex without a captured event.
- **Fix**: For `none`, render no reason line and use hedged copy: "We have no install steps for this browser; look for Install or Add to Home screen in its menu, or use Chrome, Edge or Safari."
- **Decision**: FIXED — `none` has no reason line and the hedged copy (`src/components/account/InstallPrompt.tsx`)

### F3 — The reload assertion in the e2e spec depends on hydration timing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/install-promotion.spec.ts:53-56
- **Detail**: After `page.reload()`, `waitForHydration` waits only until `astro-island[ssr]` is gone. The island renders `null` on the server and shows the card one client render later. A `toHaveCount(0)` that polls before that render would pass even if "Not now" were not stored. The implementation break-check (dismissal not stored) did turn the spec red on both projects, so today the card commits before the first poll, but nothing guarantees that.
- **Fix**: Assert `localStorage.getItem("streakboard.install-dismissed")` is set after the click and still set after the reload, keeping the existing heading checks; the read side (`isInstallDismissed`) stays covered by the unit tests.
- **Decision**: FIXED — the spec asserts the stored flag after the click and after the reload; with storage broken it now fails at once on the flag

### F4 — Capturing the event on every page suppresses Chromium's own install UI on public pages (undocumented)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/layouts/Layout.astro:60-63, src/lib/pwa/install.ts:138-141
- **Detail**: `listenForInstallPrompt` calls `preventDefault()` on `beforeinstallprompt` on every page that uses `Layout`, including the landing page, `/privacy` and the auth pages, where no island offers the dialog instead.
  - The plan asks for exactly this ("on every page").
  - Chrome's automatic prompt needs a `fetch` handler, which `sw.js` does not have (research §2), so in practice little is lost.
  - Separately, the CLAUDE.md "Installable app" bullet says `listenForInstallPrompt` "classifies the install offer"; it is `classifyInstall` that classifies.
- **Fix A ⭐ Recommended**: Document the trade-off in README (PWA section) and fix the CLAUDE.md wording
  - Strength: Keeps the plan's "capture as early as possible on every page"; the lost UI is mostly the mini-infobar that research says does not appear without a `fetch` handler.
  - Tradeoff: Public pages stay without any Chromium install hint.
  - Confidence: HIGH — matches the plan and the S-17 record (no automatic prompt seen).
  - Blind spot: Whether Chrome would show a mini-infobar here at all is research Open Question 1; Phase 3 (3.2) answers it.
- **Fix B**: Call `preventDefault` only on pages that render the island (a marker on `<body>`)
  - Strength: Leaves the browser's own UI on public pages.
  - Tradeoff: The captured event on a public page is lost on navigation anyway, so the gain is only the infobar; it adds a page-to-script contract.
  - Confidence: MED — depends on Open Question 1.
  - Blind spot: Event timing when navigating from a public page to the dashboard.
- **Decision**: FIXED via Fix A — README (PWA) states the mini-infobar trade-off; the CLAUDE.md bullet names `classifyInstall` as the classifier

### F5 — Install steps that are not exact on every platform

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/account/InstallPrompt.tsx:16,27-28
- **Detail**:
  - "Open the browser menu ⋮ and choose Install app." fits Android Chrome. On desktop Edge the menu is "…" → Apps → "Install this site as an app", and on desktop Chrome it is under "Cast, save, and share".
  - "In Safari, choose File → Add to Dock." needs macOS Sonoma, and Safari 17 also runs on Ventura and Monterey (the user agent cannot tell them apart).
  - The iOS reason says "on iPhone" but is also shown on iPad.
  - These are mostly the plan's own copy.
- **Fix**: Make the menu step generic ("Open the browser menu and choose Install StreakBoard or Install app."), add "(macOS Sonoma or later)", and say "on iPhone and iPad".
- **Decision**: FIXED — generic menu step, "(macOS Sonoma or later)", and "on iPhone and iPad" (e2e text updated)

### F6 — After a dismissed dialog, non-Chrome Chromium browsers drop to `none`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pwa/install.ts:186-190, src/components/hooks/useInstallOffer.ts:39-46
- **Detail**: After `promptInstall` the event is cleared and the offer is classified again.
  - In Chrome and Edge it becomes `chromium-menu`, which is fine.
  - In Samsung Internet or Opera it becomes `none`: the dashboard card disappears and Settings shows the `none` line right after the browser showed its own dialog.
  - The `promptFailed` → menu fallback in the hook only takes effect while the detected offer stays `prompt`, which in practice happens on the kitchen sink.
- **Fix**: Keep a module flag "a prompt was seen on this page" and classify such browsers as `chromium-menu` (or a generic menu offer) after it is used; add a unit case.
- **Decision**: FIXED — `promptSeen` module flag in `install.ts` keeps `chromium-menu` after a browser's event is used, with two unit cases; break-check red

### F7 — Already-installed users opening the app in a browser tab see the card

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pwa/install.ts:102-103
- **Detail**: On desktop and Android, Chrome does not fire `beforeinstallprompt` once the app is installed. A user who opens a link in a tab therefore gets `chromium-menu` and is told to install an app they have, until "Not now". Detecting this needs `navigator.getInstalledRelatedApps()` and a `related_applications` manifest entry, which is outside this plan.
- **Fix**: Note it in the Phase 3 manual check 3.3 (open the site in a tab after installing) and decide there whether it needs a follow-up.
- **Decision**: FIXED — the Phase 3 desktop manual check now includes opening the site in a tab after installing (Progress title unchanged)

### F8 — Small unplanned details

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/dashboard/DashboardView.astro:96,146-160, src/components/dashboard/RemindersCard.astro:31, src/components/hooks/useInstallOffer.ts:35
- **Detail**:
  - Server HTML gained a plain `flex flex-col gap-6` wrapper around `PageHeading` and a `flex flex-col gap-4` class on the Reminders `CardContent`. Neither changes the visual result, and smoke passes.
  - The pending-invite branch ("Join X?") shows no card; the user sees it after joining.
  - With `fixedOffer`, the in-app reason still reads the real user agent, so the kitchen sink's `install-in-app` reason depends on the viewing browser (generic in headless Chromium).
  - `InstallPrompt` uses `disabled` where `RemindersToggle` uses `aria-disabled` to keep focus.
- **Fix**: No code change; list these in the PR description as deviations.
- **Decision**: FIXED — listed as deviations in the PR description
