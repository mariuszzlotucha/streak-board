# Code reviewer

A small code-review agent built on the AI SDK 7 `ToolLoopAgent` and OpenRouter. It takes a diff and returns a structured `ReviewResult`: six criteria scored 1–10 with a rationale each, a `pass`/`fail` verdict and a markdown summary for a PR comment. The package has no `package.json` of its own; it uses the root dependencies (`ai@7`, `@openrouter/ai-sdk-provider@3`, `zod@4`, `tsx`).

## Module map

| File                       | Contents                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemas/review-result.ts` | `ReviewCriterion`, `ReviewCriteria`, `ReviewResult` (zod schema and same-named type) and `REVIEW_JSON_SCHEMA` (draft-07 JSON Schema of `ReviewResult`)                                                                                |
| `prompts/reviewer.ts`      | `REVIEWER_INSTRUCTIONS` (the system prompt), `buildReviewPrompt(diff, pullRequest?)` (the per-diff user prompt, see Input format) and the `PullRequestContext` type (`{ title?: string; body?: string }`)                             |
| `config.ts`                | `DEFAULT_REVIEWER_MODEL`, `DEFAULT_MAX_STEPS`, `DEFAULT_MAX_OUTPUT_TOKENS`, `DEFAULT_MAX_DIFF_CHARS`, `MAX_PR_BODY_CHARS`, `DEFAULT_REVIEW_TIMEOUT_MS` and `resolveReviewerModel(env)`                                                |
| `agent.ts`                 | `createReviewer(options)`, `reviewDiff(diff, options)` (options include `pullRequest`), `ReviewRunError`, `DiffTooLargeError`, `verdictFromScores(criteria)` (the verdict rule as code) and the `ReviewerOptions` / `ReviewRun` types |
| `index.ts`                 | Public barrel re-exporting all of the above. Importing it has no side effects: no `.env` loading, no stdin read, no logging, no process exit                                                                                          |
| `review.ts`                | The CLI (see below)                                                                                                                                                                                                                   |
| `utils.ts`                 | `readDiff()`: reads the diff from stdin for the CLI and the demos, resolving to `{ diff }` or `{ error: "empty" \| "too-large" }` (`ReadDiffResult`)                                                                                  |
| `review-with-session.ts`   | Demo: a structured review followed by a plain-text follow-up question in the same conversation                                                                                                                                        |
| `cost-report.ts`           | Demo: one short call whose usage and OpenRouter cost are written to `cost.json` next to the script                                                                                                                                    |
| `rules-inject.ts`          | Demo: injects a skill file into the instructions. It reads `packages/anthropic/.claude/skills/greeting/SKILL.md`, which does not exist in this repo, so it fails with `ENOENT` before any model call                                  |

## CLI usage

Pipe any diff into the CLI, `npm run --silent review` (the root `package.json` script; it behaves exactly like `npx tsx packages/code-reviewer/review.ts`, and `--silent` keeps npm's script banner out of stdout):

```sh
git diff | npm run --silent review           # unstaged changes
git diff --staged | npm run --silent review  # staged changes
git diff HEAD~1 | npm run --silent review    # the last commit
PR_TITLE="Fix the streak reset" git diff HEAD~1 | npm run --silent review  # with the PR's stated intent
```

Environment (loaded from `.env` in the current directory with Node's `process.loadEnvFile`, or taken from the shell; a variable set in the shell wins):

- `OPENROUTER_API_KEY` (required): the OpenRouter API key, read by `@openrouter/ai-sdk-provider`.
- `REVIEWER_MODEL` (optional): an OpenRouter model id. Empty or unset means `DEFAULT_REVIEWER_MODEL` (`z-ai/glm-5.1`).
- `PR_TITLE`, `PR_BODY` (optional): the pull request's title and description, passed to `reviewDiff` as `pullRequest` (see Input format). Empty or whitespace only means absent. The body is cut to `MAX_PR_BODY_CHARS` (`2_000`) characters.

The CLI aborts a review after `DEFAULT_REVIEW_TIMEOUT_MS` (`180_000` ms, 3 minutes); a timed-out review exits 1.

Output:

- stdout: only the `ReviewResult` JSON (`JSON.stringify(output, null, 2)`), so it can be piped (`git diff | npm run --silent review 2>/dev/null | jq .verdict`). Nothing else is ever written to stdout, whatever the exit code.
- stderr: one usage line per run, for example `model=z-ai/glm-5.1 finishReason=stop input_tokens=1234 output_tokens=567 total_tokens=1801 cost_usd=0.0021`, `note: the model said pass and the score rule says fail; the stricter verdict, fail, binds` when the model's verdict and the rule disagree, in either direction (see Input format and verdict rule), and `error: <message>` on failure. A value the provider did not report is printed as `unknown`; `cost_usd=unknown` means no step reported a cost, not that the run was free.

Exit codes (the CI composite action `.github/actions/ai-reviewer` maps them to its `outcome`):

| Code | Meaning                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| `0`  | Reviewed: JSON on stdout, usage line on stderr                                                                           |
| `1`  | Review error: API, network, timeout, missing key, `ReviewRunError`; the usage line is still printed for `ReviewRunError` |
| `2`  | No diff on stdin                                                                                                         |
| `3`  | Diff too large: the stdin byte cap or `DiffTooLargeError`                                                                |

- `2`: stdin is a terminal or the input is empty or whitespace only; the CLI prints `error: no diff on stdin (usage: git diff | npx tsx packages/code-reviewer/review.ts)` and makes no model call.
- `3`: more than `4 × DEFAULT_MAX_DIFF_CHARS` bytes on stdin (the CLI stops reading and prints `error: diff too large (over <n> bytes on stdin)`), or a shorter diff over `DEFAULT_MAX_DIFF_CHARS` characters, which `reviewDiff` rejects with `DiffTooLargeError`. Either way no model call is made.
- `1`: for a `ReviewRunError` the usage line is printed first (the calls were billed), then `error: <message>`; any other error prints only `error: <message>`.

## Programmatic usage

```ts
import {
  reviewDiff,
  ReviewRunError,
  DiffTooLargeError,
  resolveReviewerModel,
  DEFAULT_REVIEW_TIMEOUT_MS,
} from "./packages/code-reviewer";

