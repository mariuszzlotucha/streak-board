---
date: 2026-10-18T02:26:34+02:00
researcher: Claude (Opus 5.5) with Mariusz Złotucha
git_commit: e4dee30e81c017943e123c2c7966d852eb25f52a
branch: master
repository: streak-board
topic: "claude-review prompt: how it is defined and how it performed, how to improve it, and how to move it to a separate file"
tags: [research, ci, code-review, claude-code-action, prompt, github-actions, security]
status: complete
last_updated: 2026-10-18
last_updated_by: Claude (Opus 5.5)
---

# Research: improve the claude-review prompt and move it to a separate file

**Date**: 2026-10-18T02:26:34+02:00
**Researcher**: Claude (Opus 5.5) with Mariusz Złotucha
**Git Commit**: e4dee30e81c017943e123c2c7966d852eb25f52a (master; uncommitted: this change folder)
**Branch**: master
**Repository**: streak-board

## Research Question

From the owner (2026-10-18), for `.github/workflows/claude-review.yml`: improve the prompt, and move the prompt to a separate file. For planning:

1. How is the prompt defined and fed to the action today, and what constraints were recorded around it?
2. Which mechanisms does the pinned `claude-code-action` offer for a prompt kept in a file, and which of them keep a PR from rewriting its own review instructions?
3. How did the current prompt perform on real PRs, and what concrete weaknesses should the improved prompt fix?

## Summary

- **Today the prompt is a 113-line inline `prompt:` block in Polish** (`.github/workflows/claude-review.yml:66-179`): a generic Astro review template with seven checklists, a CRITICAL/HIGH/MEDIUM/LOW scale, a verdict APPROVED/NEEDS ATTENTION/REJECTED and a fixed summary shape. Only two lines were ever added since the first version (a3b34fd): "read CLAUDE.md" (69617d0, `:83`) and the `<!-- ai-cr:summary -->` marker ban (d09ab4e, `:179`). The ci-cd plan froze the prompt on purpose ("Prompt, tools, label removal and pins unchanged", `context/archive/2026-10-14-ci-cd-code-review/plan.md:290`); no archive plans or rejects a rewrite.
- **The pinned action (v1.0.248, `1d6de8cb`) has no prompt-file input.** Its only prompt input is `prompt` (action `action.yml` L57-60); `prompt_file` exists only in the low-level `base-action`, which lacks the inline-comment MCP server and the base-branch config restore. The action does no `$VAR` substitution and adds no repo/PR text of its own in agent mode (`src/modes/agent/index.ts` L85-90), so the `REPO:` / `PR NUMBER:` header must stay in the inline `prompt:`.
- **Where the file lives decides who controls it.** On PR events the action restores `.claude/`, `CLAUDE.md` and six other paths from `origin/<base.ref>` before the CLI starts (`src/entrypoints/run.ts` L254-275, `src/github/operations/restore-config.ts` L26-35; verified at the pinned SHA). So a prompt file under `.claude/` that Claude reads at run time comes from the base branch, and a PR cannot rewrite its own review instructions. A file elsewhere (e.g. under `.github/`) or a file read by a workflow step _before_ the action comes from the PR's merge checkout. That is the same trust level as today's inline prompt, which also sits in a PR-controlled file.
- **Four mechanisms were examined; two are workable without new risk:**
  1. A short inline `prompt:` (REPO/PR header plus "read `<file>` and follow it"), with Claude reading the file through its read-only file tool. It uses the same path the prompt already relies on for CLAUDE.md (`:83`).
  2. `claude_args: --append-system-prompt-file <abs path>` with the same short inline `prompt:`. The flag exists in the CLI the action pins (2.1.296) and reaches the CLI unchanged, but delivery through the Agent SDK is **not verified end-to-end**.
  3. A pre-step that reads the file into a step output. It always reads the PR's copy, even under `.claude/`, and `${{ }}` is not expanded inside the file.
  4. A project slash command. This is blocked by `--setting-sources user` (`claude-review.yml:64`), which the env-scrub hardening requires.
