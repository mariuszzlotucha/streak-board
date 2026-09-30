<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Test rollout Phase 1 — runner, data isolation and permissions

- **Plan**: context/changes/testing-runner-data-isolation-and-permissions/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Teardown sweep sends an unbounded id list in one request

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/setup/global-setup.ts:88
- **Detail**: `sweepLeftovers` collects every leftover test user and runs `groups.delete().in("owner_id", leftovers)` as one PostgREST request. After many crashed runs (hundreds of leftovers) the URL can exceed the request-size limit, the sweep throws in teardown and the leftovers are never cleaned.
- **Fix**: Delete groups in chunks of ~100 ids.
- **Decision**: FIXED — sweep deletes groups in chunks of 100 ids (tests/setup/global-setup.ts).

### F2 — Duplicated admin read helpers in the two scenario files

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/group-isolation.test.ts:41, tests/integration/group-permissions.test.ts:40
- **Detail**: `adminGroupA` and `adminMemberIdsOfA` are defined in both files with near-identical bodies (the permissions variant selects more columns). A third scenario file would copy them again.
- **Fix**: Move a parameterised `adminMemberIds(groupId)` into `tests/helpers/supabase.ts` and reuse it.
- **Decision**: FIXED — shared adminMemberIds(groupId) in tests/helpers/supabase.ts, both scenario files use it.

## Evidence

- Plan vs diff: every planned file exists and matches intent (vitest.config.ts, global-setup, helpers, foundation/isolation/permissions tests, ci.yml `integration` job, `test`/`test:rls` scripts, README, CLAUDE.md, test-plan.md). Only extra is `tests/setup/constants.ts` (justified, noted in the Phase 1 review). No app, migration or `src/types.ts` changes.
- Re-run at fresh `master` (5e80a12): `npm test` 3 files / 22 tests pass; `npm run test:rls` ALL RLS SCENARIOS PASSED (78 assertions); unreachable stack and non-local URL both fail loudly with the expected messages; `npm run lint`, `astro check` (0 errors), prettier on ci.yml and `npm run build` clean.
- CI: PR #10 checks `ci`, `integration`, `smoke` all pass.
- Row 4.8 verified: ruleset "master protection" (active, default branch) requires the `integration` status check. Only `integration` is required; `ci` and `smoke` are not.
- Every denial test has a paired positive control and re-reads state through the admin client; all previous phase-review decisions are recorded as FIXED/ACCEPTED.
- Lessons: phase branches/PRs, English commit messages and "review on fresh master" were followed; no production release step applies (test-only change, per plan).
