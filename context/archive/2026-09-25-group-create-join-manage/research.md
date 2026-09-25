---
date: 2026-09-25T15:48:47+02:00
researcher: Claude (Sonnet 5), for Mariusz Złotucha
git_commit: fe0c8993bb75bd51a8cf55dae49009f8b044f4fa
branch: master
repository: streak-board (local dir 10xDevs)
topic: "group-create-join-manage (S-01): what exists and what constrains creating a group, joining by link/code, and owner management"
tags: [research, codebase, groups, group_members, join_group, rls, middleware, api-routes, s-01]
status: complete
last_updated: 2026-09-25
last_updated_by: Claude (Sonnet 5)
---

# Research: group-create-join-manage (S-01)

**Date**: 2026-09-25T15:48:47+02:00
**Git Commit**: fe0c8993bb75bd51a8cf55dae49009f8b044f4fa (working tree: only `context/changes/group-create-join-manage/` is untracked)
**Branch**: master
**Repository**: streak-board

## Research Question

No question was supplied beyond the change id. It was derived from the roadmap slice S-01 (`context/foundation/roadmap.md:79-90`): a user can create a group, join an existing group by link/code, and as its creator delete the group or remove a member (PRD FR-002, FR-003; roadmap also cites FR-001). What already exists in the database and the app layer, what earlier changes decided or deferred, and what S-01 therefore has to build?

## Summary

- **The database side of S-01 is already done.** Two applied migrations (`supabase/migrations/20260925003350_create_groups_and_group_members.sql`, `…011727_harden_group_rls.sql`) provide `groups`, `group_members`, owner auto-join, `join_group(p_join_code text) returns uuid`, RLS for delete-group / remove-member / member-leaves, and column grants. S-01 needs no schema change to meet FR-002/FR-003 as written (see gaps below for the exceptions).
- **The app side has nothing for groups.** In the inspected `src/` tree (all files listed by `find src -type f`) there are no group pages, no `/api/groups` routes, no group helper in `src/lib`, and nothing imports `src/types.ts`. The Supabase client is untyped (`src/lib/supabase.ts:9`).
- **Mechanism contract for S-01** (from the hardening plan, verified against the migration): create = direct `insert` of `{ name, owner_id }` into `groups`; join = `rpc('join_group', { p_join_code })` handling `P0002` and `23505`; leave = delete own `group_members` row (non-owners only); remove member / delete group = owner deletes rows; rename = update `name` only.
- **Not decided anywhere** (S-01 must decide): the invite link format/route, code normalization, what happens when a user who is already in a group opens a join link, delete-group confirmation, and how members are displayed (see Open Questions).
- **New gap found in this research:** no table or column exposes a member's display identity. `group_members` holds only `user_id` (`…003350_create_groups_and_group_members.sql:21-26`) and a grep of `supabase/` and `src/` for `profiles|display_name|raw_user_meta` returned no matches. A "remove a member" UI can therefore only show opaque user ids unless S-01 adds an identity source.

## Detailed Findings

### Database: what S-01 can rely on

Condition: local migrations as they exist at this commit; "applied to production" is not verified (see Open Questions).

