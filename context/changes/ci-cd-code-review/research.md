---
date: 2026-10-14T14:22:30+02:00
researcher: Claude (Opus 5.5) for Mariusz Złotucha
git_commit: 7ca1795ebc9df31b0f1f46d99a4be0324224dd82
branch: m5l3
repository: mariuszzlotucha/streak-board
topic: "First CI/CD workflow for AI code review on pull requests: readiness of the reviewer, the drafted workflows and the repo settings against requirements.md"
tags: [research, ci, github-actions, code-review, packages/code-reviewer, ruleset, secrets]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude (Opus 5.5)
---

# Research: First CI/CD workflow for AI code review on pull requests

**Date**: 2026-10-14T14:22:30+02:00
**Researcher**: Claude (Opus 5.5) for Mariusz Złotucha
**Git Commit**: 7ca1795ebc9df31b0f1f46d99a4be0324224dd82 (= `origin/master`; the workflow files below are uncommitted in the working tree)
**Branch**: m5l3
**Repository**: mariuszzlotucha/streak-board (public)

## Research Question

Based on `context/changes/ci-cd-code-review/requirements.md` (copied verbatim from the `m5l3-requirements` prompt): what does it take to run `packages/code-reviewer` as a GitHub Actions review on every PR to `master`, posting a summary comment and an `ai-cr:passed` / `ai-cr:failed` label and failing the check on `fail`, with a re-run on the `ai-cr:review` label? Which parts already exist, which repo settings and earlier decisions constrain it, and what must the plan decide?

Out of scope: promptfoo evals (a separate change per `.claude/prompts/m5l3-promptfoo.md`, change-id `code-review-evals`); only their dependency on the schema is noted.

## Summary

- The **reviewer's criteria and verdict match the requirements**: the six criteria in `requirements.md:16-38` map one to one onto `schemas/review-result.ts:31-61` and `prompts/reviewer.ts:19-24`, with `verdict: "pass" | "fail"` and `summary` at `schemas/review-result.ts:68-69`. **No pass/fail threshold is defined** anywhere (requirements, schema, prompt); the model decides.
- The **CLI suits CI**: no `.env` is tolerated, stdout carries only the JSON, every failure path inspected exits 1 with nothing on stdout (details below). It exits 0 for both verdicts, so the gate must parse `verdict`, which the drafted action does.
- The **drafted workflow (`review.yml`) and composite action exist** in the working tree and follow `m5l3-review.yml.template`, but four repo facts block or weaken them:
  1. `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY` exist **only as secrets of the `production` environment**, which has a required-reviewer rule; the repo has no repository secrets. As drafted, the review gets an empty key.
  2. Only `integration` is a required check (ruleset "master protection", no bypass); the AI review gates nothing until it is added.
  3. The reviewer, the action and `npm ci` all run **from the PR's own checkout**, so a PR can change the code that produces its verdict.
  4. The earlier change left **prompt injection open** with the explicit note "revisit before a CI gate trusts `verdict`".
- **Diff size**: 4 of 114 merges to `master` exceeded the 200,000-character cap, all dominated by `context/` documents; such a PR gets no verdict, no comment, and a failing gate.
- **PR title/body are not supported** by the reviewer (`buildReviewPrompt(diff)` only); adding them is a prompt-contract change.
- **The two Claude-based options** (`claude-review.yml`, on demand; `/10x-impl-review-ci` template) overlap; the impl-review template needs adaptation (npm, Node 22, prettier, a git-ignored skill) and its `[skip ci]` commit would leave the required `integration` check unreported on the new head.

## Detailed Findings

### 1. Requirements vs the reviewer

- Inputs: requirements ask for PR title, PR body ("?? kompromis kosztowy") and the diff (`requirements.md:8-10`). The reviewer accepts only the diff: no `process.argv` use in the package, env reads limited to `OPENROUTER_API_KEY` and `REVIEWER_MODEL` (`config.ts:32-37`), `buildReviewPrompt(diff: string)` (`prompts/reviewer.ts:29-31`), `ReviewerOptions` = model, maxSteps, maxOutputTokens (`agent.ts:19-26`).
  - Callers to touch if the signature changes: `buildReviewPrompt` at `agent.ts:126` and `review-with-session.ts:20` (re-exported `index.ts:7`); `reviewDiff` at `review.ts:36` only (re-exported `index.ts:5`, example `README.md:50-53`). `README.md:10` documents the signature. No snapshot or test pins the prompt text (vitest includes `tests/**/*.test.ts` only).
