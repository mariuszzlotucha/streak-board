<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task join and leave

- **Plan**: context/changes/task-join-and-leave/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-10-01
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

Success criteria re-run during review: `npm test` (8 files, 75 tests), `npm run lint` and `npm run build` all pass. Phase 2 has no manual items.

## Findings

### F1 — Plan text does not mention three implementation choices in the join route and loader

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/tasks/join.ts:30-41, src/lib/tasks.ts:55-60
- **Detail**: The plan contract says "a task hidden by RLS → quiet redirect" and only lists 23505 as quiet. The implementation adds a `getTask` pre-check (needed: the insert policy raises 42501 for a hidden task, which would otherwise become a loud `?error=forbidden`), also treats 23503 as quiet (narrow race: task deleted between the RLS check and the FK check), and orders `listTaskParticipants` by `joined_at, user_id` (deterministic participant order, creator first). All three are sound and stay within scope; the plan just does not record them.
- **Fix**: Note the three choices in the plan's Phase 2 notes only if Phase 3 or 4 relies on them (Phase 3 renders participants in loader order); otherwise leave as is.
- **Decision**: FIXED — the plan's Phase blocks are read-only during review, so the three choices are documented as code comments in `src/lib/tasks.ts` (ordering) and `src/pages/api/tasks/join.ts` (pre-check, quiet 23503).

### F2 — Join pre-check reuses `getTask`, which throws on an unknown recurrence

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/tasks/join.ts:30
- **Detail**: `getTask` parses `recurrence` and throws for an unknown value, so a task with a bad recurrence would make Join redirect with `?error=unknown` for a reason unrelated to joining. Mirrors `delete.ts` and cannot occur with the current DB check constraint.
- **Fix**: Keep for consistency with `delete.ts`.
- **Decision**: FIXED — `join.ts` now uses a new `taskExists` (selects `id` only) instead of `getTask`, so a bad recurrence can no longer block joining.

### F3 — `listTaskParticipants` relies on RLS alone and is subject to the PostgREST 1000-row cap

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tasks.ts:55-60
- **Detail**: No limit or group filter; PostgREST caps responses at `max_rows = 1000`. A very large group could silently lose participants. Irrelevant for MVP group sizes.
- **Fix**: No change for MVP; revisit if groups grow.
- **Decision**: FIXED — `listTaskParticipants` throws when the result reaches the PostgREST `max_rows` (1000), so truncation is loud instead of silent.
