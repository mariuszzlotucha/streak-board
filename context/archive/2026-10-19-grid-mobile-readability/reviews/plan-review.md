<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Grid Mobile Readability (S-20)

- **Plan**: `context/changes/grid-mobile-readability/plan.md`
- **Mode**: Deep (one sub-agent measured the proposed markup on the kitchen sink; two local measurement runs covered every kitchen-sink state and the public pages at 360 px)
- **Date**: 2026-10-19
- **Verdict**: REVISE → SOUND after the triage below (all six findings fixed in the plan and the brief)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict                                    |
| --------------------- | ------------------------------------------ |
| End-State Alignment   | WARNING (F1; PASS after the fix)           |
| Lean Execution        | PASS                                       |
| Architectural Fitness | PASS                                       |
| Blind Spots           | PASS (two observations, F5 and F6, fixed)  |
| Plan Completeness     | WARNING (F2, F3, F4; PASS after the fixes) |

## Grounding

10/10 declared paths exist (`tests/unit/grid-labels.test.ts` is new by design), 12/12 symbols found (`periodHeader` `src/lib/grid-labels.ts:19`, `VIEWPORTS` `scripts/ui-screenshots.mjs:19`, `open()` `:334`, `fail()` `:310`, `taskRowListing` `scripts/smoke.mjs:220`, `taskRowGridCell` `:231`, `taskRowWithBadge` `:362`, `viewerCell` `tests/e2e/checkoff-round-trip.spec.ts:33`, `mobile-chromium` `playwright.config.ts:36`, test-plan §6.3 `:164`, `CheckoffGrid.astro:22-23`, `:42-45`), brief↔plan consistent (one numeric drift, F4). `docs/reference/contract-surfaces.md` does not exist (check skipped). Progress↔Phase mapping: 14 criteria = 14 unchecked rows, no checkboxes outside `## Progress`.

Measured (Playwright Chromium against `astro dev`, Outfit loaded): the proposed markup applied by DOM and style injection to `owner`, `member` and `long-text` at 320/360/375/412/1280 px (63 tables): phone widths 278 / 268 / 118 px and desktop 368 / 352 px as the plan states; wrapper and page overflow 0 at 360–412; row heights 28 px (one-line name) and 32 px (two lines); viewer rows at weight 500; `w-7` with padding gives a 28 px column (border-box). Baseline page overflow at 360: 10 of 33 states (32–79 px, all through the grid); with `position: relative` on the wrapper, 33/33 kitchen-sink states, the kitchen-sink index and the four public pages read 0 at 360, so the new gate blocks nothing outside the grid. Tailwind 4.3.3 compiles every utility the plan uses (`line-clamp-2`, `wrap-anywhere`, `max-sm:border-spacing-0.5`, `min-w-14`, `max-w-14`, `sm:max-w-32`, `w-7`, `w-12`, `relative`, `px-0.5`, `font-medium`); none matches `UI_LITERAL` (`eslint.config.js:82`). Smoke regexes (`:220-235`, `:361-367`) and the e2e locators (`checkoff-round-trip.spec.ts:33-37`, `invite-join.spec.ts:84-85`) are unaffected by the row-header change. The raw measurements live in the session scratchpad, not in the repo.

## Findings

