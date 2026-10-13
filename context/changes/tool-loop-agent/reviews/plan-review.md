<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Modular ToolLoopAgent Code Reviewer

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Mode**: Deep
- **Date**: 2026-10-13
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, 6/6 symbols ✓ (ToolLoopAgentSettings.maxOutputTokens, AgentCallParameters.abortSignal, result.usage = total over steps, steps[].providerMetadata, isStepCount, `tsx -e` barrel check run OK), brief↔plan ✓, Progress↔Phase 6/6 + 8/8 ✓. Codebase claims verified inline (each was a single grep or command), not through a subagent.

## Findings

### F1 — The package to refactor is not on master

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Brief — Prerequisites; lessons "planning branch" / "phase branch"
- **Detail**: `packages/code-reviewer` exists only in commit 7f607bc "m5l2" on the local, unpushed branch `m5l2-package-code-review`; `git ls-tree origin/master packages` is empty. The lessons cut every planning and phase branch from fresh `master`, where none of the six files the plan modifies exist.
- **Fix A ⭐ Recommended**: Land m5l2 first (push + PR + merge); add it as a Prerequisite
  - Strength: Keeps the lesson branch rules; plan and phase PRs show only this change.
  - Tradeoff: One extra PR to merge before planning lands.
  - Confidence: HIGH — verified with `git branch --contains` / `ls-tree`.
  - Blind spot: Which uncommitted files (.agents/, skills-lock.json) belong to m5l2 is not decided.
- **Fix B**: Stack the planning and phase branches on `m5l2-package-code-review`
  - Strength: No wait.
  - Tradeoff: Breaks the "cut from master" lesson; PRs include the m5l2 diff until it merges.
  - Confidence: MEDIUM — workable, but against recorded team rules.
  - Blind spot: CI behaviour on stacked PRs not checked.
- **Decision**: FIXED (Fix B — stacked on m5l2-package-code-review)

### F2 — New maxOutputTokens 4096 can truncate the structured verdict

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Config module / Agent module
- **Detail**: Today `review.ts` has no output-token cap; the plan adds 4096. Reasoning tokens may count towards it on OpenRouter, and six rationales plus a markdown summary for a large diff can exceed it; a cut-off answer is invalid JSON, so `reviewDiff` throws — a behaviour change the "output unchanged" goal does not account for.
- **Fix**: Raise `DEFAULT_MAX_OUTPUT_TOKENS` to 16384, document it as a cost ceiling, and add to Manual 2.5 that the stderr line shows finishReason `stop` (not `length`) on a large diff.
  - Strength: Keeps the budget rule with headroom for reasoning.
  - Tradeoff: Higher worst-case cost per call.
  - Confidence: MED — reasoning-token accounting for glm-5.1 not measured.
  - Blind spot: Typical token use unknown until the first run.
- **Decision**: FIXED

### F3 — "Moved verbatim" is only checked by eye

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Manual 1.6
- **Detail**: The brief names "silent change to schema/prompt text" as Phase 1's key risk and there are no tests, yet 1.6 says only "git stash/checkout comparison". The `tsx -e` import works on the old module, so it can be a command.
- **Fix**: Snapshot `{ schema: REVIEW_JSON_SCHEMA, prompt: REVIEWER_PROMPT }` from `review-schema.ts` before the edit, the same from `index.ts` after, and `diff` them; move 1.6 to Automated.
- **Decision**: FIXED

### F4 — rules-inject.ts is already broken, so "behave as before" is ambiguous

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Demos; Manual 2.7
- **Detail**: `rules-inject.ts:7` reads `packages/anthropic/.claude/skills/greeting/SKILL.md`; `packages/anthropic` does not exist, so the demo throws ENOENT before any model call, today and after the change.
- **Fix**: Add the pre-existing ENOENT to "What We're NOT Doing"; Phase 2 gives `rules-inject.ts` only the model-id rewire; 2.7 expects it to fail with the same ENOENT.
- **Decision**: FIXED

### F5 — Schema path diverges from the M5L2/M5L3 template contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Schema module; Migration Notes
- **Detail**: `.claude/config-templates/m5l2-review-schema.ts.template` says the CI gate and promptfoo evals read "this one definition" at `<reviewer-dir>/src/review-schema.ts`; the plan moves it to `schemas/review-result.ts` and deletes `review-schema.ts`.
- **Fix**: State in Migration Notes and the README that `schemas/review-result.ts` (re-exported from `index.ts`) is the single schema definition the M5L3 gate and evals import.
- **Decision**: ACCEPTED
