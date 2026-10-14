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

## From the Phase 2 impl review (`reviews/impl-review-phase-2.md`)

### Deviation from plan #10 (F1, owner decision 2026-10-14)

- Review-mode steps 1–4 of plan #10 changed: the base commit is checked out at the workspace root (`fetch-depth: 0`, `persist-credentials: false`), the PR head is fetched by SHA as git objects and never checked out, the diff is `"$BASE_SHA...$HEAD_SHA"` with the planned pathspecs, and the action is `./.github/actions/ai-reviewer`. Reason: with the PR checked out at the root, npm resolved PR-committed ancestor `node_modules/.bin`, `workspaces` and `.npmrc` around the base reviewer, and git read the PR's `.gitattributes` (verified by experiment). The Phase 1 notes above on `.ai-reviewer-base` (inside the workspace, after the PR checkout, base copy of the action) are superseded: there is no PR checkout and no `.ai-reviewer-base`.
- The anonymous fetch by SHA relies on the repository being public; a private repository needs an authenticated fetch.

### Accepted limit (F2)

- `pull_request` runs the PR's own `review.yml`, so a PR that edits `.github/` can change the gate (as for `integration`). Kept by the plan's decision against `pull_request_target`; the README and the workflow header say so, and the owner reads such PRs. Revisit with `pull_request_target` (and the F1 layout) if the repository gets other committers.

### For `code-review-evals`

- **Binary detection hides code.** `git diff` prints `Binary files … differ` for any file with a NUL byte, so a source file with a NUL in a comment reaches the model without content. `--text` would also dump real binaries. Add such a case to the suite, and decide whether the action should fail closed when a binary marker names a source extension.
