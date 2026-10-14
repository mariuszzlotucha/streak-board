/**
 * Reviewer defaults: the model and the per-run budget limits, plus the
 * environment lookup the CLI and the demos use to pick the model.
 */

/** OpenRouter model id used when neither the caller nor the environment names one. */
export const DEFAULT_REVIEWER_MODEL = "z-ai/glm-5.1";

/** Upper bound on model calls per review (the agent's `stopWhen`). */
export const DEFAULT_MAX_STEPS = 2;

/**
 * Per-call cost ceiling on generated tokens, not a target length. Reasoning
 * tokens may count towards it, and an answer cut off at the limit is invalid
 * JSON for the structured output, so the value leaves generous headroom above
 * a typical review.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

/**
 * Upper bound on the diff length in characters (roughly 4 per token), checked
 * before any model call. `maxOutputTokens` caps only the answer; this caps the
 * input, so a lockfile or generated-code diff fails fast instead of costing a
 * full-context request.
 */
export const DEFAULT_MAX_DIFF_CHARS = 200_000;

/**
 * Upper bound on the PR body in characters. `buildReviewPrompt` cuts a longer
 * body and marks the cut with `[truncated]`: the body states intent, so its
 * first part is what matters, and it is untrusted text that costs tokens.
 */
export const MAX_PR_BODY_CHARS = 2_000;

/**
 * Time in milliseconds after which the CLI aborts a review
 * (`AbortSignal.timeout`), so a hanging provider call cannot hold a CI job.
 * The library itself sets no timeout; programmatic callers pass `abortSignal`.
 */
export const DEFAULT_REVIEW_TIMEOUT_MS = 180_000;

/**
 * Returns the trimmed `REVIEWER_MODEL` from `env` when it is non-empty, else
 * `DEFAULT_REVIEWER_MODEL`. Pure: reads only the object it is given.
 */
export function resolveReviewerModel(env: NodeJS.ProcessEnv = process.env): string {
  const model = env.REVIEWER_MODEL?.trim();
  // An empty or whitespace-only value counts as unset, so `??` alone is not enough.
  if (model) return model;
  return DEFAULT_REVIEWER_MODEL;
}
