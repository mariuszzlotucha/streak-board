<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: AI Code Review in CI

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Evidence

- **Scope:**
  - Both phases were reviewed as they are on `master` at `b8311c7`: `805fbac..b8311c7`, 21 files, no unrelated commits.
  - Phase 2 is included although rows 2.11 and 2.12 are unticked. Both are post-merge rows that the plan assigns to the archive branch: 2.11 was verified here (F6), and 2.12 needs the archive PR.
  - The five commits after the Phase 2 review (`5f2d4db`, `be9ced5`, `a1bb914`, `7d319c1`, `d6984c3`) are reviewed here for the first time.
- **Plan adherence:**
  - All 13 planned changes match their intent, read with the decisions recorded in the phase reports and in `follow-ups/review-fixes.md`. Every recorded fix is in the final code.
  - The workflow passes and reads the action's inputs and outputs exactly as `action.yml` defines them.
  - The action's root resolution holds with the base commit at the workspace root.
  - Nothing from "What We're NOT Doing" appears:
    - `ci.yml`, `tech-stack.md` and the privacy policy are untouched.
    - The model is still `z-ai/glm-5.1`.
    - There is no promptfoo and no `pull_request_target`.
  - One trivial extra is not a finding: the `branding:` block in `action.yml:17-19`, which is harmless.
- **Automated criteria** (re-run on `b8311c7`, all pass):
  - 1.1 `tsc`, 1.2/2.1 lint, 1.3 and 2.2 prettier, 1.4/2.3 YAML parse of the three files.
  - 1.5: exit 2 with empty stdout.
  - 1.6: exit 3 for 300,000 characters and for 900,000 bytes, with empty stdout and no model call (an invalid key was in the env).
  - 1.7: prompt probe, 8/8.
  - 1.11: action probe with the stub npm, 8/8.
  - 2.4: no PR title, body or label name in any `run:` block. The check parsed the YAML; the grep hits are all in `if:`, `env:` or `with:`.
  - 2.13: actionlint 1.7.7.
- **Manual criteria:**
  - **Phase 1:** 1.8, 1.9 and 1.12 are recorded in `baseline.md`; 1.10 is ticked at `011e2e9`.
  - **2.5:** the repository secrets `OPENROUTER_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` and the four labels exist. The credit limit has no evidence (F3).
  - **2.6–2.10**, evidence on #116:
    - One marked comment (`6171870817`), created at 15:25:29 and edited up to 15:55:03.
    - `ai-cr:review` added at 15:29:58 and removed by the bot at 15:30:07.
    - Re-evaluations after `documentation` (added while the first review ran) and after `enhancement` (added once it had finished).
    - Labels that follow the verdicts: `fail` at 15:47:54, `pass` at 15:55:04.
    - The Claude summary comment `6172418727` at 15:52:13, with `ai-review` unchanged.
  - **2.11:** met but unticked (F6).
  - **2.12:** pending; it needs the archive PR.
- **Late commits:**
  - `5f2d4db`: the comment payload is built with `JSON.stringify` and sent with `--input`. A stub probe with a hostile summary (quotes, backslashes, `$(…)`, backticks, an `EOF` line, NUL, a spoofed marker) produced valid JSON and executed nothing.
  - `be9ced5`: the fork-PR wording is accurate.
  - `a1bb914` / `d6984c3`: `show_full_output` was added and then removed. Both public run logs (38591651406, 38592940294) are masked and contain no token patterns.
  - `7d319c1`: authentication works (`apiKeySource: none`); see F1.
- **Checked and sound:**
  - `review.yml` keeps credentials out of the PR's reach:
    - no PR file lands on disk;
    - the checkout uses `persist-credentials: false`;
    - `GH_TOKEN` is set only in the API steps;
    - `OPENROUTER_API_KEY` is set only in the reviewer step.
  - The sticky-comment lookup ignores a non-bot comment that carries the marker.
  - The re-evaluation selects the newest `success`/`failure` from `github-actions` and fails closed when there is none.
  - These all hold: the 404 tolerance, the `set +e` exit-code capture, `continue-on-error` and the independent gate.
  - Ruleset 24254172 is active, requires `integration` and `ai-review` (both `integration_id` 15368) and has no bypass.
  - Every action is pinned to the SHA of its tag.

## Findings

