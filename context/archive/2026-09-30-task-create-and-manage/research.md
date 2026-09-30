---
date: 2026-09-30T23:30:53+02:00
researcher: Claude (Sonnet 5.5) for Mariusz Złotucha
git_commit: d840ced28071b1322ca733ebe48e51e7ccdc2094
branch: s-02/task-create-and-manage/plan
repository: 10xDevs
topic: "S-02 task-create-and-manage: what exists, what is decided and what is open for creating and managing tasks in a group"
tags: [research, codebase, tasks, rls, migrations, api, dashboard, tests, recurrence]
status: complete
last_updated: 2026-09-30
last_updated_by: Claude (Sonnet 5.5)
---

# Research: S-02 task-create-and-manage

**Date**: 2026-09-30T23:30:53+02:00
**Researcher**: Claude (Sonnet 5.5) for Mariusz Złotucha
**Git Commit**: d840ced28071b1322ca733ebe48e51e7ccdc2094
**Branch**: s-02/task-create-and-manage/plan
**Repository**: 10xDevs

## Research Question

The change has no stated question, so it is taken from the roadmap entry S-02 (`context/foundation/roadmap.md:92-102`) and FR-004/FR-005 (`context/foundation/prd.md:64-71`): a member creates a one-off or recurring (daily/weekly) task in their group, and its creator edits or deletes it. What do the schema, API, UI, tests and prior decisions already give us, and what must `/10x-plan` still decide?

## Summary

- No `tasks` table, endpoint, UI or test exists yet. Sources inspected: `src`, `supabase`, `tests` (grep by the exploring agents, this checkout only).
- The codebase has one complete, consistent precedent to copy: the `groups` / `group_members` slice. Its migration, RLS, endpoint, dashboard, error-code, test and smoke conventions are listed below with anchors. A `tasks` slice can follow them almost one to one.
- The PRD decides what a task is for, but not its shape. Every field, the recurrence model, edit limits and what happens when a task's creator leaves are open. The roadmap hands the recurrence choice to `/10x-plan` and warns that it constrains S-04 (`roadmap.md:101`).
- Streak decay is computed on read from completion timestamps, not by a scheduled job (`context/foundation/tech-stack.md:24`). The task schema therefore has to give S-04 enough to derive streaks without a backward migration.
- Two things in the existing setup will break or go stale if ignored: `/api/tasks` is not in `PROTECTED_ROUTES` (`src/middleware.ts:4`), and the test cleanup order assumes `groups` are deleted before users (`tests/helpers/supabase.ts:77-94`).

## Detailed Findings

### Schema and RLS conventions (from the 3 migrations in `supabase/migrations/`)

- Three migration files exist: `20260925003350_create_groups_and_group_members.sql`, `20260925011727_harden_group_rls.sql`, `20260925161234_add_group_member_list_and_preview.sql`. Naming is `YYYYMMDDHHMMSS_snake_description.sql`, each with a header comment; older files are never edited, fixes go into a new file (hardening migration header).
- Tables use `id uuid primary key default gen_random_uuid()` and `created_at timestamptz not null default now()` (create migration :12, :18). Foreign keys to `auth.users`: `groups.owner_id` uses `on delete restrict` (:15, rationale :13-14); `group_members.group_id` uses `on delete cascade` (:23). The FK index is written by hand, named `<table>_<col>_idx` (:28).
- Constraints are named, for example `groups_name_length` (1-80 characters after trimming, hardening migration :92-93). A task title check can copy it.
- RLS is enabled per table (create :80-81), policies are `to authenticated`, one per operation, named `<table>_<op>_<who>`; no policy for `anon`, so `anon` is denied by default. Policies use `(select auth.uid())`, never bare `auth.uid()`; `rls-scenarios.sql:306-322` asserts this through `pg_policies` for a fixed table list that a new table must be added to.
- Membership helper: `public.is_group_member(p_group_id uuid)`, `security definer`, `set search_path = ''`, reading the caller through `auth.uid()` (hardening migration :30-47); execute is granted only to `authenticated` (:49-50). It exists to avoid policy recursion (create :34-35).
- Column-level grants: `groups` has insert/update revoked and re-granted per column (`grant insert (owner_id, name)`, `grant update (name)`, hardening migration :92-99); the migration comment says a new editable column needs its own explicit grant.
- One group per user: `group_members.user_id` is `unique` (create :24). For this inspected schema a user's group can be derived from `group_members` by `user_id`. `tasks.group_id` still needs its own membership check in RLS.
- The `groups` SELECT policy includes `owner_id = auth.uid()` because INSERT ... RETURNING evaluates the policy before the AFTER INSERT trigger adds the member (create :84-85, hardening :106-107). A `tasks` policy only needs this if a trigger adds a row that the SELECT policy depends on.
- Generated types: `src/types.ts` is produced by `npx supabase gen types typescript --local` and is not hand-edited (`CLAUDE.md:24`); `createClient<Database>` (`src/lib/supabase.ts:10`) uses it.

