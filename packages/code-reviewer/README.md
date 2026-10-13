# Code reviewer

A small code-review agent built on the AI SDK 7 `ToolLoopAgent` and OpenRouter. It takes a diff and returns a structured `ReviewResult`: six criteria scored 1–10 with a rationale each, a `pass`/`fail` verdict and a markdown summary for a PR comment. The package has no `package.json` of its own; it uses the root dependencies (`ai@7`, `@openrouter/ai-sdk-provider@3`, `zod@4`, `tsx`).

## Module map

| File                       | Contents                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemas/review-result.ts` | `ReviewCriterion`, `ReviewCriteria`, `ReviewResult` (zod schema and same-named type) and `REVIEW_JSON_SCHEMA` (draft-07 JSON Schema of `ReviewResult`)                                               |
| `prompts/reviewer.ts`      | `REVIEWER_INSTRUCTIONS` (the system prompt) and `buildReviewPrompt(diff)` (the per-diff user prompt)                                                                                                 |
| `config.ts`                | `DEFAULT_REVIEWER_MODEL`, `DEFAULT_MAX_STEPS`, `DEFAULT_MAX_OUTPUT_TOKENS`, `DEFAULT_MAX_DIFF_CHARS` and `resolveReviewerModel(env)`                                                                 |
| `agent.ts`                 | `createReviewer(options)`, `reviewDiff(diff, options)`, `ReviewRunError` and the `ReviewerOptions` / `ReviewRun` types                                                                               |
| `index.ts`                 | Public barrel re-exporting all of the above. Importing it has no side effects: no `.env` loading, no stdin read, no logging, no process exit                                                         |
| `review.ts`                | The CLI (see below)                                                                                                                                                                                  |
| `utils.ts`                 | `readDiff()`: reads the diff from stdin for the CLI and the demos                                                                                                                                    |
| `review-with-session.ts`   | Demo: a structured review followed by a plain-text follow-up question in the same conversation                                                                                                       |
| `cost-report.ts`           | Demo: one short call whose usage and OpenRouter cost are written to `cost.json` next to the script                                                                                                   |
| `rules-inject.ts`          | Demo: injects a skill file into the instructions. It reads `packages/anthropic/.claude/skills/greeting/SKILL.md`, which does not exist in this repo, so it fails with `ENOENT` before any model call |

## CLI usage

Pipe any diff into the CLI:

```sh
git diff | npx tsx packages/code-reviewer/review.ts           # unstaged changes
git diff --staged | npx tsx packages/code-reviewer/review.ts  # staged changes
git diff HEAD~1 | npx tsx packages/code-reviewer/review.ts    # the last commit
```

Environment (loaded from `.env` in the current directory by `dotenv`, or taken from the shell):

- `OPENROUTER_API_KEY` (required): the OpenRouter API key, read by `@openrouter/ai-sdk-provider`.
- `REVIEWER_MODEL` (optional): an OpenRouter model id. Empty or unset means `DEFAULT_REVIEWER_MODEL` (`z-ai/glm-5.1`).

Output:

- stdout: only the `ReviewResult` JSON (`JSON.stringify(output, null, 2)`), so it can be piped (`git diff | npx tsx packages/code-reviewer/review.ts 2>/dev/null | jq .verdict`).
- stderr: one usage line per run, for example `model=z-ai/glm-5.1 finishReason=stop input_tokens=1234 output_tokens=567 total_tokens=1801 cost_usd=0.0021`. A value the provider did not report is printed as `unknown`; `cost_usd=unknown` means no step reported a cost, not that the run was free.

Exit codes:

- `0`: the review succeeded.
- `1`: no diff on stdin (stdin is a terminal or the input is empty or whitespace only); the CLI prints `error: no diff on stdin (usage: git diff | npx tsx packages/code-reviewer/review.ts)` and makes no model call.
- `1`: the review failed. For a `ReviewRunError` the usage line is printed first (the calls were billed), then `error: <message>`; any other error (API or network failure, a diff over the size limit) prints only `error: <message>`.

## Programmatic usage

```ts
import { reviewDiff, ReviewRunError, resolveReviewerModel } from "./packages/code-reviewer";

