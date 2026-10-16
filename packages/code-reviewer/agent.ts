import {
  ToolLoopAgent,
  Output,
  isStepCount,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  type FinishReason,
  type LanguageModelUsage,
  type ToolSet,
} from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import {
  BINARY_EXTENSIONS,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_STEPS,
  DEFAULT_REVIEWER_MODEL,
  EVIDENCE_PHASE_MS,
  MAX_DIFF_CHARS_FOR_TOOLS,
  MAX_TOOL_BUDGET_CHARS,
  MAX_TOOL_CALLS,
} from "./config";
import {
  REVIEWER_INSTRUCTIONS,
  buildReviewPrompt,
  repoToolsInstructions,
  type PullRequestContext,
} from "./prompts/reviewer";
import { ReviewResult, type ReviewCriteria } from "./schemas/review-result";
import { createRepoTools, listChangedFiles, type RepoContext, type ToolCallRecord } from "./tools";

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
  /** Every repo-tool call of the run, in order; empty without `repo`. */
  toolCalls: ToolCallRecord[];
  /** `true` when `repo` was given but the diff was over `maxDiffCharsForTools`, so the review ran without the tools. */
  toolsSkipped: boolean;
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
 * by the token ceiling), or when any error (an API failure, the abort signal)
 * ends a run after at least one step ended or one repo tool ran. It carries
 * what the run consumed, since those calls were billed; the original error
 * stays as `cause`. An error before any step ended is not wrapped.
 */
export class ReviewRunError extends Error {
  readonly usage: LanguageModelUsage;
  readonly costUsd: number | null;
  readonly model: string;
  readonly toolCalls: ToolCallRecord[];
  /** Finish reason of the last step that ended; `undefined` when none did. */
  readonly finishReason: FinishReason | undefined;

