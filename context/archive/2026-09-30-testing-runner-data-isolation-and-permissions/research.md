---
date: 2026-09-30T15:58:21+02:00
researcher: Claude (Sonnet 5.5)
git_commit: 8d0aa3ed3744bad4fced0fbcb9f0cff14b5db6b8
branch: master
repository: 10xDevs
topic: "Test rollout Phase 1 — runner, data isolation and permissions (risks #2, #3)"
tags: [research, codebase, supabase, rls, group-api, test-runner, vitest]
status: complete
last_updated: 2026-09-30
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Test rollout Phase 1 — runner, data isolation and permissions

**Date**: 2026-09-30T15:58:21+02:00
**Researcher**: Claude (Sonnet 5.5), with three read-only sub-agents (DB/RLS, API endpoints, tooling/CI)
**Git Commit**: 8d0aa3ed3744bad4fced0fbcb9f0cff14b5db6b8
**Branch**: master
**Repository**: 10xDevs

## Research Question

`context/foundation/test-plan.md` §3 Phase 1: pick a runner and a local-DB setup, and identify what must be proven so that (#2) a member of one group cannot read or change another group's data and (#3) a non-creator cannot rename/delete the group or remove a member. Which layer enforces each rule, what already exists, and what constraints affect the runner choice?

## Summary

- **Both risks are enforced almost entirely by the database (RLS + column grants + SECURITY DEFINER functions), not by app code.** All group endpoints call Supabase with the user-session client under RLS; no service-role key exists in `src/` (`src/lib/supabase.ts:6-22`). Endpoint "creator" behaviour is: RLS returns 0 rows, the handler maps that to `?error=forbidden` (`rename.ts:37-39`, `delete.ts:33-35`, `remove-member.ts`).
- **A SQL-level RLS scenario suite already exists** (`supabase/checks/rls-scenarios.sql`, 533 lines, rolled-back transaction, local DB only) and already covers most cross-group/non-owner probes. It is **not run in CI** and is not a JS test. A new test that only repeats those SQL scenarios adds little; the value of Phase 1 is (a) a real runner wired into `npm`/CI, (b) PostgREST-level and endpoint-level tests (what the app actually calls), and (c) the small set of un-pinned behaviours listed under Open Questions.
- **No runner is installed** (no vitest/jest/tsx in `node_modules`; no `*.test.*` outside `.claude/`). Installed: Astro 7.3.2, Vite 8.3.0. `npm view vitest` reports 5.0.3 with peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0`, so Vitest is compatible with the installed Vite.
- **The local Supabase stack was running at research time** (auth, kong, rest, db containers healthy, up 5 days), email confirmation is off locally (`supabase/config.toml:209`), and CI already has a working recipe to start a minimal stack (`.github/workflows/ci.yml`, job `smoke`).

## Detailed Findings

### DB layer: what enforces isolation and ownership

Migrations (in order): `20260925003350_create_groups_and_group_members.sql` (M1), `20260925011727_harden_group_rls.sql` (M2), `20260925161234_add_group_member_list_and_preview.sql` (M3). M2 supersedes M1's policies.

- Tables `groups` (M1:11-19) and `group_members` (M1:21-26) have RLS enabled (M1:80-81); not FORCEd. `group_members.user_id` is UNIQUE (M1:24): one group per user.
- All policies are `TO authenticated`; no anon policy exists, so anon is default-deny (this inspected migration set).
- `groups`: SELECT owner-or-member (M2:229-231); INSERT with check `owner_id = auth.uid()` (M2:233); UPDATE and DELETE owner only (M2:236, 240). Column grants limit INSERT to `(owner_id, name)` and UPDATE to `(name)` (M2:218-220), so `join_code`, `id`, `owner_id` are not client-writable.
- `group_members`: SELECT only if `is_group_member(group_id)` (M2:244-246); **no INSERT policy** (joining only through `join_group`); no UPDATE policy; DELETE of others only by the group owner (M2:250-260); DELETE of self only for a non-owner row (M2:263-273).
- Functions (all `SECURITY DEFINER`, `search_path = ''`, anon revoked): `is_group_member` (M2:156-172), `join_group(text)` (M2:177-203), `list_group_members(uuid)` (M3:283-304; returns emails, empty set for non-members), `preview_group(text)` (M3:308-321; any authenticated caller, exact-code match). `add_owner_to_group` trigger function is revoked from all client roles (M1:69).
- UPDATE/DELETE that RLS denies return **0 rows, not an error**; column-privilege violations return SQLSTATE 42501. Tests must assert affected rows and re-check state (matches test-plan §2 anti-pattern "status-only assertion").

### Existing DB-level test: `supabase/checks/rls-scenarios.sql`

- Run with `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql` (file header lines 3-4). Failure raises an exception (psql exit 3); success ends in ROLLBACK. Located outside `supabase/tests/` so `supabase test db` skips it (lines 10-11).
- Scenario sections (start lines): F-01 145, join 175, owner-cannot-leave 213, leave 239, oracle 283, initplan 307, name/code length 326, column privileges 352, anon and cascade 383, `list_group_members` 419, `preview_group` 493.
- Covered (sub-agent read of the scenario labels and cited lines; I did not execute the file): cross-group read (161-165), direct INSERT into `group_members` with another group's id (192-193, 42501), UPDATE of `group_members` (271), member/non-member DELETE of others (261-267), non-owner rename/delete (375-376), `owner_id`/`join_code`/`id` updates (368-370), `list_group_members` for non-members (467, 485).
- Not covered per the sub-agent's read: a member reading `groups.join_code` directly; a two-member race on `join_group`; direct call of `add_owner_to_group` by a client; anything through PostgREST/HTTP (checks use `set local role` + JWT claims GUC).
- It is **not executed in CI** (the `smoke` job runs only `npm run smoke`).

### API layer: how endpoints enforce it

- Middleware (`src/middleware.ts:8-17`) resolves the user with `supabase.auth.getUser()`; `PROTECTED_ROUTES = ["/dashboard", "/api/groups"]` (`middleware.ts:4,20-24`) so anonymous requests get `302 /auth/signin`; every handler repeats the guard.
- Origin check is Astro's built-in (no code in `src/`; `origin-check.js:8-22`): a form-typed POST with an Origin different from the request origin returns 403, before app middleware. Non-form content types are not checked. Not traced: where `manifest.checkOrigin` is set (default-on inferred; smoke asserts 403 at `scripts/smoke.mjs:214-215, 518-525`). This belongs mainly to Phase 3.
- Endpoints are POST-only, always answer with 302 (never JSON); errors go to `/dashboard?error=<code>` mapped from SQLSTATE in `src/lib/group-errors.ts:14-27` (23514 invalid_name, 23505 already_in_group, P0002 invalid_code, 42501 forbidden, else unknown).
- Creator check for `rename`, `delete`, `remove-member`, `leave` is **RLS only**; the app derives the group from the caller's own membership (`getMyGroup`, `src/lib/groups.ts:20-24`), never from request input, so a request cannot name a foreign group id. Observed outcomes for this inspected code:
  - `rename` non-owner member: 0 rows → `?error=forbidden` (`rename.ts:37-39`); non-member: `getMyGroup` null → forbidden.
  - `delete` non-owner member: 0 rows → forbidden (`delete.ts:33-35`); non-member → `302 /dashboard`, no error.
  - `remove-member` non-owner: 0 rows → forbidden; caller passing own id or invalid UUID → forbidden before any DB call (`remove-member.ts:20-22`); non-member caller → `302 /dashboard`.
  - `leave` by owner: 0 rows, still in group → forbidden.
- `dashboard.astro:59` computes `isOwner` in the UI only; not a security boundary.
- There is no service-role key anywhere in `src/`; `SUPABASE_KEY` is the anon/publishable key (`astro.config.mjs:22-23`).

### Runner and environment

- `package.json`: ESM (`:3`), scripts have no `test` (`:5-14`); `supabase` CLI is a devDependency. Installed: astro 7.3.2, vite 8.3.0, supabase-js 2.116.0, typescript ^6.0.3. Local Node v24.21.0 vs `.nvmrc` 22.14.0 (CI uses 22).
- `tsconfig.json:1-13`: alias `@/*` → `./src/*`; `include` is `**/*`, so test files are type-checked. `eslint.config.js` uses `strictTypeChecked` with `projectService`, so new test files/config must lint clean; lint-staged runs on commit.
- `astro:env/server` (imported by `src/lib/supabase.ts:3`) and `astro:middleware` are Astro virtual modules; endpoints and middleware cannot be imported in plain Vitest without `getViteConfig` from `astro/config` or a mock. `src/lib/group-rules.ts`, `group-errors.ts`, `groups.ts` (takes the client as a parameter, type-only supabase import) and `join-code.ts` are importable without Astro.
- `astro.config.mjs` uses the Cloudflare adapter and `@tailwindcss/vite`; whether `getViteConfig` loads cleanly with them was **not tested**.
- Direct DB-as-user access needs no Astro: a supabase-js client with the local URL and anon key can `signUp` users (confirmations off, `config.toml:209`) and then call tables/RPCs under RLS. `supabase status -o env` also yields `SERVICE_ROLE_KEY`/`DB_URL` for admin setup/cleanup. `[auth.rate_limit]` exists (`config.toml:180`; values not read) and may throttle bulk sign-ups.
- Existing HTTP-level pattern: `scripts/smoke.mjs` (681 lines) drives a running app with per-user cookie jars, form POSTs, manual redirects, and recovers user ids from the `sb-*-auth-token` cookie; it leaves users/groups behind (no cleanup besides group delete).
- CI (`.github/workflows/ci.yml`): job `ci` runs lint, `astro check`, build (no tests); job `smoke` starts a minimal local Supabase (`supabase start -x …`), writes `.env`/`.dev.vars` from `supabase status -o env`, builds, previews on 4321 and runs `npm run smoke`. This is a template for an integration-test job.

## Code References

- `supabase/migrations/20260925011727_harden_group_rls.sql:218-273` - column grants and all group/group_members policies
- `supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:283-321` - `list_group_members`, `preview_group`
- `supabase/checks/rls-scenarios.sql:1-533` - existing SQL-level RLS scenarios
- `src/pages/api/groups/{rename,delete,remove-member,leave}.ts` - RLS-backed creator checks, 0-row → forbidden
- `src/lib/groups.ts:20-40` - `getMyGroup`, `listGroupMembers`, `previewGroup`
- `src/lib/group-errors.ts:14-27` - SQLSTATE → error code map
- `src/lib/supabase.ts:3-22` - client factory; imports `astro:env/server`
- `scripts/smoke.mjs:31-65,214-215,518-525` - cookie jar, request helper, Origin 403 steps
- `.github/workflows/ci.yml` (job `smoke`) - CI recipe for local Supabase
- `supabase/config.toml:180,209` - rate limit block, email confirmations off

## Architecture Insights

- Authorization is deliberately pushed into Postgres: the app never passes a group id from the request for group-scoped writes; it resolves it from the caller's membership. So an IDOR-style test through the API cannot even name a foreign group; the meaningful adversarial surface is direct PostgREST/RPC access with a valid user JWT, which is the layer test-plan risk #2 already targets ("bezpośrednie zapytanie do bazy").
- The two existing verification styles (HTTP smoke, SQL scenarios) are both outside a conventional runner; neither runs the DB scenarios in CI.

## Historical Context (from prior changes)

- `context/archive/group-schema-and-rls`, `group-rls-hardening`, `group-create-join-manage` (all dated 2026-09-25): origin of the policies and of `supabase/checks/rls-scenarios.sql` (per sub-agent grep of their plans; plan bodies not read in detail).
- `context/foundation/lessons.md`: smoke steps must assert outcomes, not absence of errors (applies to any new API test); run planning skills on `master` and commit artifacts before implementation.
- `context/foundation/test-plan.md:95-102, 118-127`: runner choice and DB choice are deferred to this research; gate "unit + integration (RLS, permissions)" becomes required in CI after Phase 1.

## Related Research

None applicable (`context/archive/*/research.md` for `group-create-join-manage` and `signup-error-codes` exist; not relevant to test tooling and not read).

## Open Questions

Decisions for `/10x-plan` (not resolved here):

1. **Runner**: Vitest 5.0.3 (peer range includes Vite 8) vs zero-dependency `node:test`. TS with `@/` alias favours Vitest; `node:test` on Node 22.14 would need type stripping and has no alias resolution (not tested). Recommendation: Vitest, with a plain config (no `getViteConfig`) for Phase 1, since integration tests use supabase-js directly and pure `src/lib` modules; add `getViteConfig` only if a later phase needs Astro virtual modules.
2. **Test layer for Phase 1**: (a) supabase-js as two real users against local PostgREST/RPC (matches risk-table "cheapest layer"), and/or (b) HTTP-through-the-app reusing smoke's pattern (needs a built+running app). Research finding: (a) is cheaper and reaches the enforcement point; (b) mainly adds proof that endpoints map 0 rows to `forbidden`.
3. **Relationship to `rls-scenarios.sql`**: keep it, port selected scenarios, or wire it into CI as-is. Duplication risk noted above; the oracle problem (expected values copied from policies) is mitigated by taking expectations from PRD Access Control/FR-003.
4. **Un-pinned behaviours to consider**: member can read `groups.join_code` (intended? no spec found by the sub-agent); anon can't call RPCs; `list_group_members` email exposure limited to members; leftover data/cleanup strategy and `[auth.rate_limit]` limits for many sign-ups.
5. **Environment**: local Node is 24.21.0 vs 22.14.0 in `.nvmrc`/CI; Docker/Supabase required for the integration job; whether integration tests should skip (fail loudly) when Supabase is not running.
6. `getViteConfig` compatibility with the Cloudflare adapter and `@tailwindcss/vite` was not tested; `manifest.checkOrigin` default-on was inferred, not traced.
