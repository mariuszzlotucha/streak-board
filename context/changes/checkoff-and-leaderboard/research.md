---
date: 2026-10-01T03:19:58+02:00
researcher: Claude (Sonnet 5.5) for Mariusz Złotucha
git_commit: 1889cd0c2681776b7394b5126fe94b50fef0c14d
branch: s-04/checkoff-and-leaderboard/plan
repository: 10xDevs
topic: "checkoff-and-leaderboard (S-04, FR-008/FR-009, US-01): what the schema, API, UI, tests and earlier decisions give check-off, streaks and the group leaderboard, and what /10x-plan must still decide"
tags:
  [
    research,
    codebase,
    checkoff,
    leaderboard,
    streak,
    tasks,
    rls,
    supabase,
    dashboard,
    time-semantics,
    checkoff-and-leaderboard,
  ]
status: complete
last_updated: 2026-10-01
last_updated_by: Claude (Sonnet 5.5)
---

# Research: checkoff-and-leaderboard

**Date**: 2026-10-01T03:19:58+02:00
**Researcher**: Claude (Sonnet 5.5) for Mariusz Złotucha
**Git Commit**: 1889cd0c2681776b7394b5126fe94b50fef0c14d
**Branch**: s-04/checkoff-and-leaderboard/plan
**Repository**: 10xDevs

## Research Question

The change has no stated question (`change.md` Notes are empty), so it is taken from the roadmap entry S-04 (`context/foundation/roadmap.md:116-127`) and from FR-008, FR-009, US-01, the Business Logic section, the Guardrails and the NFR of the PRD (`context/foundation/prd.md:36-37,41-45,80-89,93-99`): a user who is enrolled in a task checks off an occurrence as done and immediately sees the updated score on their group's leaderboard. What do the schema, RLS, server layer, UI, tests, release path and earlier decisions already give that slice, what is missing, and which choices must `/10x-plan` make?

How this was gathered: four read-only sub-agents (data layer; server layer with time semantics, smoke and CI; UI layer; prior decisions) reported file:line anchors, and the researcher re-read the sources behind the anchors this document leans on most (migrations, `dashboard.astro`, `src/lib/{tasks,task-rules,task-errors,groups}.ts`, `join.ts`, `leave.ts`, `middleware.ts`, `astro.config.mjs`, `ci.yml`, the README release section, `smoke.mjs` lines 1-190 and 296-360, `tests/helpers/supabase.ts`, the PRD, roadmap, shape-notes, test plan, tech-stack and the S-02/S-03 plan briefs). A claim that was not re-read is tagged "(sub-agent)". "Inference" marks a conclusion that is not observed directly. Nothing was run: no tests, build, server or database.

## Summary

