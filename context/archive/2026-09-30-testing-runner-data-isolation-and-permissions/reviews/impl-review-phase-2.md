<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Test rollout Phase 1 — runner, data isolation and permissions

- **Plan**: context/changes/testing-runner-data-isolation-and-permissions/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warnings, 1 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- `npm test` 14/14, `npm run lint`, `npx astro check` green (re-run during review).
- Extra mutation checks (each restored afterwards, policies verified identical to the originals):
  - `groups_select_own_group` using (true): 3 tests red (caught).
  - `group_members_select_own_group` using (true): 1 test red (caught).
  - `groups_update_by_owner` using (true): all green (masked by the select policy, see F2).
  - `groups_delete_by_owner` using (true): all green (masked by the select policy, see F2).
  - `groups_insert_as_owner` with check (true): all green (NOT caught, see F1).
- F1 hypothesis verified: with `.select("id")` removed from the insert, the same mutation turns the test red.

## Findings

### F1 — Denied inserts are asserted with `.select()`, so 42501 can come from RETURNING instead of the INSERT policy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/group-isolation.test.ts:176 (and :161-164)
- **Detail**: `c.client.from("groups").insert({ name: "Forged", owner_id: a.id }).select("id")` asks for the inserted row back, which needs SELECT visibility. C cannot see a group owned by A, so PostgREST answers 42501 even when the INSERT policy is weakened. With `groups_insert_as_owner` set to `with check (true)` the test stayed green (verified); without `.select` it goes red. The same shape is used for B's insert into `group_members` (`.select("user_id")`), where the denial is also partly explained by the SELECT policy.
- **Fix**: Drop `.select(...)` from both denied inserts (keep asserting `error.code === "42501"`; the admin re-read already proves nothing was written).
- **Decision**: FIXED — dropped `.select(...)` from both denied inserts; with `groups_insert_as_owner` set to `with check (true)` the test now goes red; suite, lint and astro check green.

### F2 — Update/delete denial tests are shadowed by the SELECT policy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/group-isolation.test.ts:131-158
- **Detail**: B cannot see GA, so 0-row updates/deletes hold even if `groups_update_by_owner` / `groups_delete_by_owner` were open (verified with `using (true)`). That is defence in depth and matches the plan's scope for outsiders; the owner-condition of those policies is exercised by members (who can see GA) in Phase 3.
- **Fix**: No change; make sure Phase 3 mutation checks target `groups_update_by_owner` / `groups_delete_by_owner` too.
- **Decision**: ACCEPTED — no change needed (fix is "no change"); Phase 3 mutation checks must target `groups_update_by_owner` / `groups_delete_by_owner`.
