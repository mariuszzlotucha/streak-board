<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Checkoff and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Scope**: Phase 1 of 6
- **Reviewed phases**: 1
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

Reviewed state: the working tree of branch `s-04/checkoff-and-leaderboard/phase-1`. The phase is not committed yet: four new files (`src/lib/streak-rules.ts`, `src/lib/leaderboard.ts`, `tests/unit/streak-rules.test.ts`, `tests/unit/leaderboard.test.ts`) plus the Progress ticks in `plan.md` and the status in `change.md`. Manual row 1.5 is still waiting for the human's confirmation.

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

No defect was found in the production code. Every export matches the plan's contract and the independent checks agree with it (see "How this was reviewed"). The four warnings are all about the tests that guard that code: the suite is green for the correct implementation but would stay green for plausible wrong ones (a `localeCompare` ranking, a local-time `Date` getter, an O(n²) de-duplication, an unsorted weekly history). All the fixes are small test additions.

## Success Criteria

Re-run during this review (2026-10-01):

- 1.1 `npm test`: PASS. 10 files, 172 tests (95 new: 79 in `streak-rules`, 16 in `leaderboard`).
- 1.2 `npm run lint`: PASS. Clean.
- 1.3 `npx astro check`: PASS. 84 files, 0 errors, 0 warnings, 0 hints.
- 1.4 `npm run build`: PASS.
- 1.5 manual (every expected value derivable from the PRD sentence and the plan): PASS, checked at the user's request after the fixes. An independent Python oracle written only from the PRD sentence and the plan decisions (zoneinfo for the Warsaw calendar, a period-by-period walk, no code shared with `src/lib/`) re-derived 177 expected values and header claims from the two unit test files, among them every table row, the board example and the ranking cases, and all of them equal the literals in the tests. Earlier, the plan-adherence reviewer had derived about 100 values by hand before opening the implementation, with no disagreement. The values that rest on a plan decision rather than on the PRD sentence are named in the test headers (F7).

## How this was reviewed

Two independent, read-only reviewers worked on scratch copies in the session scratchpad; `git status` was identical before and after.

- Plan adherence: contract check of every export, a checklist of the plan's named tests, about 100 expected values derived by hand before the implementation was opened (0 disagreements), a separate Python oracle on 4,000 random histories (0 mismatches) and 43 mutants of the implementation run against the test files.
- Quality and patterns: an independent period-by-period reference on about 218,000 random histories (0 disagreements), 4.57 million instants against an independent EU-DST implementation under six host zones (0 mismatches), calendar arithmetic over 329,084 consecutive days, 9,000 random boards against a brute-force board, 4,000 ranking sets × 6 input permutations, an in-memory bundle of an island-like entry, and 79 mutants run against the test files (68 real, 61 killed, 7 survive; the survivors are what F1–F4 describe).

Notes: the reviewers ran on Node 24.21 (the project pins 22.14). Test-first order cannot be proven from file timestamps (the formatter rewrote the files); its evidence is the RED runs of the implementing session.

## Findings

### F1 — The scale guard cannot catch the regressions it claims to catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/unit/leaderboard.test.ts:246-278 (bound at :277)
- **Detail**: The plan asks for a deliberately generous bound that "trips only on gross regressions such as a quadratic scan", and the test follows it (250 ms). The bound is about 50× the roughly 5 ms the implementation needs on the guard's own input, so the guard is insensitive rather than flaky. Reviewer measurements on that input with scratch variants of `snapshotOf`: the plan's "literal reading" (a `Date` and a `Set` per key plus a sorted copy) takes 18 ms and an O(n²) de-duplication with `Array.includes` takes 16 ms, and both pass the guard (with the `includes` variant the real suite stays at 95/95 green); only an O(n²) re-fold of every prefix (6,000 ms) trips it. The Workers Free plan allows about 10 ms of CPU for the whole request, roughly 1.8 µs per stored period at 15 enrolments × 365 periods, so a regression to the literal reading, which is what the plan set out to avoid, would go unnoticed in CI. My own earlier check used a heavy quadratic (1.3 s) and overstated the guard's sensitivity.
- **Fix A ⭐ Recommended**: Keep the functional assertion (every total is 2190) and replace the absolute bound with a complexity ratio: time `buildBoard` at 1,000 and at 8,000 daily periods per enrolment (median of 5 runs after a warm-up) and require `t(8000) / t(1000) < 24` (linear ≈ 8, quadratic ≈ 64).
  - Strength: independent of machine speed; the reviewer measured a ratio of 4.5–9.4 for the implementation and 48–55 for the `includes` variant over 40 trials, and 25/25 green sequentially and 15/15 under six busy loops (measured on `snapshotOf` alone).
  - Tradeoff: still a timing test, so noise at sub-millisecond scale is possible, and it cannot catch a linear but slower regression such as the literal reading.
  - Confidence: MED — measured once, on one machine; I would run it 30× and against the mutant before committing.
  - Blind spot: shared CI runners were not tried.
