# Checkoff Grid (S-13) Implementation Plan

## Overview

Give every task row on `/dashboard` a grid of participants × periods: the last 7 Warsaw days (today included) for `daily`, the last 4 weeks (current week included) for `weekly`, a single column for `once`. It is the first "who did what" view (PRD §Vision), computed from data the dashboard already loads, with the same period rules as the streak. The viewer's own current cell follows their tick live. The same change fixes the documents the frame lists.

## Current State Analysis

- Members see only their own check-off, the participants' nicknames and the leaderboard totals; `buildBoard` folds everyone else's history into a sum (`src/lib/leaderboard-rules.ts:110-146`, `frame.md` H1).
- The full check-off history of every enrolment is already read on each `/dashboard` (`src/lib/dashboard-data.ts:78-83`, `src/lib/checkoffs.ts:14-26`). `joined_at` exists and is readable (`supabase/migrations/20261001090000_create_task_participants.sql:29`, `:42`) but `listTaskParticipants` selects only `task_id, user_id` (`src/lib/tasks.ts:58-62`).
- Period rules live in `src/lib/streak-rules.ts`; the day-number helpers (`dayNumberOf`, `keyOfDayNumber`, `mondayOf`, `:25-36`) are private. `snapshotOf` (`:96-132`) is the only normaliser of stored keys (weekly snap to Monday, repeats, future keys).
- `CheckoffControl` publishes only a score delta (`src/components/tasks/CheckoffControl.tsx:68-74`, `src/lib/checkoff-sync.ts`); only the Leaderboard subscribes.
- Smoke binds the task `<li>` with regexes that stop at the first `</li>`; `taskRowListing` matches a nickname anywhere after the title in the row (`scripts/smoke.mjs:197-252`).
- Problem framing, hypothesis table and owner decisions (horizon, PRD placement, no hypothesis test) are in `frame.md`; code anchors in `research.md`.

## Desired End State

On `/dashboard`, each task row shows, after its participants line, a table: one row per participant who is a group member (participation order), one column per period of the horizon, oldest left, current right. Each cell is one of:

- **done** — a stored check-off normalises to that period (success token, check icon);
- **missed** — a closed period at or after joining with no check-off (destructive token, x icon);
- **open** — the current period, not yet done (muted, dash);
- **not joined** — a period before the participation's `joined_at` Warsaw period, with no check-off (muted, empty/dot).

A stored check-off wins over `joined_at` (a pre-join check-off shows done, matching the streak). `once` tasks show one column: done or open. Every cell carries a text label (e.g. "Kasia, Mon 13 Oct: done") for screen readers. After the viewer taps Mark done / Undo, their current cell flips at once and rolls back with the button. When participants or check-offs fail to load, no grid renders (the existing `role="status"` notice stays). The listed documents state what the grid shows and what leaving a task erases.

Verify: unit tests for the rules and data, smoke assertions on the grid markup, kitchen-sink screenshots of every cell state, the manual round trip below.

### Key Discoveries:

- `buildBoard` already loops tasks × participants with the current period per recurrence (`leaderboard-rules.ts:122-135`): the grid builder follows the same loop shape and input types (`BoardInput`).
- The board runs in its own try/catch that degrades to `checkoffsFailed` (`dashboard-data.ts:104-122`): the grid goes inside the same try so a throw cannot hide Members.
- Kitchen-sink fixtures compute the board with the real rules at `NOW = 2026-10-11T10:00:00Z` (`src/components/dev/dashboard-fixtures.ts:126`, `:212-247`); `emptyData()` mirrors `DashboardData`.
- Existing tokens `--success`, `--destructive`, `--muted` cover the cells (`src/styles/global.css:28-34`, `.dark` block); no token pipeline change.
- TaskRow already uses ARIA roles instead of nested `<li>` for the smoke regexes (`TaskRow.astro:26-27`); a `<table>` has no `<li>`.

