<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Grid state feedback (S-21)

- **Plan**: `context/changes/grid-state-feedback/plan.md`
- **Mode**: Deep (run at high reasoning effort; the lesson assigns max, the owner chose to continue at high on 2026-10-20)
- **Date**: 2026-10-20
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations (all fixed in triage)

## Verdicts

| Dimension             | Verdict                                        |
| --------------------- | ---------------------------------------------- |
| End-State Alignment   | PASS                                           |
| Lean Execution        | PASS                                           |
| Architectural Fitness | PASS                                           |
| Blind Spots           | PASS (1 observation, fixed)                    |
| Plan Completeness     | WARNING (1 warning, 2 observations, all fixed) |

## Grounding

11/11 paths ✓ (`src/lib/grid-labels.ts`, `src/components/dashboard/CheckoffGrid.astro`, `src/components/tasks/GridCell.tsx`, `scripts/token-contrast.mjs`, `tests/unit/grid-labels.test.ts`, `scripts/smoke.mjs`, `tests/e2e/checkoff-round-trip.spec.ts`, `context/changes/deployment/deployment-plan.md`, `CLAUDE.md`, `src/components/dev/dashboard-fixtures.ts`, `scripts/ui-screenshots.mjs`); 8/8 symbols ✓ (`current` at `CheckoffGrid.astro:16`, `periodHeader` `:40`, `STATE_CLASSES` `GridCell.tsx:7`, the icon map `:25`, `PAIRS` `token-contrast.mjs:16`, `taskRowGridCell` `smoke.mjs:231` used at `:562` and `:582`, the six bare `getByText("0"|"1")` lines `:97`, `:105`, `:114`, `:122`, `:129`, `:163`, the streak pair `CheckoffControl.tsx:148-149`); brief↔plan ✓ (decisions, scope, one phase); Progress ✓ (one `## Progress`, `### Phase 1` ↔ `## Phase 1`, 9 automated + 7 manual criteria ↔ rows 1.1–1.16, no checkboxes in the phase block). `docs/reference/contract-surfaces.md` does not exist (check skipped).

Verification agent (read-only): a `.test.ts` in the unit project renders `GridCell` through `renderToStaticMarkup` (scratch run passed, exit 0; Stryker's `mutate` list is unaffected); `bg-card`, `border-primary`, `text-primary`, `text-foreground` are generated from `@theme inline` (`global.css:94-107`) and pass `UI_LITERAL`; `node scripts/token-contrast.mjs` computes `success on card` at 5.37:1 with the same oklch as `--primary`, so the new `primary on card` pair passes; no smoke matcher binds the grid `<thead>`; no e2e locator newly matches " today"; `viewerCell` cannot match a `<th>`; the header "1" collision at `:105`, `:114` is real. Not run: whether `font-medium` widens a 28 px daily header (left to the plan's screenshot gate, which fails on sideways scroll).

## Findings

### F1 — "this week" has no automated binding; smoke has no weekly task

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, item 6 (Smoke); brief, Open Risks
- **Detail**: Item 6 said "and in a weekly-task step if one exists, with 'this week'". None exists: smoke creates daily and once tasks only (`smoke.mjs:1814`, `:1149`, `:2420`, `:2832`); the weekly POSTs at `:1823` and `:1943` are the rejected duplicate-title case and an update that ignores recurrence (`:1953-1954` assert the Daily badge). The e2e round trip is daily too, so the weekly header word is bound only by the `currentPeriodWord` unit test and the screenshots.
- **Fix**: Replace the conditional clause with the fact: smoke binds "today" in `B_NOTHING_TICKED` (`:562`) and `B_TICKED` (`:582`); "this week" is bound by the unit test and reviewed in the weekly grids of the screenshots (manual row 1.10). Same sentence in the brief's Open Risks.
- **Decision**: FIXED (fix applied to plan item 6 and the brief)

### F2 — The "ring would be clipped" rationale is overstated

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries (3rd bullet), Critical Implementation Details (1st bullet), brief "Border vs ring" row
- **Detail**: The table's `border-spacing` (4 px, 2 px under 640 px) also applies at the outer edge, so a `ring-2` on the last column sits inside that spacing and touches the wrapper edge on phones rather than being clipped; clipping starts with a wider ring or a `ring-offset`. The border choice stays right (inside the 28 px box, 24 px left for the 16 px icon), but the stated reason was wrong.
- **Fix**: Reword the three places to the accurate reason.
- **Decision**: FIXED

### F3 — TaskRow.astro renders the grid and is not named

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries / References
- **Detail**: `CheckoffGrid` is rendered only by `src/components/dashboard/TaskRow.astro:5`, `:112`; `GridCell` only by `CheckoffGrid.astro:2` and `ViewerGridCell.tsx:3`; `grid-labels` only by those two and its test. Nothing in `TaskRow` changes, but the blast-radius list should say so.
- **Fix**: Add a blast-radius bullet to Key Discoveries and `TaskRow.astro:112` to References.
- **Decision**: FIXED

### F4 — The roadmap still promises "potwierdzenie zapisu" as an element

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, item 9 (closing docs PR); manual row 1.16
- **Detail**: MS-02 and S-21's outcome (`roadmap.md:30`, `:89`) read "po kliknięciu użytkownik dostaje potwierdzenie zapisu" / "krótkie potwierdzenie". The frame resolved it as the existing flip (owner, 2026-10-19) and the plan builds no element; a reader of the closed milestone would look for a confirmation that was never built.
- **Fix**: In item 9, append one line under S-21's Unknowns in `roadmap.md` in the closing docs PR recording the resolution, status and history untouched; mention it in the manual criterion behind row 1.16.
- **Decision**: FIXED

## Triage summary

Fixed: F1, F2, F3, F4 (4). Skipped: none. Accepted: none. Dismissed: none. Verdict after fixes: SOUND.
