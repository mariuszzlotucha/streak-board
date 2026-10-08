# Refactor opportunities: guards, safety net and explicit grants — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

The research ranked ten refactor opportunities from the debt recorded in `context/archive/2026-10-05-data-access/research.md` and left the choice to planning. This plan chooses the five that change nothing a user or an HTTP client can observe and that do not depend on each other, and implements them as five reversible phases. The aim is to close known silent gaps (dashboard failures, hosted-versus-repo drift, untested routes, duplicated rules, implicit grants) cheaply, and to leave the expensive structural steps for when a trigger fires.

## Starting Point

The baseline at `c9f6451` is green (lint, type check, 385 Vitest tests, 293 SQL assertions). The dashboard still logs failures with five bare `console.error` calls, merged-migration immutability and migration compatibility are prose rules, `src/types.ts` has no freshness check, 11 of 13 data routes and all error mappers are untested, and `SELECT`/`DELETE` for `authenticated` on three tables come from platform defaults.

## Desired End State

Lint fails on a new `console` call, and the required `integration` job fails on an edited merged migration, an unmarked destructive migration, a new migration older than the newest merged one or stale generated types. Mappers, normalisers and all 13 routes are pinned by tests (a new route without rows turns CI red), the SQL-versus-TS rules are pinned by contract tests, and the table privileges live in a migration and are pinned by an RLS scenario.

## Key Decisions Made

| Decision                | Choice                                                                                                         | Why (1 sentence)                                                                                                                                                      | Source              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Scope                   | OPP-2, OPP-3, OPP-1, OPP-5, OPP-4                                                                              | Behaviour-neutral, pairwise independent and each reverts alone.                                                                                                       | Plan (owner)        |
| Deferred                | Route skeleton, zero-row trace, one client per request, fail-closed `/api/*`                                   | Larger cost or a behaviour change, and the one-client trigger is unconfirmed; each gets a revisit trigger.                                                            | Research + Plan     |
| Release-order gate, e2e | Left to S-10                                                                                                   | Already scheduled there; a parallel change would duplicate it.                                                                                                        | Research            |
| Phase order             | OPP-2, CI guards, tests, grants                                                                                | Ordered by self-containment and value, not by cost: the guards cut production risk and check later PRs, and the grants need the owner and a release, so they go last. | Plan                |
| Safety order            | Page baseline before the Phase 1 edit; enforcement (the lint rule, the CI steps) switched on in its own commit | The dashboard has no automated test, and a separate switch makes the first red CI run a real finding that one revert turns off.                                       | Plan                |
| Guard placement         | Steps inside `integration`, not `changes`                                                                      | Only `integration` is required and the ruleset has no bypass, so a `changes` guard would be advisory.                                                                 | Research (verified) |
| OPP-3 scope             | Immutability, types freshness, the `-- compat:` marker and an ordering rule                                    | The owner chose the first three, the marker is a heuristic that S-10 may replace, and the ordering rule came from plan review.                                        | Plan (owner)        |
| Immutability exception  | Comment-only edits pass; an allowlist entry is single-use, hash-bound, append-only and always warned           | A real fix stays possible without turning the allowlist into a habit; delete and rename are never allowed.                                                            | Plan (owner)        |
| OPP-1 style             | One table-driven suite, a shared fake client, a coverage guard test                                            | A route without rows fails CI and the boilerplate exists once.                                                                                                        | Plan (owner)        |
| Anonymous assertions    | Exactly `42501`                                                                                                | The anonymous role always gets 401 with `42501` (probed), so the looser branch was never taken.                                                                       | Plan                |
| OPP-5                   | Contract tests against the real database; NUL drift pinned, not fixed                                          | TS and DB agree on 15 boundary cases; the one drift is a behaviour change for a separate change.                                                                      | Plan                |
| OPP-4                   | Migration, RLS scenario and the owner's hosted query, shipped with a release                                   | Grants become reproducible and pinned; production is probably a no-op.                                                                                                | Plan (owner)        |
| Phases                  | Seven proposed, five kept                                                                                      | The owner asked for coarser units; steps stay separate commits inside a phase.                                                                                        | Plan (owner)        |

## Scope

