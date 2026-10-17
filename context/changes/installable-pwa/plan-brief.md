# Installable PWA (S-17) — Plan Brief

> Full plan: `context/changes/installable-pwa/plan.md`
> Frame brief: `context/changes/installable-pwa/frame.md`
> Research: `context/changes/installable-pwa/research.md`

## What & Why

> **The real problem to plan around**: the installed app must get through the whole daily loop — installation, sign-in (e-mail and Google), joining from an invite link, check-off — on iOS and Android, and its service worker must be the base on which S-16 adds push.

The owner wants "the app to be a PWA" for two reasons: daily access from the home screen and a base for reminder notifications (S-16).

## Starting Point

There is no manifest, service worker, theme colour or large icons; `public/` holds only `favicon.svg` and `favicon.png` 48×48. One `<head>` (`src/layouts/Layout.astro`) serves every page. Sign-in uses PKCE with a cookie, and the invite code lives in the cookie store where the link was opened — on iOS that is a risk for an installed app with its own store.

## Desired End State

Android and desktop Chrome/Edge offer to install StreakBoard; the app opens on `/dashboard` in its own window with the flame icon and the `#007a55` colour. The service worker caches nothing, takes over right away after a release and shows "A new version of StreakBoard is available." with "Refresh"; its errors reach Sentry. An unknown address shows the StreakBoard 404 page. The privacy policy and the invite hint describe the new behaviour.

## Key Decisions Made

| Decision                | Choice                                                                                      | Why (1 sentence)                                                                                                      | Source           |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Offline                 | none; no page or data cache                                                                 | PRD §Non-Goals; owner: "Whatever happens"                                                                             | Frame            |
| iOS verification        | an iPhone group member after the release                                                    | the owner has no iPhone                                                                                               | Frame            |
| Privacy policy          | a line about the service worker                                                             | the owner decided it                                                                                                  | Research         |
| Theme colour            | `#007a55` = `--primary` token                                                               | checked: the token converts exactly to the colour in the favicon                                                      | Research         |
| 404 page                | create it in this change                                                                    | there was none                                                                                                        | Research         |
| "Notification handling" | Sentry + a "new version" message for the user                                               | the owner sees failures, the user doesn't get stuck on stale code                                                     | Plan             |
| Invite on iOS           | a hint: paste the link into "Join with code"                                                | the form already takes a link; works in any cookie store                                                              | Plan             |
| SW update               | `skipWaiting` + `clients.claim`, `sw.js` with no-cache                                      | no cache, so the switch is safe; no stale code                                                                        | Plan             |
| Icons                   | a script run by hand from `favicon.svg`, PNGs committed                                     | one source, no new dependency                                                                                         | Plan             |
| Start page              | `start_url=/dashboard`                                                                      | a signed-in user goes straight to the app, an anonymous one to sign-in                                                | Plan             |
| Install hint            | only the browser's prompt                                                                   | no new browser-specific UI                                                                                            | Plan             |
| Tests                   | smoke + Playwright e2e + unit test of the update logic                                      | e2e proves registration and no cache; the update is a unit test because routing `sw.js` in Playwright is undocumented | Plan + review F2 |
| Browser errors          | `POST /api/client-errors`, `text/plain` only (sendBeacon) with a fixed code → `reportError` | reuses server-side Sentry; `text/plain` is covered by Astro's origin check, JSON is not                               | Plan + review F1 |

## Scope

**In scope:** icons, manifest, head tags, `_headers` (if it works), `sw.js` without cache, registration + "new version" message, `/api/client-errors`, 404 page, invite hint, a line in the privacy policy, kitchen sink, smoke, e2e, CLAUDE.md/README, release and device checks.

**Out of scope:** offline mode and cache, push (S-16), our own install button and iOS tip, `@sentry/browser`, fixing PKCE across two cookie stores on iOS, a rate limit on the error endpoint, the 503 page, generating icons in the build.

## Architecture / Approach

Static files in `public/` (manifest, icons, `sw.js`, `_headers`) plus one head in `Layout.astro`, which links them and loads a small registration module. The service worker has only `install` (skipWaiting) and `activate` (clients.claim, cache cleanup) — no `fetch`. The page-side module registers it, shows `UpdateNotice` on `controllerchange` (when a controller was there before) and sends an error code to `/api/client-errors`, which calls `reportError`. The phase starts by checking whether static files skip middleware and whether `_headers` takes effect.

## Phases at a Glance

| Phase                  | What it delivers                                       | Key risk                                                          |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Installable app     | all code, docs, smoke and e2e in one PR                | headers for `sw.js` in preview; flaky SW tests on mobile-chromium |
| 2. Release and devices | production, Android/desktop checks, iOS script, record | iOS sign-in unverified until a group member reports               |

**Prerequisites:** planning PR merged; S-13 is running in parallel (shared: `NoGroupCards`/smoke/policy/`deployment-plan.md` — agree the merge order).
**Estimated effort:** 1 run of `/10x-goal-implement` (phase 1) + release and device checks (~1 session).

## Open Risks & Assumptions

- On iOS, Google sign-in and the e-mail link may land in Safari instead of the app (separate cookie store); password sign-in inside the app should work. Unverified until the post-release check.
- Assumption: current Chrome installs without a `fetch` handler; if not, a no-op handler with no cache.
- Assumption: `public/_headers` takes effect for Cloudflare assets; if not in preview, headers are checked on production.
- `/api/client-errors` is public; only the code enum, origin and size protect it.

## Success Criteria (Summary)

- The owner installs StreakBoard on Android and desktop and goes through sign-in, an invite and a check-off in the installed app.
- After a release, an open app shows the "new version" message, and SW errors appear in Sentry.
- After signing out, the installed app does not show the previous user's data.
