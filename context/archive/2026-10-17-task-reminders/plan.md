# Task reminders (S-16) Implementation Plan

## Overview

A member who opted in on a device gets one Web Push at 20:00 Warsaw time listing the joined tasks still unticked in the current period: daily tasks every evening, weekly tasks on Sunday evening only. The job runs as a cron on the existing Worker, reads through a secret-guarded database function, and sends encrypted pushes built with WebCrypto. The goal is to stop active members losing a period because they forgot the habit until the next day (`frame.md`).

## Current State Analysis

- No scheduling: `wrangler.jsonc:4` points `main` at `@astrojs/cloudflare/entrypoints/server`, which exports only `fetch`. It has no `triggers.crons`. The adapter (14.3.1) exports the public `handle(request, env, ctx)` (`dist/utils/handler.d.ts:7`).
- No server credential: `src/lib/supabase.ts:6-24` builds clients from the user's cookies. The env schema (`astro.config.mjs:22-25`) holds `SUPABASE_URL`, `SUPABASE_KEY` and `CONTACT_EMAIL`.
- No push: `public/sw.js:2` reserves `push` for S-16. `src/lib/pwa/register.ts` registers the worker in production builds only (line 90) and reports a fixed list of client error codes (line 28). `package.json` has no push or crypto library.
- Sentry wraps requests only (`src/lib/sentry.ts:16-30`). `@sentry/cloudflare` 11.4.0 exports `withSentry`, which wraps an exported handler.
- Periods: `periodKeyFor` (`src/lib/streak-rules.ts:42-52`) returns the Warsaw day for daily tasks and the Warsaw Monday for weekly ones. The recurrences are `once`, `daily` and `weekly` (`src/lib/task-rules.ts:8`).
- The frame's hypothesis table: a backfill was ruled out ("forgot the habit too"). The prompt must arrive before the period closes, on the installed PWA.

## Desired End State

On a device where the user turned reminders on in Settings → Reminders, a notification "StreakBoard: still to do today: <task>, …" appears at 20:00 Warsaw when at least one daily task (or, on Sunday, weekly task) the user joined is unticked for its current period. Tapping it opens `/dashboard`. Turning it off on a device, or "Turn off on all devices", stops it. Deleting the account removes every subscription. Expired subscriptions disappear after the first 404/410. Other send failures reach Workers Logs and Sentry with a per-run summary. The privacy policy describes all of this.

Verify: unit, integration and RLS suites green; smoke covers the Reminders card; a manual check on a real phone receives the 20:00 push.

### Key Discoveries:

