<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Claude Review Publish Implementation Plan

- **Plan**: context/changes/claude-review-publish/plan.md
- **Mode**: Deep
- **Date**: 2026-10-19
- **Verdict**: REVISE → SOUND after triage (all 6 findings fixed in plan)
- **Findings**: 1 critical, 2 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

12/12 paths ✓, 11/11 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (one phase, 12 Automated and 9 Manual rows, no checkboxes outside `## Progress`), no `docs/reference/contract-surfaces.md` (check skipped).

- Blast radius: outside `context/archive/` and this change, the workflow and the prompt are named only in `README.md:529,531` and `context/foundation/open-items.md:90` (both edited by the plan) and in one inventory line of `context/foundation/health-check.md:102`, which needs no change.
- Action sources at `anthropics/claude-code-action@1d6de8c` (sub-agent, formatter executed on probe q4): `display_report` is on for any value other than the literal `"false"` and the step summary is written in the action's `finally` (`src/entrypoints/run.ts:361-368`), also on `error_max_turns` or a failed step, not on a cancelled or timed-out job; it reads `${RUNNER_TEMP}/claude-execution-output.json`, which holds every SDK message unredacted (`base-action/src/run-claude-sdk.ts:186,191,222`); `src/entrypoints/format-turns.ts` renders each tool call with its parameters, an error result as `❌ **Error:** <tool_result text>` (`:238-241`, whole, no truncation), a `permission_denied` system message as a `⚙️ System Message` JSON block (`:275-289,366-367`), non-error results truncated at 3,000 characters (`:188`) and redacted (`:185`), the whole markdown redacted once (`:437`); the final block shows cost and duration only; `show_full_output` or `ACTIONS_STEP_DEBUG` prints every message unredacted to the log (`base-action/src/parse-sdk-options.ts:195-196`, `run-claude-sdk.ts:117-123`). The caller needs no `id:`.
- Probes on Claude Code 2.1.296, the version the pinned action installs (`base-action/action.yml:150`), run in this review on 2026-10-19: `npx -y @anthropic-ai/claude-code@2.1.296` (`--version` answers `2.1.296` in 6 s, the owner's login), `-p` with `--model claude-haiku-5-5 --output-format stream-json --verbose --max-turns 4 --setting-sources user --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"`, the `CLAUDECODE*` session variables unset, the research's stub `gh` first on `PATH`, cwd outside the repository, `permissionMode: default`. Probe q4 (`gh pr comment 205 --body '<!-- claude-review:summary -->` then a line starting with `#205`) was denied with the reason `Newline followed by # inside a quoted argument can hide arguments from path validation`, identical with `DETAILED_PERMISSION_MESSAGES=1` (which the action sets, `run.ts:246`) and identical in the `tool_result` text. Probe q5 (`gh pr comment 205 --body-file - <<'MARK'` with the full template body: apostrophe, backticks, `$(date)`, `$HOME`, `##` and `###` lines) ran with 0 denials and the stub received `pr comment 205 --body-file -`. Three Haiku calls, 0.0064 notional USD; streams in the session scratchpad `perm-probe/out296/`.

## Findings

### F1 — Gate 1.4 fails on a prompt written to the plan's own contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Change 2 (plan:84) vs Automated gate 1.4 (plan:135)
- **Detail**: Change 2 tells the implementer to write in section 2: "never `--body '…'` or `--body "…"`". Gate 1.4 runs `! grep -qF -- "--body '" .claude/review/claude-review.md`, which matches that sentence, so the gate fails by construction and the goal run's self-repair would reword or drop the ban. The three old occurrences the gate exists to catch all read `gh pr comment <n> --body '` (prompt :18, :23, :110).
- **Fix**: Narrow the gate to the old call form, `! grep -qF -- "gh pr comment <n> --body '" .claude/review/claude-review.md`, and note in Change 2 that the ban names `--body '…'` without repeating `gh pr comment <n> --body '`. Row title 1.4 stays.
- **Decision**: Fixed via Fix in plan

### F2 — Nothing before the merge exercises the heredoc on the CI version

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (plan:56), Manual rows 1.13 and 1.15, brief Open Risks
- **Detail**: The fix PR's label run (1.15) runs the old prompt, so it can confirm the newline rule on 2.1.296 but never sends a heredoc there; the dry run (1.13) uses the local 2.1.303. The brief accepts "a wrong form costs another PR". Checked in this review (Grounding): the CI version runs locally through `npx`, and under the CI allow-list in default mode q4 is denied with the identical reason and q5 runs with 0 denials.
- **Fix A ⭐ Recommended**: Add `--claude <command>` to the dry-run script (default `claude`) and run row 1.13 with `--claude "npx -y @anthropic-ai/claude-code@2.1.296"`; record the 2.1.296 probe result in Key Discoveries and the brief's Open Risks.
  - Strength: The whole prompt on Opus is tested on CI's exact version before the push, at the cost already planned.
  - Tradeoff: One more option and argv test case; npx adds seconds to each run.
  - Confidence: HIGH — the probes ran through exactly that command.
  - Blind spot: The npm build versus the native installer CI uses: same version number, assumed same rules.
- **Fix B**: Record the 2.1.296 probe result only and keep the dry run on the local version.
  - Strength: No script change; the two decisive forms are proven on 2.1.296.
  - Tradeoff: The full prompt meets 2.1.296 only after the merge.
  - Confidence: MED — model behaviour with the whole prompt is untested on that version.
  - Blind spot: None beyond the above.
- **Decision**: Fixed via Fix A

### F3 — Row 1.15's "a different reason stops the merge" is ambiguous

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Manual Verification, row 1.15 (plan:149)
- **Detail**: Under the old prompt the model's summary attempts take other quoted forms too (run 38592940294: a double-quoted body judged unanalysable, a `sed -n` sub-command, a Write to `/tmp` for `--body-file`), each with its own validation reason. Read literally, the row stops the merge on evidence that confirms the diagnosis. The real falsifier is a quoted `--body` call with the heading lines that ran, or one denied by the allow-list rather than by validation: the heredoc would not help then either.
- **Fix**: Reword 1.15: proceed when every summary attempt was rejected by the validation layer (newline-plus-`#`, unquoted heredoc, backticks or `$(…)` in a double-quoted body, a Write for `--body-file`); stop when such a call ran without a denial or was denied as not permitted. Keep the newline text as the expected case (confirmed verbatim on 2.1.296).
- **Decision**: Fixed via Fix in plan

### F4 — Report description is imprecise in four places

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State (plan:14), Critical Implementation Details (plan:57), Change 1 comment, Change 5 README text
- **Detail**: From the action sources (Grounding): (1) a denied call renders three times, the `🔧 Bash` block with the parameters and `❌ Error: <tool_result text>`, a `⚙️ System Message` block with the raw `permission_denied` JSON, and Claude's own text, so "not as the raw `permission_denied` message" is wrong; (2) the 3,000-character truncation and the per-result redaction apply to non-error results only; error results and parameters print whole, covered by the one redaction pass over the whole markdown; the error marker is `:238-241`; (3) the summary is written in the action's `finally` for any value other than the literal `"false"`, also on `error_max_turns` or a failed step, not on a cancelled or timed-out job; (4) its final block shows cost and duration, not `num_turns` or `permission_denials_count` (log only).
- **Fix**: Adjust those four texts: each non-error result truncated at 3,000 characters, the report redacted as a whole, the denial reason on the error line and in the raw system message, written even when the step fails.
- **Decision**: Fixed via Fix in plan

### F5 — Dry-run child process: stdout buffer and stdin not specified

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Change 3 (plan:102)
- **Detail**: `execFileSync` and `spawnSync` cap stdout at 1 MiB by default; a 19-turn run carries every tool result (`gh pr diff`, file reads) in the stream, so the capture can throw `ENOBUFS`. With stdin inherited, `claude -p` waits 3 s and prints "Warning: no stdin data received in 3s" (seen in the probes; gone with stdin closed).
- **Fix**: Spawn with `stdio: ["ignore", "pipe", "pipe"]`, collect stdout chunks without `maxBuffer`, and hand the lines to `parseStream` after exit.
- **Decision**: Fixed via Fix in plan

### F6 — Dependabot PR #206 as the first post-merge candidate

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Manual Testing Steps, step 3 (plan:175)
- **Detail**: Lesson "Bot-opened PRs run without Actions secrets": a run triggered by Dependabot has no `CLAUDE_CODE_OAUTH_TOKEN`. A `labeled` event has the labelling user as actor, so the owner's label should get the secrets, but this is untested here, and #206 (`package-lock.json` only) exercises the posting form, not rows 1.17 and 1.20 (findings, trade-off rule).
- **Fix**: Say in step 3 that #206 tests the posting form and the report only, that a failure before the model call means the lesson applies and is not a prompt finding, and that rows 1.17–1.20 count from the first code PR.
- **Decision**: Fixed via Fix in plan