- **Nothing for check-offs, streaks or a leaderboard exists yet.** Scope searched by the sub-agents' greps: all of `supabase/`, `src/` (including `src/types.ts`), `tests/`, `scripts/`, `.github/`, for completion, check-off, streak, score, leaderboard, occurrence, period and rank; the `git ls-files` listing shows no check-off or leaderboard route, and the 6 migrations create no such table. The only hit is a comment at `supabase/migrations/20260930120000_create_tasks.sql:6-7`. The public schema has 4 tables (`group_members`, `groups`, `task_participants`, `tasks`; `src/types.ts:31,60,84,110`), no views, no enums and 4 functions (`src/types.ts:146-165`).
- **The inputs exist; the time model does not.** A streak computation could read the recurrence kind (`tasks.recurrence` in once/daily/weekly, immutable for clients: `…create_tasks.sql:23,26,40`), who is enrolled (`task_participants`, `…create_task_participants.sql:26-33`) and the group's members (`list_group_members`, `…add_group_member_list_and_preview.sql:10-31`). It cannot yet tell what a "day" or a "week" is: on the inspected tree there is no `Date`, `Intl` or timezone code in `src/` (own grep), no `current_date`, `date_trunc`, `at time zone`, `isoweek`, `extract` or `timezone` in `supabase/**/*.sql|*.toml` except one comment (own grep), no timezone, `tz` or locale column in `src/types.ts` (own grep of the whole file) and no week-start definition in the repo documents searched (sub-agent).
- **Four decisions were pushed to S-04 and none is settled.** What leaving or rejoining does to history and streak (`context/archive/2026-10-01-task-join-and-leave/plan.md:32`); what defines a "day" (`context/archive/2026-09-30-task-create-and-manage/plan.md:33`, `research.md:125`); the decay value (`roadmap.md:124-125`); and whether deleting a task cascades onto completions (`…task-create-and-manage/research.md:127`; S-03 review F5 was skipped on that ground, `…task-join-and-leave/reviews/impl-review-phase-1.md:79-87`).
- **The write path is a native form POST, a 302 and a full page reload.** In `src/` an own grep for `fetch(`, `useOptimistic`, `useTransition`, `useActionState`, `ClientRouter`, `<script`, `new Response`, `Response.json` and `.json()` returned no match, all 14 `client:` directives are `client:load`, and `join.ts`/`leave.ts` end every outcome in `context.redirect(...)`. The "no noticeable delay" guardrail (`prd.md:37`) is therefore met today only by a full round trip (POST, 302, then `GET /dashboard` with 4 sequential data calls, `dashboard.astro:39-52`); latency is unmeasured and the test plan excludes immediacy from testing (`test-plan.md:57-58,178`).
- **Astro's built-in Origin check applies to form-like and content-type-less requests, not to JSON.** `checkOrigin` defaults to `true` in Astro 7.3.2 (`node_modules/astro/dist/core/config/schemas/defaults.js:44`; `astro.config.mjs` has no `security` key) but rejects only non-safe requests whose content-type is form-like (urlencoded, multipart, text/plain) or missing and whose Origin differs (`…/core/app/origin-check.js:2-22`); a `Content-Type: application/json` POST passes it. _Inference:_ a JSON/fetch endpoint for an instant check-off would be the first non-GET route outside that protection (GET is exempt by design, `origin-check.js:7,12-14`).
- **The UI has no slot for the leaderboard and no tabs.** `dashboard.astro` is one server-rendered English column of cards (`:109`, `:117-388`); `<nav|tablist|role="tab|Tabs` has no match in `src/` (own grep), while the PRD names two tabs, "Zadania" and "Tablica wyników" (`prd.md:29,99`). A check-off control would sit in the task `<li>` (`dashboard.astro:191-260`). `src/components/ui/` holds alert, alert-dialog, button, card, input, label and `LibBadge.astro` (own `ls`); `--success|--warning|--info` tokens do not exist in `src/styles/global.css` (own grep).
- **Smoke and CI constrain new markup and routes.** `scripts/smoke.mjs` row regexes scan from `<li>` to the first `</li>` (`:81-183`); `NO_ERROR_ALERT = 'role="alert"'` (`:206`) is referenced on 31 other lines and `Alert` hard-codes that attribute (`src/components/ui/alert.tsx:22`), so _inference:_ an `Alert`-based success or info message would fail those steps. The five task POST routes (`create`, `update`, `delete`, `join`, `leave`) are each covered by the anonymous and foreign-Origin loop at `:303-315`.
- **Release is gated and migrations must be additive.** `release` runs after `ci`, `smoke` and `integration` on pushes to `master`, behind approval in the `production` environment: build, then `supabase db push --yes`, then `wrangler deploy` (`.github/workflows/ci.yml:81-150`; `README.md:196-225`). A new completions table fits that rule; triggers on existing tables do not count as additive (S-03 review F3, `…task-join-and-leave/reviews/impl-review.md:69-77`).

## Detailed Findings

### 0. Requirements as written

- **FR-008** (must-have): the user marks an occurrence of a task as done; trust-based, no verification (`prd.md:80-83,113`). Self only: members "odznaczać własną realizację" (`prd.md:107`; `shape-notes.md:59`). Only a task the user is enrolled in (US-01 Given, `prd.md:43`).
- **FR-009** (must-have): the user sees the leaderboard of their own group (`prd.md:85-89`); data is visible only to the user's own group (`prd.md:36`).
- **US-01 Then**: "task jest oznaczony jako zrealizowany na dziś, a wynik jest natychmiast widoczny w tablicy wyników grupy" (`prd.md:45`).
- **Business Logic** (`prd.md:97-99`): +1 per day/period in which the user completes an assigned task; for each missed day/period the streak drops by "a value smaller than its full state" (not to zero); the sum of a user's streaks decides the leaderboard position. Input: whether the task was checked off in its period (day or week). Output: streak per task and sum per user, seen right after check-off and on the "Tablica wyników" tab.
- **Guardrails/NFR/Non-goals**: instant check-off (`prd.md:37`); key actions fully usable on a phone (`prd.md:93`); decay is a fixed rule, no anti-cheat, no offline, one group per user (`prd.md:111-114`).
- **Roadmap**: S-04 outcome and risk at `roadmap.md:118,126`; the only listed unknown is the decay value, owner user, not blocking, `/10x-plan` may default it (`roadmap.md:124-125`).

### 1. Data layer (what a completions table would sit next to)

