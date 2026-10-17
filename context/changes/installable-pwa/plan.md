# Installable PWA (S-17) Implementation Plan

## Overview

Make StreakBoard installable as an app on Android and desktop (Chrome/Edge), and ready to add to the home screen on iOS. This needs a manifest, icons from the brand source and a minimal service worker that **caches nothing** and updates immediately. Errors during service worker registration and updates go to Sentry through the existing `reportError`. The user sees a quiet "new version" message. In the same change: a 404 page, a hint about invites in the installed app, a line in the privacy policy and an update to the docs. The slice ends with a production release and device checks.

The problem to solve (from `frame.md`): the installed app must get through the whole daily loop — installation, sign-in (e-mail and Google), joining from an invite link, check-off — on iOS and Android, and its service worker must be the base on which S-16 adds push.

## Current State Analysis

- There is one `<head>` for all Astro pages: `src/layouts/Layout.astro:18-25` (favicon :21-22, viewport :20). The 503 page `UNAVAILABLE_PAGE` (`src/lib/auth-state.ts:43-55`) has its own head and stays as it is.
- `public/` holds only `favicon.svg` (flame on `#007a55`, the brand source, also the logo in `SiteHeader.astro:17`) and `favicon.png` 48×48. There is no manifest, service worker, theme-color or apple-touch-icon.
- The `--primary` token (light) `oklch(0.508 0.118 165.612)` (`src/styles/global.css:24`) converts to exactly `#007a55` (checked 2026-10-17).
- After the build, `public/` lands in `dist/client/`. Deploy and preview use the generated `dist/server/wrangler.json` (`assets.directory: "../client"`, via `.wrangler/deploy/config.json`), not the root `wrangler.jsonc` `./dist` (plan review F4). The adapter already generates `dist/client/_headers` with a `/_astro/*` cache rule and appends it to a user `public/_headers` (`node_modules/@astrojs/cloudflare/dist/index.js:475-499`). There is no CSP. Whether middleware runs for a static file is **not checked** (owner: "I don't know").
- There is no 404 page. A request that matches no file and no route is rendered by the Worker through Astro's 404 route (`@astrojs/cloudflare/dist/utils/handler.js:62-84`, `astro/dist/core/app/base.js:305`), so `src/pages/404.astro` works as SSR without prerendering.
- Sentry runs only on the server (`@sentry/cloudflare`, `src/lib/sentry.ts`); `reportError(event, error, context)` is in `src/lib/log.ts:88`. There is no browser SDK.
- Both sign-ins (Google `src/pages/api/auth/google.ts:17-30`, e-mail `src/pages/auth/callback.ts:8-34`) use PKCE with the verifier in a cookie, and `join_code` lives in the cookie store where `/join/<code>` was opened (`src/lib/join-code.ts:14-20`). This is the iOS risk; it cannot be fixed in code, only softened.
- "Join with code" (`src/components/groups/JoinGroupForm.tsx`) accepts a code **or a pasted link** (`normalizeJoinCode`); the "Have an invite?" card is in `src/components/dashboard/NoGroupCards.astro:29`, and the link is copied in `src/components/groups/CopyInviteLink.tsx` (`MembersCard.astro:61`).
- Smoke is a list of HTTP steps (favicon step `scripts/smoke.mjs:734`). Playwright runs on a production build + preview (workerd) on `localhost`, chromium + mobile-chromium (`playwright.config.ts`).
- The privacy policy `src/components/privacy/Cookies.astro` lists four cookies and says nothing about browser storage or service workers.

### Hypotheses from the frame (summary)

| Dimension                            | Verdict                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| Installability (manifest, icons, SW) | STRONG — necessary but not sufficient                   |
| Sign-in and links in standalone mode | MEDIUM — paths confirmed in code, iOS effect unverified |
| SW as the shared base with S-16      | MEDIUM — the owner wants both access and push           |
| Cache and updates                    | WEAK — no cache, so the risk comes down to updates      |

## Desired End State

