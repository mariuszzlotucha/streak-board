<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: AI Code Review in CI

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phase 2 of 2
- **Reviewed phases**: 2
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- **Plan adherence:**
  - Items #10–#12 match their contracts: trigger, permissions, job id/name, job-level concurrency, mode step, the re-evaluation query and selection, checkout order, the diff pathspecs, the base copy of the action, the comment step, labels, gate, pins, the `claude-review` guard/concurrency/timeout, the README, test-plan and lessons entries.
  - #13.2: the four labels exist with the planned colours.
  - #13.3: due after the live trial.
  - Nothing from "What We're NOT Doing" appears (`ci.yml`, `action.yml` and `packages/` are untouched).
- **Cosmetic drift and extras:**
  - Drift: the comment heading shows `pass`/`fail` rather than the word `reviewed`.
  - README extras: the CI intro names `ci.yml`, plus a fork-PR bullet and a retire-the-workflow note. These are harmless and on topic.
- **Automated criteria:** 2.1–2.4 and 2.13 were re-run on `a3b34fd`, and all pass.
- **Manual criteria:**
  - 2.5 is ticked.
  - 2.6–2.11 wait for the live trial on the phase PR.
  - 2.12 waits for the archive PR.
- **Checked and sound** (security agent; stubbed `gh` and read-only API calls):
  - `-F body=@file` reads the file.
  - `%3A` label encoding works.
  - The `HTTP 404` tolerance works.
  - The paginated comment lookup works.
  - `check_name` matches the job `name:`.
  - `status=completed` excludes the run's own check run.
  - Cancelled runs are ignored.
  - Pending-job replacement fails closed.
  - An empty outcome gives an error comment and a red job.
  - No event sequence was found that turns a failed review green without the routes of F1/F2.

## Findings

### F1 — The base reviewer still runs inside the PR checkout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:85-119 (with action.yml:89-118)
- **Detail**:
  - The reviewer root `.ai-reviewer-base` sits inside the PR's worktree, so files the PR commits at the workspace root are ancestors of the reviewer.
  - (a) npm's run-script prepends `node_modules/.bin` of every ancestor directory. A PR that force-adds `node_modules/.bin/node` gets `tsx`'s `#!/usr/bin/env node` to run its own code with `OPENROUTER_API_KEY` in env, and can print `{"verdict":"pass"}`. Verified by the security agent (exp1, npm 11): forged `reviewed/pass`.
  - (b) A root `package.json` with `"workspaces": [".ai-reviewer-base"]` and a root `.npmrc` make npm adopt the PR root as the prefix and load its `node-options`. Verified (exp2).
  - (c) A PR-committed `.gitattributes` (`* -diff`) turns every changed file into `Binary files … differ`, so the model sees no code. Verified (exp3).
  - (d) The PR checkout keeps `persist-credentials: true`, so the write token sits in `.git/config` while (a)/(b) run.
  - None of these touch `.github/`, so they are quieter than F2.
