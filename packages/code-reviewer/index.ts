/**
 * Public API of the code reviewer. Importing it has no side effects: no
 * environment loading, stdin reads, logging or process exits.
 */
export {
  createReviewer,
  reviewDiff,
  ReviewRunError,
  DiffTooLargeError,
  UnreviewableDiffError,
  hiddenBinaryPaths,
  verdictFromScores,
  type ReviewerOptions,
  type ReviewRun,
} from "./agent";
export { ReviewCriterion, ReviewCriteria, ReviewResult, REVIEW_JSON_SCHEMA } from "./schemas/review-result";
export {
  REVIEWER_INSTRUCTIONS,
  repoToolsInstructions,
  buildReviewPrompt,
  type PullRequestContext,
  type ReviewPromptOptions,
  type RepoToolBudget,
} from "./prompts/reviewer";
export {
  createRepoTools,
  resolveRepo,
  listChangedFiles,
  normaliseRepoPath,
  showPath,
  type RepoContext,
  type RepoToolLimits,
  type ToolCallRecord,
} from "./tools";
export {
  DEFAULT_REVIEWER_MODEL,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_DIFF_CHARS,
  BINARY_EXTENSIONS,
  MAX_PR_BODY_CHARS,
  DEFAULT_REVIEW_TIMEOUT_MS,
  EVIDENCE_PHASE_MS,
  MAX_DIFF_CHARS_FOR_TOOLS,
  MAX_TOOL_RESULT_CHARS,
  MAX_TOOL_BUDGET_CHARS,
  MAX_TOOL_CALLS,
  MAX_SEARCH_MATCHES,
  MAX_CHANGED_FILES,
  resolveReviewerModel,
  resolveRepoRevisions,
  type RepoRevisions,
} from "./config";
