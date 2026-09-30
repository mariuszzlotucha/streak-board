# Task Create and Manage Implementation Plan

## Overview

Roadmap slice S-02 (FR-004, FR-005): a member of a group can create a task in their group (one-off, daily or weekly), every member of the group sees the group's tasks, and only the task's creator can edit its title or delete it. The slice adds a `tasks` table with RLS, three form-POST endpoints, a Tasks card on `/dashboard`, and tests at every layer, following the conventions of the `groups` slice one to one.

## Current State Analysis

- No `tasks` table, endpoint, UI or test exists (`research.md`, Summary).
- The groups slice is a complete precedent: migration + RLS + column grants (`supabase/migrations/20260925003350_create_groups_and_group_members.sql`, `20260925011727_harden_group_rls.sql`), validators and error whitelist (`src/lib/group-rules.ts`, `src/lib/group-errors.ts`), form-POST endpoints that answer 302 (`src/pages/api/groups/*.ts`), a server-rendered dashboard with small React islands (`src/pages/dashboard.astro`, `src/components/groups/*`), vitest RLS tests (`tests/integration/group-*.test.ts`), SQL scenarios (`supabase/checks/rls-scenarios.sql`) and smoke steps (`scripts/smoke.mjs`).
- `public.is_group_member(p_group_id uuid)` already answers membership for the caller only and is the building block for the `tasks` policies (`20260925011727_harden_group_rls.sql:30-50`).
- `src/middleware.ts:4` protects only `/dashboard` and `/api/groups`; `/api/tasks` would be reachable without the redirect.
- The PRD fixes what a task is for but not its shape; the decisions below close that gap.

## Desired End State

A signed-in member of a group sees a Tasks card on `/dashboard` listing the group's tasks, with a form to create one (title + recurrence once/daily/weekly). The creator of a task also sees Edit (title) and Delete (with confirmation) controls on it; other members see the task without controls. A member outside the group, or without a group, sees no tasks. A task disappears when its group is deleted or its creator's account is deleted; it stays, unmanageable, when its creator only leaves the group. Verified by the RLS tests, the SQL scenarios, the smoke run and a check on the production URL.

### Key Discoveries:

- Authorization is RLS plus server-derived ids; UPDATE/DELETE denied by RLS return zero rows, not an error, so endpoints must treat an empty result as `forbidden` (`src/pages/api/groups/rename.ts:33-39`).
- Columns are written through explicit column grants; a new editable column needs its own grant (`20260925011727_harden_group_rls.sql:92-99`).
- Policies must use `(select auth.uid())`; `supabase/checks/rls-scenarios.sql:306-322` asserts it for a fixed table list that has to include `tasks`.
- Test cleanup deletes groups (cascade) before users; a `restrict` foreign key from `tasks.created_by` would break `auth.admin.deleteUser` (`tests/helpers/supabase.ts:77-94`).
- Every destructive control goes through a confirmation dialog (`ConfirmAction`), and smoke asserts it (`scripts/smoke.mjs:110-117`).
- Streaks are computed on read from timestamps (`context/foundation/tech-stack.md:24`), so the task row needs only the recurrence kind; no timezone or period data belongs on it.

## What We're NOT Doing

- Joining or leaving tasks, participants, creator auto-join (S-03). The S-03 migration decides how creators become participants.
- Check-offs, streaks, leaderboard, decay value (S-04).
- Editing recurrence after creation. The creator deletes the task and creates a new one (decided: title only).
- Description, due date, weekday for weekly tasks, intervals, per-user or group timezone.
- Cleaning up orphaned tasks. A task whose creator left the group stays visible and cannot be edited or deleted by anyone until the creator rejoins the group (the policies check current membership, so they manage it again) or the group or the creator's account is deleted (the PRD accepts this edge case, `prd.md:69-71`). The group owner has no special task rights.
- Task limits per group or user, duplicate-title rules.
- A separate `/tasks` page or navigation (decided: dashboard section).
- JSON APIs, endpoint handler tests with a mocked Supabase client (decided: RLS tests + pure-rule unit tests + smoke), e2e tests.
- Manual `supabase db push` or `wrangler deploy`; the `release` job in GitHub Actions does both after approval.

