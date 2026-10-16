<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Test coverage (S-10): risk-chosen tests, mutation-measured unit quality, e2e of the key flows

- **Plan**: context/changes/test-coverage/plan.md
- **Mode**: Deep
- **Date**: 2026-10-15
- **Verdict**: REVISE → SOUND after triage (all six findings fixed in the plan on 2026-10-15)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict                            |
| --------------------- | ---------------------------------- |
| End-State Alignment   | WARNING (1 finding)                |
| Lean Execution        | PASS (1 observation)               |
| Architectural Fitness | WARNING (1 finding, 1 observation) |
| Blind Spots           | PASS                               |
| Plan Completeness     | WARNING (1 finding, 1 observation) |

## Grounding

52/52 paths ✓, 34/34 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (6 phases, 43 rows, no checkboxes outside Progress). Stack-free unit probe ✓: a scratch config with the plan's unit-project settings and no `globalSetup` runs all 16 files under `tests/unit/` (281 tests) green, and `vitest related` on a file with no unit test exits 0.

Verified and not findings: both Stryker join sites use a space (`test-helpers.js:11`, `stryker-setup.js:66`), Vitest 5 matches `fullTestName` (built with `" > "`) against an unanchored regex (`task-utils.js:43-53,224`), and the registry has no runner newer than 10.0.0 (2026-08-14), so the patch route is the live one. The invite flow is feasible: `/auth/signin` never redirects a signed-in visitor, the `join_code` cookie is path `/`, httpOnly, one hour, and the signup and signin routes do not touch it. The settings card branches, the `task_participants_insert_self` policy (no auto-join trigger), the 302 redirects, the smoke GET steps (404) and the foreign-Origin inventory (11 of 17 routes; the six missing are exactly the listed ones) match the plan. The local GoTrue is not given `GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS` (the integration suite already does 34 password sign-ins in 6 s), so the e2e suite's auth volume is not a flake risk. The ruleset requires `integration` and `ai-review` only; the deployed commit is `30c01bb` (release success 2026-10-12 21:22 UTC, every later run cancelled or waiting); the latest deployment-plan phase is 14.

## Findings

### F1 — `smoke` and `ci` are not required checks, but the plan records the extended smoke as `required (wired)`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 4 §4 (test-plan §5 row), Phase 6 criterion 6.7
- **Detail**: Ruleset 24254172 (read 2026-10-15) requires `integration` and `ai-review` only, with no bypass actors. `smoke` and `ci` (lint, token contrast, `astro check`, build) are advisory: a red smoke does not block a merge. Today's §5 already says "required (wired)" for lint+build and smoke; Phase 4 writes the same for the extended smoke that is the gate for risk #6, and Phase 6's 6.7 adds only `e2e` and `compat`. The end state "§5 matches CI" and "a broken boundary fails before merge" is not reached for the smoke layer.
- **Fix A ⭐ Recommended**: In 6.7 the owner adds `ci` and `smoke` together with `e2e` and `compat` (one ruleset edit), and §5 keeps "required (wired)".
  - Strength: the risk #6 gate becomes real; both jobs already skip-pass on docs-only PRs through the `changes` `if:`, as the lesson requires.
  - Tradeoff: a flaky smoke or lint run blocks a merge until re-run.
  - Confidence: HIGH — the ruleset was read today and both jobs run on every code PR.
  - Blind spot: none significant.
- **Fix B**: Keep the ruleset step as planned and write `wired (advisory)` in §5 for lint+build, smoke and the extended smoke (and `advisory` for e2e until 6.7), so §5 tells the truth.
  - Strength: no new merge blockers.
  - Tradeoff: test-plan phase 3 closes without an enforced gate for risk #6.
  - Confidence: HIGH — wording only.
  - Blind spot: the owner may want smoke required anyway.
