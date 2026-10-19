# Claude Review Publish Implementation Plan

## Overview

Two label runs of the on-demand Claude review on PR #205 (2026-10-19) ended `success` with 3 and 2 permission denials and posted nothing. The research (`context/changes/claude-review-publish/research.md`) reproduced the cause: Claude Code's Bash tool rejects a quoted argument that contains a newline followed by `#`, and the mandated summary (`<!-- claude-review:summary -->` on line 1, `## Claude review: …` on line 2) passed as `gh pr comment <n> --body '…'` contains that sequence by construction. This plan, one phase and one PR, makes the prompt post the summary from a quoted heredoc, turns on the action's redacted Claude Code Report in the job step summary so a denied call is readable next time, adds a local dry-run script for the prompt, aligns README and open-items, and restates the archived verification rows 2.5–2.8 as this change's post-merge checks.

## Current State Analysis

- `.github/workflows/claude-review.yml`: `pull_request` with `types: [labeled]` on `master`; job `claude-review` runs when the label is `claude-review` and the head is in this repository (`:20`); steps `Checkout repository`, `Install subprocess isolation dependencies`, `Run Claude review` (`anthropics/claude-code-action@1d6de8c`, v1.0.248, `:53`) with `claude_args` `--model claude-opus-5-5`, `--setting-sources user` and `--allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"` (`:66-69`), the inline `prompt:` with the "prompt not found" fallback (`:70-78`), `Hide older Claude review summaries` (jq filter on author, marker and `## Claude review: `, `:93`) and `Remove trigger label` (`:111-123`). No `display_report`, no `id:` on the action step, no artifact.
- `.claude/review/claude-review.md`: section 2 (`:11-27`) lists the tools, mandates `gh pr comment <n> --body '<text>'` for the summary (`:18`), claims that `sed`, `awk`, `cat`, `head` and `git` are denied (`:21`) and forbids `$(...)`, heredocs and files (`:23`); section 11 (`:104-133`) fixes the summary shape (marker line 1, `## Claude review: ` line 2, `Commit <sha>`, `### Findings`, optional `### Not verified`) and the `--body '...'` call (`:110`), and bans the `ai-cr:summary` marker (`:133`).
- Observed runs (research, Finding 1): run 39127947501 on PR #198 (2026-10-18) had 19 turns and 3 denials and posted a summary with `<h2>`/`<h3>` HTML headings plus one inline comment; runs 39265408742 and 39266174600 on PR #205 had 19 turns, 3 and 2 denials and posted nothing; the one-line fallback comment on PR #195 passed with 0 denials.
- Root cause (research, Finding 2; 26 local probes on Claude Code 2.1.303 with a stub `gh`): `Newline followed by # inside a quoted argument can hide arguments from path validation` rejects the contract body given as `--body '…'` before any allow rule is read (probes p2, q4); a heredoc with a quoted delimiter passes with the full body, apostrophes, backticks, `$(date)` and `##` lines included (q5); an unquoted delimiter is rejected (`Heredoc with unquoted delimiter undergoes shell expansion`, q6); `grep`, `ls`, `find`, `cat`, `head`, `sed -n 1,3p`, `wc` and the Read tool ran with zero denials under the CI allow-list in default mode (r1–r8); the Grep and Glob tools are absent from the Linux default tool set unless `--allowedTools` names one of them.
- CI evidence on Claude Code 2.1.296 (research, Finding 3): every summary CI posted has `#` only as the body's first character; run 38592940294 (2026-10-14, `show_full_output: true`) shows the same validation layer at work and `permissionMode: "default"`.
- Action mechanics at the pinned version (research, Finding 4): the job log prints only the init and result summary (`sanitizeSdkOutput`); the input `display_report` (default `"false"`, `action.yml:152-155`, wired as `DISPLAY_REPORT` at `:326`) makes `src/entrypoints/run.ts:362-368` write a job step summary rendered by `src/entrypoints/format-turns.ts` (every tool call with parameters and result, non-error results redacted at `:185` and truncated at 3,000 characters at `:188`, error results printed whole on an `❌ Error` line at `:238-241`, a `permission_denied` system message printed as raw JSON at `:275-289`, the whole report redacted once at `:437`; written in the action's `finally` for any `display_report` other than `"false"`, also when the step fails); `show_full_output`/debug mode prints the unredacted stream to the public log (flagged MEDIUM on PR #116 and removed); the `execution_file` output names the unredacted `${RUNNER_TEMP}/claude-execution-output.json`.
- Contracts: `README.md:527-534` (trigger, prompt from the base branch, model and language, summary shape, re-run and the hide step); the hide filter `claude-review.yml:93`; the marker ban `claude-review.md:133`; the archived plan rows 1.8, 1.9 and 2.5–2.8 are open (`context/archive/2026-10-18-claude-review/plan.md:319-320,333-336`) and the archive is read-only; `context/foundation/open-items.md:88-92` (§7, item 7.1) names an artifact step and says each run "kosztuje około 0,8 USD".
- Repository conventions: scripts live in `scripts/*.mjs`, are linted by the ESLint `scriptsConfig` (`eslint.config.js:123-124`), covered by `npm run deps` (depcruise over `scripts`) and tested from `tests/unit/*.test.ts` by importing their named exports (`tests/unit/migration-guard.test.ts`); workflows are checked with actionlint through Docker; the `changes` job treats every file outside `context/**` and `*.md` as code (`.github/workflows/ci.yml:42,48`), so the merge of this PR runs the `release` gate on identical code; `context/changes/deployment/deployment-plan.md:363,460` records such identical-code releases.

## Desired End State

- A label run posts one summary in the documented shape through `gh pr comment <n> --body-file - <<'EOF' … EOF` and inline comments as before, with `permission_denials_count` 0 for the tools the prompt names.
- Every run's job page carries a redacted Claude Code Report (step summary) listing each tool call, its parameters, its result and any denial reason; the log keeps the init and result lines.
- `node scripts/claude-review-dry-run.mjs <pr>` runs the working-tree prompt locally with the CI allow-list, records the `gh pr comment` call instead of posting it, checks the summary form and reports denials, turns and notional cost.
- README and open-items describe the posting form, the report, the dry run and the notional cost; the archived rows 2.5–2.8 are re-verified through this plan's Progress rows.

Verification: the Automated gates below on the implementation branch; the dry run before the push; the fix PR's own label run (old prompt from `master`, new workflow) showing the denial reason in the report; after the merge, the next labelled PRs showing the summary and zero denials.

### Key Discoveries:

- `.claude/review/claude-review.md:110,128`: the summary call `--body '...'` with the marker on line 1 and `## Claude review: ` on line 2 always puts a newline followed by `#` into a quoted argument (research, Finding 2).
- `.claude/review/claude-review.md:21,23`: the claims that `cat`, `head` and `sed` are denied and that heredocs fail are contradicted by probes r4–r6 and q5 (research, Finding 7); the 2026-10-14 denials were a `sed` sub-command with `$p`, a parenthesised double-quoted body and a Write to `/tmp` (research, Finding 3).
- `.github/workflows/claude-review.yml:93`: the hide filter requires `\n## Claude review: `, so it did not match the `<h2>` summary on PR #198; it stays unchanged because the fix restores `## `.
- `anthropics/claude-code-action@1d6de8c`: `action.yml:152-155` (`display_report`, default `"false"`, warning about Claude-authored content in the step summary), `:326` (`DISPLAY_REPORT`), `src/entrypoints/run.ts:362-368`, `src/entrypoints/format-turns.ts:183-188,238-240,437`.
- `.github/workflows/review.yml:248-256`: `ai-review` posts its comment with `gh api --input`; the plan rejects this route for `claude-review` (owner decision, below).
- `eslint.config.js:123-124` and `tests/unit/migration-guard.test.ts:1-30`: the pattern for a linted, unit-tested `scripts/*.mjs` tool with named exports.
- `.github/workflows/ci.yml:42,48`: the workflow edit makes the merge a code push, so `release` waits for the owner's approval and redeploys identical code.
- Plan review (2026-10-19), Claude Code 2.1.296 (the version the pinned action installs, `base-action/action.yml:150`) run locally through `npx -y @anthropic-ai/claude-code@2.1.296` under the CI allow-list in default mode with the stub `gh`: the `--body '…'` probe with a heading line is denied with the same reason (also with `DETAILED_PERMISSION_MESSAGES=1`, which the action sets), and the quoted-heredoc probe with the full summary body runs with no denial (`reviews/plan-review.md`, Grounding).
- Research, Finding 2, probe setup: `claude -p … --output-format stream-json --verbose --max-turns 4 --setting-sources user --allowedTools "<CI list>"` with the `CLAUDECODE*` session variables unset and a stub `gh` first on `PATH`; the dry-run script generalises this setup.

## What We're NOT Doing

- Not posting the summary from a workflow step through `--json-schema`/`structured_output` and `gh api --input` (the `ai-review` pattern): a larger change; the owner chose the heredoc (2026-10-19).
- Not uploading `claude-execution-output.json` as an artifact and not enabling `show_full_output` or debug mode: unredacted transcripts in a public repository; the owner chose `display_report` (2026-10-19).
- Not switching the summary to HTML headings; not changing the hide filter (`claude-review.yml:93`), the README summary shape, the marker, the labels, the job and step names, the model, `--setting-sources user`, the `permissions` block, the inline-comment tool or the fallback comment in the workflow `prompt:` (a one-line `--body '...'`, proven on PR #195).
- Not widening `--allowedTools` (no `Grep`, `Glob`, `Write`, `mcp__github_comment__*`) and not using `track_progress` or tag mode.
- Not rewriting the prompt beyond section 2 (tools and posting form) and section 11 (the posting call): the reading order, finding rules, severity, verdict rule and the summary template stay byte-identical.
- Not touching `ai-review` or `review.yml`, the archived `claude-review` plan (read-only), the roadmap (a tooling change, like `claude-review` before it) or `deployment-plan.md` inside this PR; the closing docs PR adds the release note.
- Not making the dry run an Automated gate: its outcome depends on the model, so it is a Manual row the session runs before the push; its body checks are unit-tested instead.
- Not adding a stub MCP server for inline comments to the dry run: the inline tool does not exist locally and the script says so.

## Implementation Approach

One phase on one branch `claude-review-publish/implementation` cut from fresh `origin/master`, run with `/goal` and `/10x-goal-implement claude-review-publish`, then `/10x-impl-review`, then one push and one PR. The workflow gets `display_report: "true"`, so the fix PR's own label run (which reads the old prompt from `master`) already shows the old denial reasons in CI before the merge. The prompt moves the summary to a quoted heredoc and stops claiming denials the research refuted. A Node script in `scripts/` reproduces the CI permission setup locally with a `gh` wrapper that forwards read commands to the real `gh` and records `pr comment` without posting; the session runs it after the goal run and before the push, and pastes its report into the PR body. README and open-items follow in the same commit. After the merge the owner approves the identical-code `release`, labels the next two or three PRs, and the closing docs PR records the results.

## Critical Implementation Details

- **Quoted delimiter only.** `<<'EOF'` passed probe q5 with the full body; `<<EOF` is rejected (`Heredoc with unquoted delimiter undergoes shell expansion`). The body must not contain a line that is exactly the delimiter; the prompt says so, and the dry-run check fails a body containing such a line.
- **The prompt is read from `master` on pull requests** (`claude-review.yml:5-7`, `README.md:531`): the fix PR's own label run exercises the old prompt with the new workflow, which is the intended diagnosis run; the fixed prompt is first exercised in CI by the next labelled PR after the merge.
- **`display_report` is a string input**: write `display_report: "true"`. The report is redacted as a whole and truncates each non-error result at 3,000 characters; a denied call appears as its tool call, an `❌ Error` line carrying the rejection text and the raw `permission_denied` system message; it is written also when the step fails, not when the job is cancelled or times out.
- **`claude -p` inside a Claude Code session**: the dry-run script unsets `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_PID`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_BRIDGE_SESSION_ID`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_SESSION_ATTENDED` and `CLAUDE_EFFORT` for the child process (the research probes ran this way), uses the owner's local login, `--setting-sources user` and the CI allow-list verbatim, and runs with the repository root as cwd so the working-tree prompt is read.
- **The `gh` wrapper comes first on `PATH` and never forwards `pr comment`**: it records argv and, with `--body-file -`, stdin, prints a fake comment URL and exits 0; every other `gh` invocation is passed to the real binary, whose absolute path the script resolves before prepending the wrapper directory.
- **Release gate**: the merge runs `release` because the workflow file counts as code; the owner approves it (identical code) and the closing docs PR notes it in `deployment-plan.md`.

## Phase 1: Step summary, dry-run script and the heredoc summary

### Overview

Turn on the action's redacted report, move the summary call to a quoted heredoc with an accurate tool section, add the local dry-run tool with its unit test, and align README and open-items. One commit; the Manual rows below carry the dry run, the fix PR's own label run and the post-merge checks.

### Changes Required:

#### 1. Workflow: Claude Code Report in the step summary

**File**: `.github/workflows/claude-review.yml`

**Intent**: Make every run's tool calls, results and denial reasons readable on the run page, redacted by the action, while keeping every other input, step and name.

**Contract**: In the `Run Claude review` step's `with:` add `display_report: "true"` with a comment saying what the report shows (every tool call with parameters and result, redacted as a whole, each non-error result truncated at 3,000 characters; as public as the log) and that the log itself still prints only the init and result lines. Extend the header comment (`:2-9`) by one sentence on the report. No `id:`, no outputs, no artifact. The allow-list, model, `--setting-sources user`, `prompt:`, the hide step and the label step stay byte-identical.

#### 2. Prompt: the summary from a quoted heredoc, tools described accurately

**File**: `.claude/review/claude-review.md`

**Intent**: Replace the `--body '...'` form, which can never carry the contract shape, with the heredoc form that passed, and stop telling the model that read-only commands are denied; keep every finding, severity, verdict and output rule.

**Contract**: Section 2: line 18 becomes `gh pr comment <n> --body-file - <<'EOF' … EOF`, for the one summary; line 21 becomes an instruction without the claim "Any other command is denied" (use only the commands above; do not use `sed`, `awk`, `git`, writes, redirections or pipes into writers); line 23 becomes the posting rule: exactly one `gh pr comment <n> --body-file - <<'EOF'` call, the delimiter quoted, the body verbatim on the lines between, `EOF` alone on the last line and never inside the body; never `--body '…'` or `--body "…"` (a quoted argument whose text has a newline followed by `#` is rejected before it runs, and the heading lines of the summary are exactly that; the sentence never spells the old call form `gh pr comment <n> --body '`, which gate 1.4 greps for), never `$(...)` outside the heredoc and never a file; the sentence about run 38592940294 goes (its history is in `research.md`). Section 11, line 110 becomes "Post exactly one summary with `gh pr comment <n> --body-file - <<'EOF'`, the body on the lines between the command and the closing `EOF`, in exactly this shape:"; the fenced template stays; the bullets gain "The body never contains a line that is only `EOF`." The command shape is spelled out once, because the model copies it:

```
gh pr comment <n> --body-file - <<'EOF'
<!-- claude-review:summary -->
## Claude review: APPROVED
…
EOF
```

Sections 1, 3–10, the template and the `ai-cr:summary` ban stay byte-identical.

#### 3. Dry-run script

**File**: `scripts/claude-review-dry-run.mjs` (new)

**Intent**: Exercise the working-tree prompt locally under the CI permission setup, so a prompt change is tested on the real model before a push, without posting anything to GitHub.

**Contract**: `node scripts/claude-review-dry-run.mjs <pr-number> [--model <id>] [--max-turns <n>] [--claude <command>]`; no PR number prints the usage and exits 2. Behaviour: (1) resolves the real `gh` on the current `PATH` and writes an executable `gh` wrapper into a fresh temp directory: when `$1 $2` is `pr comment` it appends one JSON line with argv and, when `--body-file -` is present, stdin to the file named by `CLAUDE_REVIEW_DRY_RUN_LOG`, prints a fake `https://github.com/<repo>/pull/<n>#issuecomment-dry-run` and exits 0; otherwise it execs the real `gh` with the same arguments; (2) runs `<claude> -p <prompt>` (`--claude <command>`, default `claude`, split on spaces; row 1.13 uses `npx -y @anthropic-ai/claude-code@2.1.296`, the version the pinned action installs) from the repository root with the prompt built like the workflow's `prompt:` (`REPO: <owner/name>` from `gh repo view --json nameWithOwner`, `PR NUMBER: <n>`, then the three paragraphs of `claude-review.yml:74-78` verbatim), `--model claude-opus-5-5` by default, `--setting-sources user`, `--allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"`, `--output-format stream-json --verbose`, `--max-turns 40` by default, `PATH` prefixed with the wrapper directory and the Claude Code session variables listed above unset, spawned with `stdio: ["ignore", "pipe", "pipe"]` (a closed stdin avoids the 3 s "no stdin data" wait) and the stdout chunks collected without `maxBuffer`, the lines handed to `parseStream` after the process exits; (3) parses the stream: the `result` message (`num_turns`, `total_cost_usd`, `permission_denials[]` with `tool_name` and `tool_input.command`), every `system`/`permission_denied` message (`decision_reason`) and the tool names used; (4) prints a report: the recorded `pr comment` calls (count, argv, body), the body checks, the denials grouped by tool with the first 120 characters of the command and the reason, the turns and the notional cost, and a note that the inline MCP tool does not exist locally; (5) exits 1 when there is not exactly one `pr comment` call, when it carries `--body` instead of `--body-file -`, when a body check fails, or when a denial's command starts with `gh pr comment`; other denials are warnings. Exports the pure functions `checkSummaryBody(body)` (line 1 is `<!-- claude-review:summary -->`, line 2 matches `^## Claude review: (APPROVED|NEEDS ATTENTION|REJECTED)$`, a `Commit [0-9a-f]{7}` line exists, no `<!-- ai-cr:summary -->`, no line that is only `EOF`), `classifyDenials(denials)` (fatal: command starts with `gh pr comment`; warning otherwise) `parseStream(lines)` and `parseArgs(argv)` (the PR number, `--model`, `--max-turns`, `--claude`; a missing PR number is a usage error); runs `main()` only when executed directly, the pattern of `scripts/migration-guard.mjs`. Node 22 built-ins only (`node:child_process`, `node:fs`, `node:os`, `node:path`, `node:url`); ESLint `scriptsConfig` clean; `npm run deps` clean.

#### 4. Unit test for the dry-run checks

**File**: `tests/unit/claude-review-dry-run.test.ts` (new)

**Intent**: Pin the body and denial checks so the dry run fails for the right reasons; the model-dependent part stays manual.

**Contract**: Imports `checkSummaryBody`, `classifyDenials`, `parseStream` and `parseArgs` from `../../scripts/claude-review-dry-run.mjs` (the `migration-guard.test.ts` pattern). Cases: the template body from section 11 with `APPROVED` and `Commit 1a2b3c4` passes; a body with `<h2>Claude review: APPROVED</h2>` on line 2 fails; a body without the marker fails; a body containing a line that is only `EOF` fails; a body containing `<!-- ai-cr:summary -->` fails; `classifyDenials` marks `gh pr comment 205 --body '…'` fatal and `sed -n 1p x` a warning; `parseStream` reads a result line and a `permission_denied` line into the expected shape; `parseArgs` reads the PR number, `--model`, `--max-turns` and `--claude` and rejects a missing PR number.

#### 5. README

**File**: `README.md` (section "Claude review (`claude-review`, on demand)", `:527-534`)

**Intent**: Document the posting form, the report and the dry run, so the next reader does not rediscover them.

**Contract**: The **Summary** bullet (`:533`) gains: Claude posts it with `gh pr comment <n> --body-file -` from a quoted heredoc, the one form that passes Claude Code's command validation with this shape, because a quoted `--body '…'` whose text has a newline followed by `#` (the heading lines) is rejected before it runs, which is why the two label runs on PR #205 posted nothing. A new bullet **Diagnostics** after **Re-run**: the job's step summary holds the action's Claude Code Report (`display_report: "true"`), every tool call with parameters and result, redacted, with each non-error result truncated at 3,000 characters, so a denied command and its reason are readable there; the log prints only the init and result lines (`num_turns`, `permission_denials_count` and `total_cost_usd`, a notional API price, since the run uses the subscription token); the repository is public, so the report is too; `node scripts/claude-review-dry-run.mjs <pr>` runs the working-tree prompt locally with the CI allow-list and a `gh` wrapper that records `pr comment` instead of posting, and checks the summary form. The other bullets stay as they are.

#### 6. open-items §7

**File**: `context/foundation/open-items.md` (`## 7.`, `:88-92`)

**Intent**: Align item 7.1 with the decided approach and the notional-cost framing, and correct the inference drawn from the log line about buffered inline comments.

**Contract**: In the paragraph: "kosztowały 0,84 i 0,82 USD" becomes a notional figure from the subscription ("zużyły nominalnie 0,84 i 0,82 USD z subskrypcji"); the parenthesis "(„No buffered inline comments”)" becomes the fact that the PR has zero review comments (the log line concerns only unconfirmed buffered comments); one sentence names the cause (the newline-plus-`#` validation, research Finding 2) and PR #198's `<h2>` workaround. Item 7.1 describes this plan: `display_report: "true"` instead of an artifact, the heredoc form in the prompt, `scripts/claude-review-dry-run.mjs`, then the post-merge rows; the closing sentence keeps "do not add the label until the merge" with "nominalnie około 0,8 USD". The checkbox stays `[ ]` (the closing docs PR ticks it); the §7 heading and the final paragraph of the file stay unchanged. Polish, Prettier-clean.

### Success Criteria:

#### Automated Verification:

- Workflow lints: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -ignore 'SC2034'`
- `display_report` is on: `grep -qF 'display_report: "true"' .github/workflows/claude-review.yml`
- Allow-list and model unchanged: `grep -qF -- '--allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"' .github/workflows/claude-review.yml && grep -qF -- '--model claude-opus-5-5' .github/workflows/claude-review.yml`
- Prompt posts from a quoted heredoc and no longer bans it or uses `--body`: `grep -qF -- "gh pr comment <n> --body-file - <<'EOF'" .claude/review/claude-review.md && ! grep -qi 'no heredoc' .claude/review/claude-review.md && ! grep -qF -- "gh pr comment <n> --body '" .claude/review/claude-review.md`
- Marker ban kept: `grep -qF 'Never write the marker `<!-- ai-cr:summary -->`' .claude/review/claude-review.md`
- Lint passes: `npm run lint`
- Dependency rules pass: `npm run deps`
- Unit tests pass, the dry-run checks included: `npm run test:unit`
- Dry-run script parses and refuses to run without a PR number: `node --check scripts/claude-review-dry-run.mjs && ! node scripts/claude-review-dry-run.mjs >/dev/null 2>&1`
- Formatting: `npx prettier --check .github/workflows/claude-review.yml README.md .claude/review/claude-review.md context/foundation/open-items.md context/changes/claude-review-publish/plan.md context/changes/claude-review-publish/plan-brief.md`
- README names the report and the dry run: `grep -qF 'display_report: "true"' README.md && grep -qF 'scripts/claude-review-dry-run.mjs' README.md`
- open-items 7.1 names the report: `grep -qF 'display_report' context/foundation/open-items.md`

#### Manual Verification:

- Dry run before the push, run by the session after the goal run: `node scripts/claude-review-dry-run.mjs 205 --claude "npx -y @anthropic-ai/claude-code@2.1.296"` (the CI version) exits 0 with exactly one recorded `gh pr comment 205 --body-file -` call whose body passes the checks (marker, `## Claude review: <VERDICT>`, `Commit 1fcdea5`), no denial for `gh pr comment`; its report (turns, notional cost, other denials) is pasted into the PR body.
- Owner reads the diffs of `.github/workflows/claude-review.yml` and `.claude/review/claude-review.md` before the merge (a PR that edits the workflow changes the review it gets, `README.md:531`).
- The fix PR's own label run, after the push: the owner adds `claude-review` once; the job's step summary shows the Claude Code Report with the old prompt's tool calls, including a denied `gh pr comment … --body '…'` whose error result reads `Newline followed by # inside a quoted argument…`; the label is removed by the last step. Every summary attempt must have been rejected by the validation layer (newline followed by `#`, an unquoted heredoc, backticks or `$(…)` in a double-quoted body, a Write for `--body-file`); a quoted `--body` call with the heading lines that ran, or one denied as not permitted by the allow-list, stops the merge until the prompt change is revisited.
- After the merge: the `release` run of the merge commit is approved by the owner (identical code; `supabase db push` up to date) and its id noted for the closing docs PR.
- After the merge, the first real PR labelled `claude-review` gets an English review on Opus whose summary starts with the marker and `## Claude review: <VERDICT>`, with a `Commit <sha>` line and `### Findings` (or "None."), and the hide step lists it (restates archived row 2.5).
- That run's report and log show no permission denial for `gh pr comment`, `gh pr view`, `gh pr diff` or the inline tool: `permission_denials_count` 0, or only tools the prompt does not name (restates archived row 2.6).
- A second label run on the same PR minimizes the first marked summary and leaves the `ai-review` comment untouched (restates archived row 2.7).
- Over the first 2–3 real label runs no finding re-raises a trade-off documented in the PR body or plan (restates archived row 2.8).
- Closing docs PR: open-items 7.1 ticked with the run ids and outcomes, a note in `context/changes/deployment/deployment-plan.md` that the merge redeployed identical code (release run id, approval), then `/10x-archive claude-review-publish`.

**Implementation Note**: After completing this phase and all automated verification passes, the goal run ends; the session then runs the dry run (first Manual row), fixes the prompt on the same branch if it fails, triages `/10x-impl-review claude-review-publish`, pushes once and opens the PR. The remaining Manual rows are the owner's checklist on the PR and after the merge. Phase blocks use plain bullets; the `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/claude-review-dry-run.test.ts`: the summary body checks (template passes; `<h2>` heading, missing marker, `EOF` line, `ai-cr:summary` marker fail), the denial classification (fatal for `gh pr comment`, warning otherwise) and the stream parsing of a result line and a `permission_denied` line.

### Integration Tests:

- None in the repository: the integration test of this change is the CI label run. The fix PR's own run proves the diagnosis with the old prompt; the next labelled PRs after the merge prove the fix (Manual rows).

### Manual Testing Steps:

1. `node scripts/claude-review-dry-run.mjs 205 --claude "npx -y @anthropic-ai/claude-code@2.1.296"` on the implementation branch: read the recorded call, the body checks, the denials and the cost; iterate on the prompt until it exits 0.
2. After the push, add `claude-review` to the fix PR once; open the run's job page and read the Claude Code Report: the denied `gh pr comment … --body '…'` and its reason, the fallback and hide steps, `permission_denials_count` in the log.
3. After the merge, label the next PR (Dependabot's lockfile-only PR #206 is a cheap first candidate for the posting form and the report only: a failure before the model call, such as a missing token, is the bot-secrets lesson and not a prompt finding; rows 1.17–1.20 count from the first code PR): check the summary shape, the inline comments, the report, the hide step on a second run, and the trade-off rule over 2–3 runs.

## Performance Considerations

A label run takes about 19 turns and 80–100 s and reports about 0.8 notional USD on the subscription token (the two #205 runs); the dry run is the same order of magnitude per execution. `display_report` adds a few seconds and one step summary per run. No application code changes.

## Migration Notes

None. Rollback is a revert of the PR: the prompt returns to `--body '...'`, which fails as before, and the report stays harmless. No data, schema or deployment change beyond the identical-code `release` the merge triggers.

## References

- Research: `context/changes/claude-review-publish/research.md` (Findings 2, 3, 4, 6, 7)
- Change: `context/changes/claude-review-publish/change.md`; open items: `context/foundation/open-items.md:88-92`
- Archived predecessor: `context/archive/2026-10-18-claude-review/plan.md` (rows 1.8, 1.9, 2.5–2.8), `reviews/plan-review.md:47-69`, `reviews/impl-review.md:80-82`
- Workflow and prompt: `.github/workflows/claude-review.yml`, `.claude/review/claude-review.md`
- Action sources at the pinned commit: `anthropics/claude-code-action@1d6de8c` — `action.yml:152-159,326`, `src/entrypoints/run.ts:362-368`, `src/entrypoints/format-turns.ts:183-188,238-240,437`, `base-action/src/run-claude-sdk.ts:117-160`
- Posting pattern not used: `.github/workflows/review.yml:248-256`
- Script and test pattern: `scripts/migration-guard.mjs`, `tests/unit/migration-guard.test.ts`
- Lessons: `context/foundation/lessons.md` ("Implement plans with /10x-goal-implement", "Push the phase branch and open its PR only after the phase impl review is triaged", "Close every slice by merging to master, approving the production release and checking the production URL")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Step summary, dry-run script and the heredoc summary

#### Automated

- [x] 1.1 Workflow lints with actionlint
- [x] 1.2 `display_report: "true"` is set in the workflow
- [x] 1.3 Allow-list and model unchanged in the workflow
- [x] 1.4 Prompt posts the summary from a quoted heredoc and no longer bans it or uses `--body`
- [x] 1.5 Marker ban kept in the prompt
- [x] 1.6 `npm run lint` passes
- [x] 1.7 `npm run deps` passes
- [x] 1.8 `npm run test:unit` passes, the dry-run checks included
- [x] 1.9 Dry-run script parses and refuses to run without a PR number
- [x] 1.10 Prettier check passes on the edited files
- [x] 1.11 README names the report and the dry run
- [x] 1.12 open-items 7.1 names the report

#### Manual

- [ ] 1.13 Dry run on PR #205 exits 0 with one recorded heredoc summary and no denial for `gh pr comment`
- [ ] 1.14 Owner reads the workflow and prompt diffs before the merge
- [ ] 1.15 Label run on the fix PR shows the old prompt's denial reason in the Claude Code Report
- [ ] 1.16 `release` of the merge approved (identical code) and its run id noted
- [ ] 1.17 First real labelled PR after the merge gets the summary in the contract shape (archived 2.5)
- [ ] 1.18 Zero denials for the tools the prompt names in that run (archived 2.6)
- [ ] 1.19 Second label run minimizes the first summary and leaves ai-review untouched (archived 2.7)
- [ ] 1.20 First 2–3 real label runs re-raise no documented trade-off (archived 2.8)
- [ ] 1.21 Closing docs PR records the runs, ticks open-items 7.1 and notes the release in deployment-plan