## What We're NOT Doing

- No new query or SQL; no migration.
- No change to the streak or decay rule, the leaderboard, or the check-off write paths and their date window (Q-04 stays a known gap in the PRD).
- No long-term history, charts or statistics (PRD Secondary stays parked).
- No grid row for a participation whose user is not a group member (matches `buildBoard` totals; the participants line keeps "Unknown member").
- No `/dashboard` CPU measurement (pre-existing risk, stays in `deployment-plan.md`).
- No analytics or hypothesis test (privacy policy promises "No analytics"; how to check the M-3 north star stays an owner question in the roadmap).
- No privacy policy change to `WhoCanSee.astro` (it already says members see the days or weeks you mark done; the grid does not show the join date as a date).
- No per-group or per-user timezone.

## Implementation Approach

Pure rules first (testable with fixed dates, mutation-testable), then data wiring in `loadDashboard`, then the view and the live cell, then documents. The grid is server-rendered Astro except the viewer's current cell, which is a tiny island reading a new per-task "checked" signal from `checkoff-sync` — the same cross-island pattern the Leaderboard uses for deltas. Lessons apply: one goal run, one PR, impl review before push.

## Critical Implementation Details

- **Same normalisation as the streak.** The grid must snap weekly keys to their Monday and ignore future keys exactly like `snapshotOf`; it must call shared helpers from `streak-rules.ts`, not re-derive dates, or the grid and the streak beside it can disagree.
- **Live cell hydration.** The island's first render must equal the server HTML (initial state from props, store empty on the server), as `CheckoffControl` and `Leaderboard` do; otherwise React hydration mismatches.
- **"Not joined" boundary.** Compare against the Warsaw period of `joined_at` (`periodKeyFor(recurrence, new Date(joined_at))`); the join period itself is a normal period (missed/open/done), not "not joined".

## Phase 1: Grid rules

### Overview

Export a period-enumeration helper and add a pure grid builder with exhaustive unit tests.

### Changes Required:

#### 1. Period enumeration

**File**: `src/lib/streak-rules.ts`

**Intent**: Let other rules list the periods of a horizon with the same day arithmetic the streak uses, instead of duplicating the private helpers.

**Contract**: `export function recentPeriods(recurrence: "daily" | "weekly", currentPeriod: PeriodKey, count: number): PeriodKey[]` — ascending, last element `currentPeriod`; weekly steps 7 days from the Monday key. Also `export function normalisePeriod(recurrence, key): PeriodKey` (weekly → Monday key, daily → key) reused by the grid. Existing functions unchanged.

#### 2. Grid builder

**File**: `src/lib/grid-rules.ts` (new, browser-safe, no server imports, `now` injected)

**Intent**: Turn tasks, member participations with `joined_at`, and periods per enrolment into the cells the view renders.

**Contract**:

- `export const GRID_HORIZON = { daily: 7, weekly: 4 } as const`
- `export type CellState = "done" | "missed" | "open" | "notJoined"`
- `export interface GridRow { userId: string; nickname: string | null; isYou: boolean; cells: CellState[] }`
- `export interface TaskGrid { periods: PeriodKey[]; rows: GridRow[] }` (`once`: `periods` = `[currentPeriod]`, one cell: `done` when any key exists, else `open`)
- `export function buildGrids(input: GridInput): Map<string, TaskGrid>` where `GridInput` = `{ members, tasks, participations: ReadonlyMap<taskId, readonly { userId: string; joinedAt: string }[]>, periodsByEnrolment, viewerId, now }`.
- Rules: rows only for participants present in `members`, in participation order; a key after the current period is ignored; done beats notJoined; current period without key → `open`; closed period before the join period without key → `notJoined`; else `missed`.

#### 3. Tests

**File**: `tests/unit/streak-rules.test.ts`, `tests/unit/grid-rules.test.ts` (new)

**Intent**: Pin every cell state and boundary with fixed instants.

