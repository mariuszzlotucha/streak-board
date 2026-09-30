<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task Create and Manage

- **Plan**: context/changes/task-create-and-manage/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-09-30
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 3 observations

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

### F1 — anon keeps table-level select/insert privileges on tasks

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260930120000_create_tasks.sql:38
- **Detail**: `has_table_privilege('anon','public.tasks','select'/'insert')` is true (Supabase default grants). RLS with no anon policy blocks access (tests prove it), so only defence in depth is missing. `groups` has the same shape.
- **Fix**: Add `revoke all on public.tasks from anon;` in a later migration if desired; not needed for correctness.
- **Decision**: FIXED (Fix now)

### F2 — createTaskAs read-back is ambiguous for repeated titles

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/helpers/supabase.ts:80-100
- **Detail**: The id is read back by group, creator and title; two tasks with the same title by the same user return an arbitrary one (created_at ties possible). Current tests use distinct titles.
- **Fix**: Use unique titles in tests, or read back via `.insert(...).select("id")` (insert policy plus select policy allow RETURNING for members).
- **Decision**: FIXED (Fix now)

### F3 — no index on tasks.created_by

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260930120000_create_tasks.sql:30
- **Detail**: The created_by cascade scans tasks on account deletion. Irrelevant at the planned scale (circle of friends); the plan specifies only tasks_group_id_idx.
- **Fix**: None needed now.
- **Decision**: FIXED (Fix now)
