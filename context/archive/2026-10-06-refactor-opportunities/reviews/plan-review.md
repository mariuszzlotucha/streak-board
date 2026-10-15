<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Refactor opportunities: guards, safety net and explicit grants

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Mode**: Deep
- **Date**: 2026-10-13
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 5 observations
- **Triage**: all 8 findings fixed in the plan and the brief (2026-10-13); verdict after fixes: SOUND
- **Scope**: the plan as it stands on `master` at `caa5cc5`, after PR #97 (2026-10-08) moved Phase 1 to the unit tests of `loadDashboard` and S-11 (`dashboard-ui`) shipped and left handoff notes in it. The previous review (2026-10-06, SOUND after triage) is in git history at `967ca02`.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 18/18 paths ✓, 16/16 symbols ✓, 9 line anchors moved (F8), brief↔plan ✗ (F6), Progress↔Phase ✓ (41 criteria, 41 rows, identical titles, no checkbox outside `## Progress`). `docs/reference/contract-surfaces.md` does not exist, so that check was skipped.

Deep mode was run inline, without a sub-agent, as in the 2026-10-06 review. Claims that held:

- The five `console.error` calls are still at `src/lib/dashboard-data.ts:87,96,101,120,145`, `DashboardInput` at `:21-28`, the loader has 14 unit tests with the `console.error` spy at `tests/unit/dashboard-data.test.ts:45`, and `no-console` is `"warn"` at `eslint.config.js:25`. S-11 did not edit the loader or its tests.
- `requestFields(Astro)` compiles: `src/pages/settings.astro:10-13` already passes it to `loadSettings`.
- No `console.*` call outside the helper and the spies in `tests/`, the configs or `src` besides the five, and `scripts/**/*.mjs` keep `no-console: off` (`eslint.config.js:126`), so the Phase 1 lint switch breaks nothing else.
- `integration` has no `fetch-depth` yet (only `changes` has it), its stack start excludes `postgres-meta` (`ci.yml:108`), and the Supabase CLI is `2.117.0` both in the lockfile and in the `setup-cli` pins.
- The `types:check` pipeline (`supabase gen types typescript --local | prettier --stdin-filepath src/types.ts | diff -u src/types.ts -`) gives a 0-line diff at HEAD (run 2026-10-13 against the local stack).
- Still 7 migrations, the newest `20261002090000_create_task_checkoffs.sql`, and 13 data routes. The routes, mappers, normalisers, test helpers, `rls-scenarios.sql` (293 assertions), `lessons.md` and `test-plan.md` have not changed since the plan's baseline `c9f6451`, so Phases 3 to 5 and their anchors into those files stand.

Claims that no longer hold: the failed-load response in Phase 1 (F1), the absence of a roadmap row (F2), the release record's number (F5), the brief's Phase 1 (F6) and nine anchors (F8).

## Findings

### F1 — Phase 1 still expects 200 with the banner on a failed load

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Overview, criterion and Progress row 1.6; What We're NOT Doing (the G5 bullet); Testing Strategy (manual step 1)
- **Detail**: Since S-11, `src/pages/dashboard.astro:29-30` answers 503 with the dashboard error page when `loadFailed` (partial failures stay 200; `README.md:196`). Stopping PostgREST fails `getMyGroup`, so row 1.6 now gets 503, but its Progress title, the line that gets ticked, still says "status 200 with the "Something went wrong" banner as before". S-11 added only a sub-bullet under the criterion (`plan.md:111`) and kept the title. The Overview still says "200 with the same banners", What We're NOT Doing still files the 503 as future S-11 work, and manual step 1 of the Testing Strategy still reads "the banner". A row ticked against text the run contradicts is the drift google-login's review flagged on its row 1.4. The S-11 phase 2 review also found that the first request after the stop waits about 60 s at the local gateway (`context/archive/2026-10-09-dashboard-ui/reviews/impl-review-phase-2.md:198`); row 1.6 does not say so.
- **Fix**: Criterion and row 1.6 say "status 503 with the dashboard error page", with a client timeout above 60 s and the container started again even when the check fails; drop the sub-bullet; the Overview says the response stays as S-11 left it; the G5 bullet says it was done in S-11; manual step 1 says "the 503 error page".
- **Decision**: FIXED (Fix in plan: criterion and row 1.6 expect 503 with the error page, a client timeout above 60 s and a restart even on failure; the sub-bullet is gone; the Overview, the G5 bullet and Testing Strategy step 1 follow)

