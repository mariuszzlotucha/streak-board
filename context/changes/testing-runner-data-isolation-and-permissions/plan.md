# Test rollout Phase 1 — runner, data isolation and permissions Implementation Plan

## Overview

Add Vitest as the project's first unit/integration runner and use it to prove, against the local Supabase stack, that (risk #2) a user outside a group cannot read or change that group's data and (risk #3) only the group's creator can rename or delete it and remove members. The existing `supabase/checks/rls-scenarios.sql` stays as it is and joins CI. No application code and no schema change: this is a test-only change, so there is no migration and no production release step.

## Current State Analysis

- Isolation and ownership are enforced by the database (RLS policies, column grants, `SECURITY DEFINER` functions); endpoints only map "0 rows" to `?error=forbidden` (`research.md`, "DB layer" and "API layer").
- `supabase/checks/rls-scenarios.sql` (533 lines) already covers most SQL-level scenarios, runs only by hand via `docker exec … psql`, and is not in CI (`research.md`, "Existing DB-level test").
- No runner exists: no vitest/jest/tsx in `node_modules`, no `*.test.*` outside `.claude/`, no `test` script (`package.json:5-14`).
- Installed: Astro 7.3.2, Vite 8.3.0, `@supabase/supabase-js` 2.116.0. `npm view vitest` gives 5.0.3 with peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0`.
- Local Supabase is up, email confirmation is off (`supabase/config.toml:209`), and `supabase status -o env` yields `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`.
- CI job `smoke` (`.github/workflows/ci.yml:27-55`) already starts a minimal stack; `ci` job runs lint, `astro check`, build.
- ESLint is `strictTypeChecked` with `projectService`; `tsconfig.json` includes `**/*`, so test files are linted and type-checked.
- Local Node is 24.21.0; `.nvmrc` and CI use 22.

## Desired End State

`npm test` runs Vitest integration tests that sign in two or more real users on the local stack and, through PostgREST and RPC under RLS, prove the #2 and #3 scenarios below, each with a positive control so a test cannot pass vacuously. A new CI job `integration` runs `npm test` and `rls-scenarios.sql` on every PR to `master`. `test-plan.md` §3/§4/§5/§6.2/§6.4 and the README describe how to add such a test.

Verify: `npm test` green locally with the stack running; loud, actionable failure without it; CI job green; deliberately weakening a policy on a local stack turns the relevant test red.

### Key Discoveries:

- Endpoints derive the group from the caller's own membership (`src/lib/groups.ts:20-24`), so an IDOR through the API cannot name a foreign group; the meaningful attack surface is direct PostgREST/RPC with a valid JWT (`research.md`, Architecture Insights).
- Denied UPDATE/DELETE returns 0 rows, not an error; column-privilege violations return SQLSTATE 42501 (`research.md`, DB layer). Tests must assert affected rows and re-read state.
- `groups.owner_id` references `auth.users` `ON DELETE RESTRICT` (M1:13-14), so cleanup must delete groups before users.
- `group_members.user_id` is UNIQUE (M1:24): a user can be in only one group, so each scenario needs its own fresh users.
- `supabase/checks/rls-scenarios.sql:10-11` lives outside `supabase/tests/` on purpose so `supabase test db` skips it.

## What We're NOT Doing

- No HTTP-through-the-app tests of `/api/groups/*` (decided: supabase-js layer only; endpoint mapping stays covered by `npm run smoke`).
- No rewrite or port of `rls-scenarios.sql` into Vitest.
- No pgTAP, no `supabase test db`.
- No tests for join-code readability by members, `add_owner_to_group` direct calls, or `join_group` races (decided out of scope for this phase).
- No unit tests of validation rules (Phase 3 of the test plan), release-ordering gate (Phase 2), streak (Phase 4), e2e.
- No changes to application code, migrations or `src/types.ts`.
- No production deploy or migration step (nothing ships to production).

## Implementation Approach

Vitest with a plain `vitest.config.ts` (no `getViteConfig`): integration tests talk to Supabase through `@supabase/supabase-js` and need neither Astro virtual modules nor the Cloudflare adapter. A global setup resolves and validates the local stack, a small helper layer creates and cleans up users and groups, and scenario files express expectations from the product rules (PRD Access Control, FR-003), not by copying the policies. Ship in four phases, each its own branch and PR.

## Critical Implementation Details

- **Safety guard**: the helpers use the service-role key to create/delete users and groups. The global setup must refuse any `API_URL` whose host is not `127.0.0.1` or `localhost`, so tests can never touch the hosted project.
- **Cleanup order**: delete groups (service role) before deleting users, because of `ON DELETE RESTRICT` on `groups.owner_id`; deleting a group cascades its memberships.
- **Oracle**: expected outcomes come from `context/foundation/prd.md` Access Control and FR-003, not from reading the policies; read those sections before writing scenarios.
- **Rate limits**: `[auth.rate_limit] sign_in_sign_ups = 30` per 5 minutes per IP (`supabase/config.toml:190`). Create users with `auth.admin.createUser` (service role, `email_confirm: true`) and sign each in once per test file, never per test.
- **Group lifecycle**: users live per test file, groups live per test. Each test builds its own group (owner creates, members join via `join_group`) and an `afterEach` deletes it through the admin client; deleting a group cascades its memberships, which frees the members (one group per user) for the next test. Destructive scenarios therefore never depend on test order.

## Phase 1: Runner and integration-test foundation

### Overview

Install Vitest, add `npm test`, and build the shared setup and helpers, proven by one smoke-level test. Nothing here asserts product rules yet.

### Changes Required:

#### 1. Runner and scripts

**File**: `package.json`, `vitest.config.ts` (new)

**Intent**: Add Vitest as a devDependency and a `test` script; configure it for Node-environment integration tests under `tests/integration/`, with the `@/*` alias resolved via `tsconfig` paths and a global setup file.

**Contract**: `npm test` runs `vitest run`; config has no Astro/Cloudflare plugins; `include: ["tests/**/*.test.ts"]`; `globalSetup` points to the setup file below; generous per-test timeout suited to network calls. Vitest 5.0.3 declares engines `^22.12.0 || ^24.0.0 || >=26.0.0`, which fits `.nvmrc` (22.14.0) and local Node 24.21.0; re-check the range if a newer patch is installed.

#### 2. Global setup and stack resolution

**File**: `tests/setup/global-setup.ts` (new)

**Intent**: Resolve the local Supabase URL, anon key and service-role key once per run, validate that they are local, and fail loudly with a `supabase start` hint when the stack is unreachable.

**Contract**: sources, in order: env `TEST_SUPABASE_URL` / `TEST_SUPABASE_ANON_KEY` / `TEST_SUPABASE_SERVICE_ROLE_KEY` (all three or none), else output of `npx supabase status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`). Throws when the host is not `127.0.0.1`/`localhost`, and when a health call to the API fails, with a message containing `supabase start`. Exposes the values to test files via Vitest `provide`/`inject` (or env), not via committed files. Its teardown sweeps leftover users whose e-mail carries the test prefix (deleting their groups first), so a crashed file cannot accumulate rows.