  constructor(
    message: string,
    run: Omit<ReviewRun, "output" | "modelVerdict" | "finishReason" | "toolsSkipped"> & { finishReason?: FinishReason },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReviewRunError";
    this.usage = run.usage;
    this.costUsd = run.costUsd;
    this.model = run.model;
    this.toolCalls = run.toolCalls;
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
 * Thrown by `reviewDiff`, before any model call, when the diff shows a file as
 * binary (`Binary files <a> and <b> differ`) whose path does not end with one
 * of `BINARY_EXTENSIONS`: usually a source file with a NUL byte in it, whose
 * change the reviewer cannot read. `paths` lists every such side as git
 * prints it (`a/src/x.ts`, `b/src/x.ts`, or a quoted path), so a caller can
 * name them without parsing the message.
 */
export class UnreviewableDiffError extends Error {
  readonly paths: string[];

  constructor(paths: string[]) {
    super(
      "reviewDiff: the diff shows files without a binary extension (BINARY_EXTENSIONS) as binary, " +
        `so it cannot be reviewed: ${JSON.stringify(paths)}`,
    );
    this.name = "UnreviewableDiffError";
    this.paths = paths;
  }
}

/** The line git prints instead of a hunk for a binary file; the two sides are split at the last " and ". */
const BINARY_MARKER = /^Binary files (.+) and (.+) differ$/;

/** Whether a side of a binary marker (a path as git prints it, maybe quoted) ends with a `BINARY_EXTENSIONS` entry. */
function hasBinaryExtension(side: string): boolean {
  const path = side.endsWith('"') ? side.slice(0, -1) : side;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot >= 0 && BINARY_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/**
 * Every side of a `Binary files … differ` line in `diff` that is neither
 * `/dev/null` nor a path with a binary extension. A name holding " and " can
 * split the line wrongly; then a side usually ends without an extension and is
 * listed, which fails closed.
 */
function hiddenBinaryPaths(diff: string): string[] {
  const paths: string[] = [];
  for (const line of diff.split("\n")) {
    // The cheap checks first, so a long hunk line never reaches the backtracking pattern.
    if (!line.startsWith("Binary files ") || !line.endsWith(" differ")) continue;
    const match = BINARY_MARKER.exec(line);
    if (!match) continue;
    for (const side of [match[1], match[2]]) {
      if (side !== "/dev/null" && !hasBinaryExtension(side)) paths.push(side);
    }
  }
  return paths;
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
 * Builds the structured-output reviewer without repo tools: one model call per
 * `generate`. Returns the plain `ToolLoopAgent`, so callers can pass
 * `messages` (e.g. a multi-turn session) instead of a prompt. The repo tools
 * are only on `reviewDiff`, which makes a fresh tool budget for every review.
 */
export function createReviewer(options: ReviewerOptions = {}) {
  return buildAgent(resolveOptions(options));
}

/** The user turn that ends the evidence phase and asks for the structured review. */
const ANSWER_NOW =
  "The evidence phase is over and the tools are gone. Return the review now as the structured object the schema " +
  "defines, using what the diff and the tool results show.";

/**
 * The structured-output reviewer: no tools, one step, `instructions` by
 * default `REVIEWER_INSTRUCTIONS`. In `reviewDiff` with repo tools it is the
 * answer phase, given the instructions and messages of the evidence phase.
 */
function buildAgent({ model, maxOutputTokens }: ResolvedOptions, instructions = REVIEWER_INSTRUCTIONS) {
  return new ToolLoopAgent({
    // `usage.include` makes OpenRouter report the per-step cost in providerMetadata.
    model: openrouter(model, { usage: { include: true } }),
    instructions,
    tools: {},
    output: Output.object({ schema: ReviewResult }),
    stopWhen: isStepCount(1),
    maxOutputTokens,
  });
}

/**
 * The evidence phase of a review with repo tools: up to `steps` model calls
 * with `tools` and no structured output. The schema stays out of these calls
 * on purpose: with \`response_format: json_schema\` in the request, GLM-5.1 on
 * OpenRouter answered with the JSON at once and never called a tool (measured
 * on 8 PRs, 2026-10-14). The phase ends when the model stops calling tools
 * (its last text holds its notes), at the step cap, or after a step that ends
 * past `deadline` (epoch ms).
 */
function buildExplorer(
  { model, maxOutputTokens }: ResolvedOptions,
  instructions: string,
  tools: ToolSet,
  steps: number,
  deadline: number,
) {
  return new ToolLoopAgent({
    model: openrouter(model, { usage: { include: true } }),
    instructions,
    tools,
    stopWhen: [isStepCount(steps), () => Date.now() >= deadline],
    maxOutputTokens,
  });
}

/**
 * Reviews one diff, with the PR's title and body as optional context
 * (`pullRequest`), and returns the verdict with its usage and cost. With
 * `repo` (see `resolveRepo`) the reviewer also gets the read-only `readFile`
 * and `searchCode` tools, a fresh budget for them, their instructions and the
 * PR's changed paths (`listChangedFiles`, unless `pullRequest.changedFiles` is
 * given); without it a review is one model call on the diff. Before any
 * model call it throws an `Error` for an empty or whitespace-only diff or an
 * invalid `maxDiffChars`, `DiffTooLargeError` for a diff longer than
 * `maxDiffChars` (default `DEFAULT_MAX_DIFF_CHARS`), and, after that check,
 * `UnreviewableDiffError` for a diff that shows a file without a
 * `BINARY_EXTENSIONS` extension as binary. A diff longer than
 * `maxDiffCharsForTools` (default `MAX_DIFF_CHARS_FOR_TOOLS`) is reviewed
 * without the repo tools even with `repo` (`toolsSkipped`). With repo tools and
 * `maxSteps` above 1 a review has two phases: up to `maxSteps - 1` calls that
 * may use the tools, then one call without tools that returns the
 * `ReviewResult`, so a model still exploring at the cap still answers. It throws `ReviewRunError`
 * when the model produced no valid `ReviewResult`, including a score that is not
 * an integer from 1 to 10, and for any error after a billed step (see
 * `ReviewRunError`); an SDK error before that (API and network failures, an
 * aborted signal) propagates unchanged. The returned `output.verdict` is `"fail"`
 * when the model or `verdictFromScores` says so; `modelVerdict` keeps the
 * model's own.
 */
export async function reviewDiff(
  diff: string,
  options: ReviewerOptions & {
    abortSignal?: AbortSignal;
    maxDiffChars?: number;
    pullRequest?: PullRequestContext;
    repo?: RepoContext;
    maxDiffCharsForTools?: number;
  } = {},
): Promise<ReviewRun> {
  if (diff.trim() === "") throw new Error("reviewDiff: the diff is empty");
  const {
    abortSignal,
    maxDiffChars = DEFAULT_MAX_DIFF_CHARS,
    maxDiffCharsForTools = MAX_DIFF_CHARS_FOR_TOOLS,
    pullRequest,
    repo,
    ...reviewerOptions
  } = options;
  // `diff.length > NaN` is always false, so an unchecked NaN would disable the cap.
  if (maxDiffChars !== Infinity && (!Number.isInteger(maxDiffChars) || maxDiffChars < 1)) {
    throw new Error(`reviewDiff: maxDiffChars must be an integer >= 1 or Infinity, got ${maxDiffChars}`);
  }
  if (diff.length > maxDiffChars) throw new DiffTooLargeError(diff.length, maxDiffChars);
  // A file the diff shows as binary hides its change from the reviewer, so the review fails closed.
  const hidden = hiddenBinaryPaths(diff);
  if (hidden.length > 0) throw new UnreviewableDiffError(hidden);

  const resolved = resolveOptions(reviewerOptions);
  const { model } = resolved;
  // `diff.length > NaN` is false, so a NaN cap would keep the tools on for any diff.
  if (!(maxDiffCharsForTools >= 0)) {
    throw new Error(`reviewDiff: maxDiffCharsForTools must be a number >= 0, got ${maxDiffCharsForTools}`);
  }
  const toolsSkipped = repo !== undefined && diff.length > maxDiffCharsForTools;
  const repoTools = repo && !toolsSkipped ? createRepoTools(repo) : undefined;
  const toolCalls = repoTools?.calls ?? [];
  // The changed paths come from git unless the caller passed its own list.
  const context: PullRequestContext | undefined = repo
    ? { ...pullRequest, changedFiles: pullRequest?.changedFiles ?? (await listChangedFiles(repo)) }
    : pullRequest;
  // Steps are collected as they end, so a run whose final answer fails to parse
  // still reports what it consumed (the SDK throws before returning a result).
  const steps: ReviewStep[] = [];
  const onStepEnd = (step: ReviewStep) => void steps.push(step);
  const prompt = buildReviewPrompt(diff, context);
  try {
    let result;
    // With repo tools and room for more than one call: gather evidence first, then answer with the schema.
    if (repoTools && resolved.maxSteps > 1) {
      const instructions = `${REVIEWER_INSTRUCTIONS}\n\n${repoToolsInstructions({
        maxCalls: MAX_TOOL_CALLS,
        maxChars: MAX_TOOL_BUDGET_CHARS,
        maxSteps: resolved.maxSteps,
      })}`;
      const evidence = await buildExplorer(
        resolved,
        instructions,
        repoTools.tools,
        resolved.maxSteps - 1,
        Date.now() + EVIDENCE_PHASE_MS,
      ).generate({
        prompt,
        abortSignal,
        onStepEnd,
      });
      result = await buildAgent(resolved, instructions).generate({
        messages: [
          { role: "user", content: prompt },
          ...evidence.responseMessages,
          { role: "user", content: ANSWER_NOW },
        ],
        abortSignal,
        onStepEnd,
      });
    } else {
      result = await buildAgent(resolved).generate({ prompt, abortSignal, onStepEnd });
    }
    const run = {
      usage: sumStepUsage(steps),
      costUsd: sumStepCosts(steps),
      model,
      toolCalls,
      toolsSkipped,
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
    if (error instanceof ReviewRunError) throw error;
    const noOutput = NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
    // Before any step ended nothing was billed or logged, so the SDK error stays as it is.
    if (!noOutput && steps.length === 0 && toolCalls.length === 0) throw error;
    throw new ReviewRunError(
      error instanceof Error ? error.message : String(error),
      {
        usage: sumStepUsage(steps),
        costUsd: sumStepCosts(steps),
        model,
        toolCalls,
        finishReason: steps.at(-1)?.finishReason,
      },
      { cause: error },
    );
  }
}

/** `ReviewerOptions` with every field set. */
type ResolvedOptions = Required<ReviewerOptions>;

/**
 * Applies the config defaults to `options`; `null` from an untyped caller counts
 * as unset, like an empty or whitespace-only model id. `maxSteps` must be an
 * integer >= 1, since `isStepCount` compares exactly and any other value would
 * never stop the loop once the agent has tools (without repo tools a review is a
 * single model call). `maxOutputTokens` must be an integer >= 1 so the ceiling
 * cannot be dropped.
 */
function resolveOptions(options: ReviewerOptions): ResolvedOptions {
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
