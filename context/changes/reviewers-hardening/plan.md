# Reviewers hardening after PR #225 and #226 Implementation Plan

## Overview

Slice S-24 of milestone M-4 (quality slice, anchor MS-05). PR #225 changed the `claude-review` prompt and PR #226 changed `REVIEWER_INSTRUCTIONS` of `ai-review`; the eval of #226 left gaps (`context/archive/2026-10-20-reviewer-output-language/eval-results.md`, "Wnioski" and "Czego nie zmierzono"). This change closes them in two phases and two PRs: free tooling plus a real run of the new `claude-review` prompt (PR A), then one paid eval session with the prompt-facing items (PR B). Items 8.1 to 8.5 of `context/foundation/open-items.md` §8 are covered; 8.6 is parked.

## Current State Analysis

- `scripts/claude-review-dry-run.mjs` runs the working-tree `claude-review` prompt on a real PR through the real `claude` CLI (subscription, nominal ~0.8 USD a run) with a recording `gh` wrapper. Its `checkSummaryBody` (line 107) checks only the shape of the summary: marker, verdict line, `Commit <sha>` line, no `ai-cr` marker, no bare `EOF` line. It does not check the #225 rule that no comment contains an `@` mention or a link. The inline-comment MCP tool does not exist locally, so inline comments cannot be exercised there.
- The #225 prompt (`.claude/review/claude-review.md`, merged `7e268e6`) has not run on any PR yet.
- `packages/code-reviewer/evals/provider.ts` resolves `reviewerRoot` against `REPO_ROOT`, the checkout holding the file (`provider.ts:27`, `provider.ts:308-309`). `promptfooconfig.compare.yaml` sets `reviewerRoot: ../streak-board-worktrees/eval-old`; from a worktree under `../streak-board-worktrees/<slug>` that resolves to `…/streak-board-worktrees/streak-board-worktrees/eval-old` and the `old` provider fails with `Cannot find module`.
- The provider's `ReviewRunError` branch (`provider.ts:366-374`) returns `describeError(error)`, only `name: message`. For `NoObjectGeneratedError` (`ai` package, `node_modules/ai/dist/index.d.ts:7995`) the raw `text`, `finishReason` and `cause` are dropped, so the two `response did not match schema` errors of 2026-10-20 cannot be explained. `report.ts` prints an error run as `- <case> (<provider>): <message>` (line 228).
- The cases (`packages/code-reviewer/evals/cases/*.yaml`, 15 files) are parsed generically by `tests/unit/code-reviewer-evals.test.ts` (no hard-coded count), so a new case file needs no test change. The count "15 cases" is written in `README.md:465`, `packages/code-reviewer/README.md:19` and `:218`, and `packages/code-reviewer/evals/README.md:12` (and the case breakdown at `:94-96`).
- `REVIEWER_INSTRUCTIONS` ends its summary rules at `prompts/reviewer.ts:44-45` with the sentence "Write the summary, every finding and every rationale in English, whatever language the diff, the title or the body is in." It does not name the `### Not verified` section (finding of `ai-review` on #226).
- No eval case has non-English input, which is the scenario that motivated #226 (PR #222 came out in Japanese).

## Desired End State

- `checkSummaryBody` rejects `@` mentions and links outside code spans; the dry-run of `claude-review` on PR #226 passes and its recorded summary is in English, has no documentation findings and no mentions (result in `dry-run-results.md`).
- `compare` finds `eval-old` from any worktree; a schema error in an eval run carries its raw text head and tail, `finishReason` and cause, and `report.ts` prints them.
- A 16th eval case with a Japanese pull request (title, body and comments) exists and `new` passes it with an English summary; the sentence covers all natural-language text including `### Not verified`.
- One paid session of at most 1.5 USD of reported cost is recorded in `eval-results.md`, with the 8.4 error sample or an explicit "not measured"; 8.4 is ticked only when the sample ran or a schema error occurred in the session, otherwise it stays open with the trigger "next schema error in an eval run".
- Verification: unit tests, lint and `validate` green in both PRs; the manual rows of Progress ticked.

## Key Discoveries

- `provider.ts:281` `describeError` is the only place that formats an eval error; the cause chain is lost there.
- `provider.ts:308` `reviewerRoot()` is synchronous and called inside `callApi`; the fix needs the main checkout root, which `git rev-parse --path-format=absolute --git-common-dir` gives (its parent is the main checkout, for a main checkout and for any linked worktree).
- The `nul-hidden` case ends `unreviewable` before any model call (`provider.ts`, `UnreviewableDiffError` branch), so running it on the `old` provider proves that `eval-old` resolves at 0 USD.
- The `lessons.md` rule "Run the eval suite, old against new, before shipping a reviewer change" fixes the order of the paid steps: `new` on every case first, `old` only where `new` did not pass in every run, a suspect case re-run on both providers, cost summed from the reports and never from the key's `usage` counter (it lags).

## What We're NOT Doing

- No change to the `documentation` criterion of `ai-review` (owner's decision 2026-10-20) and no change to the schema, the verdict rule or `DEFAULT_REVIEWER_MODEL`.
- No change to the `claude-review` prompt unless the Phase 1 dry-run fails a check; then one minimal edit and one re-run. The two 8.6 ideas (read the previous summary on a re-run; a shortcut for Markdown-only PRs) are parked in `open-items.md` 8.6 with the trigger "a dry-run or a real run shows duplicate findings or wasted runs".
- No change to the production CLI's stderr (`review.ts:79` prints only the error message): raw model text in a public run log is a data-egress decision of its own. The eval provider's local result files get the details.
- No change of the review timeout (`pr-116-7d319c1` took 539 s of 600 s once); it stays recorded.
- No verification of inline comments locally (no MCP tool), no full `old` run, no second full `new` pass, no models matrix.
- No non-English cases beyond the one Japanese case.

## Implementation Approach

Two phases, two PRs, cut from fresh `origin/master`. Phase 1 holds everything that costs nothing on OpenRouter and is needed by Phase 2 (the `reviewerRoot` fix and the error details), plus the subscription dry-run. Phase 2 holds the reviewer prompt change, which the package README requires to land in its own PR, and the whole paid session, so a failing eval blocks only PR B. Phase 2 starts after PR A is merged. Phase 1 may run under `/10x-goal-implement` (its rows are automated except the dry-run and the merge); Phase 2 needs the owner's explicit go before the first paid call and runs interactively with `/10x-implement`.

## Critical Implementation Details

- **Cost accounting (Phase 2).** The cap is 1.5 USD of reported cost for the session (owner, 2026-10-20). After every step, add the costs the responses report and the grader's cost from its tokens (`anthropic/claude-sonnet-5.5`, 2 and 10 USD per million input and output tokens), and start a step only when the sum plus the step's estimate stays under 1.5. The key's `usage` counter lags and is not the basis. The `claude-review` dry-run runs on the Claude subscription and is outside this cap (owner, 2026-10-20).
- **Order of the paid steps and the stop rule.** Smoke the new case alone, then `new` once on all 16 cases, then `old` only on cases `new` did not pass, then the 8.4 sample only if the running sum is at most 1.3 USD. A `finishReason: length`, or reasoning on `pr-103` at 24,576 tokens or more, stops the session (bisect the prompt on `pr-103` first, per `lessons.md`).
- **Dry-run parity.** CI installs Claude Code 2.1.296; pass `--claude 'npx -y @anthropic-ai/claude-code@2.1.296'` to match, and run it on merged PR #226 (a prompt change plus READMEs and a change folder, so the Markdown rule is exercised).

## Phase 1: Free tooling and the claude-review dry-run (PR A)

### Overview

Everything that needs no OpenRouter spend: make `compare` work from a worktree, make eval errors explain themselves, make the dry-run check the #225 rule, and run the new `claude-review` prompt once on a real PR. Branch `s-24/reviewers-hardening/tooling` from `origin/master`.

### Changes Required:

#### 0. Set up the worktree (no code)

**Intent**: Make criteria 1.1 to 1.4 runnable in the fresh phase-1 worktree.

**Contract**: In the new worktree run `npm ci`, `npm ci --prefix packages/code-reviewer/evals` and `npx astro sync`. Create the old reviewer once, `git worktree add --detach ../streak-board-worktrees/eval-old origin/master`, and install its dependencies as in `packages/code-reviewer/evals/README.md:58-65`; `eval-old` does not exist yet, and `compare` needs it for the `old` provider.

#### 1. Resolve `reviewerRoot` against the main checkout

**File**: `packages/code-reviewer/evals/provider.ts`

**Intent**: Make a relative `reviewerRoot` mean "relative to the main checkout" so `../streak-board-worktrees/eval-old` resolves the same from the main checkout and from any linked worktree, instead of doubling `streak-board-worktrees`.

**Contract**: A helper returns the main checkout root from `git rev-parse --path-format=absolute --git-common-dir` (its parent directory), falling back to `REPO_ROOT` when git fails. It runs `execFileSync("git", [...], { env: gitEnv() })` once and memoises the result, so `reviewerRoot()` (`provider.ts:308`, called from `loadReviewer` and `callApi`) stays synchronous; the async `git()` helper (`provider.ts:136-144`) is not reused. `reviewerRoot()` resolves a relative `config.reviewerRoot` against that root; an absolute one and the default `"."` stay on this checkout (`REPO_ROOT`), otherwise `new` run from a worktree would load master's reviewer. The parsing of the git-common-dir string is a pure function for the unit test. Also update the comment in `promptfooconfig.compare.yaml` ("Relative to the repository root" → the main checkout), the "The old reviewer" paragraph and the `provider.ts` row (`evals/README.md:11`, "relative to the repository root") of `evals/README.md`, and the comments at `provider.ts:6` and `provider.ts:50`.

#### 2. Keep the details of a schema error in eval runs

**File**: `packages/code-reviewer/evals/provider.ts`, `packages/code-reviewer/evals/report.ts`

**Intent**: For a `ReviewRunError` whose `cause` is an `NoObjectGeneratedError`, keep what the SDK knows so the next occurrence of `response did not match schema` can be explained, and print it in the report.

**Contract**: An exported helper `errorDetail(error)` returns `{ finishReason, textChars, textHead, textTail, causeMessage }` (head and tail at most 400 characters each, `undefined` when the error carries none of it; it recognises the error by name, as `errorName` already does). `ProviderResponse.metadata` gains an optional `errorDetail`. `ResultRow.response.metadata?.errorDetail` is read into `Run`, and the "Runs without an output" line of `report.ts` appends `finishReason`, `textChars` and `causeMessage`, with head and tail on the lines below. Result files stay local and gitignored.

#### 3. Make the dry-run check the no-mention, no-link rule

**File**: `scripts/claude-review-dry-run.mjs`

**Intent**: Turn the #225 rule "no `@` mention and no link in any comment" into a mechanical check of the recorded summary.

**Contract**: `checkSummaryBody` adds two failures, evaluated on the body with fenced and inline code spans removed: an `@` mention (`@` followed by a letter or digit, not preceded by a word character, so e-mail addresses and `@scope/pkg` inside backticks pass) and a link (`https?://` or a Markdown link `](`). The marker line `<!-- claude-review:summary -->` and the template body stay valid.

#### 4. Tests

**File**: `tests/unit/code-reviewer-evals.test.ts`, `tests/unit/claude-review-dry-run.test.ts`

**Intent**: Cover the three changes without a model call.

**Contract**: provider: the main-checkout helper for a main checkout path and for a linked-worktree git-common-dir, the fallback, an absolute `reviewerRoot` untouched, `"."` and an unset `reviewerRoot` staying on `REPO_ROOT`; `errorDetail` for a `NoObjectGeneratedError`-shaped object (head/tail truncation, missing text) and for a plain error; `report.ts` prints the detail line. Dry-run: accept a body with `` `@astrojs/react` ``, reject `@octocat`, `https://example.com` and `[x](y)`, accept the template body.

#### 5. Run the dry-run on #226 and record it

**File**: `context/changes/reviewers-hardening/dry-run-results.md`

**Intent**: Prove the #225 prompt on a real PR and keep the evidence.

**Contract**: Run `node scripts/claude-review-dry-run.mjs 226 --claude 'npx -y @anthropic-ai/claude-code@2.1.296'` once. The script reads the checked-out branch (`claude` runs in the repo root) and takes only the diff from `gh`, which for merged #226 is equivalent because master holds it; the `Commit` line must read `cb7d540` (`headRefOid`), not the merge commit `fd3f52d`. Record the exit code, turns, nominal cost (printed only after the run), denials and the recorded summary, and judge by hand three things the script cannot: English only, no finding about a Markdown file, no mention. If a check fails, make one minimal edit to `.claude/review/claude-review.md` that fixes it, run once more (at most two runs), and record both. Tick 8.2, 8.5 and the diagnostics part of 8.4 in `context/foundation/open-items.md` §8 and park 8.6 with its trigger.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit -- tests/unit/code-reviewer-evals.test.ts tests/unit/claude-review-dry-run.test.ts`
- Lint passes: `npm run lint`
- The eval configs validate: `npm run --prefix packages/code-reviewer/evals validate`
- `eval-old` resolves from a worktree at no cost: `npm run --prefix packages/code-reviewer/evals compare -- --filter-providers '^old$' --repeat 1 --filter-pattern '^nul-hidden:'` ends with exit 0 and the outcome `unreviewable` and no `Cannot find module` (the run uses `--no-table`, so read the outcome and `metadata.reviewerRoot` from the newest `packages/code-reviewer/evals/results/compare-*.json`)

#### Manual Verification:

- The dry-run on PR #226 exits 0 and the recorded summary is English, has no documentation finding and no mention, noted in `dry-run-results.md`
- The owner reads PR A, CI is green (`ai-review` included) and merges it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase 2 is cut from `origin/master` only after PR A is merged.

---

## Phase 2: Paid eval session: Japanese-input case and the sentence for all natural-language text (PR B)

### Overview

The prompt-facing items 8.1 and 8.3 in one paid session of at most 1.5 USD, with the 8.4 error sample from the reserve. Branch `s-24/reviewers-hardening/eval` from `origin/master` after PR A.

### Changes Required:

#### 1. The Japanese-input case

**File**: `packages/code-reviewer/evals/cases/non-english-input.yaml`

**Intent**: Reproduce the conditions of PR #222: a pull request written in Japanese must still get an English review. `old` (master) already carries the #226 sentence, so the case is a regression guard for it; it does not force a `### Not verified` section, so the widening to "Not verified" notes is not measured by it and `eval-results.md` says so.

**Contract**: One-item list like the other `files` cases: `metadata: { kind: bug, expect: fail }`, a Japanese `title` and `body`, a small `files` base and head with Japanese code comments and one planted logic bug (a streak counter that increases although the day was not checked off). Assertions: `javascript` `output.verdict === "fail"` and an `llm-rubric` (`transform: output.summary`) that requires the review to name the planted bug and to be written in English, with no Japanese prose outside quoted code. The case folder is excluded from the gate's diff and from Prettier already.

#### 2. The sentence for all natural-language text

**File**: `packages/code-reviewer/prompts/reviewer.ts`

**Intent**: Replace the sentence at line 45 so it covers every natural-language part of the review, including the `### Not verified` notes (finding of `ai-review` on #226).

**Contract**: One sentence in the same place, in the form "Write all natural-language text of the review in English, the summary, every finding, every rationale and the 'Not verified' notes, whatever language the diff, the title or the body is in." No other change to `REVIEWER_INSTRUCTIONS`; the verdict rule and the schema stay as they are.

#### 3. Documentation of the suite and the language rule

**File**: `README.md`, `packages/code-reviewer/README.md`, `packages/code-reviewer/evals/README.md`

**Intent**: Keep the written facts true after the 16th case and the new sentence.

**Contract**: "15 cases" becomes 16 at `README.md:465`, `packages/code-reviewer/README.md:19` and `:218`, and `evals/README.md:12`; the case breakdown (`evals/README.md:94-96`, `packages/code-reviewer/README.md:218`) names three seeded bugs. Two more hits of the criterion-2.4 grep are named here: `evals/README.md:81` ("one pass of the 15 cases … about 0.66 USD") is a historical measurement and is reworded as a measurement of "the earlier 15-case suite", and `packages/code-reviewer/README.md:214` (the Known-limits bullet, "on the 15 cases every case passed except pr-110") is updated together with the Language bullet. `context/foundation/lessons.md:213` also says "15 cases"; it is a lesson text outside the grep and stays. The "Language" bullet of `README.md` (line 520) and the Known-limits bullet of `packages/code-reviewer/README.md` state that the sentence covers all natural-language text and quote the result of this session, saying that the case guards the #226 sentence and that the "Not verified" widening is not measured by it.

#### 4. The paid session and its record

**File**: `context/changes/reviewers-hardening/eval-results.md`

**Intent**: Run the capped session by `lessons.md` and keep the numbers.

**Contract**: Before the first paid call, quote the estimate in the conversation and wait for the owner's go. Steps, each with its reported cost and the running sum: (a) the new case alone on `new` once, (b) `new` once on all 16 cases, (c) `old` once on every case `new` did not pass (`pr-110` is known to miss on both), (d) when the sum is at most 1.3 USD, the 8.4 sample on `new` with the error details on: `sql-injection` three times and `pr-111` once, otherwise record 8.4 as not measured (the estimate from the archived results is about 1.2 to 1.3 USD before the sample, so it is likely skipped). The file lists the steps with cost, the per-case table, the peak reasoning (`pr-103` below 24,576, no `length`), the 8.4 result and what was not measured, in the format of the archived `code-review-evals` results. Tick 8.1 and 8.3 in `open-items.md` §8; tick 8.4 only if the sample ran or a schema error occurred in the session (its details are then in the report), otherwise leave 8.4 open with the trigger "next schema error in an eval run".

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the parse of the new case: `npm run test:unit -- tests/unit/code-reviewer-evals.test.ts`
- Lint passes: `npm run lint`
- The eval configs validate: `npm run --prefix packages/code-reviewer/evals validate`
- No stale case count outside the archive: `grep -rn "15 cases" README.md packages/code-reviewer` prints nothing

#### Manual Verification:

- The owner gave the go after the quoted estimate, and the reported cost of the whole session is at most 1.5 USD in `eval-results.md`
- `new` passes the new case with an English summary and every case that passed on 2026-10-20, with `pr-110` as the known exception; no `finishReason: length` and `pr-103` reasoning below 24,576 tokens
- `old` was run only on the cases `new` missed, with the same number of runs, and a miss that `old` passes is re-run three times on both providers before it counts as a regression
- The owner reads PR B, CI is green (`ai-review` included) and merges it

---

## Testing Strategy

### Unit Tests:

- Provider: main-checkout resolution (main checkout, linked worktree, git failure fallback, absolute path), `errorDetail` (truncation, missing text, plain error).
- Report: the error-detail line under "Runs without an output".
- Dry-run checker: mention and link rejection, code spans ignored, template body accepted.
- The generic eval-case test covers the new case file (shape, one input form, a `javascript` assertion, `llm-rubric` transform).

### Integration Tests:

- None added. The `nul-hidden` run on `old` is the free end-to-end proof that `eval-old` resolves.

### Manual Testing Steps:

1. Run the dry-run on #226 and read the recorded summary.
2. Run the paid session step by step and read the report after each step.

## Performance Considerations

A longer sentence can push reasoning toward `DEFAULT_MAX_OUTPUT_TOKENS` on large diffs (`lessons.md`, "Reasoning tokens grow with the diff…"); `pr-103` and `pr-116-7d319c1` are the cases to watch (23,886 and 37,321 reasoning tokens on `pr-116-7d319c1` in 2026-10-20 runs, 539 s of the 600 s timeout once).

## Migration Notes

None: no schema, no migration, no app code. PR A and PR B touch `packages/code-reviewer/`, `scripts/`, `tests/unit/`, `.claude/review/` (only on a failed dry-run), `context/` and READMEs. A push to `master` that touches `packages/code-reviewer/` runs `ci`, `smoke`, `e2e`, `integration` and the gated `release`; the owner approves it, the deployed application does not change.

## References

- Roadmap: `context/foundation/roadmap.md`, S-24 and anchor MS-05; step list `context/foundation/open-items.md` §8
- Results of the previous session: `context/archive/2026-10-20-reviewer-output-language/eval-results.md`
- Rules: `context/foundation/lessons.md`, "Run the eval suite, old against new, before shipping a reviewer change", "Reasoning tokens grow with the diff and the instructions…", "Run all planning skills on one planning branch…"
- Code: `packages/code-reviewer/evals/provider.ts:27,281,308,366`, `packages/code-reviewer/evals/report.ts:49,228`, `scripts/claude-review-dry-run.mjs:107`, `packages/code-reviewer/prompts/reviewer.ts:45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Free tooling and the claude-review dry-run (PR A)

#### Automated

- [x] 1.1 Unit tests pass for the provider, the report and the dry-run checker — 4e78776
- [x] 1.2 Lint passes — 4e78776
- [x] 1.3 The eval configs validate — 4e78776
- [x] 1.4 The `old` provider resolves `eval-old` from a worktree on the `nul-hidden` case at no cost — 4e78776

#### Manual

- [x] 1.5 The dry-run on PR #226 exits 0 and its summary is English, with no documentation finding and no mention — 4e78776
- [x] 1.6 The owner reads PR A, CI is green and PR A is merged — de080b2

### Phase 2: Paid eval session: Japanese-input case and the sentence for all natural-language text (PR B)

#### Automated

- [x] 2.1 Unit tests pass, including the parse of the new case
- [x] 2.2 Lint passes
- [x] 2.3 The eval configs validate
- [x] 2.4 No stale "15 cases" count outside the archive

#### Manual

- [x] 2.5 The owner gave the go after the quoted estimate and the reported cost of the session is at most 1.5 USD
- [x] 2.6 `new` passes the new case and the cases that passed on 2026-10-20, with no `length` and `pr-103` reasoning below 24,576 tokens
- [x] 2.7 `old` was run only on the cases `new` missed and no regression is confirmed
- [ ] 2.8 The owner reads PR B, CI is green and PR B is merged
