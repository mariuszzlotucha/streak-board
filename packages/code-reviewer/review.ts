/**
 * CLI: `git diff | npx tsx packages/code-reviewer/review.ts`. Prints the
 * `ReviewResult` JSON on stdout (so it stays pipeable) and one usage/cost line
 * on stderr; exits 1 on missing input or a failed review.
 */
import type { FinishReason } from "ai";
import { reviewDiff, ReviewRunError, type ReviewRun } from "./agent";
import { resolveReviewerModel } from "./config";
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

/** Runs one review and returns the exit code; `process.exitCode` lets stderr flush before exit. */
async function main(): Promise<number> {
  const diff = await readDiff();
  if (diff === undefined) return 1;
  try {
    const run = await reviewDiff(diff, { model: resolveReviewerModel() });
    console.log(JSON.stringify(run.output, null, 2));
    console.error(formatUsageLine(run));
    return 0;
  } catch (error) {
    // A run without a valid result was still billed, so report what it consumed first.
    if (error instanceof ReviewRunError) console.error(formatUsageLine(error));
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main();