**Contract**: cases — daily 7 columns ending today across a Warsaw midnight (UTC 22:30 vs 23:30 in CEST) and a DST change week; weekly 4 Mondays with a key on Wednesday counting for its week; repeated keys; future key ignored; pre-join check-off shows done; join period itself missed/open; once done/open; stale participant skipped; viewer flag; empty participation.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint and type check pass: `npm run lint` and `npx astro check`
- Mutation run on the grid rules reviewed survivor by survivor: `npm run test:mutation -- --mutate src/lib/grid-rules.ts`

#### Manual Verification:

- Survived mutants reviewed; assertions added only for user-visible ones

**Implementation Note**: phase blocks use plain bullets; checkboxes live in `## Progress`.

---

## Phase 2: Data

### Overview

Read `joined_at` and compute the grids in `loadDashboard`.

### Changes Required:

#### 1. Participants with join time

**File**: `src/lib/tasks.ts`, `src/lib/task-rules.ts`

**Intent**: Carry `joined_at` without changing the existing `participantsByTask: Map<string, string[]>` consumers.

**Contract**: `TaskParticipant` gains `joined_at: string`; `listTaskParticipants` selects `task_id, user_id, joined_at` (order unchanged). Add a grouping that yields `Map<taskId, { userId, joinedAt }[]>` in the same order; `groupParticipantsByTask` keeps its output.

#### 2. Dashboard load

**File**: `src/lib/dashboard-data.ts`

**Intent**: Compute grids with the board, inside the board's try/catch, so a throw degrades exactly like a board failure.

**Contract**: `DashboardData.grids: Map<string, TaskGrid> | null` (null whenever `board` is null); set together with `board` from the same `now` instant and the same `groupPeriodsByEnrolment` result. Report key unchanged (`dashboard.leaderboard.failed`).

#### 3. Tests and fixtures

**File**: `tests/unit/dashboard-data.test.ts`, `tests/helpers/fake-supabase.ts` (if the select shape is asserted), `src/components/dev/dashboard-fixtures.ts`

**Intent**: Cover grids present / null on each failure; keep fixtures type-correct.

**Contract**: `emptyData()` gains `grids: null`; fixture participations get `joined_at` values and `CHECKOFFS` gets periods that produce all four states at `NOW`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Integration tests pass against the local stack: `npm test`
- Astro type check passes: `npx astro check`
- Lint passes: `npm run lint`

---

## Phase 3: UI

### Overview

Render the grid in every task row and keep the viewer's current cell in step with their tick.

### Changes Required:

#### 1. Grid component

**File**: `src/components/dashboard/CheckoffGrid.astro` (new), `src/components/dashboard/TaskRow.astro`, `src/components/dashboard/TasksCard.astro`

**Intent**: A compact, phone-readable table as the row's fourth line, after the participants line, only when the grid exists and has at least one row.

**Contract**: `<table aria-label="Check-offs of {title}">` with a `<caption class="sr-only">`, column headers = short period labels (daily: weekday + day, e.g. "Mo 13"; weekly: "from 13 Oct"; once: "Done"), row headers = nickname ("Unknown member" fallback) plus "You" badge; cells use only token pairs `scripts/token-contrast.mjs` checks (done = `bg-success text-success-foreground`, missed = `bg-destructive/10 text-destructive`, open/not joined = `bg-muted text-muted-foreground`; any other pair is added to the script in the same change) with lucide `Check` / `X` / `Minus` and an `sr-only` state label. No `<li>`, no `role="alert"`. Horizontal overflow scrolls inside the table wrapper, never the page. `TasksCard` passes `grids?.get(task.id)`.

#### 2. Live viewer cell

**File**: `src/lib/checkoff-sync.ts`, `src/components/hooks/` (new hook), `src/components/tasks/CheckoffControl.tsx`, `src/components/tasks/ViewerGridCell.tsx` (new)