- **Tables.** `groups` (`…create_groups_and_group_members.sql:11-19`), `group_members` with `user_id UNIQUE` so a user is in at most one group (`:21-26`, header `:4-5`), `tasks` (`…create_tasks.sql:18-27`), `task_participants` (`…create_task_participants.sql:26-33`). The 4 temporal columns across the 4 tables are `timestamptz not null default now()` (`…groups_and_group_members.sql:18,25`, `…create_tasks.sql:24`, `…create_task_participants.sql:29`).
- **Recurrence.** `tasks.recurrence text not null` with CHECK `in ('once','daily','weekly')` (`…create_tasks.sql:23,26`); it is not an enum (`src/types.ts:116`). `tasks` has no anchor date, weekday or timezone column (`:18-27`); `created_at` is its only temporal column. The client has no UPDATE grant on `recurrence` (`…create_tasks.sql:38-40`), so cadence changes mean delete and recreate. The header records the intent that streaks are "computed on read from timestamps" (`:6-7`).
- **Participation.** One row per `(task_id, user_id)` with `joined_at` (`…create_task_participants.sql:26-31`); both foreign keys cascade (`:27-28`). Leaving is a hard `DELETE` of the caller's own row (`:63-65`), there is no `left_at` and no UPDATE grant (`:41-44`). The creator is enrolled by an AFTER INSERT trigger on `tasks` (`:72-90`); a trigger on `group_members` delete clears the departing user's participation in that group's tasks (`:95-116`); a rejoin does not restore it (S-03 plan, `…task-join-and-leave/plan.md:34`).
- **Ghost participation.** The migration documents an accepted race in which a join committing while the user leaves the group can leave a participation row for a non-member; the group still sees it, the ex-member does not (`:15-20`). _Inference:_ a score computed from `task_participants` alone could count a non-member unless it is filtered by current group membership.
- **RLS and grants (pattern to copy).** `tasks`: SELECT for group members, INSERT creator and member, UPDATE/DELETE creator and current member (`…create_tasks.sql:48-63`), client INSERT limited to `group_id, created_by, title, recurrence` and UPDATE to `title` (`:37-40`). `task_participants`: `revoke all … from anon, authenticated` first, then SELECT, INSERT(`task_id, user_id`), DELETE (`:41-44`); policies SELECT when the task is visible, INSERT for self and a visible task, DELETE own (`:52-65`). `is_group_member(uuid)` answers only for the caller (`…harden_group_rls.sql:35-51`). Policies use `(select auth.uid())`, enforced by a check over a hard-coded table list (`supabase/checks/rls-scenarios.sql:313-320`). `…harden_table_privileges.sql:19-26` revokes TRUNCATE, REFERENCES and TRIGGER from `authenticated` on `groups`, `group_members` and `tasks`; it does not cover `task_participants`, which starts from nothing (`…create_task_participants.sql:39-41`).
- **Identity available to a leaderboard.** Clients cannot read `auth.users` (`…add_group_member_list_and_preview.sql:3`); `list_group_members(p_group_id)` returns `user_id, email, joined_at, is_owner` for members of the caller's group only (`:10-31`; `src/lib/groups.ts:35-40`). The 4 public tables hold user ids only (`src/types.ts:31,60,84,110`; no profile or display-name table), so the email from that function is the only member identity a client can read.
- **Delete and account lifecycle.** Deleting a group cascades to its tasks and members (`…create_tasks.sql:20`, `…groups_and_group_members.sql:23`); deleting a task cascades to its participation rows (`…create_task_participants.sql:27`); `groups.owner_id` is `on delete restrict` (`…groups_and_group_members.sql:15`). Test cleanup deletes groups before users (`tests/helpers/supabase.ts:124-139`) and notes that tasks vanish through cascades (`:77-78`); the S-02 plan records that a `restrict` foreign key from `tasks.created_by` would break `auth.admin.deleteUser` cleanup (`…task-create-and-manage/plan.md:24`).
- **Test pattern for a new table (sub-agent for test bodies, re-read for helpers and SQL list).** Migration, regenerated `src/types.ts`, SQL scenarios in `supabase/checks/rls-scenarios.sql` (S-02 section `:535`, S-03 section `:628`, table lists at `:314,319`), a Vitest helper and integration test using two users in different groups, each denial paired with a positive control and re-read through `adminClient()` (`tests/helpers/supabase.ts:25,79-108`; `test-plan.md:139-143,151-153,167`).

### 2. Server layer

