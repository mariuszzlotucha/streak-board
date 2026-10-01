<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Checkoff and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Scope**: Phase 3 of 6
- **Reviewed phases**: 3
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

Reviewed state: commit `05cc307` on branch `s-04/checkoff-and-leaderboard/phase-3` (on top of master `1d50204`), 9 files: the seven planned files (`src/lib/checkoffs.ts`, `src/lib/checkoff-response.ts`, `src/lib/tasks.ts`, `src/pages/api/tasks/checkoff.ts`, `src/pages/api/tasks/uncheck.ts`, `tests/integration/task-checkoff-flow.test.ts`, `scripts/smoke.mjs`) plus `plan.md` and `roadmap.md`. The SHA write-back into the six Progress rows of Phase 3 is the only uncommitted change.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Summary

Every planned item is implemented as the plan describes, no planned file is missing and no "NOT doing" boundary is crossed. The one intentional deviation (the weekly `uncheck` deleting the whole current week) comes from the accepted Phase 2 follow-up and is implemented and tested. Both reviewers found no authorization, injection, CSRF, data-safety or error-mapping defect. The warning is a coverage gap: the no-JavaScript success path (form POST answered with a 302) is asserted nowhere in this phase, only the JSON mode is. The three observations are small: a midnight window in one smoke step, a duplicated test helper, and the fact that smoke cannot yet observe persistence or the cascade, which Phase 4 adds.

## Success Criteria

Re-run during this review (2026-10-01, on the committed tree):

- 3.1 `npm test`: PASS. 12 files, 218 tests (17 new in `task-checkoff-flow.test.ts`).
- 3.2 `npm run lint`: PASS. Clean.
- 3.3 `npm run build`: PASS.
- 3.4 `npm run smoke`: PASS. 155 steps, no failure (build + `npm run preview` on :4321, local stack).
- 3.6 `npx astro check`: PASS. 96 files, 0 errors, 0 warnings, 0 hints.
- 3.5 manual (browser `fetch` answers `{"ok":true,"period":"<today in Warsaw>"}` and a repeat answers the same period): confirmed by the human in the implementing session on 2026-10-01. A diff cannot carry browser evidence, so this is taken from the confirmation, not from the code.

Deliberate break-check from the implementing session (re-reported, not re-run here): 4 mutations of `src/lib/checkoffs.ts` (weekly undo deleting only the Monday row, `23503` no longer forbidden, `once` undo limited to the current period, daily undo deleting every period) each turned exactly the test that guards it red; 2 mutations of `src/lib/checkoff-response.ts` (no `Cache-Control: no-store`, a wrong `period`) turned the smoke JSON steps red. All files were restored from the staged copy.

## How this was reviewed

Two independent, read-only reviewers worked on the commit (neither ran a gate or touched the database); the main session ran the gates above and re-read the code behind findings F1 to F3.

- Plan adherence: every contract bullet of the four "Changes Required" blocks checked against the files (all MATCH), extras listed (all harmless), "NOT doing" boundaries checked (none crossed), smoke steps checked for assertions weaker than their names.
- Safety, quality and patterns: authn/authz on both routes and in both modes, task visibility through RLS, caller-only rows, SQLSTATE mapping, idempotency, races (tick racing a leave or a delete), JSON information leaks, caching, `Accept` parsing, the body being read only with `formData()`, the weekly range arithmetic (DST, month and year edges), the insert window against the clock, test and smoke reliability (UTC midnight, independence of the Warsaw oracle, a step runner that could mask failures), and pattern comparison with `join.ts`, `leave.ts`, `tasks.ts`, `task-participation.test.ts` and `task-checkoffs.test.ts`.

Checked and dismissed:

- **Re-tick of a `once` task on a later day, or of a weekly task on another day of the same week, inserts one more row** (different primary key) and answers ok. Harmless: `snapshotOf` collapses the keys, `uncheck` removes every row, and the Phase 4 control hides the button once a period is ticked.
- **A race between `getTask` and the insert (task deleted or left meanwhile) ends in a loud `forbidden`**, where `join.ts` would be quiet. The plan fixes this mapping (`23503` and `42501` give forbidden), so it is not a deviation.
- **A signed-out JSON call gets `302 /auth/signin` from the middleware**, which `fetch` follows by default. Phase 5 already specifies `redirect: "manual"` and maps the opaque redirect to `failed`.
- **A missing or JSON Content-Type makes `formData()` throw and is answered `500 unknown`**, like the sibling routes; it has no side effect and only costs a log line.
- **The smoke Warsaw-date oracle tells Warsaw from UTC only during the one or two hours a day when the two dates differ.** The fixed-instant unit tests of Phase 1 are the real guard; this is a limitation of smoke, not a bug.
- **The period expectations of the flow test use `periodKeyFor` itself** (the plan asks for exactly that: "period equals `periodKeyFor` for the same instant"); the independent oracle lives in the Phase 1 unit tests.
- **`42501` can also mean a missing grant and would then surface silently as `forbidden`.** Consistent with `toGroupErrorCode`; the grants are pinned by the Phase 2 suites.
- **The row-cap throw and the null-dropping in `listCheckoffPeriods` have no test**; both are unreachable at the target scale and the guard is a copy of the tested one in `listTaskParticipants`.

