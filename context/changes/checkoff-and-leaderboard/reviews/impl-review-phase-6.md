<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Check-off and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Scope**: Phase 6 of 6
- **Reviewed phases**: 6
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Production CPU/wall reading of /dashboard is still open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 6.6; context/changes/deployment/deployment-plan.md (Phase 9 entry)
- **Detail**: The user has not read the CPU and wall time of `/dashboard` in Workers Logs yet, so 6.6 stays unchecked and the Phase 9 entry has an open item. It is the only measurement of the Performance Considerations budget (10 ms CPU on the Free plan) that could not be made locally, and the change cannot be closed with an unmeasured risk.
- **Fix**: Read the values in Workers Logs, add them with the plan's CPU limit to the Phase 9 entry, tick 6.6 in a follow-up commit before the full-plan review.
- **Decision**: SKIPPED — the user has not read the Workers Logs yet; row 6.6 and the Phase 9 entry stay open and the reading is queued in follow-ups/review-fixes.md.

### F2 — Two claims in test-plan §6.6 go beyond what was verified

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md, §6.6 "Etap 4"
- **Detail**: The note says the DST/Warsaw oracle rows "catch an implementation on `getUTC*` or fixed 24 h" and that mutation checks found "several" assertions that protected nothing. Only one such weakness is documented (the `applyDeltas` input test, Phase 5 review F6) and no break-check against a UTC or 24 h implementation was run.
- **Fix**: Reword to what was observed: the Warsaw day differs from the UTC date at Monday 00:30, and one mutation check exposed a test that did not tell mutation from copy.
- **Decision**: FIXED — both claims in test-plan §6.6 reworded to what was observed.

## Checked and dismissed

- Plan §1–§2 contract met: README routes table, RLS paragraph, Smoke and Tests paragraphs; CLAUDE.md both lines; test-plan row, gate, §6.1, §6.6, header, ledger line, stack row; Phase 9 entry with date, migration, run, result.
- Release facts match the log of run 36917515328: only `20261002090000_create_task_checkoffs.sql` applied, Worker version `9956ddb1-…`, live check passed.
- Prettier realigned the existing tables in README.md and test-plan.md (wider diff); lint-staged does this on every commit, so it is not a finding.
- Rows 6.3–6.5 were ticked on the user's confirmation; the deployment entry records them as done by hand by the user. 6.2 stays open until the phase PR's `integration` check is green.

## How this was reviewed

Inline by the main session (a five-file docs diff does not justify two subagents): the diff of `1b59c73` read against the Phase 6 plan text, claims checked against `vitest.config.ts`, `infrastructure.md` and the release run log. `npm run lint`, `npx astro check` and `npm run build` were green after the docs edits.

## Triage

F1 skipped (reading still to be made by the user), F2 fixed. Full-plan review runs after the reading is recorded or with 6.6 listed as open.
