<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Modular ToolLoopAgent Code Reviewer

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: Phase 2 of 2
- **Reviewed phases**: 2
- **Date**: 2026-10-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

Reviewed `git diff 345ade8..HEAD` on `tool-loop-agent/phase-2` (commits dbf752b, df350a1, 966ec16; not pushed). Automated checks 2.1–2.4 re-run and pass; manual checks 2.5–2.8 confirmed by the user. The removal of the root `review` npm script was directed by the user and is applied consistently in code and README.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — The plan still documents the deleted `npm run review` script

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/tool-loop-agent/plan.md:164, :172-173, :193-195, :214-217, :225
- **Detail**: The user-directed removal of the root `review` script (it ran its own `git diff` and ignored piped input) is recorded only in the dbf752b commit body. The plan's Migration Notes still say "`npm run review` keeps its path and stdout format", the Phase 2 contract specifies the usage text `git diff | npm run review` (the code now prints `git diff | npx tsx packages/code-reviewer/review.ts`), and the manual-check commands use the deleted script. `plan-brief.md:15,68` say the same. Anyone reading the plan at archive time sees a contract the code no longer meets.
- **Fix**: Append a dated `## Addenda` section to plan.md (Phase blocks and Progress titles untouched) recording the removal, the new usage text and the corrected manual-check command, and repeat it in the PR description.
- **Decision**: FIXED — `## Addenda` in plan.md; repeated in the PR description

### F2 — `review-with-session.ts` bypasses the diff cap and never logs usage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/review-with-session.ts:10-31
- **Detail**: The demo now uses `createReviewer` (so it gains the 16384-token ceiling, `usage.include` and an exit 1 on missing input, all improvements), but it calls `generate()` directly rather than `reviewDiff`, so `DEFAULT_MAX_DIFF_CHARS` does not apply and a truncated answer rejects at top level with a `NoObjectGeneratedError` stack trace. Neither its two calls nor the recaller (no `maxOutputTokens`) log usage, against the M5L2 rule "log usage from every review". It is an attended demo, and the plan said "behaviour unchanged".
- **Fix A**: Check `diff.length > DEFAULT_MAX_DIFF_CHARS` before the first call and print one usage line per call on stderr (`first.usage`, `second.usage`).
  - Strength: Brings the second reviewer entry point under the same input cap and cost log as the CLI.
  - Tradeoff: Changes the demo's output, which the plan said stays as before; about 10 lines.
  - Confidence: MED — straightforward, but not exercised against the model.
  - Blind spot: Whether the demo is used anywhere that parses its stderr.
- **Fix B ⭐ Recommended**: Leave the demo as is and queue the cap and usage logging in follow-ups/review-fixes.md for the eval/CI-gate change.
  - Strength: Keeps the plan's "demos behave as before" boundary that check 2.7 just confirmed; the demo is never run unattended.
  - Tradeoff: The demo stays outside the cost log until then.
  - Confidence: HIGH — nothing automated calls the demo.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B) — demo left as is; queued in follow-ups/review-fixes.md for the eval/CI-gate change

### F3 — stdin is read without a bound

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/utils.ts:6-10
- **Detail**: `readDiff()` buffers all of stdin before `reviewDiff` applies the 200,000-character limit. A huge pipe costs about twice its size in memory, and above ~512 MB `toString` throws `ERR_STRING_TOO_LONG` outside the CLI's try (review.ts:30), giving a stack trace instead of the documented `error:` line. No model call happens, so no money is at risk.
- **Fix**: Stop reading once the byte count passes a cap (e.g. `DEFAULT_MAX_DIFF_CHARS * 4`) and print `error: diff too large`, exit 1.
- **Decision**: FIXED — `readDiff()` stops after `4 × DEFAULT_MAX_DIFF_CHARS` bytes and prints `error: diff too large`; README exit codes updated

### F4 — `process.exit(1)` straight after `console.error` in the CLI catch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/review.ts:41
- **Detail**: On macOS/Windows, writes to a piped stderr are asynchronous, so exiting immediately can in principle cut off the usage or error line (e.g. CI log capture on a macOS runner). Linux writes synchronously; the lines are short.
- **Fix**: Set `process.exitCode = 1` in the catch instead of calling `process.exit(1)`.
- **Decision**: FIXED — CLI body moved into `main()`, `process.exitCode = await main()`

### F5 — `cost-report.ts` keeps the deprecated `onStepFinish`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/cost-report.ts:18
- **Detail**: The phase swept `stepCountIs` → `isStepCount` across the package, but `onStepFinish` (`@deprecated Use onStepEnd instead` in ai@7.0.139) remains, while `agent.ts:123` already uses `onStepEnd`.
- **Fix**: Rename `onStepFinish` to `onStepEnd` in cost-report.ts.
- **Decision**: FIXED — `onStepEnd` in cost-report.ts

### F6 — `no-console` is a blanket warning, so the side-effect-free rule is unenforced

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: eslint.config.js:121-126
- **Detail**: `scripts/**/*.mjs` turns `no-console` off, while the code-reviewer CLI and demos produce 13 warnings. A stray `console.log` in a library module (`agent.ts`, `config.ts`, `index.ts`, `prompts/*`, `schemas/*`), which must stay side-effect free, would be one more warning among them.
- **Fix**: Add an ESLint override turning `no-console` off for `review.ts`, `utils.ts` and the three demos, and to `error` for the library modules.
- **Decision**: FIXED — `codeReviewerConfig` in eslint.config.js: `no-console` error for the package, off for the CLI, utils and demos (probe in a library-module path errors)

### F7 — `cost.json` written by the demo is not git-ignored

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/cost-report.ts:37-38
- **Detail**: Pre-existing. Running the demo leaves an untracked `packages/code-reviewer/cost.json` (`git check-ignore` reports nothing), which a "stage all" can commit by accident.
- **Fix**: Add `packages/code-reviewer/cost.json` to `.gitignore`.
- **Decision**: FIXED — `packages/code-reviewer/cost.json` in .gitignore

### F8 — README states that reasoning tokens count towards the ceiling more firmly than the code

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/README.md:88
- **Detail**: The budget table says "reasoning tokens included"; `config.ts:13-14` says reasoning tokens "may count", which is what the provider behaviour supports.
- **Fix**: Reword to "reasoning tokens may count towards it".
- **Decision**: FIXED — README budget row says reasoning tokens may count towards the ceiling
