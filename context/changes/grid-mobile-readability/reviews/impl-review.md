<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Grid Mobile Readability (S-20)

- **Plan**: context/changes/grid-mobile-readability/plan.md
- **Scope**: Phase 1 of 2 (Phase 2 holds only owner-run manual rows and has no implementation to review)
- **Reviewed phases**: 1
- **Date**: 2026-10-19
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

Success criteria: unit tests (727), lint, prettier and `astro check` (0 errors) were re-run for this review and pass. Build, smoke (331 steps), the e2e round trip in both projects, the screenshot gate at 360/375/1280 px, the red proof and the full suite (1199 tests) ran green in the implementation run on the same code, before the SHA write-back commit. Manual rows 1.8, 1.9 and 2.1 to 2.5 are unticked and stay pending with the owner.

## Findings

### F1 — Screenshot gate passes when a state has no grid

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-screenshots.mjs:366-375
- **Detail**: The check maps over `table[aria-label^="Check-offs of "]` and passes silently when the set is empty. If the aria-label is renamed, a state loses its grid or the fixture changes, the gate stays green and checks nothing. Only the manual stash proof (row 1.7) showed it can go red.
- **Fix**: For the task-carrying states (`owner`, `member`, `long-text`) fail when no grid was found, or print "N grids checked" once at the end of the run.
- **Decision**: FIXED — `GRID_STATES` in `open()` fails the run when `owner`, `member` or `long-text` shows no grid; proven red with the list set to `no-group`, then restored.

### F2 — E2E helper measures before the font is ready

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/checkoff-round-trip.spec.ts:39-53 (call at :98)
- **Detail**: `expectNoSidewaysScroll` reads the overrun right after `toBeAttached()`. Attached does not mean the Outfit variable font has loaded, and fallback metrics differ, so a reading before the swap could be a false green or a false red. The screenshot script waits for `document.fonts.ready`; the helper does not. Hydration is not an issue (`ViewerGridCell` renders the same markup as `GridCell`).
- **Fix**: Add `await page.evaluate(() => document.fonts.ready)` at the top of the helper.
- **Decision**: FIXED — `expectNoSidewaysScroll` waits for `document.fonts.ready` first; e2e passes in both projects.

### F3 — The 360 px width is covered by the screenshot gate only

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/checkoff-round-trip.spec.ts:39-53; context/foundation/test-plan.md §6.3
- **Detail**: The e2e projects run at 1280 and 412 px (Pixel 7) with one short nickname, so 360 px and the long-text clamp are guarded by the screenshot run alone. The test-plan sentence ("każdy projekt sprawdza przy własnej szerokości") is accurate and does not claim 360 px. Related to row 1.7: the e2e went red on the stashed layout through the page assertion (12 px at 412) before reaching the grid-wrapper assertion, so it does not name a grid as the plan's wording says; the screenshot run does.
- **Fix**: Leave as is, and do not describe 360 px as covered by e2e.
- **Decision**: SKIPPED — accepted: the screenshot gate covers 360 px and the long-text clamp; e2e is not described as covering them.

### F4 — The width budget is tight and its numbers live in two places

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/dashboard/CheckoffGrid.astro:23-37,54; src/lib/grid-labels.ts:18-22
- **Detail**: At 360 px the room is 280 px and the daily grid is 278 px, so 2 px remain. Larger text or a narrower inset makes the wrapper scroll, and the page stays put (the plan accepts this). The unit test guards a character-count proxy, not width, and the 28/48 px column widths appear both in the `grid-labels.ts` comment and as `w-7`/`w-12` in the Astro file.
- **Fix**: Optionally add a comment in `CheckoffGrid.astro` pointing at `grid-labels.ts` for the column widths. The screenshot gate stays the real guard.
- **Decision**: FIXED — the `CheckoffGrid.astro` comment now names the 28/48 px columns and points at `periodHeader` in `grid-labels.ts`.

### F5 — Names are clipped without a full-name hint and the "You" marker is weaker

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/components/dashboard/CheckoffGrid.astro:51-61
- **Detail**: A nickname longer than about 16 characters is cut with an ellipsis and a sighted user cannot read the rest in the grid (the accessible name stays complete). On desktop the one-line `truncate` became a two-line clamp, and `min-w-14` makes every name column at least 56 px. The visible "You" badge in the grid became medium weight plus an sr-only "(you)". This follows the plan's decision; the Leaderboard and Members cards still show the pill.
- **Fix A ⭐ Recommended**: Keep as planned, and let the owner judge it on the screenshots (row 1.8).
  - Strength: Matches the plan, the "What We're NOT Doing" list and the screenshots the owner reviews.
  - Tradeoff: A long name cannot be read in full from the grid.
  - Confidence: HIGH — the plan states the trade-off explicitly.
  - Blind spot: Real phones; rows 2.2 to 2.4 will show whether the weaker marker is noticed.
- **Fix B**: Add `title={name}` to the name span.
  - Strength: Desktop pointer users get the full name on hover.
  - Tradeoff: No effect on touch screens, and it adds markup outside the plan.
  - Confidence: MEDIUM — hover is not the phone case this slice targets.
  - Blind spot: Whether the repo uses `title` for truncated text elsewhere.
- **Decision**: ACCEPTED via Fix A — kept as planned; the owner judges the clipped name and the weaker marker on the screenshots (row 1.8) and the devices (rows 2.2 to 2.4).

### F6 — The page-level check now covers every captured page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-screenshots.mjs:366-373
- **Detail**: The sideways-scroll check also runs on the `public` and `controls` sets, once at load. Any unrelated overflow at 360 px now fails the run, which the plan intends. States a control opens later, such as a dialog, are not measured. The `/* global document */` line is the conventional ESLint annotation and is accepted.
- **Fix**: None needed.
- **Decision**: SKIPPED — accepted: no change needed.