- **Pure versus IO.** `src/lib/task-rules.ts` is browser-safe by contract (`:1-2`) and holds `TASK_RECURRENCES` (`:8`), `RECURRENCE_LABELS` (`:12-16`) and `groupParticipantsByTask` (`:36-44`); it is the only `src/lib` module with a unit test file (`tests/unit/task-rules.test.ts`; `git ls-files tests` shows no other unit file). `src/lib/tasks.ts` and `src/lib/groups.ts` do the Supabase IO and throw on a Supabase error (`tasks.ts:20,36,63,73`; `groups.ts:22,29,37`). DTOs are hand-written interfaces there (`tasks.ts:6-11,44-47`; `groups.ts:5-17`).
- **Route convention (re-read: `join.ts`, `leave.ts`; others reported by sub-agent as the same shape).** `export const prerender = false` (`join.ts:7`), POST only (a GET answers 404, `smoke.mjs:346-349`), no user → `302 /auth/signin` (`:11-14`), `request.formData()`, id through `normalizeUuid` with a malformed id sent to `/dashboard?error=forbidden` (`:16-20`), `createClient` null → `?error=not_configured` (`:22-25`), user-session client only, success and quiet no-ops → `302 /dashboard`, failures `?error=<code>` (`:34-39`), a thrown error → `console.error` and `?error=unknown` (`:43-47`). RLS-denied DELETE/UPDATE returns zero rows, which `leave.ts:26-32` treats as a quiet no-op.
- **Errors.** Task codes are a closed set (`task-errors.ts:3-8`), `toTaskErrorCode` maps `23514` and delegates the rest to the group mapper (`:11-15`), and the dashboard resolves only whitelisted codes (`task-errors.ts:18-23`; `dashboard.astro:24-25`). There is no success flash or toast: success is a plain redirect.
- **Middleware.** `PROTECTED_ROUTES = ["/dashboard", "/api/groups", "/api/tasks"]` (`src/middleware.ts:4`); an anonymous request to those prefixes gets `302 /auth/signin` (`:19-24`). A new API prefix other than `/api/tasks` or a new page would need to be added there.
- **Dashboard load.** For a user with a group the page awaits `getMyGroup`, `listGroupMembers`, `listGroupTasks` and `listTaskParticipants` one after another (`dashboard.astro:39,41,43,52`), after the middleware's `auth.getUser()` (`middleware.ts:11-14`). The participants read is a single unfiltered RLS-scoped query grouped in JS (`tasks.ts:57-68`; `task-rules.ts:36-44`), so there is no per-task query.
- **Row cap.** PostgREST `max_rows = 1000` in the local config (`supabase/config.toml:16-18`); `listTaskParticipants` throws at 1000 or more rows and the dashboard degrades (`tasks.ts:49-66`; `dashboard.astro:49-58,265-267`); `listGroupTasks` has no such guard (`tasks.ts:29-42`). _Inference:_ a read of all completion rows through PostgREST would be subject to the same cap, and a completion log grows with members × tasks × periods. The value on the hosted project is not in the repo.
- **Runtime.** `output: "server"`, `session: false`, Supabase secrets optional (`astro.config.mjs:11,19-25`); Workers config has `nodejs_compat`, static assets and observability, with no KV, cron or timezone setting (`wrangler.jsonc:1-15`). The infrastructure doc flags a Free-plan CPU cap of 10 ms per invocation for streak computation (`context/foundation/infrastructure.md:92`); the plan tier is not stated in the repo files inspected.

### 3. Time semantics (the crux for the streak rule)

- **Where "today" and "week" are defined: nowhere in code.** Scope: `src/` (own grep for `Date`, `Intl.`, `toISOString`, `toLocale`, `getTime(`, `Temporal`, `dayjs`, `date-fns`, `luxon`, `timezone`: no match) and `supabase/**/*.sql|*.toml` (own grep: only the comment at `…create_tasks.sql:7` and `now()` column defaults at `…create_tasks.sql:24`, `…create_task_participants.sql:29`, `…groups_and_group_members.sql:18,25`). The sub-agents report the same for `scripts/` and `tests/` apart from incidental uses (`smoke.mjs:7,43`, a few test lines).
- **What the documents say.** US-01 says "na dziś" (`prd.md:45`); the rule talks about "dzień/okres" and "dzień/tydzień" (`prd.md:97-99`); S-02 fixed "weekly = one check-off per calendar week, any day" and excluded user or group timezone (`…task-create-and-manage/plan.md:33,47`; `plan-brief.md:22`); tech-stack says decay is computed on read "from each task's last-completed timestamp" (`context/foundation/tech-stack.md:24`); the test plan wants "a pure rule function with an injected date, not the system clock" (`test-plan.md:67`).
- **No timezone source.** No timezone column in `src/types.ts:31-144`; the sign-up route sends no user metadata (`src/pages/api/auth/signup.ts:19`, sub-agent).
- **Runtime timezones.** Not configured in the repo (`wrangler.jsonc`, `ci.yml`, `supabase/config.toml`). The researcher's machine reports `Europe/Warsaw` (`timedatectl`, observed); that Workers, hosted Postgres and GitHub runners use UTC is external knowledge and unverified here. _Inference:_ local-time `Date` code in a Vitest test would give different results on this machine and in CI.
- **Task-related timestamps that exist.** Of the 4 temporal columns in the schema, two concern a task: `tasks.created_at` and `task_participants.joined_at`; the latter is deleted with the row on leave and restarts on a rejoin (`…create_task_participants.sql:29,63-65`), so enrolment history is not kept.

### 4. UI layer

