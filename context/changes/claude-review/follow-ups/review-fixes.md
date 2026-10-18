# Review follow-ups — claude-review

From `reviews/impl-review.md` (2026-10-18). Both are checks on the live label runs after the merge, not code changes now.

- **F4 — re-minimizing already hidden summaries.** On the second label run of one PR (Progress 2.7), read the "Hide older Claude review summaries" step log. A repeated "Could not minimize the summary …" line for a summary that is already hidden means GitHub rejects re-minimizing. If so, open a follow-up change: list the comments through GraphQL and skip `isMinimized` ones.
- **F6 — "a change no phase asks for is a finding".** Over the first 2-3 real label runs (Progress 2.5-2.8), note any finding raised against plan bookkeeping: Progress ticks, `change.md` status, review reports under `context/changes/`. If one appears, open a follow-up change that exempts that bookkeeping in `.claude/review/claude-review.md` (reading-order step 5).
