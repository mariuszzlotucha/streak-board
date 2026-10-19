<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Claude Review Publish Implementation Plan

- **Plan**: context/changes/claude-review-publish/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1
- **Date**: 2026-10-19
- **Verdict**: NEEDS ATTENTION → APPROVED after triage (all 5 findings fixed)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- Plan drift (sub-agent, diff of `0c923b7` and `2c97166` against `origin/master`): all six planned changes MATCH; no DRIFT or MISSING. Extras are minor: stricter `parseArgs`, exit 2 when `gh` is not on `PATH`, `-b` treated as `--body`, extra unit cases, and `node:buffer` as one import beyond the plan's list.
- Automated rows 1.1 to 1.12 re-run on the committed code: all PASS (actionlint, greps, `npm run lint`, `npm run deps`, 702 unit tests, Prettier, README and open-items greps); the script exits 2 without a PR number.
- Manual rows: none ticked, which is correct. Row 1.13 has evidence in the run report: `node scripts/claude-review-dry-run.mjs 205 --claude "npx -y @anthropic-ai/claude-code@2.1.296"` exited 0 with one recorded `gh pr comment 205 --body-file -`, body checks passed, 0 denials, 8 turns, 0.42 notional USD.
- Break-check on the script (done in the goal run): five deliberate breaks turned the tests red and were restored.

## Findings

### F1 — The dry run is not isolated from the real GitHub account

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:53 (wrapper), :246-264
- **Detail**: The wrapper intercepts only `gh pr comment`; every other `gh` call runs against the real account (plan: "otherwise it execs the real gh"). `--setting-sources user` loads the owner's `~/.claude/settings.json`, and `--allowedTools` only adds to it. A user setting such as `Bash(gh:*)` would let the model run `gh pr review`, `gh pr edit` or `gh api` against the real PR during a dry run that is meant to post nothing. Today the owner's file has no `permissions` key, so this is a latent risk that a later settings change would activate.
- **Fix A ⭐ Recommended**: The wrapper passes through only `pr view` and `pr diff` (the two read commands the CI allow-list names) and exits 2 with a message for everything else.
  - Strength: The dry run can post nothing and change nothing whatever the user settings say, which is its stated purpose; it also matches the CI allow-list.
  - Tradeoff: A model call to another `gh` command fails locally instead of reaching GitHub; the plan text for the wrapper changes by one clause.
  - Confidence: HIGH — the CI allow-list permits only those commands, so a local pass-through of others tests nothing real.
  - Blind spot: None significant.
- **Fix B**: Keep the pass-through and add `--disallowedTools "Bash(gh pr review:*),Bash(gh pr edit:*),Bash(gh api:*)"` to the arguments.
  - Strength: Wrapper unchanged.
  - Tradeoff: A deny list names only the commands we thought of.
  - Confidence: MED — misses any other mutating `gh` subcommand.
  - Blind spot: Future `gh` subcommands.
- **Decision**: Fixed via Fix A

### F2 — Prompt wording contradicts itself in four small places

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/review/claude-review.md:21, :23, section 11 bullets, :18
- **Detail**: (1) Line 21 says "no redirections", yet the required form `<<'EOF'` is a redirection. (2) Line 23 says never use `$(...)` outside the heredoc, which implies it is fine inside; with a quoted delimiter `$(...)` and backticks are literal text and need no escaping, which the prompt never says. (3) With the `gh` line now the first line of the fenced template, "Line 1 is exactly the marker" can be read as line 1 of the fence. (4) The prompt forbids the alternatives (a file, `$(...)`) but does not name `cat <<EOF | gh …` or a Write to a temp file, the two forms this model tried on 2026-10-14. The dry run passed, so the model follows it today; the edits remove the ambiguity.
- **Fix**: Line 21: "no redirections other than the `<<'EOF'` heredoc". Line 23: add "Inside the heredoc, `$(...)` and backticks are literal text; write them as they are." and "Not `cat <<EOF | gh …`, and no Write to a temp file." Section 11 bullets: "Line 1 of the body is exactly …; line 2 …". Keep gate 1.4 true: do not write `gh pr comment <n> --body '` anywhere.
- **Decision**: Fixed via Fix in plan

### F3 — The generated `gh` wrapper, the riskiest logic, has no test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:42-55 (`GH_WRAPPER`), tests/unit/claude-review-dry-run.test.ts
- **Detail**: `GH_WRAPPER` is a string constant that only a real model run exercises. It decides what is recorded and what passes through. Gaps: it handles only the exact argv `--body-file -`, so `--body-file=-` and `-F -` record `stdin: null` and the script then blames "a --body argument was used", which is misleading; `readFileSync(0)` can throw (EAGAIN, no stdin) before anything is logged, leaving a silent "0 comments". The unit tests also miss a few cheap cases: a `permission_denied` with no matching `tool_use`, a result without `permission_denials`, non-object JSON lines, `parseArgs` with `--model` and no value.
- **Fix A ⭐ Recommended**: Export `GH_WRAPPER`; in the test write it to a temp dir and run it with `spawnSync(process.execPath, …)` and the `CLAUDE_REVIEW_DRY_RUN_*` variables for: `pr comment 5 --body-file -` with stdin recorded; `--body-file=-` and `-F -` recorded the same way; `pr comment --body x` recorded without stdin and no real gh call; a pass-through command reaching a stub real gh (F1 changes this to exit 2 for non-read commands). Wrap the stdin read in try/catch and log the error text. Add the small cases above.
  - Strength: The logic that decides pass or fail of row 1.13 gets a unit test, and the misleading message is fixed.
  - Tradeoff: About 40 lines of test and a spawn per case (milliseconds).
  - Confidence: HIGH — the pattern is plain `spawnSync` of a Node file.
  - Blind spot: None significant.
- **Fix B**: Leave the wrapper untested and rely on the dry run.
  - Strength: No work.
  - Tradeoff: A wrapper regression shows up only as a confusing dry-run result.
  - Confidence: MED.
  - Blind spot: The dry run costs about 0.4 notional USD per attempt.
- **Decision**: Fixed via Fix A

### F4 — Startup failures exit 1 with a stack trace instead of 2 with a message

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:227 (`gh repo view`), :264 (spawn)
- **Detail**: `execFileSync(gh repo view …)` is outside any try/catch, and `runClaude` rejects on spawn `ENOENT` (a wrong `--claude`). Both end in a raw stack trace and exit 1, while the header promises exit 1 only for comment or body problems and 2 for usage. The temp directory is still removed.
- **Fix**: Catch both, print one line (`could not resolve the repository: …`, `could not start <command>: …`) and return 2.
- **Decision**: Fixed via Fix in plan

### F5 — Result handling: fatal denials from one source only, error subtypes ignored

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:289-305
- **Detail**: Fatal denials come only from `result.permission_denials`; if a Claude Code version omits that field, a `permission_denied` system message for `gh pr comment` is printed but not marked fatal (the run still fails on the comment count, with no attribution). The result's `is_error` and `subtype` (for example `error_max_turns`) are never checked, so a run that posts one valid comment and then hits the turn limit passes.
- **Fix**: Run `classifyDenials` over the union of both sources (deduplicated by `toolUseId`), keep `subtype` and `is_error` in the parsed result, and add a problem when `is_error` is true or the subtype is not `success`.
- **Decision**: Fixed via Fix in plan
