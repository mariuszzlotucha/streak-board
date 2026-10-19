# Grid Mobile Readability (S-20) Implementation Plan

## Overview

The check-off grid of every task fits a phone screen from 360 px up without any sideways scrolling, of the page or of the grid. Period headers read like a calendar, a long nickname is clamped to two lines instead of painting over the first cells, and two automated gates keep it that way. Roadmap S-20 (milestone M-4, anchor MS-01); research: `context/changes/grid-mobile-readability/research.md`.

## Current State Analysis

- **The grid is wider than its room on every phone up to 412 px** (research, Summary 1). The room is the viewport minus 80 px of page and card padding: 240 at 320, 280 at 360, 295 at 375, 332 at 412. The daily grid measures 339–348 px with the fixture nicknames (395 with the 24-character one), the weekly 348–389 px. The hidden column is the current period, the one the viewer acts on, and nothing marks the wrapper as scrollable.
- **The headers set the column widths, not the cells**: "Mo 5"…"Su 11" measure 30–37 px and "from 14 Sep"…"from 5 Oct" 67–74 px at `text-xs`, against 28 px cells (`size-7`, `src/components/tasks/GridCell.tsx:27`). `periodHeader` is the only producer and `CheckoffGrid.astro:32` its only consumer; `periodName`, `cellLabelPrefix` and `cellLabel` (`src/lib/grid-labels.ts:26-48`) produce the labels smoke and e2e bind, and stay as they are.
- **The page itself scrolls sideways** (392 px at a 375 px viewport in `owner`, 439 in `long-text`): the cells' `sr-only` labels are `position: absolute` and no ancestor up to `html` is positioned, so they escape the wrapper's `overflow-x-auto` (CSS 2.2 §11.1.1). `position: relative` on the wrapper (`src/components/dashboard/CheckoffGrid.astro:22`) removes it, measured (research, "The page scrolls sideways").
- **A long nickname covers the first cells instead of pushing them**: `max-w-32` on the `th` caps the column at 128 px in Chromium, but `truncate` sits on a span inside a shrink-wrapping `inline-flex`, so the text is never cut (`CheckoffGrid.astro:42-46`). CSS 2.2 §10.4 leaves `max-width` on a table cell undefined, so WebKit may not even cap the column.
- **The "You" badge takes 40–41 px of the name column** (`Badge` outline, `h-5 px-2`, plus `gap-1`); the participants line above the grid shows the same badge (`src/components/dashboard/TaskRow.astro:81-83`).
- **No automated check guards the overflow.** `scripts/ui-screenshots.mjs` captures 1280×800 and 375×812 and fails only on non-200, empty pages, page errors and console errors (`:19-22`, `:330-360`); the e2e round trip asserts function only (`tests/e2e/checkoff-round-trip.spec.ts:33-37`) on `chromium` and `mobile-chromium` (Pixel 7, 412 px, `playwright.config.ts:28-39`). S-13's row 3.6 "readable at 375 px width without page scroll" was ticked without evidence (research, Historical Context).
- **Contracts to keep**: PRD FR-013 fixes 7 / 4 / 1 columns and four cell states (`context/foundation/prd.md:123`); smoke's `taskRowListing` and `taskRowWithBadge` stop at the first `<table`, `taskRowGridCell` needs `<table aria-label="Check-offs of <title>">` with the label `<nick>, <period>: <state></span>` in the row's last `<td>` (`scripts/smoke.mjs:220-235`, `:361-367`); the e2e cell locator is `getByRole("table", { name })` plus the same label; ESLint rejects arbitrary `px`/`rem` values, colour literals and palette classes in `src/components/dashboard/**` (`eslint.config.js:82-94`), and spacing-scale utilities (`w-7`, `w-12`, `max-w-14`, `border-spacing-0.5`), `max-sm:`, `line-clamp-2` and `wrap-anywhere` pass it. `wrap-anywhere` is already used (`src/components/dashboard/AccountCard.astro:53`, `src/layouts/AppLayout.astro:55`); Tailwind 4.3.3 is installed.
- **Neighbours**: `GridCell.tsx` is S-21's file, `ViewerGridCell.tsx`, `CheckoffControl.tsx` and `checkoff-sync.ts` are S-22's. S-22 is "Parallel with" S-20 (`context/foundation/roadmap.md:80`); this plan touches none of their files.

## Desired End State

