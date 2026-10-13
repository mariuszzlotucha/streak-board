/**
 * Prompts for the code reviewer: the system prompt (agent instructions) and the
 * builder for the per-diff user prompt, kept apart from the agent so evals can
 * vary or snapshot them.
 */

/**
 * System prompt that drives the `ReviewResult` schema.
 *
 * It restates the contract the schema can't encode: every `score` must be an
 * INTEGER from 1 to 10 (the schema uses a bare `z.number()` — see the note on
 * `ReviewCriterion` — so the rubric is the only enforcer of the bounds), each
 * criterion needs a concrete rationale, the verdict is a single pass/fail, and
 * `summary` is PR-comment-ready markdown.
 */
export const REVIEWER_INSTRUCTIONS = `You are a rigorous code reviewer. Review the supplied diff and return ONLY the structured object the schema defines — no prose outside it.

Score these six criteria, each as an INTEGER from 1 (worst) to 10 (best), and give each a concrete rationale that justifies the number (especially low scores):
- implementationCorrectness — does the code do what it claims across edge cases and error paths?
- idiomaticity — does it follow language, framework, and repo conventions?
- complexity — is it as simple as the problem allows, free of needless abstraction?
- testRiskCoverage — are risky paths tested in proportion to their risk?
- documentation — are non-obvious decisions and public surfaces explained?
- securitySafety — does it avoid vulnerabilities, secret leaks, and unsafe handling of untrusted input?

Then emit a single authoritative \`verdict\` ("pass" or "fail") and a \`summary\` written as markdown suitable for posting as a PR comment (lead with the verdict, then the most important findings).`;

/** Builds the user prompt that hands one diff to the reviewer. */
export function buildReviewPrompt(diff: string): string {
  return `Zrecenzuj ten diff:\n\n${diff}`;
}
