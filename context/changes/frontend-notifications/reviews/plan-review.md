<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Frontend toast notifications

- **Plan**: context/changes/frontend-notifications/plan.md
- **Mode**: Deep
- **Date**: 2026-10-17
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

8/8 paths ✓, 4/4 symbols ✓, brief↔plan ⚠ (F5). Codebase verification done inline, without a subagent.

## Findings

### F1 — Smoke's exact success redirects break in Phase 1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — §4 Routes, Success Criteria 1.5
- **Detail**: `scripts/smoke.mjs` holds 59 `locationExact: "/dashboard"`/`"/settings"` asserts; the action steps among them fail once success redirects carry `?notice=`. The plan added only one new smoke step.
- **Fix**: Phase 1 §4a: each in-scope success step's `locationExact` becomes the exact notice path, asserting its code.
- **Decision**: FIXED

### F2 — Toast position is not pinned for alertBeforeHeading

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — §1, §2
- **Detail**: `alertBeforeHeading` (`scripts/smoke.mjs:509`, used at 1636 and 2674) requires the alert description inside `<main>` before the group `<h1>`.
- **Fix**: Render the Toast where the inline alert is today (top of `<main>`, fixed by CSS), so the regex holds unchanged.
- **Decision**: FIXED

### F3 — "Screenshot baselines" don't exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — §2; brief Open Risks
- **Detail**: `scripts/ui-screenshots.mjs:5`: "No baselines and no comparison"; PNGs are reviewed by a person.
- **Fix**: Name the capture command into the change folder and the owner's review; align the brief and row 2.7.
- **Decision**: FIXED

### F4 — The Toast script needs no hand-kept CSP hash

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 §2, Critical Implementation Details
- **Detail**: Astro bundles and hashes plain `<script>` elements (`src/layouts/Layout.astro:59`); only `is:inline` needs a hash in `astro.config.mjs`.
- **Fix**: The Toast uses a plain `<script>`; only `ClearErrorParam`'s hash changes.
- **Decision**: FIXED

### F5 — "Action errors only" vs "any data.error"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Plan Desired End State vs brief Key Decisions
- **Detail**: `data.error` also carries invite-cookie errors (`dashboard-data.ts:149-154`) and the failed task load (`dashboard-data.ts:169`).
- **Fix**: State that every `data.error` outside the load-failed page renders as the error toast; align the brief.
- **Decision**: FIXED

### F6 — The integration route test isn't named

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4
- **Detail**: Success `location` asserts live in `tests/integration/data-routes.test.ts` (`errorTarget` helper). E2E `toHaveURL(/\/dashboard$/)` keeps passing because the clearing script strips the parameter.
- **Fix**: Name the file in §4 with a `noticeTarget` helper.
- **Decision**: FIXED