**Intent**: The viewer's current-period cell follows the optimistic tick and its rollback.

**Contract**: `checkoff-sync` adds a per-task checked map (`publishChecked(taskId, checked)`, snapshot + subscribe, empty on the server) next to the deltas; `CheckoffControl` publishes it wherever it sets `checked` (tap and rollback). `ViewerGridCell` (`client:load`, props `taskId`, `initialState: CellState`) renders `done` when the store says checked, `open` when it says unchecked, else `initialState`. Only the viewer's current cell is an island.

#### 3. Kitchen sink and smoke

**File**: `src/components/dev/dashboard-fixtures.ts`, `scripts/smoke.mjs`, `tests/unit/checkoff-sync.test.ts`

**Intent**: Gate the markup and show every state.

**Contract**: owner/member fixtures show a daily, a weekly and a once grid with done, missed, open and not-joined cells. Smoke adds a row-scoped grid assertion (the task `<li>` contains `aria-label="Check-offs of <title>"` and, after a tick in the existing round trip, the viewer's current cell reads done); existing `taskRowListing` keeps matching the participants line, which precedes the grid. Sync store tests cover publish, rollback and the empty server snapshot.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint (incl. no-literal colour rule) and token contrast pass: `npm run lint` and `node scripts/token-contrast.mjs`
- Build passes: `npm run build`
- Smoke passes against the local stack: `npm run smoke`
- E2E check-off round trip passes: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`

#### Manual Verification:

- Kitchen sink screenshots (`scripts/ui-screenshots.mjs`) show all four cell states in light and dark, readable at 375 px width without page scroll
- Tapping Mark done / Undo flips the viewer's current cell at once; a forced failure rolls it back with the button
- Screen reader reads each cell as name, period and state

---

## Phase 4: Documents

### Overview

Make the documents say what the grid shows and what leaving erases (list from `frame.md`, "Co zmienia się dla /10x-plan").

### Changes Required:

#### 1. Product documents

**File**: `context/foundation/prd.md`, `context/foundation/roadmap.md`

**Intent**: Record the grid as fulfilling §Vision; Secondary unchanged; owner corrections bound to S-13.

**Contract**: PRD — grid in the relevant FR/§Vision text with horizon 7 days / 4 weeks and cell states; streak line (`:119`), Open Questions (`:140-142`), levels (`:20`), individual tasks (`:30`) per `open-items.md:44`; Q-04 date window noted as a known gap. Roadmap — MS-01 anchor points at §Vision (status edits through `/10x-roadmap` only).

#### 2. Domain documents

**File**: `context/domain/glossary.md`, `context/domain/01-domain-distillation.md`

**Intent**: Add the grid and cell-state terms; fix entries the frame names.

**Contract**: glossary `:54`, `:56`, `:57`; distillation B-04 (`:100`), N-12 (`:180`), R-06 (`:210`).

#### 3. User-facing copy

**File**: `src/components/landing/SpreadsheetPitch.astro`, `src/components/privacy/Retention.astro`, `src/components/dashboard/TaskRow.astro`, `src/components/dashboard/GroupSettingsCard.astro`, `src/components/dashboard/MembersCard.astro`

**Intent**: Remove the false "one bad day doesn't end the run" (a streak of 1 drops to 0); state that leaving a task (or being removed / leaving the group) erases that task's check-off history; dialogs say the history is lost, not only the streak.

**Contract**: landing `:12-14`; Retention `:9-10`; dialogs `TaskRow.astro:93`, `GroupSettingsCard.astro:81`, `MembersCard.astro:44`. Smoke strings that bind these texts updated in the same change: `scripts/smoke.mjs:511` ("and your streak on it will be lost") and `:1275` ("and your streaks in its tasks will be lost"), plus any e2e spec a grep for the old texts finds.

### Success Criteria:

#### Automated Verification:

- Lint, format and build pass: `npm run lint`, `npx prettier --check context/changes/checkoff-grid context/foundation/prd.md context/foundation/roadmap.md context/domain/glossary.md context/domain/01-domain-distillation.md` (the files this change touches; the rest of `context/**` fails on master, owner decision 2026-10-17), `npm run build`
- Smoke passes: `npm run smoke`

#### Manual Verification:

- Owner reads the PRD, landing and dialog wording and accepts it

---

## Testing Strategy

### Unit Tests:

- `recentPeriods` / `normalisePeriod` across midnight, DST and year boundaries.
- `buildGrids`: every cell state, pre-join check-off, join period, future and repeated keys, weekly mid-week key, once, stale participant, viewer flag.
- `loadDashboard`: grids set with board, null on each failure and on a builder throw.
- `checkoff-sync`: checked map publish, rollback, server snapshot.

### Integration Tests:

- Existing `npm test` suite with the new `joined_at` select (RLS unchanged).

### Manual Testing Steps:

1. Two accounts in one group, a daily and a weekly task; tick with one, reload the other: the cell shows done for today / this week.
2. Leave and rejoin a task: past cells show not joined.
3. Phone width: grid scrolls inside the row, page does not.

## Performance Considerations

One extra linear pass per enrolment over its `periods` array on each dashboard load, on top of `snapshotOf`; no new network read. CPU is not measured in this change.

## Migration Notes

None: no schema change; `joined_at` already exists and is granted.

## References

- Frame: `context/changes/checkoff-grid/frame.md`
- Research: `context/changes/checkoff-grid/research.md`
- Similar implementation: `src/lib/leaderboard-rules.ts:110-146`, `src/components/tasks/Leaderboard.tsx`, `src/lib/checkoff-sync.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Grid rules

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — d46fbc9
- [x] 1.2 Lint and type check pass: `npm run lint` and `npx astro check` — d46fbc9
- [x] 1.3 Mutation run on the grid rules reviewed survivor by survivor: `npm run test:mutation -- --mutate src/lib/grid-rules.ts` — d46fbc9

#### Manual

- [ ] 1.4 Survived mutants reviewed; assertions added only for user-visible ones

### Phase 2: Data

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — c708b7b
- [x] 2.2 Integration tests pass against the local stack: `npm test` — c708b7b
- [x] 2.3 Astro type check passes: `npx astro check` — c708b7b
- [x] 2.4 Lint passes: `npm run lint` — c708b7b

### Phase 3: UI

#### Automated

- [x] 3.1 Unit tests pass: `npm run test:unit` — 0a10058
- [x] 3.2 Lint (incl. no-literal colour rule) and token contrast pass: `npm run lint` and `node scripts/token-contrast.mjs` — 0a10058
- [x] 3.3 Build passes: `npm run build` — 0a10058
- [x] 3.4 Smoke passes against the local stack: `npm run smoke` — 0a10058
- [x] 3.5 E2E check-off round trip passes: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts` — 0a10058

#### Manual

- [ ] 3.6 Kitchen sink screenshots (`scripts/ui-screenshots.mjs`) show all four cell states in light and dark, readable at 375 px width without page scroll
- [ ] 3.7 Tapping Mark done / Undo flips the viewer's current cell at once; a forced failure rolls it back with the button
- [ ] 3.8 Screen reader reads each cell as name, period and state

### Phase 4: Documents

#### Automated

- [x] 4.1 Lint, format and build pass: `npm run lint`, `npx prettier --check context/changes/checkoff-grid context/foundation/prd.md context/foundation/roadmap.md context/domain/glossary.md context/domain/01-domain-distillation.md` (the files this change touches; the rest of `context/**` fails on master, owner decision 2026-10-17), `npm run build` — 06921d6
- [x] 4.2 Smoke passes: `npm run smoke` — 06921d6

#### Manual

- [ ] 4.3 Owner reads the PRD, landing and dialog wording and accepts it
