/**
 * Reviewer defaults: the model and the per-run budget limits, plus the
 * environment lookup the CLI and the demos use to pick the model.
 */

/** OpenRouter model id used when neither the caller nor the environment names one. */
export const DEFAULT_REVIEWER_MODEL = "z-ai/glm-5.1";

/**
 * Upper bound on model calls per review (the agent's `stopWhen`). Without repo
 * tools a review is one call; with them, every step but the last may read the
 * repository, and the last is forced to answer (see `createReviewer`). Every
 * step resends the whole conversation, diff included, so each one costs about
 * as much input as the first.
 */
export const DEFAULT_MAX_STEPS = 6;

/**
 * Characters one repo-tool call may return; a longer result is cut and says
 * where to continue. Sized so CLAUDE.md (about 12,000 characters with line
 * numbers) fits in one call.
 */
export const MAX_TOOL_RESULT_CHARS = 16_000;

/**
 * Characters all repo-tool calls of one review may return together. Tool
 * results stay in the conversation and are resent with every later step, so
 * this caps the growth of the context, not just one answer.
 */
export const MAX_TOOL_BUDGET_CHARS = 60_000;

/**
 * Milliseconds after which the evidence phase of a review with repo tools
 * starts no further step, so the answer call keeps its share of
 * `DEFAULT_REVIEW_TIMEOUT_MS`. A step that is running finishes first. Without
 * it, 3 of 8 reviews of real PRs (2026-10-14) ran out of the 300 s while still
 * reading plans, and ended in `error`.
 */
export const EVIDENCE_PHASE_MS = 120_000;

/**
 * Longest diff, in characters, reviewed with the repo tools; a longer one is
 * reviewed from the diff alone (the changed paths are still listed). Every
 * evidence call resends the whole diff, so a large one leaves no room in the
 * timeout: the only one of 8 reviews of real PRs (2026-10-14) still timing out
 * at 300 s had a 95,919-character diff, while the others, up to 27,810, ended
 * within 253 s.
 */
export const MAX_DIFF_CHARS_FOR_TOOLS = 50_000;

/** Repo-tool calls one review may make, however many fit in one step. */
export const MAX_TOOL_CALLS = 12;

/** Matching lines one `searchCode` call returns at most. */
export const MAX_SEARCH_MATCHES = 40;

/**
 * Changed paths `listChangedFiles` returns at most, followed by a `… N more`
 * line; `buildReviewPrompt` lists what it is given and cuts nothing itself.
 */
export const MAX_CHANGED_FILES = 300;

/**
 * Per-call cost ceiling on generated tokens, not a target length. Reasoning
 * tokens count towards it, and an answer cut off at the limit is invalid JSON
 * for the structured output, so the value leaves generous headroom above a
 * typical review. The reasoning grows with the diff and the instructions: on a
 * 95,919-character diff (2026-10-14) GLM-5.1 spent about 10,500 reasoning
 * tokens with half of the current instructions, and ran past 16,384 with all
 * of them, three times out of three; a typical review stays under 4,000.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;

/**
 * Upper bound on the diff length in characters (roughly 4 per token), checked
 * before any model call. `maxOutputTokens` caps only the answer; this caps the
 * input, so a lockfile or generated-code diff fails fast instead of costing a
 * full-context request.
 */
export const DEFAULT_MAX_DIFF_CHARS = 200_000;

/**
 * File extensions, lower case and without the dot, of the types the diff may
 * show as binary (`Binary files … differ`). Any other path git shows that way,
 * usually a source file with a NUL byte in it, makes the diff unreviewable:
 * the reviewer cannot read its content (`readFile` and `searchCode` skip
 * binary files too), so `reviewDiff` throws `UnreviewableDiffError` before any
 * model call. A new binary type is added here, on `master`, in its own PR.
 */
export const BINARY_EXTENSIONS: readonly string[] = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "bmp",
  "tif",
  "tiff",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "br",
  "zst",
  "wasm",
  "mp3",
  "mp4",
  "m4a",
  "ogg",
  "wav",
  "webm",
  "mov",
];

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
 * A single-call review took up to 124 s in the baseline; a review with repo
 * tools makes several calls, so it gets more room within the job's 15 minutes.
 * At 300 s the answer call of a review of a regex-heavy script
 * (`scripts/migration-guard.mjs`, PR #126, 2026-10-15) was aborted three
 * times out of three after an evidence phase of under 2 minutes, so the answer
 * call now has up to 8 minutes after `EVIDENCE_PHASE_MS`.
 */
export const DEFAULT_REVIEW_TIMEOUT_MS = 600_000;

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

/** The two commits the repo tools read from: the PR's target (`base`) and the PR itself (`head`). */
export interface RepoRevisions {
  baseRef: string;
  headRef: string;
}

/**
 * Returns `REVIEW_BASE_REF` and `REVIEW_HEAD_REF` from `env` (trimmed) when
 * both are set, `undefined` when neither is, and throws when only one is, so a
 * half-configured run fails instead of silently reviewing without tools.
 * Pure: reads only the object it is given; the refs are checked against the
 * repository by `resolveRepo`.
 */
export function resolveRepoRevisions(env: NodeJS.ProcessEnv = process.env): RepoRevisions | undefined {
  const baseRef = env.REVIEW_BASE_REF?.trim();
  const headRef = env.REVIEW_HEAD_REF?.trim();
  if (!baseRef && !headRef) return undefined;
  if (!baseRef || !headRef) throw new Error("set both REVIEW_BASE_REF and REVIEW_HEAD_REF, or neither");
  return { baseRef, headRef };
}