#### 3. Test helpers

**File**: `tests/helpers/supabase.ts` (new)

**Intent**: One place to build admin and per-user clients and to create, sign in and clean up disposable users and groups.

**Contract**: `createTestUser()` returns `{ id, email, client }` (fresh unique email with a fixed test prefix, `auth.admin.createUser` with `email_confirm: true`, then `signInWithPassword` on an anon-key client created with `persistSession: false` and `autoRefreshToken: false` so no timers keep the process alive); `anonClient()` with no session (same options); `adminClient()` (service role); `createGroupAs(user, name)` uses the user client (`insert({name, owner_id})` then reads back id and `join_code` through the user's own SELECT); `joinGroupAs(user, code)` uses RPC `join_group`. Cleanup registry: groups created in a test are deleted in `afterEach` via the admin client; users created in a file are deleted in `afterAll`, groups before users. Helpers throw on unexpected errors so a broken setup can never look like a passing denial.

#### 4. Foundation test

**File**: `tests/integration/foundation.test.ts` (new)

**Intent**: Prove the harness works: a fresh user can create a group and read it back, and cleanup leaves no rows behind.

**Contract**: one test creating a user and group, asserting the user sees their own group, then (after cleanup) that the admin client finds neither the user nor the group.

#### 5. Lint and types

**File**: `eslint.config.js`, `tsconfig.json` (only if needed)

**Intent**: Make the new files pass the existing strict rules without loosening them for application code.

**Contract**: prefer no config change; if Vitest globals or `@types/node` are needed, add the minimum (explicit imports from `vitest` avoid globals).

### Success Criteria:

#### Automated Verification:

- Foundation test passes with the local stack running: `npm test`
- Unreachable stack fails loudly with a `supabase start` hint: `TEST_SUPABASE_URL=http://127.0.0.1:1 TEST_SUPABASE_ANON_KEY=x TEST_SUPABASE_SERVICE_ROLE_KEY=x npm test`
- Non-local URL is refused: `TEST_SUPABASE_URL=https://example.supabase.co TEST_SUPABASE_ANON_KEY=x TEST_SUPABASE_SERVICE_ROLE_KEY=x npm test`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build still passes: `npm run build`

#### Manual Verification:

- After `npm test`, Studio (or `docker exec … psql`) shows no leftover test users or groups
- Two consecutive `npm test` runs both pass on the same database
- Rate-limit headroom noted: `sign_in_sign_ups = 30` per 5 minutes and the sign-ins per file recorded in the phase note

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Cross-group data isolation (risk #2)

### Overview

Prove that a user outside group A, and an anonymous client, cannot read or change group A's data through PostgREST/RPC.

### Changes Required:

#### 1. Isolation scenarios

**File**: `tests/integration/group-isolation.test.ts` (new)

**Intent**: Scenario tests with users A (owner of group GA), A2 (member of GA), B (owner of a different group GB) and C (no group), each with a positive control.

**Contract**: each denial test asserts the response (empty result, 0 affected rows, or the specific SQLSTATE) and then re-reads state through the admin client to prove nothing changed. Scenarios:
- Positive controls: A and A2 read GA and its members; A2 sees GA only, never GB.
- B and C `select` on `groups` filtered by GA's id return no row; unfiltered `select` returns only their own group (or none).
- B and C `select` on `group_members` for GA return no rows.
- B and C call `list_group_members(GA)` and get an empty set (no emails leak).
- B `update` of GA's `name` and `delete` of GA affect 0 rows; GA and its name are unchanged afterwards.
- B `insert` into `group_members` with GA's id fails (42501) and B is not a member afterwards.
- C (no group) `insert` into `groups` with `owner_id = A` fails (42501); use C so the failure can only come from RLS, not from the one-group-per-user constraint.
- Anonymous client: `select` on `groups`/`group_members` returns no data; `insert` into `groups` fails; RPCs `join_group`, `list_group_members`, `preview_group` are rejected (no successful result).

### Success Criteria:

#### Automated Verification:

- Isolation tests pass: `npm test -- tests/integration/group-isolation.test.ts`
- Full suite passes: `npm test`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`

#### Manual Verification:

- Mutation check on a local stack (accepting a `supabase db reset` afterwards): weaken `groups_select_own_group` (for example `using (true)`) via `docker exec … psql`; the isolation tests fail; restore with `npx supabase db reset` and confirm green
- Expectations in the file trace to PRD Access Control / FR-003, not to policy text
- Every denial test has a paired positive control

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Creator-only permissions (risk #3)

### Overview

Prove that only the group creator can rename or delete the group and remove members; other roles are refused and data stays unchanged.

### Changes Required:

#### 1. Permission scenarios

**File**: `tests/integration/group-permissions.test.ts` (new)

**Intent**: Scenarios with owner A, members M and M2, and outsider X (no group), including the owner-allowed control cases.

**Contract**: each test builds its own group and is cleaned up in `afterEach` (see Critical Implementation Details); each denial asserts 0 affected rows (or the SQLSTATE) and re-reads state through the admin client. Scenarios:
- Owner control: A renames GA (name changes), removes M2 (row gone), and deletes GA at the end (memberships cascade).
- M `update` of GA's `name` affects 0 rows; X does too; name unchanged.
- M `delete` of GA affects 0 rows; GA and all memberships still exist.
- M removing M2 (`delete` on `group_members`) affects 0 rows; M2 still a member; X removing anyone in GA affects 0 rows.
- A cannot change `owner_id`, `join_code` or `id` of GA (42501); state unchanged.
- A cannot remove or leave their own membership (0 rows; still owner and member).
- M can leave (own row) but cannot delete another member's row.

### Success Criteria:

#### Automated Verification:

- Permission tests pass: `npm test -- tests/integration/group-permissions.test.ts`
- Full suite passes: `npm test`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`

#### Manual Verification:

- Mutation check on a local stack: weaken `group_members_delete_by_group_owner` (drop the owner condition); the remove-member test fails; restore with `npx supabase db reset` and confirm green
- Every denial test has a paired owner-allowed control and asserts state, not only status

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: CI gate and documentation

### Overview

Make the tests a required gate: a new CI job, `rls-scenarios.sql` in CI, and updated docs.

### Changes Required:

#### 1. CI job

**File**: `.github/workflows/ci.yml`

**Intent**: Add job `integration` next to `smoke`: same checkout/Node 22/`supabase/setup-cli`/`npm ci`/minimal `supabase start -x …` recipe, then run the Vitest suite and the SQL scenario file, and always stop the stack.

**Contract**: steps after start: `npm test` (the global setup reads `supabase status -o env`, no secrets needed); then `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql`; `if: always()` `supabase stop --no-backup`. Container name is fixed by `project_id` in `supabase/config.toml`.

#### 2. Local convenience script

**File**: `package.json`

**Intent**: Give the SQL scenarios the same one-command entry as the tests.

**Contract**: `test:rls` runs the same `docker exec … psql` command as above.

#### 3. Docs

**File**: `context/foundation/test-plan.md`, `README.md`, `CLAUDE.md`

**Intent**: Record the outcome and how to add tests.

**Contract**: `test-plan.md` — §3 Phase 1 status and change folder, §4 stack rows (Vitest version with checked date, integration DB confirmed), §5 gate row wired, §6.2 and §6.4 filled with the two-user pattern and the "assert rows + re-read state" rule, §6.6 short note on surprises, §8 freshness dates. `README.md` — a "Tests" section (prerequisites `supabase start`, `npm test`, `npm run test:rls`). `CLAUDE.md` (repo) — replace "No test runner beyond `npm run smoke`…" with the new commands.

### Success Criteria:

#### Automated Verification:

- Suite passes locally: `npm test`
- SQL scenarios pass locally: `npm run test:rls`
- Linting passes: `npm run lint`
- Workflow YAML is valid and lists the new job: `npx prettier --check .github/workflows/ci.yml`
- The `integration` job is green on the phase PR (check with `gh pr checks`)

#### Manual Verification:

- Deliberately breaking a policy on a throwaway branch turns the `integration` job red (or the local mutation check from Phases 2–3 is accepted as equivalent)
- `test-plan.md` cookbook sections read correctly to someone adding a new test
- `integration` is confirmed or set as a required status check for `master` in GitHub branch protection (done by the user in GitHub settings)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None in this change (validation rules are Phase 3 of the test plan).

### Integration Tests:

- Two-or-more-user scenarios against local PostgREST/RPC (Phases 2–3), plus the existing SQL scenario file in CI (Phase 4).

### Manual Testing Steps:

1. Run `npm test` twice on the same stack; both pass, no leftover users/groups.
2. Mutation check per Phases 2 and 3: weaken one policy, see the matching test fail, `npx supabase db reset`, see green.
3. Run with the stack stopped and with a non-local URL; both fail loudly with a clear message.

## Performance Considerations

Users are created once per test file and cleaned up in `afterAll`, keeping sign-in volume within the local auth rate limit. CI adds the stack start time (~the same as the `smoke` job) in a parallel job.

## Migration Notes

None: no schema, data or application change; nothing to deploy to production. Local `supabase db reset` is used only in manual mutation checks and wipes local development data.

## References

- Related research: `context/changes/testing-runner-data-isolation-and-permissions/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 risks #2 and #3, §3 Phase 1, §5 gates, §6 cookbook)
- Existing SQL scenarios: `supabase/checks/rls-scenarios.sql`
- Policies: `supabase/migrations/20260925011727_harden_group_rls.sql:218-273`
- CI recipe: `.github/workflows/ci.yml:27-55`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner and integration-test foundation

#### Automated

- [x] 1.1 Foundation test passes with the local stack running — f20d41e
- [x] 1.2 Unreachable stack fails loudly with a `supabase start` hint — f20d41e
- [x] 1.3 Non-local URL is refused — f20d41e
- [x] 1.4 Linting passes — f20d41e
- [x] 1.5 Type checking passes — f20d41e
- [x] 1.6 Build still passes — f20d41e

#### Manual

- [x] 1.7 No leftover test users or groups after a run — f20d41e
- [x] 1.8 Two consecutive runs both pass on the same database — f20d41e
- [x] 1.9 Rate-limit headroom noted — f20d41e

### Phase 2: Cross-group data isolation (risk #2)

#### Automated

- [x] 2.1 Isolation tests pass — cdd949c
- [x] 2.2 Full suite passes — cdd949c
- [x] 2.3 Linting passes — cdd949c
- [x] 2.4 Type checking passes — cdd949c

#### Manual

- [x] 2.5 Mutation check turns the isolation tests red and restores green — cdd949c
- [x] 2.6 Expectations trace to PRD Access Control / FR-003 — cdd949c
- [x] 2.7 Every denial test has a paired positive control — cdd949c

### Phase 3: Creator-only permissions (risk #3)

#### Automated

- [x] 3.1 Permission tests pass
- [x] 3.2 Full suite passes
- [x] 3.3 Linting passes
- [x] 3.4 Type checking passes

#### Manual

- [x] 3.5 Mutation check turns the remove-member test red and restores green
- [x] 3.6 Every denial test has a paired owner-allowed control and asserts state

### Phase 4: CI gate and documentation

#### Automated

- [ ] 4.1 Suite passes locally
- [ ] 4.2 SQL scenarios pass locally
- [ ] 4.3 Linting passes
- [ ] 4.4 Workflow YAML is valid and lists the new job
- [ ] 4.5 The `integration` job is green on the phase PR

#### Manual

- [ ] 4.6 A deliberately broken policy turns the integration gate red
- [ ] 4.7 test-plan cookbook sections read correctly
- [ ] 4.8 `integration` is a required status check for `master`
