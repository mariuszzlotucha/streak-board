<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Checkoff and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Scope**: Phase 2 of 6
- **Reviewed phases**: 2
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

Reviewed state: the working tree of branch `s-04/checkoff-and-leaderboard/phase-2` on top of master `1c12af7`. The phase is not committed yet: two new files (`supabase/migrations/20261002090000_create_task_checkoffs.sql`, `tests/integration/task-checkoffs.test.ts`) plus edits to `src/types.ts`, `supabase/checks/rls-scenarios.sql`, `tests/helpers/supabase.ts` and `plan.md` (six Progress ticks and one paragraph under Performance Considerations). Manual row 2.6 is still waiting for the human's confirmation.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Summary

No defect was found in the migration, the policies, the column grants, the invoker view, the composite foreign key or the cascades. Every scenario that the plan lists for the SQL file and for the integration tests is covered by an assertion that fails when the behaviour is wrong (each denial has a positive control, state is re-read through the service role), and no "NOT doing" boundary is crossed. What is beyond the plan's lists is harmless: the time-zone scenarios, the ex-member and anon-delete cases, the non-existent-task cases, the structural `reloptions` and ACL assertions, the UTC-midnight guard and the performance paragraph in `plan.md`. The four observations are small: a trap in the text added to the plan (F1), a performance trade-off that wants a decision (F2), an ordering assertion that would survive the removal of `order by` (F3) and two comment gaps (F4).

## Success Criteria

Re-run during this review (2026-10-01):

- 2.1 `npx supabase db reset`: PASS. All seven migrations apply from scratch (34 s), the new one last.
- 2.2 `grep -q task_checkoffs src/types.ts && grep -q task_checkoff_periods src/types.ts && npm run build`: PASS.
- 2.3 `npm run test:rls`: PASS. 293 assertions.
- 2.4 `npm test`: PASS. 11 files, 201 tests (25 new in `task-checkoffs.test.ts`). The new file passed 5 of 5 further runs alone and the full suite 2 of 2 further runs; afterwards the database held no users, groups, tasks, enrolments or check-offs.
- 2.5 `npm run lint`: PASS. Clean.
- 2.7 `npx astro check`: PASS. 85 files, 0 errors, 0 warnings, 0 hints.
- 2.6 manual (mutation check): PENDING. The row stays unticked until the human confirms it. Evidence from the implementing session, not re-run here: with `security_invoker = false` exactly two tests fail ("B and X read no rows through the view; the anonymous client is denied (42501)" and "lists only the caller's own group's enrolments when nothing filters the read") and 199 pass; the database was restored with `db reset`. Both reviewers read the tests independently and agree that both mutations the plan names turn tests red: dropping `security_invoker` (`task-checkoffs.test.ts:335-349`, `rls-scenarios.sql:1007`) and weakening the select policy (`task-checkoffs.test.ts:206-244`).

## How this was reviewed

Two independent, read-only reviewers worked on the working tree (neither ran a gate or touched the database); the main session ran the gates and the probes below.