### F1 — The Claude review agent runs with the repo's developer allow-list and the subscription token

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/claude-review.yml:31-45 (with .claude/settings.json)
- **Detail**:
  - **Settings source.** The live run on #116 (38592940294) logs `"settingSources": ["user","project","local"]`, and the action restores `.claude/` and `CLAUDE.md` from `origin/master`.
    - So the tracked `.claude/settings.json` allow-list applies in CI on top of `--allowedTools`: `Bash(node *)`, `Bash(npm *)`, `Bash(npx *)`, `Write`, `Edit`, and `git commit`/`checkout`/`stash`.
    - That allows arbitrary code, while `claude_args` reads as four tools.
    - The run used `ls`, `wc`, `grep`, `sed` and `head` pipes, all outside those four.
  - **Unscrubbed token.** `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is empty, so Bash subprocesses inherit `CLAUDE_CODE_OAUTH_TOKEN` (since `7d319c1`, a long-lived personal subscription token) next to `GH_TOKEN`.
  - **Checkout token.** The checkout keeps `persist-credentials: true`. The action's credential cleanup misses checkout v7's layout ("No existing authentication headers to remove") and then writes the job token into the remote URL.
  - **Untrusted input.** Anyone can comment on a public PR (no interaction limits), and `gh pr view --comments` is an allowed command. The run on #116 did not read comments.
  - **Risk.** Likelihood is low: only the owner labels, and only same-repo PRs run. The impact is use of the owner's subscription until the token is revoked.
  - **Plan.** Plan #11 kept "prompt, tools … unchanged" and never assessed the effective tool set.
- **Fix A ⭐ Recommended**: Load no repository settings in CI and scrub the token.
  - **Changes:**
    - add `--setting-sources user` to `claude_args`;
    - add `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"` to the step's `env:`;
    - set `persist-credentials: false` on the checkout;
    - add one prompt line that asks the agent to read `CLAUDE.md` for the conventions.
  - **Confirm** with a `claude-review` run on the fix PR: the summary and inline comments post, and the log shows `settingSources: ["user"]`.
  - Strength: the allow-list becomes exactly `--allowedTools` plus the action's defaults, whatever the developer settings grow into. The checkout matches review.yml.
  - Tradeoff: `CLAUDE.md` and the project skills no longer load by themselves (the prompt line covers `CLAUDE.md`), and the fix needs a live run to confirm.
  - Confidence: MED — the flag and the scrub exist in the pinned action's source (checked by the security agent), but `gh` authentication with the scrub on is unverified.
  - Blind spot: which tools the action itself allows by default without project settings.
- **Fix B**: Keep the project settings and deny the dangerous tools.
  - **Changes:**
    - add `--disallowedTools "Edit,Write,NotebookEdit,WebFetch,Bash(node *),Bash(npm *),Bash(npx *),Bash(git *),Bash(curl *)"`;
    - the same scrub and `persist-credentials: false` as Fix A.
  - Strength: `CLAUDE.md` and the project context still load by themselves.
  - Tradeoff: the deny-list must follow every allow rule added to `.claude/settings.json` later, and the hooks still load.
  - Confidence: MED — deny rules override allow rules, but the list is enumerative.
  - Blind spot: allow rules added later.
