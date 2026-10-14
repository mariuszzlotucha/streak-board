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

## From the Phase 2 live trial on #116

- **Comment step: `-F body=@file` failed on the runner.** The first live run reviewed the change (`pass`) but the comment step stopped with `unexpected end of JSON input` before posting; the comment and labels now go to the API as JSON payloads (`--input`), the comment and label writes log a progress line (the label DELETE calls are silent on success), and the next runs posted, edited and labelled as planned (`5f2d4db`).
- **Model verdict stricter than the written rule.** On `7d319c1` the model returned `fail` with Corr 8, Sec 8, Test 4, Idiom 8, Cplx 7 (the rule gives `pass`); `reviewDiff` keeps the stricter verdict (Phase 1 F1), so the check failed. Earlier runs on the same code passed. For `code-review-evals`: measure how often the model's verdict disagrees with `verdictFromScores` in either direction, and decide whether the rule alone should bind.
- **No automated tests for the workflow logic** (raised by that review): the re-evaluation jq filter, the comment builder and the label rules are covered only by local stub probes and this live trial. Candidate: a committed probe script with fixtures, run in CI once `ci.yml` may change.
- **Sticky comment and claude-review.** `claude-review` comments as `github-actions[bot]` too, so a Claude comment that begins with `<!-- ai-cr:summary -->` would be adopted and edited by `ai-review` (raised by the first `ai-review` of #116). Consider telling Claude never to emit the marker, or matching the full first line plus the heading.
- **claude-review authentication.** The repository's `ANTHROPIC_API_KEY` was not scoped to a workspace (API 400, found with a temporary `show_full_output`); the owner chose a Claude subscription token, `CLAUDE_CODE_OAUTH_TOKEN` (`7d319c1`), and removed the repository's API key secret (the unused copies in the `production` environment were deleted in the full review, F5).
- **Skipped `claude-review` check runs.** Every label added to a PR publishes a skipped `claude-review` check run. Harmless (not required), but noisy in the checks list.

## From the full impl review (`reviews/impl-review.md`)

### Deviations from plan #5, #9, #10 and #11 (owner decisions, 2026-10-14)

- **claude-review settings and credentials (F1).**
  - What was wrong: in CI the pinned action loaded `.claude/settings.json` on top of `--allowedTools`. That file is a developer allow-list with `node`, `npm`, `npx`, `Write` and `Edit`. Bash commands also inherited `CLAUDE_CODE_OAUTH_TOKEN`.
  - The fix:
    - `claude_args` now starts with `--setting-sources user`;
    - the step sets `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"`, which the action reads through `env`;
    - the checkout has `persist-credentials: false`;
    - the prompt asks for `CLAUDE.md`, which no longer loads by itself.
  - Still accepted: the action writes the job token into the checkout's remote URL, because its cleanup misses checkout v7's `includeIf` credential file (an upstream issue). An allowed `gh pr comment` could therefore post `.git/config`. The token is short-lived and scoped to comments and labels, and only the owner can add the label.
- **Model-only fail (F2).**
  - The CLI prints a `note:` whenever the model's verdict and `verdictFromScores` disagree.
  - The action's step summary lists the six scores and that note.
  - A model-only `fail` whose findings do not hold is the owner's call (a push or `ai-cr:review`), never an agent's.
  - Whether the rule alone should bind stays with `code-review-evals` (see the live-trial note above).
- **Comment step (F4).** The summary is capped at 60,000 characters (`[truncated]`), and the comment and the labels are written independently. The step fails at the end if either part failed.
- **Production secrets (F5).** The unused `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` copies in the `production` environment were deleted on the owner's instruction.

### Still to verify

- On the review-fix PR, a `claude-review` run must show `settingSources: ["user"]` and the scrub in its log, and must still post its summary and inline comments.
