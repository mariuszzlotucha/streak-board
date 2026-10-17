---
date: 2026-10-17T00:00:00+02:00
researcher: Claude (Opus 5.5) for Mariusz Złotucha
git_commit: 84dbca0
branch: s-16/task-reminders/plan
repository: streak-board
topic: "How the app can schedule and deliver a same-period Web Push reminder for unticked tasks (S-16)"
tags: [research, task-reminders, worker, cron, web-push, service-worker, supabase, privacy]
status: complete
last_updated: 2026-10-17
last_updated_by: Claude (Opus 5.5)
---

# Research: Scheduling and delivering task reminders (S-16)

## Research Question

The question comes from `frame.md`: plan one reminder per period for each joined task still unticked when it is sent, delivered as Web Push to the
installed PWA. What does the codebase offer today, and what would have to be added, for (1) scheduling on the
Worker, (2) reading unticked participants with no user session, (3) Web Push delivery, (4) storage, consent and
deletion, (5) error reporting, and (6) privacy and settings? This is the open "how" question in the roadmap's Unknowns for S-16
(`context/foundation/roadmap.md:100`).

## Summary

None of the four runtime pieces exists in the inspected code: there is no cron trigger or `scheduled` handler, no
credential that works without a user session, no push code, and no Sentry wrapper outside a request. The
building blocks are in place, though: Warsaw period rules in TypeScript, an extensible `sw.js`, a migration
pattern for user-owned tables with a definer-function write path, cascade deletion from `auth.users`, and the
structured `log.ts` reporters. The decisions research cannot make are: the credential for the cron, the push library
(npm `web-push` on Workers is unverified), the send time in UTC versus the Warsaw clock change, and Free-plan CPU
headroom. The send time and consent remain owner decisions from `frame.md`.

## Detailed Findings

### 1. Scheduling on the Worker

- `wrangler.jsonc:4` sets `main` to `@astrojs/cloudflare/entrypoints/server`. The inspected file has no `triggers.crons`.
- `astro.config.mjs:16` calls `cloudflare()` with no options.
- In the installed adapter (14.3.1; read from the main checkout because this worktree has no `node_modules`), the server entrypoint exports only `{ fetch: handle }`.
- `handle(request, env, ctx)` is public (`dist/utils/handler.d.ts:7`).
- Searching the adapter's `dist` for `scheduled` or `workerEntryPoint` found no match.
- Inference: a custom Worker module that re-exports `handle` as `fetch` and adds `scheduled` would need to become `main`. Whether wrangler bundles that with Astro's output, and how `astro:env/server` resolves outside a request, is **unverified** (spike needed).
- Cron expressions run in UTC. The app's periods are Warsaw time (`src/lib/streak-rules.ts:7`), so a fixed UTC cron shifts by one hour across the DST changes.

### 2. Reading unticked participants without a session

- `src/lib/supabase.ts:6-24` builds every client from user cookies with `SUPABASE_KEY`.
- The env schema declares three keys: `SUPABASE_URL`, `SUPABASE_KEY` and `CONTACT_EMAIL` (`astro.config.mjs:22-25`).
- A grep of `src`, the config and the README found no service-role key or admin client.
- A cron has no `auth.uid()`. The options are a service-role secret (bypasses RLS) or a narrow `security definer` RPC, which still needs a credential the cron can present.
- Precedent for definer functions closed to clients: `transfer_group_ownership_for` and `delete_account`, revoked from all API roles (`supabase/migrations/20261016180000_account_deletion_and_ownership_transfer.sql:104,196`).
- Period rules:
  - `periodKeyFor` (`src/lib/streak-rules.ts:42-52`) returns the Warsaw day for `daily` and `once`, and the Warsaw Monday for `weekly`.
  - The recurrences are `once`, `daily` and `weekly` (`src/lib/task-rules.ts:8`).
  - If SQL computes the period, it must match these rules. Otherwise the Worker passes the period keys in.
  - Whether `once` tasks get reminders is open.

### 3. Web Push delivery

- `public/sw.js` has `install` and `activate` handlers only (lines 7-21). Line 2 reserves `push` for S-16.
- `src/lib/pwa/register.ts`:
  - It registers `/sw.js` in production builds only (lines 56-82, 90).
  - It reports client failures with a closed list of codes (`CLIENT_ERROR_CODES`, line 28) to `/api/client-errors`.
- A grep of `src/` and `public/` for `Notification` found no Notification or Push API use.
- A permission request must come from a user gesture.
- Per the S-17 research, iOS allows push only for a home-screen app.
- `package.json:25-45` has no web-push, VAPID or JWT library.
- `wrangler.jsonc:5-6`: `nodejs_compat` is on, with `compatibility_date` 2026-05-08.
- Whether npm `web-push` (which uses `https.request`) runs on Workers is **unverified**. The alternative is VAPID JWT plus aes128gcm payload encryption with WebCrypto and `fetch`. Sending without a payload avoids the encryption step, but then the service worker must show fixed text.
- Each send is a `fetch` to the browser's push service. Waiting does not count toward CPU, but signing and encryption do (`context/archive/2026-10-02-observability-swallowed-errors/research.md:177`).

### 4. Storage, consent and deletion

- The pattern for user-owned tables is in `supabase/migrations/20261016162551_add_nicknames.sql`:
  - `user_id ... references auth.users(id) on delete cascade` (line 27)
  - `revoke all` from anon and authenticated, then `grant select` to authenticated (lines 49-50)
  - RLS on, with a select-own policy (lines 56-60)
  - writes only through a `security definer` function bound to `auth.uid()` (lines 68-80)
