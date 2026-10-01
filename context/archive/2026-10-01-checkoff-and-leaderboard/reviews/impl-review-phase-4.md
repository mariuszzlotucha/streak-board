<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Checkoff and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Scope**: Phase 4 of 6
- **Reviewed phases**: 4
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

Reviewed state: commit `e4c7b18` on branch `s-04/checkoff-and-leaderboard/phase-4` (on top of master `ecbc88a`, which contains the merged Phase 3), 6 files: the four planned files (`src/pages/dashboard.astro`, `src/components/tasks/CheckoffControl.tsx`, `src/components/tasks/Leaderboard.tsx`, `scripts/smoke.mjs`), `src/lib/leaderboard-rules.ts` (the queued `UNKNOWN_MEMBER` export from the Phase 1 review follow-up) and `plan.md`. The SHA write-back into the eight Progress rows of Phase 4 is the only uncommitted change.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Summary

Every planned item is implemented as the plan describes: the concurrent load with the preserved failure semantics, the control, the Leaderboard card, the three warning texts, the smoke helpers and the seven smoke bullets, plus both queued follow-ups. No planned item is missing, no "NOT doing" boundary is crossed, and no client directive was added. Both reviewers found no authorization, injection, XSS, cross-group data or data-safety defect: other members' per-task data never reaches the markup, only totals and the viewer's own snapshots do. The three warnings are all small and cheap to fix: the smoke failure reporter crashes on a failing step that uses a single regex (a tooling defect that hides later failures), the Undo form's `task_id` is never read back in smoke (the no-JavaScript undo path is only exercised with the test's own id), and the control's `aria-label` does not contain its visible text. The three observations concern the new dialog copy being checked only by hand, the midnight window of the tick-then-read pairs, and the smoke leaderboard match not pinning list order or the 1, 1, 3 tie case.

## Success Criteria

Re-run during this review (2026-10-01, on the committed tree `e4c7b18`):

- 4.1 `npm run smoke`: PASS. 188 steps (159 before, 29 new), no failure (build + `npm run preview` on :4321, local stack).
- 4.2 `npm test`: PASS. 12 files, 218 tests.
- 4.3 `npm run lint`: PASS. Clean.
- 4.4 `npm run build`: PASS.
- 4.8 `npx astro check`: PASS. 98 files, 0 errors, 0 warnings, 0 hints.
- 4.5, 4.6, 4.7 manual (two-user walk-through, leave warnings and restart from 0, phone width and keyboard): confirmed by the human in the implementing session on 2026-10-01. A diff cannot carry browser evidence, so this is taken from the confirmation, not from the code.

Deliberate break-check from the implementing session (re-reported, not re-run here): 5 mutations, each turned the guarding smoke steps red and was restored from the staged copy: the control ignoring the ticked state (the "Done today, Undo, a streak of 1" step), the Leaderboard showing the row index instead of the position (the four position steps), the totals built from the viewer's rows only (exactly the "owner dashboard shows user B's total" step), the "You" pill removed from the Members card (exactly the seven `memberRow(viewer, "You")` steps, which proves the anchoring), and the control rendered for non-participants (the C, refused-tick and left-the-task steps).

Correction to the implementing session's reading of that break-check: it said the runner "aborts at the dependent tick step" after the first and second mutation. The real cause is the failure reporter crashing on a single-regex expectation (F1). The red verdicts are unaffected; only the number of failing steps printed was cut short.

## How this was reviewed

Two independent, read-only reviewers worked on the commit (neither ran a gate or touched the database); the main session ran the gates above and re-read the code behind F1, F2 and F3 (the reporter lines, the `B_TICKED` expectation and the sibling `aria-label`s).

- Plan adherence: every contract bullet of the five "Changes Required" blocks and both follow-ups checked against the files (all MATCH), extras listed (all harmless), "NOT doing" boundaries checked (none crossed), each smoke bullet compared with the steps actually added.
- Safety, quality and patterns: XSS and injection through titles, e-mails and `aria-label`s, cross-group reads through the unfiltered view, the `Promise.allSettled` rewrite against the old sequential behaviour (including unhandled rejections), degraded states, purity of both components for the Phase 5 hydration, performance, accessibility, and the smoke regexes (row and card boundaries, order and tie independence, the midnight window, state leakage).

Checked and dismissed:

