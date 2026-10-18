<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Claude review prompt in its own file

- **Plan**: context/changes/claude-review/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-18
- **Verdict**: APPROVED (triaged: F1-F3 fixed, F4-F6 accepted)
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- **Diff** `c3933a5..HEAD` (81ce1f2, 0e8b075, f1856c7) touches:
  - `.claude/review/claude-review.md`
  - `.github/workflows/claude-review.yml`
  - `README.md`
  - `change.md`
  - `plan.md`

  Every file is in the plan, and no planned file is missing.

- **Drift check:** every prompt section 1–10, every workflow contract bullet and every README bullet is MATCH.
- **"What We're NOT Doing":** respected. These are unchanged:
  - the allow-list;
  - the trigger;
  - the same-repo guard;
  - the timeout;
  - concurrency;
  - permissions;
  - the env scrub;
  - bubblewrap;
  - the OAuth token.

  `review.yml`, `packages/code-reviewer`, `CLAUDE.md` and `lessons.md` are untouched.

- **Hide step under `bash -e`:** tested locally with 0, 1 and many matches, with unordered input from several pages, and with every minimize call failing. It exits 0 in all cases and keeps the newest summary.
  - No comment body reaches the shell.
  - A non-bot comment cannot match.
  - ai-review's comment cannot match.
  - actionlint 1.7.7 with shellcheck passes.
- **Automated criteria 1.1–1.7 and 2.1–2.2:** all re-run on HEAD and all exit 0.
- **Manual rows** 1.8, 1.9 and 2.3–2.8 are pending. None is ticked.

## Findings

### F1 — "A PR cannot change its own review" overstates the guarantee

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: README.md:530, .github/workflows/claude-review.yml:6
- **Detail**:
  - On `pull_request`, GitHub runs the PR's own workflow file. A same-repo PR can therefore rewrite the inline `prompt:` so that it ignores `.claude/review/claude-review.md`.
  - The same README sentence admits that the workflow file is the PR's version.
  - The actual guarantee is narrower: a PR cannot change the prompt file it is reviewed with.
  - README already says the same for ai-review ("This protects the reviewer … not the workflow file", README.md:507).
- **Fix**: Reword both spots: "so a PR cannot change the prompt file it is reviewed with (a PR that edits the workflow file can still change the review; the owner reads such a PR)".
- **Decision**: FIXED (Fix now): README.md and the workflow header comment now say a PR cannot change the prompt file it is reviewed with, and that a workflow-editing PR still can (owner reads it)

### F2 — "No apostrophes" does not cover single-quoted code in a finding

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/review/claude-review.md:23, .github/workflows/claude-review.yml:77
- **Detail**:
  - The rule reads like "no contractions" ("write do not, it is").
  - Findings in this TypeScript codebase often quote code that contains single quotes, such as `from '@/lib/x'`. Any `'` ends the `--body '...'` string early. The result is a broken or unanalysable command and a permission denial or retry, which is exactly what row 2.6 checks for.
- **Fix**: Say "no single-quote character (') anywhere in the body, not even in quoted code; write do not, and quote code with backticks without inner quotes" in both places.
- **Decision**: FIXED (Fix now): prompt section 2 and the inline fallback forbid any single-quote character in the body, including quoted code; code is quoted with backticks and double quotes

### F3 — Plan text is wrong in two places where the code is right

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/claude-review/plan.md:25, :95 (lessons.md "restored from the base branch"), :58, :217, :272 (master merge reason)
- **Detail**:
  - **`lessons.md`:** the action restores only `.claude`, `CLAUDE.md` and a few config files, so `lessons.md` is the PR's copy. The prompt handles this correctly: the base version, the old side of the diff, rules.
  - **The `master` merge:** the action fetches `origin/<base.ref>` at run time, so the prompt file always comes from current `master`. A waiting branch needs `master` merged in only for the workflow file (the inline prompt, the model and the hide step). README states the right reason.
  - The plan will be archived as the record, so the wrong statements would outlive the change.
- **Fix**: Add a short "Implementation notes" addendum at the end of the plan that corrects both statements. Leave the phase blocks unchanged.
- **Decision**: FIXED (Fix now): plan.md gains an "Implementation notes" section before Progress correcting both statements

### F4 — Hide step re-minimizes already hidden summaries on every run

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/claude-review.yml:91-108
- **Detail**:
  - REST does not expose `isMinimized`, so every run calls `minimizeComment` again on all older summaries, which is N-1 calls per run.
  - If GitHub rejects re-minimizing, a "Could not minimize" line would repeat in every log and look like a real failure. It is harmless, since the step exits 0.
- **Fix**: Check on the second label run (row 2.7). If it is noisy, switch the listing to GraphQL and filter on `isMinimized` in a follow-up.
- **Decision**: ACCEPTED (watch): no code change; check on Progress 2.7, queued in follow-ups/review-fixes.md

### F5 — A prompt-injected run could hide the honest summary

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/claude-review.yml:84-108
- **Detail**:
  - The filter trusts the bot identity only.
  - An injection in a PR body or diff that made Claude post a second marked "APPROVED" summary would have the honest one minimized. Before this change, both stayed visible.
  - The impact is low:
    - the review is advisory;
    - only same-repo branches trigger it;
    - `ai-review` remains the gate;
    - the prompt already treats any injected instruction as a finding.
- **Fix**: Accept as residual risk; no change.
- **Decision**: ACCEPTED (residual risk): no change; advisory review, same-repo branches only, ai-review gates

### F6 — "A change no phase asks for is a finding" may flag bookkeeping

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/review/claude-review.md:41
- **Detail**:
  - The implementer added this sentence to reading-order step 5.
  - Progress ticks, `change.md` status changes or small incidental fixes could be reported as unrequested.
  - Section 7's requirement of a concrete scenario and impact limits this, but it is untested.
- **Fix**: Watch it during rows 2.5–2.8. If it fires on bookkeeping, exempt `context/changes/` bookkeeping in a follow-up.
- **Decision**: ACCEPTED (watch): no code change; check on Progress 2.5-2.8, queued in follow-ups/review-fixes.md