### API conventions (`src/pages/api/groups/*.ts`, `src/pages/api/auth/*.ts`)

- In the 6 inspected group endpoints the shape is: `export const prerender = false`, a `POST: APIRoute`, `await context.request.formData()`, one try/catch. No endpoint in `src` uses JSON; a JSON API would be a new convention (agent finding, `src/pages/api` listing).
- Validation helpers are pure functions in `src/lib/group-rules.ts` (`normalizeGroupName` :18, `normalizeJoinCode` :30, `normalizeUuid` :44), shared by the server and React islands.
- The user comes from `context.locals.user` (`src/middleware.ts:11-17`); the Supabase client from `createClient(context.request.headers, context.cookies)` (`src/lib/supabase.ts:6`), which returns `null` when env is missing, handled with a redirect to `?error=not_configured`. RLS applies because the client carries the user's cookies; `src` has no service-role client.
- Authorization is by RLS plus server-derived ids. The group id comes from `getMyGroup(supabase)` (`src/lib/groups.ts:20`), "never from the request" (`delete.ts:19`, `rename.ts:26`). UPDATE/DELETE use `.select("id")` and treat an empty result as `forbidden`, because RLS returns zero rows instead of an error (`rename.ts:33-39`, `delete.ts:29-35`).
- Responses are 302 redirects to `/dashboard`, with `?error=<code>` on failure. The only non-302 is the 403 from Astro's Origin check, asserted by `scripts/smoke.mjs:224-226`. The default of that check was inferred, not read from the Astro source.
- Error whitelist: `src/lib/group-errors.ts` (closed union, message map, SQLSTATE mapper `toGroupErrorCode` :14-27, `resolveGroupError` :30-35 with `Object.hasOwn`). The dashboard wires it at `src/pages/dashboard.astro:19`. Tasks need a parallel `task-errors.ts` or an extension, plus wiring on the page.
- Middleware: `PROTECTED_ROUTES = ["/dashboard", "/api/groups"]` (`src/middleware.ts:4`), matched by exact path or `route + "/"` prefix. `/api/tasks` is not covered and must be added.

### Dashboard and UI (`src/pages/dashboard.astro`, `src/components/groups/*`)

- Data is loaded server-side in the frontmatter inside one try/catch (`dashboard.astro:29-56`), with `loadFailed` flags. Lists are rendered in Astro (members: `Card` plus `ul.divide-y`, :91-131). Owner-only controls are gated by `isOwner` (:59); a creator-only gate would compare `task.created_by` with the user id.
- React islands wrap native forms (`method="POST"`, `noValidate`, client `validate()` reusing the shared `*-rules.ts`), for example `CreateGroupForm.tsx:13-35`; building blocks are `FormField`, `SubmitButton`, `useFormSubmitting`. `ConfirmAction` (alert dialog plus a separate form tied by the `form` attribute) is reusable as-is for deleting a task. `RenameGroupForm` is the model for editing.
- `scripts/smoke.mjs:110-117` asserts that destructive controls open a dialog (`aria-haspopup="dialog"`) and that no submit button sits inside the server-rendered destructive form.
- UI conventions from the UI audit: semantic tokens, not literal colours; add shadcn primitives with `npx shadcn@latest add <name> --overwrite`, never `shadcn init`; the UI must work at 375 px (archive `ui-styles-audit` brief). `CLAUDE.md` reserves `/10x-ui` for views that already render.
- Navigation: the PRD speaks of a "Zadania" tab (`prd.md:41-45`), but the current UI is a single `/dashboard` hub. Where the task UI lives is open (section below).

### Tests and smoke

