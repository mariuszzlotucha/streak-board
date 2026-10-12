<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard UI Implementation Plan

- **Plan**: context/changes/dashboard-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-12
- **Verdict**: APPROVED (after triage: F1–F5 fixed)
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict               |
| ------------------- | --------------------- |
| Plan Adherence      | PASS (2 observations) |
| Scope Discipline    | PASS                  |
| Safety & Quality    | PASS                  |
| Architecture        | PASS (1 observation)  |
| Pattern Consistency | PASS (1 observation)  |
| Success Criteria    | WARNING (1 finding)   |

## Scope and evidence

- **Code reviewed.** `master` at `9ae70ee`, after the merge of PR #104, compared with the plan merge `2ec358b`. The range holds three phase PRs:
  - PR #102 (`d52fa40`, `3abd5fd`);
  - PR #103 (`2eba8e5`, `b2e14f9`);
  - PR #104 (`fe33841`, `af3c093`).

  The diff has 228 files, 166 of them screenshots.

- **Plan adherence.** All 28 planned changes match the plan, or the owner's amendments in `change.md:115-131`: the `/settings` page, the Main nav, the 3:2 grid and the participants wording. Since review, `plan.md` has changed only in `## Progress`.
- **Boundaries held.**
  - Unchanged: `src/lib/dashboard-data.ts`, `tests/unit/dashboard-data.test.ts`, `src/pages/api/**`, `supabase/`, `package.json` and `package-lock.json`.
  - The landing, privacy and auth pages changed only through the tokens.
  - There is no `toHaveScreenshot` and no Playwright in CI.
  - The `loadDashboard` lines that S-12 edits are byte-identical: `2ec358b:src/pages/dashboard.astro:18-38` equals `:7-27` on `master`.
- **Markup invariants.** Every invariant the tests bind (`plan.md:233-252`) holds on `master`.
- **Safety.**
  - The `?error=` script interpolates nothing, and nothing in `src` uses `set:html`.
  - In a production build the kitchen sink answers 404. `dist/` holds no `example.test`.
  - `/settings` is protected: an exact match or `route + "/"`, on the decoded path.
  - Astro's origin check is on, and `loadSettings` reports `settings.load.failed` with `requestFields`.
  - The islands keep hydration parity, and there is no schema change.
- **Earlier triage.** Every fix recorded in the three phase reviews is on `master`. The owner skipped phase 1 F1 (`.claude/settings.local.json` committed), so it is not raised again.
- **Outside this review.** These are noted here, not raised as findings:
  - The merge of PR #104 started run 38281674338. Its `release` waits in `production` and holds documents only, so the next release cancels it.
  - The Node.js 20 and `ubuntu-latest` annotations from the phase 3 review still show on the release runs.
  - The local branch `s-11/dashboard-ui/phase-1` holds `0b45e34`, which is not on `master`. Its tick reached `master` through PR #104. `git branch -d` refuses that branch, so `/10x-archive` asks before deleting it.

## Success criteria

| #                             | Check                                  | Result                                                                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1, 2.1                      | `npm run lint`                         | PASS                                                                                                                                                                                                                                                                                      |
| 1.2                           | Guard probe on `MembersCard.astro`     | PASS: exit 1 with the guard's message                                                                                                                                                                                                                                                     |
| 1.3, 2.2                      | Literal scan of the view files         | PASS: no hits, and none in `settings.astro`                                                                                                                                                                                                                                               |
| 1.4, 2.3                      | `node scripts/token-contrast.mjs`      | PASS: all 17 gating pairs; D6 at 3.51:1 is information only                                                                                                                                                                                                                               |
| 1.5, 2.4                      | `npx astro sync && npx astro check`    | PASS: 0 errors and 0 warnings; the 4 hints are in `context/audits/` probes, outside this change                                                                                                                                                                                           |
| 1.6, 2.5                      | `npm run build`                        | PASS                                                                                                                                                                                                                                                                                      |
| 1.7, 2.6                      | `npm test`                             | PASS: 30 files, 409 tests                                                                                                                                                                                                                                                                 |
| 1.8, 2.7                      | Smoke on the production preview        | PASS: 227 steps, with `INFO  production build`. For the run, `CONTACT_EMAIL` was added to `.dev.vars` (CI sets it); the file was then restored with the same checksum, and `dist/` was rebuilt                                                                                            |
| 1.9, 2.8                      | `npx playwright test`                  | PASS: 3 tests                                                                                                                                                                                                                                                                             |
| 1.10, 1.11, 2.9               | The `rg` checks                        | PASS: no output                                                                                                                                                                                                                                                                           |
| 1.12, 2.10                    | `gh pr checks 102`, `gh pr checks 103` | PASS: `changes`, `ci`, `integration` and `smoke` pass; `release` skips on a PR                                                                                                                                                                                                            |
| 3.1                           | Release runs of both phase merges      | PASS with the `gh` 2.4.0 command in `change.md:135`: runs 38222989341 and 38277781844 end `success` in all five jobs                                                                                                                                                                      |
| 1.13–1.16, 2.11–2.17, 3.2–3.4 | Manual rows in `## Progress`           | All ticked, with evidence: `before-public` and `phase1-public` (8 each), `phase1-states` (22), `after-states` (30, 15 states), `after-controls` (98, 49 controls), `change.md:91-131` and Phase 14 in `deployment-plan.md`. For 2.11, the two held check-off cells have no real shot (F1) |

