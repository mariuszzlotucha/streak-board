# Review follow-ups: ci-cd-code-review

## From the Phase 1 impl review (`reviews/impl-review-phase-1.md`)

### Phase 2 notes (F5)

- **Base checkout inside the workspace.** setup-node's `cache-dependency-path` goes through `hashFiles`, which ignores files outside `$GITHUB_WORKSPACE`. Keep the base checkout at `.ai-reviewer-base` under the workspace, not under `$RUNNER_TEMP`.
- **Base checkout after the PR checkout.** A PR can commit its own `.ai-reviewer-base/` directory. Run the base checkout (`path: .ai-reviewer-base`) after the PR checkout so that `actions/checkout` replaces that directory, as step order 1 → 2 of plan #10 already does.
- **Use the base copy of the action.** The draft `.github/workflows/review.yml:39` still uses `./.github/actions/ai-reviewer`, the PR's own copy. Phase 2 must use `./.ai-reviewer-base/.github/actions/ai-reviewer`, and the live trial should confirm the action path shown in the job log.
- **Timeout budget.** AI SDK retries on 429/5xx share the CLI's 180 s abort signal. The baseline's longest run took 124 s, so an occasional `error` outcome is expected; the README's `ai-cr:review` re-run covers it.

### For `code-review-evals` (F2)

- **Lookalike fence tags.** Fullwidth `＜/diff＞`, Cyrillic homoglyphs (`</dіff>`), zero-width-space and soft-hyphen splits inside the diff are not neutralised. The title and body escape every `<`. Add these variants, and a title that opens a fake `<diff>`, to the injection cases of the eval suite.
- **Verdict-only injection.** `reviewDiff` now binds the stricter of the model's verdict and `verdictFromScores` (F1). The eval suite should still measure injections that raise the scores as well, which the rule cannot catch.
