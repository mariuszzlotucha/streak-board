<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task Create and Manage

- **Plan**: context/changes/task-create-and-manage/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria: lint, `astro check`, `npm test` (52 tests) re-run during review and green; build and smoke (all steps) passed at gate time on an identical tree; manual 3.5-3.8 confirmed by the user and backed by the diff.

## Findings

### F1 — Edit form does not move keyboard focus

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/tasks/EditTaskForm.tsx:28-33, 55-63
- **Detail**: Clicking Edit unmounts the Edit button and mounts the form without focusing the title input; Cancel remounts the Edit button without focusing it. Keyboard and screen-reader focus falls back to `<body>`.
- **Fix**: Focus the title field after `editing` becomes true (effect) and return focus to the Edit button on cancel.
- **Decision**: FIXED — focus moves to the title field on Edit and back to the Edit button on Cancel (EditTaskForm.tsx)

### F2 — Vacuous smoke assertion on the member dashboard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/smoke.mjs:717
- **Detail**: `bodyNotMatches: formPostingTo("/api/tasks/update")` always passes, because the update form only exists inside the island after a click and is never server-rendered, not even for the creator. The `editControl(title)` check beside it is the real guard (lesson: smoke steps must assert outcomes).
- **Fix**: Drop the vacuous assertion and keep the `editControl` check as the guard.
- **Decision**: FIXED — removed the vacuous `/api/tasks/update` matcher in smoke.mjs, `editControl` stays as the guard

### F3 — `RECURRENCE_LABELS` defined twice

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:73, src/components/tasks/CreateTaskForm.tsx:9-13
- **Detail**: The label map is duplicated, so a new recurrence kind could drift between the list badge and the select.
- **Fix**: Export the map from `src/lib/task-rules.ts` next to `TASK_RECURRENCES` and import it in both places.
- **Decision**: FIXED — `RECURRENCE_LABELS` now lives in src/lib/task-rules.ts and is imported by dashboard and CreateTaskForm

### F4 — One row with an unknown recurrence hides the whole group hub

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tasks.ts:38-41
- **Detail**: `listGroupTasks` throws on an unknown recurrence, so the dashboard load fails and members, rename and delete disappear too. This is deliberate and consistent with `getTask`, and the DB CHECK makes it unlikely.
- **Fix**: Accept as is (the plan requires "failed load shows no Tasks card").
- **Decision**: FIXED via option A — the tasks load has its own try/catch (`tasksFailed`): only the Tasks card is hidden and the error alert is shown, members/rename/delete still render (deviates from the plan's `loadFailed` wording by the user's decision)

### F5 — Badge position differs between creator and member rows

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:158-178
- **Detail**: Creator rows render title, Edit, badge, Delete; member rows render title, badge. The badge sits after an action button only for creators.
- **Fix**: Skip; a cosmetic consequence of the island design, better handled by a later `/10x-ui` pass.
- **Decision**: SKIPPED — badge position left as is (user decision)
