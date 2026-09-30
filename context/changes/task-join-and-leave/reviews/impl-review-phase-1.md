<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task join and leave

- **Plan**: context/changes/task-join-and-leave/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria: 1.1-1.5 were run at commit e3c2d48 (db reset OK, build OK, test:rls 154 assertions, npm test 68/68, lint clean) plus a break-check (11 tests red on broken DB); manual 1.6 (backfill) was executed by the assistant at the user's request and showed both creators enrolled in their own task.

## Findings

### F1 — Backfill enrols creators who are no longer group members

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001090000_create_task_participants.sql:115-118
- **Detail**: The backfill inserts `(id, created_by)` for every task. `create_tasks.sql` lets a creator who left the group keep the task, so after the backfill such an ex-member appears as participant to the group, breaking the "participant is always a member" invariant, and cannot remove the row themselves (the select policy hides it from them).
- **Fix**: Restrict the backfill with `where exists (select 1 from public.group_members gm where gm.group_id = t.group_id and gm.user_id = t.created_by)`.
  - Strength: Keeps the invariant the header states; one-line change.
  - Tradeoff: Plan text says "every existing task"; needs a plan addendum.
  - Confidence: HIGH — mirrors the cleanup trigger semantics.
  - Blind spot: Migration is not yet applied to production, so it can still be edited.
- **Decision**: FIXED — backfill now joins group_members (verified with a departed creator: not enrolled)

### F2 — Join racing with leaving the group can leave a ghost participant

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001090000_create_task_participants.sql:49-54, 88-109
- **Detail**: A concurrent join (policy sees committed membership) and leave/removal (trigger cannot see the uncommitted participant row) can both commit, leaving a participant row for a non-member that the ex-member cannot delete.
- **Fix A ⭐ Recommended**: Accept and document the race in the migration header.
  - Strength: Needs a two-transaction race inside milliseconds in a small-group MVP; keeps the model simple.
  - Tradeoff: A ghost row is possible, and it becomes live again if the user rejoins the group.
  - Confidence: MED — impact is cosmetic (a stale email in a list).
  - Blind spot: Not reproduced under real concurrency.
- **Fix B**: BEFORE INSERT trigger taking `for share` on the membership row.
  - Strength: Serialises against the leave; closes the race.
  - Tradeoff: Third trigger and extra locking on a rare path.
  - Confidence: MED — locking semantics not tested here.
  - Blind spot: Interaction with the SECURITY DEFINER cleanup trigger untested.
- **Decision**: FIXED via Fix A — race documented in the migration header

### F3 — Ex-member scenarios are not asserted as the user themselves

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/task-participation.test.ts, supabase/checks/rls-scenarios.sql (S-03)
- **Detail**: Tests cover users who were never members (B, X, anon), but not a user who left or was removed: reading participants, re-joining a task, and (for F1) a backfill case with a departed creator. Dropping the tasks-visibility clause from the policies would only be caught for never-members.
- **Fix**: Add "ex-member reads 0 rows and cannot join (42501)" to both the Vitest file and the SQL scenarios, plus a backfill scenario if F1 is fixed.
- **Decision**: FIXED — ex-member tests added to Vitest (3 tests) and SQL scenarios (2 assertions)

### F4 — Initplan check for the new table is vacuous in its positive half

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/rls-scenarios.sql (#6 check, ~311-322)
- **Detail**: Adding `task_participants` to the `count(*) > 0` list is already satisfied by other tables. The negative check (no bare `auth.uid()`) does cover the new policies.
- **Fix**: Add a per-policy assertion for `task_participants_insert_self` / `_delete_self`.
- **Decision**: FIXED — per-policy initplan assertion added

### F5 — Leaving a group deletes participation irreversibly

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: supabase/migrations/20261001090000_create_task_participants.sql:85-109
- **Detail**: If S-04 keys check-offs to `(task_id, user_id)` with a cascading FK, leaving a group would destroy that history. The plan explicitly defers this decision to S-04.
- **Fix**: No change now; revisit in S-04 planning.
- **Decision**: SKIPPED — plan defers to S-04
