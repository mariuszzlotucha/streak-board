<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task join and leave

- **Plan**: context/changes/task-join-and-leave/plan.md
- **Scope**: Phase 4 of 4
- **Reviewed phases**: 4
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria

- 4.1 `gh pr checks 38`: PASS (`ci`, `integration`, `smoke` pass; `release` skipping on the PR). Master run 36796008409 for `d67717b`: all jobs green.
- 4.2 Release: PASS. Run 36796008409 finished `completed/success`. Its log shows `migration list` with `20261001090000` as local-only, then `db push` applying only `20261001090000_create_task_participants.sql`, then the Worker deploy and the live check.
- 4.3 Production check: ticked on the user's confirmation ("check passed", given after the release finished at 00:31 UTC). Not observable in the diff or in CI. The agent's own anonymous probes (redirects, foreign-Origin 403) cannot tell the new routes from missing ones and were not counted as evidence.
- 4.4 Note in `deployment-plan.md`: PASS. A Phase 8 entry holds the date, the migration, the run and the result.
- Phase scope: 3 files, all Markdown (`deployment-plan.md`, `plan.md`, `change.md`). No code or migration changed, so lint, build and tests were not re-run.

## Findings

### F1 — Phase 4 criteria no longer match what happened

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/task-join-and-leave/plan.md:218-244 (Phase 4), Progress 4.1-4.2
- **Detail**: Step 4.2 says to confirm that "the merge commit" lists the migration. The migration shipped with the phase 1 merge (`e3c2d48`, PR #36), not with the last merge (`d67717b`), because the phase 1 release run was cancelled and the phase 2 run was superseded. Step 4.1 was ticked against PR #38, the phase 3 PR whose merge started the release; phase 4 has no PR of its own yet. Only `deployment-plan.md` records the real sequence; the plan reads as if the migration arrived with the final merge, as phase 3 did before its addendum.
- **Fix**: Add a Phase 4 addendum to plan.md stating that the migration reached production with the run for the phase 3 merge (not the last merge commit) and that 4.1 refers to PR #38.
- **Decision**: FIXED (Phase 4 addendum added to plan.md)

### F2 — Probe remark in the deployment record

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/deployment/deployment-plan.md:166 (Phase 8 production-check line)
- **Detail**: The entries for Phases 6 and 7 record the date, what was run and the result. The Phase 8 check line adds a sentence about anonymous probes that "cannot tell the new routes from missing ones". Those probes are not recorded anywhere else, so the sentence leaves a future reader asking which probes, and it belongs to this session's reasoning rather than to the release record.
- **Fix**: Drop that sentence so the line matches the style of Phases 6 and 7.
- **Decision**: FIXED (probe sentence removed from the Phase 8 check line)
