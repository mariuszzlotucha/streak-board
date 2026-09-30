# Task join and leave Implementation Plan

## Overview

S-03 (FR-006, FR-007): a group member can join a task created by another member of the same group and leave a task they joined. This adds task-level participation: one new table `task_participants` with RLS, a trigger that enrols the task creator, a trigger that clears a member's participation when they leave or are removed from the group, two POST endpoints, and a participant list with a Join/Leave control on the dashboard task list. Check-offs, streaks and the leaderboard stay in S-04.

## Current State Analysis

- No task-level participation exists: no table, function, policy, route, helper or test (`context/changes/task-join-and-leave/research.md`, Summary). `src/types.ts` lists three tables: `group_members`, `groups`, `tasks`.
- The task creator is not a participant anywhere. Only the group owner is auto-enrolled, at group level, by trigger `groups_add_owner_to_group` (`supabase/migrations/20260925003350_create_groups_and_group_members.sql:56-74`). S-02 deferred "how creators become participants" to this slice (`context/archive/2026-09-30-task-create-and-manage/plan.md:30`).
- `tasks` RLS is the template: select needs `is_group_member(group_id)`; writes need authorship and current membership; client writes are bounded by column grants (`supabase/migrations/20260930120000_create_tasks.sql:37-40, 48-63`).
- The dashboard task list renders two branches keyed on `task.created_by === user?.id` and shows no participants (`src/pages/dashboard.astro:166-190`). `listGroupTasks` returns `{id, title, recurrence, created_by}` (`src/lib/tasks.ts:6-11, 29`). Member emails are already loaded via `listGroupMembers` (`dashboard.astro:39`).
- Task routes are POST-only native-form handlers that redirect to `/dashboard` with `?error=` codes; `/api/tasks` is already in `PROTECTED_ROUTES` (`src/pages/api/tasks/delete.ts`, `src/middleware.ts:4`). RLS denial on a write surfaces either as an empty result (update/delete) or as SQLSTATE 42501 (insert), and `toGroupErrorCode` maps 42501 to `forbidden` and 23505 to `already_in_group` (`src/lib/group-errors.ts:14-27`).
- A user belongs to at most one group (`group_members.user_id` is UNIQUE), so every visible `task_participants` row belongs to the caller's group.
- Leaving or removing a member from a group does not touch task data today (deferred by S-01/S-02).

## Desired End State

A member sees, under every task in their group, who takes part in it (emails), and a Join button (when not joined) or Leave button with confirmation (when joined). A newly created task already lists its creator as participant. A member who leaves the group or is removed from it disappears from every participant list of that group's tasks. The database enforces: a user can only add or remove their own participation, and only for tasks of their own group; nobody outside the group reads participation.

Verification: `npm run test:rls`, `npm test` and `npm run smoke` pass, and a manual two-user walk-through on local and then production shows join, leave, creator auto-enrolment and cleanup on group leave.

### Key Discoveries:

- Creator auto-join mirrors `add_owner_to_group` (SECURITY DEFINER trigger, `search_path ''`, execute revoked from API roles) — `20260925003350_create_groups_and_group_members.sql:56-74`.
- Reading participation can reuse the tasks select policy: a participation row is readable when its task is readable to the caller (subqueries run under the invoker's RLS), so no second membership lookup is needed.
- A failed insert under RLS raises 42501, while a failed delete returns zero rows; the join route must handle the former and the leave route the latter (`delete.ts:31-38` pattern).
- Smoke rule: every new step asserts its outcome, and every new POST route gets anonymous-redirect and foreign-Origin 403 checks (`context/foundation/lessons.md`, "Smoke steps must assert outcomes…"; `scripts/smoke.mjs:273-282`).

## What We're NOT Doing

- Check-offs, streak computation, decay and the leaderboard (S-04). Leaving deletes the participation row; what happens to history and streak on leave or rejoin is decided in S-04 when check-offs exist.
- Soft-ended participation (`left_at`), participation history, or carrying state over a rejoin.
- Restoring participation when a removed member rejoins the group; they join tasks again explicitly.
- Task creators removing other participants, or the group owner getting task rights (PRD: creator manages only the task itself).
- A new error code: join is idempotent (a duplicate join redirects quietly) and leave of a non-joined task redirects quietly, so `already_in_group` is never reused for tasks.
- JSON APIs, endpoint handler tests with a mocked client, and e2e tests (same exclusions as S-02).
- Changing tasks' recurrence, title rules or any existing policy.

## Implementation Approach

Bottom-up, database first, each phase on its own branch and PR:

1. Schema, RLS and both triggers, with SQL scenarios and integration tests proving the privilege model.
2. Server layer: participant loading, a pure grouping helper, and the join/leave routes.
3. UI on the dashboard plus smoke coverage and manual verification.
4. Production release, per the closing-step rule.

Direct INSERT/DELETE under RLS and column grants is used instead of an RPC, matching how `tasks` is written to; SECURITY DEFINER is reserved for the two triggers, which must act on rows the caller may not touch.

## Critical Implementation Details

- **State sequencing (migration order):** create table, grants and policies, then the two triggers, and only then backfill existing tasks' creators as participants (`on conflict do nothing`). The backfill runs as the migration owner and bypasses RLS; it must come last so a task inserted concurrently is not enrolled twice.
- **Cascade interaction:** the group-member cleanup trigger also fires when a whole group is deleted (group → `group_members` cascade). It must tolerate tasks or participation rows that are already gone and must not raise.
- **Backward compatibility:** the migration is additive and the deployed code neither reads the new table nor breaks on the triggers (it inserts tasks and deletes `group_members` rows exactly as before), so the release may apply the migration before the new code is live.

## Phase 1: Schema, RLS and triggers

### Overview

Introduce `task_participants` with its privilege model and the two triggers, regenerate types, and prove the rules with SQL scenarios and Vitest integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261001090000_create_task_participants.sql`

**Intent**: Create the participation table and everything that keeps it consistent: per-operation RLS, column-level grants, creator auto-enrolment and cleanup on group departure, following the header-comment style of `20260930120000_create_tasks.sql`.

**Contract**:
- Table `public.task_participants(task_id uuid → tasks(id) on delete cascade, user_id uuid → auth.users(id) on delete cascade, joined_at timestamptz default now())`, primary key `(task_id, user_id)`, index on `user_id`. RLS enabled.
- Privileges: start with `revoke all on public.task_participants from anon, authenticated` (Supabase default grants would otherwise leave DELETE, TRUNCATE, REFERENCES and TRIGGER open; the tasks migration revoked only INSERT/UPDATE), then grant `authenticated` only `select`, `insert (task_id, user_id)` and `delete`; no update.
- Policies (granular, `(select auth.uid())` initplan form): select when the task is visible to the caller; insert when `user_id` is the caller and the task is visible to the caller; delete when `user_id` is the caller.
- Trigger function `add_creator_to_task` (after insert on `tasks`) inserts `(new.id, new.created_by)`; trigger function `remove_member_task_participation` (after delete on `group_members`) deletes the departing user's rows for tasks of `old.group_id`. Both SECURITY DEFINER, `search_path ''`, execute revoked from `public, anon, authenticated`.
- Backfill: one insert of `(id, created_by)` for every existing task, last in the file.

#### 2. Generated types

**File**: `src/types.ts`

**Intent**: Regenerate from the local schema so the new table is typed; do not hand-edit.

**Contract**: `npx supabase gen types typescript --local > src/types.ts` after the migration is applied; the diff adds `task_participants` only.

#### 3. SQL RLS scenarios

**File**: `supabase/checks/rls-scenarios.sql`

**Intent**: Add an `S-03` section (same `do $$ … $$` structure, fresh users per scenario) and include the new table in the initplan check.

**Contract**: Add `'task_participants'` to both table lists of the `#6` check (`:306-320`). New scenarios: creator is auto-enrolled on task insert; a member joins another member's task; duplicate join raises 23505; insert with another user's `user_id` raises 42501; a member of another group, a user without a group and anon cannot read or insert; a member reads all participants of their group's tasks; leave removes only the caller's own row and deleting another's row affects 0 rows; column grants reject `update` and `truncate`; leaving the group and being removed by the owner both clear the user's participation in that group's tasks; deleting a task and deleting the group cascade participants.

#### 4. Integration tests and helpers

**File**: `tests/integration/task-participation.test.ts`, `tests/helpers/supabase.ts`

**Intent**: Prove the same model through real PostgREST sessions; add small helpers next to `createTaskAs`.

**Contract**: helpers `joinTaskAs(user, taskId)` (client insert returning the PostgREST result) and `adminParticipants(taskId)` (service-role list of user ids). Tests use the existing personas (owner A, creator C, member M, other-group B, no-group X) and cover the same cases as the SQL scenarios at the API level, including that creator auto-enrolment holds through the client insert path.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local stack: `npx supabase db reset`
- Generated types contain the new table and the project builds: `grep -q task_participants src/types.ts && npm run build`
- SQL RLS scenarios pass: `npm run test:rls`
- Integration tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- Backfill works on existing data: reset to `20260930120000` (`npx supabase db reset --version 20260930120000`), insert two tasks by two different creators, run `npx supabase migration up`, and confirm both creators are participants of their own task.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Server layer — participant loading and join/leave routes

### Overview

Give the dashboard its data and the two write endpoints, following the `delete.ts` conventions.

### Changes Required:

#### 1. Participant loading and grouping

**File**: `src/lib/tasks.ts`, `src/lib/task-rules.ts`

**Intent**: Load the participation rows visible to the caller and turn them into a per-task lookup for rendering; keep the grouping pure so it is unit-testable and browser-safe.

**Contract**: `listTaskParticipants(supabase): Promise<TaskParticipant[]>` where `TaskParticipant = { task_id: string; user_id: string }`, selecting `task_id, user_id` (RLS limits it to the caller's group), throwing on a Supabase error. In `task-rules.ts` a pure `groupParticipantsByTask(rows): Map<string, string[]>` preserving row order, no server imports.

#### 2. Unit tests

**File**: `tests/unit/task-rules.test.ts`

**Intent**: Cover the grouping helper.

**Contract**: empty input, several tasks, several users per task, and stable order.

#### 3. Join route

**File**: `src/pages/api/tasks/join.ts`

**Intent**: Let the signed-in user join a task of their group, idempotently.

**Contract**: `export const prerender = false`; `POST` only; same preamble as `delete.ts` (signed-out → `/auth/signin`, `normalizeUuid(form.get("task_id"))` else `?error=forbidden`, null client → `?error=not_configured`). A task hidden by RLS (other group, deleted) → quiet redirect to `/dashboard`. Insert `{ task_id, user_id: context.locals.user.id }`; SQLSTATE 23505 (already joined) → quiet redirect; any other error → `?error=${toTaskErrorCode(error)}` (42501 → `forbidden`); success → 302 `/dashboard`. Whole-handler try/catch logs and redirects `?error=unknown`.

#### 4. Leave route

**File**: `src/pages/api/tasks/leave.ts`

**Intent**: Let the signed-in user leave a task they joined, idempotently.

**Contract**: same preamble as join. Delete where `task_id` and `user_id` (the caller) match, with `.select("task_id")`; an empty result (not joined, task gone) → quiet redirect; error → `?error=${toTaskErrorCode(error)}`; success → 302 `/dashboard`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (including the new grouping tests): `npm test`
- Linting passes: `npm run lint`
- Project builds with the new routes: `npm run build`

---

## Phase 3: Dashboard UI and smoke coverage

### Overview

Show participants and the Join/Leave control on every task row, and cover the new flow end to end in the smoke test.

### Changes Required:

#### 1. Dashboard task list

**File**: `src/pages/dashboard.astro` (optionally a small Astro component under `src/components/tasks/` if the row markup grows)

**Intent**: Load participants next to the tasks and render, for every task, the participants' emails plus the caller's Join or Leave control, for creators and non-creators alike.

**Contract**: call `listTaskParticipants` inside the existing task-loading `try` so a failure hides only the Tasks card (same `tasksFailed` path, `:40-46`). Build an email lookup from the already-loaded `members` and group participants with `groupParticipantsByTask`; a participant without a matching member shows "Unknown member". Per task: a participant line (emails, "You" marker matching the Members card style `:127-129`, an empty state "No participants yet"), rendered inside the task's own `<li>` with no nested `<li>` (smoke row regexes stop at the first `</li>`); when the caller is not a participant a plain server-rendered POST form with hidden `task_id` and a `Button` "Join" to `/api/tasks/join` (pattern of `:266-271`, aria-label including the title); when the caller is a participant a `ConfirmAction` (`variant="outline"`) posting `task_id` to `/api/tasks/leave` with a description that the user can join again later. The creator branch keeps Edit and Delete unchanged.

#### 2. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Assert the outcomes of join and leave, the group-departure cleanup and the boundaries, with the existing users (A, B, C are all in one group, so the cross-group join case is covered only by the SQL scenarios and Vitest tests, not by smoke).

**Contract**: add a row-scoped helper in the style of `taskRowWithBadge` (`:128-151`) that asserts a participant email is present or absent inside one task's `<li>`; a plain body match is worthless because emails also appear in the Members card (`:381`). Place the new steps after `:679` and before the task delete (`:780`). After task creation assert the creator appears as participant in that task's row; another member joins via `/api/tasks/join` and the dashboard then lists their email under that task (not just a 302); a repeated join changes nothing and shows no error banner; leave removes them from that task's participant list; malformed `task_id` answers `?error=forbidden`; both new routes are added to the anonymous-redirect and foreign-Origin 403 loops (`:273-282`) and the invalid-input group (`:285-291`). then a late cleanup sequence: B joins a task, B leaves the group via `/api/groups/leave` and rejoins by invite (pattern of `:444-467`), and B's email is absent from that task's row; the existing leave/remove steps (`:444-462`, `:624-665`) run before any task exists and cannot carry this check. Fail fast when a value later steps depend on is missing.

### Success Criteria:

#### Automated Verification:

- Smoke test passes against the local stack: `npm run smoke`
- Integration tests still pass: `npm test`
- Linting passes: `npm run lint`
- Project builds: `npm run build`

#### Manual Verification:

- With two signed-in users in one group: the creator is listed on a new task; the second user joins, appears for both users after reload, leaves after confirming, and disappears.
- When a member leaves the group (or is removed by the owner) and returns via the invite link, they are not listed on any task until they join again.
- The task row stays readable at a narrow (phone) width with several participants, and Join/Leave are reachable by keyboard.

---

## Phase 4: Production release

### Overview

Close the slice per the project's release rule: merge, approve the gated release that applies the migration, and check production.

### Changes Required:

#### 1. Release and record

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the release of S-03 the way previous slices were recorded.

**Contract**: a new phase entry with the date, the applied migration `20261001090000_create_task_participants.sql`, and the production check result. The migration is additive and backward compatible with the deployed code (see Critical Implementation Details), so the `release` job's order (migrations, then Worker) is safe.

### Success Criteria:

#### Automated Verification:

- The required `integration` check is green on the PR to `master`: `gh pr checks`

#### Manual Verification:

- After merging, confirm the merge commit contains the new migration (`git show --stat master` lists `supabase/migrations/20261001090000_create_task_participants.sql`), then approve the `release` run in the GitHub `production` environment.
- On the production URL, a signed-in member joins and leaves another member's task and the creator is listed on a fresh task.
- The date, applied migration and result are noted in `context/changes/deployment/deployment-plan.md`.

---

## Testing Strategy

### Unit Tests:

- `groupParticipantsByTask`: empty input, multiple tasks, multiple users per task, stable order.

### Integration Tests:

- `tests/integration/task-participation.test.ts`: join, duplicate join (23505), join as another user (denied), outsiders and anon (no read, no insert), own-row-only leave, no update, creator auto-enrolment, cleanup on group leave and on owner removal, cascade on task delete.
- SQL scenarios in `supabase/checks/rls-scenarios.sql` mirror these at the database level, including the initplan check for the new table.

### Manual Testing Steps:

1. Two users in one group: create a task as the first, confirm the creator is listed.
2. As the second user, join, reload, confirm both emails; leave with confirmation, confirm removal.
3. Have the second user leave the group, rejoin via invite link, confirm they are not listed until they join again.
4. Repeat the join/leave flow once on production after the release.

## Performance Considerations

The select policy runs an `exists` on `tasks` per participation row; groups are small and `task_participants` has its primary key on `(task_id, user_id)` plus an index on `user_id`. The dashboard adds one extra select per load. No further optimisation is needed for MVP group sizes.

## Migration Notes

Additive migration; the backfill enrols creators of existing tasks so existing tasks do not look abandoned. Rollback of schema is not supported (per the release lesson); code can be rolled back with `npx wrangler rollback` and the new table stays unused by older code.

## References

- Related research: `context/changes/task-join-and-leave/research.md`
- Similar implementation: `supabase/migrations/20260930120000_create_tasks.sql:37-63` (grants and policies), `supabase/migrations/20260925003350_create_groups_and_group_members.sql:56-74` (auto-enrol trigger), `src/pages/api/tasks/delete.ts:9-46` (route template)
- PRD: `context/foundation/prd.md:72-79` (FR-006, FR-007); roadmap item S-03

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS and triggers

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local stack: `npx supabase db reset` — e3c2d48
- [x] 1.2 Generated types contain the new table and the project builds: `grep -q task_participants src/types.ts && npm run build` — e3c2d48
- [x] 1.3 SQL RLS scenarios pass: `npm run test:rls` — e3c2d48
- [x] 1.4 Integration tests pass: `npm test` — e3c2d48
- [x] 1.5 Linting passes: `npm run lint` — e3c2d48

#### Manual

- [x] 1.6 Backfill works on existing data: reset to `20260930120000` (`npx supabase db reset --version 20260930120000`), insert two tasks by two different creators, run `npx supabase migration up`, and confirm both creators are participants of their own task. — e3c2d48

### Phase 2: Server layer — participant loading and join/leave routes

#### Automated

- [x] 2.1 Unit tests pass (including the new grouping tests): `npm test`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Project builds with the new routes: `npm run build`

### Phase 3: Dashboard UI and smoke coverage

#### Automated

- [ ] 3.1 Smoke test passes against the local stack: `npm run smoke`
- [ ] 3.2 Integration tests still pass: `npm test`
- [ ] 3.3 Linting passes: `npm run lint`
- [ ] 3.4 Project builds: `npm run build`

#### Manual

- [ ] 3.5 With two signed-in users in one group: the creator is listed on a new task; the second user joins, appears for both users after reload, leaves after confirming, and disappears.
- [ ] 3.6 When a member leaves the group (or is removed by the owner) and returns via the invite link, they are not listed on any task until they join again.
- [ ] 3.7 The task row stays readable at a narrow (phone) width with several participants, and Join/Leave are reachable by keyboard.

### Phase 4: Production release

#### Automated

- [ ] 4.1 The required `integration` check is green on the PR to `master`: `gh pr checks`

#### Manual

- [ ] 4.2 After merging, confirm the merge commit contains the new migration (`git show --stat master` lists `supabase/migrations/20261001090000_create_task_participants.sql`), then approve the `release` run in the GitHub `production` environment.
- [ ] 4.3 On the production URL, a signed-in member joins and leaves another member's task and the creator is listed on a fresh task.
- [ ] 4.4 The date, applied migration and result are noted in `context/changes/deployment/deployment-plan.md`.