- On Android Chrome and desktop Chrome/Edge the browser offers to install StreakBoard. The installed app opens on `/dashboard` (an anonymous user goes to sign-in) in its own window, with the flame icon and the `#007a55` colour.
- On iOS, "Add to Home Screen" uses the 180×180 icon and opens the app in standalone mode. Whether sign-in works there is checked after the release by a group member with an iPhone.
- `/sw.js` is registered on every page, has no `fetch` handler and no cache, and after a release takes over right away (`skipWaiting` + `clients.claim`). An open page then shows a `role="status"` message "A new version of StreakBoard is available." with a "Refresh" button.
- A registration or update error reaches Sentry as `client.sw.<code>` through `POST /api/client-errors`.
- An unknown address shows the StreakBoard 404 page.
- The privacy policy says what the service worker does and what it does not store. Next to the invite link and the join form there is a hint for users of the installed app.

### Key Discoveries:

- One head: `src/layouts/Layout.astro:18-25`.
- Theme colour = `--primary` light = `#007a55` (`src/styles/global.css:24`).
- Reporting: `reportError` / `requestFields` in `src/lib/log.ts:88,120`; the lesson "Every returned Supabase `{ error }`…" requires reports without e-mail, cookie, body or code.
- The join form already takes a link: `src/components/groups/JoinGroupForm.tsx` (`normalizeJoinCode`).
- Smoke must assert the outcome, not the absence of errors (lesson "Smoke steps must assert outcomes").

## What We're NOT Doing