## Implementation Approach

Build bottom-up so each layer is verified before the next depends on it. Phase 1 is test-first: RLS tests and SQL scenarios are written red, then the migration turns them green. Phase 2 is test-first for the pure validator, then adds the endpoints and route protection, covered by boundary smoke steps that need no UI. Phase 3 adds the dashboard UI and the smoke steps that prove the creator / member / outsider outcomes end to end. Phase 4 updates docs and closes the slice with the production release flow.

Decisions fixed by the planning interview:

- Table columns: `id`, `group_id`, `created_by`, `title`, `recurrence`, `created_at`.
- `recurrence` is a text column with a CHECK limited to `once`, `daily`, `weekly`; weekly means one check-off per calendar week on any day of it. The group-name rule is reused for the title: 1-80 characters after trimming space, tab, CR and LF.
- `group_id` references `groups` with `on delete cascade`; `created_by` references `auth.users` with `on delete cascade`.
- Client writes are limited by column grants: INSERT of `group_id, created_by, title, recurrence`; UPDATE of `title` only.
- Policies (`to authenticated`, one per operation): SELECT for members of the group; INSERT when `created_by` is the caller and the caller is a member of `group_id`; UPDATE and DELETE when the caller is the creator and still a member of the group. `anon` has no policy.
- The group id for a new task is taken from the caller's own membership (`getMyGroup`), never from the request.
- Stale requests follow the remove-member precedent: a task not visible to the caller answers a quiet redirect to `/dashboard`; a visible task the caller may not change answers `?error=forbidden`; a malformed task id answers `?error=forbidden`.
- Task-specific error codes live in `src/lib/task-errors.ts` and fall back to the existing group codes for `forbidden`, `not_configured` and `unknown`.

## Phase 1: `tasks` table and RLS

### Overview

Test-first (`/10x-tdd`): write the vitest matrix and the SQL scenarios, see them fail for lack of the table, then add the migration and regenerate the types.

### Changes Required:

#### 1. Test helpers

**File**: `tests/helpers/supabase.ts`

**Intent**: Give the new tests a way to create tasks as a user and read them back as admin, without changing the cleanup contract.

