# Grid Mobile Readability (S-20) — Plan Brief

> Full plan: `context/changes/grid-mobile-readability/plan.md`
> Research: `context/changes/grid-mobile-readability/research.md`

## What & Why

The check-off grid is the widest view in the app and the one members open at every task. On a phone it does not fit: the current period's column is pushed off-screen, the page itself can be dragged sideways, and a long nickname paints over the first cells. S-20 makes the grid fit from 360 px up with no sideways scrolling, keeps nicknames and periods readable, and adds the gates that were missing when S-13 declared this done.

## Starting Point

The grid (S-13) is a content-sized `<table>` in `CheckoffGrid.astro`: 28 px cells, 4 px spacing, headers "Mo 5" / "from 14 Sep" that are wider than the cells, a name column with a "You" badge and a `truncate` that never fires, and `sr-only` cell labels that escape the scrolling wrapper and widen the page. Research measured it: 339–389 px of grid against 280 px of room at 360 and 295 at 375; the page is 392 px wide at a 375 px viewport.

## Desired End State

On any phone 360 px or wider every daily grid shows its 7 columns and every weekly grid its 4, with no sideways scroll of the page or the grid. Headers read like a calendar ("Mo" over "5"; "14 Sep"), a nickname takes at most two lines and then an ellipsis, the viewer's row is in medium weight (the "You" badge stays in the participants line). Desktop keeps a compact, left-aligned grid with the same headers. The screenshot script and the e2e round trip fail whenever a page or a grid scrolls sideways again.

## Key Decisions Made

| Decision          | Choice                                                                                                     | Why (1 sentence)                                                                                                                                                                         | Source   |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Horizon           | 7 / 4 / 1 columns and four cell states stay                                                                | PRD FR-013 fixes them; fewer columns is a PRD change, not a layout fix.                                                                                                                  | Research |
| Page scroll fix   | `relative` on the grid wrapper                                                                             | Measured: it clips the `sr-only` labels with the wrapper and leaves S-21's `GridCell.tsx` untouched.                                                                                     | Research |
| Target widths     | 360 px and up fit fully; at 320 the daily grid scrolls 38 px inside the wrapper, never the page            | 320 needs 24 px cells in S-21's file; 360/375/412 cover current phones.                                                                                                                  | Plan     |
| Name column       | Block inside the `th`: `line-clamp-2 wrap-anywhere`, 56 px floor and cap on phones, 128 px cap from 640 px | Two lines show about 14 characters at 4 px of extra row height; the cap on a block holds in WebKit too, and the floor makes a short room scroll the grid instead of squeezing the names. | Plan     |
| Header format     | Daily "Mo" over "5" in 28 px columns; weekly "14 Sep" in 48 px columns; once "Done"                        | Headers, not cells, set the column widths; a calendar-like daily header shows the weekend.                                                                                               | Plan     |
| Desktop           | Same headers everywhere, content-sized grid as today                                                       | One format, one test, no duplicated text in the DOM.                                                                                                                                     | Plan     |
| "You" in the grid | No badge; viewer's name in `font-medium` plus an `sr-only` "(you)"                                         | The badge took 40 of 48 px; the participants line keeps it; smoke and e2e do not read it inside the table.                                                                               | Plan     |
| Extra room        | 2 px cell spacing below 640 px (`max-sm:border-spacing-0.5`), 4 px on desktop                              | +18 px for names without touching the card chrome or the cell.                                                                                                                           | Plan     |
| Automated guard   | `ui-screenshots.mjs` gains a 360 px viewport and fails on sideways scroll; e2e asserts it too              | Every kitchen-sink state (incl. the 24-char name) is checked per phase; CI keeps the contract on real markup.                                                                            | Plan     |
| Phases            | Layout and gates in one commit, then release and devices                                                   | Owner's choice: one reviewable code phase; the gate is proven red once with the layout stashed.                                                                                          | Plan     |

## Scope

**In scope:** `grid-labels.ts` (`periodHeader` returns lines) with a unit test; `CheckoffGrid.astro` (wrapper, spacing, column widths, header lines, clamped name, viewer marker); `scripts/ui-screenshots.mjs` (360 px viewport, sideways-scroll failure) and the README sentence that names its viewports; one e2e assertion in `checkoff-round-trip.spec.ts` and a sentence in `test-plan.md` §6.3; kitchen-sink screenshots; release record and device screenshots.

**Out of scope:** horizon or cell states; card or page padding; `GridCell.tsx`, `ViewerGridCell.tsx`, `CheckoffControl.tsx`, `checkoff-sync.ts` (S-21, S-22); full fit at 320 px; scroll affordance; current-period or row marker (S-21); new tokens, breakpoints, fixtures; mutation testing of labels; the roadmap's north-star sentence (`/10x-roadmap`); PRD and CLAUDE.md (README only in the screenshot-script sentence).

## Architecture / Approach

Bound the table from the inside instead of stretching it: explicit period-column widths (`w-7` daily, `w-12` weekly and once), header text shortened to fit them, the name in a two-line block with a 56 px floor and cap inside the row header, the badge out, 2 px spacing on phones. Result: daily 278 px, weekly 268 px, once 118 px on phones (room 280 at 360, 295 at 375, 332 at 412); daily 368 px and weekly 352 px on desktop. The wrapper is `relative`, so the cells' `sr-only` labels no longer widen the page. The screen-reader labels, the `<table aria-label>` and the row regexes stay as they are, so smoke and e2e pass unchanged and S-22 can run in parallel.

## Phases at a Glance

| Phase                        | What it delivers                                                                                            | Key risk                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Layout and gates          | The fitting grid, the header unit test, the 360 px gate with the sideways-scroll failure, the e2e assertion | A 360 px failure outside the grid (another card) shows up in the new gate and must not be silenced |
| 2. Release and device checks | Release record; owner's Android before/after, iPhone (WebKit), Android with large text                      | WebKit or a fallback font renders wider than Chromium measured; text scaling outgrows the room     |

**Prerequisites:** planning PR merged and `master` pulled; local Supabase stack for smoke and e2e; the owner's Android and a group member's iPhone for Phase 2; the "before" screenshot taken before the release is approved.
**Estimated effort:** one `/10x-goal-implement` run for Phase 1 (one commit, one PR), then one release and a short closing docs PR for Phase 2.

## Open Risks & Assumptions

- Every pixel was measured in Chromium with Outfit at 100 % text scaling; a wider fallback font or WebKit's table layout could add a few px, and the daily grid has only 2 px to spare at 360. Phase 2's iPhone row is the check.
- With large system text the grid outgrows the room on purpose and scrolls inside its wrapper (the name floor prevents the squeeze that would otherwise hide the problem from the gate); Phase 2's Android row checks that it stays readable.
- `line-clamp` relies on `-webkit-box`; supported in current Chromium, Firefox and WebKit, confirmed on the iPhone in Phase 2.
- The e2e assertion depends on the project's viewport (test-plan §6.3 prefers width-independent assertions); it is recorded there as a deliberate exception.
- The production group's nicknames and the owner's phone width are unknown; the fixtures' 24-character name is the worst Latin case, a wide-script name of 24 characters is clamped the same way.

## Success Criteria (Summary)

- A member opens the dashboard on a 360 px or wider phone and sees every column of every grid without dragging anything sideways; the owner's after-screenshot shows it.
- Long nicknames stay inside their column, two lines at most, and never cover a cell; the participants line still says who is "You".
- `scripts/ui-screenshots.mjs` and the e2e round trip go red when a page or a grid scrolls sideways again, proven once on the old markup.
