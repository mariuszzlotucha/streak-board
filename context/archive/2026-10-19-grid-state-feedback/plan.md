# Grid state feedback (S-21) Implementation Plan

## Overview

Give the check-off grid a visual language for "now": the current period's column header is marked (visibly, with `aria-current` and a screen-reader word), and the undone current cell is drawn as an outlined to-do box instead of the same grey square as a not-joined cell. The confirmation half of MS-02 is, by the owner's decision in the frame, the change the tap already makes: once the column is findable, the viewer sees their cell turn green in a marked column. Nothing is added after the save, no toast, and the check-off handler stays untouched, so S-21 stays independent of S-22.

## Current State Analysis

From `frame.md` (hypothesis table) and `research.md`:

- **Nothing marks the current column.** `src/components/dashboard/CheckoffGrid.astro:16` computes `current` and uses it only at `:67` to pick the viewer's island; the header loop `:35-44` gives every `<th>` `px-0.5 font-normal text-muted-foreground` and the width class. No `aria-current` exists outside the Main nav; no page text names today; `periodName` and `cellLabel` (`src/lib/grid-labels.ts:29-33`, `:43-51`) carry no "today". After a tick the viewer's cell is the same green as every past done cell (`src/lib/grid-rules.ts:59-60`), so the column vanishes.
- **Two grey states, one look.** `src/components/tasks/GridCell.tsx:10-11` gives `open` and `notJoined` the same `bg-muted text-muted-foreground`; the difference is a 16 px `Minus` (`:25`). `missed` is `bg-destructive/10 text-destructive` with an `X` (`:9`); its fill is 1.01:1 from `muted`, so it differs by hue and glyph only. `notJoined` is common: every task created this week shows it in every row for the days before creation (`grid-rules.ts:61`, `:94`).
- **What binds the markup.** Smoke reads the cell's sr-only label as the last `</span>` of the row's last `<td>` (`scripts/smoke.mjs:228-235`); e2e finds the viewer's cell by `^nick, [^:]+: (open|done)$` (`tests/e2e/checkoff-round-trip.spec.ts:33-37`) and asserts the streak with bare `getByText("0"|"1", { exact: true })` (`:97`, `:105`, `:114`, `:122`, `:129`, `:163`), which collides with the daily header "1" on the 1st–7th of a month (next 2026-11-01). No unit test reads the cell's classes or icons; the unit project runs in Node and `react-dom` is installed, so a component can be rendered to a string.
- **Tokens and gates.** `scripts/token-contrast.mjs:16-36` gates `:root` pairs only; `primary` is not paired with `card` there (`success`, with the same value today, is). With the gate's own method: primary on card 5.37:1, primary on muted 4.82:1, a `border`-colour outline on card 1.25:1. `.dark` is never applied at runtime (research); "w obu motywach" is a document check, and this plan adds no token.
- **Prior decisions kept.** No toast per tick (`context/archive/2026-10-17-frontend-notifications/plan-brief.md:24`); `role="alert"` only for errors; the sr-only label contract of S-13; the S-20 layout contract (no sideways scroll from 360 px, 28/48 px columns, the `states` screenshot set fails on overflow).
- **Decided in the frame (2026-10-19).** "Zaległe" means both the undone current period and closed misses; the weekly seven-day "open" needs no remaining-time cue; the confirmation is the existing flip; the main concern is the current column.

## Desired End State

On `/dashboard`, in every daily and weekly grid, the current period's column header stands out (foreground colour, medium weight, a 2 px primary underline), is `aria-current="true"`, and reads "Su 11 today" or "5 Oct this week" to a screen reader. An undone current cell is a white square with a 2 px primary border and a primary dash; a not-joined cell stays a blank grey square; a missed cell stays pink with a red X; a done cell stays solid green with a check. The viewer's cell flips to green inside the marked column on a tick and back to the outlined box on undo. The contrast gate lists the new pair, a unit test pins the four looks as four, smoke and e2e bind the marked header, and the e2e streak assertions no longer collide with a header "1".