- **Offline mode** and any page or data cache (PRD §Non-Goals; owner: "Whatever happens" without a network). There is no offline screen.
- **Push notifications**: S-16 adds them; S-17 only provides a service worker that can be extended.
- **Our own "Install app" button and iOS tip**: Chrome/Edge show their own install prompt (owner's decision).
- **A browser Sentry SDK** (`@sentry/browser`); errors go through the server endpoint.
- **A fix for PKCE sign-in across two cookie stores on iOS**: the hint and the post-release check cover it; it stays an open risk.
- **A rate limit on `/api/client-errors`** beyond the code enum, origin check and size limit.
- **Changes to the 503 page** `UNAVAILABLE_PAGE`.
- **Generating icons in the build**: icons are generated by a script run by hand and committed.

## Implementation Approach

Everything lives in two places: static files in `public/` (manifest, icons, `sw.js`) and one head in `Layout.astro`, which links them and loads a small registration module. The service worker is deliberately empty (install/activate only), so an update cannot show stale content and takes over immediately. The message and error reporting live on the page side, in the registration module, so the service worker itself stays minimal for S-16. Phase 1 starts with a check of the static-file headers. Its result decides whether `public/_headers` (Cloudflare assets) is enough for `Cache-Control: no-cache` on `sw.js` and the manifest MIME type.

## Critical Implementation Details

- **Ordering — check before relying on it.** First build and run preview, then `curl -I` on `/favicon.svg`, `/sw.js` and `/manifest.webmanifest`: does middleware run (e.g. a missing `Set-Cookie` or log line), what are `Content-Type` and `Cache-Control`, and does `public/_headers` take effect on the Cloudflare assets path in preview. If `_headers` does not work in preview, write that down and check it on production in phase 2. Record the result in the Phase 1 section of the plan as a note.

  **Check result (2026-10-17):** `npm run build` + `npm run preview -- --port 4399` (workerd), `curl -sI`. Middleware does **not** run for static files: `/favicon.svg` answers `200`, `image/svg+xml`, `cf-cache-status: HIT`, no `Set-Cookie`. Before `public/_headers`: `/favicon.svg` had `cache-control: public, max-age=0, must-revalidate`; `/sw.js` and `/manifest.webmanifest` did not exist yet (`404`, `text/html`, from the Worker). After adding `public/_headers` (the adapter puts its `/_astro/*` rule in the same `dist/client/_headers`), `_headers` **takes effect in preview**: `/sw.js` → `200`, `text/javascript; charset=utf-8`, `cache-control: no-cache`; `/manifest.webmanifest` → `200`, `application/manifest+json`, `cache-control: no-cache`; `/favicon.svg` → `200` with no `cache-control` line any more (the default `max-age=0, must-revalidate` is not sent once `_headers` exists). Production headers are still checked in phase 2.

- **Installability without a fetch handler.** Current Chromium does not require a `fetch` handler to install; verify this with the Lighthouse/DevTools "Installability" panel in a manual check. If Chrome refuses, a no-op `fetch` handler that calls no `respondWith` is acceptable — still with no cache.
- **Update and reload.** The "Refresh" button reloads the page only after the user clicks it; never automatically, so a form being filled in is not lost. The message appears only when there **was** a controlling service worker before (`navigator.serviceWorker.controller` set before `controllerchange`); a first install is not an update.

## Phase 1: Installable app

### Overview

Every change in code and docs: icons, manifest, head, 404, headers, service worker, registration, message, error endpoint, invite hint, privacy policy, docs, smoke and e2e. One run, one PR.

### Changes Required:

#### 1. Check of static-file headers

**File**: none (a note in this plan, Phase 1)

**Intent**: Before relying on headers, find out whether middleware runs for static files in preview and whether `public/_headers` takes effect.

**Contract**: A note under "Critical Implementation Details" with the result (`curl -I` for 3 paths, before and after adding `_headers`).

#### 2. Icons from the brand source

**File**: `scripts/pwa-icons.mjs` (new), `public/icons/` (new: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` 180×180)

**Intent**: Repeatably render PNGs from `public/favicon.svg`; the maskable icon has the flame inside the 80% safe zone on a full `#007a55` background (no rounded corners), and the apple-touch-icon has a full background with no transparency.

**Contract**: `node scripts/pwa-icons.mjs` (renders through `npx sharp-cli` or `npx sharp` without adding it to `package.json`; the header comment in the script gives the command), its output committed. Every PNG has the dimensions from its name.

#### 3. Manifest

**File**: `public/manifest.webmanifest` (new)

**Intent**: Describe the app for installation.

**Contract**: `name: "StreakBoard"`, `short_name: "StreakBoard"`, `description` (as the meta description in `Layout.astro`), `id: "/"`, `start_url: "/dashboard"`, `scope: "/"`, `display: "standalone"`, `theme_color` and `background_color: "#007a55"` / white (the source of the colour: the `--primary` token, written in a comment in the commit and in README), `icons`: 192, 512 (`purpose: "any"`), maskable 512 (`purpose: "maskable"`). Served as `application/manifest+json`.

#### 4. Head

**File**: `src/layouts/Layout.astro`

**Intent**: Link the manifest, colour and iOS icon on every page and load the registration module.

**Contract**: `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" content="#007a55">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`, `<meta name="apple-mobile-web-app-title" content="StreakBoard">`, `<meta name="mobile-web-app-capable" content="yes">`; `<script>` importing the registration module (Astro bundles it). The literal `#007a55` in `Layout.astro`: `src/layouts/` is covered by the ESLint "no literals" rule, so the colour comes from a constant in `src/lib/site.ts` (`THEME_COLOR`) with a comment pointing to the token, and the head reads the constant.

#### 5. Headers for static files

**File**: `public/_headers` (new, if check 1 confirms it takes effect)

**Intent**: `sw.js` must never be cached by an HTTP cache, and the manifest needs the right MIME type.

**Contract**: `/sw.js` → `Cache-Control: no-cache`; `/manifest.webmanifest` → `Content-Type: application/manifest+json`, `Cache-Control: no-cache`. No rule for `/_astro/*` (the adapter appends its own immutable cache rule and skips it when a user rule already sets Cache-Control there). If `_headers` does not work, the fallback is the browser's default `updateViaCache: "none"` at registration (it is the default for the SW script anyway) and a manual check of the headers on production in phase 2.

#### 6. Service worker

**File**: `public/sw.js` (new)

**Intent**: The smallest service worker that makes installation possible and is the base for S-16.

**Contract**: `install` → `self.skipWaiting()`; `activate` → `self.clients.claim()` and deletion of every `caches` key (cleanup against future regressions); no `fetch` handler (see Critical Implementation Details); a comment: "no page or data caching — PRD Non-Goals; S-16 adds `push` here".

#### 7. Registration, message and reporting on the page side

**File**: `src/lib/pwa/register.ts` (new), `src/components/site/UpdateNotice.astro` (new) and its use in `Layout.astro`

**Intent**: Register `/sw.js` with `scope: "/"`, show the message after an update, and report errors.

**Contract**:

- Registration only when `"serviceWorker" in navigator` and in a production build (in `astro dev` it would get in the way of HMR; a constant from `import.meta.env.PROD`).
- On `controllerchange`, when there was a controller before: show `UpdateNotice` (`role="status"`, text "A new version of StreakBoard is available.", button "Refresh" → `location.reload()`).
- On a `register()` error or an update error: `navigator.sendBeacon("/api/client-errors", code)` (a string body, so `text/plain`) with `code` ∈ {`sw_register_failed`, `sw_update_failed`}, with no error text and no URL.
- `UpdateNotice` is hidden markup (`hidden`) in `Layout.astro`, styled only with tokens and shared components (`Button` from `src/components/ui/`); the script removes `hidden`. The message is not `role="alert"` (smoke reserves alert for errors).
- The update decision (show the message only on `controllerchange` when there was a controller before) is a pure, exported function in `register.ts`, so a unit test can cover it (plan review F2).
- `Layout.astro` takes a dev-only prop `showUpdateNotice` (renders the message without `hidden`), and `AppLayout.astro` passes it through; only the kitchen sink sets it (plan review F3).

#### 8. Client error endpoint

**File**: `src/pages/api/client-errors.ts` (new), `tests/unit/client-errors.test.ts` (new)

**Intent**: Pass a fixed error code from the browser to Sentry without user data.

**Contract**: `export const prerender = false`; `POST` only. Accepts **only** `Content-Type: text/plain` — the one body type both `sendBeacon` sends and Astro's `checkOrigin` guards (`node_modules/astro/dist/core/app/origin-check.js:2-21` does not check JSON; plan review F1). The body (≤ 256 bytes) is the code itself, from the enum above. A known code → `reportError("client.sw.<code>", new Error(code), requestFields(context))` and `204`. Any other content-type → `415` with no report. An unknown or empty code, or too large a body → `400` with no report. `Cache-Control: no-store`. Public route (not in `PROTECTED_ROUTES`). Unit tests: known code → 204 + one report; JSON → 415; unknown code, empty body, too large a body → 400; no report in any rejected case.

#### 9. 404 page

**File**: `src/pages/404.astro` (new)

**Intent**: An unknown address shows a StreakBoard page instead of the default one.

**Contract**: Renders `PublicLayout` with an `<h1>` "Page not found" and a link to `/` (`<a class:list={buttonVariants(...)}>`); answers `404`. Rendered by SSR (no `prerender`); Astro uses it for every unmatched route.

#### 10. Invite hint

**File**: `src/components/dashboard/NoGroupCards.astro`, `src/components/dashboard/MembersCard.astro` (or `CopyInviteLink.tsx`)

**Intent**: An invite link opened from a messenger on iOS goes to Safari, not to the installed app; tell users to paste it into the form.

**Contract**: Under "Have an invite? Paste the link or code." add one sentence: "Using the installed app? Copy the invite link and paste it here." Next to the copy-link button: "Friends with the installed app can paste this link under Join with code." Keep the smoke invariants (headings, buttons with their text only).

#### 11. Privacy policy

**File**: `src/components/privacy/Cookies.astro` (or a new section if it fits better)

**Intent**: The service worker is something the app installs in the browser; the owner decided the policy says so.

**Contract**: One paragraph: StreakBoard registers a service worker so the app can be installed; it stores no pages, data or personal information on the device, and removing the app or clearing the site's data removes it.

#### 12. Kitchen sink and smoke

**File**: `src/components/dev/dashboard-fixtures.ts`, `src/pages/dev/dashboard-kitchen-sink.astro`, `scripts/smoke.mjs`

**Intent**: Show the state with the message, and have smoke prove the PWA files.

**Contract**:

- Kitchen sink: a new `update-notice` state in `DASHBOARD_STATES` (`dashboard-fixtures.ts:21`) renders the `owner` dashboard with `showUpdateNotice` set; `scripts/ui-screenshots.mjs` picks up its link automatically (`:383-390`).
- New smoke steps (each asserting the outcome):
  - `manifest.webmanifest` 200, `application/manifest+json`, JSON with `start_url: "/dashboard"`, `display: "standalone"` and 3 icons;
  - each icon from the manifest 200, `image/png`;
  - `/sw.js` 200, JavaScript, contains `skipWaiting` and no `respondWith`/`caches.put`, with `Cache-Control` containing `no-cache` (if `_headers` works in preview);
  - `/dashboard` (signed in) has `rel="manifest"`, `theme-color` `#007a55` and `apple-touch-icon`;
  - `/no-such-page` 404 with the "Page not found" heading;
  - `POST /api/client-errors` (`text/plain`) with a known code → 204, with an unknown one → 400, with a foreign `Origin` → 403; a JSON body → 415.

#### 13. E2E

**File**: `tests/e2e/pwa.spec.ts` (new), `tests/unit/pwa-register.test.ts` (new)

**Intent**: Prove in a real browser that the service worker registers, controls the page and caches nothing after sign-in; prove the update decision deterministically in a unit test (plan review F2: whether Playwright can route the browser's fetch of `sw.js` is undocumented, so the update is not simulated in e2e).

**Contract**:

- E2E on chromium (signed in from storageState):
  - after `/dashboard`, `navigator.serviceWorker.ready` resolves with scope `/`;
  - after a reload, `navigator.serviceWorker.controller` is set;
  - `caches.keys()` is empty;
  - `/dashboard` responses do not come from the SW (`response.fromServiceWorker() === false`).
- On mobile-chromium, the same spec, or the spec skipped if it is flaky there, with the reason given in the spec.
- Unit test with a stubbed `navigator.serviceWorker`:
  - `controllerchange` with a previous controller → show the message;
  - first install (no previous controller) → no message;
  - `register()` rejects → one beacon with `sw_register_failed`.
- The update in a real browser is covered by manual step 3 and the kitchen-sink state.

#### 14. Docs

**File**: `CLAUDE.md`, `README.md`

**Intent**: Record the new contracts.

**Contract**: CLAUDE.md: `src/pages/api/client-errors.ts` in the endpoint list, the 404 page, the service worker without a cache in Architecture (one sentence), `UpdateNotice` in `src/components/site/`. README: how to regenerate the icons (`node scripts/pwa-icons.mjs`), where the theme colour comes from, and that `sw.js` must not cache anything (PRD Non-Goals).

### Success Criteria:

#### Automated Verification:

- Lint and formatting pass: `npm run lint`
- Token contrast passes: `node scripts/token-contrast.mjs`
- Types and build pass: `npx astro check && npm run build`
- Unit tests pass (incl. `client-errors` and `pwa-register`): `npm run test:unit`
- Smoke passes with the new PWA steps: `npm run smoke`
- E2E passes (incl. `pwa.spec.ts`): `npx playwright test`
- Integration tests pass: `npm test`

#### Manual Verification:

- The static-file header check result is recorded in the plan (middleware yes/no, `_headers` works yes/no)
- Chrome DevTools → Application → Manifest shows no installability errors on `npm run preview`
- The `update-notice` state on the kitchen sink looks right in light and dark themes
- CI passes on the PR (`ci`, `smoke`, `e2e`, `integration`, `ai-review`)

**Implementation Note**: The run follows the lesson "Implement plans with /10x-goal-implement": phase 1 in one run, then `/10x-impl-review installable-pwa`, one push and one PR. Phase 2 needs the release of this PR.

---

## Phase 2: Release and devices

### Overview

Merge the PR, approve the release, check production and the devices; record the result.

### Changes Required:

#### 1. Release

**File**: none (GitHub)

**Intent**: Put the slice on production through the gated `release` job (lesson "Close every slice by merging to master…").

**Contract**: Merge to `master`, approve `release` in the `production` environment; the slice has no migrations.

#### 2. Device checks and iOS script

**File**: `context/changes/installable-pwa/ios-check.md` (new), `context/changes/deployment/deployment-plan.md`

**Intent**: The owner checks Android and desktop; a group member checks iOS from the script.

**Contract**: `ios-check.md` — steps for the iPhone user: Safari → `https://streakboard.app` → Share → "Add to Home Screen" → open from the icon → sign in with e-mail and password → sign out → sign in with Google → paste an invite link into "Join with code" → check off a task; for each step "worked / what you saw". `deployment-plan.md` — a new Phase with the next free number (S-13 is running in parallel; pick the number when merging), the date, the release run, the result of the checks and the iOS status (pending / result).

### Success Criteria:

#### Manual Verification:

- PR merged to `master` and the `release` run approved and green
- `https://streakboard.app/manifest.webmanifest` and `/sw.js` answer 200 with the expected `Content-Type` and `Cache-Control` (`curl -I`)
- Android Chrome: install, open from the icon on `/dashboard` without the browser bar, sign in with e-mail and Google, paste an invite link, check off a task
- Desktop Chrome or Edge: install and open the app in its own window, check off a task
- After signing out of the installed app, `/dashboard` does not show the previous user's data (the frame's guardrail)
- `ios-check.md` handed to an iPhone user; the result (or "pending") recorded in `deployment-plan.md`
- Release recorded in `context/changes/deployment/deployment-plan.md`

---

## Testing Strategy

### Unit Tests:

- `client-errors`: known code → 204 + one `reportError` with event `client.sw.<code>`; JSON → 415; unknown code, empty body, body > 256 B → 400; no report on any rejection.
- `pwa-register`: message only after an update (previous controller), none on first install; a registration error sends one `sw_register_failed` beacon.

### Integration Tests:

- None new: the slice does not touch the database.

### E2E and smoke:

- `pwa.spec.ts`: registration, control, empty `caches`, responses not from the SW (no update simulation; see the unit test).
- Smoke: manifest, icons, `sw.js` (content and header), head tags on a signed-in page, 404, the client error endpoint (204/400/403/415).

### Manual Testing Steps:

1. `npm run build && npm run preview`, Chrome → DevTools → Application → Manifest/Service Workers: no errors, SW active, Cache Storage empty.
2. Install the app from the address bar and open it: the `/dashboard` window with no browser bar.
3. Change the comment in `dist/sw.js`, reload the preview: the message appears; "Refresh" reloads the page.

## Performance Considerations

The service worker has no `fetch` handler, so it adds nothing to the path of a request; the registration script is small and runs after page load. The icons are loaded only by the browser at install time.

## Migration Notes

No database migrations. Rolling back the code (`npx wrangler rollback`) leaves the registered `sw.js` in the browser; because it has no cache and no `fetch` handler, an old service worker does not change how the app works. If the service worker ever has to be removed, the cleanup is a `sw.js` that calls `self.registration.unregister()`.

## References

- Frame: `context/changes/installable-pwa/frame.md`
- Research: `context/changes/installable-pwa/research.md`
- Roadmap: `context/foundation/roadmap.md` §S-17, §S-16 Unknowns
- Single head: `src/layouts/Layout.astro:18-25`; token `src/styles/global.css:24`
- Reporting: `src/lib/log.ts:88,120`
- Join form: `src/components/groups/JoinGroupForm.tsx`; card `src/components/dashboard/NoGroupCards.astro:29`
- Smoke: `scripts/smoke.mjs:734`; Playwright: `playwright.config.ts`
- Lessons: "Smoke steps must assert outcomes", "Every returned Supabase `{ error }`…", "Implement plans with /10x-goal-implement…", "Close every slice by merging to master…"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Installable app

#### Automated

- [x] 1.1 Lint and formatting pass: `npm run lint`
- [x] 1.2 Token contrast passes: `node scripts/token-contrast.mjs`
- [x] 1.3 Types and build pass: `npx astro check && npm run build`
- [x] 1.4 Unit tests pass (incl. `client-errors` and `pwa-register`): `npm run test:unit`
- [x] 1.5 Smoke passes with the new PWA steps: `npm run smoke`
- [x] 1.6 E2E passes (incl. `pwa.spec.ts`): `npx playwright test`
- [x] 1.7 Integration tests pass: `npm test`

#### Manual

- [ ] 1.8 The static-file header check result is recorded in the plan
- [ ] 1.9 Chrome DevTools → Manifest shows no installability errors on preview
- [ ] 1.10 The `update-notice` state on the kitchen sink looks right in light and dark themes
- [ ] 1.11 CI passes on the PR

### Phase 2: Release and devices

#### Manual

- [ ] 2.1 PR merged to `master` and the `release` run approved and green
- [ ] 2.2 Production manifest and `sw.js` answer 200 with the expected headers
- [ ] 2.3 Android Chrome: install, sign in (e-mail, Google), invite, check-off
- [ ] 2.4 Desktop Chrome/Edge: install, own window, check-off
- [ ] 2.5 After sign-out the installed app does not show the previous user's data
- [ ] 2.6 `ios-check.md` handed over; iOS result or "pending" recorded
- [ ] 2.7 Release recorded in `deployment-plan.md`