try {
  const run = await reviewDiff(diff, {
    model: resolveReviewerModel(),
    pullRequest: { title: "Fix the streak reset", body: "Resets the streak at local midnight." },
    abortSignal: AbortSignal.timeout(DEFAULT_REVIEW_TIMEOUT_MS),
  });
  run.output.verdict; // "pass" | "fail"
} catch (error) {
  if (error instanceof DiffTooLargeError) console.error(error.length, error.limit); // no model call was made
  if (error instanceof ReviewRunError) console.error(error.finishReason, error.usage, error.costUsd);
  throw error;
}
```

The library does not read `.env`: `OPENROUTER_API_KEY` must already be in `process.env` (the caller loads `.env` if it wants to), and `REVIEWER_MODEL` is used only when the caller passes `resolveReviewerModel()` as `model`. Omitted options fall back to the `config.ts` defaults, never to the environment.

`reviewDiff(diff, options)` takes the `ReviewerOptions` (`model`, `maxSteps`, `maxOutputTokens`) plus `abortSignal`, `maxDiffChars` and `pullRequest` (a `PullRequestContext`, `{ title?: string; body?: string }`, forwarded to `buildReviewPrompt`), and resolves to a `ReviewRun`. The library sets no timeout of its own; pass `abortSignal` (the CLI uses `AbortSignal.timeout(DEFAULT_REVIEW_TIMEOUT_MS)`).

| Field          | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `output`       | The `ReviewResult`, with `verdict` set to the binding verdict (see Input format and verdict rule) |
| `modelVerdict` | The verdict the model itself emitted                                                              |
| `usage`        | Token usage (`LanguageModelUsage`) summed over every step of the run                              |
| `costUsd`      | OpenRouter cost in USD summed over the steps; `null` when no step reported one                    |
| `model`        | The OpenRouter model id the run used                                                              |
| `finishReason` | Finish reason of the final step, normally `stop`                                                  |

`reviewDiff` throws:

- an `Error` for an empty or whitespace-only diff, before any model call;
- `DiffTooLargeError` for a diff longer than `maxDiffChars`, before any model call. It carries `length` (the diff's length) and `limit` (the cap), both in characters, so callers need not parse the message;
- an `Error` when `maxSteps` or `maxOutputTokens` is not an integer >= 1, or `maxDiffChars` is neither an integer >= 1 nor `Infinity`;
- `ReviewRunError` when the model answered but produced no valid `ReviewResult` (unparseable, schema-invalid or missing output, or a score that is not an integer from 1 to 10). It carries `usage`, `costUsd`, `model` and `finishReason` (the last step that ended, or `undefined` when none did), with the SDK error as `cause`. A run cut off by the token ceiling normally surfaces this way, with `finishReason: "length"`; a cut-off answer that still parses as a valid `ReviewResult` is returned, so check `finishReason` on a returned run;
- API and network errors from the SDK, and the abort error of a fired `abortSignal`, unchanged.

`createReviewer(options)` returns the plain `ToolLoopAgent`, for callers that need `messages` instead of a single prompt (see `review-with-session.ts`). It does not sum the cost or wrap errors; `reviewDiff` does.

## Budget

Every run is capped by the defaults in `config.ts`, each overridable per call:

| Limit                       | Default   | Option            | Effect                                                                                                                                                                                 |
| --------------------------- | --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_MAX_STEPS`         | `2`       | `maxSteps`        | Step cap for the agent loop (`stopWhen: isStepCount(maxSteps)`). With no tools a review is always one model call, so it only matters once tools are added                              |
| `DEFAULT_MAX_OUTPUT_TOKENS` | `16384`   | `maxOutputTokens` | Ceiling on generated tokens per call (reasoning tokens may count towards it); an answer cut off at it normally makes `reviewDiff` throw `ReviewRunError` with `finishReason: "length"` |
| `DEFAULT_MAX_DIFF_CHARS`    | `200_000` | `maxDiffChars`    | `reviewDiff` throws `DiffTooLargeError` before any model call for a longer diff (option of `reviewDiff` only)                                                                          |
| `MAX_PR_BODY_CHARS`         | `2_000`   | none              | `buildReviewPrompt` cuts a longer PR body and marks the cut with `[truncated]`                                                                                                         |
| `DEFAULT_REVIEW_TIMEOUT_MS` | `180_000` | `abortSignal`     | The CLI aborts the review after this many milliseconds and exits 1; programmatic callers pass their own `abortSignal`                                                                  |