- **Structure.** Single column `div.max-w-md.space-y-4` (`dashboard.astro:108-109`): error alert (`:110-115`), group card (`:117-130`), Members (`:132-172`), Tasks (`:174-271`), rename/delete/leave group (`:273-328`), pending-invite and create/join forms (`:330-375`), sign-out (`:377-388`). The strings of `dashboard.astro` are English (for example `:178` "Tasks"); `Layout.astro` sets `lang="en"` and the only Polish UI text the sub-agent found is the missing-configuration banner (`Layout.astro:14,24`, sub-agent). The PRD tab names are Polish.
- **Task row.** `<li class="flex flex-wrap …">` (`:191`): line 1 is title (or Edit island for the creator), recurrence pill and creator-only Delete (`:192-216`); line 2 is `basis-full` and holds participants and Join or Leave (`:217-258`), absent when participants failed to load. Nested `<li>` is avoided on purpose because the smoke row regexes stop at the first `</li>` (`:95-96`).
- **Closest analogue to a check-off control.** Join is a server-rendered `<form method="POST" action="/api/tasks/join">` with a hidden `task_id` and a small button (`:251-256`), no island, no pending state; Leave is the `ConfirmAction` island (`:239-249`). Both POST and get a 302 back to `/dashboard`. Form islands use a pending hook with a timeout (`useFormSubmitting`, sub-agent: `src/components/hooks/useFormSubmitting.ts:3-32`).
- **Instant interaction.** No client-side fetch, optimistic or partial-refresh path exists in `src/` (own grep in the Summary); client state is local toggles only (sub-agent: `EditTaskForm.tsx:15`, `CopyInviteLink.tsx:20`). _Inference:_ a full reload per click can reset scroll and focus on a long list.
- **Where a leaderboard could mount.** No slot exists. The nearest same-shape list is Members (`:141-169`, with Owner and You pills); `members` (`:41`) and `emailByUserId` (`:98`) are already loaded. Candidate gaps are between Members and Tasks (`:172/:174`) or between Tasks and Rename (`:271/:273`). A separate page would need `PROTECTED_ROUTES` (`middleware.ts:4`).
- **Design system.** Tokens are in `src/styles/global.css` (`:13`, `.dark` `:48`, `@theme inline` `:82`; sub-agent for the line numbers); there are no success/warning/info tokens (own grep) and the chart tokens are grey (`:32-36`). Available primitives: alert, alert-dialog, button, card, input, label, and no `badge`, `tabs`, `checkbox`, `table` or toast file (own `ls` of `src/components/ui/`). Pills are hand-rolled spans (`dashboard.astro:146,151,195,212,229`). The UI audit deferred "`--success`/`--warning` tokens and group-view primitives, needed only in M-1" (`context/archive/2026-09-25-ui-styles-audit/charges.md:61-64`), and M-1 is the current milestone (`roadmap.md:21-28`).
- **Process rule.** `CLAUDE.md:41-46`: `/10x-ui` is for a view that already renders; a view built for the first time goes through the normal chain. Check-off controls and the leaderboard are new UI on an existing page.
- **Documentation drift noted in passing.** `CLAUDE.md:21` says shadcn "new-york" while `components.json:3` says `radix-maia`; `CLAUDE.md:24` says DTOs belong in `src/types.ts` while the DTOs are hand-written in `src/lib` (`tasks.ts:6-11`, `groups.ts:5-17`).

### 5. Tests, smoke, CI and release

- **Vitest.** One project, `environment: "node"`, `include: tests/**/*.test.ts`, a `globalSetup` that applies to every test file (`vitest.config.ts:8-14`); per the sub-agent it reads `supabase status` and refuses non-local hosts (`tests/setup/global-setup.ts:36,57,73`, not re-read), so `npm test` needs a running local stack even for the pure unit file. `git ls-files tests` lists only helpers, integration, setup and unit files (no UI or DOM test), and the test plan marks e2e as not planned (`test-plan.md:102`).
- **Test plan.** Risk #4 (streak wrong at day/week boundary, timezone splitting users) is the only streak risk among the 6 rows of the risk map (`test-plan.md:42-49`); the planned proof is a unit test of a pure function with an oracle from the PRD and an injected date (`:67`); Phase 4 "Streak rule" is blocked until S-04 ships and the decay value is set (`:82,87-89`); the `unit (streak rule)` gate is required after Phase 4 (`:126`); the unit-test cookbook is TBD (`:135`). The documents do not say whether S-04 itself ships those unit tests or Phase 4 does afterwards. Immediacy is deliberately untested (`:57-58,178`).
- **Smoke (`scripts/smoke.mjs`).** Three cookie jars A, B, C (`:19-21`), `request()` sets `Content-Type: application/x-www-form-urlencoded` whenever it sends a body (`:52-70`), `storeCookies` treats a past `Expires` as deletion (`:36-48`). Each task action is covered by an anonymous-302 step and a foreign-Origin-403 step through the loop over `["create","update","delete","join","leave"]` (`:303-315`), plus malformed-id steps (`:326-345`) and GET-404 steps (`:346-349`). The lesson `context/foundation/lessons.md:26-31` requires each new step to assert its outcome (page state after the action, cleared cookies, rejected boundary) and to fail fast on a missing page-derived value; its cited line numbers are stale but the rule still binds.
- **CI.** Four jobs in `ci.yml`: `ci` (lint, `astro check`, build, `:13-28`), `smoke` (local Supabase, build, preview on 4321, `npm run smoke`, `:30-58`), `integration` (`npm test` and the SQL scenarios, `:60-79`), `release` (`:81-150`). The local stacks in `smoke` and `integration` start with `realtime` excluded (`:44,73`) and tech-stack records `has_realtime: false` (`tech-stack.md:17`); the infrastructure doc says a genuinely live leaderboard would need Durable Objects (`infrastructure.md:75`). The check-off requirement is "instant after your own checkbox" there.
- **Release.** Approval comes before the job prints `migration list`, so the approver must read `supabase/migrations/` in the merge commit (`README.md:199`); schema ships before code and migrations must be backward compatible with the code currently deployed (`README.md:200,225`). A phase-1 migration of S-03 went out with a later phase's run because earlier runs were cancelled or superseded (`context/changes/deployment/deployment-plan.md:164,171`).