## Findings

### F1 — The no-JavaScript success path is asserted nowhere

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:990-1061, src/lib/checkoff-response.ts:25-34
- **Detail**: Redirect mode is exercised only for the boundaries (anonymous, foreign Origin, malformed id, unknown task id). The successful tick, the repeated tick, the `forbidden` redirect (`?error=forbidden`) and the successful undo are asserted only in JSON mode, and `checkoffResponse` has no other test. A wrong target on the ok redirect or a broken `Accept` check (a browser form post sends `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`, which must stay in redirect mode) would not turn anything red until Phase 4's smoke builds on the form path. The plan promises that the plain forms keep working without JavaScript, and Phase 5 depends on it.
- **Fix**: Add redirect-mode smoke steps with a browser-like `Accept` header, placed after "repeating the JSON uncheck" so the net state stays empty: B's tick, B's undo and a repeated undo answer `302 /dashboard`, and C's tick answers `302 /dashboard?error=forbidden`.
- **Decision**: FIXED. `scripts/smoke.mjs` has a `BROWSER_ACCEPT` constant (`text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`) and four new steps between "repeating the JSON uncheck is a quiet ok" and "task leave by a member succeeds": B's form tick and B's form undo answer `302 /dashboard`, C's form tick answers `302 /dashboard?error=forbidden`, a repeated form undo is a quiet `302 /dashboard`. Break-check: with the ok-redirect target changed to `/dashboard?done=1` and the forbidden redirect target changed to `/dashboard` in `checkoff-response.ts`, exactly these four steps went red and every older step stayed green (so the gap was real); the file was restored from the committed version and `dist/` rebuilt.

### F2 — The repeated-tick smoke step has no midnight tolerance

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:1035-1044
- **Detail**: The first tick accepts the Warsaw day computed before and after the request, but the repeat step requires exactly the period of the first answer. If Warsaw midnight falls between the two requests, the step fails although the app is right (a repeat on the new day legitimately answers the new period). The window is a few milliseconds a day, so this is a rare CI flake, not a defect.
- **Fix**: Accept the first period or any day of the repeat's own before/after bracket.
- **Decision**: FIXED. The repeat now goes through `postForJson` and is judged by `periodAnswer([tickedPeriod, ...actual.days])`: the exact body shape and `Cache-Control: no-store` are still required, and the period may be the first tick's or either day of the repeat's own Warsaw-day bracket. The first tick keeps asserting the independent Warsaw-date oracle, so a wrong period still fails there.

### F3 — `clearOfUtcMidnight` is copied between the two check-off test files

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/task-checkoff-flow.test.ts:33-40, tests/integration/task-checkoffs.test.ts:30-35
- **Detail**: The helper and the day-length constant exist twice, character for character, and the shared helper file `tests/helpers/supabase.ts` already holds the sibling `utcDay`. A later change to the window logic has to be made in two places.
- **Fix**: Move `clearOfUtcMidnight` into `tests/helpers/supabase.ts` next to `utcDay` and import it in both files.
- **Decision**: FIXED. `clearOfUtcMidnight` is exported from `tests/helpers/supabase.ts` (next to `utcDay`, same body and comment) and imported by `task-checkoffs.test.ts` (Phase 2) and `task-checkoff-flow.test.ts`; both local copies are gone. `DAY_MS` stays in the flow test, where `addDays` and the "three days ago" and "yesterday" instants still use it.

### F4 — Smoke cannot yet observe persistence, the undo or the cascade

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:1052-1061 (and the "Leaving erases history" row of the plan's test table)
- **Detail**: The dashboard shows no check-offs until Phase 4, so "B's JSON uncheck answers ok" and its repeat cannot tell a working undo from a no-op, and no smoke step observes that leaving erases history. The step names are honest (they say "answers ok"), and the integration tests pin the behaviour (daily, weekly and `once` undo, other users' rows, the cascade). Phase 4 plans the observable steps ("B ticks, then leaves the task", the undo returning every total to 0).
- **Fix**: None needed in this phase; carry it into Phase 4's smoke steps (already in the plan).
- **Decision**: ACCEPTED. No change in this phase: the step names are honest, the integration tests pin the behaviour, and Phase 4's planned smoke steps (plan.md, Phase 4 §5: "B ticks, then leaves the task", "B undoes: ... all totals 0 at position 1") make persistence, undo and the cascade observable.

## Triage result

All four findings were resolved: F1, F2 and F3 fixed, F4 accepted (Phase 4 covers it). Only `scripts/smoke.mjs`, `tests/helpers/supabase.ts`, the two check-off integration test files and this report changed; no production code was touched. Re-run after the fixes:

- `npm test`: PASS. 12 files, 218 tests (unchanged count: F3 moved a helper, F1 and F2 touch smoke only).
- `npm run lint`: PASS. `npx astro check`: PASS, 96 files, 0 errors, 0 warnings, 0 hints.
- `npm run smoke`: PASS. 159 steps (155 before, 4 new redirect-mode steps), no failure.
- Break-check of the new steps: PASS (see F1).