- **`groupParticipantsByTask` now sits outside an inner `try`.** It is a pure function over a typed array, so a throw is practically unreachable; the plan's `allSettled` shape implies the move. Two related differences (`participantsFailed` can be true together with `tasksFailed`, and the participants error is logged even when the Tasks card is hidden) are stated in the plan.
- **When participants fail, the controls and the Leaderboard vanish with only the "Participants are unavailable" note.** Join and Leave are hidden then too, as before, and the plan ties both to "tasks, participants and check-offs all loaded".
- **Empty `members` with an existing group, or a `null` user.** Unreachable: the viewer is always in the group they see, and the route is protected by the middleware.
- **`viewerId` is unused in `CheckoffControl`, and `client:load` in Phase 5 will serialise the Leaderboard rows (user ids and e-mails) into the page source.** By design: the Phase 5 delta store is keyed by user id, the e-mails are already in the HTML of every member's page, and members already receive user ids from `list_group_members`.
- **The Delete task dialog does not mention streaks.** The plan names exactly three dialogs, and "deleted permanently. This cannot be undone." already covers a task's history.
- **`<ol>` loses its list semantics under `list-style: none` in Safari, and the total is a bare number.** Same as the Members card; the card description gives the context.
- **`once` is checked as "no Streak label" only.** The label and the number are rendered by one conditional block, so a bare number cannot appear on its own.
- **The aria-labels, the weekly variants ("Done this week", a weekly streak) and the "Scores are unavailable" note are not asserted in smoke.** The plan did not ask for them; the weekly rule is proven by the Phase 1 unit tests, and the note needs fault injection.

## Findings

### F1 — The smoke failure reporter crashes on a failing step with a single-regex expectation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:1626-1627 (with :325)
- **Detail**: The pass check normalises expectations with `[x].flat()`, but the failure printer calls `.join()` straight on `expected.bodyMatches` and `expected.bodyNotMatches`. `B_TICKED.bodyNotMatches` is a single `RegExp` and is shared by six steps (older steps at :974, :1037, :1329, :1344 and :1413 do the same), and a `RegExp` has no `join`. When any of those steps fails, the script prints its FAIL line and then dies with a TypeError, so every later step is skipped and the real number of failures is hidden. It still exits 1, so it can never turn red into green; it only makes a red run less informative. This is what cut the implementing session's break-check runs short after the `B_TICKED` step.
- **Fix**: Normalise in the reporter the same way as in the check: `[expected.bodyMatches].flat().join(" and ")` and `[expected.bodyNotMatches].flat().join(" or ")`.
- **Decision**: FIXED. The failure reporter in `scripts/smoke.mjs` now normalises `bodyMatches` and `bodyNotMatches` with `[x].flat()`, like the pass check. Break-check: the Leaderboard-position mutation that used to stop after 4 failing steps (the crash after the `B_TICKED` step) now runs to the end with 16 failing steps and the closing "16 step(s) failed" line, and no TypeError; restored from the staged copy.

### F2 — The no-JavaScript Undo form's `task_id` is never read back

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:315-327, :1228, :1464-1483
- **Detail**: `taskTargetInRow` reads the id from the Mark done form only (:1169 for B, :1437 for A's `once` task). Every undo step POSTs the test's own `taskId` or `onceTaskId`, and `B_TICKED` and the `once` tick step match only the Undo form's action and its button label. A control whose Undo form omitted or mangled the hidden `task_id` would pass every step, and the no-JavaScript path (the one Phase 5 keeps as its fallback) would be broken in the browser only. This is the same kind of gap as the Phase 3 F1 (a success path asserted only through the test's own input).
- **Fix**: Add a fail-fast read of the Undo form's id (`taskTargetInRow(body, title, "/api/tasks/uncheck") === taskId`) to the step that first shows B's ticked row (:1228) and to the `once` tick step (:1469), the same way :1169 does it for Mark done.
- **Decision**: FIXED. Two fail-fast reads of the Undo form's id, in the step "user B's dashboard shows Done today, Undo, a streak of 1 and B leading the board" (against `taskId`) and in "creator dashboard shows the once task as Done and the creator's total raised by 1" (against `onceTaskId`); both print FAIL and `process.exit(1)` like the Mark done read. Break-check: with the Undo form's hidden `task_id` set to an empty value the run stops at the first of them (139 steps passed); before the fix every step passed, because the undo steps post the test's own id. Restored.