### 6. What a streak or score computation would need, and where each input comes from today

| Input                            | Source today                                                          | Gap                                                         |
| -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| Recurrence kind of a task        | `tasks.recurrence` (`…create_tasks.sql:23,26`)                        | none; `once` has no defined streak meaning                  |
| Who is enrolled                  | `task_participants` (`…create_task_participants.sql:26-33`)           | ghost rows possible (`:15-20`)                              |
| When enrolment started           | `task_participants.joined_at` (`:29`)                                 | reset on rejoin, lost on leave                              |
| Completion events                | none                                                                  | new storage                                                 |
| "Now" / "today"                  | none                                                                  | clock injection and a definition of day (S-02 `plan.md:33`) |
| User timezone                    | none                                                                  | no column, no sign-up metadata                              |
| Week start                       | none                                                                  | undefined                                                   |
| Decay value                      | none                                                                  | open (`roadmap.md:124-125`)                                 |
| Group members and their identity | `list_group_members` (`…add_group_member_list_and_preview.sql:10-31`) | email only                                                  |

## Code References

- `context/foundation/prd.md:36-37,41-45,80-89,93-99,105-107,111-114,118` - guardrails, US-01, FR-008/FR-009, NFR, Business Logic, permissions, non-goals, "Open Questions: None".
- `context/foundation/roadmap.md:116-127` - S-04 entry (outcome, unknown, risk); `:113` S-03 risk; `:101` S-02 risk; `:163` handoff row.
- `supabase/migrations/20260925003350_create_groups_and_group_members.sql:4-5,11-26` - one group per user; groups and members tables.
- `supabase/migrations/20260925011727_harden_group_rls.sql:35-51,123-125` - caller-only `is_group_member`; members select policy.
- `supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:10-31` - `list_group_members` (member emails).
- `supabase/migrations/20260930120000_create_tasks.sql:6-7,18-27,37-40,48-63` - tasks table, recurrence CHECK, grants, policies.
- `supabase/migrations/20261001090000_create_task_participants.sql:15-20,26-33,41-44,52-65,72-90,95-116,123-130` - participation table, race note, grants, policies, triggers, backfill.
- `supabase/migrations/20261001120000_harden_table_privileges.sql:19-26` - privilege revocations.
- `supabase/checks/rls-scenarios.sql:313-320,535,628` - initplan table lists, S-02 and S-03 scenario sections.
- `src/types.ts:31,60,84,110,146-165` - generated tables, views, functions, enums.
- `src/lib/tasks.ts:6-11,29-42,49-68,71-75` - task DTO, list, participants with row-cap guard, `taskExists`.
- `src/lib/task-rules.ts:1-2,8-16,36-44` - pure rule module and recurrence constants.
- `src/lib/task-errors.ts:3-23` - closed task error set and resolver.
- `src/lib/groups.ts:20-24,35-40` - `getMyGroup`, `listGroupMembers`.
- `src/pages/api/tasks/join.ts:7-48`, `leave.ts:6-43` - most recent route exemplars.
- `src/middleware.ts:4,11-24` - `PROTECTED_ROUTES`, user resolution.
- `src/pages/dashboard.astro:36-83,95-104,174-271` - data load, participant helpers, Tasks card with the task row.
- `src/components/ui/alert.tsx:22` - hard-coded `role="alert"`.
- `scripts/smoke.mjs:36-48,81-183,206,303-349` - cookie jar, row regexes, `NO_ERROR_ALERT`, boundary loop.
- `.github/workflows/ci.yml:13-79,81-150` - CI jobs and gated release.
- `README.md:196-225` - release steps and backward-compatibility rule.
- `tests/helpers/supabase.ts:25,77-108,124-142` - admin client, task and participation helpers, cleanup order.
- `vitest.config.ts:8-14` - runner config with global setup.
- `supabase/config.toml:16-18` - `max_rows = 1000`.
- `node_modules/astro/dist/core/app/origin-check.js:2-22`, `core/config/schemas/defaults.js:44` - Origin check and its default.

## Architecture Insights