- Plan adherence: every planned item of the four "Changes Required" blocks checked against the files (all MATCH), every scenario in the plan's SQL and integration lists traced to a named assertion that would fail if the behaviour were wrong, extras listed (all harmless), "NOT doing" boundaries checked (none violated).
- Safety, quality and patterns: RLS policies and grants, referential integrity and cascades (including the S-03 triggers and a check-off racing a leave), migration safety, performance, test reliability (UTC midnight, time zones, cleanup, assertions by SQLSTATE), the SQL scenario file (one transaction, rollback, session-state leakage), pattern comparison with `create_task_participants`, `create_tasks`, `harden_table_privileges`, `task-participation.test.ts` and the S-03 SQL section. No material mismatch.
- Probes by the main session: `create or replace view` in a rolled-back transaction (F1); 100 sequential password sign-ins against the local auth container (see "Checked and dismissed"); five repeats of the new test file, two more runs of the whole suite and a check that nothing is left in the database.
- Mutation evidence from the implementing session, not re-run here: 23 mutants of the migration against both suites (insert policy without the caller or visibility check, window bounds ±1, the window computed in the session zone, no bound at all, select and delete policies opened up, foreign key without cascade or without the enrolment, primary key removed, column grants widened, table revoke removed, view without `security_invoker`, unordered, without grant or without revoke, bare `auth.uid()`). 22 were killed by the tests; the 23rd (the view's `revoke`) is behaviourally equivalent and is now killed by a structural ACL assertion (`rls-scenarios.sql:1009-1012`).

Checked and dismissed:

- A reviewer worried that the 29 password sign-ins per `npm test` (23 before this phase) could exhaust GoTrue's token limiter (burst 30, refill 0.5 per second, computed from the upstream source). Probe: 100 sequential password sign-ins against the local auth container (`GOTRUE_RATE_LIMIT_TOKEN_REFRESH=150`) took 9.7 s and all returned 200, so the mechanism does not reproduce and is not a finding. If `over_request_rate_limit` ever shows up when Phase 3 adds a test file, retry the sign-in in `createTestUser`.
- The two new SQL helpers (`rls_check.utc_today`, `rls_check.tick`) sit next to their section while the earlier helpers are at the top of the file. Layout only.

## Findings

### F1 — The recipe recorded in the plan resets `security_invoker` when followed literally

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/checkoff-and-leaderboard/plan.md:494 (last sentence)
- **Detail**: The paragraph added to Performance Considerations in this phase names `create or replace view public.task_checkoff_periods` with a join to `tasks` as the additive fix. PostgreSQL replaces the whole option list on `CREATE OR REPLACE VIEW`. Verified on the local stack in a rolled-back transaction: `reloptions` went from `{security_invoker=true}` to empty after a replace without the clause and stayed `{security_invoker=true}` when the clause was restated; the grants survived both ways. Without the option the view runs with its owner's rights and bypasses RLS, so every signed-in user would read every group's enrolments and period arrays. The guards would turn CI red (`task-checkoffs.test.ts:335-349`, `rls-scenarios.sql:1007`), so this is a trap in the text, not a hole in the code.
- **Fix**: Extend that sentence: restate `with (security_invoker = true)` (a replace resets the options, the grants are kept) and keep `task_id, user_id, periods` as the first three columns.
- **Decision**: FIXED. The last sentence of the paragraph (`plan.md:494`) now says that the replace has to keep `task_id`, `user_id` and `periods` as the first three columns and restate `with (security_invoker = true)`, because a replace resets the view's options (without the clause the view would run with its owner's rights and show every group; the grants are kept).

### F2 — The unfiltered view read scans every group's check-offs

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261002090000_create_task_checkoffs.sql:77-81, plan.md:494 and :227 (Phase 3 `listCheckoffPeriods`)
- **Detail**: The view has no group key, so Phase 3's unfiltered `listCheckoffPeriods` reads the check-offs of all groups and RLS filters them afterwards. Measured on the local Postgres 17 with 109,500 rows over 20 groups: 17–44 ms for the unfiltered read against about 6 ms when the read reaches only the viewer's group, linear in the whole table. This is database time, not Worker CPU, and the policy itself adds nothing (the planner hashes its `EXISTS`). The 1000-row cap applies to view rows (enrolments), so a growing log never reaches it. The plan fixed the shape on purpose and the cost is negligible at friend-group scale. One timing point: this migration is not released yet, so changing the view now costs no extra migration, while changing it later needs a second migration (with the trap in F1).
- **Fix A ⭐ Recommended**: Keep the plan's view shape and let Phase 6 read the real `/dashboard` timings; the recipe in the plan (corrected by F1) stays the trigger.
  - Strength: No change to an approved contract; Phase 3's `listCheckoffPeriods(supabase)` and the four concurrent dashboard reads stay as planned; the cost is invisible at a handful of groups.
  - Tradeoff: If groups multiply, the fix is a second migration plus a changed Phase 3 signature.
  - Confidence: HIGH — measured, and the product targets friend groups.
  - Blind spot: Latency on the hosted Supabase project and a real table size were not measured.
