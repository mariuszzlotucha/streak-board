/**
 * CLI: `git diff | npm run --silent review` (the same as
 * `git diff | npx tsx packages/code-reviewer/review.ts`). Reads the diff on
 * stdin and the optional PR title and body from `PR_TITLE` / `PR_BODY` (empty
 * means absent), and aborts the review after `DEFAULT_REVIEW_TIMEOUT_MS`.
 * stdout carries only the `ReviewResult` JSON, so it stays pipeable; every
 * other line goes to stderr.
 *
 * | Code | Meaning                                                                                                                  |
 * | ---- | ------------------------------------------------------------------------------------------------------------------------ |
 * | `0`  | Reviewed: JSON on stdout, usage line on stderr                                                                           |
 * | `1`  | Review error: API, network, timeout, missing key, `ReviewRunError`; the usage line is still printed for `ReviewRunError` |
 * | `2`  | No diff on stdin                                                                                                         |
 * | `3`  | Diff too large: the stdin byte cap or `DiffTooLargeError`                                                                |
 */
import type { FinishReason } from "ai";
import { DiffTooLargeError, reviewDiff, ReviewRunError, type ReviewRun } from "./agent";
import { DEFAULT_REVIEW_TIMEOUT_MS, resolveReviewerModel } from "./config";
import { loadEnv, readDiff } from "./utils";

loadEnv();

/** The run fields the usage line reports; a failed run may lack a finish reason. */
interface UsageLineRun extends Pick<ReviewRun, "model" | "usage" | "costUsd"> {
  finishReason?: FinishReason;
}

/** One stderr line with the model, finish reason, token counts and cost of a run. */
function formatUsageLine({ model, finishReason, usage, costUsd }: UsageLineRun): string {
  return [
    `model=${model}`,
    `finishReason=${finishReason ?? "unknown"}`,
    `input_tokens=${usage.inputTokens ?? "unknown"}`,
    `output_tokens=${usage.outputTokens ?? "unknown"}`,
    `total_tokens=${usage.totalTokens ?? "unknown"}`,
    // `null` means no step reported a cost, which is not the same as free.
    `cost_usd=${costUsd ?? "unknown"}`,
  ].join(" ");
}

/** The environment variable `name`, or `undefined` when it is unset, empty or whitespace only. */
function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() ? value : undefined;
}

/** Runs one review and returns the exit code (see the table above); `process.exitCode` lets stderr flush before exit. */
async function main(): Promise<number> {
  const read = await readDiff();
  if ("error" in read) return read.error === "too-large" ? 3 : 2;
  try {
    const run = await reviewDiff(read.diff, {
      model: resolveReviewerModel(),
      pullRequest: { title: optionalEnv("PR_TITLE"), body: optionalEnv("PR_BODY") },
      abortSignal: AbortSignal.timeout(DEFAULT_REVIEW_TIMEOUT_MS),
    });
    console.log(JSON.stringify(run.output, null, 2));
    console.error(formatUsageLine(run));
    return 0;
  } catch (error) {
    // A run without a valid result was still billed, so report what it consumed first.
    if (error instanceof ReviewRunError) console.error(formatUsageLine(error));
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    // The size check runs before any model call, so nothing was billed.
    return error instanceof DiffTooLargeError ? 3 : 1;
  }
}

process.exitCode = await main();
