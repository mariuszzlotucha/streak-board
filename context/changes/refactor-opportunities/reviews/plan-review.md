<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Refactor opportunities: guards, safety net and explicit grants

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 4 observations
- **Triage**: all 8 findings fixed in the plan and the brief (F5 via Fix A); verdict after fixes: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 97/97 checks ✓ (17 modified paths, 6 parent dirs, 11 new paths free of collisions, 49 line anchors, 14 symbols), brief↔plan ✓.

Deep mode was run inline, without a sub-agent (the session policy allows spawning one only on an explicit request). Claims that held: `no-console: error` breaks nothing (forced from the CLI the only hits are 13 in `scripts/smoke.mjs`, which the config exempts; with the real config there are 0 problems); `gen types --local` starts its own container from `postgres-meta:v0.99.0`, so the service excluded in CI is not needed; the guards belong in the required `integration` job; the anonymous role gets 401 with `42501`; the TS normaliser and the database CHECK agree on 15 boundary cases. Claims that failed: wall-clock use in the check-off routes (F1) and the cleanup mechanics of Phase 4 (F4).

## Findings

### F1 — Check-off route rows depend on the wall clock

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — change 4 (route suite) and its Success Criteria
- **Detail**: `src/pages/api/tasks/checkoff.ts:37` and `uncheck.ts:39` call `new Date()`. The resulting `period` (the Warsaw day or the Monday key, `src/lib/streak-rules.ts:42-53`) lands in the JSON body `{ ok: true, period }` (`src/lib/checkoff-response.ts:29`) and in the insert and filter arguments of the call chain the plan wants pinned. The plan never fixes the clock, so a row either hard-codes a date and fails the next day, or leaves `period` unasserted; around Warsaw midnight it is flaky either way. Only `tests/unit/checkoff-client.test.ts` pins a clock today, and `vitest.config.ts:12` sets `TZ=America/Los_Angeles` on purpose.
- **Fix**: Pin the instant for every row (`vi.useFakeTimers({ toFake: ["Date"] })` plus `vi.setSystemTime(...)`, restored in `afterEach`) at a moment whose Warsaw day differs from its Los Angeles day, and put the expected `period` (the day, and the Monday key for weekly) into the `checkoff` and `uncheck` rows.
- **Decision**: FIXED (Fix in plan: Phase 3 contract pins the clock and the check-off rows carry the expected `period`)

### F2 — "Independent phases" contradicts Phase 5's own criteria

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Overview, Implementation Approach, brief; Phase 5 rows 5.3 and 5.4
- **Detail**: The plan and the brief call the phases independent, and the brief says that if the hosted privileges differ Phase 5 "moves to the front". But rows 5.3 and 5.4 run `npm run types:check` and `npm run guard:migrations`, which exist only after Phase 2. Run first, those rows cannot pass and Phase 5 cannot close.
- **Fix**: Say "independent in code, ordered by their criteria", and mark 5.3 and 5.4 "requires Phase 2; if Phase 5 runs first, run `npm run lint` and tick these two when Phase 2 lands" (same note in the brief).
- **Decision**: FIXED (Fix in plan: independence reworded, rows 5.3 and 5.4 conditional on Phase 2, brief updated)

### F3 — Release handling is described only for Phase 5

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Implementation Approach; Phase 1 Success Criteria
- **Detail**: Every push to `master` runs all CI jobs (`changes` answers `code=true` for non-PR events, `.github/workflows/ci.yml:30-36`) and queues a `release` run that waits for approval in the `production` environment (`ci.yml:112-118`, `README.md:206-211`). Phase 1 changes deployed code (`src/pages/dashboard.astro`) yet its criteria stop at local checks, and Phases 2 to 4 redeploy the same Worker. The owner meets five approval prompts with guidance for only one (a newer push supersedes a waiting older run, `README.md:211`).
- **Fix**: Add one sentence to Implementation Approach (every merge queues a `release`; approve it for Phases 1 and 5, and for Phases 2 to 4 approve it or let a newer push supersede it) and one Manual row to Phase 1: after the merge and the approval, `/dashboard` loads on the production URL for a signed-in user as before.
- **Decision**: FIXED (Fix in plan: release sentence in Implementation Approach, new Phase 1 row 1.9, brief prerequisites)