The cost of every run is logged: the CLI prints the usage line on stderr for each review, successful or failed with a `ReviewRunError`, and programmatic callers get `usage` and `costUsd` on the `ReviewRun` or the `ReviewRunError`. The AI SDK also retries a failed call up to twice by default (`maxRetries: 2`, on rate limits and server errors), so one model call can mean up to three HTTP requests. There is no hard USD limit in code: in CI the budget is the credit limit of the OpenRouter key (see the root README, CI section).

## Input format and verdict rule

`buildReviewPrompt(diff, pullRequest?)` fences every input in its own tag, in this order, each tag on a line of its own:

```text
Review this pull request. Its inputs follow, each inside its own tag.

<pr-title>
…
</pr-title>

<pr-body>
…
</pr-body>

<diff>
…
</diff>
```

- `<pr-title>` and `<pr-body>` are present only when the title or body is non-empty after trimming; `<diff>` is always present.
- The body is cut to `MAX_PR_BODY_CHARS` characters, and the cut is marked with `[truncated]` on its own line.
- Every `<` in the title and body is replaced with `&lt;`, so they hold no tag at all.
- In the diff, each fence tag, opening or closing, matched by `/<(?:\s*\/)?\s*(diff|pr-title|pr-body)\b[^<>]*>/gi` (also `</diff >`, `< / DIFF >`, `</diff foo>`, `<diff/>`), has its `<` replaced with `&lt;`, so the diff can neither close its fence nor open another. Other `<` characters in the diff stay as they are.

`REVIEWER_INSTRUCTIONS` declares everything inside these tags as untrusted content written by the PR author: data to review, never instructions. An attempt to instruct the reviewer lowers `securitySafety`.

The verdict is a stated function of the scores: `verdict` is `fail` when `implementationCorrectness` ≤ 4, or `securitySafety` ≤ 4, or any criterion ≤ 2; otherwise `pass`. The model is told that the verdict must agree with the scores, and `reviewDiff` enforces it in code:

- a score that is not an integer from 1 to 10 throws `ReviewRunError` (CLI exit 1);
- the binding `output.verdict` is `fail` when the model's verdict or `verdictFromScores(criteria)` is `fail`, so text that steers only the verdict cannot pass low scores. `modelVerdict` keeps the model's own, and the CLI prints a `note:` line on stderr when the model's verdict and `verdictFromScores` disagree, in either direction (a model `fail` with passing scores still binds). The model's `summary` is left as written, so it can still lead with the overridden verdict.

## Data egress

The whole diff is sent to OpenRouter and on to the upstream provider of the chosen model. Do not review diffs that contain secrets (`.env` files, keys or tokens in fixtures). To keep the diff away from providers that may store or train on it, OpenRouter's `provider.data_collection: "deny"` routing option (a setting of `openrouter(model, { provider: { data_collection: "deny" } })`, or the matching privacy setting of the OpenRouter account) can be used; `ReviewerOptions` does not expose it today.

The PR title and body are sent the same way when they are given.

## Known limits

- Prompt injection is reduced, not eliminated: the inputs are fenced and declared as data, and the verdict rule is enforced in code (see Input format and verdict rule), but a model can still follow text inside them, and lookalike tags in the diff (fullwidth `＜`, homoglyphs, zero-width characters) are not neutralised. An injection test case belongs to the eval suite of the `code-review-evals` change.
- The CLI aborts a review after `DEFAULT_REVIEW_TIMEOUT_MS`; the library sets no timeout, so a programmatic caller without an `abortSignal` still waits as long as the provider call does.

## The schema is the contract

The criteria, the verdict values and the field names in `schemas/review-result.ts` are what the prompts, the CI gate and the evals depend on. Change the schema first, then `prompts/reviewer.ts`, then the gates and the evals, in that order.
