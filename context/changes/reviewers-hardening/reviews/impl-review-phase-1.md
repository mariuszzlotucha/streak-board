<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Reviewers hardening after PR #225 and #226

- **Plan**: context/changes/reviewers-hardening/plan.md
- **Scope**: Phase 1 of 2
- **Reviewed phases**: 1
- **Date**: 2026-10-20
- **Verdict**: NEEDS ATTENTION, all six findings fixed after triage (SOUND after fixes)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria: 1.1 (58 tests), 1.2 (lint), 1.3 (3 configs valid) re-run green; 1.4 proven by the local `results/compare-20261020T160601.json` (`nul-hidden` on `old`, outcome `unreviewable`, `reviewerRoot` = `eval-old`); 1.5 ticked after the owner's confirmation; 1.6 pending by design. Scope: the extras (README clauses, roadmap status, table re-wrap) are harmless.

## Findings

### F1 — `causeMessage` is not truncated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/provider.ts (`errorDetail`, `causeMessage`)
- **Detail**: The doc and the README promise head and tail of at most 400 characters, but `causeMessage` is the whole message. The SDK's `TypeValidationError` message embeds `JSON.stringify(value)`, so the full parsed model output can reach the report line.
- **Fix**: Slice `causeMessage` to `ERROR_TEXT_EXCERPT` and add a test with a long message.
  - Strength: Keeps the report readable and the stated bound true.
  - Tradeoff: A very long cause is cut; the full text stays in the local result file only through `textHead` and `textTail`.
  - Confidence: HIGH — the reviewer read `errorMessage()` and the SDK type.
  - Blind spot: The exact size of the SDK message on a real schema error is not measured.
- **Decision**: FIXED (Fix now): `causeMessage` is cut to `ERROR_TEXT_EXCERPT` (400) characters; test added

### F2 — The inline-code regex crosses paragraphs and matches a prefix of a longer run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:119
- **Detail**: `(`+)[\s\S]*?\1`is not a CommonMark code span. Input "Use` here. @octocat please.\n\nAnother `stray" becomes "Use  stray", so the mention passes; "a ``` b @bob` c" strips to "a c". A stray backtick in the model's summary therefore hides a mention or link from the check that exists to enforce the #225 rule.
- **Fix A ⭐ Recommended**: Limit a span to one paragraph and to a run of equal length, e.g. `(`+)(?!`)(?:(?!\n\s*\n)[\s\S])*?(?<!`)\1(?!`)`, with tests for both inputs.
  - Strength: Matches CommonMark closely enough; the check stays strict where the rule matters.
  - Tradeoff: A more complex regex to read.
  - Confidence: MED — the reviewer's regex was not run against the whole test suite.
  - Blind spot: Other CommonMark corner cases (spans inside lists) are untested.
- **Fix B**: Accept the gap and document it in the comment above the check.
  - Strength: No code change.
  - Tradeoff: The check can pass a summary that breaks the rule.
  - Confidence: HIGH — the gap is demonstrated.
  - Blind spot: How often the model writes a stray backtick is unknown.
- **Decision**: FIXED via Fix A: a code span opens at a run not preceded by a backtick, closes at a run of the same length and stays inside its paragraph (`(?<!`)(`+)(?!`)…(?<!`)\1(?!`)`); tests for the stray-backtick and the longer-run inputs

### F3 — Both regexes are quadratic on adversarial bodies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:118-119
- **Detail**: 65,000 backticks take about 4 s; 13,000 unclosed fence starts take about 1.2 s; 250 KB takes 15 s. The input is the model's own comment in a manual dev script, so this is a stalled dry run, not a security issue.
- **Fix**: Fail the check when the body is longer than 65,536 characters (GitHub's comment limit, so such a body could not be posted anyway) before running the regexes.
- **Decision**: FIXED (Fix now): `MAX_COMMENT_CHARS` = 65,536; a longer body fails the check before the regexes run; test added

### F4 — The link rule misses `HTTPS://`, `www.` and `<a>`

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:120
- **Detail**: The regex has no `i` flag, and GitHub autolinks `www.example.com`; an HTML `<a href>` also passes. `[x] (y)` correctly passes.
- **Fix**: Add the `i` flag and `www\.` and `<a\b` to the link rule, with tests.
- **Decision**: FIXED (Fix now): the link rule is case-insensitive and also matches `www.` and `<a`; tests added

### F5 — A git failure falls back to `REPO_ROOT` silently, and the fallback is memoised

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/provider.ts:342-357
- **Detail**: Missing git, git older than 2.31 or a bare repository resolve a relative `reviewerRoot` from the worktree with no hint. The failure stays visible (load error, `metadata.reviewerRoot`), and local git is 2.34.1.
- **Fix**: One `console.warn` on the fallback path.
- **Decision**: FIXED (Fix now): `findMainCheckout` writes one line to stderr when git fails or names no `.git` directory

### F6 — The `mainCheckoutRoot` fallback and the `callApi` check depend on git

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/code-reviewer-evals.test.ts (`is what the provider reports as reviewerRoot`)
- **Detail**: The `?? REPO_ROOT` and `catch` branches of `mainCheckoutRoot()` are exercised only through the pure function. The `callApi` test recomputes git's answer, so it throws without git and would fail in a bare-repo layout. Acceptable for this repo's CI.
- **Fix**: None needed; note it. A test of the memoised function would need an injectable git call, which the plan does not ask for.
- **Decision**: FIXED (Fix now): `findMainCheckout(runGit)` takes the git call as a parameter and is tested for the success path, a throwing git and two unusable answers