### F4 — Phase 4 cleanup mechanics break `afterAll` and skip the helper pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — change 1, "Mechanics"
- **Detail**: The plan has the accepted cases use "a fresh owner or an admin delete of the group before the next case". A raw insert leaves an untracked group; `afterAll(cleanupUsers)` then fails on `owner_id … on delete restrict` (`supabase/migrations/20260925003350_create_groups_and_group_members.sql:15`, `tests/helpers/supabase.ts:154-162`), and "before the next case" does not cover the last case. The repo pattern avoids it: users per file (`beforeAll`), groups per test, `afterEach` cleanup (`context/foundation/test-plan.md:178`, `tests/integration/group-permissions.test.ts:28-35`).
- **Fix**: Accepted cases go through `createGroupAs` and `createTaskAs` (they track ids and `afterEach` frees the owner) with one user per file; only rejected cases use a raw insert, because nothing is created.
- **Decision**: FIXED (Fix in plan: Phase 4 mechanics use `createGroupAs` and `createTaskAs`, one user per file)

### F5 — Out-of-order migrations: not guarded, and recovery is blocked

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — guard rules; What We're NOT Doing
- **Detail**: Research Open Question 8 (a migration older than the newest on the remote, relevant because `CLAUDE.md` sets up parallel worktrees) is untested and the plan neither covers nor lists it. `supabase db push --include-all` exists for "migrations not found on remote history table" (`npx supabase db push --help`), which suggests the default refuses such a file [I], and `release` then fails after the build. Once merged, the clean recovery is a rename or delete, which the guard forbids and the allowlist cannot authorise (the rationale "history records the version" does not hold for a never-applied file): the fix would need an edit of the guard itself.
- **Fix A ⭐ Recommended**: Add one exact rule to the guard: an added migration must sort after every migration at the base ref ("rename it to a newer timestamp"), with one unit test and one README sentence.
  - Strength: About 10 lines, no heuristic; it stops the case before merge, when a rename is free because the file is new in the PR.
  - Tradeoff: Grows the guard by a rule the owner did not ask for.
  - Confidence: MED — the refusal is inferred from the flag, not observed.
  - Blind spot: `db push` behaviour on an out-of-order file stays untested.
- **Fix B**: Record it under "What We're NOT Doing" with a trigger (two migration-adding branches overlap) and a documented recovery (`supabase db push --include-all` by the owner, or a guard edit).
  - Strength: No scope growth.
  - Tradeoff: The failure is caught by `release` after the merge, the worst moment.
  - Confidence: MED — same inference.
  - Blind spot: Same.
- **Decision**: FIXED (Fix A: ordering rule added to the Phase 2 guard, its tests, docs, Key Discoveries and the brief)

### F6 — Guard script typing and end-to-end test mechanics

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — changes 1 and 2
- **Detail**: `allowJs` is on (`node_modules/astro/tsconfigs/base.json:27`), so a `.ts` test can import the `.mjs` script, but the test is linted with `strictTypeChecked` while `scripts/**/*.mjs` have type checking disabled (`eslint.config.js:76-81`); untyped exports trip the `no-unsafe-*` rules. No test imports from `scripts/` today. The end-to-end test commits in a throwaway repository, and a CI runner has no git identity [I], so that `git commit` fails unless the test sets one.
- **Fix**: Type the exports with JSDoc, and set a git identity (`-c user.name`, `-c user.email` or `GIT_AUTHOR_*` and `GIT_COMMITTER_*`) inside the temporary repository.
- **Decision**: FIXED (Fix in plan: JSDoc typing and a git identity added to the Phase 2 contracts)

### F7 — Dashboard event suffixes vs the README definition

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — changes 1 and 3
- **Detail**: `README.md:287` defines `.failed` as a returned Supabase error and `.exception` as a thrown one. The dashboard sees only rejections, because the data helpers rethrow returned errors (`src/lib/groups.ts:22`, `src/lib/tasks.ts:20`). The plan names all five events `.failed`, the compute throw included, while saying it follows the convention; the README sentence it adds can settle it.
- **Fix**: Keep the five names; make the added README sentence say that dashboard events are all `.failed` because the data helpers rethrow returned errors.
- **Decision**: FIXED (Fix in plan: the README sentence is specified in Phase 1)

### F8 — Two "Automated" rows need an open PR; two diff rows use a moving base

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Rows 2.6 and 5.5; rows 3.3 and 4.4
- **Detail**: Per `context/foundation/lessons.md:105-110` the PR is opened only after the phase commit, the SHA write-back and the impl review, so `gh pr checks` (rows 2.6 and 5.5) cannot run when the phase closes, and `/10x-goal-implement` ticks only `#### Automated` rows. None of the S-06, S-07 and S-08 plans has such a row. Rows 3.3 and 4.4 (`git diff --stat origin/master -- src`) compare with a moving `origin/master` and give a false alarm if master gains a `src` change.
- **Fix**: Move 2.6 and 5.5 to Manual ("after the PR is open: all checks pass") and use `git diff --stat origin/master...HEAD -- src` in rows 3.3 and 4.4.
- **Decision**: FIXED (Fix in plan: the PR-check rows moved to Manual as 2.10 and 5.8; rows 3.3 and 4.4 use `origin/master...HEAD`)
