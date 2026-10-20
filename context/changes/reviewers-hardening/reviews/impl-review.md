<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Reviewers hardening after PR #225 and #226

- **Plan**: context/changes/reviewers-hardening/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Both phases had their own review (`impl-review-phase-1.md`, `impl-review-phase-2.md`, all findings fixed); this review looks at what they could miss. Success criteria re-run on the merged state (767dbcc): 782 unit tests, lint clean, 3 valid eval configs, no "15 cases" in the README grep; the eval results directory is gitignored. Every item of the Desired End State and of both phases' Changes Required is MATCH, except two documented deviations: the rubric of `non-english-input` is looser than the plan's wording (disclosed in `eval-results.md`), and `lessons.md:213` was changed to 16 cases although the plan left it (fixed by the phase 2 review). No part of "What We're NOT Doing" was touched. Cross-phase checks that came out clean: `provider.ts` and `report.ts` are not imported by production code, `errorDetail` is bounded (400 characters per field) and carries no headers or keys, the memo of the main checkout cannot go stale within a process, and the real example body of `.claude/review/claude-review.md` passes `checkSummaryBody`.

## Findings

### F1 — The comment on the 65,536-character cap says it keeps the regexes from running for seconds, but it does not

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:118
- **Detail**: The code-span regex is quadratic on a long run of backticks. Measured on the merged code: 65,536 backticks take 2.6 s, 30,000 take 0.56 s, 10,000 take 61 ms; other adversarial shapes stay under 1 s. It is slow, not exponential, and a real summary is a few thousand characters, so this is a nuisance of a local pre-check, not a vulnerability. The comment claims the cap prevents seconds of work, which is false at the cap.
- **Fix**: Reword the comment to what the cap does: it matches GitHub's limit and bounds the work, and the worst case at the cap is about 3 s for one long run of backticks. No behaviour change.
- **Decision**: FIXED (Fix now): the comment at the cap now says what the cap does and that the worst case is about 3 s; no behaviour change. The script is a `.mjs`, so this PR is a code change for CI and the gated release (the owner chose it knowing that).

### F2 — 8.4 is ticked but still carries its old "stays open" sentence and a live trigger, and the CI schema error has no diagnostics

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/foundation/open-items.md:101 (8.4), roadmap.md S-24 Outcome / MS-05
- **Detail**: 8.4 is `[x]` because the sample ran (the plan allows it), yet its text still says the item "stays open until the sample is done" and keeps the trigger "next schema error in an eval run". A trigger on a ticked item is not revisited. The only real schema error of the day happened in CI (PR #230, first `ai-review` run), where the production CLI prints no text or cause by the plan's own decision, so the Phase 1 diagnostics do not reach it. The roadmap promises provider errors "measured on new and old", which was not possible: zero errors in 22 eval runs, `old` skipped.
- **Fix**: Reword the stale sentence in 8.4, and add an open item 8.7 for the part that is still undecided: a schema error in CI shows only its message; trigger "a second `response did not match schema` in CI", then decide whether `review.ts` may print `finishReason` and the text length (not the text) to the run log.
  - Strength: keeps the trigger on an open item that §8 will show, and keeps the data-egress decision with the owner.
  - Tradeoff: one more open item in a list that was about to be closed.
  - Confidence: HIGH — the plan itself excluded the CLI stderr as "a data-egress decision of its own".
  - Blind spot: whether one more CI error is likely enough to justify the item at all.
- **Decision**: FIXED (Fix now): the stale sentence in 8.4 is rewritten and open item 8.7 holds the CI schema error with its trigger (a second one in CI).

### F3 — Closing records are missing: no S-24 entry in the deployment plan and a stale cost figure in the roadmap

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md (no S-24 entry), context/foundation/roadmap.md S-24 Risk
- **Detail**: Both merges touch `packages/code-reviewer/` and so ran `ci`, `smoke`, `e2e`, `integration` and the gated `release` (runs 39441344500 for #229, released; 39449289445 for #230, waiting for the owner). Sibling slices S-21 and S-22 record such runs and approvals in the deployment plan; S-24 has no entry. The roadmap Risk line still says "około 1 USD za przebieg 15 przypadków" while the measured pass is 0.72 USD for 16 cases.
- **Fix**: In the archive PR, once the owner has approved the #230 release, add the S-24 entry (run IDs, approval, application unchanged) and correct the roadmap figure.
- **Decision**: FIX QUEUED (Fix now, in the archive PR): the S-24 entry in `deployment-plan.md` and the roadmap figure are written there, after the owner approves the releases of #230 and of this PR.

### F4 — The plan's Phase 2 text still carries the rubric wording that was replaced

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/reviewers-hardening/plan.md Phase 2, change 1 (Contract)
- **Detail**: The plan says "no Japanese prose outside quoted code"; the case file ran and passed with a looser rubric (the review's own text in English, short quotations allowed). `eval-results.md` explains it, but a reader of the plan alone sees a different assertion than the one in the case.
- **Fix**: Add one sentence to the `Notes` of `change.md` pointing to `eval-results.md` ("the rubric of `non-english-input` was loosened after its first run"); the phase blocks of the plan stay read-only.
- **Decision**: FIXED (Fix now): one sentence in the Notes of `change.md`.

### F5 — The eval README does not warn that the report prints raw model text

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/README.md (Report section)
- **Detail**: For a schema error the report prints the head and tail of the model's text (up to 400 characters each). The result files are gitignored, but the printed lines are easy to paste into a committed `eval-results.md`; for the historical cases that text is repository code.
- **Fix**: Add one sentence to the Report section: the text head and tail are raw model output, so quote only their length and finish reason in committed files.
- **Decision**: FIXED (Fix now): one sentence in the Report section of `packages/code-reviewer/evals/README.md`.

### F6 — The new sentence is a comma-spliced list

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/prompts/reviewer.ts:45
- **Detail**: "Write all natural-language text of the review in English, the summary, every finding, …" reads as an apposition; a colon would read better. Both `ai-review` (on PR #230) and this review noted it. Changing the prompt text means a new eval pass and its own PR, which the package README requires for any `REVIEWER_INSTRUCTIONS` change; the sentence is also quoted in `packages/code-reviewer/README.md`.
- **Fix**: Leave it for the next prompt change; no paid pass for a cosmetic edit.
- **Decision**: SKIPPED: a cosmetic edit of the prompt needs a paid eval pass and its own PR; left for the next prompt change.

## Triage

F1, F2, F4 and F5 fixed, F3 queued for the archive PR, F6 skipped (2026-10-20).
