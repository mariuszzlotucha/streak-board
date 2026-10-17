---
date: 2026-10-18T00:35:46+02:00
researcher: Claude (Opus 5.5) with Mariusz Złotucha
git_commit: 903b8580b1f5229a0d57e6729316e5674cf76678
branch: s-19/install-promotion/plan
repository: streak-board
topic: "Install promotion (S-19): where the app can promote its own installation, how it can tell platforms and installed mode apart, and what constrains it"
tags: [research, pwa, install, service-worker, ios, reminders, privacy]
status: complete
last_updated: 2026-10-18
last_updated_by: Claude (Opus 5.5)
---

# Research: Install promotion (S-19)

**Date**: 2026-10-18T00:35:46+02:00
**Researcher**: Claude (Opus 5.5) with Mariusz Złotucha
**Git Commit**: 903b8580b1f5229a0d57e6729316e5674cf76678
**Branch**: s-19/install-promotion/plan
**Repository**: streak-board

## Research Question

From `frame.md`: nothing tells users on any device that StreakBoard can be installed, how, or why. For planning:

1. Where can a promotion live, and what existing patterns fit?
2. How does the app detect installed (standalone) mode today?
3. Will Chromium's install API (`beforeinstallprompt`) work with this app's service worker?
4. How can the app tell iOS and in-app browsers apart?
5. Where can a dismissal be remembered, and what does the privacy policy say about on-device storage?
6. Which gates (smoke, kitchen sink, ESLint, tokens) cover a new view element?

## Summary

