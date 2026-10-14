<!-- PLAN-REVIEW-REPORT -->

# Plan Review: AI Code Review in CI Implementation Plan

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Mode**: Deep
- **Date**: 2026-10-14
- **Verdict**: REVISE
- **Findings**: 1 critical, 5 warnings, 2 observations
- **Triage**: 2026-10-14, 8 of 8 fixed (F1 via Fix A); verdict after fixes: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

14/14 paths ✓, 12/12 symbols and line refs ✓, brief↔plan ✓, Progress↔Phase 2/2 phases and 10/10 + 12/12 rows ✓, npm passes exit codes 2/3 through (npm 11.19) ✓, the `yaml` package is available for the parse checks ✓, `docs/reference/contract-surfaces.md` absent (skipped). Platform claims were checked by one sub-agent against GitHub docs, the runner and setup-node v7.1.0 source, and live PR data.

## Findings

### F1 — Re-evaluation races a running review

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (plan.md:66); #10 Re-evaluate step (plan.md:245-248); Progress 2.9
- **Detail**:
  - **The race.** Separate concurrency groups (`ai-review-<PR>-review` / `-reevaluate`) let a re-evaluation start while a review of the same head SHA is still running. It then copies an older conclusion, or fails closed when none exists.
  - **The unverified assumption.** The plan asserts that "a review that finishes later becomes the latest run and wins" (plan.md:66). GitHub does not document whether the required check follows the most recently created or the most recently completed run of a name. The sub-agent rated this LOW confidence; the docs only warn that duplicate job names "can cause ambiguous status check results".
  - **If creation order decides:**
    1. A1 passes. `ai-cr:review` starts A2. An unrelated label starts R, which copies A1's pass. A2 then fails, but R is the newest-created run, so the gate is green on a failed review.
    2. `claude-review` is added right after a push. R finds no completed run, so the check stays red until a manual `ai-cr:review`.
  - **The trial cannot tell.** Row 2.9 tests only a label added after a finished review, so it cannot tell the two rules apart.
  - **The query.** It names no `filter`. The default `latest` collapses runs only within one check suite (observed on PR #73), so the step must pick the run itself.
- **Fix A ⭐ Recommended**: One job-level group `ai-review-<PR>`, with a mode-dependent `cancel-in-progress: ${{ github.event.action != 'labeled' || github.event.label.name == 'ai-cr:review' }}`.
  - **Behaviour:** a review cancels whatever is running. A re-evaluation never cancels anything: it waits behind a running review and reads its result.
  - **Query:** `…/check-runs?check_name=ai-review&filter=all&status=completed&per_page=100`, conclusions `success` or `failure`, newest by `completed_at`.
  - **Trial:** row 2.9 also covers a label added while a review runs.
  - Strength: One line of YAML. GitHub serializes a PR's runs, so creation order and completion order coincide and the unverified assumption is no longer needed.
  - Tradeoff: A label added within seconds of a push can replace the still-pending review (`queue: single`). The SHA then gets no review, the re-evaluation fails closed with its message, and an `ai-cr:review` is needed. Safe but annoying.
  - Confidence: HIGH — expressions in `cancel-in-progress` and the pending/replace semantics of a group are documented.
  - Blind spot: The length of the pending window while a cancelled run winds down is unmeasured.
- **Fix B**: Keep the mode-specific groups. The re-evaluate step polls the check-runs API until no other `ai-review` run on the head SHA is queued or in progress, then copies the newest completed conclusion. After about 10 minutes it gives up and fails closed.
  - Strength: A review is never displaced; correct under either ordering rule.
  - Tradeoff: About 15 lines of polling bash that must exclude the job's own run. The runner idles while waiting, and the gate path gains new code that cannot be tested locally.
  - Confidence: MED — the logic is sound, but nothing in the repo does this yet.
  - Blind spot: Identifying the job's own check run (e.g. by a `details_url` containing `GITHUB_RUN_ID`) is unverified.
- **Decision**: FIXED (Fix A)

### F2 — The composite action first runs live, from master

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: #9 Composite action (plan.md:194-201); Phase 1 success criteria (plan.md:205-213); Phase 2 Implementation Note (plan.md:322)
- **Detail**:
  - **First run.** Phase 1 only checks that `action.yml` parses. The action's bash first runs on the Phase 2 PR, from the base commit's copy, so a bug cannot be fixed inside that PR. That bash covers:
    - exit-code mapping under `bash -e`;
    - `GITHUB_OUTPUT`;
    - the pre-install `skipped` check;
    - the setup-node paths.
  - **A confirmed trap.** In the setup-node v7.1.0 source, a `cache-dependency-path` containing `..` fails with "Relative pathing '.' and '..' is not allowed". A path built from `$GITHUB_ACTION_PATH/../../..` contains `..`. (`node-version-file` accepts an absolute path.)
  - **Stale base.** `pull_request.base.sha` in a `labeled` event stays at the base tip of the last push. After a hotfix of the action on `master`, an `ai-cr:review` alone still runs the old copy.
- **Fix**:
  1. **#9:** a first step resolves the reviewer root with `realpath "$GITHUB_ACTION_PATH/../../.."` and passes normalised absolute paths to setup-node.
  2. **New automated rows:**
     - Phase 1: a probe runs the action's `run:` steps with a stub `npm` and checks `outcome`/`verdict` in `GITHUB_OUTPUT`. Cases: exit 0 with valid JSON, exit 0 with invalid JSON, exits 1, 2 and 3, and a whitespace-only diff file.
     - Phase 2: `actionlint` through Docker (pinned image tag) over both workflows.
  3. **Phase 2 Implementation Note:** a bug in the action or reviewer found on the phase PR is fixed in a separate PR to `master`. Then `master` is merged into the phase branch and pushed.
  - Strength: Bugs surface before the Phase 2 PR, where they can no longer be fixed in place; the cache-path trap is confirmed in source.
  - Tradeoff: Two new Progress rows and a throwaway probe script (scratchpad, not committed).
  - Confidence: HIGH — the path failure is confirmed in setup-node v7.1.0.
  - Blind spot: The probe does not reproduce `${{ }}` substitution in the action YAML, and actionlint does not lint `action.yml` itself.
- **Decision**: FIXED (plus a "no `${{ }}` in `run:` blocks" rule in #9, which the probe checks; rows 1.11 and 2.13)

### F3 — Verdict rule and timeout untested on real PRs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: #2 (plan.md:99); Phase 1 manual criteria (plan.md:217-218); What We're NOT Doing (plan.md:47)
- **Detail**:
  - **The CLAUDE.md rule.** CLAUDE.md:86 (M5L3 hard rule) says "Uruchom zestaw ewaluacyjny przed zmianą promptu lub modelu przeglądu" (run the eval suite before changing the review prompt or model). Phase 1 changes the prompt (fences, data rule, verdict rule), no suite exists yet, and the plan does not acknowledge the conflict.
  - **The verdict rule.** "Any criterion ≤ 2 → fail" has not been tried on a single PR. A change without tests (e.g. Phase 2's YAML) may score `testRiskCoverage` ≤ 2 and fail every time.
  - **Re-runs.** "Re-run with `ai-cr:review`" after a `fail` (plan.md:322) turns the gate into a dice roll.
  - **Timeout.** The 180 s timeout is unmeasured.
- **Fix**: Phase 1 gets a new manual row, "baseline":
  - Run the new reviewer on the code diffs of the last 5 merged code PRs, with the new exclusions, including the largest.
  - Record the verdict, the six scores and the duration in the phase PR.
  - Before merge, explain any `fail` on an accepted PR or adjust the rule, and check that no run comes near 180 s.
  - Add one sentence to the plan: the baseline stands in for the eval suite until `code-review-evals`, and after a `fail`, a re-run is allowed only on an infrastructure error.
  - Strength: About 5 model calls (cents). It gives data for the thresholds and the timeout, and it honours the intent of the CLAUDE.md rule.
  - Tradeoff: A manual step on a small sample.
  - Confidence: MED — it catches a systematic `fail`, not a rare one.
  - Blind spot: Model non-determinism; one run per diff.
- **Decision**: FIXED (results recorded in `context/changes/ci-cd-code-review/baseline.md` instead of the PR description; row 1.12)

### F4 — Result labels are never created; credit limit unchecked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: #10 step 5 (plan.md:258); #13 (plan.md:298-299); Progress 2.5
- **Detail**:
  - **Labels.** #13.2 creates only `ai-cr:review` and `claude-review`. Nothing in the plan creates `ai-cr:passed` or `ai-cr:failed`; the draft did, with `gh label create --force`.
  - **Effect.** `gh pr edit --add-label` with a missing label fails the step, so the first `pass` gives a red job. requirements.md:53 asks for a red and a green label.
  - **Credit limit.** The end state promises a dedicated OpenRouter key with a credit limit (plan.md:34), the only spend control. Row 2.5 only checks that the secrets exist; both were set on 2026-10-14, and the limit is unknown.
- **Fix**:
  - #13.2 creates four labels: `ai-cr:passed` (`0E8A16`), `ai-cr:failed` (`B60205`), `ai-cr:review` and `claude-review`.
  - #13.1 notes that the secrets are set and asks the user to confirm the key is dedicated and has a credit limit.
  - Row 2.5 covers both.
- **Decision**: FIXED

### F5 — Comment step `if: always()` fires on cancel and in re-evaluate mode

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: #10 step 5 (plan.md:254)
- **Detail**:
  - **On cancel.** `always()` also runs the step in a job cancelled by a newer push (sub-agent: HIGH, from the docs and the runner source). The empty `outcome` then posts "error" and strips the labels until the new run finishes.
  - **In re-evaluate mode.** Taken literally, `if: always()` has no mode condition, so every unrelated label, `claude-review` included, would post "error".
  - **Repo convention.** `!cancelled()` (lessons.md:144, ci.yml:40).
- **Fix**: Step 5 gets `if: ${{ !cancelled() && steps.mode.outputs.mode == 'review' }}`; the gate gets `if: steps.mode.outputs.mode == 'review'`.
- **Decision**: FIXED

### F6 — No break-glass when the required check cannot pass

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes (plan.md:350); #12 (plan.md:284-290)
- **Detail**: The review fails closed, the reviewer runs from the base commit and the ruleset has no bypass. Together these mean the following cases block every merge, the fix included:
  - a broken reviewer or action on `master` (the fix PR is judged by the broken base);
  - an exhausted credit limit;
  - a long OpenRouter outage;
  - a legitimate code diff over 200,000 characters.

  The lesson "never bypass the ruleset" leaves the agent no way out, and the plan documents only the rollback.

- **Fix**: README `## CI` and the new lesson describe the procedure. When `ai-review` cannot pass for reasons outside the PR, the owner removes it from ruleset 24254172 (the same full-rules PUT), merges, adds it back and confirms on the next PR.
- **Decision**: FIXED

### F7 — Spec gaps the implementer would have to guess

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: #2, #9, #10, #12, Progress 2.4
- **Detail**:
  - **(a) Permissions.** "The job adds `pull-requests: write`…" (plan.md:242): job-level permissions replace the workflow's, so without `contents: read` the checkout loses access.
  - **(b) Grep.** The row 2.4 grep misses `inputs.pr-title` and `inputs.pr-body` in the action's `run:` blocks.
  - **(c) Pagination.** Without `--paginate`, the marker lookup creates a duplicate comment once a PR has more than 30 comments.
  - **(d) Closing tags.** Neutralisation misses `</diff >` and `</ diff>`. A case-insensitive regex `<\/\s*(diff|pr-title|pr-body)\s*>` covers them.
  - **(e) README.** "Available Scripts" does not list `npm run review`.
- **Fix**: Add these clarifications to #2, #9, #10, #12 and row 2.4.
- **Decision**: FIXED ((a), (c), (d), (e) in #2, #10, #12 and the 1.7 criterion; (b) is covered by F2's "no `${{ }}` in `run:` blocks" rule and row 1.11)

### F8 — Deferred items with no owner

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: What We're NOT Doing (plan.md:45-52); #4
- **Detail**:
  - **The archived follow-up.** `follow-ups/review-fixes.md:34-36` queues "bring `review-with-session.ts` under the diff cap and print usage lines" for the eval/CI-gate change "when it touches the demos". #4 touches that file, but the plan neither does it nor defers it.
  - **The eval template.** `m5l3-promptfooconfig.yaml.template:4` assumes a bare `{{diff}}`, not the new tags.
- **Fix**: Add both to "What We're NOT Doing" as `code-review-evals` work.
- **Decision**: FIXED