- New tables also need rows in the RLS scenario checks (`20261015180024_grant_core_table_privileges.sql:14`).
- `delete_account` removes `auth.users` (account-deletion migration, line 187) and relies on cascades (header lines 18, 137). A table that follows the nickname pattern would therefore be cleaned up. The header comments and the privacy policy's AccountDeletion section should name it.

### 5. Error reporting

- `src/lib/log.ts:88,97,109` (`reportError`, `reportInfo`, `reportMapped`) log structured lines and call Sentry `captureException`.
- `src/lib/sentry.ts:16-30` wraps only requests (`wrapRequestHandler`).
- Outside a request, Sentry probably has no client, so only the console line reaches Workers Logs. A scheduled wrapper, or a manual client with `ctx.waitUntil(flush())`, is needed. Whether `@sentry/cloudflare` ^11.2.0 offers one is **unverified**.
- The S-08 contract says a failure must not be swallowed and must reach monitoring (`context/archive/2026-10-02-observability-swallowed-errors/plan-brief.md:9,17,36,50`). Sentry must never receive e-mail addresses or similar data (`plan-brief.md:67`).
- Expired subscriptions (HTTP 404/410 from the push service) are expected, not errors. That distinction is not yet designed.

### 6. Privacy policy, settings and smoke

- Privacy sections in `src/components/privacy/` that the change touches:
  - `Cookies.astro:26-30` says the service worker stores no data.
  - `WhatWeCollect.astro:9-15` covers the data collected.
  - `Providers.astro:7-29` covers recipients and transfers, which gains browser push services.
  - Retention, AccountDeletion and LegalBasis probably need a line each; their contents were not read.
- The privacy convention (CLAUDE.md) requires the policy to change in the same change.
- No CSP or Permissions-Policy header was found. `public/_headers:3-8` sets cache headers only.
- Settings layout: `SettingsView.astro:59-72` shows the group card, then `AccountCard` (with `<h2>Account</h2>`, line 46). A toggle fits there or in a new card.
- Smoke checks in `scripts/smoke.mjs` that the change must respect:
  - exact `<h2>` headings (lines 417, 462)
  - `<dt>`/`<dd>` pairing (418-420)
  - no `role="alert"` on success pages (line 378)
- New states also go into the kitchen-sink fixtures.

## Code References

- `wrangler.jsonc:4-6`: entrypoint and compatibility settings; no crons
- `astro.config.mjs:16,22-25`: adapter call; env schema
- `src/lib/supabase.ts:6-24`: cookie-session client only
- `src/lib/streak-rules.ts:7,42-52`: Warsaw time zone and `periodKeyFor`
- `src/lib/checkoffs.ts:54-66`: a check-off is for the current period only
- `public/sw.js:2,7-21`: the service worker, with the reserved push slot
- `src/lib/pwa/register.ts:28,56-90`: registration and client error codes
- `src/lib/log.ts:88-109`, `src/lib/sentry.ts:16-30`: reporters; request-only Sentry
- `supabase/migrations/20261016162551_add_nicknames.sql:27-80`: pattern for a user-owned table
- `supabase/migrations/20261016180000_account_deletion_and_ownership_transfer.sql:104,141-196`: closed definer functions; deletion

## Architecture Insights

- Writes go through `security definer` functions bound to `auth.uid()`, while operator-only layers are revoked from every API role. A cron reader is a new kind of caller, with neither a user nor an operator behind it.
- The period rules exist only in TypeScript (`streak-rules.ts`), plus a loose UTC window in RLS. A SQL-side "unticked now" query would duplicate them.
- Secrets are added by the owner with `wrangler secret put` (`context/changes/deployment/deployment-plan.md:59-64`). New secrets (VAPID keys, and possibly a server credential) are owner steps.

## Historical Context (from prior changes)

- `context/archive/2026-10-17-installable-pwa/plan.md:51,124`: the service worker is the base for S-16 push. The group's devices are mixed: iOS, Android and desktop (`frame.md:15-16`). iOS standalone sign-in is still unverified (`plan.md:34,54`).
- `context/foundation/infrastructure.md:92`: the Free-plan CPU limit is 10 ms per invocation. Worker CPU time has not been recorded in the deployment log: `/dashboard` was not measured (`deployment-plan.md:176`), and the readings at `deployment-plan.md:202,211` were accepted without values.
- `context/foundation/roadmap.md:102`: S-16 risks are CPU, the S-08 error contract, and the privacy, PRD, glossary and S-15 deletion updates.
- `deployment-plan.md:95`: `astro:env/server` can resolve to `undefined` in production (Astro issue #16790). This is relevant for secrets read outside a request.

## Related Research

- `context/changes/task-reminders/frame.md`
- `context/archive/2026-10-17-installable-pwa/research.md`
- `context/archive/2026-10-02-observability-swallowed-errors/research.md`

## Open Questions

1. A credential for the cron: a service-role secret, or a dedicated secret checked by a narrow definer RPC (team decision).
2. Push library: npm `web-push` on Workers versus WebCrypto VAPID/aes128gcm, or payload-less pushes (needs a spike).
3. A custom Worker `main` with `scheduled`, together with Astro's build output and `astro:env` outside a request (needs a spike).
4. Cron in UTC versus the Warsaw clock: two cron entries, or a time check inside the handler.
5. CPU per run on the Free plan as the number of subscriptions grows; batching or `waitUntil` behaviour.
6. Owner decisions carried over from `frame.md`: send time, the rule for weekly tasks, whether `once` tasks are included, opt-in versus default, and an e-mail fallback.
7. Sentry capture in a `scheduled` context with `@sentry/cloudflare` ^11.2.0.
