<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Usunięcie konta i przekazanie własności grupy (S-15 `account-deletion`)

- **Plan**: `context/changes/account-deletion/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-16
- **Verdict**: REVISE → SOUND after triage (all four findings fixed in the plan)
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

27/27 paths ✓, 6/6 symbols ✓ (`normalizeUuid`, `reportMapped`, `toGroupErrorCode`, the `form`-attribute confirm button in `ConfirmAction.tsx:74-80`, `group_members_delete_self`, the `revoke execute … from public, anon, authenticated` pattern), brief↔plan ✓, Progress↔Phase 28/28 ✓. Verified in the main session (no subagent): the `compat` job runs the deployed commit's smoke, which deletes no users (`.github/workflows/ci.yml:217-272`, `scripts/smoke.mjs`), so `restrict` on `tasks.created_by` keeps it green.

## Findings

### F1 — New routes miss the route coverage test and the fake client

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §4, Phase 3 §2, Testing Strategy
- **Detail**: `tests/integration/data-routes.test.ts:1188-1208` requires exactly 14 route files under `src/pages/api` (except `auth`), each with a row and a recorded call chain; the three new routes turn `npm test` red. `tests/helpers/fake-supabase.ts` scripts only `from` and `rpc`, while `account/delete` also calls `auth.signOut()`. The Testing Strategy promises route tests "in the style of data-routes", but no phase lists these files.
- **Fix**: Phase 2 §4 and Phase 3 §2 list `tests/integration/data-routes.test.ts` (rows per new route, count 14 → 16 → 17); Phase 3 §2 lists `tests/helpers/fake-supabase.ts` (`auth.signOut()` with a scripted result, recorded in the call chain).
- **Decision**: FIXED

### F2 — Admin API does not return 23503

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 (reversed cascade tests), Phase 4 §3 (README)
- **Detail**: Local probe 2026-10-16: `auth.admin.deleteUser` for a user referenced by a `restrict` FK (`groups.owner_id`) returns `AuthRetryableFetchError`, status 500, message "Database error deleting user"; no SQLSTATE in the error. An assertion on "23503 in the details" fails.
- **Fix**: The reversed tests assert status 500 and "Database error deleting user" plus intact task and other members' check-offs; 23503 stays only in `rls-scenarios.sql` (plain SQL `delete`). The README says the Supabase dashboard reports "Database error deleting user".
- **Decision**: FIXED

### F3 — The group lock does not stop the successor leaving at the same time

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — "Kolejność w `delete_account`"
- **Detail**: The plan says `for update` on the group row plus the successor check in the same transaction stop a concurrent leave. Leaving (`src/pages/api/groups/leave.ts:23`) deletes from `group_members` under RLS and never touches the `groups` row, so a leave committed in the same milliseconds can leave an owner outside the group. The lock does serialise two transfers or deletions by the same owner and holds off a join (its FK key-share lock waits).
- **Fix A ⭐ Recommended**: Correct the claim and record the window as accepted
  - Strength: Same as the repo precedent (`20261001090000_create_task_participants.sql:16-19`).
  - Tradeoff: The window stays; an operator repairs the result in SQL.
  - Confidence: HIGH — it needs two people within milliseconds.
  - Blind spot: None significant.
- **Fix B**: `before delete` trigger on `group_members` that locks the group row `for share` and rejects deleting the owner's membership
  - Strength: Closes the race in the database; the invariant stops depending only on the RLS subquery.
  - Tradeoff: A new trigger on a hot table and checks that the group-delete and account-delete cascades still work; the race itself is hard to test.
  - Confidence: MED — cascade and READ COMMITTED behaviour need checking.
  - Blind spot: Trigger order against the cascade when the whole group is deleted.
- **Decision**: FIXED (Fix A)

### F4 — Two open hedges the implementer would have to settle

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4, Phase 2 §7
- **Detail**: (a) `rls-scenarios.sql:1204` and `:1288` are marked "if they hit the new restrict"; `m` and `b` create no tasks there, so neither does. (b) The smoke step "transfer with a foreign `new_owner_id` → `invalid_successor`" runs after the transfer; sent by the former owner it answers `forbidden`.
- **Fix**: (a) State that both stay unchanged. (b) The new owner sends that POST.
- **Decision**: FIXED
