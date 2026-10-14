/**
 * Public API of the code reviewer. Importing it has no side effects: no
 * environment loading, stdin reads, logging or process exits.
 */
export {
  createReviewer,
  reviewDiff,
  ReviewRunError,
  DiffTooLargeError,
  verdictFromScores,
  type ReviewerOptions,
  type ReviewRun,
} from "./agent";
export { ReviewCriterion, ReviewCriteria, ReviewResult, REVIEW_JSON_SCHEMA } from "./schemas/review-result";
export { REVIEWER_INSTRUCTIONS, buildReviewPrompt, type PullRequestContext } from "./prompts/reviewer";
export {
  DEFAULT_REVIEWER_MODEL,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_DIFF_CHARS,
  MAX_PR_BODY_CHARS,
  DEFAULT_REVIEW_TIMEOUT_MS,
  resolveReviewerModel,
} from "./config";
