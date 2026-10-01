<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Check-off and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

Reviewed on a fresh `master` (`1f99a0e`, the merge of PR #52) after all six phase PRs (#44, #45, #49, #50, #51, #52) were merged.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Progress row 6.2 is still unticked although `integration` is green

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/checkoff-and-leaderboard/plan.md:591
- **Detail**: Row 6.2 ("The required `integration` check is green on the PR to `master`") is the only `- [ ]` left in `## Progress`. `gh pr checks 52` shows `ci`, `integration` and `smoke` passed (run 36918504681, head `268221b`). The row could not be ticked in the PR itself, because the check result only exists once CI has run on the commit that would contain the tick.
- **Fix**: Tick row 6.2 with ` — 268221b` on the review-fix branch.
- **Decision**: FIXED — row 6.2 ticked with 268221b.

### F2 — The `/dashboard` CPU time was never measured

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/deployment/deployment-plan.md (Phase 9), plan.md:599
- **Detail**: Row 6.6 asked for the real CPU and wall time of a `/dashboard` request on production, because the 10 ms Workers Free-plan CPU limit is the one budget the slice could exceed. The only evidence is the Node prototype in the plan (about 1 ms for 15 enrolments × 365 periods, Node and not workerd) plus the phase 1 measurement. The user accepted the risk without a reading (phase 6 review F1). Carried over here so the full-plan report is complete; it is not re-triaged.
- **Fix**: None now. Revisit if CPU-limit errors appear or `/dashboard` slows with more groups; the additive `create or replace view` recipe is in the plan's Performance Considerations.
- **Decision**: ACCEPTED — carried over from the phase 6 review (user, 2026-10-01: "przyjmij ze zegar jest ok"); no value was measured or recorded.

### F3 — The queued follow-up for the `/dashboard` reading contradicts the accepted outcome

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/checkoff-and-leaderboard/follow-ups/review-fixes.md:7
- **Detail**: Item "Phase 6, the `/dashboard` reading (row 6.6)" still tells a reader to note the wall and CPU time in `deployment-plan.md` and to apply the `group_id` recipe if the wall time grows. Phase 6 ended with the reading accepted unmeasured, so the item reads as open work that nobody will do.
- **Fix**: Mark the item resolved by acceptance and point to `deployment-plan.md` Phase 9, keeping the trigger for revisiting it.
- **Decision**: FIXED — follow-up marked resolved by acceptance, revisit trigger kept.

### F4 — Unrelated Stryker setup landed on the phase 2 PR

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: stryker.config.json, package.json, package-lock.json (commit c739c7e, PR #45)
- **Detail**: Commit `c739c7e` "chore(test): add Stryker mutation testing setup" is in the phase 2 PR but not in the plan, and `reviews/impl-review-phase-2.md` does not mention it. It is tooling only (a config file, two devDependencies, a `.gitignore` line) and touches no slice code. The `.claude/` hooks, Playwright and e2e files in the same date range came in through their own PRs (#46, #47, #48) and are not part of this slice.
- **Fix**: None needed; recorded here so the plan's diff and the reviews agree.
- **Decision**: SKIPPED — recorded in this report.

## Checked and dismissed

- **Origin check on the new routes**: both read only `formData()`; a JSON body makes `formData()` throw, which ends in the handler's catch (500), and a cross-origin JSON `fetch` needs a preflight anyway. The foreign-Origin 403 is asserted in smoke for both response modes.
- **Insert window against the Warsaw week**: the Monday of the current Warsaw week is at least `UTC today − 6` and Warsaw is never behind UTC, so the policy window `[−7, +1]` always admits the app's own period.
- **Stale page across Warsaw midnight**: `sendCheckoff` compares the returned period with the expected one and the island reloads on `stale`; an undo of a closed period is a quiet no-op, as the plan says (only the current period can be undone).
- **`once` tasks**: `checkOff` records the day key, `uncheck` deletes every row, the island passes no expected period; several rows still count as 1.
- **View privacy**: `security_invoker = true` is stated in the migration and proven by the outsider tests (SQL scenarios and Vitest) and by the phase 2 mutation check.

## Success criteria run on the fresh `master`

| Check | Result |
|-------|--------|
| `npm run lint` | pass |
| `npx astro check` | 0 errors, 0 warnings, 0 hints |
| `npm run build` | pass |
| `npm test` | 14 files, 241 tests passed |
| `npm run test:rls` | ALL RLS SCENARIOS PASSED (293 assertions) |
| `npm run smoke` | not re-run locally; passed in CI on PR #52 (run 36918504681) |
| Progress | 41 of 42 rows `[x]`; the open row is 6.2 (F1) |

## How this was reviewed

Inline, without subagents, on top of the six per-phase reviews. Read in full in this pass: the migration, `src/lib/checkoffs.ts`, both routes and `checkoff-response.ts`, `checkoff-client.ts`, `checkoff-sync.ts`, `CheckoffControl.tsx`, `Leaderboard.tsx`, `leaderboard-rules.ts`, the data-loading and render blocks of `dashboard.astro`, and `checkoff-client.test.ts`. Not re-read in this pass: `streak-rules.ts` and its tests, `scripts/smoke.mjs`, `rls-scenarios.sql` and the integration tests; they were reviewed in phases 1–5 and are covered here by the green gates above.

## Triage

F1 and F3 fixed on the review-fix branch, F4 skipped; F2 stays accepted from the phase 6 review. Fixed: F1, F3. Skipped: F4. Accepted: F2.