- Criteria: one-to-one with `requirements.md:16-38` (names, order, 1/10 anchors); deferred items (business fit, architecture, `requirements.md:47-48`) are absent, as required.
- Verdict and side effects: `requirements.md:42-57` (binding `verdict`, gate reads only `verdict`, summary comment, `ai-cr:failed`/`ai-cr:passed`, retry on `ai-cr:review`) are all implemented by the drafted `review.yml:9-62`.
- Contract shape vs the M5L2 template: `m5l2-review-schema.ts.template:16-24` is flat (six numeric top-level fields); the repo nests `criteria.<name>.{score, rationale}` (`schemas/review-result.ts:24-71`). The gate is unaffected (`verdict` is top level in both). The future eval change is affected: `m5l3-promptfooconfig.yaml.template:43` asserts `JSON.parse(output).securitySafety <= 3`, which must read `.criteria.securitySafety.score`. The nested shape was an accepted decision (`context/archive/2026-10-13-tool-loop-agent/reviews/plan-review.md:80-88`).
- Threshold: none in `requirements.md`, the schema or `REVIEWER_INSTRUCTIONS` ("emit a single authoritative `verdict`", `prompts/reviewer.ts:26`).

### 2. CLI behaviour in CI (`packages/code-reviewer`)

- `.env`: `loadEnv()` ignores `ENOENT` only (`utils.ts:14-20`); a missing file is fine; other read errors are rethrown at `review.ts:11`, outside `main()`'s try. Shell variables win over the file.
- Exit codes (`review.ts:32-48`, `process.exitCode`, no `process.exit`): `0` with JSON on stdout (`:37`) and one usage line on stderr (`:38`); `1` for empty/TTY stdin (`utils.ts:45`), stdin over 800,000 bytes (`utils.ts:8,36-38`), a diff over 200,000 characters (`config.ts:26`, `agent.ts:115-117`), an invalid model answer (`ReviewRunError`, usage line printed first, `review.ts:42-43`), and API/network/missing-key errors.
- Probed locally (Node v24.21, not `.nvmrc`'s 22.14.0) for empty stdin, 300k characters and 900k bytes, with no key and no `.env`: each exited 1 with 0 bytes on stdout and one `error:` line on stderr. No probe past the size check was run (no network).
- stdout purity: `console.log` only at `review.ts:37`; `no-console` is an ESLint error in library modules (`eslint.config.js:129-145`); AI SDK warnings use `process.emitWarning` (stderr); `npm run --silent` hides npm's banner (`action.yml:54`). npm's banner does go to stdout without `--silent` (observed in this session).
- Budget: no default timeout ("Left for the CI-gate change", `context/archive/2026-10-13-tool-loop-agent/follow-ups/review-fixes.md:19`; `README.md:100`). `DEFAULT_MAX_OUTPUT_TOKENS = 16384`. The drafted jobs set no `timeout-minutes`.

### 3. Diff size on real PRs

- Measured over all 114 merges on `master` (first parent → merge, i.e. what `origin/master...HEAD` yields): median 24.9k characters, p90 127k, max 691k. **4 merges exceed 200,000 characters**: `c4aba77` (691k), `15cb448` (463k), `74a7b38` (267k), `31bd2e6` (208k), each dominated by `context/` files (e.g. a 229k `results.json` under `context/audits/observability/probes/`, `context/domain/*.md`, 60–107k `research.md`/`plan.md`). The last 8 merges are all under the cap (2.7k–84.5k).
- Share of diff volume across those merges: `context/` 72%, `package-lock.json` 1.9% (6 merges), `src/types.ts` 0.1% (4 merges).
- Effect with the drafted workflow: no verdict → "Comment and label" skipped (`review.yml:45`) → "Gate on verdict" fails with `missing` (`review.yml:62`); the PR gets no explanation.
- Corollary for any pathspec exclusion (e.g. `':!context/**'`): a PR touching only excluded paths produces an empty diff, which the CLI rejects with exit 1 (`utils.ts:45`), so the workflow would need an explicit empty-diff branch.

### 4. Drafted files in the working tree (uncommitted)

- `.github/workflows/review.yml`: from `m5l3-review.yml.template`; triggers `opened, synchronize, reopened, labeled` (`:10`); **workflow-level** `concurrency` with `cancel-in-progress` (`:17-18`); job id `review` (`:22`) with `if:` filtering labels (`:23`); diff via `git diff "origin/$BASE_REF...HEAD"` (`:36`); secret `OPENROUTER_API_KEY` (`:41`); comment+labels (`:44-56`); gate (`:58-62`).
  - Because concurrency is at workflow level, a `labeled` event with any unrelated label starts a run in the same group and cancels an in-progress review, after which its own job is skipped by `:23`. (GitHub concurrency semantics; not exercised on a live PR.)
- `.github/actions/ai-reviewer/action.yml`: setup-node from `.nvmrc` (`:34-36`), `npm ci` (`:41`), `npm run --silent review < "$DIFF_FILE"` (`:54`), key passed as `OPENROUTER_API_KEY` (`:47`), verdict parsed from JSON and written with `review-file` to `$GITHUB_OUTPUT`. Inputs: `api-key`, `diff-file`, `model`; no `pr-title`/`pr-body` (template has them, `m5l3-action.yml.template:13-19`).
- `.github/workflows/claude-review.yml`: on-demand, `types: [labeled]` (`:10`), job `if: github.event.label.name == 'claude-review'` (`:18`), also workflow-level concurrency (`:12-13`), secret `ANTHROPIC_API_KEY` (`:36`), removes the trigger label at the end (`:156`). Its job id is also `review` (`:17`), so both workflows publish a check named `review`.
- `package.json:18` (uncommitted): `"review": "tsx packages/code-reviewer/review.ts"`, reading stdin.

### 5. Repository settings (GitHub API, 2026-10-14)

- Repo is public (`isPrivate: false`). Default workflow token permissions: `read` (`actions/permissions/workflow`).
- Ruleset 24254172 "master protection" (active, on the default branch): `deletion`, `non_fast_forward`, `required_status_checks: [integration]`, `strict: false`, `bypass_actors: []`. Classic branch protection: none.
- Secrets: **none at repository level**. Environment `production` holds `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` (both added 2026-10-14) plus the Cloudflare/Supabase secrets; it has a `required_reviewers` protection rule (the owner). A PR job without `environment: production` cannot read them; with it, every review would wait for manual approval.
- Labels `ai-cr:*` and `claude-review` do not exist yet (`review.yml:52-53` creates the two result labels with `--force`; `ai-cr:review` and `claude-review` must exist for a human to add them).

### 6. Trust boundary of the gate

- `review.yml` checks out the PR (`:29`) and runs `./.github/actions/ai-reviewer` from that checkout (`:39`), which runs `npm ci` and `npm run review` from the PR's `package.json` and `packages/code-reviewer` (`action.yml:41,54`). A same-repo PR can therefore change the reviewer, the action or the script to emit `{"verdict":"pass"}`, and can read `OPENROUTER_API_KEY` from its own step. Fork PRs receive no secrets, so their review errors and the gate fails closed.
- Inference: in a single-maintainer repo the PR author already has write access, so this matters for tamper-resistance of the gate rather than for outsiders; it becomes material once others open PRs. A mitigation is to run the reviewer code from the base commit (a second checkout of `github.event.pull_request.base.sha`) while diffing the head.
- Prompt injection: the diff is appended undelimited after `Zrecenzuj ten diff:` (`prompts/reviewer.ts:30`); `REVIEWER_INSTRUCTIONS` never states that diff content is data. Recorded as open in `README.md:101` and `context/archive/2026-10-13-tool-loop-agent/follow-ups/review-fixes.md:14` ("revisit before a CI gate trusts `verdict`"). The summary is posted unescaped as a comment (`review.yml:50-51`), so injected markdown or @-mentions would reach the PR (`reviews/impl-review-phase-1.md:46-63` of the same archive).
- Data egress: the full diff goes to OpenRouter and its upstream provider (`README.md:95`; archive `reviews/impl-review-phase-1.md:94-102` suggests `provider.data_collection: "deny"`).

### 7. Claude-based review options

- `claude-review.yml` (section 4) is advisory and on demand.
- `/10x-impl-review-ci` (`.claude/skills/10x-impl-review-ci/`, template `references/workflow-template.yml`) reviews a PR against its `plan.md`, commits `reviews/impl-review.md` back to the PR branch with `[skip ci]`, and posts a commit status `impl-review-ci/verdict`. Adaptation needed for this repo:
  - pnpm (`pnpm/action-setup`, `pnpm install --frozen-lockfile`) → npm; Node `"24"` → `.nvmrc` (22.14.0).
  - The skill formats the report for `oxfmt --check`; this repo uses prettier (`package.json:12`).
  - The template stages the skill with `git archive "origin/$BASE_REF" .claude/skills/10x-impl-review-ci`, but `.gitignore:30` (`.claude/**/10x-*`) keeps that directory out of git (`git ls-files .claude/skills` lists only `ai-sdk`, `migrate-ai-sdk-v6-to-v7`, `playwright-cli`).
  - Inference from `context/foundation/lessons.md:140-145` ("a skipped workflow reports nothing"): the bot's `[skip ci]` commit becomes the PR head without a `ci.yml` run, so the required `integration` check would be missing on it and the PR could not merge until another push.
  - Needs `contents: write`, `pull-requests: write`, `statuses: write`, and runs `--model claude-opus-5-5 --max-turns 60` (cost).
- Both use `anthropics/claude-code-action@1d6de8cb…` (= tag `v1.0.248`, verified via the tags API) and `ANTHROPIC_API_KEY`, which has the same `production`-only problem as the OpenRouter key.

## Code References

- `context/changes/ci-cd-code-review/requirements.md:8-10,16-38,42-57` — inputs, criteria, verdict, side effects, retry label
- `packages/code-reviewer/prompts/reviewer.ts:16-31` — instructions, criteria list, undelimited diff prompt
- `packages/code-reviewer/schemas/review-result.ts:24-71` — nested criteria, `verdict`, `summary`
- `packages/code-reviewer/config.ts:26,32-37` — diff cap, model env
- `packages/code-reviewer/utils.ts:8,14-20,36-45` — stdin cap, `loadEnv`, empty-stdin error
- `packages/code-reviewer/agent.ts:19-26,115-126` — options, size check, prompt build
- `packages/code-reviewer/review.ts:11,32-48` — CLI flow and exit codes
- `packages/code-reviewer/README.md:95-101` — egress, timeout and prompt-injection notes
- `.github/workflows/review.yml:10-62` — drafted gate workflow
- `.github/actions/ai-reviewer/action.yml:34-54` — drafted composite action
- `.github/workflows/claude-review.yml:10-18,36,156` — on-demand Claude review
- `.github/workflows/ci.yml:1-16,117-124` — existing CI (floating `@v4` tags, `permissions: contents: read`, `release` needs `[ci, smoke, integration]`)
- `.claude/config-templates/m5l3-promptfooconfig.yaml.template:43` — assertion against the flat shape
- `.gitignore:30-32` — `10x-*` skills, configs and agents ignored

## Architecture Insights

- The gate reads one field (`verdict`) from a file, never free text; the CLI's exit code means "review errored", not "review failed". A missing verdict fails the gate (fail closed).
- Required-check hygiene in this repo is a recorded rule: no path filters on a workflow holding a required check; skip at job level with a fail-safe `if:` (`lessons.md:140-145`). A required AI check would also need to report on docs-only PRs.
- Action pinning is mixed: `ci.yml` uses floating tags, the drafted workflows pin full SHAs with tag comments (CLAUDE.md M5L3 hard rule). SHA pinning was declined for `ci.yml` earlier (archive `2026-09-30-release-automation-and-auth-hardening/reviews/impl-review.md:40-57`, Fix B).

## Historical Context (from prior changes)

- `context/archive/2026-10-13-tool-loop-agent/plan.md:49` and `plan-brief.md:40` — CI wiring was explicitly out of scope and left for this change. Supported.
- `context/archive/2026-10-13-tool-loop-agent/plan.md:237` — the root `review` npm script was removed by user decision because it ran its own `git diff` and ignored stdin. The current uncommitted script (`package.json:18`) reads stdin, so the stated reason no longer applies; re-adding it is still a reversal of that recorded decision and should be confirmed in the plan.
- `context/archive/2026-10-13-tool-loop-agent/follow-ups/review-fixes.md:14,19` — prompt injection and default timeout deferred to "the CI-gate change". Supported: both still open (`README.md:100-101`).
- `context/archive/2026-10-13-tool-loop-agent/plan.md:16` — M5L2 rule: log usage of every review and set a budget limit before running unattended. The CLI logs usage to stderr; no budget limit or timeout exists yet.
- `context/archive/2026-09-30-release-automation-and-auth-hardening/` — least-privilege `permissions` at workflow level (`reviews/impl-review.md:40-57`, Fix A adopted, Fix B SHA pinning declined); privileged secrets only in the job that needs them (`plan.md:135`); secrets entered by the user in the GitHub UI, never through chat (`plan.md:128`); `actionlint` as the verification criterion but not installed (`plan.md:134`, `reviews/impl-review.md:22`) — also not installed now.
- `context/foundation/lessons.md:70-75` — `master` requires `integration`; never bypass the ruleset.
- `context/foundation/test-plan.md:88,194` and `context/foundation/tech-stack.md:18` (`has_ai: false`) — no AI-native layer planned; the §5 Quality Gates table (`test-plan.md:120-127`) has no AI review row. Adding the gate makes these statements stale.
- `context/changes/refactor-opportunities/plan.md:155-157` — its Phase 2 edits `ci.yml` (Progress 2.10 open); this change should not touch `ci.yml` to avoid a conflict.

## Related Research

- `context/archive/2026-10-13-tool-loop-agent/` (plan, reviews, follow-ups) — the reviewer's design and its open items.
- Not applicable: no earlier research on CI review workflows.

## Open Questions

Decisions for `/10x-plan` (the user's to make; recommendations in brackets):

1. **Where the API keys live** — repository secrets vs a dedicated non-protected environment (e.g. `ai-review`). [repository secrets, or a dedicated environment without reviewers; never `production`.]
2. **Make the AI review a required check?** If yes: add its job name to the ruleset, give the job a unique name (not `review`), and decide how docs-only PRs report.
3. **Oversized and docs-only diffs** — exclude `context/**` (and possibly `package-lock.json`) from the diff, and what verdict/label an empty or over-cap diff gets (skip with a neutral comment vs fail).
4. **Prompt-injection hardening before trusting `verdict`** — delimit the diff and state it is data (contract-first, per the archived recommendation); escape or neutralise mentions in the posted summary.
5. **PR title/body** — add them to the prompt now (prompt-contract change; the body costs tokens) or defer.
6. **Trust boundary** — run the reviewer from the base commit instead of the PR checkout, or accept the risk for a single-maintainer repo.
7. **Pass/fail rule** — leave it to the model or define one (e.g. any criterion below N fails, computed in code from the scores).
8. **Claude options** — keep `claude-review.yml` on demand, replace it with an adapted `/10x-impl-review-ci` workflow, or drop both for now; if impl-review: un-ignore the skill, npm/Node 22/prettier, and handle the `[skip ci]` head vs the required `integration` check.
9. **Concurrency and timeouts** — move `concurrency` to job level in both workflows; add `timeout-minutes` (and/or `abortSignal`).
10. **`npm run review`** — confirm re-adding the script (reverses the archived decision, whose reason no longer applies).
11. **Docs** — update `test-plan.md` §5, `tech-stack.md` (`has_ai`), `lessons.md` (required checks) and the reviewer README in the same change.

Unverified (needs a live PR): concurrency cancellation by unrelated labels, how a skipped `review` run interacts with a required check of the same name, and behaviour on Node 22.14 (probes ran on 24.21).