- **Fix B**: Add `group_id` to the view now (join `tasks`, group by `t.group_id`) and have Phase 3 read `.eq("group_id", group.id)`.
  - Strength: The read touches only the viewer's group (about 6 ms against 17–44 ms at 20 groups) and no later migration is needed.
  - Tradeoff: Changes the view shape the plan fixed and Phase 3's contract (`listCheckoffPeriods` takes a group id, known right after `getMyGroup`); the view gains a join and a column to test; the Phase 2 suites and the mutation check have to be re-run.
  - Confidence: MED — measured on synthetic data with a hand-written query, not through PostgREST.
  - Blind spot: Whether PostgREST's `.eq("group_id", …)` on the view always pushes the filter below the aggregate.
- **Decision**: ACCEPTED via Fix A. The plan's view shape stays. To keep "Phase 6 reads the real timings" true, the same sentence in `plan.md:494` now tells Phase 6 to read the wall time of `/dashboard` in Workers Logs next to its CPU time (the view read is database time, not Worker CPU; row 6.6 names CPU time only and its title is not renamed), and a note for Phase 6 is queued in `follow-ups/review-fixes.md`.

### F3 — The ascending-order assertion in the SQL scenarios would survive dropping `order by period`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/rls-scenarios.sql:1017 (setup :994-997), tests/integration/task-checkoffs.test.ts:310-321
- **Detail**: The SQL read filters by the whole leading primary-key prefix (`task_id` and `user_id`), which the planner can serve from the primary-key index, already ascending by `period`, so the assertion holds with or without `order by period` in the view. In the implementing session's mutation run the mutant "view: periods unordered" was killed only by Vitest and not by the SQL file, which matches. Vitest reads by `task_id` only and kills it today, but that also depends on the plan the planner picks (a sequential scan on a tiny table). The consequence is small: `snapshotOf` sorts input that is not ascending, so only its linear fast path would be lost.
- **Fix**: In the SQL scenario switch off index, bitmap and index-only scans for the two ordering reads (`set_config(..., true)`, restored after) so the aggregate sees heap order, then re-run the unordered mutant to confirm that the SQL file now kills it.
- **Decision**: FIXED. In `rls-scenarios.sql` the ascending-order read now runs with index, index-only and bitmap scans switched off (transaction-local, switched back on right after the read; the single-period read right below it is not an ordering check and needs no guard). Verified: with `array_agg(period)` in the view the SQL file now fails (`S-04 the view lists an enrolment's periods in ascending order -- expected {2026-09-29,2026-09-30,2026-10-01}, got {2026-10-01,2026-09-29,2026-09-30}`) as well as Vitest; after restoring the migration both are green.

### F4 — Two comment gaps in the integration test

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/task-checkoffs.test.ts:68 and :171-195
- **Detail**: (a) The `beforeEach` comment says every test uses periods between six days back and tomorrow, which stay valid if UTC midnight passes; the window test deliberately uses −7, −8, +2 and ±30 and relies on `clearOfUtcMidnight()` instead. (b) `TRUNCATE` is asserted only in the SQL scenarios (`rls-scenarios.sql:909`) because PostgREST has no TRUNCATE route, but the integration file does not say so, so the gap reads as an omission.
- **Fix**: Reword the comment to "Every test except the window test…" and add one line to the column-grants group saying that TRUNCATE is covered only in `rls-scenarios.sql` because PostgREST offers no route for it.
- **Decision**: FIXED. The `beforeEach` comment now says "Every test except the window test …; the window test waits out the last seconds before midnight instead", and the column-grants group opens with a one-line note that TRUNCATE is covered only in `rls-scenarios.sql` because PostgREST has no route for it. Comment-only; lint is clean.

## Triage result

All four findings were resolved: F1, F3 and F4 fixed, F2 accepted via Fix A. Only the plan text, the SQL scenario file, two comments in the integration test and the follow-ups file changed. Re-run after the fixes:

- `npx supabase db reset`: PASS, all seven migrations apply.
- `npm run test:rls`: PASS, 293 assertions (the count is unchanged: F3 changed how an existing assertion runs and added none).
- `npm test`: PASS, 11 files, 201 tests.
- `npm run lint`: PASS. `npx astro check`: PASS, 85 files, 0 errors, 0 warnings, 0 hints. `npm run build`: PASS.
- Mutant "view: periods unordered" (`array_agg(period)` without `order by period`) after the F3 change: killed by the SQL file and by Vitest; the migration was restored afterwards and both suites are green.
- Manual row 2.6 stays PENDING until the human confirms it; nothing is committed yet.
