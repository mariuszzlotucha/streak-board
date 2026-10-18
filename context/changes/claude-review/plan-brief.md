# Claude review prompt in its own file — Plan Brief

> Full plan: `context/changes/claude-review/plan.md`
> Research: `context/changes/claude-review/research.md`

## What & Why

The advisory `claude-review` runs on a generic, inline Polish Astro template. Over 24 reviews it caught one real SSRF and a few useful LOW findings. It also:

- ignored PR intent;
- gave inconsistent verdicts;
- drifted between languages;
- asked for checks its tools forbid;
- repeated boilerplate.

This plan moves the prompt into its own file and rewrites it for this repository.

## Starting Point

- `.github/workflows/claude-review.yml:66-179` holds the whole prompt inline.
- The pinned `claude-code-action` (v1.0.248) has no prompt-file input.
- On PR events the action restores `.claude/` and `CLAUDE.md` from the base branch before Claude starts.

## Desired End State

- `.claude/review/claude-review.md` holds an English prompt. The workflow's inline prompt is only the REPO/PR header, a read-and-follow instruction, and a fallback for a missing file.
- On a labelled PR, Claude (pinned to `claude-opus-5-5`):
  - reads the PR's intent and plan;
  - applies the rules from `CLAUDE.md` and `lessons.md`;
  - posts inline findings and one marked summary: `## Claude review: <VERDICT>`, the commit, at most 8 findings, and "Not verified".
- The verdict follows a fixed severity rule. A re-run minimizes older summaries.

## Key Decisions Made

| Decision          | Choice                                                                      | Why (1 sentence)                                                                                     | Source   |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Prompt location   | `.claude/review/claude-review.md`                                           | The action restores `.claude/` from base, so a PR cannot rewrite its own review (as ai-review does). | Plan     |
| Delivery          | Short inline prompt; Claude reads the file                                  | Uses the read path already working for `CLAUDE.md`; `--append-system-prompt-file` is unverified.     | Plan     |
| Output language   | English (prompt and comments)                                               | Matches README, ai-review and the commit rule; ends the 16 PL / 7 EN / 1 mixed drift.                | Plan     |
| Verdict           | REJECTED if any CRITICAL, NEEDS ATTENTION if any HIGH/MEDIUM, else APPROVED | Deterministic; fixes inconsistent LOW-only verdicts and "A → B" headings.                            | Plan     |
| Tools             | Allow-list unchanged; prompt names the tools                                | Keeps the F1 hardening; removes the cause of the permission denials.                                 | Plan     |
| Re-runs           | Marker + workflow step minimizes older summaries                            | One visible current review; `--edit-last` could hit ai-review's comment (same bot).                  | Plan     |
| Model             | Pin `claude-opus-5-5`                                                       | Depth over speed for an on-demand advisory run; stable across action bumps.                          | Plan     |
| Repo rules        | Pointer list + read `CLAUDE.md` / search `lessons.md`                       | Rules stay single-sourced and come from base.                                                        | Plan     |
| Rollout           | One PR                                                                      | Owner's choice; the PR's own run hits the missing-file fallback.                                     | Plan     |
| Verification      | First 2-3 real PRs after the merge                                          | Owner's choice; no eval exists for claude-review.                                                    | Plan     |
| Mechanism options | Pre-step output and slash command rejected                                  | Pre-step reads the PR copy; slash command needs `--setting-sources project`.                         | Research |

## Scope

**In scope:**

- the new prompt file;
- the inline prompt switch;
- the `--model` pin;
- the step that hides older summaries;
- the README section;
- the post-merge live checks.

**Out of scope:**

- ai-review and `packages/code-reviewer`;
- allow-list, trigger, permissions, env scrub;
- an eval for claude-review;
- a seeded verification PR;
- hiding the old unmarked summaries;
- CLAUDE.md and lessons changes.

## Architecture / Approach

1. Label added; the workflow (from the PR) checks out the merge commit.
2. The action restores `.claude/` and `CLAUDE.md` from `master` and starts Claude with the short inline prompt.
3. Claude reads `.claude/review/claude-review.md`, follows its reading order (PR intent, `CLAUDE.md`, `lessons.md`, plan, diff), and posts inline comments plus one marked summary.
4. The workflow step minimizes older marked summaries, and the label is removed.

## Phases at a Glance

| Phase                                 | What it delivers                                              | Key risk                                                                                |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Prompt file and workflow switch    | English prompt file, short inline prompt, Opus pin, hide step | Prompt quality only shows on real PRs; the hide step's match must never touch ai-review |
| 2. README and post-merge verification | Documented behaviour; live checks on the next real PRs        | Verification lands after the merge and depends on upcoming PRs                          |

**Prerequisites:** planning branch `claude-review/plan` merged. Implementation on `claude-review/implementation` from fresh `origin/master`.
**Estimated effort:** one `/10x-goal-implement` run (2 phases) plus 2-3 label runs on later PRs.

## Open Risks & Assumptions

- Claude must actually read the prompt file. That can't be seen in logs while full output is off; the summary format is the evidence.
- Opus runs are slower; the 30-minute timeout is assumed to be enough.
- The implementation PR itself is never reviewed with the new prompt: base-copy timing. The action leaves the PR's `.claude/` readable under `.claude-pr/`, so the inline prompt forbids following anything there.
- The summary must go in one single-quoted `gh pr comment --body`: run 38592940294's permission checker denied `sed`, an unanalysable body and a Write to `/tmp`.

## Success Criteria (Summary)

- A labelled PR gets an English review in the new summary format, with a verdict consistent with its findings.
- A re-run leaves exactly one visible current summary, and ai-review's comment is untouched.
- No finding re-raises a trade-off the PR documents, and no permission denials for tools the prompt mentions.
