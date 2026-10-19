# Claude Review Publish — Plan Brief

> Full plan: `context/changes/claude-review-publish/plan.md`
> Research: `context/changes/claude-review-publish/research.md`

## What & Why

The on-demand Claude review (`claude-review` label) ran twice on PR #205 on 2026-10-19, ended `success` with 3 and 2 permission denials and posted nothing, so the archived rows 2.5–2.8 of the `claude-review` change were never met. The research reproduced the cause locally: Claude Code's Bash tool rejects a quoted argument containing a newline followed by `#`, and the summary the prompt mandates (`<!-- claude-review:summary -->`, then `## Claude review: …`) always has that sequence when passed as `gh pr comment <n> --body '…'`. This plan makes the review post again and makes the next silent failure readable.

## Starting Point

`.github/workflows/claude-review.yml` runs `anthropics/claude-code-action` v1.0.248 with a four-entry allow-list and `--setting-sources user`; `.claude/review/claude-review.md` mandates `--body '...'` and claims that `cat`, `head`, `sed` and heredocs are denied. The job log prints only the init and result lines, the full transcript stays on the runner, and the hide step matches `\n## Claude review: `, which the `<h2>` summary the model improvised on PR #198 does not satisfy.

## Desired End State

A label run posts one summary in the documented shape through a quoted heredoc (`gh pr comment <n> --body-file - <<'EOF' … EOF`) plus inline comments, with zero denials for the tools the prompt names. Every run's job page shows the action's redacted Claude Code Report (each tool call, result and denial reason). `node scripts/claude-review-dry-run.mjs <pr>` exercises the prompt locally without posting, and README and open-items describe all three.

## Key Decisions Made

| Decision                 | Choice                                                              | Why (1 sentence)                                                                                                                                            | Source   |
| ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Cause of the silent runs | Newline-plus-`#` validation of a quoted Bash argument               | Reproduced on 26 local probes; every summary CI ever posted has `#` only as the body's first character                                                      | Research |
| Posting form             | Quoted heredoc via `gh pr comment <n> --body-file -`                | Passed with the full contract body (apostrophes, backticks, `##` lines); allow-list, marker, hide filter and README shape stay                              | Plan     |
| Transcript capture       | `display_report: "true"` (redacted step summary)                    | No cost, readable on the run page, redacted by the action; the artifact and `show_full_output` would publish unredacted transcripts of a public repository  | Plan     |
| Pre-merge confirmation   | Local dry run before the push, one label run on the fix PR after it | The dry run exercises the new prompt on Opus; the label run reads the old prompt from `master` and shows its denial reason in CI (2.1.296) before the merge | Plan     |
| Dry run as a gate        | Manual row with unit-tested checks, not an Automated gate           | Its outcome depends on the model; the body and denial checks are pinned by a unit test instead                                                              | Plan     |
| Hide filter and fallback | Unchanged                                                           | The fix restores `## `, and the one-line fallback comment passed on PR #195                                                                                 | Plan     |
| Allow-list               | Unchanged (no `Grep`, `Write`, comment tool)                        | The failure is pre-permission validation; widening would not help and the archived plan froze the list                                                      | Research |
| Prompt scope             | Sections 2 and 11 only                                              | Reading order, finding rules, severity, verdict and the template are not involved                                                                           | Plan     |
| Structure                | One phase, one PR                                                   | Owner chose to combine diagnostics and fix; the fix PR's own label run doubles as the diagnosis run                                                         | Plan     |
| Roadmap                  | Off-roadmap tooling change                                          | The predecessor `claude-review` was off-roadmap too                                                                                                         | Plan     |
| Cost wording             | Notional USD from the subscription token                            | `total_cost_usd` is an API-price figure; the run uses `CLAUDE_CODE_OAUTH_TOKEN` (`README.md:523`)                                                           | Research |

## Scope

**In scope:**

- `display_report: "true"` and comments in `.github/workflows/claude-review.yml`
- Prompt sections 2 and 11: the heredoc posting rule and an accurate tool list
- `scripts/claude-review-dry-run.mjs` with `tests/unit/claude-review-dry-run.test.ts`
- README Claude review section (summary form, diagnostics, dry run) and open-items §7.1
- Post-merge verification of the archived rows 2.5–2.8 as Progress rows, and the closing docs PR

**Out of scope:**

- Step-posted summary via `--json-schema`, artifacts, `show_full_output`, HTML headings, hide-filter or allow-list changes, `track_progress`
- Any change to `ai-review`, the archived plan, the roadmap, or `deployment-plan.md` inside this PR
- A stub MCP server for inline comments in the dry run

## Architecture / Approach

The workflow gains one input; the prompt changes the one shell call that failed; a Node script reproduces the CI permission setup locally (same allow-list, `--setting-sources user`, a `gh` wrapper first on `PATH` that forwards reads and records `pr comment`) and checks the recorded body; README and open-items document the three. The fix PR's own label run exercises the old prompt from `master` with the new report, so the diagnosis is confirmed in CI before the merge; the next labelled PRs exercise the fixed prompt.

## Phases at a Glance

| Phase                                                   | What it delivers                                                                                           | Key risk                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Step summary, dry-run script and the heredoc summary | Report on every run, heredoc summary in the prompt, dry-run tool with tests, README and open-items aligned | The model may still deviate from the heredoc form, or CI 2.1.296 may differ from the probed 2.1.303; both show in the dry run and the fix PR's label run |

**Prerequisites:** the planning PR merged and `master` pulled; a local Claude Code login (subscription) for the dry run; Docker for actionlint; the owner available to label the fix PR once and to approve the identical-code `release`.
**Estimated effort:** one goal run plus the dry run and the impl review (one session), then 2–3 labelled PRs over the following days and one closing docs PR.

## Open Risks & Assumptions

- The newline-plus-`#` rule was executed on Claude Code 2.1.303; CI installs 2.1.296 through the pinned action. The CHANGELOG between them lists no Bash-rule change and the PR #198 `<h2>` workaround fits the rule; the fix PR's own label run settles it before the merge. The plan review ran the two decisive probes on 2.1.296 (the `--body '…'` form denied, the quoted heredoc allowed), and the dry run takes `--claude` so row 1.13 runs on that version.
- The dry run has no inline MCP tool, so the model may try another route for inline findings; only a denial for `gh pr comment` fails the run, other denials are reported.
- The dry run and every label run use the owner's subscription quota (about 0.8 notional USD each).
- The fix is first exercised in CI only after the merge (the prompt is read from `master`); a wrong form costs another PR.

## Success Criteria (Summary)

- The next labelled PR after the merge gets one summary in the documented shape and inline comments, with `permission_denials_count` 0 for the tools the prompt names, and a second run minimizes the first summary.
- The fix PR's own label run shows the old prompt's denial reason in the Claude Code Report, proving the diagnosis in CI.
- `node scripts/claude-review-dry-run.mjs <pr>` exits 0 on the fixed prompt and `npm run test:unit` covers its checks.