- Vitest integration tests run as real users through RLS against local Supabase. Helpers in `tests/helpers/supabase.ts`: `adminClient`, `anonClient`, `createTestUser` (:33-48), `createGroupAs` (:50-63), `joinGroupAs`. Cleanup deletes tracked groups after each test and users at the end (:77-94); `tests/setup/global-setup.ts:73-101` sweeps leftovers for `vitest-` users. A `tasks.group_id ... on delete cascade` is cleaned automatically; a `restrict` foreign key from `tasks.created_by` to `auth.users` would make `deleteUser` fail if tasks outlive the groups.
- Denial patterns in the two inspected files: outsider SELECT returns `[]` with no error; UPDATE/DELETE return zero rows and `adminClient` confirms the row is untouched (`expectGaUntouched`); INSERT denial is SQLSTATE `42501`. Every denial has a positive control. Test plan cookbook 6.2 and 6.4 (`test-plan.md:137-154`) prescribe the creator / member / outsider matrix.
- `tests/integration/auth-callback.test.ts` is the only test that calls an Astro route handler, by importing `GET` directly with a mocked `@/lib/supabase`; no test starts a server. HTTP behaviour of the endpoints (redirects, Origin 403, dashboard HTML) is covered only by `scripts/smoke.mjs`.
- `supabase/checks/rls-scenarios.sql` runs as one transaction ending in `rollback`, with helpers `as_user`, `as_anon`, `expect_error`, `expect_rows`, `expect_value`; each scenario is a `do $$` block. It runs with `npm run test:rls` (`package.json:15`).
- Smoke rule from lessons: every new step must assert the outcome, including a foreign-Origin POST answering 403 (`lessons.md:26`).
- Test plan risks relevant here: #2 cross-group leak of "groups, members or (later) tasks" and #3 non-owner managing (integration tests with two or more users); #4 streak boundary errors, "recurrence model from S-02" is named as context research must ground (`test-plan.md:42-49, 67`). Test plan Phase 4 (streak rule) waits for S-04 and the decay value (`test-plan.md:87`).

### Decided by the PRD, tech stack and roadmap

- FR-004: create a task in a group, one-off or recurring (daily/weekly) (`prd.md:64`). FR-005: the creator edits or deletes it; the Socratic note accepts the orphaned-task case "to be resolved later" (`prd.md:68-71`).
- Access: all group members see all tasks of their group; the creator manages their own task (`prd.md:105`). One group per user, no configurable decay, no anti-cheat, no offline mode (`prd.md:111-114`).
- Business logic: +1 per completed day/period, a miss subtracts less than the full state, the only input is "checked off in its period" (`prd.md:97-99`). No decay number is given; the roadmap marks it non-blocking for S-04 (`roadmap.md`, S-04 unknowns).
- Streak decay is computed on read from each task's last-completed timestamp; no background jobs (`tech-stack.md:24`).
- S-01's plan and the hardening brief explicitly deferred to S-02/S-03 what happens to the tasks of a member who leaves or is removed (archive `group-create-join-manage` and `group-rls-hardening` briefs). In the schema, an owner cannot leave without deleting the group; a member can leave and a removed member is deleted (hardening migration ~:118-140).

### Process rules that shape the slice (`context/foundation/lessons.md`)

Branch per phase, planning on one planning branch merged before implementation, PR URL shown each time, English commits, skills run the git/`gh` commands themselves, plan review and impl review mandatory, slice closed by merge, `production` approval and a production check (`lessons.md:12-16, 19-23, 33, 77-82, 84-95`).

## Code References

- `supabase/migrations/20260925003350_create_groups_and_group_members.sql:12-28,80-81` - table DDL, FK behavior, index, RLS enable
- `supabase/migrations/20260925011727_harden_group_rls.sql:30-50,92-99,106-152` - `is_group_member`, column grants, policy set
- `supabase/checks/rls-scenarios.sql:306-322` - `(select auth.uid())` check with a fixed table list
- `src/middleware.ts:4,11-17` - `PROTECTED_ROUTES`, user resolution
- `src/pages/api/groups/rename.ts:26-39`, `delete.ts:19-35` - server-derived id and empty-result `forbidden`
- `src/lib/group-errors.ts:1-37`, `src/lib/group-rules.ts:18-44` - error whitelist and validators
- `src/pages/dashboard.astro:19,29-63,91-131` - data loading, error wiring, list rendering
- `src/components/groups/ConfirmAction.tsx`, `RenameGroupForm.tsx` - delete and edit patterns
- `tests/helpers/supabase.ts:33-94` - test user/group helpers and cleanup order
- `scripts/smoke.mjs:110-117,224-236` - dialog assertion and standard per-endpoint steps
- `context/foundation/test-plan.md:42-49,137-154` - risk map and cookbook