- **Fix B**: Keep the absolute bound and rewrite its comment to say exactly what it catches (only heavy quadratics), leaving the CPU budget to the Phase 6 reading from Workers Logs.
  - Strength: no flakiness risk and no new test code.
  - Tradeoff: nothing in CI defends the plan's performance requirement.
  - Confidence: HIGH — it only changes a comment.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A. The guard is now a ratio test on `buildBoard` (8,000 against 1,000 periods per enrolment, median of 5 after a warm-up, bound 24) next to the unchanged 2190-totals assertion. Measured on this machine: ratio 7.6–8.2 idle and 4.0–14.0 under six busy loops on eight cores; the real test passed 30/30 idle and 15/15 loaded; the `Array.includes` de-duplication mutant, which passed the old 250 ms guard, is now killed.

### F2 — Host time zone and locale dependence is pinned in neither the dev box nor CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/unit/streak-rules.test.ts, vitest.config.ts:8-14
- **Detail**: The code is host-independent (reviewer: 0 mismatches against an independent EU-DST implementation over 4.57 million instants under six host zones, and both test files pass under 6 zones × 5 default locales). The suite, however, can detect a host-zone dependence only in some zones. Reviewer mutants run against the unmodified tests: dropping `timeZone: APP_TIME_ZONE` survives in Europe/Warsaw (this machine) and dies in UTC and America/Los_Angeles; computing `dayNumberOf` from a local `new Date(y, m, d)` survives in UTC (CI runs on `ubuntu-latest` without `TZ`) and dies elsewhere; computing `keyOfDayNumber` from local getters survives in both Warsaw and UTC and dies only west of UTC. The last two would break the optimistic preview for users in the Americas, the very property the island relies on. My earlier manual runs under America/Los_Angeles and Pacific/Kiritimati were a one-off, not a guard. A host-locale variant (`Intl.DateTimeFormat(undefined, …)`) cannot be pinned in-process; it only misbehaves under exotic default locales (th-TH, fa-IR, ar-SA).
- **Fix A ⭐ Recommended**: Pin a negative-offset DST zone for the Vitest run (`test.env.TZ = "America/Los_Angeles"` in `vitest.config.ts`), confirm all 10 files still pass and that the three mutants now die.
  - Strength: one line; the dev box and CI then run the same, more discriminating conditions (every catchable mutant died under Los Angeles in the reviewer's runner).
  - Tradeoff: it also changes the process zone for the integration tests (they use Postgres and UTC helpers, and an earlier manual Los Angeles run was green), and the effect of `env.TZ` inside the Vitest worker has to be verified, which the reviewer could not do.
  - Confidence: MED — the Vitest wiring is unverified.
  - Blind spot: whether Vitest applies `TZ` before the first `Date` is used in the worker.
- **Fix B**: Leave the config alone and state in the unit-test header that host independence was checked by hand under Los Angeles and Kiritimati.
  - Strength: no infrastructure change.
  - Tradeoff: a regression to local-time getters passes both the dev box and CI.
  - Confidence: HIGH — documentation only.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A. `test.env.TZ = "America/Los_Angeles"` in `vitest.config.ts`. A temporary probe confirmed that the worker runs in that zone (offsets 480 and 420, default `Intl` zone) and was deleted. The full suite is green under it (176 tests, 10 files) and the three zone mutants (no `timeZone`, local `new Date(y, m, d)`, local getters) are now killed.

### F3 — Code-unit ranking order and case folding are not pinned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/leaderboard.test.ts:103-116, src/lib/leaderboard.ts:40-41,50
- **Detail**: `compareCodeUnits` exists so the order is identical on the server and in every browser locale (plan: the Leaderboard's server HTML must equal its first client render). Replacing it with `a.localeCompare(b)` keeps all 95 tests green (both reviewers ran this mutant). Pairs where code-unit and locale order differ, checked on Node 24 with ICU `en`: `john@example.com` vs `john2@example.com`, `é@x.io` vs `f@x.io`, `~tilde@x.io` vs `zed@x.io`, `a1@x.io` vs `a@x.io`. The fold direction (`toLowerCase` against upper-casing) is unpinned too: `john_smith@x.io` vs `johnny@x.io`, because `_` sits between the upper- and the lower-case letters; the plan leaves that direction open.
- **Fix**: Add two rows to the ordering test: `john2@example.com` before `john@example.com` (`2` is 0x32, `@` is 0x40: code-unit order, not locale order) and `john_smith@x.io` before `johnny@x.io` (lower-cased: `_` is 0x5F, `n` is 0x6E), with a comment that the fold direction is the implementation's choice.
- **Decision**: FIXED. Added "orders by code units, not by locale, and folds case downwards" to `leaderboard-rules.test.ts`; the `localeCompare` and the upper-case-fold mutants are killed.

### F4 — Several named tests assert less than their names say

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/streak-rules.test.ts:165-185, tests/unit/leaderboard.test.ts:159,176
- **Detail**: Mutants on scratch copies (both reviewers) show behaviours that no named test pins. Weekly input that arrives unsorted is never tested (the plan's "input hygiene" bullet is covered for daily only and the sweep's keys are always ascending), so a mutant that never sorts weekly input survives. `streak-rules.test.ts:180-185` ("ignores keys after the current period"): the first assertion has a checked current period, so the fold stops at it before reaching the future key and passes even with the future-key guard deleted, and the weekly case is not tested at all; only the 2,000-run sweep kills those mutants. `:176-178` ("counts two keys of the same week once"): both keys snap to the current week, so the result is 1 even without de-duplication; a repeat in a past week is exercised only by the sweep. Nothing checks that `snapshotOf` leaves its input alone: a mutant that sorts the caller's array in place, or splices duplicates out of it, passes all 95 tests, and `readonly` is compile-time only while `groupPeriodsByEnrolment` hands the same arrays over. `leaderboard.test.ts:159` says "in member order" but sorting by total gives the same output on that data, and `:176` says "and does not count their streak" but asserts only the id list. (A mutant that gives `once` the weekly key inside `buildBoard` also survives, because the Warsaw-clock test uses a Monday instant; `periodKeyFor("once")` itself is pinned on a Friday and the value is informational, so no test is proposed for it.)
- **Fix**: Add six small tests, each derived by hand and each confirmed to fail against its mutant, and rename the two titles: (a) daily keys Mon–Wed plus a future `2026-10-05`, shown on `2026-10-01` → 3; (b) weekly `THREE_WEEKS` plus a future `2026-10-12`, shown in the open week `2026-10-05` → 3; (c) `THREE_WEEKS` reversed gives the same snapshot as sorted and the value 3; (d) weekly keys `2026-09-21`, `2026-09-23`, `2026-09-28`, shown on `2026-09-28` → 2; (e) a frozen, unsorted input with a duplicate gives `{ base: { value: 2, period: "2026-09-29" }, checked: true }` for `2026-09-30`; (f) `buildBoard` with the members reversed keeps `totals` in that order.
- **Decision**: FIXED. Added the weekly-unsorted and the frozen-input tests, strengthened the future-key test (daily and weekly, current period unchecked) and the same-week test (an earlier week), added the member-order test and renamed the two titles. The mutants for the future-key guard, the sort, the repeat skip, the in-place sort and the sorted totals are all killed.

### F5 — `snapshotOf` is two loops over one numeric array, and the plan's cost figures are optimistic

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/streak-rules.ts:92-128, plan.md:98 and :492
- **Detail**: The plan asks for "a single pass over integer day numbers … no per-key `Date`, `Set` or array copy". The code parses every key into a `number[]` (first loop, which also detects the order), sorts it only when needed, and folds it (second loop). There is no per-key `Date`, no `Set` and no copy of the string array, and the source comment says exactly that, but a numeric array exists, and a true single pass could not stop at the first future key while the input might still be unsorted. Reviewer measurements (Node 24, not workerd): about 200 ns per stored period warm (about 1 ms for 15 × 365, 2.8–3.8 ms for 50 × 365) and 3.8–4.7 ms (15 × 365) and 7.4–9.0 ms (50 × 365) on the first call of a fresh process. The plan's prototype did about 140 ns per key and the literal reading about 1,100 ns, so the saving is about 5.5× rather than 9×. At the plan's target scale that is about 10 % of the 10 ms Free-plan budget warm and up to about 50 % cold, before SSR. A charCodeAt-based parser would be 5× faster warm but only 10–15 % faster on a cold first call.
- **Fix**: Add the measured figures to the plan's Performance Considerations and keep the code; revisit the parser only if the Phase 6 CPU reading is close to the limit.
- **Decision**: FIXED. The `snapshotOf` clause in `plan.md` now says linear over integer day numbers with no per-key `Date` or `Set` and no copy of the string array; the measured figures were added to Performance Considerations; the source JSDoc was aligned. No code change.

### F6 — The Intl formatter is built at import time in every bundle that imports `streak-rules`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/streak-rules.ts:15-20
- **Detail**: The Phase 5 island imports `streakValue` and `rankStandings` but never `periodKeyFor`, yet the module-level `new Intl.DateTimeFormat(…)` counts as a side effect and stays in the bundle: the reviewer's in-memory build of an island-like entry with the repo's own Rolldown kept it (3,256 bytes, 3,012 with the annotation below). Every page with the island would build a formatter it never uses (the first one costs about 13 ms of ICU initialisation in a fresh Node process; the browser cost was not measured), and an engine without time-zone data would throw at import and stop the island from hydrating.
- **Fix**: Mark the constructor `/* @__PURE__ */` (verified to drop it from such a bundle); the server still builds one formatter at startup.
- **Decision**: FIXED. `warsawDate` is now `/* @__PURE__ */ new Intl.DateTimeFormat(…)` with a comment. Lint, `astro check`, the tests and the build are green; the bundle effect is the reviewer measurement and was not re-run here.

### F7 — Comments and oracle headers do not state their sources exactly

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/streak-rules.ts:6 and :83-91, src/lib/leaderboard.ts:70-79, tests/unit/streak-rules.test.ts:1-38, tests/unit/leaderboard.test.ts:1-30
- **Detail**: (a) `streak-rules.ts:6` says "PRD Non-Goals: no per-group or per-user timezone". The PRD's Non-Goals (`prd.md:109-114`) list multiple groups, configurable decay speed, anti-cheat and offline, and the PRD has no timezone item at all; the exclusion comes from the S-02 and S-04 plans (the plan's own "(PRD Non-Goals)" at plan.md:38 is inexact for the timezone and the week start). (b) Manual criterion 1.5 says every expected value is derivable "from the PRD sentence and this plan". The headers do not flag that the numeric rule (halve, floor, +1) and "1 → 0 after one miss" are plan decisions that go beyond the PRD's "does not reset completely" (plan.md:60 states the deviation; the test header quotes the PRD sentence and only an inline comment at `streak-rules.test.ts:102` mentions it), that "Unknown member" is compared lower-cased (between `bob@` and `zed@`), and the `periodsBetween` rows, the `MAX_SAFE_INTEGER` rows, the `snapshotOf` rows and the with-tick column of the optimistic table are missing from the header tables (all derivable, but not listed). (c) Input contracts are implicit: keys must be valid `YYYY-MM-DD` as PostgREST emits Postgres `date` values (malformed keys throw or yield NaN depending on position: `["garbage"]` throws a RangeError while `["garbage", "2026-09-30"]` returns a NaN base), and the ids in `BoardInput` must be unique (a participant listed twice doubles the total). Both are unreachable through the app: the view emits `YYYY-MM-DD` and the ids are primary keys.
- **Fix**: Comment-only edits: cite the S-02/S-04 plans at `streak-rules.ts:6`, add a short "beyond the PRD" paragraph and the missing rows to the two oracle headers, and add one JSDoc line each for the key format and the id uniqueness.
- **Decision**: FIXED. Comment-only: `streak-rules.ts:6` cites the S-02/S-04 plans; JSDoc lines for the key format (`snapshotOf`) and the id uniqueness (`BoardInput`); both oracle headers gained the "beyond the PRD" paragraph, the missing rows (days between, large decay values, snapshot, with a tick) and the lower-cased e-mail order.

### F8 — `leaderboard.ts` is pure and browser-safe but not named like the other pure modules

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/leaderboard.ts (file name), plan.md:103, :115, :384
- **Detail**: In this repo `groups.ts` and `tasks.ts` are Supabase access and `group-rules.ts` and `task-rules.ts` are the pure, browser-safe modules. `streak-rules.ts` follows that, `leaderboard.ts` does not, and Phase 3 adds a server-side `checkoffs.ts` next to it. The plan fixed the name (three references) and nothing but the test imports it yet.
- **Fix A ⭐ Recommended**: Rename to `src/lib/leaderboard-rules.ts` and `tests/unit/leaderboard-rules.test.ts` and update the three plan references.
  - Strength: the suffix tells a reader the module is pure and safe for the browser, like `task-rules.ts`; renaming is cheapest now, before Phases 3–5 add imports.
  - Tradeoff: churn in an approved plan and two renames for a naming nicety.
  - Confidence: MED — it follows the repo's own convention, but the plan chose the name on purpose.
  - Blind spot: later phase text may quote the old path outside the three lines found by grep.
- **Fix B**: Keep the name; the file header already states the browser-safety constraint.
  - Strength: no churn.
  - Tradeoff: the convention drifts and a reader may take the module for data access.
  - Confidence: HIGH — nothing changes.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A. Renamed to `src/lib/leaderboard-rules.ts` and `tests/unit/leaderboard-rules.test.ts` (untracked files, plain move). The import and the three plan references (`plan.md:103`, `:115`, `:384`) were updated and a repository-wide search found no other references. The old paths in this report stay because they describe the reviewed state.

### F9 — Two hand-offs to later phases are not in the plan

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: plan.md Phase 3 §1 (`uncheck`) and Phase 4 §3 (`Leaderboard.tsx`), src/lib/leaderboard.ts:38
- **Detail**: (a) Phase 3's `uncheck` deletes the rows of the current period by equality, but `snapshotOf` promises that non-Monday weekly keys snap to their Monday. A non-Monday weekly row for the current week can only come from a direct API insert inside the RLS window (trust-based per the PRD): it counts as the week being checked, yet Undo removes only the Monday row, so the week still shows "Done" after a reload (it affects only the tamperer's own display). (b) `UNKNOWN_MEMBER` is private in `leaderboard.ts` while `dashboard.astro:101` and `:144` already hard-code "Unknown member", and Phase 4's `Leaderboard.tsx` will be a third copy; the sort fallback and the displayed fallback must stay identical.
- **Fix**: Queue two notes for the plan in `follow-ups/review-fixes.md`: Phase 3 deletes the range `[Monday, Monday + 6]` for weekly tasks instead of the single key; Phase 4 exports `UNKNOWN_MEMBER` from the leaderboard module and reuses it in `dashboard.astro` and `Leaderboard.tsx`. No Phase 1 code change (exporting it now would be speculative).
- **Decision**: FIXED. Created `follow-ups/review-fixes.md` with the Phase 3 weekly-undo note and the Phase 4 `UNKNOWN_MEMBER` note. No code change.

## Triage result

All nine findings were fixed (F1, F2 and F8 via Fix A). Re-run after the fixes:

- `npm test`: PASS, 10 files, 176 tests (99 new in the two unit files, 4 more than before the review), run in the pinned America/Los_Angeles zone.
- `npm run lint`: PASS. `npx astro check`: PASS, 84 files, 0 errors, 0 warnings, 0 hints. `npm run build`: PASS.
- Mutants run against the strengthened tests, each restored byte for byte afterwards: all 11 killed (future-key guard, sort, repeat skip, in-place sort, `timeZone`, local `new Date(y, m, d)`, local getters, `Array.includes` de-duplication, `localeCompare`, upper-case fold, sorted totals).
- Manual row 1.5: checked at the user's request by the independent oracle described under Success Criteria (177 of 177 equal to the test literals) and ticked in `plan.md`.