Verify: `npm run test:unit`, `node scripts/token-contrast.mjs`, `npm run smoke`, `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`, the `states` screenshot run, and the owner's review of the nine committed screenshots.

### Key Discoveries:

- Column state has no home: a mark on the `<th>` stays in `CheckoffGrid.astro`, needs no prop on `GridCell` and no change to the island (`src/components/tasks/ViewerGridCell.tsx:15-19`), which keeps rendering `GridCell` with `open`/`done`.
- A daily column is 28 px (`w-7`) at `text-xs`: no visible word fits; the word is sr-only. The wrapper is positioned so absolute sr-only text cannot widen the page (`CheckoffGrid.astro:19-24`).
- The cell is a `size-7` span with `rounded-md`; Tailwind's preflight sets `box-sizing: border-box`, so a 2 px border stays inside the 28 px square and `border-spacing` does not clip it (a `ring` is painted outside the box and has only the table's 2–4 px outer `border-spacing` to live in, touching the wrapper edge on phones; a `border` needs no room outside the square).
- `tests/unit/grid-labels.test.ts:61-77` pins `periodName` and `cellLabel`: the sr-only "today" goes on the header, not into the cell label, so smoke's `[^<:]*` and e2e's `[^:]+` period matches and the S-20 unit tests stay as they are.
- `scripts/ui-screenshots.mjs` `states` shoots every kitchen-sink page at 360, 375 and 1280 px and fails on sideways scroll (`:319`, `:369-380`); the fixtures already show `open` (Max's "Water the plants", the viewer's "Read 20 pages", "Clean the fridge", "Fix the bike"), `notJoined` (Sam's "Read 20 pages", the first weekly columns) and `missed` cells (`src/components/dev/dashboard-fixtures.ts:250-291`), so no fixture changes.
- Blast radius: `CheckoffGrid` is rendered only by `src/components/dashboard/TaskRow.astro:112` (the kitchen sink reaches it through `DashboardView`); `GridCell` is imported only by `CheckoffGrid.astro:2` and `ViewerGridCell.tsx:3`; `grid-labels` only by those two and its test. Nothing changes in `TaskRow.astro`.

## What We're NOT Doing

- No element after `saved`, no `role="status"` line, no cell flash, no toast: the confirmation is the existing flip (frame, owner's decision). `src/components/tasks/CheckoffControl.tsx`, `src/lib/checkoff-sync.ts` and `src/components/tasks/ViewerGridCell.tsx` are not edited (S-22's files).
- No fifth cell state, no remaining-time cue for a weekly task, no "due soon": FR-013 keeps four states (`context/foundation/prd.md:123`), and the owner put the weekly cue out of scope.
- No new token, no `tokens-source/` folder, no `.dark` edit: the mark and the outline use `primary`, `card` and `foreground`.
- No mark on a `once` task's single "Done" column, and no mark on the viewer's row beyond S-20's `font-medium` and sr-only "(you)".
- No column tint, no ring on the viewer's cell (the two alternatives the owner did not pick).
- No fix of the stale snapshot after Warsaw midnight or of the Warsaw-only day boundary (frame, dimension 3): the mark is rendered from the same server snapshot as the rest of the grid and inherits its staleness.
- No device screenshots (owner's decision recorded in deployment-plan Phase 28); device checks are manual rows.
- No `CheckoffControl` fixture for pending or saved states in the kitchen sink (research OQ6 no longer applies: nothing transient is added).

## Implementation Approach

Two markup changes in S-21's own files, each bound by the gate that already watches that markup, plus the one new gate the research found missing (a unit test of the cell's looks). The header mark is computed where `current` already is; the open look is one entry of the state map. The contrast gate gets the `primary on card` pair. Smoke gets one step for the marked header; the e2e round trip asserts the marked header and, while it is open, stops matching bare "0"/"1" text so the header "1" cannot collide. The nine screenshots are the visual record the owner reviews. One phase, run with `/10x-goal-implement` on one branch; the manual rows (screenshot review, accessibility tree, merge, release, production and device checks, deployment-plan entry) are the post-run checklist.

## Critical Implementation Details

- **Border, not ring, on the open cell.** A `ring` is painted outside the box; the only room it has is the table's outer `border-spacing` (4 px, 2 px under 640 px), so a 2 px ring touches the wrapper's edge on phones and a wider one or a `ring-offset` is clipped by `overflow-x-auto`. A `border-2` sits inside the 28 px square under `border-box` and leaves 24 px for the 16 px icon.
- **The header word is sr-only and after the visible lines.** The accessible name becomes "Su 11 today" / "5 Oct this week"; smoke binds the header as a `<th … aria-current="true">` whose text ends with the word, and the e2e locator reads the same. Do not put the word into `periodName`: the cell labels, their unit tests, the smoke cell regex and the e2e `viewerCell` all depend on the period part staying "Mon 13 Oct" / "week from 13 Oct".
- **The width budget is checked, not assumed.** `font-medium` on a 28 px daily header must not widen the column: the `states` screenshot run fails on any sideways scroll of a grid, so run it before committing the screenshots.

## Phase 1: Current-column mark and the to-do cell

### Overview

Mark the current period's header, draw the undone current cell as an outlined to-do box, extend the gates that bind the grid, commit the screenshots, and carry the release and device checks as manual rows.

### Changes Required:

#### 1. The current-period word

**File**: `src/lib/grid-labels.ts`

**Intent**: Name the current period for a screen reader next to the header lines, in the pure module the grid's text lives in, so the word is tested with the other labels.

**Contract**: `currentPeriodWord(recurrence: TaskRecurrence): string | null` returns `"today"` for `daily`, `"this week"` for `weekly` and `null` for `once`. `periodHeader`, `periodName`, `cellLabelPrefix` and `cellLabel` do not change.

#### 2. The header mark

**File**: `src/components/dashboard/CheckoffGrid.astro`

**Intent**: Make the current period's column findable at a glance and announced as current, without touching the cells, the row header or the width budget.

**Contract**: In the header loop, the `<th>` at `index === current` for `daily` and `weekly` (never `once`) gets `aria-current="true"`, the classes `text-foreground font-medium border-b-2 border-primary` in place of `text-muted-foreground`, and, after the `periodHeader` lines, one `<span class="sr-only">` holding a leading space and `currentPeriodWord(recurrence)`. Every other `<th>` is unchanged. The width classes (`w-7`, `w-12`) and `px-0.5` stay. Update the comment at `:19-23` with the mark and why the word is sr-only.

#### 3. The open cell

**File**: `src/components/tasks/GridCell.tsx`

**Intent**: Draw the undone current period as "still to do": a hollow box in the primary colour, distinct from the blank grey not-joined cell and the pink missed cell, with the dash still carrying the state for a viewer who cannot rely on colour.

**Contract**: `STATE_CLASSES.open` becomes `border-2 border-primary bg-card text-primary`; `done`, `missed` and `notJoined` stay; the icon map (`Check`, `X`, `Minus`, none) stays; the span keeps `size-7 rounded-md` and the sr-only label as its last child. Update the comment at `:6` to name the pairs the gate checks (`primary on card` among them).

#### 4. The contrast gate

**File**: `scripts/token-contrast.mjs`

**Intent**: Gate the new pair so a later change to `--primary` or `--card` cannot silently drop the open cell's dash and border or the header underline below the bar.

**Contract**: One new gating entry in `PAIRS`: `["primary on card (open cell border and dash, current header underline)", "primary", "card", 4.5, true]`. The 4.5 text threshold covers the dash; it is above the 3:1 non-text bar for the border and underline, so one entry is enough. The script's output lists it as PASS at 5.3:1 or better.

#### 5. Unit tests

**Files**: `tests/unit/grid-labels.test.ts`, new `tests/unit/grid-cell.test.ts`

**Intent**: Pin the word and, for the first time, the cell's looks: four states, four distinct looks, the icon present where the state has one, the label last.

**Contract**: `grid-labels.test.ts` adds a case for `currentPeriodWord` (`daily` → "today", `weekly` → "this week", `once` → `null`). `grid-cell.test.ts` renders `GridCell` with `renderToStaticMarkup` from `react-dom/server` and `createElement` (a `.ts` test; the unit project's `include` is `tests/unit/**/*.test.ts`) for each `CellState` with one `labelPrefix`, and asserts: the four `class` attributes are pairwise different; `done`, `missed` and `open` contain exactly one `<svg` and `notJoined` none; the `open` markup carries `border-primary` and `bg-card`, and `notJoined` carries `bg-muted` and no border class; every markup ends with the sr-only span holding `cellLabel(prefix, state)` as the last child. If `react-dom/server` cannot be imported in the unit project, record the reason in the plan brief and bind the same facts in the e2e spec instead; do not add jsdom.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Bind the marked header on the real dashboard markup, so a regression that drops the mark or marks the wrong column fails the suite.

**Contract**: A matcher `taskRowCurrentHeader(title, word)` that, inside the task's `<li>` and its `<table aria-label="Check-offs of <title>">`, requires the last `<th>` of the first `<tr>` to carry `aria-current="true"` and to contain `<span class="sr-only"> <word></span>` before `</th>`, with no other `<th` carrying `aria-current` in that `<thead>`. Apply it in the two dashboard constants that already assert `taskRowGridCell` (`B_NOTHING_TICKED` `:562`, `B_TICKED` `:582`; the task is daily) with the word "today". Smoke creates no weekly task (`:1814`, `:1149`, `:2420`, `:2832`; the weekly POSTs at `:1823` and `:1943` are a rejected duplicate title and an update that ignores recurrence), so "this week" is bound by the `currentPeriodWord` unit test and reviewed in the weekly grids of the screenshots (manual row 1.10); no weekly smoke step is added. The existing matchers (`taskRowGridCell`, `taskRowWithStatus`, buttons, streak pair) do not change. Note the new invariant in `CLAUDE.md` under "Smoke binds the markup" (one clause: the current column header carries `aria-current`).

#### 7. E2E

**File**: `tests/e2e/checkoff-round-trip.spec.ts`

**Intent**: Assert the marked header on the live page in both projects, and stop the streak assertions from matching the period header, which holds a bare "1" on the 1st–7th of every month.

**Contract**: (a) In the round-trip test, after the positive control, the row's table has exactly one `th[aria-current="true"]`, it is the last column header, and its text ends with "today" (`toHaveText(/today$/)`); the same locator is used after the reload. (b) A helper `streakOf(row)` resolves the streak number as the `<span>` that follows the `Streak` label (the pair smoke binds as `>Streak</span><span>n</span>`), and the six `row.getByText("0"|"1", { exact: true })` assertions become `await expect(streakOf(row)).toHaveText("0"|"1")`. `viewerCell`, `expectNoSidewaysScroll` and the rollback test keep their locators.

#### 8. Screenshots

**Files**: `context/changes/grid-state-feedback/screenshots/phase-1-states-{owner,member,long-text}-{narrow,mobile,desktop}.png` (nine files)

**Intent**: Record the result for the owner's review and as the "after" for the device rows, as S-20 did.

**Contract**: Produced by `OUT_DIR=<scratch> BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs phase-1 states` against a running `astro dev` with the kitchen sink, then the nine `states` files for `owner`, `member` and `long-text` copied into the folder. The run must end with "All screenshots taken" (no sideways scroll).

#### 9. Release record

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the release as Phase 29 and close the device rows of Phase 28 that this slice supersedes, because they look at the same grid.

**Contract**: A new `## Phase 29 — Grid state marks (change grid-state-feedback, S-21)` entry in the format of Phase 28: status, the PR and merge commit, the `release` run and approval, the agent's live check, and the owner's and member's device rows (Android, iPhone Safari and installed app, large system font). In Phase 28, rows 1.8 and 2.2–2.4 get a note "superseded by Phase 29 (same grid, new marks)"; row 1.9 and 2.5 stay Phase 28's. In the same docs PR, `context/foundation/roadmap.md` gets one line under S-21's Unknowns: "Rozstrzygnięte 2026-10-19 w `frame.md`: potwierdzenie zapisu = istniejąca zmiana po tapnięciu (wiersz, komórka, streak); bez nowego elementu", with the item's status and the milestone history untouched. This item is written after the merge, in the closing docs PR (lesson: rows that need the PR's own release are ticked in a small docs PR).

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `tests/unit/grid-cell.test.ts` and the `currentPeriodWord` case: `npm run test:unit`
- Lint, format and types pass: `npm run lint`, `npx prettier --check context/changes/grid-state-feedback CLAUDE.md`, `npx astro check`
- Build passes: `npm run build`
- The contrast gate passes with the new pair listed: `node scripts/token-contrast.mjs` prints `primary on card` as PASS and exits 0
- Smoke passes with the marked-header step: `npm run smoke`
- E2E round trip passes in both projects with the `aria-current` assertion and the scoped streak locator: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`
- Visual gate passes at 360, 375 and 1280 px: `OUT_DIR=<scratch> BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs phase-1 states` ends with "All screenshots taken", and the nine PNGs are committed under `context/changes/grid-state-feedback/screenshots/`
- S-22's files are untouched: `git diff --stat origin/master -- src/components/tasks/CheckoffControl.tsx src/lib/checkoff-sync.ts src/components/tasks/ViewerGridCell.tsx` prints nothing
- Red proof: with `git stash push -- src/components/dashboard/CheckoffGrid.astro src/components/tasks/GridCell.tsx`, `npm run test:unit` fails in `grid-cell.test.ts`, the smoke marked-header step fails naming the grid, and the e2e `aria-current` assertion fails; after `git stash pop` all three pass again

#### Manual Verification:

- Owner reviews the nine committed screenshots: at 360 and 375 px the last daily and weekly column header is darker, medium weight and underlined in green; every undone current cell is a white box with a green border and dash; not-joined cells are blank grey; missed cells pink with a red X; done cells solid green; the column widths and the two-line long name are as in S-20; nothing scrolls sideways; at 1280 px the grid is compact and left-aligned
- Accessibility tree (DevTools) or a screen reader: the current column header reads "Su 11 today" (daily) or "5 Oct this week" (weekly) and is announced as current; every cell still reads name, period and state; the viewer's row header still reads "<nick> (you)"
- PR merged to `master` and the `release` run approved by the owner (no migrations); the live check passes: `/` 200, `/privacy` 200, `/dashboard` 302
- Android (owner, production, signed in): the current column is marked in every daily and weekly grid; after "Mark done" the viewer's cell turns green inside the marked column and after Undo it is the outlined box again; the other members' undone cells are outlined; nothing scrolls sideways
- iPhone (group member, Safari and the installed app): the same checks; the border and underline render at the same widths
- Android with the system font size above the default: the header mark and the outlined cell stay readable; if the grid outgrows the room it scrolls inside its wrapper and the page does not
- Deployment-plan Phase 29 written, Phase 28's rows 1.8 and 2.2–2.4 marked superseded, and the resolution note under S-21's Unknowns in the roadmap, in the closing docs PR; the roadmap status of S-21 moved by `/10x-archive`

**Implementation Note**: This phase runs under `/10x-goal-implement` with a `/goal` condition that stops when every automated row is green and one commit is made; the manual rows are the post-run checklist. The screenshot run writes nine new PNGs that the owner looks at before the PR is merged (lesson: stop at a baseline change and show it). Phase blocks use plain bullets; the `- [ ]` checkboxes live in `## Progress`.

---

## Testing Strategy

### Unit Tests:

- `currentPeriodWord` for the three recurrences.
- `GridCell` rendered to a string per state: four distinct looks, icons where expected, the sr-only label last, `open` outlined and `notJoined` blank.
- The existing `grid-labels` and `grid-rules` suites run unchanged (the header lines, the labels and the state rules do not move).

### Integration Tests:

- Smoke: the daily task's grid has exactly one `aria-current` header, the last one, ending with "today"; the cell regex, the "Done today" negative and the button and streak matchers keep passing.
- E2E (chromium and mobile-chromium): the marked header is present before and after the tick and the reload; the viewer's cell goes `open` → `done` → `open`; the streak assertions read the streak element; the sideways-scroll contract holds; the rollback test is unchanged.
- Visual gate: the `states` set at 360, 375 and 1280 px ends with "All screenshots taken".

### Manual Testing Steps:

1. Open the kitchen sink `owner` state at 375 px: the "Su 11" header of each daily grid and the "5 Oct" header of each weekly grid are darker, bold and underlined; Max's "Water the plants" cell under "Su 11" is a white box with a green border and dash; Sam's four "Read 20 pages" cells before Friday are blank grey; the "Fix the bike" cell is outlined and the "Book the summer trip" header "Done" is not marked.
2. On production (Android, signed in): tick a daily task, see the green cell in the marked column, undo, see the outlined box; then the same in the installed app.
3. Read the grid with TalkBack or VoiceOver: the current header is announced with "today" / "this week" and as current.

## Performance Considerations

None: two static class decisions per grid at render time, no new island, no new request.

## Migration Notes

None: no schema, no token, no data. The look changes on the next deploy for everyone; no stored state depends on it.

## References

- Frame brief: `context/changes/grid-state-feedback/frame.md`
- Related research: `context/changes/grid-state-feedback/research.md`
- Grid markup and cell: `src/components/dashboard/TaskRow.astro:112` (renders the grid, unchanged); `src/components/dashboard/CheckoffGrid.astro:16`, `:35-44`; `src/components/tasks/GridCell.tsx:7-12`, `:25-30`; `src/components/tasks/ViewerGridCell.tsx:15-19`
- Labels and rules: `src/lib/grid-labels.ts:22-51`; `src/lib/grid-rules.ts:54-62`, `:91-94`
- Gates: `scripts/token-contrast.mjs:16-36`; `scripts/smoke.mjs:228-235`, `:270-273`, `:277-281`; `tests/e2e/checkoff-round-trip.spec.ts:33-37`, `:96-130`; `scripts/ui-screenshots.mjs:21-25`, `:319`, `:369-380`, `:468-476`
- Prior plan in the same format: `context/archive/2026-10-19-grid-mobile-readability/plan.md`
- Decisions: `context/foundation/roadmap.md:30`, `:87-98`; `context/foundation/prd.md:123`; `context/archive/2026-10-17-frontend-notifications/plan-brief.md:24`; `context/archive/2026-10-17-checkoff-grid/reviews/plan-review.md:27-35`
- Release record format: `context/changes/deployment/deployment-plan.md` (Phase 28)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Current-column mark and the to-do cell

#### Automated

- [x] 1.1 Unit tests pass, including `tests/unit/grid-cell.test.ts` and the `currentPeriodWord` case — 2edc074
- [x] 1.2 Lint, format and types pass — 2edc074
- [x] 1.3 Build passes — 2edc074
- [x] 1.4 The contrast gate passes with the new `primary on card` pair listed — 2edc074
- [x] 1.5 Smoke passes with the marked-header step — 2edc074
- [x] 1.6 E2E round trip passes in both projects with the `aria-current` assertion and the scoped streak locator — 2edc074
- [x] 1.7 Visual gate passes at 360, 375 and 1280 px and the nine PNGs are committed — 2edc074
- [x] 1.8 S-22's files are untouched (empty `git diff --stat` on the three files) — 2edc074
- [x] 1.9 Red proof: stash the two grid files, unit, smoke and e2e fail naming the grid, pop and pass — 2edc074

#### Manual

- [ ] 1.10 Owner reviews the nine committed screenshots
- [ ] 1.11 Accessibility tree or screen reader: the current header reads with "today" / "this week" and as current; cells and row headers unchanged
- [x] 1.12 PR merged, `release` approved by the owner, live check passes
- [ ] 1.13 Android (owner, production): marked column, green cell on tick, outlined box on undo, no sideways scroll
- [ ] 1.14 iPhone (group member, Safari and installed app): the same checks
- [ ] 1.15 Android with a larger system font: mark and outline readable, no page scroll
- [x] 1.16 Deployment-plan Phase 29 written and Phase 28's superseded rows noted, in the closing docs PR