- Tables: `groups(id, owner_id → auth.users ON DELETE RESTRICT, name, join_code UNIQUE, created_at)` and `group_members(id, group_id → groups ON DELETE CASCADE, user_id UNIQUE → auth.users ON DELETE CASCADE, joined_at)` (`…003350…sql:11-26`). `UNIQUE(user_id)` is what enforces the PRD Non-Goal "one group per user" (`…003350…sql:4-5`; PRD `context/foundation/prd.md`, Non-Goals).
- Creation: an `AFTER INSERT` trigger `groups_add_owner_to_group` inserts the owner into `group_members` (`…003350…sql:56-74`). A second group by the same user violates `UNIQUE(user_id)` and rolls the `groups` insert back. The `groups` SELECT policy includes `owner_id = (select auth.uid())` so `.insert().select()` (RETURNING) works before the trigger has run (`…011727…sql:106-110`).
- Client write surface on `groups` after hardening: INSERT only `(owner_id, name)`, UPDATE only `(name)` (`…011727…sql:97-99`). Sending `id` or `join_code` yields `42501` (asserted in `supabase/checks/rls-scenarios.sql`, section `#8`).
- `groups.name` CHECK: `char_length(btrim(name, E' \t\r\n')) between 1 and 80`, violation `23514` (`…011727…sql:88-89`).
- `join_code`: 12 hex characters for new groups (`…011727…sql:92-93`); groups created before the hardening migration keep 8-character codes ("Only new groups get 12 characters; existing codes stay valid", same file, line 91). Members can read it via the `groups` SELECT policy (`…011727…sql:108-110`); non-members cannot see any `groups` row.
- Join: `join_group(p_join_code)` is `SECURITY DEFINER`, executable by `authenticated` only (`…011727…sql:56-82`). Exact string match; unknown code → `P0002`; already in a group → `23505` from `UNIQUE(user_id)`; success returns the group id. There is no INSERT policy on `group_members`, so direct inserts are default-denied (`…011727…sql:122`).
- Removal/leave policies on `group_members` (`…011727…sql:127-152`): the owner may delete any row except their own; a non-owner may delete only their own row; there is no UPDATE policy. The owner "leaves" only by deleting the group, and the cascade bypasses RLS (comment at `…011727…sql:127-129`).
- Group delete/rename: owner-only (`…003350…sql:94-101`, amended at `…011727…sql:115-120`).
- Regression harness: `supabase/checks/rls-scenarios.sql` is run manually against local Docker (header, lines 1-9); it is not wired into `.github/workflows/ci.yml` (per app-layer inspection of the workflow's two jobs, `ci` and `smoke`). Any S-01 migration touching group RLS should re-run it.

### App layer: conventions a new implementation would follow

Condition: inspected files `src/middleware.ts`, `src/lib/supabase.ts`, `src/lib/auth-errors.ts`, `src/pages/api/auth/*.ts`, `src/types.ts`, `src/env.d.ts`, `src/pages/{dashboard,index}.astro`, `src/layouts/Layout.astro`, `src/components/{Topbar.astro,Welcome.astro,auth/*,ui/*,hooks/*}`, `scripts/smoke.mjs`, `package.json`.

- **Middleware** (`src/middleware.ts:7-31`): per request it builds a client, calls `supabase.auth.getUser()` and stores only `locals.user` (`src/env.d.ts:1-5` types `user` only). `PROTECTED_ROUTES = ["/dashboard"]` (line 4) is matched with `pathname.startsWith` (line 19) for every method and path, so on this inspected path an unauthenticated call to any protected prefix, including `/api/*`, gets a 302 to `/auth/signin` with no return-to parameter (lines 19-23). Adding group routes means extending that array. Consequence: an anonymous user opening a join link is sent to sign-in and the code in the URL is lost after login unless S-01 carries it (e.g. in a cookie or `?next=`; the existing `auth_email` cookie in `src/lib/auth-email.ts` is the only precedent for carrying state across the redirect, and it is email-specific).
- **Client factory** (`src/lib/supabase.ts:5-19`): `createClient(headers, cookies)` per request, returns `null` if `SUPABASE_URL`/`SUPABASE_KEY` are unset; not typed with `Database`. Middleware does not put the client on `locals`, so each route builds its own (`src/pages/api/auth/*.ts`).
- **API routes**: `POST: APIRoute` exports only, native form-encoded bodies via `request.formData()`, always a 302 redirect back with `?error=<code>` on failure, `null` client → `?error=not_configured`, `try/catch` with `console.error` + `?error=unknown` (`src/pages/api/auth/signin.ts:7-30`, `signup.ts` same shape; `signout.ts` has no try/catch). No `export const prerender` appears anywhere under `src/` and `astro.config.mjs:274` sets `output: "server"`; CLAUDE.md asks for `prerender = false` on API routes, but the existing auth routes do not export it. Error codes are a fixed union resolved back to messages with `Object.hasOwn` so foreign `?error=` values are not reflected (`src/lib/auth-errors.ts:26,69`; a smoke step covers this). There is no group error module yet, and no JSON/fetch precedent.
- **`src/types.ts`** exists and is tracked (commits `9efb772`, `0bcef72`): generated `Database` type with `groups`, `group_members`, and `Functions.is_group_member` / `join_group`. CLAUDE.md:23 and AGENTS.md:23 still say it is "not yet created", which is stale. Regeneration command and lint exclusion are recorded in the hardening plan.
- **Pages/UI**: `dashboard.astro` shows the user's email and a sign-out form, no group content (it reads `Astro.locals.user`). `Topbar.astro` (email, `/dashboard` link, sign-out) is imported only by `Welcome.astro` (grep `Topbar` over `src/`), i.e. the landing page, not the dashboard. Auth forms are native `<form method="POST">` React islands with client-side validation, `useFormSubmitting`, and a `serverError` prop resolved by the `.astro` page (`src/components/auth/SignInForm.tsx:50`, `src/pages/auth/signin.astro`). Reusable: `FormField` (requires an `icon` prop), `SubmitButton`, `ServerError`, `Card`, `Button`, `Alert`, `Input`, `Label`. Not present: `dialog`, `alert-dialog`, `dropdown-menu`, `badge`, `separator`, list/table, toast. `radix-ui` is a dependency and shadcn components are added with `npx shadcn@latest add` (CLAUDE.md), `components.json` exists.
- **Smoke test** (`scripts/smoke.mjs`): dependency-free, single cookie jar, form-encoded requests only, one signed-up user per run; the anonymous-redirect step for `/dashboard` is at line 46 and signed-in steps at lines 102-106. Join and remove-member paths need a second user/jar, which the script does not support today. No test runner exists (CLAUDE.md, Commands).

### Relevant consequences for the S-01 design (facts derived, not decisions)

- Join preview: non-members cannot read `groups` (RLS), and `join_group` returns only the group id, so a "Join group <name>?" confirmation page cannot show the name before joining without a new function or policy. Inference from `…011727…sql:56-82,108-110`.
- Members list: displaying members needs an identity source that does not exist (see Summary). `auth.users` is not readable by `authenticated` through PostgREST by default; whether that holds here was not tested.
- Already-in-group user + join link: `join_group` raises `23505` for both "already in this group" and "already in another group" (same constraint), so S-01 cannot tell them apart from the error alone.

## Code References

- `supabase/migrations/20260925003350_create_groups_and_group_members.sql:11-26` - tables and `UNIQUE(user_id)`
- `supabase/migrations/20260925003350_create_groups_and_group_members.sql:56-74` - owner auto-join trigger
- `supabase/migrations/20260925011727_harden_group_rls.sql:56-82` - `join_group` RPC
- `supabase/migrations/20260925011727_harden_group_rls.sql:88-99` - name CHECK, code default length, column grants
- `supabase/migrations/20260925011727_harden_group_rls.sql:106-152` - final policies on `groups` and `group_members`
- `supabase/checks/rls-scenarios.sql:1-9` - how to run the manual RLS regression
- `src/middleware.ts:4,19-23` - `PROTECTED_ROUTES`, redirect for anonymous users
- `src/lib/supabase.ts:5-19` - untyped per-request client, `null` when unconfigured
- `src/pages/api/auth/signin.ts:7-30` - API route shape to copy
- `src/lib/auth-errors.ts:26,69` - error-code → message resolution pattern
- `src/types.ts:31-92` - generated types for `group_members`, `groups`, functions
- `src/components/Topbar.astro` / `src/components/Welcome.astro:2,18` - nav is only on the landing page
- `scripts/smoke.mjs:46,102-106` - smoke steps to extend
- `context/foundation/roadmap.md:79-90` - S-01 definition (Unknowns: none listed)

## Architecture Insights

- Authorization lives in Postgres (RLS + `SECURITY DEFINER` RPC with `search_path=''`), not in app code; the app only forwards the user's session. No service-role key exists in the app and the plans anticipate none (`.env.example` lists only `SUPABASE_URL`/`SUPABASE_KEY`, per the history agent; consistent with `astro.config.mjs` env schema). S-01 should keep that.
- App pattern is server-rendered pages plus native form POST → 302 redirect with an error code; there is no client-side fetch pattern. Group actions (create, join, remove member, delete group) fit the same shape with hidden fields.
- Policy conventions to copy in any new migration: `TO authenticated`, `(select auth.uid())`, explicit column grants for any new editable column, and migrations named `YYYYMMDDHHmmss_desc.sql` (archived migrations are immutable).

## Historical Context (from prior changes)

Each claim is scored separately against the current migration bytes.

- `context/archive/2026-09-25-group-schema-and-rls/plan.md` (line 40 per the history agent): deferred join-code validation to S-01, with an interim INSERT policy on `group_members` — **contradicted for current state**: that policy was dropped (`…011727…sql:24`) and validation shipped as `join_group`.
- Same plan: only the owner removes members, self-leave out of scope — **partially superseded**: the hardening migration added member self-leave (`…011727…sql:141-152`); owner-removes-others still holds (`…011727…sql:127-139`).
- `context/archive/2026-09-25-group-rls-hardening/plan.md` (lines 44, 194, 203 per the history agent): "join API/UI stays in S-01, calling `rpc('join_group')`" and the write contract listed in the Summary — **supported** by the migration.
- Hardening plan: rate limiting, code rotation/expiry, ownership transfer, and collision retry are out of scope — **supported** as not implemented in the inspected migrations (no such objects in either file).
- Hardening reviews (`reviews/impl-review*.md`): a name of only tabs/newlines once slipped past a plain `btrim`; fixed by trimming `E' \t\r\n'` (`…011727…sql:89`). UI validation should use the same trim set. Also: the phase commit once swept in unrelated `CLAUDE.md` changes, so stage only planned files. (Per the history agent's read of the review files; not re-read by the main agent.)
- `context/foundation/lessons.md:5-17`: English commit messages; branch `s-01/group-create-join-manage/phase-<N>` from fresh `master`, PR via `gh`; review-fix branch `s-01/group-create-join-manage/review-fix`; archive commit directly on `master`, pushed.
- Roadmap staleness: `context/foundation/roadmap.md:132` (Backlog Handoff) still says "Run `/10x-plan group-schema-and-rls`" for F-01, which is already done; S-01's entry does not mention that `join_group` exists.

## Related Research

- `context/archive/2026-09-25-signup-error-codes/research.md` - auth error-code pattern that group error codes would mirror (not re-read for this document beyond a grep for group terms).
- `context/archive/2026-09-25-ui-styles-audit/research.md` - UI token/component work (not relevant to group logic; not read).

## Open Questions

Product/design choices for `/10x-plan` (not decided in any inspected source):

1. Invite link: URL shape (e.g. `/join/<code>` vs `/join?code=`), and how a not-yet-signed-in user keeps the code across sign-in/sign-up (middleware drops it today).
2. Join-link behavior for a user already in a group (same `23505` for both cases).
3. Code normalization (trim/case), given old 8-character and new 12-character codes coexist.
4. Member display identity and a way to show the group name before joining (both need something new: profile/identity source; a preview function).
5. Delete-group confirmation UX (no `alert-dialog` component exists).
6. Whether FR-001 (login variants: OAuth/passwordless) is in S-01 scope: the roadmap lists it as an open question (`roadmap.md`, Open Roadmap Questions) and the existing email+password login is what S-01 would use.
7. Where group navigation lives (dashboard vs. Topbar, which only renders on the landing page).

Evidence gaps (not resolved here):

- Whether F-01/hardening migrations were pushed to the production Supabase project: not verified; the hardening plan says production is a separate step and no staging exists. The `groups.name` CHECK could fail on existing production rows if any exist.
- Whether Astro's default CSRF origin check applies to the form POSTs S-01 will add: `astro.config.mjs` has no `security` setting (grep), and `scripts/smoke.mjs` sends an `Origin` header; behavior not exercised.
- `is_group_member` grants and cascade behavior were not re-run; this research read source only and ran no builds, tests, or SQL.
