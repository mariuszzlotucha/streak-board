# Checkoff Grid (S-13) — Plan Brief

> Full plan: `context/changes/checkoff-grid/plan.md`
> Frame brief: `context/changes/checkoff-grid/frame.md`
> Research: `context/changes/checkoff-grid/research.md`

## What & Why

> A group member cannot see which participants did a task, neither in the current period nor in recent ones, because the only read path (`buildBoard`) folds others' history into a leaderboard sum; S-13 delivers the PRD §Vision core already promised on the landing page, with a 7-day / 4-week horizon, not "long-term history". (frame.md, reframed statement)

## Starting Point

`/dashboard` already loads every enrolment's full check-off history; `joined_at` exists but is not selected. Period rules live only in `streak-rules.ts`. A tick updates only the button and the leaderboard total.

## Desired End State

Every task row shows a participants × periods table after the participants line: last 7 days (daily), last 4 weeks (weekly), one column (once). Cells read done / missed / open / not joined, with icons and screen-reader labels. The viewer's current cell flips with their tick. Landing, privacy retention text, dialogs, PRD and domain docs say what the grid shows and what leaving erases.

## Key Decisions Made

| Decision                     | Choice                                                        | Why (1 sentence)                              | Source           |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------- | ---------------- |
| Horizon                      | 7 days daily, 4 weeks weekly, current included                | What the group looked at in the sheet         | Frame (owner)    |
| PRD placement                | Fulfils §Vision; Secondary parked; MS-01 → §Vision            | The grid is the core, not long-term history   | Frame (owner)    |
| Data                         | No new query; add `joined_at` to participants select          | History already loaded on every dashboard     | Research         |
| Period rules                 | Shared helpers exported from `streak-rules.ts`                | Grid and streak must never disagree           | Research / Frame |
| Viewer's cell after a tick   | Live via a per-task checked signal in `checkoff-sync`         | Button and grid never disagree                | Plan             |
| Check-off before `joined_at` | Stored fact wins (shows done)                                 | Matches the streak, which counts it           | Plan             |
| Placement                    | Always visible, 4th line after participants                   | Sheet at a glance; smoke regexes keep working | Plan             |
| Cells                        | Existing success/destructive/muted tokens + icons + sr labels | No token work; not colour-only                | Plan             |
| Stale participant            | No grid row                                                   | Matches leaderboard totals                    | Plan             |
| CPU measurement              | Not in this change                                            | Risk predates S-13                            | Plan             |

## Scope

**In scope:** pure grid rules + tests; `joined_at` read; grids in `loadDashboard`; `CheckoffGrid` + live viewer cell; fixtures, smoke; document fixes listed in the frame.

**Out of scope:** SQL/migrations, streak/leaderboard/write-path changes, Q-04 window fix, charts/long-term history, analytics/hypothesis test, `WhoCanSee` privacy text, timezones, CPU measurement.

## Architecture / Approach

`listTaskParticipants` (+`joined_at`) and `listCheckoffPeriods` → `buildGrids` (pure, `grid-rules.ts`, uses `recentPeriods`/`normalisePeriod` from `streak-rules.ts`) inside the board's try/catch in `loadDashboard` → `DashboardData.grids` → `TasksCard` → `TaskRow` → `CheckoffGrid.astro` (server table) with one `ViewerGridCell` island fed by `checkoff-sync`, which `CheckoffControl` publishes to.

## Phases at a Glance

| Phase         | What it delivers                                                         | Key risk                                                |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1. Grid rules | Period helpers + `buildGrids` with exhaustive unit/mutation tests        | Drift from `snapshotOf` normalisation                   |
| 2. Data       | `joined_at` read, `grids` in `DashboardData`                             | Breaking existing participant consumers                 |
| 3. UI         | Grid table, live viewer cell, fixtures, smoke                            | Hydration mismatch; phone width; smoke regex collisions |
| 4. Documents  | PRD, roadmap anchor, glossary, distillation, landing, Retention, dialogs | Strings bound by smoke/e2e                              |

**Prerequisites:** local Supabase stack for `npm test`/smoke (one worktree at a time); planning branch merged first.
**Estimated effort:** one goal run, four phases, one PR.

## Open Risks & Assumptions

- The M-3 hypothesis ("the grid keeps regularity") cannot be checked by this release; owner question stays in the roadmap.
- Through the direct API the last ~7 days can still change, and own check-offs can be deleted without a date limit (Q-04).
- `/dashboard` CPU remains unmeasured.

## Success Criteria (Summary)

- A member sees, for every task, who did it today/this week and in the recent periods, on a phone.
- The grid and the streak beside it never disagree, including right after a tick.
- Documents no longer contradict the product (streak drop, history erased on leave).