- Custom entry pattern: our own `src/worker.ts` re-exports `handle` as `fetch` and adds `scheduled`. `wrangler.jsonc` `main` points at it. Whether the build includes it must be proven first (research Open Question 3).
- `astro:env/server` can be `undefined` in production (`context/changes/deployment/deployment-plan.md:95`, Astro #16790), and a cron has no request. Read cron secrets from the `env` argument of `scheduled`, not through `astro:env`.
- Table pattern: `supabase/migrations/20261016162551_add_nicknames.sql:27-80` (cascade on `auth.users`, revoke/grant, select-own RLS, definer write function on `auth.uid()`).
- Deletion: `delete_account` deletes `auth.users` and relies on cascades (`20261016180000_account_deletion_and_ownership_transfer.sql:137,187`).
- The S-08 error contract: nothing swallowed. Sentry must never receive e-mails or similar (`context/archive/2026-10-02-observability-swallowed-errors/plan-brief.md:9,67`).

## What We're NOT Doing

- No e-mail reminders and no Resend integration (push only).
- No reminders for `once` tasks. No weekly reminders before Sunday.
- No per-user send time (fixed 20:00 Warsaw).
- No sent-log or exactly-once guarantee. A rare duplicate from a Cloudflare re-run is accepted.
- No retry of failed sends.
- No backfill or late check-off (ruled out in `frame.md`).
- No dashboard opt-in banner, no reminders for lapsed members.
- No Playwright e2e for the push flow; real delivery is a manual check.
- No service-role key in the Worker.
- No offline caching (PRD Non-Goals); `sw.js` keeps no `fetch` handler.

## Implementation Approach

The work is built bottom-up, so each phase is green on its own:

1. Runtime and rules first, so the build question is settled early.
2. Then the database.
3. Then sending.
4. Then the browser UI.
5. Then policy and docs.

The cron runs at 18:00 and 19:00 UTC every day. The handler continues only when the Warsaw hour is 20, which gives one run per day across DST.

The secret-guarded functions are granted to `anon`. Each compares `sha256(p_secret)` with a hash stored in a one-row private config table, so a leaked anon key alone reads nothing.

## Critical Implementation Details

- **Timing & lifecycle**: `scheduled` must hand the whole send to `ctx.waitUntil`, so the run is not cut off. Sentry for requests stays in middleware (`src/middleware.ts:75` → `runWithSentry`), so `fetch` is exported as the plain `handle`, not wrapped by `withSentry`; wrapping it would set up a second client per request. Only `scheduled` is wrapped, by `runScheduledWithSentry` in `src/lib/sentry.ts`, which reuses `sentryOptions(env)` and flushes inside `waitUntil`.
- **Performance constraints**: Free plan, 10 ms CPU per invocation (`context/foundation/infrastructure.md:92`). Signing and encryption cost CPU; waiting on `fetch` does not. Import the VAPID private key once per run, compute the JWT once per push-service origin, and run sends with bounded concurrency (e.g. 6). Log `subscriptions`, `sent`, `pruned` and `failed` per run so CPU can be judged in Workers Logs.
- **State sequencing**: the period for each task comes from `periodKeyFor(recurrence, now)` in TypeScript, passed into SQL as `p_today` (Warsaw date) and `p_week` (Warsaw Monday). SQL never computes Warsaw dates, so the two rule sets cannot drift.

## Phase 1: Scheduled Worker skeleton

### Overview

The Worker gets a `scheduled` entry that runs at 20:00 Warsaw, is reported through Sentry, and computes which recurrences are due. It does not send anything yet.

### Changes Required:

#### 1. Custom Worker entry

**File**: `src/worker.ts`, `wrangler.jsonc`, `src/lib/sentry.ts`

**Intent**: Add a scheduled handler next to Astro's request handler without changing request behaviour. Add the cron triggers.

**Contract**: The default export is `{ fetch: handle, scheduled }`. `handle` comes from the default export of `@astrojs/cloudflare/entrypoints/server`, unwrapped. `scheduled(controller, env, ctx)` calls `ctx.waitUntil(runScheduledWithSentry(env, () => runReminders(env, new Date(controller.scheduledTime))))`. `runScheduledWithSentry` is new in `src/lib/sentry.ts`: it reuses `sentryOptions(env)`, runs `fn` in its own scope, and awaits `flush`. `astro preview` runs the built `main` in workerd (adapter `dist/entrypoints/preview.js:20,44`), so smoke exercises the custom entry. `wrangler.jsonc` sets `main` to the built worker entry and adds `"triggers": { "crons": ["0 18 * * *", "0 19 * * *"] }`. If wrangler cannot bundle a custom `main` with Astro's output, fall back to the adapter's documented custom-entrypoint option and record that in the phase notes. Either way, `npm run build && npm run preview` must still serve every page.

#### 2. Reminder rules

**File**: `src/lib/reminder-rules.ts`

**Intent**: A pure, unit-tested decision of whether this run should act, and which recurrences and periods it covers.

**Contract**: `reminderRun(now: Date): { due: false } | { due: true; today: PeriodKey; week: PeriodKey | null }`.

- `due` is true only when the Warsaw hour is 20.
- `week` is set only when the Warsaw weekday is Sunday.
- `once` is never covered.
- Reuse `APP_TIME_ZONE` and `periodKeyFor` from `streak-rules.ts`.

#### 3. Scheduled handler shell

**File**: `src/lib/reminders/run.ts`

**Intent**: The entry point the cron calls. In this phase it evaluates `reminderRun`, logs `reminders.run.skipped` or `reminders.run.started` through `reportInfo`, and returns.

**Contract**: `runReminders(env: ReminderEnv, now: Date): Promise<RunSummary>`. `ReminderEnv` is read from the Worker `env` argument, not `astro:env`.

### Success Criteria:

#### Automated Verification:

- Unit tests for `reminderRun` pass: 18:00 and 19:00 UTC on winter and summer dates, Saturday versus Sunday, and the DST switch days: `npm run test:unit`
- Build and lint pass: `npm run build && npm run lint`
- Smoke passes against the built preview (pages still served through the custom entry): `npm run smoke`

#### Manual Verification:

- `npx wrangler dev --test-scheduled`, then a request to `/__scheduled?cron=0+19+*+*+*`, logs a reminders run line

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: Data model and database functions

### Overview

Store per-device subscriptions and expose exactly what the cron needs, behind a shared secret.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_add_push_subscriptions.sql`

**Intent**: Per-device subscriptions owned by the user and deleted with the account. Two secret-guarded functions for the cron.

**Contract**:

- `push_subscriptions(id uuid pk, user_id uuid not null references auth.users(id) on delete cascade, endpoint text unique not null, p256dh text not null, auth text not null, created_at timestamptz default now())`.
  - RLS on, select-own policy.
  - Revoke everything from anon and authenticated, grant `select` to authenticated (the nicknames pattern).
  - An `https://` check on `endpoint`.
- `subscribe_push(p_endpoint, p_p256dh, p_auth)`: definer on `auth.uid()`. Upserts on `endpoint`; a re-subscribe moves the row to the caller.
- `unsubscribe_push(p_endpoint)` and `unsubscribe_all_push()`: definer on `auth.uid()`, granted to authenticated.
- `reminder_secret(id boolean primary key default true check (id), hash bytea not null)`: a one-row config table. RLS on, no policies, everything revoked from anon, authenticated and public.
- The secret is at least 32 random bytes (the owner runs `openssl rand -base64 32`). Both functions reject a `p_secret` shorter than 32 characters before hashing, and compare `sha256(p_secret::bytea)` with the stored digest inside the function.
- `due_reminders(p_secret text, p_today date, p_week date)`: definer, `set search_path = ''`, execute granted to anon only (revoked from public and authenticated). Raises `42501` unless the digest matches. Returns `(endpoint, p256dh, auth, task_names text[])`.
  - A row is returned per subscription of a user who has at least one joined task whose period has no check-off: `daily` against `p_today`, and `weekly` against `p_week` when it is not null.
  - Task names are sorted. `once` tasks are excluded.
- `prune_push_subscriptions(p_secret text, p_endpoints text[])`: same guard; deletes those endpoints.
- Update the header comments of the account-deletion migration's cascade list by naming the new table in this migration's header (do not edit old migrations).

#### 2. Types, RLS scenarios, tests

**File**: `src/types.ts`, `supabase/checks/rls-scenarios.sql`, `tests/integration/push-subscriptions.test.ts`

**Intent**: Regenerated types. RLS rows pin the grants in both directions:

- `has_function_privilege` rows, following `rls-scenarios.sql:1398`: anon may execute `due_reminders` and `prune_push_subscriptions` and no other new function; authenticated may execute only `subscribe_push`, `unsubscribe_push` and `unsubscribe_all_push`.
- No API role holds any privilege on `reminder_secret`.
- `push_subscriptions` is added to the S-12 table-grants block (`:1442-1475`).

Integration tests seed the secret hash through `adminClient()` (`tests/helpers/supabase.ts:27`). Integration tests for subscribe, re-subscribe, unsubscribe and unsubscribe-all; the due selection (daily ticked/unticked, weekly on Sunday or not, once ignored, left task ignored); a wrong secret is rejected; prune; cascade on account deletion.

**Contract**: The types are generated with the CLAUDE.md command. `npm run types:check` passes.

### Success Criteria:

#### Automated Verification:

- Migration guard passes: `npm run guard:migrations`
- Types are current: `npm run types:check`
- RLS scenarios pass: `npm run test:rls`
- Integration tests pass: `npm test`

#### Manual Verification:

- In the SQL Editor of the local stack, `due_reminders` with a wrong secret fails, and with the seeded secret it returns the expected rows

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Push sending

### Overview

The cron fetches due rows and sends one encrypted push per subscription. Expired subscriptions are deleted; other failures are reported.

### Changes Required:

#### 1. Web Push crypto

**File**: `src/lib/reminders/web-push.ts`

**Intent**: VAPID JWT (ES256, `aud` = the endpoint origin, `exp` ≤ 12 h, `sub` = `mailto:` from `CONTACT_EMAIL`) and RFC 8291 aes128gcm payload encryption, both with WebCrypto, so it runs natively on Workers.

**Contract**:

- `buildPushRequest(sub, payload: string, vapid: VapidKeys, now): Promise<Request>`.
- `Content-Encoding: aes128gcm`, `TTL: 14400` (expires around midnight), `Urgency: normal`.
- Unit tests use the RFC 8291 §5 test vector.

#### 2. Send loop

**File**: `src/lib/reminders/run.ts`

**Intent**: Build a cookieless client with a new `createAnonClient(url, key)` in `src/lib/supabase.ts` (plain supabase-js, `persistSession: false`, `autoRefreshToken: false`) from the scheduled `env` values `SUPABASE_URL` and `SUPABASE_KEY`. Call `due_reminders` with the secret and the rule periods, send with bounded concurrency, and collect expired endpoints. Delete them in one call. Report a per-run summary.

**Contract**:

- Payload JSON: `{ "title": "StreakBoard", "body": "Still to do today: <names>", "url": "/dashboard" }`. On Sunday weekly names are included; the body text for weekly is decided by the implementer and covered by a unit test.
- 404/410 → prune, logged with `reportInfo` (`reminders.subscription.expired`, no endpoint in the log).
- Any other non-2xx, or a thrown fetch → `reportError` (`reminders.send.failed`, status only).
- An RPC error → `reportError` (`reminders.due.failed`), then abort the run.
- The summary goes through `reportInfo` (`reminders.run.done`, counts only).

#### 3. Secrets

**File**: `README.md` (Deployment and the `.dev.vars` section)

**Intent**: The owner creates the VAPID key pair and the shared secret, and stores them with `wrangler secret put`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `REMINDER_SECRET`. The README documents three things:

- The exact commands.
- The production SQL Editor statement: `insert into public.reminder_secret (hash) values (sha256('<secret>'::bytea)) on conflict (id) do update set hash = excluded.hash;`.
- The three `.dev.vars` lines for local `wrangler dev --test-scheduled`. There is no `.dev.vars.example`.

The public key stays a server secret. Phase 4 renders it into the page.

**Contract**: Declare all three in the `env.schema` of `astro.config.mjs` as server secrets (`optional: true`). The cron reads them from the `scheduled` `env`. A missing secret logs `reminders.config.missing` and skips the run.

### Success Criteria:

#### Automated Verification:

- Crypto unit tests pass with the RFC 8291 vector: `npm run test:unit`
- Unit tests for the send loop pass with a stubbed fetch (200, 201, 404, 410, 500, throw): `npm run test:unit`
- Mutation testing on the send-outcome mapping: `npm run test:mutation -- --mutate "src/lib/reminders/run.ts"`
- Lint and build pass: `npm run lint && npm run build`

#### Manual Verification:

- With `wrangler dev --test-scheduled` and a subscription from a local browser, a triggered run at a faked 20:00 shows a notification

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Opt-in on the device and in Settings

### Overview

The user turns reminders on or off per device from Settings. The service worker shows and opens the notifications.

### Changes Required:

#### 1. Service worker

**File**: `public/sw.js`

**Intent**: A `push` handler shows the notification from the JSON payload. `notificationclick` focuses an open client or opens `url`. Still no `fetch` handler and no caching.

**Contract**: A notification `tag` per day, so a duplicate replaces rather than stacks. Update the line-2 comment.

#### 2. Browser subscription module

**File**: `src/lib/pwa/push.ts`, `src/lib/pwa/register.ts`

**Intent**: Detect support, request permission on a click, subscribe with `applicationServerKey` = the VAPID public key via `navigator.serviceWorker.ready`. `loadSettings` reads `VAPID_PUBLIC_KEY` on the server and passes it to the Reminders card as a prop; the island takes it from there. A missing key renders the `unsupported` state. Then the module should: POST to the API, and unsubscribe. Failures use new codes in `CLIENT_ERROR_CODES`.

**Contract**: The states are `unsupported`, `denied`, `off` and `on`. Testable with a `PwaEnvironment`-style stub (the same pattern as `register.ts:42-50`).

#### 3. API routes

**File**: `src/pages/api/reminders/{subscribe,unsubscribe,unsubscribe-all}.ts`, `src/middleware.ts`

**Intent**: Authenticated POSTs calling the Phase 2 functions. Every returned `{ error }` is reported (lesson). Add `/api/reminders` to `PROTECTED_ROUTES`.

**Contract**: The routes take JSON `{ endpoint, keys: { p256dh, auth } }` and answer `204` on success. `prerender = false`.

#### 4. Settings card

**File**: `src/components/dashboard/RemindersCard.astro` plus a React island for the toggle, `SettingsView.astro`, `src/lib/settings-data.ts`, kitchen-sink fixtures, `scripts/smoke.mjs`

**Intent**: A "Reminders" card between the group card and Account.

- It explains the 20:00 rule (daily; weekly on Sunday).
- It shows the state for this device and a "Turn off on all devices" button when the user has any subscription.
- An unsupported browser gets "Install StreakBoard on your home screen to get reminders" (the iOS case).

**Contract**:

- An exact `<h2>Reminders</h2>`.
- No `role="alert"` except for errors.
- Buttons hold only their text.
- Kitchen-sink states: `settings-reminders-off`, `-on`, `-unsupported`, `-denied`.
- Smoke asserts the heading and the explanation.

### Success Criteria:

#### Automated Verification:

- Unit tests for the push module states pass: `npm run test:unit`
- Integration tests for the three routes pass (auth required, error reported): `npm test`
- Lint (including the no-literals view rule) and the token check pass: `npm run lint && node scripts/token-contrast.mjs`
- Smoke passes with the new Settings assertions: `npm run smoke`

#### Manual Verification:

- The kitchen sink renders the four reminders states correctly (`node scripts/ui-screenshots.mjs`)
- On a local production preview, turning reminders on asks permission and "Turn off on all devices" clears it

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Privacy policy, docs and release checks

### Overview

The policy and docs state the new facts. Then the release and a real-device check.

### Changes Required:

#### 1. Privacy policy

**File**: `src/components/privacy/{Cookies,WhatWeCollect,Providers,Retention,AccountDeletion,LegalBasis}.astro`

**Intent**: State these facts:

- The service worker now receives notifications but still caches nothing.
- The push subscription (endpoint and keys) is stored per device on opt-in.
- The browser's push service (Google, Mozilla, Apple) delivers the message and sees the task names in encrypted form only.
- Consent is the legal basis; it can be withdrawn by turning reminders off.
- Subscriptions are deleted on opt-out, on expiry and with the account.

**Contract**: The section headings stay unchanged. Smoke for `/privacy` still passes.

#### 2. Docs

**File**: `context/foundation/prd.md` (the secondary criterion is met; a reminders rule), `CLAUDE.md` (Architecture: worker entry, cron, routes, table and functions), `README.md` (secrets, crons, local `--test-scheduled`)

**Intent**: Records match the code.

**Contract**: The CLAUDE.md schema list names `push_subscriptions` and `reminder_secret`. `PROTECTED_ROUTES` is updated in the text.

### Success Criteria:

#### Automated Verification:

- Lint, format and the full suite pass: `npm run lint && npm test && npm run smoke`

#### Manual Verification:

- The owner has set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `REMINDER_SECRET` with `wrangler secret put` and inserted the secret hash on production
- After release, a group member with an installed Android PWA receives the 20:00 reminder for an unticked daily task, and none once it is ticked
- An iPhone with the home-screen app receives a reminder
- Workers Logs show one `reminders.run.done` per day with CPU under the plan limit
- Before release, one triggered run's CPU time is measured with `wrangler tail` and the per-push cost and subscription ceiling are recorded in the README (impl review F3)
- Note 2026-10-17 (first production run): 1 push sent, `reminders.run.done` logged, 11 ms CPU against the Free plan's 10 ms, so 5.5 is not ticked; the owner stays on Free and accepts a ceiling of about one subscription (README "CPU ceiling"). The push arrived only after the phone was unlocked, so `Urgency` moved from normal to high; 5.3 waits for a check with the new urgency and the "none once ticked" half.

## Testing Strategy

### Unit Tests:

- `reminderRun`: hours across DST, the Sunday weekly rule, `once` never due.
- Web Push: the RFC 8291 vector, the VAPID JWT claims and expiry.
- Send loop: the outcome mapping (2xx, 404/410 prune, other error reports, RPC failure aborts), bounded concurrency, and no endpoint or e-mail in the logs.
- Browser push module states.

### Integration Tests:

- Subscription functions and RLS; due selection; secret rejection; prune; account-deletion cascade; API routes.

### Manual Testing Steps:

1. Turn reminders on on an Android PWA; leave a daily task unticked; receive the push at 20:00.
2. Tick the task on the next day before 20:00; no push.
3. On Sunday, leave a weekly task unticked; it appears in the reminder.
4. "Turn off on all devices"; no further pushes.

## Performance Considerations

There is one run per day. The CPU cost grows with the number of subscriptions (one encryption plus one signature per origin). Watch `reminders.run.done` counts against CPU in Workers Logs; batching across invocations is out of scope until a run nears the limit.

## Migration Notes

The table and functions are additive. The release step runs `supabase migration list` then `db push` (lessons). After the migration, the owner inserts the secret hash into `reminder_secret`; until then `due_reminders` rejects every call and the cron logs a failure, which is safe. Rollback: remove the crons from `wrangler.jsonc` and redeploy; the data can stay.

## References

- Frame: `context/changes/task-reminders/frame.md`
- Research: `context/changes/task-reminders/research.md`
- Table pattern: `supabase/migrations/20261016162551_add_nicknames.sql:27-80`
- Periods: `src/lib/streak-rules.ts:42-52`
- Service worker: `public/sw.js:2`; registration `src/lib/pwa/register.ts:28,42-90`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Scheduled Worker skeleton

#### Automated

- [x] 1.1 Unit tests for `reminderRun` pass: 18:00 and 19:00 UTC on winter and summer dates, Saturday versus Sunday, and the DST switch days — 5b7e146
- [x] 1.2 Build and lint pass — 5b7e146
- [x] 1.3 Smoke passes against the built preview (pages still served through the custom entry) — 5b7e146

#### Manual

- [ ] 1.4 `wrangler dev --test-scheduled` and `/__scheduled` log a reminders run line

### Phase 2: Data model and database functions

#### Automated

- [x] 2.1 Migration guard passes — 22e6002
- [x] 2.2 Types are current — 22e6002
- [x] 2.3 RLS scenarios pass — 22e6002
- [x] 2.4 Integration tests pass — 22e6002

#### Manual

- [ ] 2.5 `due_reminders` rejects a wrong secret and returns the expected rows locally

### Phase 3: Push sending

#### Automated

- [x] 3.1 Crypto unit tests pass with the RFC 8291 vector — b70a6d0
- [x] 3.2 Unit tests for the send loop pass with a stubbed fetch — b70a6d0
- [x] 3.3 Mutation testing on the send-outcome mapping — b70a6d0
- [x] 3.4 Lint and build pass — b70a6d0

#### Manual

- [ ] 3.5 A triggered local run shows a notification

### Phase 4: Opt-in on the device and in Settings

#### Automated

- [x] 4.1 Unit tests for the push module states pass — 0f0d2d9
- [x] 4.2 Integration tests for the three routes pass — 0f0d2d9
- [x] 4.3 Lint and the token check pass — 0f0d2d9
- [x] 4.4 Smoke passes with the new Settings assertions — 0f0d2d9

#### Manual

- [ ] 4.5 The kitchen sink renders the four reminders states correctly
- [ ] 4.6 Turning reminders on asks permission and "Turn off on all devices" clears it

### Phase 5: Privacy policy, docs and release checks

#### Automated

- [x] 5.1 Lint, format and the full suite pass — 51c234e

#### Manual

- [x] 5.2 The owner has set the three secrets and inserted the secret hash on production
- [ ] 5.3 An Android PWA receives the 20:00 reminder for an unticked daily task, and none once it is ticked
- [ ] 5.4 An iPhone with the home-screen app receives a reminder
- [ ] 5.5 Workers Logs show one `reminders.run.done` per day with CPU under the plan limit
- [x] 5.6 One triggered run's CPU per push is measured and the subscription ceiling is recorded in the README
