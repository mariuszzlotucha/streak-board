# Grid state feedback (S-21) — Plan Brief

> Full plan: `context/changes/grid-state-feedback/plan.md`
> Frame brief: `context/changes/grid-state-feedback/frame.md`
> Research: `context/changes/grid-state-feedback/research.md`

## What & Why

The real problem, from the frame: the grid has no visual language for "now". Nothing marks the current period's column, and the undone current cell looks like "not applicable" (the same grey as a not-joined cell, almost the same as a missed one), so a viewer on a phone cannot find their cell for today or this week at once, and after a tick that cell dissolves into the green of past days. This plan marks the current column's header and draws the undone current cell as an outlined to-do box. The "confirmation after a tap" of MS-02 is, by the owner's decision, the change the tap already makes; it becomes legible once the column is findable, and nothing is added after the save.

## Starting Point

`CheckoffGrid.astro` knows which column is current but renders every header alike; `GridCell.tsx` draws `open` and `notJoined` with the same classes, a dash apart, and `missed` with a pink fill 1.01:1 from the grey. Smoke and e2e bind the cell's sr-only label and "Done today"; no test reads the cell's classes. The contrast gate has no `primary on card` pair. The e2e spec's bare `getByText("1")` will collide with a header "1" from 2026-11-01.

## Desired End State

In every daily and weekly grid the current column's header is darker, medium weight, underlined in the primary green, `aria-current`, and read as "Su 11 today" / "5 Oct this week". An undone current cell is a white box with a green border and dash; not-joined stays blank grey; missed stays pink with a red X; done stays solid green. On a tick the viewer's cell turns green inside the marked column; on undo it is the outlined box again. The gates bind all of it, and nine screenshots record it.

## Key Decisions Made

| Decision                    | Choice                                                                                                     | Why (1 sentence)                                                                                                                  | Source |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| What "zaległe" means        | Both the undone current period and closed misses, readable apart                                           | Owner's answer; the two are different states in `grid-rules.ts`                                                                   | Frame  |
| Confirmation after a tap    | The existing flip (row, cell, streak); nothing after `saved`                                               | Owner's position; no toast per tick (2026-10-17); `saved` is S-22's moment                                                        | Frame  |
| Weekly remaining-time cue   | Out of scope                                                                                               | Owner: weekly "open" all week is fine; FR-013 keeps four states                                                                   | Frame  |
| Current-period mark         | Header only: foreground colour, medium weight, 2 px primary underline, `aria-current="true"`, sr-only word | One file, survives the tick, no new token, no cell contract change; a 28 px column fits no word                                   | Plan   |
| Open-cell look              | Outlined to-do box: `border-2 border-primary bg-card text-primary`, dash kept                              | Three fills now differ (white / grey / pink); primary on card is 5.37:1; icon still carries the state                             | Plan   |
| Border vs ring              | Border                                                                                                     | A ring is painted outside the box and has only the 2–4 px outer border-spacing to live in; a border stays inside the 28 px square | Plan   |
| Where the sr-only word goes | On the header, not in the cell label                                                                       | Keeps `periodName`, the S-20 unit tests, smoke's and e2e's period matches unchanged                                               | Plan   |
| Not-joined look             | Unchanged blank grey                                                                                       | With `open` outlined, blank grey reads as "not applicable" without a new mark                                                     | Plan   |
| New gate                    | `primary on card` in `token-contrast.mjs`; a string-render unit test of `GridCell`                         | Research found no test binds the cell's classes; the pair was ungated                                                             | Plan   |
| E2E "1" collision           | Fixed here: streak assertions scoped to the streak element                                                 | Owner's choice; the spec is edited anyway for `aria-current`                                                                      | Plan   |
| Phases                      | One phase; release and device checks are manual rows                                                       | Owner: two phases too granular; fits the goal-run lesson                                                                          | Plan   |
| Effort                      | Planned at high, not the lesson's max                                                                      | Owner chose to continue at high (2026-10-20)                                                                                      | Plan   |

## Scope

**In scope:**

- Header mark, `aria-current` and sr-only word in `CheckoffGrid.astro`; `currentPeriodWord` in `grid-labels.ts`
- `open` as an outlined box in `GridCell.tsx`
- `primary on card` pair in `token-contrast.mjs`
- Unit test of `GridCell` markup; `currentPeriodWord` test
- Smoke step for the marked header; one clause in `CLAUDE.md`
- E2E: `aria-current` assertion and the scoped streak locator
- Nine committed screenshots; deployment-plan Phase 29 (closing docs PR) superseding Phase 28's device rows, plus a resolution note under S-21's Unknowns in the roadmap

**Out of scope:**

- Any element after `saved`, toast, cell flash; any edit to `CheckoffControl.tsx`, `checkoff-sync.ts`, `ViewerGridCell.tsx` (S-22)
- A fifth state, a weekly countdown, a mark on `once` tasks, a column tint, a ring on the viewer's cell
- New tokens, `.dark` edits, device screenshots, the midnight-stale snapshot and the Warsaw-only boundary

## Architecture / Approach

Two static markup decisions at render time: the header loop in `CheckoffGrid.astro` marks the `<th>` at `current` (daily and weekly), and the state map in `GridCell.tsx` gives `open` its outline. The island keeps rendering `GridCell`, so the live cell follows for free. Each gate that already watches the grid is extended at the point it binds: contrast (`PAIRS`), smoke (a header matcher), e2e (`aria-current`, a `streakOf` helper), screenshots (the `states` set), plus a new string-render unit test for the cell.

## Phases at a Glance

| Phase                                     | What it delivers                                                                                                   | Key risk                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Current-column mark and the to-do cell | Marked header, outlined open cell, extended gates, nine screenshots; then release and device checks as manual rows | `font-medium` widening a 28 px header (caught by the screenshot run's scroll check); `react-dom/server` in the unit project (fallback: bind in e2e) |

**Prerequisites:** S-20 released (done, Phase 28); planning PR merged; a session with the local Supabase stack for smoke and e2e.
**Estimated effort:** one goal run for the automated rows, then the owner's screenshot review, merge, release approval and device checks.

## Open Risks & Assumptions

- The header mark and the outline are rendered from the server snapshot: after Warsaw midnight an open page marks yesterday's column until the next tick reloads it, exactly as the whole grid is stale today (frame, dimension 3).
- `.dark` is never applied at runtime; its `primary`/`card` values are recorded only, and this plan adds no token, so "w obu motywach" is satisfied by the existing document.
- The unit test asserts class names; it is the contract this slice is about, and a later restyle updates the test with the look.
- Smoke and the e2e round trip use daily tasks only, so "this week" is bound by the `currentPeriodWord` unit test and reviewed in the weekly grids of the screenshots (row 1.10).

## Success Criteria (Summary)

- A member on a phone finds the current column and their undone cell at a glance, with no legend.
- After a tap the green cell sits inside a marked column, and the undo brings back the outlined box.
- Every gate that watches the grid binds the new marks, and the e2e job no longer fails on the 1st–7th of a month.