**In scope:** dashboard reporting and the `no-console` error; migration guard, marker and types check in CI; characterization tests for mappers, normalisers, `join-code`, `checkoffResponse` and the 13 routes; contract tests for the duplicated rules; explicit grants with a scenario and a production release.

**Out of scope:** the route skeleton, the zero-row trace, one client per request, the fail-closed `/api/*` gate, the release-order gate and Playwright in CI (S-10), a 503 for dashboard failures (S-11), fixing the NUL drift, any edit to `CLAUDE.md` or `roadmap.md`.

## Architecture / Approach

Five phases independent in code (the two Phase 5 rows that use the Phase 2 scripts wait for Phase 2), each on its own branch and PR, each reverted by reverting its merge, with one commit per logical step inside. Phases 3 and 4 touch only `tests/`, and a criterion checks that `src/` is unchanged; the quiet zero-row branches are pinned as they are today. The guard script is plain Node with pure functions, unit tests and one end-to-end test against a throwaway git repository; it runs as a step of the required `integration` job. Where a phase adds enforcement that is not itself a test, it is switched on in its own commit after what it checks passes (the lint rule in Phase 1, the two CI steps in Phase 2). The dashboard has no automated test, so its status code and HTML in five states are recorded before the Phase 1 edit and compared after it.

## Phases at a Glance

| Phase                           | What it delivers                                                                         | Key risk                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Dashboard through the helper | Five `dashboard.*` events, `no-console` as an error, HTTP unchanged                      | No automated test for an `.astro` page; a recorded baseline and manual fault injection instead |
| 2. CI guards                    | Migration immutability, marker and ordering script, types check, README and `lessons.md` | A merge-blocking script with no bypass; pg-meta image in CI is unverified                      |
| 3. Characterization net         | Unit tests, exact anonymous assertions, fake client, 13-route suite with coverage guard  | Table rows with a scripted queue are harder to read than prose tests                           |
| 4. Rule contract tests          | SQL-versus-TS contract tests replace the regex on a migration file                       | Needs the local stack; a SQL-side mutation check ends in `db reset`                            |
| 5. Explicit grants              | Grant migration, privilege scenario, hosted check, production release                    | The hosted privileges are unknown until the owner runs the query                               |

**Prerequisites:** the plan PR merged; the local Supabase stack up for Phases 1 to 5 (one session at a time); `gh` authenticated; the owner for the hosted query and for approving the `release` run (needed after Phases 1 and 5; after Phases 2 to 4 it only redeploys the same Worker).
**Estimated effort:** about 4 to 6 evenings across 5 phases [I]: Phase 1 about 2 h, Phase 2 3 to 5 h, Phase 3 about 1.5 evenings, Phase 4 2 to 3 h, Phase 5 1 to 2 h plus the release.

## Open Risks & Assumptions

- `types:check` in CI relies on `gen types --local` pulling the pg-meta image itself, because the stack start excludes that service; the fallback is dropping it from the exclusion list of the `integration` job.
- The marker is a heuristic: a false positive costs one comment line, but `add constraint`, `set not null` and type changes are not flagged.
- If the hosted privileges differ from the local ones, Phase 5 stops for a re-plan and moves to the front; its two rows that use the Phase 2 scripts then wait until Phase 2 lands.
- S-10 overlaps Phases 3 and 4; if S-10 is planned first, drop those phases here instead of doing them twice.
- The ordering rule sees the base when `integration` runs, and the ruleset does not require up-to-date branches, so a migration merged after another PR's last run is not re-checked; the README carries the update-the-branch advice and the owner's `supabase db push --include-all` recovery [I].
- The Phase 1 baseline compares dev-server HTML; if it carries per-run noise, the diff needs a mask that is named in the PR [I].
- Smoke and Playwright were not run at baseline; CI runs smoke on every PR.

## Success Criteria (Summary)

- Each phase PR is green in CI and `npm run lint`, `npx astro check`, `npm test` and `npm run test:rls` pass after each merge.
- A deliberate edit of a merged migration, an unmarked destructive migration, an out-of-order new migration and a stale `src/types.ts` each fail the `integration` job.
- Production behaviour is unchanged after Phase 5, and the owner's hosted privilege query matches the scenario table.
