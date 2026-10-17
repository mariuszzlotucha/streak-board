---
date: 2026-10-17T13:28:12+02:00
researcher: Claude (Opus 5.5) for Mariusz Złotucha
git_commit: 1aedc33
branch: s-17/installable-pwa/plan
repository: streak-board
topic: "What S-17 (installable PWA) touches: head and static assets, sign-in and links in standalone mode, policy, CI"
tags: [research, pwa, manifest, service-worker, layout, auth, pkce, join-code, privacy, ci]
status: complete
last_updated: 2026-10-17
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Owner decisions: privacy policy, theme from token (verified #007a55), 404 page plus error and notification handling in scope"
---

# Research: installable PWA (S-17)

## Research Question

Building on `frame.md`: where do a manifest, icons and a service worker without page caching attach in this codebase, and how do the sign-in and invite-link flows behave when the app runs as an installed (standalone) app, especially on iOS?

## Summary

- **One head.** `src/layouts/Layout.astro:18-25` is the only `<head>` for Astro pages; `AppLayout` and `PublicLayout` wrap it. The one exception is the hand-written 503 page `UNAVAILABLE_PAGE` in `src/lib/auth-state.ts:43-55`.
- **Nothing PWA exists yet.** `public/` holds two files: `favicon.svg` and `favicon.png` (48×48). There is no theme-color, no `apple-*` meta and no apple-touch-icon. The viewport is `width=device-width` with no `initial-scale` (`Layout.astro:20`).
- **The brand source is `public/favicon.svg`.** It is the Lucide flame on `#007a55` with a 32×32 viewBox. The `--primary` token is in `src/styles/global.css:24` (light) and `:63` (dark).
- **Static files.** They are served from `./dist` through `ASSETS` (`wrangler.jsonc:7-11`), with no `run_worker_first`, `_headers` or CSP.
- **Sign-in is PKCE in both flows.** In Google sign-in (`src/pages/api/auth/google.ts:17-30`) and e-mail confirmation (`src/pages/auth/callback.ts:8-34`), the verifier is a cookie in the browser where the flow started. When the callback lands in another cookie store, the user ends on `/auth/signin?error=oauth_failed` (Google) or `?error=link_expired` (e-mail).
- **The invite code lives in one cookie store.** `join_code` (`src/lib/join-code.ts:14-20`, 1 hour) stays where `/join/<code>` was opened. A link from a messenger opened in Safari will not reach an installed app with its own store.
- **Policy, history and CI.** The privacy policy's cookie section (`src/components/privacy/Cookies.astro`) has nothing about service workers or browser storage. There is no earlier change about PWA. A change in `public/` runs the full CI. The only check on static files is smoke `scripts/smoke.mjs:734` (favicon 200 + `<svg`).

## Detailed Findings

### Head and static assets

- `Layout.astro` is the only head; `PublicLayout.astro:37` and `AppLayout.astro:3` render it.
  - Pages on `PublicLayout`: `index`, `privacy`, `auth/{signin,signup,confirm-email}`.
  - Pages on `AppLayout`: `dashboard`, `settings`, `account/nickname`.
  - The kitchen sinks in `src/pages/dev/` use `Layout` directly or through `AppLayout`.
- There are no custom 404/500 pages in `src/pages`. `not_found_handling: "404-page"` (`wrangler.jsonc:10`) points at a 404 page that SSR probably does not generate (not checked).
- The `src/pages/*.ts` routes (api, `auth/callback`, `auth/google/callback`, `join/[code]`) return no HTML.
- `astro.config.mjs:16` has `adapter: cloudflare()` with no options.
- Middleware and static assets (inference, not checked at runtime): under the default (assets before the Worker), a static file in `dist` is served without the Worker, so `src/middleware.ts` does not run for it. This matters for a service worker file: its headers (e.g. `Cache-Control`, `Service-Worker-Allowed`) cannot be set from middleware without a different configuration.
- `Cache-Control` is set in two inspected places, both `no-store`: `src/lib/checkoff-response.ts:21` and `src/lib/auth-state.ts:59`.
  - SSR pages have no explicit `Cache-Control` (grep over `src/`).
- `SiteHeader.astro:17` uses `/favicon.svg` as the logo, so renaming that file affects the header.

### Sign-in in standalone mode

- **Cookies** (`src/lib/supabase.ts:12-20`, `@supabase/ssr` defaults):
  - `sb-<ref>-auth-token` (chunks) and `sb-<ref>-auth-token-code-verifier`: `path=/`, `SameSite=Lax`, not HttpOnly, Max-Age 400 days, `Secure` in a production build.
  - The names come from the library convention, not from a running app.
- **Google**: a form POST sets the verifier and redirects off-origin (Supabase → Google → Supabase → `/auth/google/callback`).
  - A missing or mismatched verifier counts as stale (`src/lib/auth-errors.ts:45-50`) and ends on `oauth_failed` with "Google sign-in could not be completed. Please try again." (`auth-errors.ts:18`).
  - Success ends on `/dashboard` (`src/pages/auth/google/callback.ts:57`).
- **E-mail**: `signup.ts:19-20` sets `emailRedirectTo=/auth/callback`; the callback exchanges `?code=` (PKCE).
  - Without the verifier the user gets `link_expired` (`callback.ts:34`).
  - The e-mail is probably already confirmed on the Supabase side by then, so a password sign-in inside the app works. This is an inference, not checked.
- **Platform behaviour, outside the code**: whether iOS keeps the off-origin OAuth navigation inside the installed app's view or opens Safari / an in-app view. Not verified; the owner has no iPhone (see `frame.md` → Confidence).

### Invite link

- Flow: `/join/[code]` → cookie → `/dashboard` → middleware sends an anonymous visitor to `/auth/signin` (`src/middleware.ts:35-42`) → after sign-in `dashboard-data.ts:125-139` peeks at the cookie and shows the pending group.
- Joining is an explicit POST to `/api/groups/join`.
- In the inspected paths, sign-in does not clear `join_code`.
- On iOS (inference): a link opened from a messenger lands in Safari, so `join_code` stays in Safari's store and an installed app with its own store will not see it.

### Start URL

- `/` sends a signed-in visitor to `/dashboard` and shows an anonymous visitor the landing page (`src/lib/landing.ts:13-18`).
- `/dashboard` sends an anonymous visitor to sign-in.
- Both work as the app's start page.

### Privacy policy

- `Cookies.astro` lists four strictly necessary cookies: auth-token, code-verifier, `join_code` and `auth_email`.
- A grep over `src/components/privacy/` and `src/pages/privacy.astro` found no mention of storage, cache or device.
- The rule in CLAUDE.md requires a policy update when facts about cookies or providers change.
  - A service worker without a cache stores no personal data, but it is something the app installs in the browser.
  - Roadmap S-17 (`roadmap.md:111`) ties the policy to a change in "what the app stores in the browser".
  - Whether to add a line is a decision for the plan.

### CI and checks

- The `changes` job (`.github/workflows/ci.yml:21-52`) marks any file outside `context/` and `*.md` as code, so `public/` runs `ci`, `smoke`, `e2e` (chromium + mobile-chromium) and `integration`.
- Nothing checks `dist/` or `public/` beyond smoke `:734`.
- There are no tests on the head or manifest.
- `test-plan.md` has no PWA risk; the only one named is in `roadmap.md:118` (cache after sign-out, stale code after a rollback).

## Code References

- `src/layouts/Layout.astro:18-25` — the only head (favicon :21-22, viewport :20)
- `src/lib/auth-state.ts:43-59` — the separate 503 page with its own head, `no-store`
- `public/favicon.svg` — brand source (`#007a55`, flame)
- `src/styles/global.css:24,63,103` — `--primary` / `--color-primary`
- `wrangler.jsonc:7-11` — assets from `./dist`, `404-page`
- `src/lib/supabase.ts:12-20` — session and verifier cookies
- `src/pages/api/auth/google.ts:17-30`, `src/pages/auth/google/callback.ts:40-57`, `src/lib/auth-errors.ts:18,45-67` — Google PKCE and errors
- `src/pages/api/auth/signup.ts:19-20`, `src/pages/auth/callback.ts:8-34` — e-mail PKCE
- `src/lib/join-code.ts:4-20`, `src/pages/join/[code].ts:9`, `src/lib/dashboard-data.ts:125-139` — invite cookie
- `src/components/privacy/Cookies.astro` — cookie list in the policy
- `scripts/smoke.mjs:734` — the only check on a static file
- `.github/workflows/ci.yml:21-52` — CI path filter

## Architecture Insights

- The head lives in one place, so the manifest link, theme-color and apple-touch-icon are one edit in `Layout.astro`.
  - The 503 page in `auth-state.ts` is a separate decision.
- No page caching anywhere, plus a fetch-less service worker, matches the frame's decisions: there is no offline screen and nothing after sign-in goes into a cache.
- Session cookies with `SameSite=Lax` work for top-level navigation inside the installed app, as long as all of sign-in happens in the same cookie store.

## Historical Context (from prior changes)

- No earlier change or archive deals with PWA, a manifest or a service worker.
- "Offline" appears in `context/archive/2026-10-01-checkoff-and-leaderboard/plan.md:403` only as a test of a check-off tap without a network (rollback with a message).
- The offline Non-Goal: `context/foundation/prd.md:138`, `shape-notes.md:141`.
- S-16 has no change folder; its channel (push or e-mail) is open (`roadmap.md:97`).

## Related Research

- `context/changes/installable-pwa/frame.md` — framing: the full daily loop in the installed app, iOS checked by a group member after the release.

## Open Questions

- How iOS handles the off-origin OAuth navigation in standalone mode — platform behaviour; only the post-release check by an iPhone user answers it.
- Whether a static file in `dist` really bypasses middleware — the owner does not know (2026-10-17); **the plan must check it** (`wrangler dev`/preview + smoke) before relying on headers set by middleware for `sw.js`/manifest.

## Owner decisions (follow-up 2026-10-17)

Supersedes the corresponding open questions from the first version of this document.

1. **Privacy policy** — yes: the change adds a line about the service worker (stores no personal data and no pages) to the policy (`src/components/privacy/`), in the same change.
2. **Theme colour from the token** — yes. Checked: `--primary` light `oklch(0.508 0.118 165.612)` (`src/styles/global.css:24`) converts to exactly `#007a55`, the colour in `public/favicon.svg`. The manifest and `theme-color` can use this value with the token as its documented source; there is no `tokens-source/` folder in the repo yet.
3. **Middleware vs static files** — unknown; moved to Open Questions as a check in the plan.
4. **404 page** — confirmed: `dist` has no 404 page for `not_found_handling: "404-page"` (`wrangler.jsonc:10`). The owner decided: **create one in this change**, and the plan should also include **error and notification handling**. In the owner's words: "there is no page - we can create, but we should add to plan error and notification handling". It is not yet settled whether "notification handling" means user-facing messages (e.g. a failed service worker registration or update, a new version available) or error reporting to Sentry/logs (`src/lib/log.ts`); /10x-plan should ask the owner.
