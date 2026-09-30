<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task Create and Manage

- **Plan**: context/changes/task-create-and-manage/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run on the phase branch: `npm run lint` clean, `astro check` 0 errors, `npm test` 52/52 passing, `"/api/tasks"` present in `PROTECTED_ROUTES`; build and `npm run smoke` (incl. the 12 new task steps) passed before the commit. Manual 2.6/2.7 were checked over HTTP against the local stack with a read-back of the rows through the admin key. Every planned file matches its Changes Required block; the diff holds no unplanned production files (the lessons.md entry is the requested process rule).

## Findings

### F1 — Drift test reads the migration by a cwd-relative path

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/task-rules.test.ts:46
- **Detail**: The "matches the database CHECK" test uses `readdirSync("supabase/migrations")`, which only works when vitest runs from the repo root (true for `npm test` and CI). The regex also assumes the CHECK stays on one line in the `tasks_recurrence_allowed` constraint.
- **Fix**: Resolve the directory with `fileURLToPath(new URL("../../supabase/migrations", import.meta.url))`.
- **Decision**: FIXED via Fix now

### F2 — getTask casts the row to GroupTask

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tasks.ts:21
- **Detail**: Generated types declare `recurrence` as `string`, so `data as GroupTask | null` narrows it unchecked. The DB CHECK guarantees the values today; the cast hides a future divergence. Only `id` is used by the endpoints in this phase.
- **Fix**: Map through `normalizeRecurrence(data.recurrence)` and return null/throw on an unknown value instead of casting.
- **Decision**: FIXED via Fix now