**Contract**: Add `createTaskAs(user, groupId, title, recurrence)` returning the task id (inserts `{group_id, created_by: user.id, title, recurrence}` through the user's client and throws on error) and `adminTask(taskId)` returning the row or `null` through `adminClient()`. No tracking list: tasks disappear through the `group_id` cascade in `cleanupGroups` and the `created_by` cascade in `cleanupUsers`.

#### 2. Isolation tests

**File**: `tests/integration/task-isolation.test.ts`

**Intent**: Prove the guardrail "visibility only inside one's own group" for tasks (test-plan risk #2): members see their group's tasks, outsiders and anonymous users see none.

**Contract**: Follow `tests/integration/group-isolation.test.ts`. Users: owner A of GA, member M of GA, owner B of GB, groupless X. Cases: A and M read GA's task; B and X read `[]` with no error (existence proven through `adminTask`); the anonymous client gets `[]` or 42501; an insert of a task into GA's `group_id` by B or X fails with 42501; an insert with `created_by` set to another user fails with 42501. Every denial has a positive control.

#### 3. Permission tests

**File**: `tests/integration/task-permissions.test.ts`

**Intent**: Prove that only the creator edits or deletes a task (test-plan risk #3), using the matrix in cookbook 6.4.

**Contract**: Follow `tests/integration/group-permissions.test.ts`. Creator C of a task in GA, member M, outsider X. Cases: C updates `title` and deletes (positive controls); M and X updates/deletes affect 0 rows and `adminTask` shows the row untouched; an update of `recurrence`, `group_id` or `created_by` by the creator fails with 42501 (column grants); a creator who left the group (`group_members` row removed through the admin client) updates and deletes 0 rows while the task stays visible to the group, and updates it again after being re-added to the group; deleting the group deletes its tasks; invalid data is rejected (empty or 81-character title, recurrence outside the allowed list: SQLSTATE 23514).

#### 4. SQL scenarios

**File**: `supabase/checks/rls-scenarios.sql`

**Intent**: Extend the SQL-level RLS checks to `tasks`, including the `(select auth.uid())` rule and privilege boundaries.

**Contract**: Add `'tasks'` to both `tablename in (...)` lists of the `#6` scenario (`:311-322`). Add a `do $$` block labelled `S-02` using the existing helpers (`mk_user`, `as_user`, `expect_error`, `expect_rows`, `expect_value`) covering: member reads, outsider and anon see zero rows, insert by non-member and with a foreign `created_by` (42501), creator-only update and delete, grants (update of any column except `title` is 42501), title and recurrence CHECK violations (23514), cascade on group delete and on user delete. Keep the file one transaction ending in `rollback`.

#### 5. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_tasks.sql` (timestamp later than `20260925161234`)

**Intent**: Create the `tasks` table with RLS and narrow client privileges, backward compatible with the deployed code (an additive table nothing reads yet).

**Contract**: Header comment with the change id and rationale, like the existing files. Table `public.tasks`: `id uuid primary key default gen_random_uuid()`, `group_id uuid not null references public.groups (id) on delete cascade`, `created_by uuid not null references auth.users (id) on delete cascade`, `title text not null`, `recurrence text not null`, `created_at timestamptz not null default now()`; named constraints `tasks_title_length` (same expression as `groups_name_length`) and `tasks_recurrence_allowed` (`once`, `daily`, `weekly`); index `tasks_group_id_idx`. `alter table ... enable row level security`. Privileges: revoke insert and update from `authenticated`, grant insert on `(group_id, created_by, title, recurrence)` and update on `(title)`. Policies `tasks_select_own_group`, `tasks_insert_as_member`, `tasks_update_by_creator`, `tasks_delete_by_creator` as described under Implementation Approach, all using `public.is_group_member(group_id)` and `(select auth.uid())`.

#### 6. Generated types

**File**: `src/types.ts`

**Intent**: Expose the `tasks` row, insert and update types to the app.

**Contract**: Regenerate with `npx supabase gen types typescript --local` after `npx supabase db reset`; never hand-edit.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local database: `npx supabase db reset`
- Generated types contain the `tasks` table: `npx supabase gen types typescript --local | grep -c "tasks:"`
- Task isolation and permission tests pass: `npm test`
- SQL RLS scenarios pass: `npm run test:rls`
- Lint and types pass: `npm run lint && npx astro check`

#### Manual Verification:

- Mutation check: weaken `tasks_update_by_creator` with `alter policy` in the local database, see `npm test` fail on the permission test, then restore with `npx supabase db reset`
- The new policies and the column grants read correctly against the PRD access model (creator manages own task, all members read)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Rules, errors and endpoints

### Overview

Test-first for the pure validator (`/10x-tdd`), then the error whitelist, the three endpoints and the route protection. Endpoint behaviour that needs no UI is proved by boundary smoke steps.

### Changes Required:

#### 1. Validator tests

**File**: `tests/unit/task-rules.test.ts`

**Intent**: Specify the title and recurrence rules before writing them, with expectations taken from the PRD and the database CHECK, not from the implementation.

**Contract**: Cases for `normalizeTaskTitle` (non-string, empty and whitespace-only after trimming space/tab/CR/LF, 80 code points accepted, 81 rejected, code points not UTF-16 units, NBSP not trimmed, result is the trimmed title), `normalizeRecurrence` (only exactly `once`, `daily`, `weekly`; other casing, empty and non-string give `null`) and that the exported list matches the database CHECK values.

#### 2. Validation rules

**File**: `src/lib/task-rules.ts`

**Intent**: Pure validation shared by the React islands and the server, free of server-only imports, mirroring `src/lib/group-rules.ts`.

**Contract**: Exports `MAX_TASK_TITLE_LENGTH = 80`, `TASK_RECURRENCES = ["once", "daily", "weekly"] as const`, type `TaskRecurrence`, `normalizeTaskTitle(input: unknown): string | null`, `normalizeRecurrence(input: unknown): TaskRecurrence | null`. Reuse `trimGroupName` semantics (same trimmed characters as the DB CHECK) by importing it rather than duplicating the regex. Task ids are validated with the existing `normalizeUuid`.

#### 3. Error codes

**File**: `src/lib/task-errors.ts`

**Intent**: Give task endpoints a closed set of messages in the same style as `src/lib/group-errors.ts`, without reflecting unknown `?error=` values.

**Contract**: `TaskErrorCode = "invalid_title" | "invalid_recurrence"` with message map; `toTaskErrorCode(error: { code?: string })` maps 23514 to `invalid_title` and otherwise delegates to `toGroupErrorCode`; `resolveTaskError(param: string | null): string | null` uses `Object.hasOwn`. `forbidden`, `not_configured` and `unknown` stay in the group codes.

#### 4. Endpoints

**Files**: `src/pages/api/tasks/create.ts`, `update.ts`, `delete.ts`

**Intent**: Create, retitle and delete a task as the signed-in user, relying on RLS for authorization and answering with 302 redirects only.

**Contract**: Each exports `prerender = false` and `POST: APIRoute`, parses `formData()`, wraps everything in one try/catch that logs and redirects to `/dashboard?error=unknown`, redirects anonymous callers to `/auth/signin` and a missing client to `?error=not_configured`. `create` reads `title` and `recurrence`, validates both (`invalid_title`, `invalid_recurrence`), takes the group from `getMyGroup` (no group: `forbidden`), inserts `{group_id, created_by: user.id, title, recurrence}` and redirects to `/dashboard`. `update` reads `task_id` and `title`; malformed id or invalid title as above; reads the task by id first with `getTask` (not visible: quiet redirect to `/dashboard`), then updates `title` with `.select("id")` and answers `?error=forbidden` on an empty result. `delete` reads `task_id` with the same lookup-then-delete pattern. No endpoint accepts `group_id` or `created_by` from the request.

#### 5. Task lookup helper

**File**: `src/lib/tasks.ts`

**Intent**: One place that reads a task by id for the update and delete lookup step, in the style of `src/lib/groups.ts`.

**Contract**: `export interface GroupTask { id: string; title: string; recurrence: TaskRecurrence; created_by: string }` and `getTask(supabase, taskId): Promise<GroupTask | null>` via `maybeSingle()`, throwing on a Supabase error.

#### 6. Route protection

**File**: `src/middleware.ts`

**Intent**: Redirect anonymous callers away from the new API routes like the other protected routes.

**Contract**: Add `"/api/tasks"` to `PROTECTED_ROUTES`.

#### 7. Boundary smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove the task endpoints reject what they must, before any UI exists (lesson: smoke steps assert outcomes).

**Contract**: Insert steps after "group create succeeds" and while user A owns the group: anonymous create/update/delete redirect to `/auth/signin` (status 302, location); a foreign-Origin POST to create, update and delete answers 403 (the bodies are invalid, so nothing changes even if the Origin check were off); create with an empty title answers 302 `locationExact: "/dashboard?error=invalid_title"`; create with recurrence `monthly` answers `?error=invalid_recurrence`; update and delete with `task_id=not-a-uuid` answer `?error=forbidden`; update and delete do not answer GET (404).

### Success Criteria:

#### Automated Verification:

- Validator unit tests pass (the local Supabase stack must be running, vitest's global setup reads its status): `npm test -- tests/unit/task-rules.test.ts`
- Lint and types pass: `npm run lint && npx astro check`
- Build passes: `npm run build`
- Smoke passes with the boundary steps against the built preview (CI `smoke` job): `npm run smoke`
- Route protection is in place: `grep -n '"/api/tasks"' src/middleware.ts`

#### Manual Verification:

- Signed in as a group member, posting a valid title and recurrence to `/api/tasks/create` adds a row, visible in the local Supabase Studio
- Posting as a signed-in user without a group answers `?error=forbidden` and creates nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Dashboard UI and smoke outcomes

### Overview

Add the Tasks card to `/dashboard` with create, inline edit and confirmed delete, then extend the smoke script with the steps that prove the creator / member / outsider outcomes on the rendered page. This phase is built with `/10x-implement`; new view code is not a `/10x-ui` restyle.

### Changes Required:

#### 1. Load tasks on the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Show the group's tasks inside the existing server-side load, with the same failure handling as the member list.

**Contract**: Inside the existing try/catch, after `getMyGroup`, load the tasks of the group through a new helper; on failure the existing `loadFailed` path applies and no task list is shown (not an empty list). Render a "Tasks" `Card` after the Members card, only when `group` is set and the load did not fail. Each row shows the title and a recurrence badge (Once / Daily / Weekly); when `task.created_by === user?.id` the row also renders the edit island and the delete `ConfirmAction` (`action="/api/tasks/delete"`, `fields={{ task_id }}`, trigger aria-label containing the task title). Wire `resolveTaskError(Astro.url.searchParams.get("error"))` next to the existing `resolveGroupError` so task errors reach the same alert. An empty list shows a short prompt to create the first task.

#### 2. Task list helper

**File**: `src/lib/tasks.ts`

**Intent**: Read the group's tasks for the dashboard in the style of `src/lib/groups.ts`; the Phase 2 lookup helper lives in the same file.

**Contract**: Add `listGroupTasks(supabase, groupId): Promise<GroupTask[]>` ordered by `created_at` then `id`, throwing on a Supabase error (`GroupTask` and `getTask` already exist from Phase 2).

#### 3. Create and edit islands

**Files**: `src/components/tasks/CreateTaskForm.tsx`, `src/components/tasks/EditTaskForm.tsx`

**Intent**: Native-form islands with client validation from `src/lib/task-rules.ts`, following `CreateGroupForm` and `RenameGroupForm` (`FormField`, `SubmitButton`, `useFormSubmitting`, `noValidate`, code-point length).

**Contract**: `CreateTaskForm` posts `title` and `recurrence` (a native select or radio group of the three kinds, default `once`) to `/api/tasks/create`. `EditTaskForm({ taskId, title })` shows the current title, an Edit button that reveals a title field with Save and Cancel, and posts `task_id` and `title` to `/api/tasks/update`. Field ids are unique per task row. Layout works at 375 px width.

#### 4. Outcome smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove on the rendered page what each role sees and can do, with positive controls and "data intact" checks after every rejection.

**Contract**: Insert after "dashboard shows the group to user B after being re-added" and before "delete by the owner succeeds", with A as creator, B and C as members: A creates a task (302 `/dashboard`); A's dashboard shows the title with an edit control and a dialog-trigger delete control (`aria-haspopup="dialog"`); B's dashboard shows the task without those controls; the task id is scraped from A's rendered delete form (fail fast if missing). B's update and delete of it answer `?error=forbidden` and A's dashboard still shows the original title; update and delete from a foreign Origin answer 403; A updates the title (302) and B sees the new title and not the old one; recurrence cannot be changed through the update endpoint (a posted `recurrence` field is ignored and the badge is unchanged); A deletes the task and the title is gone from B's dashboard; deleting it again is a quiet redirect without an error alert. Extend `SUBMIT_IN_DESTRUCTIVE_FORM` to cover `/api/tasks/delete`. After the group is deleted, neither B nor C sees a Tasks card.

### Success Criteria:

#### Automated Verification:

- Lint and types pass: `npm run lint && npx astro check`
- Build passes: `npm run build`
- Integration and unit tests pass: `npm test`
- Smoke passes with the full task outcome steps against the built preview (CI `smoke` job): `npm run smoke`

#### Manual Verification:

- At 375 px width the Tasks card is fully usable: create, edit and delete a task without horizontal scrolling
- Only the creator sees Edit and Delete on a task; another member sees the task without controls
- A user without a group sees no Tasks card, and an invalid title shows the fixed error message in the alert
- Deleting a task asks for confirmation in a dialog and cancelling changes nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Docs and production check

### Overview

Bring the docs in line with the new table and endpoints, then close the slice through the automated release flow: merge, approve `release`, check production, record the result.

### Changes Required:

#### 1. Docs

**Files**: `README.md`, `CLAUDE.md`, `AGENTS.md`

**Intent**: Keep the architecture and endpoint documentation true (`CLAUDE.md:25` still says the schema is only `groups` and `group_members`).

**Contract**: README: add the three `/api/tasks/*` rows to the endpoint table, mention that `/api/tasks/*` follows the `PROTECTED_ROUTES` rule, extend the RLS scenarios sentence to `tasks`. `CLAUDE.md` and `AGENTS.md` (kept identical in the affected lines): add `src/pages/api/tasks/{create,update,delete}.ts` to the API endpoints line, list `/api/tasks` in the `PROTECTED_ROUTES` description and add `tasks` to the schema sentence. Do not duplicate what the README already documents.

#### 2. Deployment record

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the slice's production result as the release lesson requires.

**Contract**: Add a short dated entry for `task-create-and-manage`: the applied migration file name, the release run approved in the `production` environment, and the result of the production checks below.

### Success Criteria:

#### Automated Verification:

- Formatting passes on the changed docs: `npx prettier --check README.md CLAUDE.md AGENTS.md`
- Stale wording gone: `! grep -n "consists of .groups. and .group_members. plus" CLAUDE.md AGENTS.md`

#### Manual Verification:

- For each phase PR, the `release` run was approved in the `production` environment after checking `supabase/migrations/` in the merge commit (phase 1 ships the migration), and every `release` job finished green
- On the production URL, a signed-in group member creates, renames and deletes a task; a second member sees it without controls; `/dashboard` still answers 302 when signed out
- `deployment-plan.md` records the date, the applied migration and the production result

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `normalizeTaskTitle` and `normalizeRecurrence` in `tests/unit/task-rules.test.ts`: boundaries at 80/81 code points, trimmed characters, closed recurrence list, agreement with the database CHECK values.

### Integration Tests:

- `tests/integration/task-isolation.test.ts` (risk #2) and `tests/integration/task-permissions.test.ts` (risk #3): creator / member / outsider / anonymous matrix, positive controls, state re-read through the admin client, column-grant and CHECK violations, cascade on group delete.
- `supabase/checks/rls-scenarios.sql`: the same rules at SQL level plus the `(select auth.uid())` check for `tasks`.
- `scripts/smoke.mjs`: anonymous, foreign-Origin and invalid-input boundaries (phase 2) and the creator / member outcomes on the rendered dashboard (phase 3).

### Manual Testing Steps:

1. Locally, as two members of one group, create a task as the first and confirm the second sees it without Edit or Delete.
2. Edit the title as the creator and confirm the change for both members; try to change the recurrence (there is no control for it).
3. Delete as the creator, cancel once in the dialog, then confirm.
4. Remove the creator from the group and confirm the task stays visible and unmanageable.
5. Repeat the core flow on the production URL after the release.

## Performance Considerations

The task list is one indexed query per dashboard load (`tasks_group_id_idx`), and one group has a handful of members; no caps or pagination are needed at this scale (the PRD targets a circle of friends).

## Migration Notes

The migration only adds a table and its policies, so it is backward compatible with the currently deployed code; the `release` job applies it before the deploy. Schema does not roll back; code rolls back with `npx wrangler rollback`. Existing data is unaffected.

## References

- Related research: `context/changes/task-create-and-manage/research.md`
- Similar implementation: `supabase/migrations/20260925011727_harden_group_rls.sql:30-152`, `src/pages/api/groups/rename.ts:33-39`, `src/components/groups/RenameGroupForm.tsx`, `tests/integration/group-permissions.test.ts`
- Roadmap: `context/foundation/roadmap.md:92-102` (S-02)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: `tasks` table and RLS

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local database: `npx supabase db reset` — 7e97a84
- [x] 1.2 Generated types contain the `tasks` table: `npx supabase gen types typescript --local | grep -c "tasks:"` — 7e97a84
- [x] 1.3 Task isolation and permission tests pass: `npm test` — 7e97a84
- [x] 1.4 SQL RLS scenarios pass: `npm run test:rls` — 7e97a84
- [x] 1.5 Lint and types pass: `npm run lint && npx astro check` — 7e97a84

#### Manual

- [x] 1.6 Mutation check: weaken `tasks_update_by_creator` with `alter policy` in the local database, see `npm test` fail on the permission test, then restore with `npx supabase db reset` — 7e97a84
- [x] 1.7 The new policies and the column grants read correctly against the PRD access model (creator manages own task, all members read) — 7e97a84

### Phase 2: Rules, errors and endpoints

#### Automated

- [x] 2.1 Validator unit tests pass (the local Supabase stack must be running, vitest's global setup reads its status): `npm test -- tests/unit/task-rules.test.ts` — 02ca08b
- [x] 2.2 Lint and types pass: `npm run lint && npx astro check` — 02ca08b
- [x] 2.3 Build passes: `npm run build` — 02ca08b
- [x] 2.4 Smoke passes with the boundary steps against the built preview (CI `smoke` job): `npm run smoke` — 02ca08b
- [x] 2.5 Route protection is in place: `grep -n '"/api/tasks"' src/middleware.ts` — 02ca08b

#### Manual

- [x] 2.6 Signed in as a group member, posting a valid title and recurrence to `/api/tasks/create` adds a row, visible in the local Supabase Studio — 02ca08b
- [x] 2.7 Posting as a signed-in user without a group answers `?error=forbidden` and creates nothing — 02ca08b

### Phase 3: Dashboard UI and smoke outcomes

#### Automated

- [x] 3.1 Lint and types pass: `npm run lint && npx astro check`
- [x] 3.2 Build passes: `npm run build`
- [x] 3.3 Integration and unit tests pass: `npm test`
- [x] 3.4 Smoke passes with the full task outcome steps against the built preview (CI `smoke` job): `npm run smoke`

#### Manual

- [x] 3.5 At 375 px width the Tasks card is fully usable: create, edit and delete a task without horizontal scrolling
- [x] 3.6 Only the creator sees Edit and Delete on a task; another member sees the task without controls
- [x] 3.7 A user without a group sees no Tasks card, and an invalid title shows the fixed error message in the alert
- [x] 3.8 Deleting a task asks for confirmation in a dialog and cancelling changes nothing

### Phase 4: Docs and production check

#### Automated

- [ ] 4.1 Formatting passes on the changed docs: `npx prettier --check README.md CLAUDE.md AGENTS.md`
- [ ] 4.2 Stale wording gone: `! grep -n "consists of .groups. and .group_members. plus" CLAUDE.md AGENTS.md`

#### Manual

- [ ] 4.3 For each phase PR, the `release` run was approved in the `production` environment after checking `supabase/migrations/` in the merge commit (phase 1 ships the migration), and every `release` job finished green
- [ ] 4.4 On the production URL, a signed-in group member creates, renames and deletes a task; a second member sees it without controls; `/dashboard` still answers 302 when signed out
- [ ] 4.5 `deployment-plan.md` records the date, the applied migration and the production result