## After triage

- **Files changed by the fixes.** These are on `s-11/dashboard-ui/review-fix`:
  - `scripts/ui-screenshots.mjs` (F1, F3);
  - the two `after-controls-checkoff-pending-*` files under `screenshots/` (F1);
  - `CLAUDE.md` (F2);
  - `README.md` (F3);
  - `context/changes/deployment/deployment-plan.md` and `context/changes/dashboard-ui/change.md` (F4);
  - `src/components/dev/DashboardControlStates.tsx` (F5).
- **Checks.**
  - `npm run lint` passes, and the literal scan of `src/components/dev` prints nothing.
  - `npx prettier --check` passes on every changed text file.
  - Without `OUT_DIR`, `node scripts/ui-screenshots.mjs after controls` prints the usage line and exits 1, and writes nothing.
- **F1 re-capture.**
  - **The run.** `OUT_DIR=<scratch> node scripts/ui-screenshots.mjs after controls`, against `astro dev` with the pages warmed. It took 98 shots and exited 0.
  - **The new shots.** Both `checkoff-pending` shots show the tapped row "Read 20 pages" held: "Done today" in the success colour, a dimmed "Undo" and the streak raised from 1 to 2. Only these two files replaced the committed ones.
  - **The rest.** 93 shots are byte-identical to the committed files. Three differ only in their animation frame (`add-task-hover-desktop`, `add-task-summary-hover-desktop`, `dialog-submitting-desktop`) and were not replaced.
- **Not affected.** The fixes touch no code that smoke, Vitest or the build cover. `DashboardControlStates` renders only in the dev kitchen sink.

## Findings

### F1 — The check-off pending shot shows the wrong row

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/ui-screenshots.mjs:234-246 (with :40, :45, :405, :418), context/changes/dashboard-ui/screenshots/after-controls-checkoff-pending-{desktop,mobile}.png
- **Detail**: The check-off row of the 7-state matrix (`plan.md:765`) needs two shots of a held request: "dimmed and `aria-disabled`" (disabled) and "optimistic flip" (loading). The `checkoff-pending` control is meant to give both.
  - **How it goes wrong.**
    - The region is a lazy locator: the `li` above the first button named "Mark done …" (`inRow(markDone(p))`, :40, :45), built at :405.
    - `run` clicks that button, so its row flips to "Undo …".
    - `capture()` (:418) then resolves the locator again and finds the next row that still has "Mark done".
  - **Why the script still exits 0.** The wait at :243 looks for any `[aria-disabled="true"]` on the page, not in the region.
  - **The committed shots.** Both `after-controls-checkoff-pending-*` files show "Clean the fridge / Weekly" with an enabled "Mark done". `checkoff-failed` shows the row that was tapped, "Read 20 pages".
  - **Effect.** Criterion 2.11 is ticked, and the phase 2 review listed this shot as evidence (`impl-review-phase-2.md:79`). The check-off logic is unchanged since `2ec358b`, so what is missing is the evidence for those two cells. S-13 inherits the gate and would capture the wrong row again.
- **Fix**: Pin the region before `run`, by taking `region.elementHandle()` in the loop at :404-418. Fail when the captured row holds no `[aria-disabled="true"]`. Then re-run the `controls` set against `astro dev` into a scratch `OUT_DIR`, and replace only the two `after-controls-checkoff-pending-*` files.
- **Decision**: FIXED (Fix now).
  - `shootControls` now pins the region with `elementHandle()` before the action and passes it to `run`.
  - `checkoff-pending` waits for `[aria-disabled="true"]` inside the tapped row, so a wrong row now fails the run.
  - The two re-captured shots replace the committed ones.

