# Task Create and Manage — Plan Brief

> Full plan: `context/changes/task-create-and-manage/plan.md`
> Research: `context/changes/task-create-and-manage/research.md`

## What & Why

Roadmap slice S-02 (FR-004, FR-005): a group member can create a task in their group (one-off, daily or weekly), every member sees the group's tasks, and only the creator can retitle or delete a task. It is the base for joining tasks (S-03) and for check-offs and the leaderboard (S-04), so the recurrence shape chosen here must not need a backward migration later.

## Starting Point

The app has groups with members and RLS, a server-rendered `/dashboard` with small React islands, form-POST endpoints that answer 302, and vitest, SQL and smoke tests. There is no `tasks` table, endpoint or UI. The groups slice is a complete precedent for every layer.

## Desired End State

A member sees a Tasks card on `/dashboard`: a list of the group's tasks, a form to create one (title + once/daily/weekly), and, on tasks they created, Edit (title) and Delete (with a confirmation dialog). Other members and outsiders cannot change or see what they should not. It is live on production after the gated release.

## Key Decisions Made

| Decision                    | Choice                                                                                                        | Why (1 sentence)                                                                  | Source   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Recurrence model            | Text column `recurrence` with CHECK: once / daily / weekly; weekly = once per calendar week, any day          | Matches FR-004 and lets S-04 compute a period from a timestamp plus one value     | Plan     |
| Task fields                 | `title` (1-80 chars, group-name rule) + `recurrence` only                                                     | Smallest model; extra columns can be added later without breaking deployed code   | Plan     |
| Edit limits                 | Creator edits title only; recurrence is fixed                                                                 | Changing daily to weekly would rewrite the meaning of past check-offs and streaks | Plan     |
| Orphans                     | Task stays when its creator leaves the group; nobody can manage it                                            | The PRD accepts and postpones this edge case; no extra policy or trigger          | Plan     |
| Foreign keys                | `group_id` and `created_by` both `on delete cascade`                                                          | Group or account deletion removes its tasks; keeps the test cleanup working       | Plan     |
| Authorization               | All in RLS: members read; creator (still a member) updates/deletes; column grants allow updating `title` only | Same model as groups; no service-role key in the app                              | Research |
| Endpoints                   | Form POST + 302 redirects, `/api/tasks/{create,update,delete}`, group id from the caller's membership         | Follows `/api/groups/*`; no JSON convention exists                                | Research |
| Stale requests              | Invisible task: quiet redirect; visible but not allowed: `forbidden`; malformed id: `forbidden`               | Mirrors remove-member; RLS returns 0 rows instead of errors                       | Research |
| UI location                 | Tasks card on `/dashboard`, inline edit, `ConfirmAction` for delete                                           | Reuses route protection and the single-hub layout; no new navigation              | Plan     |
| Tests                       | RLS vitest matrix + SQL scenarios + unit tests for the pure validator + smoke steps                           | Follows test-plan cookbook 6.2 / 6.4 and covers risks #2 and #3                   | Research |
| Creator auto-join, timezone | Out of scope (S-03 / S-04)                                                                                    | A period is computed on read; participation belongs to S-03                       | Plan     |

## Scope

**In scope:** `tasks` table, RLS and grants; validator, error codes, three endpoints, `/api/tasks` protection; Tasks card with create, edit, delete; tests and smoke steps; doc updates; production release and check.

**Out of scope:** joining/leaving tasks, check-offs, streaks, leaderboard; editing recurrence; description, due date, weekday, timezone; orphan cleanup; task limits; a `/tasks` page; JSON APIs, handler tests with mocks, e2e.

## Architecture / Approach

A new table behind `is_group_member(group_id)` policies, written to only through column grants (insert `group_id, created_by, title, recurrence`; update `title`). Three server endpoints derive the group from the caller's membership and let RLS decide, turning empty results into `forbidden`. The dashboard loads the group's tasks in its existing server-side load and renders them with two small islands plus the existing confirmation dialog.

## Phases at a Glance

| Phase                                       | What it delivers                                                             | Key risk                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. `tasks` table and RLS (TDD)              | Migration, types, vitest matrix, SQL scenarios                               | Policy or grant gap letting a non-creator edit; covered by the mutation check        |
| 2. Rules, errors, endpoints (TDD for rules) | Validator, error whitelist, `/api/tasks/*`, route protection, boundary smoke | Endpoint reachable anonymously if `PROTECTED_ROUTES` is missed                       |
| 3. Dashboard UI and smoke outcomes          | Tasks card, islands, full role-based smoke steps                             | Phone layout and confirmation flow; smoke must assert outcomes, not just no errors   |
| 4. Docs and production check                | README / CLAUDE.md / AGENTS.md, release approval, production check           | First real migration through the gated release (additive table, backward compatible) |

**Prerequisites:** S-01 archived (done); local Supabase stack running for tests; `production` environment reviewer available for each merge.
**Estimated effort:** ~4 sessions across 4 phases, one PR and one release approval each.

## Open Risks & Assumptions

- Assumes the Astro Origin check stays on by default; the smoke 403 steps prove it, the default itself was not read from the Astro source.
- A creator who leaves leaves an unmanageable task behind until the group is deleted; accepted by the PRD, revisit if it annoys real groups.
- S-03 and S-04 depend on the `recurrence` values; adding a kind later means widening the CHECK in a new migration.

## Success Criteria (Summary)

- A group member creates a task that every member sees; only its creator can retitle or delete it, proven by RLS tests, SQL scenarios and smoke steps.
- Outsiders, other groups and anonymous callers cannot read or change tasks.
- The slice is live on production after an approved release, and the result is recorded in `deployment-plan.md`.