## Architecture Insights

- All authorization lives in RLS; the app holds no service-role key. Endpoints only derive ids server-side and translate empty results to `forbidden`.
- The group slice's pattern is: migration with RLS and column grants, `src/lib` validators and error codes, native-form POSTs with 302 redirects, server-rendered lists with small islands, then vitest RLS tests, SQL scenarios and smoke steps. A tasks slice that copies it needs no new convention.
- Because decay is computed on read, the recurrence column and completion records have to be chosen so that a period (day or week) can be computed from a timestamp and a recurrence kind alone.

## Historical Context (from prior changes)

- `context/archive/2026-09-25-group-schema-and-rls/` - immutable migrations, `restrict` for owners and `cascade` for children, `is_group_member` design (supported by the migrations read above).
- `context/archive/2026-09-25-group-rls-hardening/` - `(select auth.uid())`, per-column grants, and the note that S-02/S-03 must decide the tasks of a leaving member (supported by its brief).
- `context/archive/2026-09-25-group-create-join-manage/` - endpoints as native POST plus redirects, error whitelist, `ConfirmAction`, server-derived group id (partial: only the research and brief were read, not the plan body).
- `context/archive/2026-09-30-testing-runner-data-isolation-and-permissions/` - vitest with real users, global setup refusing non-local URLs, `integration` CI job; HTTP endpoint tests and e2e were out of scope there.
- `context/archive/2026-09-25-ui-styles-audit/`, `2026-09-25-signup-error-codes/` - UI tokens and primitives, and the error-code pattern with no reflection of unknown `?error=` values.

## Related Research

- `context/archive/2026-09-25-group-create-join-manage/research.md` - Architecture Insights on the group hub and Astro Origin check risk (flagged as unverified there).
- `context/archive/2026-09-30-release-automation-and-auth-hardening/research.md` - release flow the slice will ship through.

## Open Questions

Decisions the plan must make (none is settled by the PRD, which lists no open questions, `prd.md:118`):

1. **Fields.** The PRD names none. Minimum: title, recurrence, group, creator. Undecided: description, due or scheduled date, what "one-off" means, title length limit (the group-name check is the precedent).
2. **Recurrence model** (roadmap risk). Kind as an enum or text plus a check (once / daily / weekly) versus interval plus unit; for weekly, the week start day and whether a weekday is stored; whether a streak applies to a one-off task; what defines a "day" (user, group or UTC timezone; the test plan lists timezone as a risk). S-04 must derive streaks on read without a backward migration.
3. **Edit limits.** Which fields the creator may change, and whether recurrence may change after others joined or checked off, because that rewrites what past periods mean.
4. **Delete.** A delete will later cascade to participants (S-03) and completions (S-04). No soft-delete or archive state is defined; confirmation via `AlertDialog` is the natural reuse.
5. **Orphans.** `tasks.created_by` versus a creator who leaves or is removed: keep, delete or reassign the task, who manages it afterwards, and `restrict` / `cascade` / `set null` on the foreign key to `auth.users`. `groups.owner_id` uses `restrict`. `tasks.group_id` with `cascade` is natural but stated nowhere.
6. **Creator auto-join.** Whether creating a task subscribes the creator, by analogy with `add_owner_to_group`. S-03 and the "Zadania" view depend on it. "Individual" tasks appear only in the success criterion (`prd.md:29`); FR-004 says tasks are created in a group.
7. **Navigation.** A section of `/dashboard` or a new `/tasks` page; either way `PROTECTED_ROUTES` needs the new API prefix, and a new page needs protecting.
8. **Limits.** No cap on tasks per group or user, and no duplicate-title rule, is defined.
9. **Test gaps.** Endpoint behaviour over HTTP has only smoke coverage; cookbook 6.5 (schema or migration tests) and the foreign-Origin and bad-data recipes are marked TBD until test plan Phase 2/3 (`test-plan.md:156-158`).
10. **Unverified.** Astro's Origin check default was inferred from smoke, not read from source; `foundation.test.ts`, parts of `FormField.tsx` and parts of `smoke.mjs` were not read; nothing was run, so nothing about the live app or database is verified beyond source reading.

Note: `CLAUDE.md:25` says the schema consists only of `groups` and `group_members`; it becomes stale once `tasks` ships.
