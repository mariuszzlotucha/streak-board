import {
  ToolLoopAgent,
  Output,
  isStepCount,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  type FinishReason,
  type LanguageModelUsage,
} from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { DEFAULT_MAX_DIFF_CHARS, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_MAX_STEPS, DEFAULT_REVIEWER_MODEL } from "./config";
import { REVIEWER_INSTRUCTIONS, buildReviewPrompt } from "./prompts/reviewer";
import { ReviewResult } from "./schemas/review-result";

/**
 * Settings for one reviewer configuration. Omitted fields fall back to the
 * defaults in `config.ts`, never to the environment.
 */
export interface ReviewerOptions {
  /** OpenRouter model id. */
  model?: string;
  /** Upper bound on model calls per review. */
  maxSteps?: number;
  /** Per-call ceiling on generated tokens. */
  maxOutputTokens?: number;
}

/** The verdict of one review together with what it cost. */
export interface ReviewRun {
  output: ReviewResult;
  /** Token usage summed over every step of the run. */
  usage: LanguageModelUsage;
  /** OpenRouter cost in USD summed over the steps; `null` when no step reported one. */
  costUsd: number | null;
  /** The OpenRouter model id the run used. */
  model: string;
  /**
   * Finish reason of the final step, normally `"stop"`. An answer cut off by the
   * token ceiling is normally invalid JSON and throws `ReviewRunError` with
   * `finishReason: "length"`; a cut-off answer that still parses is returned,
   * so check this field.
   */
  finishReason: FinishReason;
}

/**
 * Thrown by `reviewDiff` when the model answered but produced no valid
 * `ReviewResult` (unparseable, schema-invalid or missing output, e.g. cut off
 * by the token ceiling). It carries what the run consumed, since those calls
 * were billed; the SDK error stays as `cause`. API and network errors are not
 * wrapped.
 */
export class ReviewRunError extends Error {
  readonly usage: LanguageModelUsage;
  readonly costUsd: number | null;
  readonly model: string;
  /** Finish reason of the last step that ended; `undefined` when none did. */
  readonly finishReason: FinishReason | undefined;

  constructor(
    message: string,
    run: Omit<ReviewRun, "output" | "finishReason"> & { finishReason?: FinishReason },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReviewRunError";
    this.usage = run.usage;
    this.costUsd = run.costUsd;
    this.model = run.model;
    this.finishReason = run.finishReason;
  }
}

/** The parts of a step result the run totals are computed from. */
interface ReviewStep {
  usage: LanguageModelUsage;
  providerMetadata: unknown;
  finishReason: FinishReason;
}

/**
 * Builds the structured-output reviewer. Returns the plain `ToolLoopAgent`, so
 * callers can pass `messages` (e.g. a multi-turn session) instead of a prompt.
 */
export function createReviewer(options: ReviewerOptions = {}) {
  const { model, maxSteps, maxOutputTokens } = resolveOptions(options);
  return new ToolLoopAgent({
    // `usage.include` makes OpenRouter report the per-step cost in providerMetadata.
    model: openrouter(model, { usage: { include: true } }),
    instructions: REVIEWER_INSTRUCTIONS,
    tools: {},
    output: Output.object({ schema: ReviewResult }),
    stopWhen: isStepCount(maxSteps),
    maxOutputTokens,
  });
}

/**
 * Reviews one diff and returns the verdict with its usage and cost. Throws for
 * an empty or whitespace-only diff, one longer than `maxDiffChars` (default
 * `DEFAULT_MAX_DIFF_CHARS`) or an invalid `maxDiffChars`, before any model call, and `ReviewRunError`
 * when the model produced no valid `ReviewResult`; other SDK errors (API and
 * network failures) propagate unchanged.
 */