### F2 — CLAUDE.md's UI rules leave out /settings

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:37-38
- **Detail**: Phase 1 wrote the rules for the dashboard. Phase 2 added `settings.astro` only to the "No literals" bullet (:35, phase 2 F1).
  - **"Smoke binds the markup"** (:37) says that smoke binds "the dashboard markup". It now binds the `/settings` markup too: `groupSettingsFor` and `DASHBOARD_LINK_IN_MAIN` (`smoke.mjs:392-397`), and six `settings …` steps (`:751` to `:2069`).
  - **"The gate"** (:38) says the kitchen sink renders "the real `DashboardView`". It also renders `SettingsView` in four `settings-*` states (`dashboard-kitchen-sink.astro:45`, `dashboard-fixtures.ts:44-47`). README.md:335 already says so.
- **Fix**: At :37, say that smoke binds the dashboard and settings markup. At :38, name `SettingsView` and its `settings-*` states.
- **Decision**: FIXED (Fix now). CLAUDE.md:37 now says "the dashboard and settings markup". CLAUDE.md:38 now says that the kitchen sink renders `DashboardView` and `SettingsView` in every page state of `/dashboard` and `/settings` (`settings-*`).

### F3 — The screenshot script writes into this change's folder by default

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: scripts/ui-screenshots.mjs:14, README.md:335
- **Detail**: CLAUDE.md:38 presents the script as the standing UI gate, but `OUT_DIR` defaults to `context/changes/dashboard-ui/screenshots` (:14). Plan P1.8 asked for that default, and README.md:335 documents it.
  - `/10x-archive` moves the change folder to `context/archive/`.
  - A later run without `OUT_DIR`, for example in S-13, then creates `context/changes/dashboard-ui/` again, with no `change.md` (`mkdir` with `recursive: true`, :434).
  - Before the archive, a reused prefix such as `after` overwrites this slice's evidence.
- **Fix**: Exit 1 with the usage line when `OUT_DIR` is not set. Change README.md:335 to say that `OUT_DIR` names the change's `screenshots/` folder.
- **Decision**: FIXED (Fix now).
  - `OUT_DIR` has no default.
  - Without it, the script prints `Usage: OUT_DIR=context/changes/<change-id>/screenshots node scripts/ui-screenshots.mjs …` and exits 1. The header comment gives the same form.
  - README.md:335 says that `OUT_DIR` is required and names the change's `screenshots/` folder.

### F4 — Two record lines are inaccurate

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md:270, context/changes/dashboard-ui/change.md:117
- **Detail**:
  - **deployment-plan.md:270** cites `refactor-opportunities/plan.md:385` for S-12's `dashboard.astro:33-38` pointer. Phase 3 F1 inserted a note at :344, so the pointer moved to :386; :385 is now the "Patterns" line.
  - **change.md:117** says that `loadSettings` "przy błędzie raportuje `settings.load.failed` i odpowiada 503". The loader only returns `loadFailed` (`settings-data.ts:31-34`); the page sets the status (`settings.astro:16`). Phase 3 F3 fixed the same wording in `deployment-plan.md`, but not here.
- **Fix**: In deployment-plan.md:270, change `:385` to `:386`. In change.md:117, reword the clause to "…raportuje `settings.load.failed`, a strona odpowiada wtedy 503".
- **Decision**: FIXED (Fix now). deployment-plan.md:270 now cites `refactor-opportunities/plan.md:386`. change.md:117 now reads "…raportuje `settings.load.failed`; strona odpowiada wtedy 503".

### F5 — Kitchen-sink text says "ticked", which the glossary rules out

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dev/DashboardControlStates.tsx:170
- **Detail**: The "Done state" card's description reads "A ticked daily and once task: the success colour, the icon and Undo".
  - The glossary row "Odznaczenie" (`context/domain/glossary.md:25`) lists "tick" under "Nie nazywaj", except in comments.
  - This is the only such word the change adds outside comments. The smoke step names that say "tick" predate S-11.
- **Fix**: Reword it to "A checked-off daily and once task: the success colour, the icon and Undo".
- **Decision**: FIXED (Fix now). The description now reads "A checked-off daily and once task: …", and Prettier wraps the `StateCard` props onto their own lines.