- **Decision**: FIXED via Fix A — `claude-review.yml`: `--setting-sources user` in `claude_args`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"` on the step (the pinned action reads it through `env`, action.yml:301), `persist-credentials: false` on the checkout, and the prompt asks for `CLAUDE.md`; one README sentence in `### Claude review`. On branch `ci-cd-code-review/review-fix`; a live `claude-review` run on its PR must confirm it before the merge. The first live run on #117 failed before Claude started, because the scrub needs bubblewrap, which the action installs only with `allowed_non_write_users`. A step before the action now installs bubblewrap and socat and lifts the AppArmor user-namespace restriction, mirroring the action's own isolation step. Confirmed live on #117 at `3f904ad` (run 38602394060):
  - the log shows `settingSources: ["user"]` and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 1`;
  - Claude Code ran 8 turns with no permission denials;
  - it posted its summary comment through `gh pr comment`, so `GH_TOKEN` survives the scrub;
  - `ai-review` stayed green.

### F2 — A model fail that its own scores pass is invisible, and the README misstates which verdict binds

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: README.md:367; packages/code-reviewer/review.ts:59-63; .github/actions/ai-reviewer/action.yml:151-166
- **Detail**:
  - **Docs vs code.** README:367 says "the verdict follows the written rule". The binding verdict is the stricter of the model's verdict and the rule (`agent.ts:183`), so a model `fail` stands even when the scores pass.
    - That happened on `7d319c1` (Corr 8, Sec 8, Test 4).
    - Only another push resolved it.
  - **Nothing in CI shows the case:**
    - the comment carries only the summary;
    - the step summary carries only the outcome, the verdict and the usage line;
    - the CLI's `note:` covers only the opposite override (model `pass`, rule `fail`).
  - **No route for the owner.** The README forbids re-running a `fail` and excludes a fail from break-glass, so nothing tells the owner what to do when the findings do not hold.
  - **Scope.** Whether the rule alone should bind stays with `code-review-evals` (follow-ups). This finding covers visibility and docs only.
- **Fix A ⭐ Recommended**: Show the disagreement and correct the docs.
  - **Changes:**
    - the CLI prints a `note:` for either direction of disagreement;
    - the action's step summary lists the six scores from the review file;
    - README:367 says that the stricter verdict binds;
    - the README's re-run bullet adds that only the owner decides how to handle a `fail` whose findings do not hold (a push or `ai-cr:review`), and that an agent never re-runs it.
  - Strength: the case can be recognised on the run page; the binding is unchanged; it is a few lines.
  - Tradeoff:
    - The CLI and the action run from the base commit, so the change ships in its own PR to `master` and applies from the next PR.
    - The owner's re-run option is a policy change, so it is stated explicitly.
  - Confidence: HIGH — the changes are small and local, and the stub-npm action probe can cover the summary.
  - Blind spot: None significant.
- **Fix B**: Docs only. Correct README:367, add the owner-decides line, and queue the score visibility for `code-review-evals`.
  - Strength: no change to the reviewer or the action.
  - Tradeoff: the next inconsistent `fail` is again visible only in the model's prose.
  - Confidence: HIGH — text only.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A —
  - `review.ts` prints a `note:` for either direction of disagreement between the model and `verdictFromScores`.
  - The action's step summary lists the six scores and the note line.
  - README:367 states that the stricter verdict binds.
  - README's Re-run bullet leaves a model-only `fail` whose findings do not hold to the owner (a push or `ai-cr:review`); an agent never re-runs it.
  - The package README (:42, :149) is updated.
  - Checks:
    - The CLI probe with a mocked fetch passes 4/4: a note in both directions, none when the verdicts agree.
    - The action probe passes 9/9; the new model-only `fail` case shows the scores and the note.
  - It takes effect from the next PR after the merge, since the action runs from the base commit.

### F3 — Row 2.5 claims a confirmed credit limit that was never confirmed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ci-cd-code-review/plan.md:406 (Progress 2.5); README.md:382
- **Detail**:
  - Row 2.5 reads "OpenRouter key confirmed dedicated with a credit limit".
  - The owner confirmed only that the secret is set and declined the question about the limit. plan.md:13 still says "not yet confirmed".
  - README:382 and plan.md:50 make the key's limit the only spend cap.
  - A review costs 0.01–0.045 USD (`baseline.md`), so the risk is small, but the tick asserts evidence that does not exist.
- **Fix**: The owner checks the key on openrouter.ai/settings/keys (Limit) and sets a limit if there is none. The archive branch then annotates 2.5 with the confirmation date, or with "credit limit not confirmed".
- **Decision**: FIXED — the owner confirmed on 2026-10-14 that `OPENROUTER_API_KEY` is a dedicated key with a credit limit. Progress 2.5 is annotated on `ci-cd-code-review/review-fix`.

### F4 — A failed comment write leaves stale labels, and a huge PR description ends in an unfixable error

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:204-236; .github/actions/ai-reviewer/action.yml:109
- **Detail**:
  - **Stale labels.** The labels are written after the comment under `bash -e`, so a failed comment write skips the label update.
    - Causes include a 5xx, a secondary rate limit, or a summary over GitHub's 65,536-character comment limit. Only `maxOutputTokens` (16,384) bounds the summary.
    - In the security agent's stub run, a 70,000-character `fail` summary got a 422. The PR kept `ai-cr:passed` and the old `pass` comment while the check went red.
    - The check stays correct; only the PR page misleads.
  - **Huge PR description.** A PR description over 128 KiB of UTF-8 cannot pass through `env:` ("argument list too long", verified locally). The step cannot start, the outcome is `error`, and `ai-cr:review` cannot fix it.
- **Fix**:
  - Cap the summary at about 60,000 characters, with `[truncated]`.
  - Update the labels independently of the comment: labels first, or collect the failures and exit at the end.
  - Name an over-long PR description in the README's `error` row.
- **Decision**: FIXED —
  - The comment builder caps the summary at 60,000 characters, with `[truncated]` and without splitting a surrogate pair.
  - The comment write moved into `write_comment`, and every call in it returns explicitly on failure. The comment and each label edit set `failed=1` instead of aborting, and the step exits with `$failed` at the end.
  - The README's `error` row names an over-long PR description.
  - Stub-gh probe, run on the re-extracted script:
    - A 70k summary is sent as 60,144 characters, and the labels follow the verdict.
    - When the PATCH of the comment answers 500, the labels are still updated and the step exits 1.
    - When the comment lookup answers 500, nothing is POSTed (no duplicate comment), the labels are updated and the step exits 1.
    - An emoji at the cut is dropped whole.
    - The hostile, empty-outcome, stale-head and too-large cases are unchanged.

### F5 — Docs and records drifted after the late commits

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:377,382,384; .github/workflows/claude-review.yml:29; .github/actions/ai-reviewer/action.yml:2-4,60-61; packages/code-reviewer/README.md:117; follow-ups/review-fixes.md:34
- **Detail**:
  - **README:382** says the `production` environment holds copies of the secrets. It holds `OPENROUTER_API_KEY` and the old `ANTHROPIC_API_KEY`, which no workflow uses, and no `CLAUDE_CODE_OAUTH_TOKEN`.
  - **claude-review.yml:29** still names "the API key".
  - **action.yml:2-4 and :60-61** say the reviewer runs "not from the workspace" and that this keeps the PR from rewriting its judge.
    - Since Phase 2 F1 the action's checkout is the workspace root.
    - The F2 caveat that the PR's own `review.yml` can change the gate is missing.
  - **packages/code-reviewer/README.md:117** says "a cost gate belongs to the CI gate". The gate has none; the budget is the key's limit.
  - **README break-glass (:384)** does not say to restore `"integration_id": 15368` when `ai-review` is added back. Without that app pin, any status named `ai-review` satisfies the check.
  - **README `error` row (:377)** omits invalid model output.
  - **review-fixes.md:34** says every `gh` call logs a line, but the two DELETE calls are silent.
- **Fix**: Correct these lines in one docs pass. Optionally, the owner deletes the two unused AI secrets from `production`, and README:382 drops the sentence about copies.
- **Decision**: FIXED —
  - On the owner's instruction, the agent deleted `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` from the `production` environment; the list read back without them, and the repository secrets are unchanged.
  - Docs corrected:
    - README:382 now says `production` holds neither secret.
    - The break-glass saves the GET output and restores its `rules` array, which keeps `"integration_id": 15368`.
    - The `error` row adds invalid model output.
    - claude-review.yml:29 names the OAuth token.
    - The action.yml header and step comment no longer say "not from the workspace", and the header carries the `review.yml` caveat.
    - packages/code-reviewer/README.md:117 names the key's credit limit as the budget.
    - review-fixes.md:34 is corrected.

### F6 — The plan text and Progress lag the implementation

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/ci-cd-code-review/plan.md:34,257-260,266-267,281,294 and :407-412
- **Detail**:
  - **Plan body.** It still describes the design from before the recorded deviations:
    - a PR checkout with `.ai-reviewer-base` and `origin/$BASE_REF...HEAD`;
    - the `ANTHROPIC_API_KEY`;
    - `ai-cr:review` removed in the comment step;
    - the gate without `!cancelled()`;
    - "label removal … unchanged".
  - The deviations live only in `follow-ups/review-fixes.md`, so the archived plan contradicts the code without a pointer.
  - **Progress.**
    - Rows 2.6–2.10 lack the ` — <sha>` suffix (:372).
    - Row 2.11 is met but unticked: the ruleset reads back `integration` and `ai-review` with no bypass, and #116 merged at 15:57Z.
- **Fix**: On the archive branch:
  - add a short "Deviations" note under the Overview that points to `follow-ups/review-fixes.md`;
  - append ` — d6984c3` to 2.6–2.10;
  - tick 2.11 ` — b8311c7`.
- **Decision**: FIXED, on `ci-cd-code-review/review-fix` (the next branch after #116) instead of the archive branch:
  - a **Deviations** list under the plan's Overview points to `follow-ups/review-fixes.md` and `reviews/`;
  - rows 2.6–2.10 carry ` — d6984c3`;
  - row 2.11 is ticked ` — b8311c7`.
  - Row 2.12 stays for the archive PR.
