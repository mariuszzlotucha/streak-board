# Test rollout Phase 1 — runner, data isolation and permissions — Plan Brief

> Full plan: `context/changes/testing-runner-data-isolation-and-permissions/plan.md`
> Research: `context/changes/testing-runner-data-isolation-and-permissions/research.md`

## What & Why

Add the project's first test runner (Vitest) and use it to prove two high-impact risks from `test-plan.md`: a member of one group must not see or change another group's data (#2), and only a group's creator may rename or delete it and remove members (#3). Today the only automated checks are lint, build and an HTTP smoke script; the SQL RLS scenarios are run by hand.

## Starting Point

Isolation and ownership already live in Postgres (RLS, column grants, `SECURITY DEFINER` functions), and `supabase/checks/rls-scenarios.sql` covers many scenarios but is not in CI. No runner, no `test` script, no `*.test.*` files. The local Supabase stack, email-confirmation-off config and a CI recipe for starting the stack already exist.

## Desired End State

`npm test` signs in real users on the local stack, exercises PostgREST/RPC under RLS and shows the #2 and #3 rules hold, with positive controls and state re-checks. A new CI job runs the suite plus the SQL scenarios on every PR. `test-plan.md`, README and CLAUDE.md explain how to add such tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test layer | supabase-js as two or more real users | Hits the enforcement point (PostgREST + JWT) cheaply, without booting Astro. | Plan |
| Runner | Vitest 5, plain config (no `getViteConfig`) | Peer range includes installed Vite 8; tests need neither Astro virtual modules nor the Cloudflare adapter. | Research / Plan |
| `rls-scenarios.sql` | Keep unchanged, run in CI | Avoids duplicating ~40 scenarios and losing the subtle ones (initplan, column grants). | Plan |
| Test data | Unique users per file, cleanup via service role | Repeatable on one database; groups deleted before users because of `ON DELETE RESTRICT`. | Plan |
| Extra coverage | Anonymous client denied on tables and RPCs | Closes the unauthenticated PostgREST path that SQL checks do not touch. | Plan |
| CI | New `integration` job, `npm test` fails loudly when the stack is down | Satisfies the "required after Phase 1" gate with no silent green. | Plan |
| Safety | Setup refuses any non-local URL | Service-role key must never reach the hosted project. | Plan |

## Scope

**In scope:** Vitest setup, helpers, isolation and permission tests, anon denial, CI job, `test:rls` script, docs updates.

**Out of scope:** HTTP endpoint tests, porting the SQL file, pgTAP, join-code readability, `add_owner_to_group`, `join_group` races, validation/streak/release-gate tests, e2e, any app or schema change, production deploy.

## Architecture / Approach

Global setup resolves URL and keys from env or `supabase status -o env`, validates that they are local, and fails with a `supabase start` hint if the API is unreachable. Helpers create disposable users through the admin API, sign them in with the anon key, and register groups and users for cleanup. Scenario files assert response and then re-read state as admin. Expectations come from PRD Access Control and FR-003, not from the policy text.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Runner and foundation | Vitest, `npm test`, setup, helpers, one harness test | Vitest 5 vs Node/ESLint strict config; auth rate limits |
| 2. Cross-group isolation (#2) | Denial tests for outsider and anon, with controls | Vacuous tests that pass for the wrong reason |
| 3. Creator-only permissions (#3) | Owner vs member vs outsider tests | Silent 0-row denials mistaken for success |
| 4. CI gate and docs | `integration` job, `test:rls`, doc updates | CI stack start time and container name coupling |

**Prerequisites:** local Docker and `supabase start`; PRD Access Control section available.
**Estimated effort:** ~3-4 sessions across 4 phases (one PR each).

## Open Risks & Assumptions

- Vitest 5 Node engine range versus `.nvmrc` 22.14.0 is unchecked; Phase 1 verifies it.
- `[auth.rate_limit]` values were not read; sign-ins per file are kept small and checked in Phase 1.
- Mutation checks use `supabase db reset` locally, which wipes local dev data.
- No roadmap item carries this change ID, so the roadmap is untouched.

## Success Criteria (Summary)

- `npm test` proves the #2 and #3 rules on the local stack and fails loudly without it.
- Weakening a policy turns the matching test red.
- CI blocks a PR whose tests or SQL scenarios fail.