### F1 — At 320 px and under OS text scaling the name column is squeezed, not scrolled, and the gate cannot see it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State (320 px), Key Discoveries, Phase 2 row 2.4; brief "Target widths"
- **Detail**: The plan said the daily grid "scrolls inside its wrapper by ~38 px" at 320 and row 2.4 expects the same under text scaling. Measured: auto table layout shrinks the table to the 240 px room by squeezing the only soft column, the name block (`overflow-wrap: anywhere` gives it a one-glyph min-content): name column 26 px daily / 36 px weekly ("Oli/via", "Ma/x", "Ba/r…"), wrapper and page overflow 0. The same happens whenever the room shrinks relative to the grid (large system text on a 360 phone), and `scrollWidth − clientWidth` reads 0, so neither gate nor row 2.4 would notice.
- **Fix A ⭐ Recommended**: Add `min-w-14` to the name block (a 56 px floor, equal to the phone cap) and rewrite the 320 / text-scaling sentences in the plan and the brief.
  - Strength: One class. Measured variant: daily 278 px with 38 px of wrapper scroll at 320; weekly shrinks its `w-12` headers to their min-content (37–44 px, text intact) and still fits 240; at 360–412 every table is ≤ 278 px, so nothing changes there.
  - Tradeoff: A short name's column is 64 px instead of 40 on phones; the floor also applies on desktop, harmlessly.
  - Confidence: HIGH — the variant was measured in the same run.
  - Blind spot: Chromium only; WebKit's table layout not measured.
- **Fix B**: Accept the squeeze: state that the name column shrinks first and nothing scrolls; drop "scrolls inside its wrapper" from row 2.4.
  - Strength: No extra class; short names keep compact columns.
  - Tradeoff: On a 360 phone with large system text the names become unreadable, with no scroll and no gate signal.
  - Confidence: HIGH on the mechanism.
  - Blind spot: How many members use text scaling is unknown.
- **Decision**: FIXED via Fix A (plan: Desired End State, Key Discoveries, Implementation Approach, Critical Implementation Details, Phase 1 #2 snippet; brief: Key Decisions, Architecture, Open Risks)

### F2 — Row 2.1 is a CI-only check listed under Automated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Success Criteria; Progress 2.1
- **Detail**: "The `release` run of the merged PR is green…" has no command the implementer can run; the lesson "Implement plans with /10x-goal-implement" puts checks only CI can answer under `#### Manual` (the S-14 plan tripped exactly here).
- **Fix**: Move 2.1 to Manual Verification in the Phase 2 block and to `#### Manual` in Progress (keep the index; drop the empty Automated subsections).
- **Decision**: FIXED

### F3 — README.md:445 names the two viewports and goes stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 #3; "What We're NOT Doing" (README bullet)
- **Detail**: `README.md:445` says the script captures "at 1280×800 and 375×812"; Phase 1 adds 360×800 and a new exit condition, while the plan ruled out README edits.
- **Fix**: Add `README.md:445` to Phase 1 #3 (the sentence names the three viewports and the sideways-scroll exit) and narrow the NOT-doing bullet to the PRD and CLAUDE.md.
- **Decision**: FIXED

### F4 — Character counts for the clamped name are overstated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries (plan); Key Decisions and Open Risks (brief)
- **Detail**: "Two 56 px lines hold about 18 lowercase characters … about 17 characters and an ellipsis" vs measured 8 characters per 56 px line: "Bartholo" / "mew_Fe…", about 14 visible plus the ellipsis.
- **Fix**: Replace the numbers in both documents with 8 per line, about 14 visible plus the ellipsis for the 24-character name.
- **Decision**: FIXED

### F5 — The widest weekly label fills its column exactly

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 #2 (period headers); Key Discoveries
- **Detail**: Census of every possible label at 12 px Outfit: "20 May" / "30 May" = 40.00 px, the whole 40 px content box of the 48 px column with `px-1`; "Mo" / "We" 17 of 20 px. A wider rendering (WebKit, a fallback font) widens those columns; the weekly grid has 12 px of slack at 360, so up to 3 px per column is absorbed, more is not.
- **Fix**: `px-0.5` on the period headers (content box 24 px daily and 44 px weekly: 7 and 4 px of slack) and the census numbers in Key Discoveries.
- **Decision**: FIXED

### F6 — The production "before" screenshot depends on the owner's order of actions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 #2; row 2.2
- **Detail**: Once the release is approved, production moves and the "before" evidence is gone; the plan named the order but had no fallback.
- **Fix**: State that `screenshots/research-*.png` stand as the before if the device shot is missed, and list the before-shot first among the owner's steps in the implementation PR body.
- **Decision**: FIXED