try {
  const run = await reviewDiff(diff, { model: resolveReviewerModel(), abortSignal: AbortSignal.timeout(120_000) });
  run.output.verdict; // "pass" | "fail"
} catch (error) {
  if (error instanceof ReviewRunError) console.error(error.finishReason, error.usage, error.costUsd);
  throw error;
}
```

The library does not read `.env`: `OPENROUTER_API_KEY` must already be in `process.env` (the caller loads `dotenv` if it wants to), and `REVIEWER_MODEL` is used only when the caller passes `resolveReviewerModel()` as `model`. Omitted options fall back to the `config.ts` defaults, never to the environment.

`reviewDiff(diff, options)` takes the `ReviewerOptions` (`model`, `maxSteps`, `maxOutputTokens`) plus `abortSignal` and `maxDiffChars`, and resolves to a `ReviewRun`:

| Field          | Meaning                                                                        |
| -------------- | ------------------------------------------------------------------------------ |
| `output`       | The `ReviewResult`                                                             |
| `usage`        | Token usage (`LanguageModelUsage`) summed over every step of the run           |
| `costUsd`      | OpenRouter cost in USD summed over the steps; `null` when no step reported one |
| `model`        | The OpenRouter model id the run used                                           |
| `finishReason` | Finish reason of the final step                                                |

`reviewDiff` throws:

- an `Error` for an empty or whitespace-only diff, or one longer than `maxDiffChars`, before any model call;
- an `Error` when `maxSteps` is not an integer >= 1;
- `ReviewRunError` when the model answered but produced no valid `ReviewResult` (unparseable, schema-invalid or missing output). It carries `usage`, `costUsd`, `model` and `finishReason` (the last step that ended, or `undefined` when none did), with the SDK error as `cause`. A run cut off by the token ceiling surfaces this way, with `finishReason: "length"`, never as a returned `ReviewRun`;
- API and network errors from the SDK, unchanged.

`createReviewer(options)` returns the plain `ToolLoopAgent`, for callers that need `messages` instead of a single prompt (see `review-with-session.ts`). It does not sum the cost or wrap errors; `reviewDiff` does.

## Budget

Every run is capped by the defaults in `config.ts`, each overridable per call:

| Limit                       | Default   | Option            | Effect                                                                                                                                                           |
| --------------------------- | --------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_MAX_STEPS`         | `2`       | `maxSteps`        | At most this many model calls per review (`stopWhen: isStepCount(maxSteps)`)                                                                                     |
| `DEFAULT_MAX_OUTPUT_TOKENS` | `16384`   | `maxOutputTokens` | Ceiling on generated tokens per call, reasoning tokens included; an answer cut off at it makes `reviewDiff` throw `ReviewRunError` with `finishReason: "length"` |
| `DEFAULT_MAX_DIFF_CHARS`    | `200_000` | `maxDiffChars`    | `reviewDiff` throws before any model call for a longer diff (option of `reviewDiff` only)                                                                        |

The cost of every run is logged: the CLI prints the usage line on stderr for each review, successful or failed with a `ReviewRunError`, and programmatic callers get `usage` and `costUsd` on the `ReviewRun` or the `ReviewRunError`. There is no hard USD limit; a cost gate belongs to the CI gate and the evals.

## Data egress

The whole diff is sent to OpenRouter and on to the upstream provider of the chosen model. Do not review diffs that contain secrets (`.env` files, keys or tokens in fixtures). To keep the diff away from providers that may store or train on it, OpenRouter's `provider.data_collection: "deny"` routing option (a setting of `openrouter(model, { provider: { data_collection: "deny" } })`, or the matching privacy setting of the OpenRouter account) can be used; `ReviewerOptions` does not expose it today.

## Known open items

- No default timeout: a hanging provider call waits indefinitely. Pass an `abortSignal` (for example `AbortSignal.timeout(...)`) to `reviewDiff`.
- The diff is not delimited from the instructions: `buildReviewPrompt` appends it to the prompt as is, so text inside the diff can try to steer the reviewer (prompt injection). This must be addressed before a CI gate trusts `verdict`.

## The schema is the contract

The criteria, the verdict values and the field names in `schemas/review-result.ts` are what the prompts, the CI gate and the evals depend on. Change the schema first, then `prompts/reviewer.ts`, then the gates and the evals, in that order.
