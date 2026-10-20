<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Reviewers hardening after PR #225 and #226

- **Plan**: context/changes/reviewers-hardening/plan.md
- **Mode**: Deep
- **Date**: 2026-10-20
- **Verdict**: REVISE, SOUND after fixes
- **Findings**: 0 critical, 5 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

10/10 paths ✓, 8/8 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (6 + 8 rows match the criteria). `docs/reference/contract-surfaces.md` does not exist, so that check was skipped.

## Findings

### F1 — Criterion 1.4 cannot run as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1, success criterion 1.4
- **Detail**: `eval-old` does not exist yet, a fresh worktree has no `node_modules` (root and evals), and `--no-table` means the outcome is read from `results/compare-*.json`.
- **Fix**: Setup bullet (change 0) in Phase 1 and the result location in criterion 1.4.
- **Decision**: FIXED (Fix in plan)

### F2 — Criterion 2.4 stays red; two case counts are not named

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 2, change 3 and criterion 2.4
- **Detail**: `grep "15 cases"` also hits `packages/code-reviewer/evals/README.md:81` and `packages/code-reviewer/README.md:214`; `lessons.md:213` is outside the grep.
- **Fix**: Both lines named in change 3 (`:81` reworded as "the earlier 15-case suite", `:214` updated with the Language bullet); `lessons.md` stays.
- **Decision**: FIXED (Fix in plan)

### F3 — The `reviewerRoot` helper leaves sync versus async open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 1
- **Detail**: `reviewerRoot()` is synchronous (`provider.ts:308`), the existing `git()` helper is async, and the default `"."` must stay on this checkout.
- **Fix**: Memoised `execFileSync` with `gitEnv()`, a unit test for `"."` and the unset default, and the doc spots `provider.ts:6`, `:50` and `evals/README.md:11`.
- **Decision**: FIXED (Fix in plan)

### F4 — Item 8.4 gets ticked without being measured

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 2, change 4 and the 1.3 USD gate
- **Detail**: The estimate before the sample is about 1.2 to 1.3 USD, so the gate is probably missed, the 2026-10-20 schema errors did not repeat on re-run, yet change 4 ticked 8.4 as "not measured".
- **Fix A ⭐ Recommended**: Tick 8.4 only if the sample ran or a schema error occurred in the session; otherwise leave it open with the trigger "next schema error in an eval run".
- **Fix B**: Drop the sample now and tick only the diagnostics part in Phase 1.
- **Decision**: FIXED via Fix A

### F5 — The new case does not exercise the sentence change

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 2, changes 1 and 2
- **Detail**: `old` (master) already carries the #226 sentence, and the case does not force a `### Not verified` section, so a pass shows "Japanese input still gets English", not that the widening works.
- **Fix A ⭐ Recommended**: State that the case is a regression guard and the widening is unmeasured, in the plan, the READMEs and `eval-results.md`.
- **Fix B**: Plant an unverifiable claim and add an English-note rubric line.
- **Decision**: FIXED via Fix A

### F6 — The dry-run reads the working tree, not #226's merge commit

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 1, change 5
- **Detail**: `claude` runs in the checked-out branch and only the diff comes from `gh`; for #226 the difference is nil. The `Commit` line should read `cb7d540`, and the nominal cost is printed only after the run.
- **Fix**: One line in the dry-run contract.
- **Decision**: FIXED (Fix in plan)
