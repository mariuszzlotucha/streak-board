# Reviewers hardening after PR #225 and #226 — Plan Brief

> Full plan: `context/changes/reviewers-hardening/plan.md`

## What & Why

Close the gaps left by the two reviewer changes of 2026-10-20: the new `claude-review` prompt (#225) has never run on a real PR, the eval of the language sentence (#226) has no case with non-English input, its sentence misses the `### Not verified` notes, two provider errors could not be explained, and `compare` fails from a worktree. This is a quality slice of M-4 (S-24, anchor MS-05): nothing changes for the app's users, the owner gets reviewers they can rely on.

## Starting Point

`scripts/claude-review-dry-run.mjs` can run the prompt on a real PR but checks only the summary's shape, not the "no `@` mention, no link" rule of #225. The eval provider drops the cause of a schema error (`describeError` keeps only name and message). `reviewerRoot` resolves against the current checkout, so `eval-old` is found only from the main checkout. 15 eval cases exist, none with a non-English pull request.

## Desired End State

The dry-run checker rejects mentions and links, and the #225 prompt has run once on PR #226 with an English, mention-free, documentation-free summary on record. `compare` works from any worktree and a schema error in an eval run keeps its raw text head and tail, finish reason and cause. A 16th case (a Japanese PR) passes with an English summary, the sentence covers all natural-language text, and one capped eval session (at most 1.5 USD) is recorded.

## Key Decisions Made

| Decision           | Choice                                                                      | Why (1 sentence)                                                                     | Source       |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| Free code changes  | Both: dry-run mention/link check and eval error details, unit-tested        | The #225 rule becomes mechanical and the next schema error explains itself at 0 USD  | Plan (owner) |
| Eval budget        | 8.1 and 8.3 in one pass, 8.4 sample from a ~0.2 USD reserve, cap 1.5 USD    | One full pass (~1.0 USD) is all the cap allows, so both prompt-facing items share it | Plan (owner) |
| Dry-run            | One run on PR #226, on the subscription, outside the 1.5 USD cap            | #226's Markdown files test the "no documentation findings" rule on real input        | Plan (owner) |
| 8.6 proposals      | Parked in `open-items` with a trigger                                       | Neither has a measured problem and the #225 prompt is still untested                 | Plan (owner) |
| Phases             | Two phases, two PRs (tooling + dry-run, then the paid eval + prompt change) | The README requires a `REVIEWER_INSTRUCTIONS` change to land in its own PR           | Plan (owner) |
| `reviewerRoot` fix | Resolve against the main checkout via `git rev-parse --git-common-dir`      | Works from the main checkout and any linked worktree, no symlink needed              | Plan         |
| Cost basis         | Sum of reported costs plus the grader's, never the key's `usage` counter    | The counter lags (`lessons.md`)                                                      | Lessons      |

## Scope

**In scope:** open-items 8.1 to 8.5 (the 8.4 diagnostics in Phase 1, its sample in Phase 2), the new case, the sentence, README counts and the language bullets, `eval-results.md` and `dry-run-results.md`.

**Out of scope:** the `documentation` criterion, the schema and verdict rule, the production CLI's stderr, the review timeout, local verification of inline comments, 8.6, any full `old` run or second full `new` pass.

## Architecture / Approach

Phase 1 collects what costs nothing on OpenRouter: the `reviewerRoot` fix, the error details in provider and report, the stricter `checkSummaryBody`, and one subscription dry-run of `claude-review` on PR #226 (with one minimal prompt fix and a re-run only if a check fails). Phase 2 starts after PR A is merged and runs interactively: the owner's go on a quoted estimate, then the case alone, `new` on 16 cases, `old` only on misses, and the 8.4 sample if the running sum is at most 1.3 USD.

## Phases at a Glance

| Phase                              | What it delivers                                                                       | Key risk                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1. Free tooling and dry-run (PR A) | `compare` from a worktree, error details, mention/link check, dry-run on #226 recorded | The dry-run exposes a prompt flaw that needs a fix and a second run                              |
| 2. Paid eval session (PR B)        | Japanese-input case, all-text sentence, `eval-results.md` within 1.5 USD               | A longer sentence pushes `pr-103` reasoning toward 24,576, or a second miss exhausts the reserve |

**Prerequisites:** local Claude Code and `gh` for the dry-run; `OPENROUTER_API_KEY` in the shell and the owner's go for Phase 2; PR A merged before Phase 2.
**Estimated effort:** ~2 sessions across 2 phases (about 1 for the tooling and dry-run, 1 for the paid session).

## Open Risks & Assumptions

- `pr-110` is a known borderline miss on both reviewers; a second miss on another case must be re-run before it counts as a regression.
- The 1.5 USD cap leaves ~0.2 USD of margin after one full pass; the 8.4 sample is dropped, not squeezed, if the sum exceeds 1.3 USD.
- The estimate before the 8.4 sample is about 1.2 to 1.3 USD, so the sample is likely skipped; 8.4 is then left open with the trigger "next schema error in an eval run" instead of ticked.
- The Japanese case guards the #226 sentence; it does not force a `### Not verified` section, so the widening to those notes is stated as not measured.
- The dry-run cannot exercise inline comments, so the inline half of the #225 rules stays unverified until a real labelled PR.

## Success Criteria (Summary)

- The #225 prompt has produced one English, mention-free summary without documentation findings on PR #226.
- `compare` runs the old reviewer from a worktree and a schema error explains itself in the report.
- `new` passes the Japanese-input case and the 2026-10-20 cases (except the known `pr-110`) for at most 1.5 USD, recorded in `eval-results.md`.