### F3 — `aria-label="Mark {title} as done"` does not contain the visible label "Mark done"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/tasks/CheckoffControl.tsx:46
- **Detail**: WCAG 2.5.3 (Label in Name) wants the accessible name to contain the visible text, so a voice-control user saying "click Mark done" does not reach the button. The sibling controls all follow it (`Join ${title}`, `Leave ${title}`, `Delete ${title}`, `Edit ${title}`, `Undo ${title}`, `Remove ${email} from the group`). The plan names the string `Mark {title} as done`, so this is the plan's wording, not a drift; smoke asserts only the button text, so changing it is safe, and Phase 5 reuses the component.
- **Fix**: Use `Mark done ${title}` (the verb first, like the siblings).
- **Decision**: FIXED. The Mark done button's `aria-label` is now `Mark done ${title}` (the plan's wording `Mark {title} as done` is superseded; smoke asserts only the button text, and Phase 5 reuses the component).

### F4 — The new warning copy is asserted nowhere in smoke

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:208, :294, :386 (and scripts/smoke.mjs, `B_NOTHING_TICKED` and the owner's dashboard step at :1234)
- **Detail**: The three streak-loss texts are a deliverable of this phase ("Tell users that leaving erases streaks"), but only the manual row 4.6 checks them. The dialogs are rendered inside island props, so the text is in the server HTML and a `bodyIncludes` can see it. Without a check, a later edit that drops or rewords a warning stays green.
- **Fix**: Add `bodyIncludes` for the three phrases ("your streak on it will be lost" and "your streaks in its tasks will be lost" on B's dashboard, "their streaks in its tasks will be lost" on the owner's) to `B_NOTHING_TICKED` and to the owner's step at :1234.
- **Decision**: FIXED. `B_NOTHING_TICKED` has `bodyIncludes` for "and your streak on it will be lost" and "and your streaks in its tasks will be lost" (B's Leave task and Leave group dialogs), and the owner's step "owner dashboard shows user B's total and still offers Mark done on the owner's own row" for "and their streaks in its tasks will be lost" (the Remove member dialog). Break-check: with the three phrases removed from `dashboard.astro`, the five `B_NOTHING_TICKED` steps and the owner's step went red (6 steps); restored.

### F5 — The tick-then-read steps assume the same Warsaw day

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:1222-1258 (and the other tick-to-undo and tick-to-repeat pairs, :1100-1152)
- **Detail**: The JSON steps bracket the Warsaw day before and after the request, but the new page steps do not: if Warsaw midnight falls between a tick and the dashboard read after it, the new day shows an unticked row and the step fails, and a previous-day tick then fails the later `B_*` steps. The window is well under a second per day (about 22:00 or 23:00 UTC in CI), the same class as the Phase 3 F2, but here the assertions are about page markup, so there is no cheap bracket.
- **Fix**: None needed now; a rerun passes. If it ever flakes, retry the whole smoke run once or take the day from the tick response.
- **Decision**: ACCEPTED. No change: the window is well under a second a day and a rerun passes, the same class as the Phase 3 F2. If it ever flakes, retry the run once or take the day from the tick response.

### F6 — `leaderboardRow` does not pin the list order, the row count or the 1, 1, 3 tie

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:224-230
- **Detail**: Each assertion is keyed by e-mail and checks that e-mail's position and total, so an extra or duplicate row, or a list in member order with correct position numbers, would pass. The states smoke reaches (0/0/0 and 1/0/0) give 1, 2, 2 under both competition and dense ranking, so the 1, 1, 3 case is not reachable with three members. The ranking order and ties are pinned by `tests/unit/leaderboard-rules.test.ts`, which is where the plan puts them ("unit: ranking tests; smoke leaderboard rows").
- **Fix**: None needed; the unit tests own ordering and ties.
- **Decision**: ACCEPTED. No change: the ranking order and ties stay pinned by `tests/unit/leaderboard-rules.test.ts`, as the plan's "Where each settled term is proven" table says.

## Triage result

All six findings were resolved: F1, F2, F3 and F4 fixed, F5 and F6 accepted. Only `scripts/smoke.mjs`, `src/components/tasks/CheckoffControl.tsx` (the `aria-label` string) and this report changed; no other production code was touched. Re-run after the fixes:

- `npm test`: PASS. 12 files, 218 tests (unchanged: the fixes touch smoke and one string).
- `npm run lint`: PASS. `npx prettier --check` on both files: PASS. `npx astro check`: PASS, 98 files, 0 errors, 0 warnings, 0 hints.
- `npm run build` and `npm run smoke`: PASS. 188 steps (unchanged count), no failure.
- Break-checks of the fixes: PASS (see F1, F2 and F4). The three mutations went red on the steps that now guard them and were restored from the staged copy; `src/` and `scripts/` were identical to the staged copy afterwards.
