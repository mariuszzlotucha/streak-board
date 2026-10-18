# Install Promotion (S-19) Implementation Plan

## Overview

StreakBoard promotes its own installation on every platform. It shows an instruction or an install button, together with the reason to install: reminders, which on iPhone work only from the installed app. On the dashboard the promotion can be dismissed for good on that device. In the Settings Reminders card it is always available. The installed app shows neither.

Frame: `context/changes/install-promotion/frame.md`. Rejected assumption from S-17: "the browser will suggest installing by itself". Research: `context/changes/install-promotion/research.md`.

## Current State Analysis

- **The only install wording** is the `unsupported` state of the reminders switch, `src/components/account/RemindersToggle.tsx:15`. It is reached only in Settings.
- **No installed-mode detection:** no file under `src/` reads `display-mode` or `navigator.standalone` (research, §1).
- **Chrome's automatic prompt needs a `fetch` handler,** and `public/sw.js:3` has none on purpose (S-17, PRD Non-Goals). Menu install works (deployment-plan Phase 21, row 2.3).
  - Whether `beforeinstallprompt` fires without a fetch handler is not established (research, Open Question 1).
- **iOS has no install API.** Push works only in the Home Screen app (WebKit blog, research §3). Installed and Safari cookies are separate, so a user signs in again after installing (S-17 `ios-check.md`).
- **Reusable patterns:**
  - browser-capability modules with an injectable environment and unit tests: `src/lib/pwa/push.ts`, `src/lib/pwa/register.ts`;
  - an island with a kitchen-sink-pinned state: `RemindersToggle` (`fixedState`);
  - the layout script that already starts the worker: `src/layouts/Layout.astro:58-61` → `startServiceWorker`.
- **Constraints:**
  - bottom-fixed `UpdateNotice` (`bottom-4`) and toast (`Toast.astro:17`, `bottom-28`);
  - no `localStorage` anywhere today, and the privacy policy says nothing is stored on the device (`src/components/privacy/Cookies.astro:28-29`);
  - ESLint "no literals" in `src/components/{dashboard,account,site,...}`;
  - smoke binds the dashboard and Settings HTML (CLAUDE.md, UI).

## Desired End State

- **Dashboard, in a browser:** a signed-in user (in a group or not) sees a card "Install StreakBoard" with the steps for their platform and the reason. "Not now" hides it for good on that device. It does not show in the installed app, nor on a platform with no known install path.
- **Settings:** the Reminders card shows the same instruction, without a dismiss, whenever the app runs in a browser. This replaces the bare "Install StreakBoard on your home screen to get reminders." sentence as the only hint.
- **Chrome and Edge:** with a captured `beforeinstallprompt`, an "Install app" button opens the system dialog. Without it, the user gets "menu ⋮ → Install app".
- **Messenger in-app browser:** "Open this page in Safari / Chrome to install StreakBoard."
- **Server HTML of `/dashboard` and `/settings`:** unchanged apart from the empty island wrapper. Smoke passes untouched.

Verify with unit tests on the classifier, the kitchen-sink states and screenshots, an e2e spec with an iPhone user agent, and the owner's devices (Phase 3).

### Key Discoveries:

- Chrome's criteria: the menu install needs no fetch handler; the automatic prompt does. Source: [Chrome blog](https://developer.chrome.com/blog/update-install-criteria) (research §2).
- Since iOS 16.4, Chrome and Edge on iOS can add to the Home Screen, but those icons open in that browser, and push there is not established (research §3, Open Question 4). The instruction for those browsers therefore says "for reminders, add it from Safari".
- `start_url` is `/dashboard` (`public/manifest.webmanifest`). Installing from the dashboard opens the dashboard; on iOS that means a fresh sign-in.

## What We're NOT Doing

