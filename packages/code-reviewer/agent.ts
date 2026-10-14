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
import { REVIEWER_INSTRUCTIONS, buildReviewPrompt, type PullRequestContext } from "./prompts/reviewer";
import { ReviewResult, type ReviewCriteria } from "./schemas/review-result";

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
  /** The model's `ReviewResult`, with `verdict` replaced by the binding one (see `reviewDiff`). */
  output: ReviewResult;
  /** The verdict the model itself emitted; differs from `output.verdict` when the score rule overrode it. */
  modelVerdict: ReviewResult["verdict"];
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
    run: Omit<ReviewRun, "output" | "modelVerdict" | "finishReason"> & { finishReason?: FinishReason },
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

/**
 * Thrown by `reviewDiff`, before any model call, when the diff is longer than
 * `maxDiffChars`. `length` is the diff's length and `limit` the cap, both in
 * characters, so a caller can tell "too large" from other failures without
 * parsing the message.
 */
export class DiffTooLargeError extends Error {
  readonly length: number;
  readonly limit: number;

  constructor(length: number, limit: number) {
    super(`reviewDiff: the diff is ${length} characters, over the ${limit} limit (maxDiffChars)`);
    this.name = "DiffTooLargeError";
    this.length = length;
    this.limit = limit;
  }
}

/**
 * The written verdict rule of `REVIEWER_INSTRUCTIONS` as code: `"fail"` when
 * `implementationCorrectness` or `securitySafety` is 4 or lower, or any
 * criterion is 2 or lower; otherwise `"pass"`. Keep the two in step.
 */
export function verdictFromScores(criteria: ReviewCriteria): ReviewResult["verdict"] {
  const scores = Object.values(criteria).map((criterion) => criterion.score);
  if (criteria.implementationCorrectness.score <= 4 || criteria.securitySafety.score <= 4) return "fail";
  return scores.some((score) => score <= 2) ? "fail" : "pass";
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
 * Reviews one diff, with the PR's title and body as optional context
 * (`pullRequest`), and returns the verdict with its usage and cost. Before any
 * model call it throws an `Error` for an empty or whitespace-only diff or an
 * invalid `maxDiffChars`, and `DiffTooLargeError` for a diff longer than
 * `maxDiffChars` (default `DEFAULT_MAX_DIFF_CHARS`). It throws `ReviewRunError`
 * when the model produced no valid `ReviewResult`, including a score that is not
 * an integer from 1 to 10; other SDK errors (API and network failures, an
 * aborted signal) propagate unchanged. The returned `output.verdict` is `"fail"`
 * when the model or `verdictFromScores` says so; `modelVerdict` keeps the
 * model's own.
 */
export async function reviewDiff(
  diff: string,
  options: ReviewerOptions & {
    abortSignal?: AbortSignal;
    maxDiffChars?: number;
    pullRequest?: PullRequestContext;
  } = {},
): Promise<ReviewRun> {
  if (diff.trim() === "") throw new Error("reviewDiff: the diff is empty");
  const { abortSignal, maxDiffChars = DEFAULT_MAX_DIFF_CHARS, pullRequest, ...reviewerOptions } = options;
  // `diff.length > NaN` is always false, so an unchecked NaN would disable the cap.
  if (maxDiffChars !== Infinity && (!Number.isInteger(maxDiffChars) || maxDiffChars < 1)) {
    throw new Error(`reviewDiff: maxDiffChars must be an integer >= 1 or Infinity, got ${maxDiffChars}`);
  }
  if (diff.length > maxDiffChars) throw new DiffTooLargeError(diff.length, maxDiffChars);

  const resolved = resolveOptions(reviewerOptions);
  const { model } = resolved;
  // Steps are collected as they end, so a run whose final answer fails to parse
  // still reports what it consumed (the SDK throws before returning a result).
  const steps: ReviewStep[] = [];
  try {
    const result = await createReviewer(resolved).generate({
      prompt: buildReviewPrompt(diff, pullRequest),
      abortSignal,
      onStepEnd: (step) => void steps.push(step),
    });
    const run = {
      usage: result.usage,
      costUsd: sumStepCosts(result.steps),
      model,
      finishReason: result.finalStep.finishReason,
    };
    // The schema's bare `z.number()` cannot hold the 1-10 integer bounds (see `ReviewCriterion`).
    for (const [name, { score }] of Object.entries(result.output.criteria)) {
      if (!Number.isInteger(score) || score < 1 || score > 10) {
        throw new ReviewRunError(`reviewDiff: the ${name} score ${score} is not an integer from 1 to 10`, run);
      }
    }
    // The stricter verdict binds, so text that steers only `verdict` cannot pass low scores.
    const modelVerdict = result.output.verdict;
    const verdict = modelVerdict === "fail" || verdictFromScores(result.output.criteria) === "fail" ? "fail" : "pass";
    return { output: { ...result.output, verdict }, modelVerdict, ...run };
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