export async function reviewDiff(
  diff: string,
  options: ReviewerOptions & { abortSignal?: AbortSignal; maxDiffChars?: number } = {},
): Promise<ReviewRun> {
  if (diff.trim() === "") throw new Error("reviewDiff: the diff is empty");
  const { abortSignal, maxDiffChars = DEFAULT_MAX_DIFF_CHARS, ...reviewerOptions } = options;
  // `diff.length > NaN` is always false, so an unchecked NaN would disable the cap.
  if (maxDiffChars !== Infinity && (!Number.isInteger(maxDiffChars) || maxDiffChars < 1)) {
    throw new Error(`reviewDiff: maxDiffChars must be an integer >= 1 or Infinity, got ${maxDiffChars}`);
  }
  if (diff.length > maxDiffChars) {
    throw new Error(`reviewDiff: the diff is ${diff.length} characters, over the ${maxDiffChars} limit (maxDiffChars)`);
  }

  const resolved = resolveOptions(reviewerOptions);
  const { model } = resolved;
  // Steps are collected as they end, so a run whose final answer fails to parse
  // still reports what it consumed (the SDK throws before returning a result).
  const steps: ReviewStep[] = [];
  try {
    const result = await createReviewer(resolved).generate({
      prompt: buildReviewPrompt(diff),
      abortSignal,
      onStepEnd: (step) => void steps.push(step),
    });
    return {
      output: result.output,
      usage: result.usage,
      costUsd: sumStepCosts(result.steps),
      model,
      finishReason: result.finalStep.finishReason,
    };
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error) && !NoOutputGeneratedError.isInstance(error)) throw error;
    throw new ReviewRunError(
      error.message,
      { usage: sumStepUsage(steps), costUsd: sumStepCosts(steps), model, finishReason: steps.at(-1)?.finishReason },
      { cause: error },
    );
  }
}

/**
 * Applies the config defaults to `options`; `null` from an untyped caller counts
 * as unset, like an empty or whitespace-only model id. `maxSteps` must be an
 * integer >= 1, since `isStepCount` compares exactly and any other value would
 * never stop the loop once the agent has tools (with `tools: {}` a review is a
 * single model call). `maxOutputTokens` must be an integer >= 1 so the ceiling
 * cannot be dropped.
 */
function resolveOptions(options: ReviewerOptions): Required<ReviewerOptions> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new Error(`createReviewer: maxSteps must be an integer >= 1, got ${maxSteps}`);
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new Error(`createReviewer: maxOutputTokens must be an integer >= 1, got ${maxOutputTokens}`);
  }
  const model = options.model?.trim();
  // An empty id counts as unset, so a destructuring default or `??` is not enough.
  if (model) return { model, maxSteps, maxOutputTokens };
  return { model: DEFAULT_REVIEWER_MODEL, maxSteps, maxOutputTokens };
}

/**
 * Sums `providerMetadata.openrouter.usage.cost` over the steps. Returns `null`
 * when no step reports a cost, so an unknown cost is not mistaken for a free one.
 */
function sumStepCosts(steps: readonly { providerMetadata: unknown }[]): number | null {
  let total: number | null = null;
  for (const step of steps) {
    const metadata = step.providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined;
    const cost = metadata?.openrouter?.usage?.cost;
    if (typeof cost === "number") total = (total ?? 0) + cost;
  }
  return total;
}

/**
 * Sums token usage over the steps, field by field; a field stays `undefined` when
 * no step reports it (`null` counts as unreported, as in the SDK's own sum).
 */
function sumStepUsage(steps: readonly ReviewStep[]): LanguageModelUsage {
  const add = (a: number | undefined, b: number | undefined) =>
    a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
  const total: LanguageModelUsage = {
    inputTokens: undefined,
    inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
    outputTokens: undefined,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    totalTokens: undefined,
  };
  for (const { usage } of steps) {
    total.inputTokens = add(total.inputTokens, usage.inputTokens);
    total.inputTokenDetails.noCacheTokens = add(
      total.inputTokenDetails.noCacheTokens,
      usage.inputTokenDetails.noCacheTokens,
    );
    total.inputTokenDetails.cacheReadTokens = add(
      total.inputTokenDetails.cacheReadTokens,
      usage.inputTokenDetails.cacheReadTokens,
    );
    total.inputTokenDetails.cacheWriteTokens = add(
      total.inputTokenDetails.cacheWriteTokens,
      usage.inputTokenDetails.cacheWriteTokens,
    );
    total.outputTokens = add(total.outputTokens, usage.outputTokens);
    total.outputTokenDetails.textTokens = add(total.outputTokenDetails.textTokens, usage.outputTokenDetails.textTokens);
    total.outputTokenDetails.reasoningTokens = add(
      total.outputTokenDetails.reasoningTokens,
      usage.outputTokenDetails.reasoningTokens,
    );
    total.totalTokens = add(total.totalTokens, usage.totalTokens);
  }
  return total;
}