### F2 — Branch names and roadmap edits predate S-12's roadmap row

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach (branch rule); What We're NOT Doing (the OPP-9 bullet, the `CLAUDE.md` / `roadmap.md` bullet); brief (Out of scope)
- **Detail**: The plan runs each phase on `refactor-opportunities/phase-<N>` "(no roadmap id)" and says "No roadmap edit: this change has no roadmap row". Since 2026-10-08 the change is roadmap slice S-12 (`roadmap.md:58`, section `:182-191`, milestone MS-07). `lessons.md:16` names phase branches `<roadmap-id>/<change-id>/phase-<N>` from the At a glance table, so `s-12/refactor-opportunities/phase-<N>`, and the S-12 Status cell (now `planning`) is this change's own row, which the workflow moves to `done`. Followed as written, the branches break the naming rule and S-12 stays `planning` after the archive.
- **Fix**: Branches `s-12/refactor-opportunities/phase-<N>`; replace "No roadmap edit: this change has no roadmap row" with "in `roadmap.md` this change edits only its own row and section (S-12)"; the NOT-doing bullet and the brief exclude `roadmap.md` beyond that row.
- **Decision**: FIXED (Fix in plan: branches `s-12/refactor-opportunities/phase-<N>`; `roadmap.md` edits limited to S-12's own row and section in the plan and the brief)

### F3 — No tick rule for the CI-on-PR rows 2.10 and 5.8

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — row 2.10 and the Implementation Note; Phase 5 — row 5.8 and the Implementation Note
- **Detail**: Rows 2.10 and 5.8 need the PR's own checks, which exist only after the push, and the push comes after the phase commit and its impl review (`lessons.md:105-110`). The plan says when rows 1.7 and 5.9 to 5.11 are ticked (after the release, in a closing docs PR or the next phase's PR), but not 2.10 or 5.8. In S-11 the same kind of row (1.12) was ticked on the already-merged phase branch and never reached `master` (`0b45e34`); that review proposed a lesson and the owner cancelled it (`context/archive/2026-10-09-dashboard-ui/reviews/impl-review-phase-3.md`, F6), so nothing outside this plan carries the rule.
- **Fix**: Phase 2's note: row 2.10 is ticked with the PR head SHA on the Phase 3 branch or in a closing docs PR, never on the merged Phase 2 branch; Phase 5's note: row 5.8 joins rows 5.9 to 5.11 in the closing docs PR.
- **Decision**: FIXED (Fix in plan: Phase 2's note times row 2.10, Phase 5's note moves row 5.8 into the closing docs PR, and Phase 1's note points at rows 5.8 to 5.11)

### F4 — Phase 1's tests take a different route than the sibling `loadSettings`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — change 1 (Contract)
- **Detail**: S-11 built the same mechanism for `/settings` after this plan was written: `SettingsInput.log: ReportContext` with a JSDoc that rules out e-mail, cookie and invite code (`src/lib/settings-data.ts:11-12`), `reportError("settings.load.failed", cause, log)` (`:32`), and the page passes `log: requestFields(Astro)` (`src/pages/settings.astro:10-13`), so `astro check` already accepts it and the plan's fallback (`{ request, routePattern, locals }`) is moot. Its test spies on `console.error` and asserts the printed report through the real helper (`tests/unit/settings-data.test.ts:55-70`: `level`, `event`, `route`, `userId`, `ray`, `error`), while Phase 1 prescribes mocking `@/lib/log`, so two sibling loaders would test the same thing two ways. The dashboard test already has the `console.error` spy (`tests/unit/dashboard-data.test.ts:45`).
- **Fix**: Name `loadSettings` and its test as the pattern: copy the JSDoc for `log`, assert each event through the existing `console.error` spy with `toMatchObject`, and drop the `astro check` fallback.
- **Decision**: FIXED (Fix in plan: Phase 1's contract names `loadSettings` as the pattern, drops the `astro check` fallback, and the tests assert the printed reports through the existing `console.error` spy)

### F5 — The release record has a taken number and covers only Phase 5

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — change 3 (Docs), criterion and row 5.11
- **Detail**: Change 3 and row 5.11 still say "Phase 14", which S-11 took (`context/changes/deployment/deployment-plan.md:244`); only a sub-bullet says 15, and it keeps the old title on purpose. No row is ticked yet, so the title can change now. The entry also covers only Phase 5, while Phase 1's release changes the deployed Worker too; S-11's entry records every PR's release (CI run, Worker version, rollback target), and its review flagged an unrecorded release run (`impl-review-phase-3.md`, F4).
- **Fix**: "The next free Phase number (15 at this review)" in change 3, the criterion and row 5.11, and drop the sub-bullet; the entry lists every S-12 release run in the format of Phase 14 (Phase 1 with its Worker version and production check, Phases 2 to 4 approved or superseded, Phase 5 with the migration, the hosted query and the live check).
- **Decision**: FIXED (Fix in plan: change 3, the criterion and row 5.11 name the next free Phase number (15 at this review) and one entry listing every S-12 release run; the sub-bullet is gone)

### F6 — The brief still describes the old Phase 1

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan-brief.md` (Key Decisions "Safety order", Architecture / Approach, Phases at a Glance row 1, Open Risks); plan Implementation Approach
- **Detail**: PR #97 (2026-10-08) moved Phase 1 from a recorded page baseline to the 14 unit tests of `loadDashboard`, but the brief still says "Page baseline before the Phase 1 edit", "its status code and HTML in five states are recorded before the Phase 1 edit", gives the Phase 1 key risk as "No automated test for an `.astro` page", and lists the risk of a per-run HTML mask. In the plan, "Two rules apply where a phase needs them" now lists one rule.
- **Fix**: Align the four brief entries with the unit-test approach, and change "Two rules apply" to "One rule applies" in the plan.
- **Decision**: FIXED (Fix in plan: the brief's Safety order, Architecture, Phase 1 key risk and Open Risks follow the unit-test approach; the plan says "One rule applies")

### F7 — `CLAUDE.md`'s types command fails the new types check

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — changes 3 and 5, criterion and row 2.9; What We're NOT Doing (`CLAUDE.md`)
- **Detail**: `CLAUDE.md:27` tells agents that `src/types.ts` is generated "with `npx supabase gen types typescript --local`". Run on 2026-10-13 against the local stack, that output differs from the committed file in 397 lines (formatting only), while the plan's pipeline through prettier gives a 0-line diff, so an agent that regenerates by `CLAUDE.md` alone fails the required `integration` job. It is mitigated: most earlier plans spell out the prettier step, and the CI step prints the right command, so the cost is a red run, not a stuck PR. The NOT-doing reason ("it defers CI jobs and scripts to the README") does not cover this line, which is the generation instruction itself.
- **Fix**: In Phase 2's docs commit make `CLAUDE.md:27` say `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`, add it to criterion and row 2.9, and narrow the NOT-doing bullet to "no other `CLAUDE.md` edit".
- **Decision**: FIXED (Fix in plan: Phase 2's docs change adds the full generation command to `CLAUDE.md:27`, criterion and row 2.9 include it, and the NOT-doing bullet and the brief allow only that `CLAUDE.md` edit)

### F8 — Line anchors moved

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries, Implementation Approach, Critical Implementation Details, Phases 1, 2 and 5, References
- **Detail**: `src/pages/dashboard.astro:33-38` → `22-27`; `.github/workflows/ci.yml:91` → `95`, `:104` → `108`, `:112-118` → `116-120`, and in References `17-40,89-110,141-209` → `17-37` (changes), `93-115` (integration), `116-237` (release); `eslint.config.js:76-81` → `123-126`; `README.md:192` → `198-200`, `:211` → `219`, `:233` → `244`; `roadmap.md:148-160` and `:148-173` → `154-166`. The anchors into `lessons.md`, `test-plan.md`, the routes, the test helpers and `rls-scenarios.sql` still hold (none of those files changed).
- **Fix**: Refresh the listed anchors.
- **Decision**: FIXED (Fix in plan: the eleven anchors are refreshed)
