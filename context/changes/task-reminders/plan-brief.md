# Task reminders (S-16) — Plan Brief

> Full plan: `context/changes/task-reminders/plan.md`
> Frame brief: `context/changes/task-reminders/frame.md`
> Research: `context/changes/task-reminders/research.md`

## What & Why

> **The actual problem to plan around is:** an active member gets no prompt before the current Warsaw period closes while their joined task is still unticked, so a forgotten habit turns into a missed period before they can act.

We send one push notification at 20:00 Warsaw to each opted-in device, listing the joined tasks still unticked for their current period.

## Starting Point

The Worker serves requests only: it has no cron and no server credential. The service worker (S-17) caches nothing and reserves a slot for `push`. The period rules (Warsaw day or Monday) live in `src/lib/streak-rules.ts`.

## Desired End State

In Settings → Reminders, a member turns reminders on for a device. Every evening at 20:00 that device shows "Still to do today: …" if a daily task is unticked; on Sunday, unticked weekly tasks are included as well. Tapping the notification opens the dashboard. Members can turn reminders off on one device or on all devices; account deletion removes them. The privacy policy states the facts.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Channel | Web Push to the installed PWA, no e-mail | Active members use the installed PWA | Frame / Plan |
| Backfill / late tick | Not done | Members forgot the habit too, so a late tick would fake it | Frame |
| Send time | Fixed 20:00 Warsaw; crons at 18:00 and 19:00 UTC, the handler checks the Warsaw hour | Time left to act; exactly one run across DST | Plan |
| Weekly tasks | Sunday only | One nudge before the week closes | Plan |
| `once` tasks | Never reminded | No recurring period to miss | Plan |
| Consent | Opt-in per device from Settings | Permission must come from a click (iOS); clean consent | Plan |
| Devices | Several per user, plus "turn off everywhere" | Push subscriptions are per browser | Plan |
| Cron credential | Secret-guarded definer RPC, no service-role key | A leak exposes one read-only function, not the whole DB | Plan |
| Push crypto | WebCrypto VAPID + aes128gcm, payload names the tasks | Native on Workers; the message says what to do | Plan |
| Failures | 404/410 subscriptions deleted; others reported with a per-run summary; no retry | S-08 contract; one bad device doesn't block others | Plan |
| Duplicates | Rare duplicates accepted, no sent-log | No extra writes; the notification tag hides most of them | Plan |
| Testing | Unit + integration + RLS + smoke; real push checked manually | Covers the crypto and access risks | Plan |

## Scope

**In scope:**
- cron and custom Worker entry
- reminder rules
- `push_subscriptions` table and functions
- push sending
- `sw.js` handlers
- Settings card and API routes
- privacy policy, PRD, CLAUDE.md, README

**Out of scope:**
- e-mail
- a user-chosen time
- weekly reminders before Sunday
- `once` tasks
- exactly-once delivery
- retries
- a dashboard banner
- lapsed-user re-engagement
- a Playwright push e2e
- offline caching

## Architecture / Approach

Cron (18:00 and 19:00 UTC) → `scheduled` in `src/worker.ts` (wrapped by `withSentry`) → `reminderRun(now)` checks that it is 20:00 Warsaw and picks the periods → `due_reminders(secret, today, week)` returns subscriptions and task names → each one gets an encrypted push request through `fetch` to the push service → expired endpoints go to `prune_push_subscriptions` → a summary is logged. Browser: Settings card → permission → `pushManager.subscribe` → `POST /api/reminders/subscribe` → `subscribe_push`. The service worker shows the notification and opens `/dashboard`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scheduled Worker skeleton | Custom entry, crons, `reminderRun` rules | A custom `main` may not bundle with Astro's output |
| 2. Data model and database functions | Table, subscribe/unsubscribe, secret-guarded due-list and prune, RLS, tests | Due query must match the TypeScript period rules (periods are passed in) |
| 3. Push sending | WebCrypto Web Push, send loop, pruning, reporting, secrets | Crypto correctness; CPU per send on the Free plan |
| 4. Opt-in on the device and in Settings | `sw.js` handlers, push module, API routes, Reminders card, smoke | iOS: push only for the home-screen app |
| 5. Privacy policy, docs and release checks | Policy and docs; real-device checks | Owner steps: secrets and the hash insert |

**Prerequisites:** S-17 done (service worker installed); local Supabase stack for Phase 2; the owner generates the VAPID keys and the shared secret before release.
**Estimated effort:** ~3-4 sessions across 5 phases.

## Open Risks & Assumptions

- The custom Worker entry is unproven with Astro 7 and adapter 14.3.1; Phase 1 proves it first and records any fallback.
- `withSentry` must not change request-path reporting; verified in Phase 1.
- The Free-plan CPU limit (10 ms) has never been measured; it is watched through the per-run summary.
- iOS standalone sign-in is still unverified (from S-17); it affects who can opt in on iPhone.

## Success Criteria (Summary)

- An opted-in member with an unticked daily task gets one push at 20:00 Warsaw, and none once it is ticked.
- Turning reminders off (one device or all), or deleting the account, stops them.
- Send failures are visible in logs and Sentry; expired subscriptions are cleaned up.
