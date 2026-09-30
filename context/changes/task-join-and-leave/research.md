---
date: 2026-10-01T01:14:06+02:00
researcher: Claude (Sonnet 5.5) for Mariusz Złotucha
git_commit: 38249b5adcb63c0f8160551ed8c786d164e5f1ef
branch: s-03/task-join-and-leave/plan
repository: 10xDevs
topic: "task-join-and-leave (S-03, FR-006/FR-007): what exists in DB, RLS, API, UI and tests that join/leave would build on, and what is missing"
tags: [research, codebase, tasks, rls, supabase, dashboard, task-join-and-leave]
status: complete
last_updated: 2026-10-01
last_updated_by: Claude (Sonnet 5.5)
---

# Research: task-join-and-leave

**Date**: 2026-10-01T01:14:06+02:00
**Git Commit**: 38249b5adcb63c0f8160551ed8c786d164e5f1ef
**Branch**: s-03/task-join-and-leave/plan
**Repository**: 10xDevs

## Research Question

S-03 (roadmap.md, FR-006/FR-007): a group member can join (sign up for) a task created by another member of the same group, and leave a task they joined. What infrastructure exists to build on, what is missing, and which decisions were explicitly deferred to this slice?

## Summary

- **No task-level participation exists.** On the inspected paths (4 migrations in `supabase/migrations/`, `src/types.ts` tables list, `src/pages/api/tasks/`, `src/lib/`, `tests/`) there is no task_members/participant/assignment table, function, policy, route, helper or test. `src/types.ts` lists exactly three tables: `group_members`, `groups`, `tasks`. S-03 must introduce the table and its RLS.
- **The task creator is not a participant anywhere.** Only the group owner is auto-enrolled, at group level, by the `groups_add_owner_to_group` trigger (`supabase/migrations/20260925003350_create_groups_and_group_members.sql:56-74`). `tasks` has only `created_by` (`20260930120000_create_tasks.sql:18-27`). The S-02 plan explicitly left "how creators become participants" to the S-03 migration (`context/archive/2026-09-30-task-create-and-manage/plan.md:30`).
- **Existing task RLS is a reusable template.** Select needs `is_group_member(group_id)`; insert/update/delete need authorship plus current membership; client writes are constrained by column grants (`20260930120000_create_tasks.sql:37-40, 48-63`). A participation table needs an analogous "own row + member of the task's group" rule.
- **Dashboard task list has two render branches** keyed on `task.created_by === user?.id` (`src/pages/dashboard.astro:166`); neither shows participants or a join/leave control. `listGroupTasks` returns only `{id,title,recurrence,created_by}` (`src/lib/tasks.ts:6-11`).
- **API/UI conventions are uniform and reusable:** POST-only native form routes with `prerender = false`, redirect to `/dashboard` with `?error=` codes, `normalizeUuid`, RLS denial surfaced as an empty result mapped to `forbidden`.
- **Product-level open choices (not decidable from code):** creator auto-join, what leaving does to the running streak, participant visibility, and cleanup when a member leaves the group (see Open Questions).

## Detailed Findings

### Database and RLS

- `tasks(id, group_id → groups ON DELETE CASCADE, created_by → auth.users ON DELETE CASCADE, title, recurrence, created_at)`; CHECKs `tasks_title_length` (1..80 after btrim) and `tasks_recurrence_allowed` (once/daily/weekly); indexes on `group_id` and `created_by` (`20260930120000_create_tasks.sql:18-27`).
- Recurrence is immutable after creation (no UPDATE grant on it) and the migration header states streaks are computed on read from timestamps (`:6-7`). S-03 therefore needs no period/timezone data on the task row.
- Policies: `tasks_select_own_group`, `tasks_insert_as_member`, `tasks_update_by_creator`, `tasks_delete_by_creator` (`:48-63`). A creator who left the group keeps a visible task but cannot manage it (`:10-11`).
- Group-level helpers: `is_group_member(p_group_id)` is SECURITY DEFINER, stable, `search_path ''`, uses `(select auth.uid())`, executable by `authenticated` only (`20260925011727_harden_group_rls.sql:35-51`). `join_group(p_join_code)` is the only way into a group; `group_members` has no INSERT and no UPDATE policy (`:56-82`, `:119`).
- `group_members` DELETE policies: owner removes others (`:129`), regular member deletes own row, owner cannot (`:142`). `group_members.user_id` is UNIQUE, so a user belongs to at most one group (`20260925003350...sql:21-26`).
- Leaving or removing a member from a group does not touch tasks today; this was deferred to S-02/S-03 (archive task-create-and-manage `research.md:80-81`, `plan.md:34`). Whether participation rows of a departed member should persist is therefore undecided.
- `supabase/checks/rls-scenarios.sql` has a policy-initplan check that enumerates tables `('groups','group_members','tasks')` (`:306-320`); a new table must be added there.

### API routes and lib

- Routes `src/pages/api/tasks/{create,update,delete}.ts`: `export const prerender = false`, `POST` only, `request.formData()`, `context.locals.user` check with redirect to `/auth/signin`, `createClient(headers, cookies)` with `not_configured` fallback, success = 302 to `/dashboard`, whole-handler try/catch → `?error=unknown`. `/api/tasks` is already in `PROTECTED_ROUTES` (`src/middleware.ts:4`), so new `/api/tasks/*` routes are covered by the prefix.
- Stale/forbidden handling: `getTask` returns null when RLS hides the row and the route redirects quietly (`delete.ts:27-29`, `update.ts:32-34`); an empty `.select("id")` result after a write maps to `?error=forbidden` (`delete.ts:36-38`).
- Error mapping: `TaskErrorCode = invalid_title | invalid_recurrence` (`src/lib/task-errors.ts`); SQLSTATE 23505 → `already_in_group`, 42501 → `forbidden`, P0002 → `invalid_code` in `group-errors.ts`. A duplicate-join unique violation (23505) would currently map to the group-specific `already_in_group`, which is misleading for tasks — a mapping decision for the plan.
- `task-rules.ts` holds pure validators kept free of server imports.

