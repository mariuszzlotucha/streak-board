# Checkoff and leaderboard Implementation Plan

## Overview

S-04 (FR-008, FR-009, US-01, Business Logic; the roadmap's north star): a member who takes part in a task checks off the current day (or week) and immediately sees the updated score on their group's leaderboard. The slice adds a period-keyed fact table `task_checkoffs` with RLS and an aggregate read view, a pure TypeScript streak rule and ranking (halve-down decay, Warsaw calendar, weeks from Monday) that runs on the server and in the browser, two routes (`/api/tasks/checkoff`, `/api/tasks/uncheck`) with a form mode (302) and a fetch mode (JSON), a check-off control with the viewer's streak in every task row, a Leaderboard card under Tasks, and an optimistic React island so ticking feels instant.

## Current State Analysis

- Nothing for check-offs, streaks or a leaderboard exists: 4 public tables, no views, no enum, no route, helper or test for it (`research.md` Summary; `src/types.ts:31,60,84,110`). The inputs exist: `tasks.recurrence` is `once`/`daily`/`weekly` and immutable for clients (`supabase/migrations/20260930120000_create_tasks.sql:23,26,38-40`), `task_participants` has primary key `(task_id, user_id)` and leaving is a hard delete of the caller's own row (`20261001090000_create_task_participants.sql:26-33,63-65`), and group departure clears participation through a trigger (`:95-116`).
- There is no time model: no `Date`, `Intl` or timezone code in `src/` and no `current_date`/`date_trunc`/`at time zone` in `supabase/` (`research.md` §3). S-02 fixed only "weekly = one check-off per calendar week" (`context/archive/2026-09-30-task-create-and-manage/plan.md:47`), and `prd.md:97-99` says "dzień/okres" without defining either.
- Write path convention: a POST-only route, `normalizeUuid`, `createClient` null → `not_configured`, quiet no-ops for idempotent cases, `?error=<code>` redirects, whole-handler try/catch (`src/pages/api/tasks/join.ts:9-48`, `leave.ts:8-43`); task errors are a closed set (`src/lib/task-errors.ts:3-23`) over the group codes (`src/lib/group-errors.ts:1-27`); `/api/tasks` is already in `PROTECTED_ROUTES` (`src/middleware.ts:4`).
- The dashboard is one server-rendered column of cards. Its data load awaits `getMyGroup`, `listGroupMembers`, `listGroupTasks` and `listTaskParticipants` one after another (`src/pages/dashboard.astro:39,41,43,52`); the task row is a single `<li>` with a participants line and Join/Leave (`:191-260`); the Leave dialog text is at `:246`, the Leave-group text at `:323`, the remove-member text at `:162`. `src/components/ui/` has alert, alert-dialog, button, card, input and label only; there are no tabs.
- No client-side `fetch`, optimistic or partial-refresh code exists in `src/`; every action is a native form POST, a 302 and a full page load (`research.md` Summary). Astro's `checkOrigin` is on by default and rejects only non-safe requests with a form-like or missing `Content-Type` and a foreign Origin (`node_modules/astro/dist/core/app/origin-check.js:2-22`, `core/config/schemas/defaults.js:44`); a JSON body would bypass it.
- PostgREST returns at most 1000 rows (`supabase/config.toml:18`); `listTaskParticipants` already guards the cap (`src/lib/tasks.ts:49-68`). A log of check-offs grows with members × tasks × periods, so a raw read would stop working after about two months for a 5-member group with 3 daily tasks. Postgres is major version 17 (`config.toml:36`), so `security_invoker` views are available.
- Tests: Vitest runs one project whose global setup needs the local Supabase stack even for pure unit files (`vitest.config.ts:8-14`); the only unit file is `tests/unit/task-rules.test.ts`; SQL scenarios live in `supabase/checks/rls-scenarios.sql` (table lists at `:314,319`, S-03 section at `:627-790`); smoke row regexes scan from `<li>` to the first `</li>` and `NO_ERROR_ALERT = 'role="alert"'` is asserted on 31 lines (`scripts/smoke.mjs:81-183,206`); each task route is covered by the anonymous-302 and foreign-Origin-403 loop (`:303-315`).
- Release is gated: `release` runs after `ci`, `smoke` and `integration`, behind approval in the `production` environment, and applies migrations before deploying the Worker (`.github/workflows/ci.yml:81-150`, `README.md:196-225`), so migrations must be additive.
- Four decisions were pushed to S-04 by earlier slices (history on leave, definition of a day, decay value, cascade on delete); the planning interview settled all of them (below).

## Desired End State

A member who takes part in a task sees, in that task's row, "Mark done" (or "Done" with "Undo" when the current day or week is already checked) and their streak for the task. Ticking updates the row and the Leaderboard card at once, without a page reload, and the state survives a reload. The Leaderboard card lists every current member of the group with their total (sum of their task streaks) and position; equal totals share the position. Leaving a task, leaving the group or being removed erases that user's check-offs for the affected tasks. Outsiders can neither read nor write check-offs. Other members see a new score on their next page load (no realtime).

Verification: unit tests of the rule with an oracle derived from the PRD, `npm run test:rls`, `npm test` and `npm run smoke` pass, and a manual two-user walk-through on the local stack and then on production, including a tap on a phone that feels instant.

### Key Discoveries:

- The rule can stay a pure function with an injected clock: all inputs are period keys and `now`; this is what test-plan risk #4 and `tech-stack.md:24` ("computed on read") ask for, and it is what lets the browser compute the optimistic result with the same code (`src/lib/task-rules.ts:1-2` is the precedent for a browser-safe `src/lib` module).
- The composite foreign key `(task_id, user_id) → task_participants` ties a check-off to enrolment and makes leaving erase history by cascade, with no new trigger: the S-03 group-departure trigger already deletes participation (`20261001090000_create_task_participants.sql:95-116`). Referential checks bypass RLS, so enrolment is enforced even though the policies never read participation.
- A view with `security_invoker = true` applies the caller's RLS to the base table, which keeps the one-row-per-enrolment aggregate group-scoped; the default (owner rights) would leak every group, so the view needs its own outsider test.
- Astro's Origin check protects `fetch` as well as forms as long as the body is form-encoded, so the first fetch-based pattern needs no new CSRF mechanism.
- Smoke compatibility: one `<li>` per task row with no nested `<li>`, `role="alert"` reserved for errors, and each number in its own element so React SSR does not merge text nodes (`scripts/smoke.mjs:81-183,206`).
- A task's `once` kind has one "period": a first check-off adds 1 permanently, so it needs no decay and no period arithmetic.

## What We're NOT Doing

- Live updates for other members (Durable Objects/realtime; `tech-stack.md` has `has_realtime: false`). Other members see a new score on their next load.
- Checking off a past or future period, or a grace period for yesterday. Only the current day/week can be ticked or undone.
- A per-group or per-user timezone, a configurable decay or a configurable week start (PRD Non-Goals). The zone is one constant, `Europe/Warsaw`.
- Per-participant streaks inside the participant line, a per-task breakdown on the leaderboard, history charts, notifications (PRD Secondary criteria).
- Tabs or a separate leaderboard page; restyling the dashboard or new design tokens (a later `/10x-ui` pass).
- Tamper-proofing of the period beyond the insert window `[UTC today − 7, UTC today + 1]`, and any anti-cheat (PRD Non-Goals): a user calling the API directly can claim a day inside that window.
- Keeping history across a leave and rejoin; carrying a streak across a recurrence change (delete and recreate discards the task's history with it).
- Compaction or snapshots of old check-offs: the aggregate view returns one array per enrolment (about 5 KB per enrolment-year); revisit if groups outlive the MVP.
- New redirect error codes (the existing `forbidden`, `not_configured`, `unknown` are reused), a JSON read endpoint, handler tests with a mocked client, DOM or e2e tests of the island (test-plan §7 excludes UI testing; the island is verified manually, its protocol and state helpers by unit tests).

## Implementation Approach

Bottom-up, one branch and PR per phase, pure code first so every later layer builds on tested rules:

1. The rule and ranking as pure modules, test-first.
2. The table, policies and read view, proven by SQL scenarios and Vitest.
3. The server layer: reads, the two routes in both response modes, smoke boundaries.
4. The dashboard rendered by the server: a working feature with plain forms.
5. The optimistic island on top of the same markup.
6. Docs and the production release.

Decisions fixed by the planning interview:

- **Period.** A period key is `YYYY-MM-DD`: the calendar date in `Europe/Warsaw` for `daily` (and for `once`, informationally), and the date of the Monday that starts the Warsaw calendar week for `weekly`. Day and week arithmetic runs on the keys in UTC, so DST days (23 h and 25 h) are ordinary days.
- **Rule.** A period is open while it is the current one and closed afterwards; only a closed period without a check-off is missed. Over a task's checked periods in order, `value = decay(value, missed) + 1`, where `decay(v, m) = floor(v / 2^m)` (each missed period halves the streak, rounded down: 6 → 3 → 1, 1 → 0, 30 → 0 after five misses). The value shown now is the state after the last checked period, decayed for the closed periods missed since then. `once`: 1 when any check-off exists, otherwise 0, never decays. Deviations from the PRD: `prd.md:97` says a miss does not zero the streak completely, but with whole numbers a streak of 1 falls to 0 after one miss (a streak of 2 or more never resets in one miss); `prd.md:29` describes two tabs, while the leaderboard here is a card below Tasks (see Layout).
- **Totals and positions.** A member's total is the sum of their values over the tasks they take part in. Members are ranked by total descending; equal totals share the position (1, 1, 3) and are listed alphabetically by e-mail (user id is only a technical last resort). Every current member is listed, including those with 0.
- **Undo.** Only the current period can be undone (for `once`, any time). Past periods cannot be changed from the app.
- **Leaving.** Leaving a task, leaving the group, removal by the owner, deleting the task or the account erase the user's check-offs for the affected tasks (cascade through participation); the Leave dialogs say so.
- **Layout.** A Leaderboard card directly below the Tasks card on `/dashboard`; no new navigation (consistent with S-02).
- **Instant.** An optimistic React island flips the row and re-ranks the leaderboard locally with the same pure code, sends a form-encoded `fetch` with `Accept: application/json`, and rolls back on failure. Without JavaScript the same forms work through POST and 302. The server is the source of truth after any reload.
- **Data.** `task_checkoffs(task_id, user_id, period)` with a primary key (a repeat tick is a no-op) and a composite foreign key to `task_participants` (cascade). The app computes the period at request time; the insert policy only bounds it. A view `task_checkoff_periods` aggregates periods per enrolment so reads stay far below the 1000-row cap. The dashboard loads its data concurrently after `getMyGroup`.
- **Tests.** S-04 ships the streak-rule unit tests (test-plan Phase 4 is reconciled in the docs phase), SQL scenarios, Vitest RLS and flow tests, and smoke steps that assert outcomes.

## Critical Implementation Details

- **Transport and Origin check:** the island must send `URLSearchParams` (urlencoded), never JSON, because Astro's `checkOrigin` inspects only POSTs with form-like or missing content types. A JSON request body would silently opt out of CSRF protection; the new routes read only `formData()` and the smoke steps prove the foreign-Origin 403 in both response modes.
- **Timing:** the server computes the period from its own clock at request time and returns it; the client never sends one. If the returned period differs from the one the island expected (the page stayed open across Warsaw midnight), the island reloads instead of guessing.
- **Cascade interaction:** every way a participation row disappears (leave, group leave, owner removal, task delete, group delete, account delete) now also removes check-offs. The S-03 trigger needs no change; the group-delete cascade must stay free of errors (check-offs may already be gone).
- **Backward compatibility:** the migration only adds a table and a view that the deployed code does not read, so the release may apply it before the new code is live.
- **Smoke-visible markup:** one `<li>` per task row; the check-off control sits inside that `<li>` on its own line; the Leaderboard is an `<ol aria-label="Leaderboard">` whose rows hold position, e-mail, an optional "You" pill and the total, each in its own element; the island's client-side error text uses `role="status"`, never `role="alert"`; "You" appears on the Leaderboard only on the viewer's own row, and the Members-card helper `memberRow` is anchored to its card (Phase 4 §5), because the Leaderboard repeats the e-mail and the pill.
- **Hydration safety:** the Leaderboard's server HTML must equal its first client render, so the shared delta store starts empty and the totals are `server total + net delta`.

## Phase 1: Streak rule and leaderboard logic (pure TypeScript, test-first)

### Overview

Write the unit tests first (red), then the pure modules (green). No database, no UI. The rule is the highest-risk piece (test-plan risk #4) and gets its own PR and review.

### Changes Required:

#### 1. Period and streak rule

**File**: `src/lib/streak-rules.ts` (new)

**Intent**: The single definition of "period", "missed" and decay, usable on the server and in the browser; no server imports and no `Date.now()`, every function receives the instant.

**Contract**:
- `APP_TIME_ZONE = "Europe/Warsaw"`, `type PeriodKey = string` (`YYYY-MM-DD`).
- `periodKeyFor(recurrence: TaskRecurrence, at: Date): PeriodKey` builds the Warsaw calendar date from `Intl.DateTimeFormat#formatToParts` (not from a locale-shaped string, so it does not depend on locale data); for `weekly` it returns the Monday of that week by UTC arithmetic on the parts; `once` uses the daily key. Reuse one cached formatter.
- `periodsBetween(recurrence, from, to): number`: whole periods from `from` to `to` (`to >= from`), by UTC day arithmetic on the keys, divided by 7 for `weekly`.
- `decayStreak(value, missedPeriods): number`: `floor(value / 2^missedPeriods)`, 0 early for large counts. The only place that holds the decay value.
- `interface StreakSnapshot { base: { value: number; period: PeriodKey } | null; checked: boolean }`: the state after the last checked period before the current one, and whether the current period is checked.
- `snapshotOf(recurrence, periods: readonly string[], currentPeriod): StreakSnapshot`: de-duplicates and sorts the keys, snaps weekly keys to their Monday, ignores keys after `currentPeriod`. For `once`: `base` null and `checked` = any key present. It runs for every enrolment on every dashboard load, so it is linear over integer day numbers: parse each key once into days since the epoch, sort only when the input is not already ascending, snap weekly keys by arithmetic and fold while skipping repeats; no per-key `Date` or `Set` and no copy of the string array (a literal reading costs about 1.5 µs per stored period, see Performance Considerations).
- `streakValue(recurrence, snapshot, currentPeriod, checked = snapshot.checked): number`: the value now; passing `checked` is how the island previews a tick or an undo. Checked adds 1 after decaying `base` for the missed periods between `base.period` and `currentPeriod`; unchecked only decays; `once` returns `checked ? 1 : 0`.

#### 2. Leaderboard logic

**File**: `src/lib/leaderboard-rules.ts` (new)

**Intent**: Turn rows from the database into totals, the viewer's per-task snapshots and a ranked list, all pure.

**Contract**:
- `groupPeriodsByEnrolment(rows: { task_id; user_id; periods }[]): Map<taskId, Map<userId, string[]>>`.
- `interface StandingInput { userId: string; email: string | null; total: number }`, `interface Standing extends StandingInput { position: number; isYou: boolean }`.
- `rankStandings(rows, viewerId): Standing[]`: total descending, then e-mail ascending (case-insensitive code-unit order; a missing e-mail sorts under "Unknown member"), then user id; `position = 1 + the number of rows with a strictly higher total`.
- `buildBoard({ members, tasks, participantsByTask, periodsByEnrolment, viewerId, now })` returns the per-member totals (sum of `streakValue` over tasks the member takes part in; participants who are not in `members` are ignored), the viewer's `StreakSnapshot` and current period for each task they take part in.

#### 3. Unit tests

**File**: `tests/unit/streak-rules.test.ts`, `tests/unit/leaderboard-rules.test.ts` (new)

**Intent**: Prove the rule from the PRD sentence and the interview decisions. Every expected value is derived by hand from those sources and written in a table at the top of the test file, never produced by running the implementation (oracle problem).

**Contract** (named tests; instants are UTC, the zone is Warsaw):
- Day boundary: `2026-10-01T21:59:59Z` → `2026-10-01`, `22:00:00Z` → `2026-10-02` (CEST); `2026-01-14T22:59:59Z` → `2026-01-14`, `23:00:00Z` → `2026-01-15` (CET).
- DST days: the 23-hour day (`2026-03-28T23:00:00Z` through `2026-03-29T21:59:59Z` → `2026-03-29`, `22:00:00Z` → `2026-03-30`) and the 25-hour day (`2026-10-24T22:00:00Z` through `2026-10-25T22:59:59Z` → `2026-10-25`, `23:00:00Z` → `2026-10-26`); `periodsBetween` across them counts calendar days.
- Week boundary: Sunday `2026-10-04T21:30:00Z` (23:30 Warsaw) → `2026-09-28`; Monday `2026-10-04T22:30:00Z` (00:30 Warsaw, UTC date still Sunday) → `2026-10-05`; the year boundary (`2026-12-31` and `2027-01-03` → `2026-12-28`, `2027-01-04` → `2027-01-04`).
- Decay: `decayStreak(6,1)=3`, `(6,2)=1`, `(1,1)=0`, `(30,4)=1`, `(30,5)=0`, `(5,0)=5`, `(0,n)=0`, a huge `n` returns 0 without looping.
- Streak scenarios (daily, checked Mon–Wed = value 3): viewed Wednesday 3; viewed Thursday 3 (the open period is not missed); Friday 1; Saturday 0. Checked Mon–Thu (4), Friday missed, Saturday checked → 3. Weekly checked in three consecutive weeks: 3 in week 3, 3 in the open week 4, 1 in week 5, 0 in week 6.
- `once`: unchecked 0; any check-off 1 forever; several rows still 1.
- Input hygiene: unsorted and duplicate keys give the same result; non-Monday weekly keys snap to their Monday; keys after the current period are ignored until their period arrives.
- Optimistic equivalence: for a table of histories, `streakValue(snapshot, current, true/false)` equals the value recomputed from the full history with/without the current period (this is what keeps the island and the server in agreement).
- Ranking: totals 5, 5, 3 → positions 1, 1, 3 with the two fives alphabetical by e-mail; everybody at 0 → all position 1; the viewer is flagged; a member without any task is listed with 0; a participant who is not a member is not listed; `buildBoard` totals match hand-computed sums for a two-task, three-member example.
- Scale guard: `buildBoard` over 15 enrolments × 730 consecutive daily periods finishes within a deliberately generous bound (for example 250 ms; the single-pass fold needs a few milliseconds). It trips only on gross regressions such as a quadratic scan, so it is a guard, not a benchmark.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (the local Supabase stack must be running, the Vitest global setup reads it): `npm test`
- Linting passes: `npm run lint`
- Types check: `npx astro check`
- Project builds: `npm run build`

#### Manual Verification:

- Every expected value in the new unit tests can be derived from the PRD sentence and this plan without reading the implementation (check the oracle table at the top of the test files).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Check-off table, RLS and read view

### Overview

Add `task_checkoffs` and the aggregate view with their privilege model, regenerate the types, and prove the rules with SQL scenarios and Vitest integration tests. This phase may be driven test-first (scenarios and Vitest red, then the migration), as in S-02.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261002090000_create_task_checkoffs.sql` (new; use exactly this name: Phase 6 and the deployment note quote it, the repo hand-picks round stamps, and it sorts after the newest migration, `20261001120000_harden_table_privileges.sql`)

**Intent**: Create the fact table and the read view in the header-comment style of `20260930120000_create_tasks.sql`, documenting the decisions below.

**Contract**:
- Table `public.task_checkoffs(task_id uuid, user_id uuid, period date, checked_at timestamptz not null default now())`, primary key `(task_id, user_id, period)`, composite foreign key `(task_id, user_id)` references `public.task_participants (task_id, user_id)` `on delete cascade`. RLS enabled.
- Privileges: `revoke all ... from anon, authenticated`, then grant `authenticated` only `select`, `insert (task_id, user_id, period)` and `delete`; no update (`checked_at` comes from the default, as `joined_at` does).
- Policies (granular, `(select auth.uid())` initplan form): select when the task is visible to the caller (the `tasks` select policy applies inside the subquery, so visibility means current group membership); insert when `user_id` is the caller, the task is visible, and `period` lies between UTC today − 7 days and UTC today + 1 day (covers Warsaw being ahead of UTC and the Monday of the current week); delete when `user_id` is the caller.
- View `public.task_checkoff_periods` created `with (security_invoker = true)`: `task_id`, `user_id`, `array_agg(period order by period) as periods` from `task_checkoffs` grouped by `task_id, user_id`; `revoke all` from `anon, authenticated`, `grant select` to `authenticated`.
- Header comment: additive and unread by deployed code; enrolment is enforced by the foreign key, visibility and the period window by the insert policy; the period is app-computed and only bounded (trust-based per the PRD); leaving erases history by cascade.

#### 2. Generated types

**File**: `src/types.ts`

**Intent**: Regenerate from the local schema; do not hand-edit.

**Contract**: `npx supabase gen types typescript --local > src/types.ts` after the migration is applied; the diff adds the table and the view (view columns are generated as nullable).

#### 3. SQL RLS scenarios

**File**: `supabase/checks/rls-scenarios.sql`

**Intent**: Add an S-04 section in the existing `do $$ … $$` style with fresh users per scenario, and include the new table in the initplan check.

**Contract**: add `'task_checkoffs'` to both table lists of check `#6` (`:314,319`) and a `task_checkoffs_insert_self`/`task_checkoffs_delete_self` initplan assertion like `:322-327`; update the header comment and file title. Scenarios: an enrolled member checks off (1 row); the same period again → 23505; another period inside the window → 1 row; forged `user_id` → 42501; a group member who is not enrolled → 23503; a member of another group and a user without a group → 42501 on insert and no rows on select; anon → 42501 on insert and on select (table and view); a period older than the window or later than tomorrow (UTC) → 42501; sending `checked_at` → 42501 (column grant); `update` and `truncate` → 42501; every member (including the group owner) reads all check-offs of the group's tasks, outsiders read none; the same through `task_checkoff_periods` (one aggregated row per enrolment for members, no rows for outsiders, 42501 for anon); delete removes only the caller's own rows (0 rows for someone else's, even the group owner's); a ghost participation row of an ex-member cannot check off (task not visible → 42501); leaving the task, leaving the group, removal by the owner, deleting the task and deleting the group each remove the user's or the task's check-offs.

#### 4. Integration tests and helpers

**File**: `tests/integration/task-checkoffs.test.ts` (new), `tests/helpers/supabase.ts`

**Intent**: Prove the same model through real PostgREST sessions, following test-plan §6.2 (users in different groups, each denial paired with a positive control, state re-read through `adminClient()`).

**Contract**: helpers `checkOffAs(user, taskId, period)` (client insert returning the PostgREST result) and `adminCheckoffs(taskId)` (service-role rows) next to `joinTaskAs`; a small `utcDay(offset)` helper for period strings relative to now. Personas as in `tests/integration/task-participation.test.ts` (owner A, creator C, member M, other-group B, no-group X). Cover the same cases as the SQL scenarios at the API level, the view's array shape for members and its emptiness for outsiders, and the account-delete cascade.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local stack: `npx supabase db reset`
- Generated types contain the new table and view and the project builds: `grep -q task_checkoffs src/types.ts && grep -q task_checkoff_periods src/types.ts && npm run build`
- SQL RLS scenarios pass: `npm run test:rls`
- Integration tests pass: `npm test`
- Linting passes: `npm run lint`
- Types check: `npx astro check`

#### Manual Verification:

- Mutation check: remove `security_invoker = true` from the local view (or weaken `task_checkoffs_select_visible_task`), run `npm test` and see the outsider read tests fail, then restore with `npx supabase db reset`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Server layer — reads and the check-off / undo routes

### Overview

Give the dashboard its data and add the two write endpoints in both response modes, following the `join.ts`/`leave.ts` conventions, with smoke coverage of the boundaries and of the JSON outcomes.

### Changes Required:

#### 1. Check-off data layer

**File**: `src/lib/checkoffs.ts` (new), `src/lib/tasks.ts`

**Intent**: Keep Supabase access for check-offs in one place that the routes, the dashboard and the integration tests share; export the existing row-cap constant instead of duplicating it.

**Contract**:
- `listCheckoffPeriods(supabase): Promise<EnrolmentPeriods[]>` selects `task_id, user_id, periods` from `task_checkoff_periods`, drops rows whose generated-nullable columns are null, throws on a Supabase error or when the result reaches the PostgREST cap (same guard as `src/lib/tasks.ts:64-66`).
- `type CheckoffOutcome = { kind: "ok"; period: PeriodKey } | { kind: "forbidden" } | { kind: "unknown"; error: unknown }`.
- `checkOff(supabase, userId, task: GroupTask, now): Promise<CheckoffOutcome>` computes `periodKeyFor(task.recurrence, now)` and inserts `{ task_id, user_id, period }`; `23505` (already ticked) → ok; `23503` (not enrolled, or left meanwhile) and `42501` → forbidden; anything else → unknown.
- `uncheck(supabase, userId, task, now)` deletes the caller's rows for the task, filtered to the current period unless the task is `once`, with `.select("period")`; zero rows is a quiet ok (idempotent); errors map as above. Both functions return the current period.

#### 2. Routes

**File**: `src/pages/api/tasks/checkoff.ts`, `src/pages/api/tasks/uncheck.ts` (new), `src/lib/checkoff-response.ts` (new)

**Intent**: One route per action with two response modes: a form POST ends in a 302 like Join/Leave (works without JavaScript), a `fetch` that sends `Accept: application/json` gets a JSON answer the island can act on.

**Contract**:
- `export const prerender = false`; POST only (a GET answers 404 like the other task routes); same preamble as `join.ts` (signed-out → `/auth/signin`, `normalizeUuid(form.get("task_id"))`, null client); the task comes from `getTask` (RLS hides other groups and deleted tasks); one outer try/catch logs and answers unknown.
- Redirect mode: invalid id → `/dashboard?error=forbidden`; null client → `?error=not_configured`; task not visible → quiet `/dashboard`; ok → `/dashboard`; forbidden → `?error=forbidden`; unknown → `?error=unknown`.
- JSON mode (request `Accept` includes `application/json`): ok → `200 {"ok":true,"period":"YYYY-MM-DD"}`; invalid id → 400, null client → 503, task not visible → 404 (`"error":"gone"`), forbidden → 403, unknown → 500, each `{"ok":false,"error":"<code>"}`; every JSON answer carries `Cache-Control: no-store`.
- The request body is read only with `formData()`; the helper `checkoff-response.ts` maps a route result to either response shape so the two routes do not duplicate it. `/api/tasks` is already protected by the middleware.

#### 3. Integration tests of the data layer

**File**: `tests/integration/task-checkoff-flow.test.ts` (new)

**Intent**: Exercise `checkOff`, `uncheck` and `listCheckoffPeriods` with real user clients against the local stack (no mocks), including outcome mapping and `once` semantics.

**Contract**: enrolled member ticks (ok, period equals `periodKeyFor` for the same instant); repeat tick is ok and leaves one row; non-enrolled member → forbidden with no row; outsider and a member who left the task → forbidden; `uncheck` removes only the current period's row for `daily`/`weekly` and all rows for `once`; a second `uncheck` is ok; the view read returns the sorted periods per enrolment for members and nothing for outsiders; leaving the task erases the rows.

#### 4. Smoke boundary and JSON-outcome steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover the new routes' boundaries with the existing loops and assert the JSON-mode outcomes with an oracle that is independent of the app code.

**Contract**: add an optional `headers` argument to `request()` (for `Accept`) and an optional response-header expectation to the step runner (header name, required substring, case-insensitive); add `checkoff` and `uncheck` to the anonymous-302 and foreign-Origin-403 loop (`:303-315`), malformed-id steps (`:326-345` style → `?error=forbidden`) and GET-404 steps (`:346-349` style). The loop sends no `Accept` header, so add JSON-mode boundary steps for each route: foreign Origin with `Accept: application/json` → 403, anonymous with `Accept: application/json` → 302 `/auth/signin` (the answer Phase 5 maps to `failed`), and a well-formed unknown task id (a fresh UUID, like the join step at `:907-916`) → quiet 302 `/dashboard` in redirect mode and 404 with `"error":"gone"` in JSON mode. Place new JSON-mode steps after the join steps (task exists, B enrolled, C a member who never joined the task): malformed id → 400 with `"error":"invalid"`; B's JSON tick → 200 with `"ok":true`, `Cache-Control: no-store` and a `period` equal to the Warsaw date the script computes itself with `Intl` (computed before and after the request and either accepted, so a tick at midnight cannot flake); a repeated tick → 200 with the same period; C's tick → 403 with `"error":"forbidden"` and `Cache-Control: no-store`; B's JSON undo → 200; a repeated undo → 200. The steps leave no net state behind (B's tick is undone) so later steps are unaffected. Scripts lint note: the ESLint config for `scripts/**/*.mjs` declares only `console`, `process`, `fetch` and `URLSearchParams` as globals (`eslint.config.js:76`); `Intl` and `Date` are fine, but `URL`, `Headers`, `AbortSignal` or `setTimeout` need a global added to that config first.

### Success Criteria:

#### Automated Verification:

- Integration tests pass (including the check-off flow against real clients): `npm test`
- Linting passes: `npm run lint`
- Project builds with the new routes: `npm run build`
- Smoke test passes against the local stack (boundaries and JSON-mode outcomes): `npm run smoke`
- Types check: `npx astro check`

#### Manual Verification:

- In a signed-in browser session, `fetch("/api/tasks/checkoff", { method: "POST", headers: { Accept: "application/json" }, body: new URLSearchParams({ task_id }) })` for a task you joined answers `{"ok":true,"period":"<today in Warsaw>"}`, and a second identical call answers the same period.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Dashboard — server-rendered check-off controls, streaks and leaderboard

### Overview

Show the check-off control and the viewer's streak on every task the viewer takes part in, and the Leaderboard card under Tasks, all rendered by the server with plain forms (no client directive yet). This is a complete feature without JavaScript, and the seam Phase 5 builds on.

### Changes Required:

#### 1. Concurrent data loading and board

**File**: `src/pages/dashboard.astro`

**Intent**: Load the group's members, tasks, participants and check-off periods concurrently after `getMyGroup` so the extra read does not make the page slower, then compute the board once per request.

**Contract**: replace the sequential awaits at `:39-58` with a `Promise.allSettled` over the four reads, preserving today's failure semantics: a members failure still reaches the outer catch (`loadFailed`), a tasks failure sets `tasksFailed`, a participants failure sets `participantsFailed` (also when tasks failed, the result is then ignored), and a new check-off failure sets `checkoffsFailed`; each logged with `console.error` like the existing blocks. With `now = new Date()`, call `buildBoard` and `rankStandings` inside their own `try/catch` (the slice's riskiest code must not take the page down): a throw is logged with `console.error` and handled like a check-off load failure (`checkoffsFailed`), and never reaches the outer catch, which would set `loadFailed` and hide Members and group management against the page's rule that secondary data must not hide task management (`:50`); the Leaderboard and the controls render only when tasks, participants and check-offs all loaded and the board was computed; when check-offs failed, a short note inside the Tasks card says scores are unavailable and to reload (like `:265-267`).

#### 2. Check-off control in the task row

**File**: `src/components/tasks/CheckoffControl.tsx` (new), `src/pages/dashboard.astro`

**Intent**: Give a participating viewer a one-tap control and their streak on their own line of the task's `<li>`, for creators and non-creators alike.

**Contract**: the component renders without a `client:*` directive in this phase, from props `taskId, title, recurrence, snapshot, currentPeriod, viewerId`. Not checked: a `<form method="POST" action="/api/tasks/checkoff">` with a hidden `task_id` and a small `Button` "Mark done" (`aria-label` `Mark {title} as done`). Checked: a status element ("Done today" for daily, "Done this week" for weekly, "Done" for once) and a `<form method="POST" action="/api/tasks/uncheck">` with an outline "Undo" button (`aria-label` `Undo {title}`). For `daily` and `weekly` a "Streak" label element followed by an element whose only child is the number from `streakValue`; `once` shows no streak figure. It is placed after the participants line, inside the same `<li>`, only when the viewer is a participant.

#### 3. Leaderboard card

**File**: `src/components/tasks/Leaderboard.tsx` (new), `src/pages/dashboard.astro`

**Intent**: Show every member's total and position directly below the Tasks card.

**Contract**: props `rows: StandingInput[]` and `viewerId`; the component ranks internally with `rankStandings`. A `Card` with an `h2` "Leaderboard", a short description ("Total streak points in your group"), and `<ol aria-label="Leaderboard">`; each `<li>` holds the position, the e-mail (`break-all`, "Unknown member" fallback), the "You" pill styled like the Members card and the total, each in its own element. Rendered only when `showTasks` and participants and check-offs loaded.

#### 4. Warning copy

**File**: `src/pages/dashboard.astro`

**Intent**: Tell users that leaving erases streaks.

**Contract**: Leave-task dialog (`:246`) says the user's streak on the task is lost; Leave-group dialog (`:323`) and the owner's remove-member dialog (`:162`) say streaks in the group's tasks are lost. Do not introduce the phrases "Leave group", "Delete group" or "Rename group" into new copy (smoke `bodyExcludes` checks).

#### 5. Smoke outcome steps

**File**: `scripts/smoke.mjs`

**Intent**: Assert what the pages show after each action, with row-scoped helpers in the style of `taskRowWithForm`/`taskTargetInRow`.

**Contract**: new helpers: `taskRowWithCheckoffForm(title, route)` (row has the form), `taskRowStreak(title, n)` (the Streak label followed by the number in its own element), `leaderboardRow(email, position, total)` (a `<li>` inside `<ol aria-label="Leaderboard">`), and a fail-fast read of the task id from the check-off form (`taskTargetInRow`). The existing `memberRow` is anchored to the Members card (its match starts after the "Members" heading and may not cross the card's closing `</ul>`): the viewer's Leaderboard row also holds the e-mail followed by a "You" pill and would otherwise satisfy all seven `memberRow(viewer, "You")` positives (`scripts/smoke.mjs:428,468,517,539,664,700,720`). Steps, placed after the join/JSON steps and around the existing task leave and group-departure steps, each asserting the page state and `NO_ERROR_ALERT` absence:
- B (joined, nothing ticked): "Mark done" form carries the task id, streak 0, no uncheck form; the leaderboard lists A, B and C all at position 1 with 0.
- C (a member who never joined the task): no check-off or uncheck form in the task row; C's direct POST answers `?error=forbidden` and the leaderboard is unchanged.
- B ticks (302 `/dashboard`): B sees "Done", the Undo form and streak 1; the leaderboard shows B at position 1 with total 1 and A and C at position 2 with 0; A's dashboard shows B's total 1 (group-wide, after a reload); A's own row offers "Mark done".
- A repeated tick is a quiet redirect and the total stays 1.
- B undoes: "Mark done" again, streak 0, all totals 0 at position 1; a repeated undo is a quiet redirect.
- B ticks, then leaves the task: B's control and total are gone (0); after B joins again the row offers "Mark done" with streak 0 (history erased), proving the cascade; the same after B leaves the group and returns by invite.
- A short `once` block: A creates a `once` task, its row shows "Mark done" and no streak figure, a tick shows "Done" and raises A's total by 1, an undo lowers it back, then A deletes the task before the existing "No tasks yet" assertions.

### Success Criteria:

#### Automated Verification:

- Smoke test passes against the local stack (control, streak, leaderboard, undo, leave erases history): `npm run smoke`
- Integration tests still pass: `npm test`
- Linting passes: `npm run lint`
- Project builds: `npm run build`
- Types check: `npx astro check`

#### Manual Verification:

- With two signed-in users in one group: a joined task shows "Mark done" and a streak of 0; after ticking and reloading it shows "Done", "Undo" and 1; the Leaderboard lists both members; the other user sees the new total after a reload; undo returns the row and the total to 0.
- The Leave dialogs show the streak-loss warning, and after confirming a leave and a rejoin the streak starts from 0.
- The task row and the Leaderboard stay readable at a narrow (phone) width, and the controls are reachable by keyboard.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Instant check-off — optimistic island

### Overview

Hydrate the control and the leaderboard so a tap flips the row and re-ranks the board at once, with the request sent in the background and rolled back on failure. The server-rendered markup from Phase 4 stays as is, so smoke keeps passing and the no-JavaScript path keeps working.

### Changes Required:

#### 1. Shared delta store and client protocol

**File**: `src/lib/checkoff-sync.ts`, `src/lib/checkoff-client.ts`, `src/components/hooks/useCheckoffDeltas.ts` (new)

**Intent**: Let separate Astro islands share the viewer's optimistic score change, and keep the network protocol in a module that can be unit-tested without a DOM.

**Contract**:
- `checkoff-sync.ts`: a module-level store of net score delta per user id with `publishDelta(userId, delta)`, `subscribeDeltas(listener)` and a `deltasSnapshot()` that returns an immutable map replaced on every publish; net deltas rather than events, so an island that hydrates late still sees the right state. The hook wraps it in `useSyncExternalStore` with an empty map as the server snapshot.
- `checkoff-client.ts`: `sendCheckoff(action, taskId, expectedPeriod, fetchImpl = fetch)` POSTs `URLSearchParams({ task_id })` with `Accept: application/json`, `credentials: "same-origin"`, `redirect: "manual"` and `keepalive: true` (the request outlives a navigation right after the tap), bounded by an `AbortController` that a 15-second `setTimeout` aborts (`CHECKOFF_TIMEOUT_MS`, the bound of `PENDING_TIMEOUT_MS` in `src/components/hooks/useFormSubmitting.ts`; the timer is cleared in `finally`; not `AbortSignal.timeout`, which fake timers cannot drive), and returns `{ kind: "saved" }` (200 `ok` and the period matches, or `expectedPeriod` is null for `once`), `{ kind: "stale" }` (200 `ok` but a different period), `{ kind: "rejected" }` (403 or 404) or `{ kind: "failed" }` (network error, timeout, 5xx, opaque redirect from an expired session, non-JSON body); a retry after a false timeout is safe because both routes are idempotent.

#### 2. Optimistic control and live leaderboard

**File**: `src/components/tasks/CheckoffControl.tsx`, `src/components/tasks/Leaderboard.tsx`, `src/pages/dashboard.astro`

**Intent**: Make the tap instant for the person ticking, and keep the leaderboard consistent with the row.

**Contract**:
- Add `client:load` to both components in `dashboard.astro`.
- `CheckoffControl` keeps `checked` and `pending` in local state. On submit it prevents the native POST, computes the new value with `streakValue(recurrence, snapshot, currentPeriod, nextChecked)`, flips the row, publishes the difference as a delta for `viewerId`, then calls `sendCheckoff` (`/api/tasks/uncheck` when it was checked). `saved` keeps the state; `stale` reloads the page; `rejected` and `failed` roll back the row, publish the negative delta and show a short message ("Could not save. Try again." or "This task is no longer available. Reload the page.") in an element with `role="status"`. While a request is pending the button is disabled. Focus moves to the newly rendered button after each toggle (the previous one unmounts), as `EditTaskForm` does. Without JavaScript the forms from Phase 4 submit natively.
- `Leaderboard` reads the deltas through the hook, shows `total = server total + net delta` and re-ranks with `rankStandings`; with an empty store it renders exactly the server HTML.

#### 3. Unit tests

**File**: `tests/unit/checkoff-sync.test.ts`, `tests/unit/checkoff-client.test.ts` (new); extend `tests/unit/leaderboard-rules.test.ts`

**Intent**: Cover everything about the island that does not need a DOM.

**Contract**: store: net delta accumulates, a rollback returns it to zero, a subscriber added after a publish sees the net value, the snapshot identity changes only on publish; client protocol with an injected `fetch`: a 200 with the expected period is `saved`, a different period is `stale`, 403/404 are `rejected`, a thrown error, 500, an opaque-redirect-like response, a non-JSON body and a fetch that never settles (an injected fetch that rejects when its `signal` aborts, fake timers advanced past 15 s) are `failed`, a `once` task accepts any period, the request is urlencoded with the `Accept` header and `keepalive`; ranking: base totals plus a viewer delta re-rank to the same result as recomputing the totals from scratch.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (store and client protocol included): `npm test`
- Linting passes: `npm run lint`
- Types check: `npx astro check`
- Project builds: `npm run build`
- Smoke test still passes against the local stack: `npm run smoke`

#### Manual Verification:

- Tapping "Mark done" flips the row to "Done" and updates the viewer's streak and the Leaderboard at once, with no page reload; reloading shows the same state; "Undo" reverses both.
- With the browser set to offline, a tap rolls the row and the Leaderboard back and shows a short message; with "Slow 3G" throttling the tap still feels instant.
- With JavaScript disabled in the browser, the same buttons work through the full-page POST.
- On a phone-width viewport and by keyboard, focus lands on the new button after each toggle and nothing jumps.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 6: Docs and production release

### Overview

Bring the documentation in line with the slice and close it per the project's release rule: merge, approve the gated release that applies the migration, check production, and record it.

### Changes Required:

#### 1. Documentation

**File**: `README.md`, `CLAUDE.md` (`AGENTS.md` is a symlink to it), `context/foundation/test-plan.md`

**Intent**: Keep the repo's own descriptions true after the slice.

**Contract**: README: add `POST /api/tasks/checkoff` and `/uncheck` (field `task_id`, form and JSON modes, both idempotent) to the Task routes table (`:170-180`); add `task_checkoffs` and the view to the RLS scenario paragraph (`:182-190`); mention the check-off steps in the Smoke test paragraph (`:258-269`) and the streak-rule unit tests in Tests (`:271-282`). `CLAUDE.md` (one edit; `AGENTS.md` is a symlink to it): add `checkoff,uncheck` to the `src/pages/api/tasks/*` list (line 11) and `task_checkoffs` plus the `task_checkoff_periods` view to the schema sentence (line 25). `test-plan.md`: §3 Phase 4 row shipped by this change with its change folder, §5 gate `unit (streak rule)` wired, §6.1 gets the pattern (a pure function, an injected instant, an oracle table written from the PRD), and a §6.6 note of what surprised; also the header's "Last updated" line (`:9`), the first Freshness Ledger line (`:182`) and the unit + integration stack row (`:100`), which names only `tests/integration/`.

#### 2. Release and record

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the release of S-04 the way earlier slices were recorded.

**Contract**: a new phase entry with the date, the applied migration `20261002090000_create_task_checkoffs.sql`, the `release` run, the production check result, and the CPU time read for `/dashboard`. The migration is additive and backward compatible (see Critical Implementation Details), so the release job's order (migrations, then Worker) is safe; it lands on `master` with the Phase 2 merge and may go out with a later run, as in S-03.

### Success Criteria:

#### Automated Verification:

- Linting and build pass with the documentation changes: `npm run lint && npm run build`
- The required `integration` check is green on the PR to `master`: `gh pr checks`
- Types check: `npx astro check`

#### Manual Verification:

- After the Phase 5 merge, confirm `master` contains `supabase/migrations/20261002090000_create_task_checkoffs.sql`, then approve the `release` run in the GitHub `production` environment and read the `migration list` and `db push` output.
- On the production URL, two members check off, see the totals update instantly, reload to confirm the state persisted, undo, and see the leave warning; on a phone the tap feels instant.
- The date, applied migration, release run and result are noted in `context/changes/deployment/deployment-plan.md`.
- On production, read the CPU time of a `/dashboard` request for a group with several tasks (Workers Logs; observability is enabled in `wrangler.jsonc`) and note it with the Workers plan's CPU limit in `context/changes/deployment/deployment-plan.md`; investigate if it is close to the limit.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `streak-rules` and `leaderboard`: day and week boundaries incl. DST days and the year boundary, decay values, open versus missed periods, `once`, input hygiene, optimistic equivalence, ranking with shared positions, a scale guard.
- `checkoff-sync` and `checkoff-client`: net deltas, rollback, late subscribers, response classification, request shape.

### Integration Tests:

- `tests/integration/task-checkoffs.test.ts`: RLS and grants through real sessions (member, outsider, no-group, anon, ghost row), the view's group scoping, cascades.
- `tests/integration/task-checkoff-flow.test.ts`: `checkOff`, `uncheck` and `listCheckoffPeriods` with real clients, outcome mapping, `once` semantics.
- SQL scenarios in `supabase/checks/rls-scenarios.sql` mirror these at the database level, including the initplan check for the new table.
- Smoke (`scripts/smoke.mjs`): boundaries for both routes in both modes, JSON outcomes with an independent Warsaw-date oracle, and page-state assertions for tick, repeat, undo, a non-participant, leave erasing history and a `once` task.

Where each settled term is proven:

| Settled term | Proven by |
| --- | --- |
| Day boundary at Warsaw midnight, DST days | unit: day-boundary and DST tests; smoke JSON period oracle |
| Week starts Monday | unit: week-boundary tests |
| Decay = halve, rounded down | unit: decay table and streak scenarios |
| Open period is not missed | unit: viewed-Thursday scenario |
| `once` adds 1, never decays | unit + smoke `once` block |
| Equal totals share the position | unit: ranking tests; smoke leaderboard rows |
| Undo only the current period | integration (`uncheck`) + smoke undo steps |
| Leaving erases history | SQL scenarios + integration + smoke |
| Instant check-off | Phase 5 manual verification + client protocol and delta unit tests |

### Manual Testing Steps:

1. Two users in one group, a daily task both joined: tick as the first, see the row and the Leaderboard change at once, reload, confirm.
2. As the second user reload and see the first user's total; tick, undo, tick again.
3. Leave the task with the dialog, join again, confirm the streak is 0; repeat with leaving the group.
4. Set the browser offline and tap: the row and the Leaderboard roll back with a message.
5. Repeat the walk-through once on production after the release, on a phone.

## Performance Considerations

The dashboard now makes one concurrent batch of four reads after `getMyGroup` instead of four sequential ones, so the page should not be slower than today even with the new read. The view returns one row per enrolment with a date array (about 5 KB per enrolment-year); the streak computation is linear in the number of periods and runs for every enrolment on every load. A literal implementation of the Phase 1 contract measured about 1.5 µs per stored period in warm Node (about 6–8 ms for 15 enrolments × 365 periods, 16–28 ms for 50 × 365), against a 10 ms CPU budget per invocation if the Worker is on the Workers Free plan (`context/foundation/infrastructure.md:31,92`; `wrangler.jsonc` sets no `limits.cpu_ms`). The single-pass fold specified in Phase 1 was about 9× cheaper in a prototype (about 0.6 ms and 2 ms), and Phase 6 reads the real CPU time of `/dashboard` from Workers Logs. The cap guard throws at 1000 enrolments, far above the target scale; snapshots are the future answer if arrays grow. Measured on the implemented Phase 1 (Node 24, not workerd; see `reviews/impl-review-phase-1.md`): about 200 ns per stored period warm (15 enrolments × 365 periods about 1 ms, 50 × 365 about 3–4 ms) and 3.8–4.7 ms or 7.4–9 ms on the first call in a fresh process, so the saving over the literal reading is about 5.5× rather than 9×. The fold keeps one numeric array of the parsed days (two loops) so that it can stop at the first future key even when the input is unsorted.

Measured on the implemented Phase 2 view (local Postgres 17; 20 groups × 5 members × 3 daily tasks × 365 periods = 109,500 rows, of which the viewer's group holds 5,475): the RLS policy adds nothing, because the planner turns its `EXISTS` into a hashed subplan, so the `tasks` policy runs once per task and not once per check-off. What costs is the table scan: an unfiltered read of `task_checkoff_periods` visits the rows of every group, 17–44 ms here (about 50 ms with RLS off) and linear in the whole table, against about 6 ms when the read reaches only the viewer's group. This is database time, not Worker CPU, and it is negligible for a handful of groups, so the view keeps the shape fixed above. If Phase 6 shows the `/dashboard` read growing with the number of groups (the view read is database time and does not count as Worker CPU, so read the wall time of `/dashboard` in Workers Logs next to its CPU time), the additive fix is `create or replace view public.task_checkoff_periods` with a join to `tasks` and `t.group_id` as a last column, keeping `task_id`, `user_id` and `periods` as the first three columns and restating `with (security_invoker = true)` (a replace resets the view's options; without the clause the view would run with its owner's rights and show every group, while the grants are kept), so that Phase 3 can read `.eq("group_id", group.id)` with the group id known right after `getMyGroup` and the four reads stay concurrent.

## Migration Notes

Additive migration (a table and a view); no backfill because no check-offs exist yet. Rollback of the schema is not supported (per the release lesson); the code can be rolled back with `npx wrangler rollback`, and an older Worker simply ignores the new objects.

## References

- Related research: `context/changes/checkoff-and-leaderboard/research.md`
- Similar implementation: `supabase/migrations/20261001090000_create_task_participants.sql:26-65` (table, grants, policies), `src/pages/api/tasks/join.ts:9-48` (route template), `src/lib/tasks.ts:49-68` (capped read), `src/lib/task-rules.ts:36-44` (pure grouping), `supabase/checks/rls-scenarios.sql:627-790` (S-03 scenarios), `tests/integration/task-participation.test.ts` (personas and denial pairs), `scripts/smoke.mjs:303-315` (boundary loop), `src/components/tasks/EditTaskForm.tsx:24-28` (focus management)
- PRD: `context/foundation/prd.md:36-37,41-45,80-89,93-99,107` (guardrails, US-01, FR-008/FR-009, NFR, Business Logic, permissions); roadmap item S-04 (`context/foundation/roadmap.md:116-127`); `context/foundation/test-plan.md:42-49,67,82,87-89,126` (risk #4, Phase 4); `context/foundation/tech-stack.md:24`
- Earlier slices: `context/archive/2026-10-01-task-join-and-leave/plan.md:32-34` and `context/archive/2026-09-30-task-create-and-manage/plan.md:33,47` (decisions pushed to S-04)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Streak rule and leaderboard logic (pure TypeScript, test-first)

#### Automated

- [x] 1.1 Unit tests pass (the local Supabase stack must be running, the Vitest global setup reads it): `npm test` — c435901
- [x] 1.2 Linting passes: `npm run lint` — c435901
- [x] 1.3 Types check: `npx astro check` — c435901
- [x] 1.4 Project builds: `npm run build` — c435901

#### Manual

- [x] 1.5 Every expected value in the new unit tests can be derived from the PRD sentence and this plan without reading the implementation (check the oracle table at the top of the test files). — c435901

### Phase 2: Check-off table, RLS and read view

#### Automated

- [x] 2.1 Migration applies cleanly on a fresh local stack: `npx supabase db reset` — 4fcfdc3
- [x] 2.2 Generated types contain the new table and view and the project builds: `grep -q task_checkoffs src/types.ts && grep -q task_checkoff_periods src/types.ts && npm run build` — 4fcfdc3
- [x] 2.3 SQL RLS scenarios pass: `npm run test:rls` — 4fcfdc3
- [x] 2.4 Integration tests pass: `npm test` — 4fcfdc3
- [x] 2.5 Linting passes: `npm run lint` — 4fcfdc3
- [x] 2.7 Types check: `npx astro check` — 4fcfdc3

#### Manual

- [x] 2.6 Mutation check: remove `security_invoker = true` from the local view (or weaken `task_checkoffs_select_visible_task`), run `npm test` and see the outsider read tests fail, then restore with `npx supabase db reset`. — 4fcfdc3

### Phase 3: Server layer — reads and the check-off / undo routes

#### Automated

- [x] 3.1 Integration tests pass (including the check-off flow against real clients): `npm test` — 05cc307
- [x] 3.2 Linting passes: `npm run lint` — 05cc307
- [x] 3.3 Project builds with the new routes: `npm run build` — 05cc307
- [x] 3.4 Smoke test passes against the local stack (boundaries and JSON-mode outcomes): `npm run smoke` — 05cc307
- [x] 3.6 Types check: `npx astro check` — 05cc307

#### Manual

- [x] 3.5 In a signed-in browser session, `fetch("/api/tasks/checkoff", { method: "POST", headers: { Accept: "application/json" }, body: new URLSearchParams({ task_id }) })` for a task you joined answers `{"ok":true,"period":"<today in Warsaw>"}`, and a second identical call answers the same period. — 05cc307

### Phase 4: Dashboard — server-rendered check-off controls, streaks and leaderboard

#### Automated

- [x] 4.1 Smoke test passes against the local stack (control, streak, leaderboard, undo, leave erases history): `npm run smoke` — e4c7b18
- [x] 4.2 Integration tests still pass: `npm test` — e4c7b18
- [x] 4.3 Linting passes: `npm run lint` — e4c7b18
- [x] 4.4 Project builds: `npm run build` — e4c7b18
- [x] 4.8 Types check: `npx astro check` — e4c7b18

#### Manual

- [x] 4.5 With two signed-in users in one group: a joined task shows "Mark done" and a streak of 0; after ticking and reloading it shows "Done", "Undo" and 1; the Leaderboard lists both members; the other user sees the new total after a reload; undo returns the row and the total to 0. — e4c7b18
- [x] 4.6 The Leave dialogs show the streak-loss warning, and after confirming a leave and a rejoin the streak starts from 0. — e4c7b18
- [x] 4.7 The task row and the Leaderboard stay readable at a narrow (phone) width, and the controls are reachable by keyboard. — e4c7b18

### Phase 5: Instant check-off — optimistic island

#### Automated

- [x] 5.1 Unit tests pass (store and client protocol included): `npm test`
- [x] 5.2 Linting passes: `npm run lint`
- [x] 5.3 Types check: `npx astro check`
- [x] 5.4 Project builds: `npm run build`
- [x] 5.5 Smoke test still passes against the local stack: `npm run smoke`

#### Manual

- [x] 5.6 Tapping "Mark done" flips the row to "Done" and updates the viewer's streak and the Leaderboard at once, with no page reload; reloading shows the same state; "Undo" reverses both.
- [x] 5.7 With the browser set to offline, a tap rolls the row and the Leaderboard back and shows a short message; with "Slow 3G" throttling the tap still feels instant.
- [x] 5.8 With JavaScript disabled in the browser, the same buttons work through the full-page POST.
- [x] 5.9 On a phone-width viewport and by keyboard, focus lands on the new button after each toggle and nothing jumps.

### Phase 6: Docs and production release

#### Automated

- [ ] 6.1 Linting and build pass with the documentation changes: `npm run lint && npm run build`
- [ ] 6.2 The required `integration` check is green on the PR to `master`: `gh pr checks`
- [ ] 6.7 Types check: `npx astro check`

#### Manual

- [ ] 6.3 After the Phase 5 merge, confirm `master` contains `supabase/migrations/20261002090000_create_task_checkoffs.sql`, then approve the `release` run in the GitHub `production` environment and read the `migration list` and `db push` output.
- [ ] 6.4 On the production URL, two members check off, see the totals update instantly, reload to confirm the state persisted, undo, and see the leave warning; on a phone the tap feels instant.
- [ ] 6.5 The date, applied migration, release run and result are noted in `context/changes/deployment/deployment-plan.md`.
- [ ] 6.6 On production, read the CPU time of a `/dashboard` request for a group with several tasks (Workers Logs; observability is enabled in `wrangler.jsonc`) and note it with the Workers plan's CPU limit in `context/changes/deployment/deployment-plan.md`; investigate if it is close to the limit.