- **Phone, 360 px and wider** (`owner`, `member`, `long-text` states and the production group): every daily grid shows all 7 columns and every weekly grid all 4, with no sideways scroll of the page or of the grid wrapper. Daily headers show the weekday over the day number ("Mo" over "5"), weekly headers the week's first day ("14 Sep"), once "Done". A nickname wraps to at most two lines and ends with an ellipsis; the viewer's row header is in medium weight and reads "<nick> (you)" to a screen reader; the "You" badge stays in the participants line only.
- **320 px**: the page never scrolls sideways; the daily grid (278 px against 240 px of room) scrolls inside its wrapper by 38 px, the weekly grid fits by shrinking its 48 px header columns to their text (37–44 px), and the name column keeps its 56 px floor.
- **Desktop (640 px and wider)**: the same headers, 4 px cell spacing as today, the name capped at 128 px over two lines; the grid stays content-sized and left-aligned (daily 368 px at most, weekly 352).
- **Gates**: `scripts/ui-screenshots.mjs` captures a 360 px viewport too and fails the run when any captured page, or any check-off grid wrapper on it, scrolls sideways; the e2e round trip asserts the same on the real markup in both projects.
- **Unchanged**: the horizon and the cell states (FR-013), every screen-reader cell label, the `<table aria-label>` smoke and e2e bind, `GridCell.tsx` and S-22's files.

Verify with the unit test on the header lines, `npm run smoke`, the e2e spec, the screenshot run at 360/375/1280, the owner's screenshots and the device rows of Phase 2.

### Key Discoveries:

- Width budget at 2 px spacing on phones (research, "Column anatomy", recomputed for the chosen classes and confirmed by measurement in the plan review): daily grid = name column 64 (block `min-w-14 max-w-14`, 56, + `pr-2` 8) + 7 × 28 + 9 × 2 = 278 px; weekly = 64 + 4 × 48 + 6 × 2 = 268 px; once = 64 + 48 + 3 × 2 = 118 px. With the floor these are the phone widths for every name. All three fit 280 px (360) with 2–12 px to spare, 295 (375) and 332 (412).
- Census of every possible label at 12 px Outfit (plan review): the widest daily lines are "Mo" / "We" at 17 px and "20" / "30" at 14 px, the widest weekly label "20 May" / "30 May" at 40 px ("14 Sep" 34, "Done" 29). With `px-0.5` the content boxes are 24 px (daily, `w-7`, the column stays at the cell's 28 px) and 44 px (weekly and once, `w-12`), so the widest labels keep 7 and 4 px of slack for a wider engine or font; with `px-1` the weekly box would be 40 px, exactly "30 May".
- `line-clamp-2` sets `display: -webkit-box`, which makes the name span block-level, so a `max-w-*` on it bounds the `th`'s content width in every engine; two lines of `text-xs` are 32 px, so a long name adds about 4 px to a 28 px row.
- A 56 px line holds 8 lowercase characters of Outfit at 12 px (measured in the plan review); "Olivia", "Mariusz" and "Kasia" fit on one line, the 24-character fixture name shows "Bartholo" / "mew_Fe…", about 14 characters and an ellipsis.
- The kitchen sink has no dark theme switch (`.dark` is defined in `src/styles/global.css:56` but never applied), so the visual gate is light-only.
- Phone browsers at OS text scaling above 100 % scale `rem`-based cells and headers alike, so the grid can outgrow the room there; the page must still not scroll, the wrapper may (research, Open Question 8). Without a floor on the name block, auto table layout would absorb the whole shortfall there first, because `wrap-anywhere` gives the block a one-glyph min-content: measured at 320 px without the floor, the name column was 26 px ("Oli" / "via"), the wrapper overflow 0 and the gate blind (plan review F1). The `min-w-14` floor keeps the column at 56 px, so the daily grid overflows into the wrapper by 38 px at 320 and the page stays put.

## What We're NOT Doing

- **No change to the horizon or the cell states** (PRD FR-013): 7 daily, 4 weekly, 1 once columns stay; no swipe-only history, no collapsed grid.
- **No change to the card or page padding** and no grid bleeding into the card padding: the compact headers, the 2 px phone spacing and the name cap give the room; the chrome lever stays unused.
- **No edit to `GridCell.tsx` (S-21), `ViewerGridCell.tsx`, `CheckoffControl.tsx` or `checkoff-sync.ts` (S-22)**: the cell stays 28 px with its `sr-only` label; the page-scroll fix is the wrapper's `relative`, not a change to the label.
- **No full fit at 320 px**: it would need 24 px cells in S-21's file; at 320 the grid scrolls inside its wrapper and the page does not (owner's decision, 2026-10-19).
- **No scroll affordance** (fade or arrow) for the 320 px case or for text scaling.
- **No marker of the current period or the viewer's row beyond `font-medium`**: S-21 (`grid-state-feedback`).
- **No new tokens, no custom breakpoint, no dark-mode screenshots, no fixture change**: the 24-character `long-text` nickname already exercises the clamp.
- **No mutation run on `grid-labels.ts`**: the labels are not a risk-critical module (CLAUDE.md, Mutation testing).
- **No roadmap wording fix**: the north-star sentence "MS-01 i MS-02 w jednym wycinku" (`roadmap.md:40`) contradicts the table and is a `/10x-roadmap` edit, not part of S-20.
- **No change to the PRD or CLAUDE.md**, and in README only the screenshot-script sentence (`README.md:445`, Phase 1 #3): none of them describes the header text or the grid's layout.

## Implementation Approach

Keep the table content-sized (`table-layout: auto`, no `w-full`) and bound its width from the inside: period columns get an explicit width equal to the cell (`w-7`, daily) or to the one-line date (`w-12`, weekly and once), the header text is shortened to lines that fit those widths, the name lives in a block inside the row header with a 56 px floor, a phone cap of 56 px (128 px from 640 px) and a two-line clamp, the "You" badge leaves the grid, and the cell spacing drops to 2 px below 640 px. The wrapper becomes `relative` so the cells' `sr-only` labels are clipped with the wrapper instead of widening the page. One header format serves every width, so `periodHeader` changes once and gets a unit test with the character-count invariant behind the pixel budget.

The alternative, `table-fixed w-full` on phones with the name column taking the remainder, was rejected: it would give names 118 px at 412 but stretch the name column past 300 px between 480 and 639 px and move the cells away from the names.

Both gates land in the same phase as the layout: the screenshot script gains a 360 px viewport and a sideways-scroll failure, the e2e round trip gains the same assertion, and the phase proves the gates red once with the layout change stashed (test-plan §6.3 convention) before they go green.

## Critical Implementation Details

- **The cap sits on a block inside the `th`, never on the `th`**: `max-width` on a table cell is undefined by CSS 2.2 §10.4 (today's `max-w-32` on the `th` is why the name spills in Chromium and may not cap at all in WebKit). `line-clamp-2` makes the span block-level; keep the `sr-only` "(you)" as a sibling of that span, outside the clamp box. The block also carries `min-w-14`: without a floor, auto table layout squeezes the name column first whenever the room is short (320 px, large system text) and nothing scrolls, so the gate sees nothing (plan review F1).
- **The page-scroll fix is `relative` on the wrapper, nothing else**: the labels stay `absolute` `sr-only` in S-21's `GridCell.tsx`; with the wrapper positioned, CSS 2.2 §11.1.1 clips them with the wrapper's overflow. Do not switch the labels to static text.
- **Red before green**: run the e2e spec (`--project=mobile-chromium`) and the screenshot run once with `CheckoffGrid.astro` and `grid-labels.ts` stashed, confirm both fail naming a check-off grid, then restore; a gate that was never red proves nothing (S-13 row 3.6).

## Phase 1: Layout and gates

### Overview

Make the grid fit from 360 px up with calendar headers and a clamped name column, and add the two checks that fail when it stops fitting. One commit.

### Changes Required:

#### 1. Period header lines

**File**: `src/lib/grid-labels.ts`, `tests/unit/grid-labels.test.ts` (new)

**Intent**: Shorten the visible header to lines that fit a 28 px (daily) or 48 px (weekly, once) column, at every width, without touching the screen-reader labels.

**Contract**: `periodHeader(recurrence, key): readonly string[]` returns the header's lines: daily `[weekday, day]` (`["Mo", "5"]`, `["Su", "11"]`), weekly `["14 Sep"]` (`["5 Oct"]`), once `["Done"]`. `periodName`, `cellLabelPrefix`, `cellLabel` and `CELL_STATE_LABELS` are unchanged, byte for byte in their output. The unit test covers every weekday, one- and two-digit days, a month and a year boundary, `once`, and the invariants behind the budget: each daily line has at most 2 characters and the weekly line at most 6 (`"30 Sep"`); it also pins `periodName` and `cellLabel` so the bound labels cannot drift with the header.

#### 2. Grid markup

**File**: `src/components/dashboard/CheckoffGrid.astro`

**Intent**: The table fits 280 px of room with 7 daily or 4 weekly columns, the page never scrolls because of it, a long nickname is clamped, and the viewer's row is marked without the badge.

**Contract**:

- Wrapper `div.relative.max-w-full.overflow-x-auto` (the `relative` is the page-scroll fix). Comment at `:20-21` rewritten: from 360 px nothing scrolls sideways; below that only the wrapper; the wrapper is positioned so the cells' `sr-only` labels cannot widen the page.
- Table `border-separate border-spacing-1 max-sm:border-spacing-0.5 text-xs`; `aria-label`, `<caption class="sr-only">`, `<thead>`/`<tbody>`, `scope` attributes and the `<td class="p-0">` cells with `GridCell` / `ViewerGridCell` exactly as today.
- Period headers: `th.px-0.5.font-normal.text-muted-foreground` with `w-7` for `daily` and `w-12` for `weekly` and `once`, rendering each line of `periodHeader` as a `span.block.whitespace-nowrap`.
- Row header, structure load-bearing (see Critical Implementation Details):

  ```astro
  <th scope="row" class="pr-2 text-left font-normal">
    <span
      class:list={[
        "line-clamp-2 min-w-14 max-w-14 wrap-anywhere text-foreground sm:max-w-32",
        row.isYou && "font-medium",
      ]}
    >
      {name}
    </span>
    {row.isYou && <span class="sr-only"> (you)</span>}
  </th>
  ```

  No `Badge` import, no `inline-flex`, no `truncate`, no `max-w-32` on the `th`. The `min-w-14` floor keeps the column at 56 px when the room is short, so the grid overflows into the wrapper instead of squeezing the names (320 px, OS text scaling). The participants line in `TaskRow.astro` keeps its badge and is not edited.

- Invariants smoke and e2e bind, kept: nicknames and "You" appear before `<table` only in the participants line; inside the table the label spans `<nick>, <period>: <state>` sit in the last `<td>` of each row; no `<li>`, no `role="alert"`.

#### 3. Visual gate at 360 px with a sideways-scroll failure

**File**: `scripts/ui-screenshots.mjs`, `README.md`

**Intent**: Every screenshot run captures the narrowest target width and fails when a page or a grid scrolls sideways, so the S-13 contract cannot silently break again.

**Contract**: `VIEWPORTS` gains `narrow: { width: 360, height: 800 }` (keys order: narrow, mobile, desktop; file names follow the key). `open()` measures, after `document.fonts.ready` and before returning the page, the document's `scrollWidth - clientWidth` and, for every `table[aria-label^="Check-offs of "]`, its parent wrapper's `scrollWidth - clientWidth`; a positive value fails the run through `fail()` with the page, the viewport and, for a grid, its `aria-label` and the overrun in px. The header comment lists the new exit condition, and `README.md:445` (the kitchen-sink paragraph) names the three viewports, 360×800, 375×812 and 1280×800, and the sideways-scroll exit. The check runs for every set and viewport; a 360 px failure outside a grid (another card overflowing) is reported in the phase PR and becomes an open item, not a silent fix, unless it is a one-class change in a file this plan already edits.

Measurement, the one non-obvious part:

```js
const sideways = await page.evaluate(() => {
  const root = document.documentElement;
  const grids = [...document.querySelectorAll('table[aria-label^="Check-offs of "]')].map((table) => {
    const wrapper = table.parentElement;
    return [table.getAttribute("aria-label"), wrapper.scrollWidth - wrapper.clientWidth];
  });
  return { page: root.scrollWidth - root.clientWidth, grids: grids.filter(([, by]) => by > 0) };
});
```

#### 4. E2E contract on the real markup

**File**: `tests/e2e/checkoff-round-trip.spec.ts`, `context/foundation/test-plan.md`

**Intent**: CI asserts, on a real account and both projects (1280 px and 412 px), that neither the page nor the task row's grid wrapper scrolls sideways.

**Contract**: a helper `expectNoSidewaysScroll(page, title)` in the spec reads `document.documentElement.scrollWidth - clientWidth` and the wrapper's (`getByRole("table", { name })` then `locator("..")`) `scrollWidth - clientWidth` and expects both to be 0; it is called once in the first test, after the positive control (the open cell attached) and before the tick. No new spec file and no new risk row: it is a layout contract on the fixture the spec already builds. `test-plan.md` §6.3, the bullet "asercje są funkcjonalne i niezależne od szerokości ekranu", gets one sentence naming this exception and why (a layout contract each project checks at its own width).

#### 5. Screenshots of the result

**File**: `context/changes/grid-mobile-readability/screenshots/` (nine PNG files)

**Intent**: The owner reviews the new grid at the three widths without running anything.

**Contract**: the full `states` set runs into a scratch `OUT_DIR` as the gate (its PNGs stay out of git); from it, `phase-1-states-{owner,member,long-text}-{narrow,mobile,desktop}.png` are copied into the change folder (the research PNGs `research-*.png` stay as the "before").

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new header-lines test: `npm run test:unit`
- Lint, format and types pass: `npm run lint`, `npx prettier --check context/changes/grid-mobile-readability context/foundation/test-plan.md`, `npx astro check`
- Build passes: `npm run build`
- Smoke passes against the local stack with the row regexes unchanged: `npm run smoke`
- E2E round trip with the sideways-scroll assertion passes in both projects: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`
- Visual gate passes at 360, 375 and 1280 px with the sideways-scroll check: `OUT_DIR=<scratch> BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs phase-1 states` ends with "All screenshots taken"
- Red proof: with `git stash push -- src/components/dashboard/CheckoffGrid.astro src/lib/grid-labels.ts`, the e2e spec on `--project=mobile-chromium` and the screenshot run both fail naming a check-off grid (exit 1); after `git stash pop` both pass again

#### Manual Verification:

- Owner reviews the nine committed screenshots: at 360 and 375 every daily grid shows 7 columns and every weekly grid 4, headers read as a calendar, the 24-character name in `long-text` is two lines with an ellipsis and covers no cell, the viewer's row name is in medium weight, nothing scrolls; at 1280 the grid is compact and left-aligned as before
- Accessibility tree (DevTools) or a screen reader: each cell still reads name, period and state; the viewer's row header reads "<nick> (you)"; the period headers read as their lines

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Release and device checks

### Overview

Ship through the gated release, then confirm on real phones what Chromium cannot: the owner's Android (the evidence the roadmap asked for, before and after), a WebKit browser, and OS text scaling.

### Changes Required:

#### 1. Deployment record

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the release and the device results in the convention of Phases 24–26, in the closing docs PR that also ticks the rows below.

**Contract**: a new phase entry (the next free number: 27 unless S-23's closing docs PR has taken it, then 28) with the merged PR and commit, the master run, the `release` job (approval, "Remote database is up to date.", the Cloudflare version, the `production` tag move), the live checks, and the device rows with their results.

#### 2. Device screenshots

**File**: `context/changes/grid-mobile-readability/screenshots/device-android-before.png`, `device-android-after.png`, `device-iphone-after.png`

**Intent**: Keep the phone evidence the roadmap unknown asked for (`roadmap.md:83`, `:131`) in the change folder.

**Contract**: the "before" is taken on the owner's Android against production before the `release` of this slice is approved; the "after" ones after it. Nicknames of the group are visible as they are shown in the app; nothing else personal is in frame. If the device shot is missed because the release was approved first, `screenshots/research-*.png` stand as the before. The implementation PR body lists the before-shot first among the owner's steps.

### Success Criteria:

#### Manual Verification:

- The `release` run of the merged PR is green and its "Check the live deployment" step passes
- Android (owner): a screenshot of today's production grid before approving the release, then the new grid after it: all 7 daily and 4 weekly columns visible, no sideways scroll of the page or the grid, nicknames readable; both PNGs committed
- iPhone (group member, Safari and the installed app): the same checks, and the name column is no wider than the cap (WebKit, `line-clamp`); screenshot committed
- Android with the system font size above the default (owner): the grid stays readable; if it outgrows the room it scrolls inside its wrapper and the page does not
- Deployment plan entry written with the run, the version, the tag, the live checks and the device results (closing docs PR merged)

---

## Testing Strategy

### Unit Tests:

- `periodHeader` lines for every weekday, one- and two-digit days, month and year boundaries, `once`; the 2- and 6-character invariants; `periodName` and `cellLabel` pinned.

### Integration Tests:

- `npm run smoke`: the row regexes (`taskRowListing`, `taskRowGridCell`, `taskRowWithBadge`) pass unchanged on the new markup.
- E2E `checkoff-round-trip` with the sideways-scroll helper on `chromium` and `mobile-chromium`.
- Visual gate: `scripts/ui-screenshots.mjs` `states` at 360, 375 and 1280 px with the sideways-scroll failure; proven red once with the layout stashed.

### Manual Testing Steps:

1. Kitchen sink `?state=owner`, `member`, `long-text` at 360 and 375 px: count the columns, read the headers, check the two-line name and the viewer's row.
2. Devices after the release (Phase 2): owner's Android before and after, iPhone, Android with large text.
3. Accessibility tree: cell labels and the "(you)" row header.

## Performance Considerations

None: CSS and header text only; `periodHeader` builds a two-element array per header instead of a string. No new network read, no new island.

## Migration Notes

None: no schema, data or API change. `periodHeader`'s return type changes from `string` to `readonly string[]`; `CheckoffGrid.astro` is its only caller.

## References

- Research: `context/changes/grid-mobile-readability/research.md` (measurements, budget, contracts) and its `screenshots/research-*.png` (the "before")
- Roadmap: `context/foundation/roadmap.md:76-85` (S-20), `:29` (MS-01)
- PRD: `context/foundation/prd.md:123` (FR-013), `:130` (NFR)
- Prior contract: `context/archive/2026-10-17-checkoff-grid/plan.md:170`, `:200`
- Grid: `src/components/dashboard/CheckoffGrid.astro:17-65`, `src/lib/grid-labels.ts:18-30`, `src/components/tasks/GridCell.tsx:24-32`
- Gates: `scripts/ui-screenshots.mjs:19-22`, `:330-360`; `tests/e2e/checkoff-round-trip.spec.ts:24-37`; `scripts/smoke.mjs:220-235`, `:361-367`; `playwright.config.ts:28-39`
- Pattern for the clamp: `src/components/dashboard/AccountCard.astro:53` (`wrap-anywhere`); the S-01 review F1 on `break-words` vs `wrap-anywhere` (`context/archive/2026-09-25-group-create-join-manage/reviews/impl-review-phase-4.md:32-38`)
- Lint rule: `eslint.config.js:79-102`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Layout and gates

#### Automated

- [ ] 1.1 Unit tests pass, including the new header-lines test: `npm run test:unit`
- [ ] 1.2 Lint, format and types pass: `npm run lint`, `npx prettier --check context/changes/grid-mobile-readability context/foundation/test-plan.md`, `npx astro check`
- [ ] 1.3 Build passes: `npm run build`
- [ ] 1.4 Smoke passes against the local stack with the row regexes unchanged: `npm run smoke`
- [ ] 1.5 E2E round trip with the sideways-scroll assertion passes in both projects: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`
- [ ] 1.6 Visual gate passes at 360, 375 and 1280 px with the sideways-scroll check: `OUT_DIR=<scratch> BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs phase-1 states` ends with "All screenshots taken"
- [ ] 1.7 Red proof: with `git stash push -- src/components/dashboard/CheckoffGrid.astro src/lib/grid-labels.ts`, the e2e spec on `--project=mobile-chromium` and the screenshot run both fail naming a check-off grid (exit 1); after `git stash pop` both pass again

#### Manual

- [ ] 1.8 Owner reviews the nine committed screenshots: at 360 and 375 every daily grid shows 7 columns and every weekly grid 4, headers read as a calendar, the 24-character name in `long-text` is two lines with an ellipsis and covers no cell, the viewer's row name is in medium weight, nothing scrolls; at 1280 the grid is compact and left-aligned as before
- [ ] 1.9 Accessibility tree (DevTools) or a screen reader: each cell still reads name, period and state; the viewer's row header reads "<nick> (you)"; the period headers read as their lines

### Phase 2: Release and device checks

#### Manual

- [ ] 2.1 The `release` run of the merged PR is green and its "Check the live deployment" step passes
- [ ] 2.2 Android (owner): a screenshot of today's production grid before approving the release, then the new grid after it: all 7 daily and 4 weekly columns visible, no sideways scroll of the page or the grid, nicknames readable; both PNGs committed
- [ ] 2.3 iPhone (group member, Safari and the installed app): the same checks, and the name column is no wider than the cap (WebKit, `line-clamp`); screenshot committed
- [ ] 2.4 Android with the system font size above the default (owner): the grid stays readable; if it outgrows the room it scrolls inside its wrapper and the page does not
- [ ] 2.5 Deployment plan entry written with the run, the version, the tag, the live checks and the device results (closing docs PR merged)