- **On 24 completed reviews (PRs #116-#191, 2026-10-14..17) the prompt produced 0 CRITICAL, 0 HIGH, 3 MEDIUM and 22 LOW findings.** One MEDIUM was a real SSRF fixed in 466ebaa (#175), and at least four LOWs led to fixes. The recurring weaknesses are:
  - it ignores the PR description and plan, which produced a false positive on #180;
  - the verdict rule is undefined: LOW-only reviews were marked NEEDS ATTENTION on 3 runs and APPROVED on others, and 2 headings read "NEEDS ATTENTION → APPROVED";
  - the output language is unspecified: 16 PL, 7 EN, 1 mixed;
  - the summaries repeat boilerplate impact lists;
  - it asks for build/lint/tsc checks that its tool allow-list forbids: 10 of 23 runs that log the count had permission denials;
  - it has no strategy for large diffs;
  - it contains checks that don't apply here (`client:client`, getStaticPaths, prerendering, image optimization);
  - it covers none of this repo's real review surfaces (Supabase RLS migrations, Workers runtime, `astro:env` secrets, middleware gates, CSP, smoke invariants, token lint rules, privacy-policy rule, generated `src/types.ts`).

## Detailed Findings

### 1. How the prompt is fed today

- Trigger: `pull_request` `labeled` on `master`; the job runs only when the label `claude-review` is added and the head is in this repository (`claude-review.yml:10-18`). Job-level concurrency per PR, 30 min timeout (`:20-23`).
- Checkout: the default for `pull_request` (the merge ref), `fetch-depth: 1`, `persist-credentials: false` (`:32-37`). Line 177 of the prompt says "the PR branch is already checked out". That is inaccurate: it is the merge commit at depth 1, so a local `git diff` against the base does not work. The review history shows the model using `gh pr diff` instead (run 38592940294).
- Tools: `--setting-sources user` plus `--allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"` (`:63-65`). The checkout has no `node_modules` (there is no install step in `:31-58`).
- Auth: `claude_code_oauth_token` from `CLAUDE_CODE_OAUTH_TOKEN` (`:58`; README.md:522). No `--model` is set. Runs used the action's default model (the worker read `claude-sonnet-5-5` from run results).
- Env scrub: `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"` (`:55`), which needs the bubblewrap step (`:42-48`).
- Prompt text: `${{ github.repository }}` and `${{ github.event.pull_request.number }}` are the only expressions (`:67-68`). The rest is static Polish text.

### 2. Mechanisms for a prompt in a file (pinned action `anthropics/claude-code-action@1d6de8cb`, v1.0.248)

Sources are at `https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/`.

- **Inputs.** `action.yml` L7-167 defines no `prompt_file`, `prompt_path`, `override_prompt`, `direct_prompt` or `custom_instructions`. The last three are deprecated (`docs/usage.md` L100-102, `docs/migration-guide.md` L20-22). The internal `INPUT_PROMPT_FILE` is hard-wired in the step env (`action.yml` L320), so it can't be redirected.
- **Prompt processing.** Agent mode writes `inputs.prompt` verbatim to the prompt file (`src/modes/agent/index.ts` L85-90). Repo, PR and branch go only into the MCP server config (L109-119), not into Claude's text. The docs recommend `${{ }}` expressions and a `REPO:` / `PR NUMBER:` header (`docs/usage.md` L178-195). An empty `prompt` on a `labeled` event falls through to agent mode with just "Repository: owner/repo" (`src/modes/detector.ts` L63-80), so a non-empty inline `prompt:` must remain.
- **Base-branch restore (verified locally at the pinned SHA).**
  - On PR events, `run.ts` L254-275 calls `restoreConfigFromBase(pull_request.base.ref)` after setup and before the prompt is prepared and the CLI runs (`run.ts` L285-300).
  - The restore covers exactly `.claude`, `.mcp.json`, `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md` and `.husky` (`restore-config.ts` L26-35).
  - The PR's own copies are kept in `.claude-pr/` "for review agents (not executed)" (`restore-config.ts` L278-292).
  - Consequences:
    - CLAUDE.md, which the prompt tells Claude to read (`claude-review.yml:83`), is already the base copy.
    - A prompt file under `.claude/` read at run time is the base copy.
    - Any workflow step before the action, and any path outside the restored set, sees the PR's merge checkout.
- **Option 1: Claude reads the file.** Inline `prompt:` = header plus one instruction to read and follow `<path>`. Reading files works without an allow-list entry: the prompt already relies on it for package.json and CLAUDE.md (`:79-84`), and runs cite CLAUDE.md content (#175 run 2 cites the smoke `role="alert"` invariant). Instructions stay in the user turn, as today. A run cannot be checked for whether the file was actually read, because full output is off (finding 3.7).
- **Option 2: `--append-system-prompt-file`.**
  - The action pins CLI 2.1.296 (`src/entrypoints/run.ts` L52-53, L80) and Agent SDK 0.3.296 (`package.json` L15).
  - `claude_args` is parsed with shell-quote. `--model`, `--max-turns`, `--add-dir`, `--allowedTools`/`--disallowedTools` and `--setting-sources` become SDK options; every other flag goes to the CLI unchanged as `extraArgs` (`base-action/src/parse-sdk-options.ts` L133-187, L204-266, L333-348).
  - A local probe with CLI 2.1.302 showed both `--append-system-prompt-file` and `--system-prompt-file` are recognised and resolve relative paths against the cwd. So an absolute path is safer: `${{ github.workspace }}/<path>`.
  - Not verified: that the flag survives the SDK's `initialize` message, where `appendSystemPrompt` is undefined because `action.yml` never sets `APPEND_SYSTEM_PROMPT` (`run.ts` L296). Verifying it needs one real run, e.g. a file that asks for a marker token in the summary.
  - Use the append form: `--system-prompt-file` would drop Claude Code's default prompt and its tool guidance.
- **Option 3: pre-step to a step output.** For example `prompt: ${{ steps.p.outputs.prompt }}`, filled with the `name<<DELIM` syntax. The step runs before the restore, so it reads the PR's copy even under `.claude/`. Per-run values (repo, PR) would need substituting in the step (`envsubst`/`printf`). There is no official main-action example; the only prompt-from-file example is for `base-action` (`base-action/examples/issue-triage.yml` L45-104).
- **Option 4: project slash command / skill / subagent.** Project commands, skills, agents, CLAUDE.md and `.claude/settings.json` load only under the `project` setting source (Agent SDK docs, "Source / What it loads"; the action maps `--setting-sources` to `settingSources`, `parse-sdk-options.ts` L338-348). Enabling `project` would bring back the developer allow-list that `--setting-sources user` was added to exclude (`claude-review.yml:60-62`; `context/archive/2026-10-14-ci-cd-code-review/reviews/impl-review.md:76-115`).
- **Path constraints in this repo.**
  - `.gitignore:30` ignores `.claude/**/10x-*` and `.github/**/10x-*`, and `.gitignore:33` ignores `.claude/prompts/m*`, so a committed prompt must not match these names.
  - `.claude/prompts/` holds course-lesson prompts (all current files start with `m1`…`m5` or `skill-`).
  - The precedent for keeping a prompt apart from its runner is `packages/code-reviewer/prompts/reviewer.ts:1-5` ("kept apart from the agent so evals can vary or snapshot them").

### 3. Performance of the current prompt on real PRs

Scope inspected: all 32 runs of `claude-review.yml` (gh run list), the 24 completed reviews on 22 PRs (#116-#191), their issue comments and inline review comments (ai-review comments excluded by marker), the result block of each run log, and follow-up commits.

- **Failures.** All 3 failures are setup failures, none caused by the prompt: runs 38590496287 and 38591651406 (#116, API key not scoped to a workspace) and 38601483702 (#117, missing bubblewrap). 5 more runs were skipped because a different label was added.
- **Cost and size.** 4-18 turns, 16-114 s, a notional $0.11-0.42 per run (subscription token).
- **Totals.** Over the 24 completed reviews: 0 CRITICAL, 0 HIGH, 3 MEDIUM and 22 LOW findings, with 8 inline comments in total. Verdicts: 17 APPROVED, 5 NEEDS ATTENTION, 2 contradictory, 0 REJECTED.

Strengths, each with its evidence:

- **3.1 It found a real defect the gate missed.** On #175 it reported a blind SSRF through unrestricted `https://` push endpoints (MEDIUM, https://github.com/mariuszzlotucha/streak-board/pull/175#discussion_r4302946052), fixed by 466ebaa. The ai-review summary visible on #175's final head lists two minors. Its first-head output was overwritten in place, so whether ai-review flagged it then is unknown.
- **3.2 Findings that were acted on:**
  - #175 RemindersToggle focus loss (r4303073369, fixed in 9ba856d);
  - #182 false success toast (r4304431173, fixed in 3e16781);
  - #133 LOW, which led to `e2e` being added to `release.needs` (`context/changes/deployment/deployment-plan.md:295`);
  - #133 MEDIUM on `postinstall` (r4289294992), which led to a pin in ed73bb0. The owner declined the rest with facts (https://github.com/mariuszzlotucha/streak-board/pull/133#issuecomment-6204520498).
- **3.3 It does not pad reviews on docs-only or CI-only PRs.** #125, #127, #130, #145 and #148 got APPROVED with no findings. #126 said that none of the Astro/React/SSR checks apply.

Weaknesses (each is a candidate requirement for the new prompt):

- **3.4 No PR intent or plan context.**
  - On #180 an inline LOW (r4304130467) called the records-log ordinal edits "unrelated to this PR". The PR title is "feat(reminders): send each push in its own invocation; fix records-log ordinals" (checked with `gh pr view 180`).
  - Trade-offs documented in the PR were re-raised as LOWs on #156, #168 and #191.
  - The prompt mentions neither the PR body, `context/changes/<id>/plan.md` nor `context/foundation/lessons.md` (`claude-review.yml:66-179`).
  - By contrast, ai-review's prompt reads CLAUDE.md at base, searches lessons.md, reads the change's plan.md at head and checks callers (`packages/code-reviewer/prompts/reviewer.ts:64-73`).
- **3.5 Undefined verdict rule.**
  - LOW-only reviews were marked NEEDS ATTENTION on #128, #182 and #133 (run 1), but APPROVED on 10 other runs.
  - #129 (https://github.com/mariuszzlotucha/streak-board/pull/129#issuecomment-6200736800) and #184 (https://github.com/mariuszzlotucha/streak-board/pull/184#issuecomment-6241349177) open with "NEEDS ATTENTION → APPROVED".
  - The prompt names the three verdicts but no rule mapping severities to them (`claude-review.yml:168-169`).
- **3.6 Unspecified output language.** 16 reviews in Polish, 7 in English, and #184 mixed. The two runs on #175 used different languages. README, workflow comments and ai-review comments are in English. The only written language rule covers commit messages (`context/foundation/lessons.md:5-10`).
- **3.7 Asks for checks the tools forbid.**
  - The prompt asks to consider `npm run build`, lint and TypeScript (`:142`) and to read the repo, but the allow-list permits only `gh pr comment|diff|view` (`:65`), and there are no `node_modules`.
  - Summaries say so: #175 run 2 ("nie było… node_modules") and #182 ("brak zgody na komendy").
  - 10 of the 23 run logs that report `permission_denials_count` show a count above 0 (counted from the saved logs; the denied calls were Bash commands other than `gh pr *` and a Write to `/tmp/…` for `--body-file`).
- **3.8 Boilerplate and duplication.**
  - The required impact list (SSR, CSR, routing, security, performance) and the "extra tests" line (`:172-173`) are filled with "brak" on docs-only PRs (#127-#130, #145, #148).
  - Inline findings are restated in the summary (#116, #121, #128, #133, #175, #180, #182).
  - Most LOWs land only in the summary although the prompt says line-specific findings go inline (`:166`): #143, #156, #168, #177, #184 and #191.
  - Some LOWs aren't code findings ("e2e not run locally", #184), or are explicitly pre-existing (#126).
- **3.9 Large diffs.** In the one run with a full transcript (38592940294, before the CLAUDE.md line existed), the model ran `gh pr diff | head -c 40000` and read 2 files. #175 (185 KB diff) was reviewed only in part, and the review says it "did not go through the whole 185 KB diff". The prompt gives no strategy (e.g. `gh pr diff --name-only` first, then per-file review by risk).
- **3.10 Comment format.**
  - No reviewed head SHA. ai-review prints the short head SHA (README.md:508).
  - No sticky behaviour: re-runs add comments, so #133 and #175 each have two.
  - The heading format varies.
- **3.11 Inapplicable or wrong checks in the prompt.** Checked against `src/` at e4dee30:
  - `client:client` (`:109`) is not an Astro directive, and `client:media` is missing. The repo uses only `client:load`, 25 times (grep over `src`).
  - getStaticPaths and static rendering (`:93`, `:96`, `:129`) don't apply. There are 0 matches for `getStaticPaths` and 0 for `prerender = true` in `src`, and the app is `output: "server"` (CLAUDE.md, Architecture).
  - `set:html` / `dangerouslySetInnerHTML` (`:120`) have 0 matches in `src`. That is harmless as a check, but low-yield.
  - Image optimization (`:127`) has nothing to review in this app.
  - The "don't assume NestJS / Spring Boot" line (`:86`) is template residue.
- **3.12 Missing repo-specific surfaces.** The prompt omits the rules CLAUDE.md states for:
  - Supabase migrations: RLS with per-operation policies, `security definer` functions, file naming;
  - generated `src/types.ts` (never hand-edited);
  - `astro:env/server` secrets;
  - `PROTECTED_ROUTES` and the nickname gate in `src/middleware.ts`;
  - CSP and security headers;
  - the smoke regex invariants;
  - the ESLint no-literals/token rules;
  - the privacy-policy-in-the-same-change rule;
  - `export const prerender = false` on API routes;
  - the Workers runtime (crons in `wrangler.jsonc`).

  The model picked some of these up on its own: RLS and grants on #125, #156 and #184.

## Code References

- `.github/workflows/claude-review.yml:10-23`: trigger, same-repo guard, concurrency, timeout
- `.github/workflows/claude-review.yml:32-37`: merge-ref checkout, depth 1, no persisted credentials
- `.github/workflows/claude-review.yml:50-65`: action pin v1.0.248, env scrub, OAuth token, `--setting-sources user`, tool allow-list
- `.github/workflows/claude-review.yml:66-179`: the inline Polish prompt (header `:67-68`, checklists `:88-143`, reporting rules `:145-173`, tool/marker lines `:177-179`)
- `.github/workflows/claude-review.yml:181-193`: trigger-label removal (404 tolerated)
- `.github/workflows/review.yml:121-127,143,150`: ai-review checks out the base commit and fetches the PR head as objects only
- `packages/code-reviewer/prompts/reviewer.ts:1-5,23-46,64-73,90-153`: the ai-review prompt (English; untrusted-data rule, findings format, repo-reading order, fenced inputs)
- `README.md:508`: sticky-comment matching and the claude-review marker ban; `README.md:522`: secrets; `README.md:526-528`: the claude-review section
- `.gitignore:30,33`: ignore patterns that constrain the prompt file's name

## Architecture Insights

- **Trust levels in this repo's review workflows:**
  - ai-review runs its reviewer and prompt from the PR's base commit ("A PR cannot rewrite its own judge", `context/archive/2026-10-14-ci-cd-code-review/plan-brief.md:38`; `review.yml:117-120`).
  - The workflow files themselves run from the PR on `pull_request`. The accepted guarantee is that "the owner reads a PR touching `.github/`; its green checks are no evidence" (README.md:507; `context/archive/2026-10-14-ci-cd-code-review/reviews/impl-review-phase-2.md:85-119`).
  - claude-review's inline prompt sits under that `.github/` guarantee today.
  - A prompt file under `.claude/` read at run time is stronger than today: it comes from the base branch via the action's restore. The cost is that a PR changing the prompt is not exercised by its own run. The prompt change must land on `master` first, which is the same rule README.md:507 sets for the ai-review prompt.
  - A prompt file outside `.github/` and outside the restored set would be weaker than today: a PR could change it without touching `.github/`.
- **Two review prompts, two styles.**
  - ai-review: English, a structured `ReviewResult`, a written verdict rule, and repo context read through tools, with untrusted-input fencing.
  - claude-review: Polish, a free-form comment, no verdict rule, and repo context limited to CLAUDE.md.
  - The improved claude-review prompt can borrow ai-review's proven parts: the intent-first reading order, "a suspicion you cannot point to is not a finding", the findings cap and the "Not verified" section (`reviewer.ts:28-44`). It stays advisory and comment-based.
- **Evals.** The repo's eval suite drives `reviewDiff` from `packages/code-reviewer` via OpenRouter (`packages/code-reviewer/evals/provider.ts:1-15,313-331`). It cannot run claude-review. The eval lesson (`context/foundation/lessons.md:211-216`) applies to `packages/code-reviewer` only. A claude-review prompt change has no automated regression check. The practical check is live runs on real PRs (adding the label), plus re-running on one or two past PRs whose outcome is known (e.g. #175's first head for the SSRF, #180 for the intent false positive).

## Historical Context (from prior changes)

- `context/archive/2026-10-14-ci-cd-code-review/plan-brief.md:44`: "Keep `claude-review.yml` on demand, hardened; impl-review-ci later". Still supported: the workflow is label-only (`claude-review.yml:18`).
- `context/archive/2026-10-14-ci-cd-code-review/plan.md:279-290` (contract #11): job id, same-repo guard, concurrency, timeout, "Prompt, tools, label removal and pins unchanged". The first four are still supported. The prompt has changed by two lines since (69617d0, d09ab4e), so "unchanged" held for that change only.
- `context/archive/2026-10-14-ci-cd-code-review/reviews/impl-review.md:76-115` and `follow-ups/review-fixes.md:45-52` (full-review F1, Fix A): `--setting-sources user`, env scrub, `persist-credentials: false`, and the "read CLAUDE.md" line. Supported (`claude-review.yml:37,55,64,83`). The residual risk was accepted: an allowed `gh pr comment` could post `.git/config` containing the job token the action writes into the remote URL (`review-fixes.md:52`).
- `context/archive/2026-10-14-ci-cd-code-review/follow-ups/review-fixes.md:38`: API key → subscription OAuth token. Supported (`claude-review.yml:58`).
- `context/archive/2026-10-14-ci-cd-code-review/follow-ups/review-fixes.md:66`: the inline-comment path was not exercised live at that time. Contradicted later: 8 inline comments were posted on PRs #116-#191 (e.g. r4302946052 on #175).
- `context/archive/2026-10-16-code-review-evals/plan.md:315-331`: the marker ban in the claude-review prompt. Supported (`claude-review.yml:179`); README.md:508 documents it.
- `context/archive/2026-10-14-ci-cd-code-review/reviews/plan-review.md:90`, `plan.md:56`: an older CLAUDE.md rule "run the eval suite before changing the review prompt or model". It is no longer in CLAUDE.md, and it applied to the ai-review prompt.

## Related Research

- `context/archive/2026-10-14-ci-cd-code-review/research.md`: original research for both review workflows (Open Question 8, `:150`, lists the claude-review options).
- `context/archive/2026-10-16-code-review-evals/plan.md`: eval suite and gate hardening, including the marker ban.

## Open Questions

Product choices for `/10x-plan`. The research does not decide them.

1. **File location and trust level.**
   - `.claude/…` (base-branch copy; a PR cannot rewrite its judge; prompt changes land on `master` first and are tried on the next PR).
   - `.github/…` (PR copy, same as today; a PR changing the prompt is reviewed with its new prompt).
   - The file name must avoid `.gitignore:30,33`.
2. **Mechanism.** Option 1 (Claude reads the file; uses a path already working) or option 2 (`--append-system-prompt-file`; needs one verification run, see §2).
3. **Output language** for the posted comments: English, matching README and ai-review, or Polish, matching most past runs. And the language of the prompt file itself.
4. **Verdict rule.** For example: APPROVED when no MEDIUM or higher; NEEDS ATTENTION at any MEDIUM/HIGH; REJECTED at CRITICAL. Or drop the verdict, since the review is advisory and the gate is ai-review.
5. **Summary shape.** Whether to keep the impact list and "extra tests" line (boilerplate on docs-only PRs, 3.8), add the reviewed head SHA, cap the number of findings, and stop restating inline findings.
6. **Tool allow-list.** Whether to allow `gh pr diff --name-only` / `gh api` reads, or `Write` to a temp file for `--body-file` (both were denied in past runs, 3.7). Otherwise the prompt must stop asking for build/lint/tsc. Any widening is a security decision under the F1 hardening.
7. **Sticky comment.** Whether re-runs should edit the previous claude-review summary (needs its own marker, distinct from `<!-- ai-cr:summary -->`) or keep adding comments.
8. **Verification.** Which past PRs to re-run the new prompt on, and how many runs count as enough. There is no automated eval for claude-review.
