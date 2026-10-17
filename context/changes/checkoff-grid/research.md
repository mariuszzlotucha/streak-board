---
date: 2026-10-17T13:36:47+02:00
researcher: Claude (Opus 5.5) for Mariusz Złotucha
git_commit: 1aedc33
branch: s-13/checkoff-grid/plan
repository: streak-board
topic: "S-13 checkoff-grid: what the code already provides for a participants × periods grid per task, and which contracts the grid must respect"
tags: [research, dashboard, streak-rules, leaderboard-rules, task_checkoffs, task_participants, smoke, kitchen-sink]
status: complete
last_updated: 2026-10-17
last_updated_by: Claude (Opus 5.5)
---

# Research: S-13 checkoff-grid

**Date**: 2026-10-17T13:36:47+02:00
**Git Commit**: 1aedc33 (uncommitted change folder in the worktree; anchors are local `file:line`)
**Branch**: s-13/checkoff-grid/plan

## Research Question

Starting from `frame.md` (reframed problem: the first "who did what" view, horizon 7 days for `daily` / 4 weeks for `weekly`, `once` without a period axis, cell states beyond done/not-done): which data, rules, render paths and test/markup contracts does the plan build on, and what is missing?

The frame's hypothesis table (dimensions 1–6, `frame.md`) is taken as established; this document adds the implementation-level facts it did not anchor and does not repeat its documentation list.

## Summary