### UI

- Creator branch renders `EditTaskForm`, recurrence badge and `ConfirmAction` delete; non-creator branch renders title and badge only (`dashboard.astro:166-190`).
- `ConfirmAction` (`src/components/groups/ConfirmAction.tsx`) already wraps a hidden-field POST + AlertDialog and is used for leave-group (`dashboard.astro:245`). A plain server-rendered POST form with a hidden input and a `Button` exists without an island (group join form, `dashboard.astro:266-271`).
- Member emails are available via `listGroupMembers` (RPC returning email and `is_owner`), the only display-name source today.

### Tests and smoke

- `npm test` = `vitest run` (needs `supabase start`); `npm run test:rls` runs `supabase/checks/rls-scenarios.sql` (single transaction, ROLLBACK, helpers in `rls_check` schema; tasks section begins at `:528`); `npm run smoke` = `scripts/smoke.mjs` (users A, B, C at `:8-10`).
- Integration tests: `tests/integration/{foundation,group-isolation,group-permissions,task-isolation,task-permissions,auth-callback}.test.ts`; helpers `createTestUser`, `createGroupAs`, `joinGroupAs`, `createTaskAs`, `adminTask` in `tests/helpers/supabase.ts`.
- Lesson: every smoke step must assert an outcome, and every new POST route needs the foreign-Origin 403 check (`lessons.md` "Smoke steps must assert outcomes…").

## Code References

- `supabase/migrations/20260930120000_create_tasks.sql:18-27, 37-40, 48-63` - tasks table, grants, RLS
- `supabase/migrations/20260925003350_create_groups_and_group_members.sql:21-26, 56-74` - group_members, owner auto-enrol trigger
- `supabase/migrations/20260925011727_harden_group_rls.sql:35-82, 119-160` - is_group_member, join_group, member delete policies
- `src/pages/dashboard.astro:166-190` - task list branches
- `src/lib/tasks.ts:6-11, 14, 29` - GroupTask, getTask, listGroupTasks
- `src/pages/api/tasks/delete.ts:11-38` - route template
- `supabase/checks/rls-scenarios.sql:306-320, 528` - initplan check, tasks scenarios
- `tests/helpers/supabase.ts` - test helpers

## Architecture Insights

- Privileges are enforced in layers: column grants, RLS policies with `(select auth.uid())`, SECURITY DEFINER functions only where RLS alone cannot express the rule (joining a group).
- Group membership is the visibility boundary; every task-scoped rule composes `is_group_member(group_id)`.
- Application code treats RLS denials as empty results, not exceptions; routes never accept group ids from the request.
- Streaks are designed to be derived on read, so participation rows should stay thin; the check-off table belongs to S-04.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-task-create-and-manage/plan.md:30` - join/leave, participants and creator auto-join deferred to S-03 (supported, read).
- `.../plan.md:31` - check-offs, streaks, leaderboard and decay value deferred to S-04 (supported).
- `.../plan.md:34` - orphaned task of a departed creator stays visible and unmanageable; group owner has no special task rights (supported).
- `.../research.md:126-129` - open items: streak for `once` tasks, definition of "day"/timezone, delete cascade to participants/completions, creator auto-join by analogy with `add_owner_to_group` (reported by subagent, not re-read by me).
- `context/foundation/prd.md:72-79` - FR-006/FR-007 with kept Socratic counter-arguments; `:97` streak rule; `:107` permissions (members may join/leave others' tasks).
- `context/foundation/roadmap.md` S-03 - risk: leaving mid-streak; "small enough to resolve in /10x-plan".

## Related Research

- `context/archive/2026-09-30-task-create-and-manage/research.md`
- `context/archive/2026-09-25-group-create-join-manage/plan.md`

## Open Questions

1. **Creator auto-join?** Should the task creator become a participant automatically (trigger like `add_owner_to_group`) or join explicitly like anyone else? The prior research ties the "Zadania" view to this choice; the PRD wording "stworzonego przez innego członka" (FR-006) only covers other members.
2. **Streak on leave (roadmap risk):** with streaks computed on read and check-offs arriving in S-04, S-03 only has to decide whether leaving deletes the participation row (history lost unless S-04 keeps check-offs independently) or soft-ends it. Needs a product decision before the S-04 schema.
3. **Rejoin:** may a user re-join after leaving, and does history carry over?
4. **Participant visibility:** should S-03 show who joined each task (emails via `listGroupMembers`) or only a joined/not-joined state and a count?
5. **Cleanup:** when a member leaves or is removed from the group, or a task is deleted, participation rows should be removed; task deletion can cascade by FK, but group-leave currently does not touch task-level data — a trigger or policy decision is needed.
6. **Error mapping:** duplicate join (23505) would surface as `already_in_group`; a task-specific code is likely needed.
7. **Not verified:** bodies of `join_group`, `list_group_members` and the existing test files, and whether the local DB currently matches migrations; `src/types.ts` functions beyond `is_group_member`/`join_group`.