- **Decision**: FIXED via Fix A (Current State ruleset bullet, Desired End State, What We're NOT Doing, Phase 4 §3 row note, Phase 6 §5 and criterion 6.7, brief risk bullet)

### F2 — Stryker `ignorePatterns` drops `packages/`, which two unit tests import, and keeps the 692 MB `.wrangler/` copy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 (Stryker fix and configuration)
- **Detail**: `tests/unit/code-reviewer-agent.test.ts:7,13` and `tests/unit/code-reviewer-tools.test.ts:12-14` import `../../packages/code-reviewer/{agent,tools,prompts/reviewer,config}`. In a sandbox without `packages/` those files cannot load, so any run that selects them (the dry run of a full `npm run test:mutation`, or a related run of a module the package imports) ends in an initial-test-run failure. The size argument is also wrong: of today's 703 MB sandbox (`sandbox-Jgjln0`, `sandbox-m1NSnI`; the `sandbox-p7RlAK` and `sandbox-Aeutw1` the plan names no longer exist), `.wrangler/` is 692 MB, `.claude/` 1.9 MB, `context/` 1.6 MB and `packages/` 140 KB.
- **Fix**: `ignorePatterns: [".claude/**", ".wrangler/**", "dist/**", ".astro/**", "context/**", "docs/**", "playwright-report/**", "test-results/**"]`; keep `packages/` in the copy and drop the 1.4 GB sentence.
- **Decision**: FIXED (Phase 1 §4 ignore list and the Implementation Note's sandbox sizes)

### F3 — The mutation baseline lives in a change folder that `/10x-archive` moves

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 5 §2 and §4, Phase 6 §5, Desired End State
- **Detail**: `context/changes/test-coverage/mutation-baseline.md` is linked from README Tests and test-plan §6.1 and is the comparison point of the re-run rule ("compare with the baseline, treat a lower score as a finding"). Archiving S-10 moves the folder to `context/archive/<date>-test-coverage/`: the links break and the next re-measure has no stable place to write (skills may not write under `context/archive/`).
- **Fix**: Put the baseline at `context/foundation/mutation-baseline.md`, next to the test plan that cites it, and point Phase 5 §2/§4, Phase 6 §5, the Desired End State and the README at that path.
- **Decision**: FIXED (path replaced throughout the plan)

### F4 — The invite-cookie integration cases pin nothing the existing tests do not already pin

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 4 §3
- **Detail**: `tests/integration/auth-callback.test.ts:19` builds the context with `cookies: {}`. Any `cookies.get`, `set` or `delete` call in the route throws a `TypeError`, is caught by the route's `try` and turns the success case ("redirects to the dashboard after a successful code exchange") red, so the route's hands-off behaviour is already pinned. The spies would re-assert the same fact, and "`get("join_code")` was not needed" is not something the route can fail.
- **Fix**: Drop §3 and state the fact in the test-plan §6.1 line (or as one comment in the test file); keep the mapper tables.
- **Decision**: FIXED (Phase 4 §3 removed, §4 renumbered to §3, Overview, criterion 4.2, Desired End State, Current State, Testing Strategy and the brief updated)

### F5 — Small anchors an implementer would otherwise chase

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 and §5
- **Detail**: (a) `end-of-turn.sh:30`: adding the two config files there is a no-op, because the `*.ts` arm at line 29 already matches them (and lints them). (b) The Commands line is `CLAUDE.md:46`, not `:63`; `CLAUDE.md:48` ("`npm test` … needs `supabase start`") and README:59 (Available Scripts) also describe `npm test` and need the `test:unit` note, which the Phase 1 docs contract does not list.
- **Fix**: Delete the `CODE=1` sentence; list `CLAUDE.md:46,48` and README Available Scripts in Phase 1 §5.
- **Decision**: FIXED (Phase 1 §3 and §5)

### F6 — `compat` can check out the tag with `actions/checkout` instead of a full-history clone and a worktree

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 6 §4
- **Detail**: `fetch-depth: 0` plus `git worktree add ../deployed production` clones the whole history on every migration PR and puts the second checkout outside the workspace. A `git ls-remote --exit-code --tags origin production` step (printing the "no production tag" message) followed by `actions/checkout@v4` with `ref: refs/tags/production` and `path: deployed` gives the same tree inside the workspace with the action's own caching and credentials.
- **Fix**: Replace the two steps in the §4 contract; everything after (`npm ci`, `.env`/`.dev.vars`, build, preview, smoke from `deployed/`) stays.
- **Decision**: FIXED (Phase 6 §4 contract)
