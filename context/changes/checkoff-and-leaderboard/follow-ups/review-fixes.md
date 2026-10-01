# Review follow-ups: checkoff-and-leaderboard

Queued by `/10x-impl-review checkoff-and-leaderboard phase 1` (`reviews/impl-review-phase-1.md`, F9). Apply them when the named phase is planned or implemented.

- **Phase 3, `uncheck` for weekly tasks**: delete the rows of the whole current week (`period >= Monday` and `period <= Monday + 6`), not only the row whose period equals `periodKeyFor(...)`. `snapshotOf` snaps any weekly key to its Monday, so a non-Monday row inserted directly through the API (inside the RLS window, trust-based per the PRD) would keep the week "Done" after Undo.
- **Phase 4, `Leaderboard.tsx` and `dashboard.astro`**: export `UNKNOWN_MEMBER` from `src/lib/leaderboard-rules.ts` and use it for the displayed fallback (and for `dashboard.astro:101` and `:144`), so the sort fallback and the displayed fallback cannot drift apart.
