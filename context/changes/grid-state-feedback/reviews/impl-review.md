<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Grid state feedback (S-21)

- **Plan**: context/changes/grid-state-feedback/plan.md
- **Scope**: Full plan (Phase 1 of 1)
- **Reviewed phases**: 1
- **Date**: 2026-10-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- Plan drift: items 1-8 all MATCH (`grid-labels.ts`, `CheckoffGrid.astro`, `GridCell.tsx`, `token-contrast.mjs`, both unit test files, smoke matcher and its two uses, e2e helpers, nine screenshots); item 9 is deferred to the closing docs PR by design. "What We're NOT Doing" respected: S-22's three files untouched, no token or `.dark` edit, no fifth state, no mark on `once`, no ring, nothing after `saved`. EXTRA is bookkeeping only (Progress ticks, `change.md`, roadmap S-21 `in-progress`).
- Automated rows re-run in this review on the unchanged code tree (`git diff 2edc074 -- src scripts tests CLAUDE.md` empty): unit 733/733, lint, prettier, `astro check` 0 errors, build exit 0, contrast `primary on card` 5.37:1 PASS, S-22 diff empty, nine PNGs present. Smoke (331 PASS), e2e (5/5), the visual gate ("All screenshots taken") and the red proof ran on the same tree during the goal run and are not repeated here.
- Manual rows 1.10-1.16 are all unticked: pending, none ticked without evidence.
- Probed by the quality agent: the smoke regex rejects no mark, wrong word, an earlier or a non-last marked `<th>`, a marked `<th>` in `<tbody>` and another task's `<li>`, with no backtracking blow-up; the e2e locators are date-independent and the same on both projects; no XSS surface (the word is a constant).

## Findings

### F1 — The "outlined box" unit test does not pin the border width

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/grid-cell.test.ts:39-43
- **Detail**: The test asserts `border-primary` and `bg-card` only. In Tailwind 4 with preflight, `border-primary` sets just the colour and the border width stays 0, so removing `border-2` from `STATE_CLASSES.open` keeps the test green while the outline disappears: the feature this slice is about.
- **Fix**: Also assert `border-2` (and `text-primary`, the dash colour) in that test.
- **Decision**: FIXED: Fix now. The open-cell test also asserts `border-2` and `text-primary`; break-check: removing `border-2` from `STATE_CLASSES.open` turns it red.

### F2 — The icon test does not tell the three icons apart

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/grid-cell.test.ts:32-37
- **Detail**: It counts one `<svg` per state with an icon, so swapping the `Minus` of `open` or the `X` of `missed` for another icon would still pass. The shape is the only non-colour cue for the state.
- **Fix**: Assert `lucide-check`, `lucide-x` and `lucide-minus` on `done`, `missed` and `open` respectively.
- **Decision**: FIXED: Fix now. The icon test asserts `lucide-check`, `lucide-x` and `lucide-minus` per state; break-check: `open` drawn with `Check` turns it red.

### F3 — The marked header is 2 px taller than its neighbours

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dashboard/CheckoffGrid.astro:46-48
- **Detail**: `border-b-2` adds height to the marked `<th>` only; the other headers, vertically centred in the row, sit about 1 px higher than the marked one. Not visible in the nine screenshots at the sizes shot. Fixing it (`border-b-2 border-transparent` on the unmarked branch) would shift every header by a pixel and require the nine screenshots to be retaken and reviewed again.
- **Fix**: Leave as is, or add `border-b-2 border-transparent` to the unmarked headers and retake the screenshots.
- **Decision**: FIXED: Fix now. Every header has `border-b-2` (transparent unless marked), so the row's headers keep one height. This deviates from plan item 2 ("every other `<th>` is unchanged") on purpose; the nine screenshots were retaken, smoke 331 PASS, e2e 5/5, "All screenshots taken".

## Noted, no action

- `aria-current="true"` on the header plus the sr-only word may be announced twice by some screen readers; `aria-current="date"` is more precise, but smoke and e2e pin `"true"` and the plan chose it.
- `.dark` is never applied at runtime; if it ever is, the dark `primary` on `card` is about 2.2:1 (the plan records this).
- Smoke and e2e cover the daily grid only; the weekly wiring is bound by the `currentPeriodWord` unit test and the screenshots (plan review F1, accepted).
