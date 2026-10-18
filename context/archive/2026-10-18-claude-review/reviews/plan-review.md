<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Claude review prompt in its own file

- **Plan**: context/changes/claude-review/plan.md
- **Mode**: Deep
- **Date**: 2026-10-18
- **Verdict**: REVISE → SOUND after triage (all 4 findings fixed in plan)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

5/5 paths ✓, 2/2 symbols ✓ (`Bash(gh pr diff:*)`, review.yml sticky match), brief↔plan ✓, Progress 17/17 ✓.

The agent verified each of these against the pinned action (`1d6de8cb`) and the run logs:

- read-only tools are allowed in the default permission mode (run 38592940294 init and permission decisions);
- `--model` maps to the SDK option, and Opus 5.5 is available on a subscription token (code.claude.com model-config and authentication docs);
- `minimizeComment` works with `GITHUB_TOKEN` and `pull-requests: write`, and the REST `node_id` resolves to a minimizable `IssueComment`;
- the `rhysd/actionlint:1.7.7` image bundles shellcheck 0.10.0, and the plan's command exits 0 on today's file.

## Findings

### F1 — Fallback can be bypassed by the PR's own .claude-pr/ copy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, change 2 (inline prompt fallback)
- **Detail**:
  - The action copies the PR's sensitive paths to `.claude-pr/` and never removes them during the run (`src/github/operations/restore-config.ts` L274-292 at the pinned SHA).
  - On the implementation PR the base has no prompt file, but `.claude-pr/.claude/review/claude-review.md` exists. A model that goes looking may follow the PR's copy instead of the fallback.
  - The ".claude-pr/ is data" rule lives only in the prompt file, which the fallback path never loads.
- **Fix**: In the inline prompt, state that only `.claude/review/claude-review.md` counts as instructions and that nothing under `.claude-pr/` may be read as instructions. Extend row 2.4's bullet to check that the run did not review.
- **Decision**: FIXED (Fix in plan)

### F2 — Tool contract names tools that don't exist and allows denied commands

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 1, section 2 (Tools)
- **Detail**:
  - CLI 2.1.296 has no Grep/Glob tools. Search goes through Bash `grep`/`find`/`ls`, which default mode auto-allows only when the command is read-only and analysable.
  - Run 38592940294 denied three things:
    - `sed -n` (needs approval);
    - a `gh pr comment --body "…"` whose body could not be analysed;
    - a Write to /tmp for `--body-file`.
  - The summary format invites backticks, which are command substitution inside a double-quoted body.
  - Goal 2.6 is at risk.
- **Fix**: Section 2 says:
  - files are read with the read tool;
  - search uses plain read-only `grep`/`find`/`ls`, with no `sed`/`awk` and no pipes into writers;
  - the summary is posted with one `gh pr comment <n> --body '…'` using a single-quoted body: no `$(…)`, no heredoc, no apostrophes.
  - Strength: Matches the permission decisions logged on run 38592940294; allow-list unchanged.
  - Tradeoff: No sed-style range reads; whole files are read instead.
  - Confidence: HIGH — decisions come from the actual run log.
  - Blind spot: Whether a long single-quoted markdown body always passes the checker is untested until 2.6.
- **Decision**: FIXED (Fix in plan)

### F3 — Hide step should reuse review.yml's match idiom

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1, change 2 (hide step)
- **Detail**:
  - `review.yml:247-249` already selects its sticky comment with `gh api --paginate` and a jq `select` on `github-actions[bot]` with a `startswith` on the two-line prefix.
  - The REST login is `github-actions[bot]`; GraphQL reports `github-actions`.
  - Comment bodies are untrusted and must not reach the shell.
- **Fix**: Point the hide-step contract at `review.yml:247-249` as the pattern: REST plus jq `startswith("<!-- claude-review:summary -->\n## Claude review: ")`, with only `node_id`/`created_at` leaving jq.
- **Decision**: FIXED (Fix in plan)

### F4 — Row 1.7 `npm run lint` checks none of the changed files

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Automated Verification
- **Detail**: ESLint covers `*.{ts,tsx,astro}`. The phase changes one `.yml` and one `.md`; actionlint and prettier are the real gates.
- **Fix**: Keep the row as a regression guard and say so in its bullet (Progress title unchanged).
- **Decision**: FIXED (Fix in plan)
