# Review fixes and follow-ups

Queued by `/10x-impl-review tool-loop-agent phase 1` (reviews/impl-review-phase-1.md).

## F1 — fixed in Phase 1 (Fix A); carry into Phase 2

- `reviewDiff` now throws `ReviewRunError` (exported from the barrel) when the model produced no valid `ReviewResult`, carrying `usage`, `costUsd`, `model` and `finishReason` summed over the steps that ended. A truncated run therefore surfaces as `ReviewRunError` with `finishReason: "length"`, never as a returned `ReviewRun`.
- Phase 2, thin CLI: on `ReviewRunError` print the same usage/cost stderr line (with its `finishReason`) before the error message and exit 1, so failed runs are logged too.
- Phase 2, manual check 2.5: read "the stderr line shows finishReason `stop`, not `length`" as "the run succeeds (no `ReviewRunError`)"; a `length` run now shows up as a `ReviewRunError` whose stderr line says `length`.
- Phase 2, README: document `ReviewRunError` in the programmatic-usage and budget sections.

## F2 — skipped

- Undelimited diff / prompt injection: skipped in triage. Still open; revisit before a CI gate trusts `verdict`.

## F3 — fixed in Phase 1 (Fix A, plan addendum)

- `DEFAULT_MAX_DIFF_CHARS = 200_000` in `config.ts` (re-exported from the barrel) and a `maxDiffChars` option on `reviewDiff`; a longer diff throws before any model call. The option lives on `reviewDiff`, not `ReviewerOptions`, because `createReviewer` never sees the diff.
- Not addressed: a default timeout (the SDK's `timeout` call option). Left for the CI-gate change.
- Phase 2, README: list `DEFAULT_MAX_DIFF_CHARS` with the step and token limits in the budget section.

## F4 — fixed in Phase 1

- `resolveOptions()` in `agent.ts`: an empty or whitespace-only `model` counts as unset, and `maxSteps` must be an integer >= 1. `reviewDiff` no longer repeats the model default.

## F5 — queued for Phase 2 (README)

- Add a data-egress note to the README: the whole diff goes to OpenRouter and its upstream provider, so do not review diffs that contain secrets (`.env`, keys in fixtures); mention OpenRouter's `provider.data_collection: "deny"` as an option.

# Phase 2 review

Queued by `/10x-impl-review tool-loop-agent phase 2` (reviews/impl-review-phase-2.md).

## F2 — queued for the eval/CI-gate change (Fix B)

- `review-with-session.ts` calls `generate()` directly, not `reviewDiff`: `DEFAULT_MAX_DIFF_CHARS` does not apply, a truncated answer ends in an uncaught `NoObjectGeneratedError`, and neither its two calls nor the recaller (no `maxOutputTokens`) log usage. Bring it under the diff cap and print one stderr usage line per call when the eval/CI-gate change touches the demos.