- **Slice recipe.** The two slices that added a table, S-02 and S-03, each planned an additive migration with RLS and column grants, regenerated types, SQL scenarios plus Vitest RLS tests, `src/lib` helpers, POST routes, a dashboard section, smoke steps and a docs/release phase (`context/archive/2026-09-30-task-create-and-manage/plan-brief.md:46-51`; `…task-join-and-leave/plan-brief.md:42-47`).
- **Authorization is in the database.** `join.ts` and `leave.ts` (re-read) use a client built from the request's headers and cookies (`createClient(context.request.headers, context.cookies)`, `join.ts:22`, `leave.ts:21`); the sub-agents found no service-role key in `src/`, `supabase/`, `scripts/` or `.github/`, and the tests use it as an RLS bypass (`tests/helpers/supabase.ts:25`). Denied UPDATE/DELETE returns zero rows and a denied INSERT or privilege raises `42501` (`test-plan.md:167`); the routes turn an empty result into a quiet no-op (`leave.ts:26-32`) or into `forbidden` (S-02 plan, `…task-create-and-manage/plan.md:21`).
- **Trigger pattern.** The 3 triggers in the 6 migrations (`groups_add_owner_to_group`, `tasks_add_creator_to_task`, `group_members_remove_task_participation`) run SECURITY DEFINER functions; the two task triggers use `set search_path = ''`, have EXECUTE revoked from `public`, `anon` and `authenticated`, and do not raise (`…create_task_participants.sql:72-116`); the owner trigger follows the same revoke pattern and raises on purpose when a second group would be created (`…groups_and_group_members.sql:54-74`).
- **Derive on read is a stated stance, not yet a design.** It appears in `…create_tasks.sql:6-7`, `plan.md:26` (S-02), `tech-stack.md:24` and S-03's plan brief (`:22`), with two wordings: "last-completed timestamp" versus "completion timestamps" (`…task-create-and-manage/research.md:31`).
- **Constraints any design inherits (derived from the sources above):** additive migration with RLS enabled and per-operation, per-role policies (`CLAUDE.md:25`); a foreign key to `auth.users` that cascades (S-02 kept `tasks.created_by` `on delete cascade` because a `restrict` key breaks test cleanup, `…task-create-and-manage/plan-brief.md:26`, `plan.md:24`; _inference:_ the same applies to a new table); `revoke`-first minimal grants like `task_participants`; the new table added to both `rls-scenarios.sql` lists; types regenerated; self-only write for a task the caller is enrolled in (`prd.md:43,107`; _inference:_ a completions INSERT policy could check enrolment by reading `task_participants` under the caller's RLS, the way the `task_participants` insert policy reads `tasks`, `…create_task_participants.sql:56-61`); reads limited to the caller's group (`prd.md:36`).
- **UI is server-rendered cards with small islands.** The islands `dashboard.astro` uses are the 7 components it imports for forms, a confirmation dialog and a copy button (`:3-9`); the rest of the page is server-rendered markup without client state.

## Historical Context (from prior changes)

Each sentence is scored supported, partial or contradicted against the current tree.

- `context/archive/2026-09-30-task-create-and-manage/plan-brief.md:22` - "recurrence … lets S-04 compute a period from a timestamp plus one value" - **partial**: the recurrence kind and timestamps exist, but no definition of day boundary or week start exists anywhere searched.
- `…task-create-and-manage/plan-brief.md:24` - recurrence is fixed after creation because changing it "would rewrite the meaning of past check-offs" - **supported** (no UPDATE grant, `…create_tasks.sql:40`); _inference:_ delete and recreate then discards that task's history if completions cascade.
- `…task-create-and-manage/plan.md:26` and `…create_tasks.sql:6-7` - streaks computed on read, no period or timezone data on the row - **supported as a decision**, **partial as a plan**: the only task-related timestamps in the schema are `tasks.created_at` and `task_participants.joined_at`, and neither is a completion time.
- `…task-create-and-manage/research.md:125,127,129` - open: streak for `once` tasks, definition of "day", completion cascade on delete, "individual" tasks only in the success criterion - **still open**; `prd.md:29` mentions individual tasks while FR-004 and the schema have group tasks only.
- `…task-create-and-manage/reviews/impl-review.md:46-54` - orphaned tasks "revisit with S-03/S-04" (sub-agent) - **open**; check-offs by remaining participants of a task whose creator left are not addressed in the documents searched.
- `context/archive/2026-10-01-task-join-and-leave/plan-brief.md:24,54` and `plan.md:32` - leave deletes the row, S-04 decides what survives - **supported** (`…create_task_participants.sql:63-65`); the roadmap expected S-03's plan to settle it (`roadmap.md:113`) - **contradicted** by `plan.md:32`.
- `…task-join-and-leave/plan-brief.md:26` - the departure trigger leaves "no orphaned participants in … the future leaderboard" - **partial**: supported for leave and removal (`…create_task_participants.sql:95-116`), but the accepted race can leave a row for a non-member (`:15-20`).
- `…task-join-and-leave/reviews/impl-review-phase-1.md:79-87` - F5: a cascading check-off foreign key keyed to `(task_id, user_id)` would destroy history on leave; SKIPPED, deferred to S-04 - **supported**, unresolved.
- `roadmap.md:163` - S-04 "Ready for /10x-plan: no, waits for S-03" - **contradicted** by `roadmap.md:47,192` (S-03 done).
- `prd.md:118` - "Open Questions: None" - **contradicted** for the decay value by `roadmap.md:124-125` and `test-plan.md:87-89`, and the day boundary has no definition in the PRD (`prd.md:97-99`).
- `prd.md:76-79` (FR-007 counter-argument about a shared group streak) versus `prd.md:97` (streak per user and task, summed per user) - **partial**: the rule defines no shared group streak.
- `context/foundation/test-plan.md:57-58,178` - immediacy is not tested - **supported** (no UI or e2e tests in `git ls-files tests`).
- `context/changes/deployment/deployment-plan.md:164,171` - earlier release runs can be cancelled or superseded so a migration ships with a later run - **supported** by the same text.

## Related Research

- `context/archive/2026-09-30-task-create-and-manage/research.md` - recurrence model options, delete cascade and orphan questions.
- `context/archive/2026-10-01-task-join-and-leave/research.md` - participation model, streak-on-read stance (`:81`).
- `context/archive/2026-09-30-testing-runner-data-isolation-and-permissions/research.md` - test runner and isolation patterns (sub-agent; not re-read).

## Open Questions

Decisions `/10x-plan` has to make (none is settled by the PRD, roadmap or code):

1. **Decay rule.** Value and shape. `prd.md:97` says the decrease is smaller than the full state and that the streak is not reset to zero entirely; `roadmap.md:124-125` lets the plan pick a default. _Inference:_ for a streak of 1, a decrease smaller than 1 cannot be a whole number, so a whole-number rule needs an explicit treatment of small streaks or scores that may be fractional; the PRD does not say whether several missed periods apply the decrease repeatedly.
2. **Definition of a day and a week.** Timezone source (user, group or UTC; no source exists) and the week-start day (S-02 only fixed "calendar week").
3. **`once` tasks.** Whether a check-off of a one-off task changes any streak or score; the PRD defines periods only as day or week (`prd.md:97-99`).
4. **Check-off window.** Whether a check-off can be undone, and whether past or future periods can be checked off; only "na dziś" (`prd.md:45`) hints at today. Not found in the documents searched (sub-agent scope: context documents, README, CLAUDE.md, `ci.yml`).
5. **History on leave, rejoin and delete.** Whether completions survive leaving a task or the group, count after a rejoin or stay after a task delete or a cadence change by delete and recreate (S-03 F5; S-02 research `:127`).
6. **Completion storage shape.** A log with one row per completed occurrence versus a stored state per user and task; tech-stack says "last-completed timestamp", S-02 research says "completion timestamps". Related: key design (references to `tasks` and `auth.users` versus `task_participants`) and where the rule runs (pure TypeScript in `src/lib` with an injected clock, per `test-plan.md:67`, versus SQL), given the 10 ms CPU cap note (`infrastructure.md:92`) and the 1000-row cap.
7. **Leaderboard content.** Who is listed (all members including those with no tasks, or participants only), tie-break, whether a per-task breakdown shows next to the total (the PRD speaks of a streak per task and a sum per user), and the displayed identity (emails only, `list_group_members`). _Inference:_ a sum of streaks rewards enrolling in more tasks; FR-006's counter-argument about clutter from inactive participants was considered and kept (`prd.md:72-75`).
8. **Navigation.** The PRD names two tabs; the UI has none. Dashboard sections (S-02 chose a Tasks card on `/dashboard` with "no new navigation", `…task-create-and-manage/plan-brief.md:30`) or a new page that must be added to `PROTECTED_ROUTES`.
9. **Instant check-off mechanism.** Keep the native form POST and 302 (the shape of the re-read routes `join.ts` and `leave.ts`, covered by Astro's Origin check, testable with the existing smoke helpers) or add a client-side path with fetch (first JSON endpoint; outside `checkOrigin`; no existing optimistic pattern). Immediacy stays a manual judgement either way (`test-plan.md:178`).
10. **Scope split of tests.** Whether S-04 ships the streak-rule unit tests or test-plan Phase 4 does afterwards (`test-plan.md:82,87,126`).
11. **Process.** The roadmap handoff row still says "no" (`roadmap.md:163`) and the S-04 status is `proposed` (`roadmap.md:48`) although its prerequisite S-03 is done (`roadmap.md:47,192`); `context/foundation/lessons.md:23` lists roadmap status edits among the artifacts committed on the planning branch.

Facts not verified here:

- Hosted-project values: PostgREST `max_rows`, database timezone, live grants (migration comments only), Workers plan tier.
- Runtime latency of the current dashboard round trip (call counts come from code, not measurement).
- The interview behind test-plan risk #4 is not in the repository.
- Sub-agent-only claims (marked above): test bodies under `tests/integration/`, `tests/setup/global-setup.ts`, `useFormSubmitting`, `ConfirmAction`, `EditTaskForm`, the `10x-ui` skill gate, S-02 review texts.