- **Fix A ⭐ Recommended**: Check out the base commit at the workspace root (`persist-credentials: false`, `fetch-depth: 0`), never check out the PR tree, and use the PR only as git objects.
  - How: fetch `pull_request.head.sha` into the base clone (`git fetch --no-tags origin "$HEAD_SHA"`, anonymous for this public repo), diff `"$BASE_SHA...$HEAD_SHA"` with the same pathspecs, and run `uses: ./.github/actions/ai-reviewer` (base copy, same action, no change to `action.yml`).
  - Strength:
    - No PR file exists on disk, so (a), (b) and (c) are gone: attributes come from the base worktree.
    - (d) is gone: no credentials are persisted, and no step after the fetch needs them.
    - The `.ai-reviewer-base` path and the F5 checkout-order note become moot.
  - Tradeoff:
    - It reorders the planned steps 1–4 (#10) and diverges from `ci.yml`'s merge-ref diff.
    - A private repo would need an authenticated fetch.
  - Confidence: HIGH — tree-to-tree `git diff` needs no worktree, and the action resolves its root from its own path.
  - Blind spot: the anonymous fetch by SHA and the three-dot diff over the fetched head are confirmed only in the live trial (2.6).
- **Fix B**: Keep the layout and add hardening: `persist-credentials: false` on the PR checkout and `git diff --text`. Accept (a)/(b) and document them.
  - Strength: smallest diff; closes (c) and (d).
  - Tradeoff:
    - The npm ancestor hijack stays.
    - `--text` dumps real binaries (images) into the diff.
  - Confidence: HIGH — narrow change.
  - Blind spot: other ancestor-resolved config (`.npmrc` variants, `.nvmrc` lookups) not enumerated.
- **Decision**: FIXED via Fix A — base commit checked out at the workspace root (`fetch-depth: 0`, `persist-credentials: false`); the PR head fetched by SHA (`git fetch --no-tags origin "$HEAD_SHA"`) and diffed as `"$BASE_SHA...$HEAD_SHA"` with the same pathspecs; `uses: ./.github/actions/ai-reviewer`; no `.ai-reviewer-base`. Anonymous fetch-by-SHA and the three-dot diff probed against GitHub (PR #115 head: 9 files, 29,730 bytes). Deviation from plan #10 steps 1–4 recorded in `follow-ups/review-fixes.md`.

### F2 — `pull_request` runs the PR's own workflow; docs overclaim

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: .github/workflows/review.yml:1-22, README.md:368,381
- **Detail**:
  - For `pull_request`, GitHub runs the workflow file from the PR's merge commit. A PR, same-repo or fork, can edit `review.yml` (or add any job named `ai-review`) and publish a green `ai-review`. The required check pins only `integration_id` 15368 (GitHub Actions).
  - The same holds today for `integration` (`ci.yml`), and the plan chose `pull_request` and excluded `pull_request_target` ("What We're NOT Doing").
  - In this repo:
    - Only the owner can merge.
    - Fork workflows from first-time contributors need approval (`first_time_contributors`).
    - A workflow edit shows in the PR's file list.
  - So the gate guards the owner's own flow, not an adversarial fork.
  - The docs still claim more than that:
    - README.md:368 and review.yml:5-6 say "a PR cannot change the code that judges it".
    - README.md:381 says fork PRs "fail closed", which holds only for an unmodified workflow. The phrase "possibly without a comment" should read "without a comment or labels": the read-only token gets 403 on the POST.
- **Fix A ⭐ Recommended**: Keep `pull_request` (the plan's decision) and correct the guarantee in the review.yml header and README.
  - Base-commit execution protects the reviewer, its prompt and the action from the PR's own changes. It does not protect the workflow file.
  - A PR that changes `.github/workflows/` or `.github/actions/` must be read by the owner before merging. Its green `ai-review` (and `integration`) is not evidence.
  - Fix the fork-PR wording.
  - Strength: honest docs and no redesign; consistent with how `integration` already works; fork merges already need the owner.
  - Tradeoff: the gate stays bypassable by a PR that edits the workflow; the defence is the owner's review of `.github/` changes.
  - Confidence: HIGH — matches GitHub's documented `pull_request` semantics and the plan's NOT-doing list.
  - Blind spot: none significant for a single-owner repo; a team repo would want CODEOWNERS plus required review on `.github/`.
- **Fix B**: Move the gate to `pull_request_target` (base-branch workflow) with the F1 Fix A layout, and decide whether fork PRs spend the OpenRouter key or fail closed.
  - Strength: the PR cannot change the workflow, the action or the reviewer.
  - Tradeoff:
    - It reverses a plan decision, so it needs a plan amendment.
    - It needs the F1 layout or it becomes a pwn-request with secrets.
    - A change to `review.yml` itself can only be tested after it reaches `master`.
    - The check-run attachment to the head SHA (which the re-evaluation relies on) is untested.
  - Confidence: MED — the live trial on this PR would not exercise the new workflow, since `pull_request_target` runs the `master` version.
  - Blind spot: how `pull_request_target` check runs appear in the required-check UI for this ruleset.
- **Decision**: FIXED via Fix A — review.yml header and README `## CI` state the real guarantee (base-commit execution protects the reviewer, prompt and action, not the workflow file; the owner reads a PR touching `.github/`), and the fork-PR wording says no comment or labels.

### F3 — A failed comment step turns a pass red and strands `ai-cr:review`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:123-217
- **Detail**:
  - The gate's `if:` carries an implicit `success()`, so a transient API error in the comment step skips the gate. The job fails, which is fail-closed, but fixing it needs another model call.
  - `set -e` aborts before `remove_label ai-cr:review`. Cancel and timeout also skip the step. While the label stays on the PR it cannot be re-added to trigger a re-run.
- **Fix**: Remove `ai-cr:review` in a first review-mode step, give the comment step `continue-on-error: true`, and give the gate `if: ${{ !cancelled() && steps.mode.outputs.mode == 'review' }}`.
- **Decision**: FIXED — a first review-mode step removes `ai-cr:review` (404 tolerated); the comment step has `continue-on-error: true`; the gate runs on `!cancelled() && mode == 'review'`.

### F4 — A run for an older head rewrites the comment and labels

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:123-202
- **Detail**:
  - A UI re-run of an older review run (older head SHA) cancels the current head's review, since `cancel-in-progress` is true for non-label events. It then overwrites the sticky comment and labels with the stale result, for example `ai-cr:passed` while the head's check is red.
  - The required check is per SHA, so it is unaffected.
- **Fix**: Before writing the comment and labels, compare `HEAD_SHA` with `gh api repos/$REPO/pulls/$PR --jq .head.sha`. Skip the writes (with a log line) when they differ.
- **Decision**: FIXED — the comment step compares `HEAD_SHA` with the PR's current head and leaves the comment and labels alone when they differ.

### F5 — The re-evaluation copies any check run named `ai-review`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:69-70
- **Detail**: The jq filter does not check which app created the run, so a check run named `ai-review` from another GitHub App would be copied. No such app exists today.
- **Fix**: Add `select(.app.slug == "github-actions")` to the jq filter.
- **Decision**: FIXED — the re-evaluation jq selects `.app.slug == "github-actions"`.

### F6 — The model summary can hide the footer or spoof the comment

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:142-149
- **Detail**:
  - Only `@` is neutralised.
  - An unclosed `<!--` in the summary hides the SHA and run-log footer, and raw HTML or a fake heading can mimic another result.
  - The labels and the check stay authoritative, so the impact is cosmetic.
- **Fix**: Neutralise `<!--` in the summary as well (`<!--` → `&lt;!--`), alongside the `@` escape.
- **Decision**: FIXED — `<!--` in the summary becomes `&lt;!--`, next to the `@` escape.

### F7 — `claude-review`: unneeded `id-token: write`, silent label removal

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/claude-review.yml:29,164
- **Detail**:
  - `github_token` and the API key are passed explicitly, so the action's OIDC path is unused and `id-token: write` only widens privileges (inferred from the action's auth flow).
  - `gh pr edit --remove-label … || true` hides failures; `gh pr edit` has failed with `GITHUB_TOKEN` on some gh versions (GraphQL projects-classic error).
  - The plan said "label removal and pins unchanged", which referred to the draft.
- **Fix**:
  - Drop `id-token: write`.
  - Remove the label with `gh api --method DELETE …/labels/claude-review`, tolerating 404 as review.yml does.
  - Row 2.10 confirms both.
- **Decision**: FIXED — `id-token: write` dropped (with a comment); the label is removed with `gh api --method DELETE …/labels/claude-review`, 404 tolerated. Row 2.10 confirms it live.
