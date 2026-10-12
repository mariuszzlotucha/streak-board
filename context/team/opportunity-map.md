# Opportunity Map

## Context

- **Project / context**: streak-board, built solo with AI agent sessions through the 10x workflow (plan → implement → impl review → archive), one PR per phase and a gated production release. The signals come from the repo's own history: 254 non-merge commits, `context/foundation/lessons.md`, the impl reviews of the 15 archived changes (204 findings) and session notes from S-11.
  - _Bookkeeping-only commit_: a docs or chore commit whose subject records SHAs, ticks Progress rows or closes out a plan (42; one more fix commit also does a SHA write-back).
  - _Finding counts_ are impl review findings grouped by title; "~20" for signal 3 leaves out the smoke findings about scope, flakiness or a smoke bug.
- **Data constraint**: Mock / local / read-only / non-sensitive. Every candidate reads repo files, git and this repo's own GitHub metadata.
- **Date**: 2026-10-12

## Map

| Signal                                                                                                                   | Existing / default response                                                                 | Thin complement                                        | First useful version                                              | Data risk                       | Direction if valuable                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| Progress rows, roadmap status and deployment records drift from git and GitHub (42 bookkeeping-only commits, 9 findings) | GitHub (PRs, checks, releases); `/10x-status` (drift inside the markdown only); impl review | Read-only reconciler: the records against git and `gh` | `scripts/progress-drift.mjs`, replayed on the 15 archived changes | Local, read-only, non-sensitive | Internal tool → Review / CI gate                 |
| CLAUDE.md, README and roadmap lag the code (15 findings)                                                                 | Impl review (late); `/10x-rule-review`; `/10x-agents-md`                                    | Check the four lists CLAUDE.md copies from code        | Script printing missing and extra names                           | Local, non-sensitive            | Review / CI gate (about a third of the findings) |
| Smoke steps and tests pass without proving their outcome (~20 findings)                                                  | Stryker; S-10 test-coverage on the roadmap; impl review                                     | Smoke matcher that ignores serialized island props     | None yet; S-10 first                                              | Local, non-sensitive            | Wait (S-10 owns it)                              |
| Unrelated changes ride into phase commits (6 findings)                                                                   | Explicit-path staging rule; `prettier-ignore`; 10x-cli installs committed on their own      | None yet; later a staged-paths-vs-plan warning         | Config and habit                                                  | Local, non-sensitive            | Wait / no build                                  |
| Local smoke, Playwright and screenshot runs hit hidden environment preconditions (4 quirks in S-11)                      | README, session notes; smoke's build-mode probe                                             | Fail-fast hints in smoke's preflight                   | A few lines in smoke, shared with `ui-screenshots.mjs`            | Local; no secret value read     | Feature in the smoke script                      |

## Recommended First Candidate

```text
Candidate:
progress-drift: a read-only report of where the 10x records disagree with git and GitHub

Reads:
- context/changes/* and context/archive/*: plan.md Progress rows (index, [x]/[ ], SHA suffix), change.md status
- roadmap.md "At a glance" Status; deployment-plan.md "Phase N" headings and the phase numbers plans claim
- git: does each row's SHA exist and is it reachable from origin/master; merged branches with commits outside it
- GitHub via gh: PRs by branch name (state, head SHA, ci/smoke/integration results), release runs, production approvals

Returns:
One line per mismatch, naming the row and linking what contradicts it; exit 0 when nothing drifts.
On history it should have printed, for example:
  checkoff-and-leaderboard 6.2 [ ] "integration is green on the PR": PR #52 checks passed at 268221b
  s-11/dashboard-ui/phase-1: 1 commit not in origin/master after PR #102 merged (0b45e34)
  deployment-plan Phase 14: claimed by dashboard-ui and refactor-opportunities

Does not do:
- write anything: no ticks, no plan edits, no commits; it prints the fix and you or the agent apply it
- verify manual (owner-only) rows; it only flags a ticked manual row with no SHA or note
- keep state, or replace GitHub or /10x-status; it reads them on every run
- patch the 10x skills (10x-cli overwrites .claude/skills/10x-* on every lesson install)

Data risk:
Local, read-only, non-sensitive: repo files, git and this repo's own GitHub metadata. The gh token can
write, so the script calls only read commands (pr list/view, run list, api GET), never downloads job
logs and never prints the token.

Direction if it proves valuable:
Internal tool → Review / CI gate: /10x-impl-review and /10x-archive run it through a lessons.md rule;
later an advisory (non-required) CI job.
```

## Why This Candidate

- **It is the only signal that meets all six criteria.** It recurs in each of the 15 changes. It joins five sources (plan, roadmap, deployment plan, git, GitHub) and three roles (the implementing agent ticks rows, CI produces the results, the owner does the manual rows and approves releases). The pain is visible today: 42 follow-up commits, a commit stranded on a merged branch (`0b45e34`) and 9 review findings. It can be tested read-only on its own history, it reads GitHub and the plan files and stores nothing, and its later direction is clear.
- **Essential and accidental parts.** The Progress table stays: it is the agent's resume point and the only record of owner-only checks. The accidental part is re-typing facts that git and GitHub already hold, made worse by two timing traps: a commit cannot contain its own SHA, and, as the checkoff-and-leaderboard review put it, a CI row "could not be ticked in the PR itself, because the check result only exists once CI has run on the commit that would contain the tick."
- **Why not the others.** Signal 2 is the runner-up: same shape, but a list check reaches about 5 of its 15 findings and the rest is prose that needs the review. Signal 3 is judgment, and S-10 already owns it. Signal 4 needs config and a habit, not code. Signal 5 is a few lines inside smoke; fix it the next time smoke trips.
- **Kill criterion.** Replay the script on the 15 archived changes. If it flags fewer than half of the 9 known drift findings before their review did, or prints more noise than real drift, drop it and leave drift to the review. Only 5 of the 9 are mechanical, so 5 is the replay's ceiling (see `mom-test-validation.md`).

## Next Direction If Valuable

**Internal tool → Review / CI gate**, in this order, each step only if the previous one holds:

1. A `lessons.md` rule: `/10x-impl-review` and `/10x-archive` run `node scripts/progress-drift.mjs <change-id>` and resolve every line before the PR or the archive. The rule lives in `lessons.md` because the skills re-read it and it survives lesson installs; edits to the skill files do not.
2. An advisory CI job on pull requests. Never a required check: a required check must report on every PR, docs-only ones included (see `lessons.md`, "A required status check must report on every PR").
3. Stop hand-ticking what the report can read (CI-on-PR rows, commit SHAs), again through a `lessons.md` rule, so the follow-up "record SHA" and "record CI" commits disappear.

It must never become a second status store (no database, no dashboard): GitHub and the plan files stay the records.

Chosen next step (2026-10-12): validate with `/10x-mom-test`, then `/10x-shape` → `/10x-prd` → `/10x-roadmap` if the problem survives.

Validation (2026-10-12, `context/team/mom-test-validation.md`): the agent wrote all 42 bookkeeping commits and S-11 cost the owner almost no time, so the current read is **do not build yet**. A log kept over the next two slices decides.