- **No install surface exists.** On the inspected paths the only install wording is the `unsupported` state of the reminders switch (`src/components/account/RemindersToggle.tsx:15`). No file under `src/` reads `display-mode` or `navigator.standalone` (grep of `src/`, 2026-10-18).
- **Why Chrome stayed silent.** Chrome dropped the fetch-handler requirement only for installing from the ⋮ menu (Chrome 108 on mobile, 112 on desktop). Its automatic install prompt still requires a service worker with a `fetch` handler ([Chrome blog](https://developer.chrome.com/blog/update-install-criteria)). This app's worker has no `fetch` handler, on purpose (`public/sw.js:3`, PRD Non-Goals). That matches the owner's S-17 check, where Android installed only through the menu with no automatic prompt (`context/changes/deployment/deployment-plan.md`, Phase 21, row 2.3).
- **Unresolved: `beforeinstallprompt` without a fetch handler.** The blog says developers still control the prompt through `beforeinstallprompt`, but it does not say whether the event fires for an app that is installable only from the menu. This has to be verified on the owner's Android and desktop Chrome. A plan needs a fallback for when the event does not fire.
- **iOS has no install API.** Add to Home Screen is a manual Share-sheet action. Since iOS 16.4, Home Screen web apps can ask for push, but only in response to a user action, and Safari pages outside a Home Screen app cannot ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). The same release lets Chrome and Edge on iOS add sites to the Home Screen; those icons reopen in the browser that created them (same source).
- **Placement patterns already in the code:**
  - a dismissable client-revealed notice: `UpdateNotice.astro`, fixed at the bottom, `role="status"`, revealed by `src/lib/pwa/register.ts`;
  - fixed toasts: `Toast.astro:17`, `bottom-28`;
  - card-based pages: `DashboardView.astro`, the Settings `RemindersCard.astro`;
  - the public landing sections in `src/components/landing/`.
- **Storage.** The app uses no `localStorage`, `sessionStorage` or IndexedDB (grep of `src/`). The privacy policy says the service worker "stores no pages, data or personal information on the device" (`src/components/privacy/Cookies.astro:28-29`), and the Cookies section lists every cookie (`Cookies.astro:7-21`). Any on-device storage of a dismissal must be added to the policy in the same change, per the CLAUDE.md convention.

## Detailed Findings

### 1. Existing install wording and installed-mode detection

- The only install sentence is `unsupported: "Install StreakBoard on your home screen to get reminders."` (`src/components/account/RemindersToggle.tsx:15`), shown in the Settings Reminders card (`src/components/dashboard/RemindersCard.astro:18-33`).
  - Its state starts `unsupported` only when the server has no VAPID key (`src/components/hooks/usePushReminders.ts:27`).
  - Otherwise the browser check in `src/lib/pwa/push.ts:25` decides; it is undefined without `serviceWorker`, `PushManager` or `Notification`.
  - On iOS Safari outside a Home Screen app, `PushManager` is absent (WebKit blog), so these iPhone users see that sentence, but only if they open Settings.
- Two hints assume the app is already installed:
  - `src/components/dashboard/NoGroupCards.astro:30`: "Using the installed app? Copy the invite link and paste it here."
  - `src/components/dashboard/MembersCard.astro:63`: "Friends with the installed app can paste this link under Join with code."
- Nothing reads display mode: no match for `display-mode`, `standalone` (JS) or `navigator.standalone` in `src/` (grep, 2026-10-18). The manifest declares `"display": "standalone"` and `"start_url": "/dashboard"` (`public/manifest.webmanifest`).

### 2. Service worker, registration and the install prompt

- `public/sw.js:3`: "There is deliberately no `fetch` handler". The listeners are `install`, `activate`, `push` and `notificationclick` (`public/sw.js:7,12,50,62`).
- `src/lib/pwa/register.ts` registers the worker in a production build only (`startServiceWorker`). It reveals the new-version notice on `controllerchange` and reports failures as fixed codes to `POST /api/client-errors` (`CLIENT_ERROR_CODES`, `register.ts:6-16`). A new failure code needs a new entry there and in the server's allow-list.
- Chrome's criteria (external source, Chrome blog): menu install has not required a fetch handler since Chrome 108 (mobile) and 112 (desktop). The automatic prompt still requires one. Adding a `fetch` handler is not neutral here: S-17 left it out on purpose so that nothing is cached or intercepted (PRD Non-Goals; S-17 `plan.md`, "What We're NOT Doing").
- Firefox and Safari have no `beforeinstallprompt` (external, prior knowledge; not verified in this repo).

### 3. Platforms and in-app browsers

- **iOS Safari:** manual Share → "Add to Home Screen". Home Screen web apps can request push after a user gesture (WebKit blog). The app already links `apple-touch-icon` and `apple-mobile-web-app-title` (`src/layouts/Layout.astro:36-38`).
- **iOS third-party browsers (16.4+):** Chrome and Edge can add to the Home Screen, and those icons open in that browser (WebKit blog). Whether push works for such icons is **not established** by the sources read.
- **Installed app on iOS:** it has cookies separate from Safari (S-17 `frame.md`, dimension 2; `ios-check.md`, steps 2–6), so users sign in again after installing. Links (invite, confirmation) open in Safari, not in the app (`ios-check.md`, step 6). The iOS check itself is still open (deployment-plan Phase 21, row 2.6).
- **In-app browsers** (messengers, mail apps): the code never recognises them. Detection would rely on user-agent tokens, which are not standardised; which tokens to match is an open question, not established here.

### 4. Placement candidates and their constraints

- **Layout level** (`src/layouts/Layout.astro:58`): `UpdateNotice` renders on every page. `AppLayout` and `PublicLayout` both wrap `Layout`.
  - A bottom-fixed element would share space with `UpdateNotice` (`bottom-4`) and the toast (`Toast.astro:17`, `bottom-28`).
  - The open frontend-notifications check 1.7 is exactly about the toast covering the update notice at phone width (deployment-plan Phase 22).
- **Dashboard** (`DashboardView.astro`): one fixed toast, then a `space-y-6` stack with an optional `role="status"` owner notice before the cards (`DashboardView.astro:61-85`). A status `Alert` with a dismiss action already exists there (the owner notice), but it is dismissed through a server route and a DB flag.
- **Settings** (`RemindersCard.astro`): the natural place to explain why (reminders), but only reached deliberately.
- **Landing** (`src/components/landing/`): seen before sign-up. `start_url` is `/dashboard`, so installing from the landing page opens the dashboard (sign-in when signed out).

### 5. Gates a new element meets

- ESLint "no literals" applies to `src/components/{dashboard,site,account,...}` and `src/layouts/`: no hex colours, palette classes or arbitrary px/rem (CLAUDE.md, UI). Tokens live in `src/styles/global.css`.
- The kitchen sink `/dev/dashboard-kitchen-sink` renders `DashboardView`, `SettingsView` and `NicknameView` from fixtures (`src/pages/dev/dashboard-kitchen-sink.astro:9-38`). A new visible state is expected to get a fixture and a screenshot (`scripts/ui-screenshots.mjs`).
- `scripts/smoke.mjs` binds markup with regular expressions, for example `role="alert"` only for errors (CLAUDE.md, UI). A server-rendered element changes smoke's view; a client-only reveal (like `UpdateNotice`, `hidden` by default) leaves the HTML stable.
- Privacy: a change to on-device storage updates `src/pages/privacy.astro` components in the same change (CLAUDE.md, Conventions).

## Code References

- `src/components/account/RemindersToggle.tsx:15` - the only install sentence (reminders `unsupported` state)
- `src/components/hooks/usePushReminders.ts:27`, `src/lib/pwa/push.ts:7-32` - how the reminders state is decided
- `public/sw.js:3,7,12,50,62` - worker without a `fetch` handler; its listeners
- `src/lib/pwa/register.ts:6-16` - client error codes; registration is production-only
- `src/components/site/UpdateNotice.astro` - hidden, client-revealed, bottom-fixed `role="status"` notice
- `src/components/site/Toast.astro:17` - toast position `bottom-28`
- `src/layouts/Layout.astro:30-38,58` - manifest and Apple meta tags, `UpdateNotice` on every page
- `src/components/dashboard/DashboardView.astro:61-85` - toast and owner-notice placement
- `src/components/dashboard/NoGroupCards.astro:30`, `src/components/dashboard/MembersCard.astro:63` - hints that assume an installed app
- `src/components/privacy/Cookies.astro:7-29` - cookie list and the "stores no … information on the device" sentence
- `public/manifest.webmanifest` - `display: standalone`, `start_url: /dashboard`

## Architecture Insights

- Client-only UI that depends on the browser follows the `UpdateNotice` pattern: server-rendered hidden markup, revealed by a small script (`register.ts`). An island (`RemindersToggle`, `client:load`) is the pattern when the element has state and buttons.
- Platform facts (push support) are already read in one module (`src/lib/pwa/push.ts`) behind an injectable environment for unit tests (`PwaEnvironment` in `register.ts`). Install detection would fit the same shape.
- Failures in the browser are reported as fixed codes only, never as text (`register.ts`, `src/pages/api/client-errors.ts`).

## Historical Context (from prior changes)

- `context/archive/2026-10-17-installable-pwa/plan.md` ("What We're NOT Doing"): "Our own 'Install app' button and iOS tip: Chrome/Edge show their own install prompt (owner's decision)". The owner reversed this on 2026-10-18 (roadmap S-19, MS-05).
- `context/archive/2026-10-17-installable-pwa/frame.md` (dimension 2): separate cookies in the iOS standalone app, links that open in Safari, no install prompt on iOS.
- `context/archive/2026-10-17-installable-pwa/ios-check.md`: the iPhone scenario. Its result is still pending (deployment-plan Phase 21, row 2.6).
- `context/changes/deployment/deployment-plan.md` Phase 21, rows 2.3–2.4: Android installed through the menu, "Chrome showed no automatic install prompt"; desktop Chrome installed by hand.
- `context/archive/2026-10-17-task-reminders/`: push needs the installed app on iOS, and the reminders switch is per device.

## Related Research

- `context/archive/2026-10-17-installable-pwa/research.md`
- `context/archive/2026-10-17-task-reminders/research.md`

## Open Questions

1. **Does `beforeinstallprompt` fire for this app with no `fetch` handler?** The Chrome blog does not say. Verify on the owner's Android and desktop Chrome before the plan depends on it. If it does not fire, Chromium users get instructions (⋮ → Install app) instead of a button, unless the owner accepts a no-op `fetch` handler, which would reverse the S-17 decision.
2. **Placement and frequency** (product choice): landing, dashboard, Settings or several, and whether a dismissal is permanent per device. A per-device dismissal needs on-device storage, which needs a privacy-policy line.
3. **In-app browsers:** which user-agent tokens to treat as "cannot install here, open in Safari/Chrome", or whether to show generic instructions instead.
4. **Push for Home Screen icons added from Chrome or Edge on iOS** is not established. It matters for the "why install" sentence on iOS (whether to say "add it from Safari").
5. **Status bar overlapping the header** on the friend's iPhone screenshot. `SiteHeader` is not sticky (`src/components/site/SiteHeader.astro:13`) and the viewport has no `viewport-fit=cover` (`Layout.astro:31`). The cause is not established; it is outside this frame's problem.
