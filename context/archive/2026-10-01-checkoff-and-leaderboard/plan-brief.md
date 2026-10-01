# Checkoff and leaderboard — Plan Brief

> Full plan: `context/changes/checkoff-and-leaderboard/plan.md`
> Research: `context/changes/checkoff-and-leaderboard/research.md`

## What & Why

S-04 (FR-008, FR-009, US-01) is the roadmap's north star: a member who takes part in a task checks off the current day or week and immediately sees the updated score on their group's leaderboard. If the tick does not feel instant, or the board does not rank correctly, the product hypothesis stays unconfirmed even when the rest of the roadmap is done.

## Starting Point

Groups, tasks (once/daily/weekly) and participation exist, so a user already knows which tasks they take part in. Nothing records a check-off, nothing defines a "day" or a "week" (no `Date`, `Intl` or timezone code anywhere), and every action is a form POST, a 302 and a full page load. The dashboard is one column of cards with no tabs.

## Desired End State

In each task row a participating member sees "Mark done" (or "Done" with "Undo") and their streak; ticking updates the row and a Leaderboard card under Tasks at once, with no reload, and a reload shows the same state. The leaderboard lists every member with total and position (equal totals share the position). Leaving a task or the group erases that user's check-offs. Outsiders cannot read or write them. Other members see a new score on their next page load.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Decay | Each missed period halves the streak, rounded down (6 → 3 → 1; 1 → 0) | Whole numbers everywhere, and one miss never wipes a streak of 2 or more | Plan |
| Clock | Fixed `Europe/Warsaw`, weeks Monday–Sunday | Matches how a Polish friend group reads "today", needs no schema change and is testable with an injected instant | Plan |
| `once` tasks | First check-off adds 1 permanently, no decay | Every kind of task gives visible score feedback | Plan |
| Ties | Equal totals share the position (1, 1, 3), alphabetical by e-mail | No hidden key picks a winner | Plan |
| Undo | Current period only (any time for `once`) | Fixes mis-taps on a phone without rewriting history | Plan |
| Leaving | Leaving a task or group, or removal, erases that user's check-offs; dialogs warn | Simplest model: the check-off hangs off the participation row and cascades | Plan |
| Layout | Leaderboard card under Tasks on `/dashboard` | Keeps S-02's "no new navigation" and one data load | Plan |
| Instant | Optimistic React island (form-encoded `fetch`, JSON mode), native POST as fallback | The tap is truly instant and Astro's Origin check stays in force | Plan (chosen over the recommended form POST) |
| Data model | Period-keyed fact table with a primary key and a composite foreign key to participation, plus an aggregate view | Idempotent ticks, reads far below the 1000-row cap, history follows enrolment | Research / Plan |
| Rule location | Pure TypeScript modules with an injected clock, shared by server and browser | Matches "computed on read" and test-plan risk #4; the same code computes the optimistic result | Research |
| Tests | S-04 ships the rule unit tests, SQL scenarios, Vitest RLS and flow tests, smoke | Covers risk #4 now; test-plan Phase 4 is reconciled in the docs phase | Plan |

## Scope

**In scope:** table, RLS, grants, aggregate view, regenerated types; the pure rule and ranking; `/api/tasks/checkoff` and `/uncheck` (form and JSON modes); check-off control and streak in task rows; Leaderboard card; concurrent dashboard loading; leave warnings; optimistic island; SQL, Vitest, unit and smoke tests; docs and production release.

**Out of scope:** live updates for other members; past or future periods and grace; per-group or per-user timezone and configurable decay; per-participant streaks, history charts, notifications; tabs or a separate page; anti-cheat; snapshots of old data; DOM or e2e tests of the island.

## Architecture / Approach

The database stores facts only: one row per (task, user, period), keyed so a repeat tick is a no-op and tied to participation so leaving erases it. A `security_invoker` view returns one row per enrolment with its periods. Everything else is pure TypeScript: `streak-rules` turns period keys and a clock into streak values, `leaderboard` sums and ranks them. The server renders rows and the board with plain forms; the island reuses the same functions to flip the row and re-rank the board instantly, sends a form-encoded `fetch` that answers JSON, and rolls back on failure.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Streak rule and leaderboard logic | Pure modules plus oracle-based unit tests (boundaries, DST, decay, ranking) | Wrong day/week boundary or decay arithmetic (test-plan risk #4) |
| 2. Check-off table, RLS and view | Migration, types, SQL scenarios, Vitest RLS tests | A view without `security_invoker` would leak across groups |
| 3. Server layer | Data layer, `/checkoff` and `/uncheck` in both modes, smoke boundaries | A JSON request body would bypass Astro's Origin check |
| 4. Dashboard, server-rendered | Control, streak, Leaderboard card, concurrent loads, leave warnings, smoke outcomes | Smoke row regexes; regression from the concurrent-load refactor |
| 5. Instant check-off | Hydrated islands, optimistic update and rollback, delta store, protocol tests | First fetch pattern; client and server disagreeing; hydration mismatch |
| 6. Docs and production release | README, CLAUDE.md, AGENTS.md, test-plan, gated release, production check | Migration must reach production before users tap; the "instant" feel is judged by hand |

**Prerequisites:** S-03 archived (done); the local Supabase stack running for `npm test`, `npm run test:rls` and `npm run smoke`; a reviewer for the `production` environment.
**Estimated effort:** ~6-7 sessions across 6 phases, one PR per phase.

## Open Risks & Assumptions

- The fixed Warsaw zone assumes the group lives in Poland; another zone needs a per-group column later.
- The period is computed by the app and only bounded by the insert policy (UTC today − 7 days to + 1 day), so a user calling the API directly can claim a day in that window; accepted as trust-based per the PRD.
- The island is the first `fetch` in the app: it must stay form-encoded, its result must equal the server's (same pure code, equivalence tests), and a page left open across Warsaw midnight reloads on a period mismatch.
- Leaving erases the streak (dialogs warn); the view's arrays grow about 5 KB per enrolment-year.

## Success Criteria (Summary)

- A participating member ticks the current day or week and sees the row and the leaderboard update at once; a reload keeps it and undo reverses it.
- The leaderboard shows every member's total and position, outsiders can neither read nor write check-offs, and leaving erases streaks.
- `npm run test:rls`, `npm test` and `npm run smoke` pass, and the slice works on production after the approved release, recorded in `deployment-plan.md`.
