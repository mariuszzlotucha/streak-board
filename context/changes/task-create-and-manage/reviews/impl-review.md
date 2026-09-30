<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task Create and Manage

- **Plan**: context/changes/task-create-and-manage/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (only minor EXTRAs already accepted in phase reviews) |
| Scope Discipline | PASS |
| Safety & Quality | WARNING (F1) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Gates run on fresh master (093d122): lint 0 errors, `astro check` 0 errors, `npm test` 52/52, `npm run test:rls` 111 assertions, `npm run build`, `npm run smoke` all steps passed against a preview built with the local Supabase env.

## Findings

### F1 — Anonymous insert test asserts only "some error"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/task-isolation.test.ts:113-120 (and :75-80)
- **Detail**: The anon insert test passes on any error (network, typo in the payload), and the anon select accepts `null` or 42501. The table has `revoke all ... from anon`, so the expected code is exactly 42501; the follow-up "row does not exist" check partly compensates.
- **Fix**: Assert `error?.code === "42501"` for the anon insert and select.
- **Decision**: FIXED via Fix now

### F2 — No test that a former member cannot insert a task

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/task-permissions.test.ts (left-the-group case)
- **Detail**: The insert policy requires current membership, but only never-members are tested for insert; the "left the group" case covers update/delete only.
- **Fix**: Add an insert attempt (expect 42501) to the left-the-group test.
- **Decision**: FIXED via Fix now

### F3 — Orphaned tasks cannot be moderated by the group owner

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260930120000_create_tasks.sql:56-63
- **Detail**: A task whose creator left or was removed stays visible and unmanageable until they rejoin or the group/account is deleted. This is an explicit decision in the plan ("What We're NOT Doing") and the PRD accepts it; reported only so it stays visible.
- **Fix**: No change now; revisit with S-03/S-04 (owner DELETE policy) if it bites.
- **Decision**: ACCEPTED (plan-documented decision; revisit with S-03/S-04 if it bites)

### F4 — No cap or pagination on tasks per group

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/tasks.ts:29-42
- **Detail**: Any member can insert unlimited rows and the dashboard reads them all. The plan excludes limits and pagination for a friends-circle scale.
- **Fix**: No change now; add a per-group cap if the scale assumption changes.
- **Decision**: ACCEPTED (plan excludes limits; revisit if scale changes)

### F5 — getTask throws on an unknown recurrence value

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tasks.ts:24
- **Detail**: Unreachable while the CHECK holds; if it ever broke, the creator could neither edit nor delete the row (`unknown` error).
- **Fix**: No change; the DB CHECK is the guard.
- **Decision**: ACCEPTED (unreachable while the DB CHECK holds)
