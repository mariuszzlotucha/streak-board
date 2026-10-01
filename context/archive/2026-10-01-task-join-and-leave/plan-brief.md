# Task join and leave — Plan Brief

> Full plan: `context/changes/task-join-and-leave/plan.md`
> Research: `context/changes/task-join-and-leave/research.md`

## What & Why

S-03 lets a group member join a task created by another member and leave a task they joined (FR-006, FR-007). It gives tasks a participant list, which S-04 (check-offs, streaks, leaderboard) needs as its input: you can only check off a task you are enrolled in.

## Starting Point

Tasks exist (S-02) with create, rename and delete by the creator, and every group member can read them. Nothing records who takes part in a task: no table, routes or UI. The creator is not enrolled anywhere; only the group owner is auto-enrolled, at group level.

## Desired End State

Under every task a member sees who takes part (emails) and a Join button or a Leave button with confirmation. A new task already lists its creator. A member who leaves or is removed from the group disappears from all participant lists of that group. The database itself enforces that users change only their own participation and only inside their own group.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Participation storage | New table `task_participants(task_id, user_id, joined_at)`, PK `(task_id, user_id)` | Thin rows; streaks are computed on read, check-offs belong to S-04 | Research / Plan |
| Creator | Auto-enrolled by a trigger (like `add_owner_to_group`), backfilled for existing tasks; may leave and rejoin | FR-006 covers only "other" members' tasks, so the creator would otherwise be unable to track their own task | Plan |
| Leave semantics | Delete the participation row (no `left_at`) | Simplest schema and RLS; S-04 decides what history survives a leave | Plan |
| Visibility | Participant emails listed per task, from the already-loaded members list | Delivers the shared-goal idea without new RPCs | Plan |
| Group departure | Trigger clears the user's participation in that group's tasks on leave and on owner removal | No orphaned participants in lists or the future leaderboard | Plan |
| Write path | Direct INSERT/DELETE under RLS and column grants; SECURITY DEFINER only for the two triggers | Matches how `tasks` is written to | Research |
| Errors | No new code; join and leave are idempotent, RLS denial maps to `forbidden` | Avoids reusing the group-specific `already_in_group` for tasks | Plan |

## Scope

**In scope:** table, RLS, grants, two triggers, backfill, regenerated types; join/leave routes; participant loading; dashboard participant list with Join/Leave; SQL scenarios, integration tests, unit test, smoke steps; production release.

**Out of scope:** check-offs, streaks, leaderboard (S-04); soft-leave history; restoring participation after rejoining the group; creators removing participants; new error codes; JSON APIs and e2e tests.

## Architecture / Approach

Database first. `task_participants` rows are readable when the task is readable (reusing the tasks select policy), insertable and deletable only for the caller's own `user_id`. Two SECURITY DEFINER triggers handle the cases the caller cannot: enrolling the creator on task insert and clearing a departing member's rows on `group_members` delete. The server adds `listTaskParticipants` and two idempotent POST routes modelled on `delete.ts`; the dashboard renders participants and a plain-form Join or a `ConfirmAction` Leave.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, RLS and triggers | Migration, types, SQL scenarios, integration tests | RLS or trigger mistake silently leaks or orphans participation; cascade on group delete |
| 2. Server layer | `listTaskParticipants`, grouping helper, `/api/tasks/join` and `/leave` | Mishandling 42501 vs empty-result denial |
| 3. Dashboard UI and smoke | Participant list, Join/Leave, smoke coverage | Task row layout on narrow screens; smoke steps that assert too little |
| 4. Production release | Merge, approved `release` run, production check | Migration must reach production before users use the feature |

**Prerequisites:** S-02 merged (done); local Supabase stack for `npm test`, `npm run test:rls`, `npm run smoke`.
**Estimated effort:** ~3-4 sessions across 4 phases, one PR per phase.

## Open Risks & Assumptions

- S-04 may want participation history; deleting rows on leave means S-04 must decide independently whether check-offs survive a leave.
- Participation is visible to every member of the group by design; confirmed in planning.
- Assumes the additive migration and triggers are safe for the currently deployed code (it inserts tasks and deletes group members as before).

## Success Criteria (Summary)

- A member can join and leave any task of their group, and the creator is enrolled from the start.
- Leaving or being removed from the group clears participation; outsiders can neither read nor change it.
- `npm run test:rls`, `npm test`, `npm run smoke` pass, and join/leave work on production after the release.