- **Data is already loaded** on every `/dashboard` for a group: `listCheckoffPeriods` reads `task_checkoff_periods` (one row per enrolment, ascending `periods` array) in the same `Promise.allSettled` as members, tasks and participants (`src/lib/dashboard-data.ts:78-83`, `src/lib/checkoffs.ts:14-26`). The grid needs no new query for check-offs.
- **`joined_at` is readable but not selected**: the column exists (`supabase/migrations/20261001090000_create_task_participants.sql:29`), `authenticated` has table-level `select` (`:42`), and `listTaskParticipants` orders by it but selects only `task_id, user_id` (`src/lib/tasks.ts:58-62`). `groupParticipantsByTask` then reduces the rows to `Map<taskId, userId[]>` (consumed at `dashboard-data.ts:96`). Showing "before joining" needs `joined_at` added to that select and a richer shape than `string[]`.
- **Period rules live in one file** (`src/lib/streak-rules.ts`): `periodKeyFor` (`:42-53`) gives the current key in Europe/Warsaw; weekly keys snap to Monday (`mondayOf`, `:34-36`); `snapshotOf` (`:96-132`) is the only code that normalises stored keys (weekly snap, repeats, future keys). The day-number helpers `dayNumberOf`/`keyOfDayNumber`/`mondayOf` are module-private (no `export`, `:25`, `:29`, `:34`), so a grid that enumerates the last N periods must either add an exported helper there or duplicate them — the frame's convention ("one place for period rules") points to adding it in `streak-rules.ts`.
- **The only per-member computation today is `buildBoard`** (`src/lib/leaderboard-rules.ts:110-146`): it loops tasks × participants, computes a snapshot per enrolment, keeps only the total for others and `{snapshot, currentPeriod}` for the viewer (`:132-134`). Its loop already has every input the grid needs (task recurrence, current period per recurrence, participants, periods per enrolment), and it runs inside its own try/catch in `loadDashboard` (`dashboard-data.ts:107-122`) that degrades to `checkoffsFailed`.
- **Render location**: `TaskRow.astro` (one `<li>` per task, three lines: title, viewer's `CheckoffControl`, participants with Join/Leave; `:31-107`) inside `TasksCard.astro`'s `<ul class="divide-y">` (`:61-71`). Smoke binds that `<li>` with regexes that stop at the first `</li>` (`scripts/smoke.mjs:197-252`, `:331-351`); a grid placed inside the row must not use `<li>` (TaskRow already uses ARIA `role="list"` on spans for this reason, `TaskRow.astro:26-27`, `:75-81`).
- **Smoke collision risk**: `taskRowListing` matches the title, then *anywhere later in the same `<li>`* the participant's nickname (`smoke.mjs:200-204`). A grid inside the row that prints nicknames would satisfy that regex even if the participant line were broken; the "You" variant needs the nickname directly followed by a `You` badge span (`:201`). The plan has to keep the grid from weakening these assertions (e.g. place it after the participant line, or tighten the regex in the same change, per CLAUDE.md "Smoke binds the markup").
- **Optimistic tick is not shared with other rows**: `CheckoffControl` flips its own state and publishes only a score delta through `checkoff-sync` (`src/components/tasks/CheckoffControl.tsx:68-74`, `src/lib/checkoff-sync.ts:21-29`); the only subscriber is the Leaderboard (`useCheckoffDeltas.ts`, `Leaderboard.tsx`). A server-rendered grid will show the viewer's current-period cell as of page load until reload unless it subscribes to a new per-task signal. This is a real choice for the plan.
- **Kitchen sink**: fixtures compute the board with the real rules at `NOW = 2026-10-11T10:00:00Z` (`src/components/dev/dashboard-fixtures.ts:126`, `:212-230`) from a `CHECKOFFS` list (ends `:200`) and `emptyData()` mirrors `DashboardData` (`:232-247`). Any new `DashboardData` field must be added there, and fixtures need periods that exercise every cell state.

## Detailed Findings

### Cell semantics available from the stored data

- A cell is (task, participant, period key). "Done" = the enrolment's `periods` contains a key that normalises to that period (`snapshotOf` normalisation, `streak-rules.ts:107-113`). For weekly, any day of the week counts (the API accepts any day in the window; `uncheck` deletes the whole week for that reason, `src/lib/checkoffs.ts:86-93`).
- Open current period: `streakValue` does not decay for the current period (`streak-rules.ts:138-149`); a grid "not yet" state for the current column matches that rule.
- Before joining: needs `joined_at` (above). Check-offs dated before `joined_at` are possible through the direct API (insert window `UTC today − 7 … +1`, `20261002090000_create_task_checkoffs.sql:63`, which does not compare with `joined_at`). The plan must state which wins for such a cell.
- History erased on leave/rejoin: the composite FK cascades (`create_task_checkoffs.sql:13-16`, `:34`), and `joined_at` resets on rejoin (new row, default `now()`, `create_task_participants.sql:29`, `:43`), so "before joining" also covers the erased stretch consistently.
- `once` tasks: `snapshotOf` returns `checked: periods.length > 0` with no axis (`streak-rules.ts:101`).
- Horizon vs. writable window: 7 daily columns (today + 6) lie inside the 7-day insert window, so every daily column except the oldest edge can still change via the direct API; 4 weekly columns extend beyond it. Not a UI concern for the normal flow (the UI only ticks the current period, `checkoffs.ts:57-67`).

### Read path and cost

- Check-off read is one row per enrolment with an aggregated array; the PostgREST cap guard throws at 1000 rows (`checkoffs.ts:17-19`, `tasks.ts:51`). The `periods` array is the whole history, so the grid filters to the horizon in memory; no new SQL needed.
- `snapshotOf` is documented as linear and runs per enrolment per load (`streak-rules.ts:91-95`); a grid pass adds one more O(periods) scan per enrolment.

### Members and naming

- Nicknames resolve through `participantsResolver` (`dashboard-data.ts:163-174`) with `UNKNOWN_MEMBER` (`leaderboard-rules.ts:42`); participants without a member row are skipped in totals (`:129-131`) but shown as "Unknown member" in the row. The grid must pick one of these two behaviours for a stale participant.

### Failure states

- Grid inputs are the same as the board's: when `participantsFailed` or `checkoffsFailed` the board is `null` (`dashboard-data.ts:101-123`) and `TasksCard` shows a `role="status"` notice (`TasksCard.astro:38-55`). Smoke reserves `role="alert"` for errors (`smoke.mjs:377`).

## Code References

- `src/lib/dashboard-data.ts:78-123` — concurrent reads, board computation in its own try/catch
- `src/lib/checkoffs.ts:14-26` — `listCheckoffPeriods`
- `src/lib/tasks.ts:50-66` — `POSTGREST_MAX_ROWS`, `listTaskParticipants` (no `joined_at` in select)
- `src/lib/streak-rules.ts:25-53`, `:96-149` — period keys, private day helpers, `snapshotOf`, `streakValue`
- `src/lib/leaderboard-rules.ts:87-146` — `BoardInput`, `Board`, `buildBoard`
- `src/components/dashboard/TaskRow.astro:26-107`, `TasksCard.astro:56-71` — render location
- `src/components/tasks/CheckoffControl.tsx:41-80`, `src/lib/checkoff-sync.ts` — optimistic state
- `scripts/smoke.mjs:197-252`, `:331-351`, `:377`, `:420` — row and order invariants
- `src/components/dev/dashboard-fixtures.ts:22-47`, `:126`, `:200-247` — page states, clock, board fixture
- `supabase/migrations/20261001090000_create_task_participants.sql:29`, `:42`; `20261002090000_create_task_checkoffs.sql:13-16`, `:54-68`, `:77-80`
- Tests to extend: `tests/unit/streak-rules.test.ts`, `tests/unit/leaderboard-rules.test.ts`, `tests/unit/dashboard-data.test.ts`

## Architecture Insights

- Pure rules files (`streak-rules.ts`, `leaderboard-rules.ts`) are browser-safe and take `now` as input (`streak-rules.ts:1-3`, `leaderboard-rules.ts:1-2`); a grid builder fits the same pattern and is unit/mutation-testable with fixed dates.
- `.astro` for static markup, React only for interactivity (CLAUDE.md); a purely server-rendered grid needs no island unless the plan chooses optimistic sync.
- UI token rules apply to `src/components/{dashboard,tasks}/` (ESLint rejects palette classes); green/red cells must use existing tokens or a new token through `global.css` + `tokens-source/` + `scripts/token-contrast.mjs` (CLAUDE.md, UI). Colour alone also fails accessibility; cells need text/`aria` labels.

## Historical Context (from prior changes)

- Grid deliberately left out of S-04 and S-11 (`frame.md` H1, citing `2026-10-01-checkoff-and-leaderboard/plan.md:39`, `2026-10-09-dashboard-ui/plan.md:147`).
- Owner decisions 2026-10-17 (horizon, PRD placement, no hypothesis test): `frame.md`, "Sygnały zawężające".

## Related Research

None (first research for this change).

## Open Questions (for /10x-plan, not blocking)

1. Viewer's current-period cell after an optimistic tick: reload-only, or a new per-task signal in `checkoff-sync`?
2. Rule for check-offs dated before `joined_at` (show as done, or as "before joining").
3. Stale participant without a member row: hide (like totals) or show "Unknown member" (like the row).
4. Placement inside the `<li>` vs. a disclosure (`<details>`) per task, and the matching smoke regex change.
5. Cell colours: existing tokens or new ones (token pipeline).
6. Whether to measure `/dashboard` CPU in this change (pre-existing risk, `frame.md` H5).