- **No `fetch` handler in `public/sw.js`.** No caching, no interception. The S-17 decision stands (owner, 2026-10-18: button when the event fires, instruction otherwise).
- **No promotion on the public landing page** (owner's choice: dashboard + Settings).
- **No re-show after a dismissal** (owner's choice: dismissed for good on that device; clearing the site data brings it back).
- **No promotion on platforms without a known install path,** for example Firefox on desktop. The dashboard shows no card there, and Settings shows a short generic sentence.
- **No fix for the iOS status bar overlapping the header** (research, Open Question 5). The cause is not established and it is outside this frame.
- **No change to the S-17 decision on caching or offline,** and no server or database change.

## Implementation Approach

Pure detection in a module with an injectable environment, unit-tested without a browser (pattern of `push.ts`). One React island renders the outcome in two variants: a dashboard card and a Settings inline block. It renders nothing on the server, so the HTML stays stable. The kitchen sink pins the variant with a prop, the way `RemindersToggle` uses `fixedState`.

`beforeinstallprompt` is captured by the layout script on every page and kept in the module, because the event can arrive before the island hydrates.

## Critical Implementation Details

- **Timing & lifecycle:** register the `beforeinstallprompt` listener from the layout script (next to `startServiceWorker`), not only from the island. Call `preventDefault()` and keep the event, so a later click can call `prompt()` once. Clear it after `userChoice` or on `appinstalled`, and hide the card on `appinstalled`.
- **Classification order:** installed mode → in-app browser → iOS (Safari vs other) → captured prompt → Chromium (menu) → macOS Safari → none. iPadOS reports "Macintosh"; treat Macintosh with `maxTouchPoints > 1` as iOS. In-app detection comes before iOS, because a messenger on iPhone also matches the iOS tokens.
- **Storage access:** `localStorage` can throw (private mode, blocked site data). Every read and write is wrapped. On failure the card still shows and the dismiss works for the current page only.

## Phase 1: Install detection

### Overview

A pure module that tells the island what to offer, with unit tests. It also captures `beforeinstallprompt` and remembers "Not now".

### Changes Required:

#### 1. Detection module

**File**: `src/lib/pwa/install.ts` (new)

**Intent**: Decide, from the browser environment, which install offer applies, and own the captured install prompt and the dismissal flag. Same shape as `push.ts`: an injectable environment, no DOM access at import time.

**Contract**:

- `type InstallOffer = "installed" | "in-app" | "ios-safari" | "ios-other" | "prompt" | "chromium-menu" | "macos-safari" | "none"`.
- `classifyInstall(env: InstallEnvironment): InstallOffer`, using the order in Critical Implementation Details.
- `InstallEnvironment = { userAgent: string; maxTouchPoints: number; standalone: boolean; hasPrompt: boolean }`. `standalone` is `matchMedia('(display-mode: standalone)')` (also `fullscreen` and `minimal-ui`) or `navigator.standalone === true`.
- `IN_APP_BROWSER_PATTERNS`: an exported list of user-agent tokens (for example Facebook/Messenger `FBAN`/`FBAV`/`FB_IAB`, Instagram, LINE, WeChat `MicroMessenger`, LinkedIn, Snapchat, TikTok/ByteDance, the iOS Google app `GSA/`, Android WebView `; wv)`), each with a one-line source comment.
- iOS non-Safari tokens: `CriOS`, `EdgiOS`, `FxiOS`.
- `listenForInstallPrompt(target)`: registers `beforeinstallprompt` (with `preventDefault`) and `appinstalled`, and keeps the event in module state. `getInstallPrompt()` and `promptInstall()` resolve to `"accepted" | "dismissed" | "unavailable"`.
- `isInstallDismissed(storage)` and `dismissInstall(storage)` under the single key `streakboard.install-dismissed`, wrapped in try/catch.
- A local `BeforeInstallPromptEvent` interface, because `lib.dom` has none.

#### 2. Layout wiring

**File**: `src/layouts/Layout.astro` (script block), `src/lib/pwa/register.ts` or a sibling entry

**Intent**: Start listening for `beforeinstallprompt` on every page as early as the worker start, in production and in dev, so the island can find the captured event.

**Contract**: the existing `<script>` imports and calls `listenForInstallPrompt(window)` next to `startServiceWorker()`. No new client error code is needed: a failed `prompt()` resolves to `"unavailable"` and the island falls back to the menu instruction.

#### 3. Unit tests

**File**: `tests/unit/install.test.ts` (new)

**Intent**: Pin the classification and the storage behaviour.

**Contract**:

- One case per offer, with real user-agent strings: iPhone Safari, iPadOS Safari as Macintosh with touch points, iPhone Chrome `CriOS`, Messenger on iPhone, Instagram on Android, Android WebView, Android Chrome with and without a captured prompt, desktop Chrome, desktop Edge, macOS Safari, desktop Firefox → `none`, and standalone → `installed` whatever the user agent.
- `promptInstall` without an event → `"unavailable"`; with a fake event → its `userChoice` outcome, and the event is cleared afterwards.
- Dismissal round-trip, and a throwing storage that neither throws nor reports dismissed.

### Success Criteria:

#### Automated Verification:

- Unit tests for the install module pass: `npm run test:unit`
- Lint and type checks pass: `npm run lint` and `npx tsc --noEmit`

#### Manual Verification:

- The user-agent list in `IN_APP_BROWSER_PATTERNS` reviewed by the owner against the messengers the group uses

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Promotion in the app

### Overview

The island, the dashboard card, the Settings block, the kitchen-sink states, the privacy line, docs and an e2e spec.

### Changes Required:

#### 1. Island and hook

**File**: `src/components/account/InstallPrompt.tsx` (new), `src/components/hooks/useInstallOffer.ts` (new)

**Intent**: Render the offer for the current browser, in two variants:

- `card`: dashboard, with "Not now";
- `inline`: Settings, no dismiss.

Render nothing until the effect has classified, and nothing for `installed`, or for `none` in the card variant.

**Contract**:

- Props: `{ variant: "card" | "inline"; fixedOffer?: InstallOffer }`. `fixedOffer` is set by the kitchen sink only and skips detection and storage.
- Card: `CardTitle as="h2"` "Install StreakBoard", a one-line reason for the offer, then its steps.
- Reason per offer:
  - `ios-safari`, `ios-other`, `in-app` on iOS: "Reminders on iPhone work only from the installed app."
  - every other offer: "Open it from your home screen or dock like an app."

  On Android and desktop Chromium push works without installing, so the iOS reason is not used there (plan review F2).

- Steps per offer:
  - `ios-safari`: "Tap Share, then Add to Home Screen. Open StreakBoard from the icon, sign in again, and turn on reminders in Settings."
  - `ios-other`: same steps, plus "For reminders, add it from Safari."
  - `prompt`: an "Install app" button calling `promptInstall()`, hiding on `"accepted"`.
  - `chromium-menu`: "Open the browser menu ⋮ and choose Install app".
  - `macos-safari`: "File → Add to Dock".
  - `in-app`: "Open this page in Safari or Chrome to install StreakBoard."
  - `none`, inline variant only: "Your browser can't install StreakBoard; try Chrome, Edge or Safari."
- Buttons hold only their text. The card is a status, never `role="alert"`. Only tokens, no literals.
- English copy, consistent with the rest of the UI.

#### 2. Dashboard placement

**File**: `src/components/dashboard/DashboardView.astro`

**Intent**: Show the card right after the page heading in both the in-group and no-group states, so a new member from an invite and a daily user both see it.

**Contract**: `<InstallPrompt client:load variant="card" fixedOffer={...} />`, with a new optional `DashboardView` prop for the kitchen sink. The card lives in the normal page flow, not fixed, so it never overlaps `UpdateNotice` or the toast.

#### 3. Settings placement

**File**: `src/components/dashboard/SettingsView.astro`, `src/components/dashboard/RemindersCard.astro`, `src/components/account/RemindersToggle.tsx`

**Intent**: The Reminders card always explains how to install when in a browser, and the kitchen sink can pin that block through the Settings view, the way it pins the reminders state.

**Contract**:

- `RemindersCard` renders `<InstallPrompt client:load variant="inline" fixedOffer={installOffer} />` below the toggle, with a new optional `installOffer?: InstallOffer` prop.
- `SettingsView` gets an optional `installOffer?: InstallOffer` prop and passes it to `RemindersCard`, mirroring `remindersState` → `fixedState` (`SettingsView.astro:30-35,85-88`; plan review F1).
- The `unsupported` text becomes "Install StreakBoard to get reminders on this device." It carries no pointer, because the inline block renders nothing in the installed app (plan review F2).

#### 4. Kitchen sink

**File**: `src/components/dev/dashboard-fixtures.ts`, `src/pages/dev/dashboard-kitchen-sink.astro`

**Intent**: Every offer has a screenshot-able state.

**Contract**:

- Dashboard states `install-ios`, `install-prompt`, `install-menu`, `install-in-app`.
- Settings states `settings-install-ios`, `settings-install-none`.
- Each state is rendered through the real view with `fixedOffer`; `scripts/ui-screenshots.mjs` picks them up.

#### 5. Privacy policy

**File**: `src/components/privacy/Cookies.astro`

**Intent**: State the one on-device item this change adds, in the same change (CLAUDE.md convention).

**Contract**: one sentence after the cookie list: if you choose "Not now" on the install suggestion, the browser keeps a note of it on this device (local storage, `streakboard.install-dismissed`); clearing the site's data removes it. The service-worker paragraph stays true.

#### 6. Docs

**File**: `README.md`, `CLAUDE.md`

**Intent**: Describe the install promotion where the PWA and the dashboard and Settings views are described.

**Contract**: one sentence each:

- CLAUDE.md: the "Installable app" bullet and the dashboard and settings bullets name `InstallPrompt` and `src/lib/pwa/install.ts`.
- README: the PWA section names the offers and the dismissal key.

#### 7. E2E

**File**: `tests/e2e/install-promotion.spec.ts` (new)

**Intent**: Guard the user-visible outcome in a real browser: an iPhone visitor sees the instruction on the dashboard, and "Not now" survives a reload; Settings still shows it.

**Contract**:

- `test.use({ userAgent: <iPhone Safari UA> })`.
- A persona with a group signs in through the form.
- `/dashboard` shows heading "Install StreakBoard" with "Add to Home Screen".
- Clicking "Not now" and reloading leaves no such heading.
- `/settings` shows the inline instruction.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Full test suite passes: `npm test`
- Lint, types and Astro check pass: `npm run lint`, `npx tsc --noEmit`, `npx astro check`
- Token contrast check passes: `node scripts/token-contrast.mjs`
- Smoke passes against a production build: `npm run smoke`
- The install-promotion e2e spec passes: `npx playwright test tests/e2e/install-promotion.spec.ts`

#### Manual Verification:

- Kitchen-sink screenshots of every install state reviewed in light and dark mode, at phone width
- The card and the inline block read well at 412 px width and do not collide with the toast or the update notice

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Release and device checks

### Overview

Ship, then confirm on real devices what the code cannot know: whether Chromium fires the event without a fetch handler, and the full iPhone path.

### Changes Required:

#### 1. iPhone scenario

**File**: `context/changes/install-promotion/ios-check.md` (new, from S-17's `ios-check.md`)

**Intent**: A short scenario for the group member with an iPhone.

**Contract**:

- Open `streakboard.app` in Safari, see the card, and follow it.
- Sign in from the icon, turn on reminders, and receive the 20:00 reminder.
- Also check that the card does not show in the installed app.

#### 2. Deployment record

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the release and the device results, in the convention of Phases 21–23.

**Contract**: a new phase entry with the run, Cloudflare version, tag, live checks and the device rows.

### Success Criteria:

#### Automated Verification:

- The release run is green and the live checks pass in the `release` job

#### Manual Verification:

- Android Chrome (owner): the dashboard shows either the "Install app" button or the menu instruction; the owner reports which (resolves research Open Question 1)
- Desktop Chrome (owner): same check; installing opens the app window with no card. Then open `streakboard.app` in a normal tab: Chrome sends no `beforeinstallprompt` once installed, so the card still offers installing there until "Not now" (impl review F7); decide whether that needs a follow-up (`getInstalledRelatedApps`)
- iPhone (group member): the card shows in Safari, installation from it works, the installed app shows no card, and reminders turn on there
- A messenger's in-app browser on a phone shows the "Open this page in Safari" text on an iPhone, "Safari or Chrome" elsewhere (PR #191 ai-review)

---

## Testing Strategy

### Unit Tests:

- Classification, one case per offer, with real user-agent strings including the iPadOS-as-Mac and the in-app-before-iOS cases.
- Prompt capture and single use, plus the `appinstalled` reset.
- Storage that throws.

### Integration Tests:

- None needed: no server code changes.

### Manual Testing Steps:

1. Kitchen sink: open each `install-*` and `settings-install-*` state in light and dark mode at 412 px.
2. Android and desktop Chrome on production: note button vs menu instruction, then install and confirm no card in the app.
3. iPhone: follow `ios-check.md`.

## Performance Considerations

One small island per page on the dashboard and Settings, hydrated with `client:load` like `RemindersToggle`. No network requests.

## Migration Notes

None: no schema, no server state. A device that dismissed the card keeps the flag until its site data is cleared.

## References

- Frame: `context/changes/install-promotion/frame.md`
- Research: `context/changes/install-promotion/research.md`
- Patterns: `src/lib/pwa/push.ts`, `src/lib/pwa/register.ts`, `src/components/account/RemindersToggle.tsx`, `src/components/site/UpdateNotice.astro`
- Prior decisions: `context/archive/2026-10-17-installable-pwa/plan.md` ("What We're NOT Doing"), `context/archive/2026-10-17-installable-pwa/ios-check.md`
- Roadmap: `context/foundation/roadmap.md` S-19, MS-05

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Install detection

#### Automated

- [x] 1.1 Unit tests for the install module pass — 69c4470
- [x] 1.2 Lint and type checks pass — 69c4470

#### Manual

- [ ] 1.3 The user-agent list in `IN_APP_BROWSER_PATTERNS` reviewed by the owner against the messengers the group uses

### Phase 2: Promotion in the app

#### Automated

- [x] 2.1 Unit tests pass — 5c3da33
- [x] 2.2 Full test suite passes — 5c3da33
- [x] 2.3 Lint, types and Astro check pass — 5c3da33
- [x] 2.4 Token contrast check passes — 5c3da33
- [x] 2.5 Smoke passes against a production build — 5c3da33
- [x] 2.6 The install-promotion e2e spec passes — 5c3da33

#### Manual

- [ ] 2.7 Kitchen-sink screenshots of every install state reviewed in light and dark mode, at phone width
- [ ] 2.8 The card and the inline block read well at 412 px width and do not collide with the toast or the update notice

### Phase 3: Release and device checks

#### Automated

- [x] 3.1 The release run is green and the live checks pass in the `release` job — b25d161

#### Manual

- [ ] 3.2 Android Chrome (owner): the dashboard shows either the "Install app" button or the menu instruction; the owner reports which
- [ ] 3.3 Desktop Chrome (owner): same check; installing opens the app window with no card
- [ ] 3.4 iPhone (group member): the card shows in Safari, installation from it works, the installed app shows no card, and reminders turn on there
- [ ] 3.5 A messenger's in-app browser on a phone shows the "Open this page in Safari" text on an iPhone, "Safari or Chrome" elsewhere (PR #191 ai-review)
