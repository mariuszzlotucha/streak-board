<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard UI Implementation Plan

- **Plan**: context/changes/dashboard-ui/plan.md
- **Scope**: Phase 2 of 3
- **Reviewed phases**: 2
- **Date**: 2026-10-12
- **Verdict**: APPROVED (after triage: F1–F6 fixed)
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict               |
| ------------------- | --------------------- |
| Plan Adherence      | PASS                  |
| Scope Discipline    | PASS                  |
| Safety & Quality    | PASS (3 observations) |
| Architecture        | PASS                  |
| Pattern Consistency | WARNING (2 findings)  |
| Success Criteria    | PASS (1 observation)  |

## Scope and evidence

- **Code reviewed.** Commit `2eba8e5` on `s-11/dashboard-ui/phase-2` (not pushed), compared with `origin/master` at `7ca7942`. The diff has 167 files, 128 of them screenshots.
- **The plan as amended.** The owner's decisions after the manual check (`change.md`, "Decyzje właściciela po przeglądzie ręcznym fazy 2", 2026-10-12) amend the plan:
  - group settings live on a new protected `/settings` page;
  - the header gets a Main nav;
  - the grid is 3:2 from 1024 px;
  - the matrix's destructive cells come from the `settings-owner` and `settings-member` states.

  `plan.md` is deliberately unchanged; the amendments list the plan items they replace.

- **Plan adherence.** All 14 planned changes match the amended plan, and nothing planned is missing.
  - `dashboard.astro:7-27` (the user, the destructuring and the `loadDashboard({...})` call) is byte-identical to master, so the S-12 overlap stays a one-line conflict. Only the layout import changed.
  - `dashboard.astro:30` sets 503 only on `loadFailed`.
  - The inline script (`:54-62`) deletes only `error`, keeps the other parameters and the hash, and interpolates nothing.
  - The smoke helper region (`smoke.mjs:1-343`) is byte-identical to master. Every step that change 11 requires is present, adapted to `/settings`.
  - Every "shot" cell of the 7-state matrix has a desktop and a mobile file: 45 `after-controls-*` names and 15 `after-states-*` names.
- **Unplanned files.** All are covered by the owner's decisions:
  - `src/pages/settings.astro`, `src/components/dashboard/SettingsView.astro`, `src/lib/settings-data.ts` and `tests/unit/settings-data.test.ts`;
  - `src/middleware.ts` (`/settings` in `PROTECTED_ROUTES`);
  - `scripts/ui-screenshots.mjs` (settings states, `nav-link`).
- **Boundaries held.** None of these changed: the API routes, `loadDashboard` and its tests, migrations, package files, `Banner.astro` and `auth-state.ts`. The `/settings` loader reports `settings.load.failed` through `reportError` with `requestFields` (lesson on Supabase errors).
- **Public pages.** `SiteHeader.astro` changed for both layouts: the brand link is now wrapped in a flex `div` with a `nav` slot.
  - A fresh `public` capture from `astro dev` is pixel-identical to the committed `phase1-public-*`: 8 of 8 shots, both widths, compared with PIL.
  - The capture went to the scratchpad and is not committed.
- **Runtime probes.**
  - On the production preview, anonymous requests to `/settings`, `/settings/`, `/settings?x=1` and `/settings/foo` answer 302 to `/auth/signin`.
  - `/settingsx` answers 404.
  - The kitchen-sink settings states answer 404.
  - On `astro dev`, every kitchen-sink state, the four settings states included, carries Phase 1's capture-phase `submit` listener.
- **Not raised.**
  - `DashboardView.astro:58` tests `group && inviteLink`. That equals `group`, since `dashboard.astro:32` always builds the link; it serves as type narrowing.
  - The `<summary>` classes are duplicated in `DashboardControlStates.tsx:22`. The gate's summary shots use the real `owner` state.
  - S-12's plan still points to `dashboard.astro:33-38`, while the call has been at `:22-27` since Phase 1.
  - `change.md` calls `PageHeading` the only `<h1>` typography. The pending invite's `<h1>` is a `CardTitle`, as plan change 7 prescribes.
  - The settings copy ("Settings", "Settings didn't load", the no-group sentence) is not in the wording table.

## Success criteria (Phase 2)

| #         | Check                                     | Result                                                                                                                   |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2.1       | `npm run lint`                            | PASS, exit 0                                                                                                             |
| 2.2       | Literal scan of the view files            | PASS, no output (also none in `src/pages/settings.astro`)                                                                |
| 2.3       | `node scripts/token-contrast.mjs`         | PASS, exit 0, 17 gating pairs; D6 3.51:1 as information only                                                             |
| 2.4       | `npx astro sync && npx astro check`       | PASS, 0 errors and 0 warnings; the 4 hints are in older `context/audits/` probe files                                    |
| 2.5       | `npm run build`                           | PASS; no `example.test` anywhere in `dist/`                                                                              |
| 2.6       | `npm test`                                | PASS, 30 files and 408 tests (Phase 1: 29 and 404; the new file adds 4)                                                  |
| 2.7       | Smoke against the production preview      | PASS, 228 steps and `INFO  production build` (see the note below)                                                        |
| 2.8       | `npx playwright test` against the preview | PASS, 3 tests                                                                                                            |
| 2.9       | Removed pieces and old wording are gone   | PASS, no output                                                                                                          |
| 2.10      | `gh pr checks`                            | PENDING by design: the branch has no upstream and no PR; it is pushed only after this review is triaged                  |
| 2.11–2.17 | Manual                                    | Ticked. The evidence is below; 2.13 leaves no artifact by nature, and the `/settings` 503 is not covered by any row (F5) |

Evidence for the manual rows:

- **2.11.** Each "shot" cell has its files, including:
  - `checkoff-pending`, `checkoff-failed`, `dialog-submitting` and `copy-fallback`;
  - `nav-link-*` (the owner's amendment 5).
- **2.12.** `after-states-*` at both widths. The smoke step "owner dashboard with a task orders the cards by the main loop" asserts Tasks → Leaderboard → Members.
- **2.13.** `dashboard.astro:30`. The check stops PostgREST by hand, so the diff can hold no artifact.
- **2.14.** The smoke step "member dashboard with ?error=forbidden shows the alert first and drops the code from the address": the alert is inside `<main>` before the `<h1>`, and the `replaceState` script is present.
- **2.15.** The `*-focus-*` shots and the roles in the markup: notices use `role="status"`, errors `role="alert"`, and the current nav link has `aria-current="page"`.
- **2.16.** The rewritten pending-invite smoke step, and `after-states-pending-invite-*`.
- **2.17.** The `change.md` section "Wynik zarzutów, odroczenia i przekazania" covers C1–C5, D1–D6 and the S-12 and S-13 handoffs. The S-12 note is at `refactor-opportunities/plan.md:111`.

Note on 2.7:

- As in Phase 1, this checkout has no `CONTACT_EMAIL` in `.dev.vars`, which smoke's privacy step needs.
- For this run, `CONTACT_EMAIL=contact@example.com` was appended only to the build's copy `dist/server/.dev.vars`; the source `.dev.vars` was not touched.
- The copy was restored afterwards with a matching checksum.

## After triage

All six findings were fixed in the working tree of `s-11/dashboard-ui/phase-2`, and the Phase 2 gates were rerun on that tree:

| #    | Check                                      | Result                                                                                                   |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 2.1  | `npm run lint`                             | PASS, exit 0                                                                                             |
| 2.2  | Literal scan of the view files             | PASS, no output (`src/pages/settings.astro` included)                                                    |
| 2.3  | `node scripts/token-contrast.mjs`          | PASS, exit 0                                                                                             |
| 2.4  | `npx astro sync && npx astro check`        | PASS, 0 errors and 0 warnings; the same 4 hints                                                          |
| 2.5  | `npm run build`                            | PASS; no `example.test` anywhere in `dist/`                                                              |
| 2.6  | `npm test`                                 | PASS, 30 files and 409 tests (one more, from F4)                                                         |
| 2.7  | Smoke against the production preview       | PASS, 227 steps (F3 removed a duplicate) and `INFO  production build`; `CONTACT_EMAIL` handled as before |
| 2.8  | `npx playwright test` against the preview  | PASS, 3 tests                                                                                            |
| 2.9  | Removed pieces and old wording are gone    | PASS, no output                                                                                          |
| 1.11 | Phase 1: no heading nested in a card title | PASS again: both commands print nothing                                                                  |

## Findings

### F1 — /settings is outside the view-literal lint guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: eslint.config.js:87-92, CLAUDE.md:35
- **Detail**: Phase 1's guard (`viewLiteralsConfig`, charge C5) lists `src/pages/dashboard.astro` and the view folders. It does not list the new view page `src/pages/settings.astro`, and the CLAUDE.md "No literals" bullet names the same files.
  - A stdin probe with `<div class="bg-red-500">` reports `no-restricted-syntax` as `src/pages/dashboard.astro`, but only a Prettier error as `src/pages/settings.astro`.
  - Nothing slips through today: the page holds no class strings, and `SettingsView`, `GroupSettingsCard` and `AppLayout` are covered.
  - The first markup added to the page would go unchecked.
- **Fix**: Add `"src/pages/settings.astro"` to `viewLiteralsConfig.files` and to the file list in CLAUDE.md:35, then rerun `npm run lint` and the stdin probe as `src/pages/settings.astro`.
- **Decision**: FIXED (Fix now). `src/pages/settings.astro` is now in `viewLiteralsConfig.files` (`eslint.config.js:89`) and in the CLAUDE.md:35 list.
  - `npm run lint` passes over the whole repo.
  - The stdin probe with `bg-red-500` as `src/pages/settings.astro` now reports `no-restricted-syntax`.

### F2 — Card-heading typography copied onto a section heading

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dashboard/DashboardView.astro:107
- **Detail**: The pending-invite page's `<h2>Or start your own group</h2>` carries `font-heading text-xl font-semibold`, the exact default of `CardTitle` (`ui/card.tsx:38`).
  - Phase 1 moved that typography into `CardTitle` (charge C2). Its check 1.11 (`rg -n "font-heading text-xl font-semibold" src/components/dashboard src/components/tasks` prints nothing) passed at the time.
  - On this branch the check prints this line, so the full-plan review will fail 1.11.
  - The heading is not nested in a card title, so 1.11's first command still passes.
- **Fix**: Render it as `<CardTitle as="h2">Or start your own group</CardTitle>`, so the typography comes from `ui/card.tsx`. Nothing styles `data-slot="card-title"` outside a card, and smoke's `/<h2[^>]*>\s*Or start your own group\s*<\/h2>/` (`smoke.mjs:942`) still matches.
- **Decision**: FIXED (Fix now). `DashboardView.astro:107` now renders `<CardTitle as="h2">` (already imported).
  - Both commands of Phase 1's check 1.11 print nothing again, and ESLint passes on the file.
  - The smoke rerun after all fixes is recorded under "After triage".

### F3 — Two settings smoke steps assert less than their names say

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:1047, scripts/smoke.mjs:1667
- **Detail**:
  - **`:1047`.** "settings shows the owner the new name with rename and delete, and no leave" asserts the rename form, but no delete control. Steps `:894` and `:1151` do assert one.
  - **`:1667`.** "user B's settings warn that leaving the group erases the streaks" (comment: "B takes part in a task now") asserts only the group Leave dialog's description.
    - That text is fixed for every member (`GroupSettingsCard.astro:49`), and `:999` already asserts it.
    - So the step cannot fail for the reason it exists, which goes against the lesson "Smoke steps must assert outcomes, not just the absence of errors".
    - On master the same text was one of the dashboard step's `bodyIncludes`, so the weakness was carried over, not introduced.
- **Fix**: Add `formPostingTo("/api/groups/delete")` and `dialogTrigger("Delete group")` to `:1047`, and drop `:1667`, which `:999` covers.
- **Decision**: FIXED (Fix now).
  - The step at `:1047` now also asserts the delete form and the "Delete group" dialog trigger.
  - The step "user B's settings warn that leaving the group erases the streaks" is removed. `:999` asserts the same text, form and trigger for member B.
  - ESLint and `node --check` pass on `scripts/smoke.mjs`.
  - The smoke rerun after all fixes is recorded under "After triage".

### F4 — No test for a throwing client factory in loadSettings

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/settings-data.test.ts:34-71
- **Detail**: `settings-data.ts:9` promises that "a throw while creating the client ends as `loadFailed` like any other".
  - The dashboard loader's test covers the same promise (`dashboard-data.test.ts:83`).
  - The four settings tests cover a group, no group, no Supabase and a failed read, but not a throwing `createSupabase`.
- **Fix**: Add the case: when `createSupabase` throws, the result is `{ group: null, loadFailed: true, error: groupErrorMessage("unknown") }` with one `settings.load.failed` report.
- **Decision**: FIXED (Fix now). `settings-data.test.ts` has the new case "ends as loadFailed with one settings.load.failed report when creating the client throws".
  - The file passes: 5 tests. ESLint and Prettier pass too.
  - Mutation check: moving `createSupabase()` out of the `try` in a temporary copy made the new test fail, and only that test. The file was restored with a matching checksum.

### F5 — The /settings 503 has no check

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/settings.astro:16
- **Detail**: The owner's decision says `/settings` answers 503 on a failed load, but nothing exercises the page's status line or its "Settings didn't load" page against a real failure:
  - manual check 2.13 covers only `/dashboard`;
  - smoke cannot cause a failed load;
  - the unit test stops at `loadFailed: true`.

  The line mirrors `dashboard.astro:30`, which 2.13 checked.

- **Fix**: Run the 2.13 procedure on `/settings` too, and note the result in change.md:
  - signed in, with PostgREST stopped: 503, "Settings didn't load" and Try again;
  - after starting it again, Try again loads the page.
- **Decision**: FIXED (Fix now). The check ran on the production preview of `2eba8e5`, whose `settings.astro` and `settings-data.ts` are unchanged by this triage, with a throwaway local user named like smoke's.
  - Before the outage: 200 with "Group settings".
  - With `supabase_rest_10x-astro-starter` stopped, `/settings` answered 503. The `<h1>` was "Settings didn't load", "Try again" linked to `/settings`, and there was no group card.
  - The preview log has `settings.load.failed` with the route and user id, and no e-mail.
  - `/dashboard` answered 503 at the same time, which repeats 2.13.
  - After `docker start`, Try again loaded the page (200).
  - The first request after the stop waited about 60 s on the local gateway before failing. That timing comes from the local stack and predates this change.
  - The result is recorded in `change.md`, under the owner's decisions, as an extension of 2.13. The test group was deleted, and the user stays in the local database like smoke's.

### F6 — The participants notice does not say what else is missing

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/dashboard/TasksCard.astro:38-43
- **Detail**: When the participants fail to load, `loadDashboard` skips the board (`dashboard-data.ts:103`).
  - Every row loses "Mark done" (`TaskRow.astro:57`), and the Leaderboard disappears (`DashboardView.astro:93`).
  - The notice says only "Participants are unavailable right now. Reload to try again."
  - The check-offs notice explains the same effect: "so tasks can't be marked done and the leaderboard is hidden".
  - The plan kept the old text on purpose ("unchanged text", `plan.md:219`), so this is a gap in the plan, not drift. The behaviour predates S-11.
- **Fix**: Give the participants notice the same explanation: "Participants are unavailable right now, so tasks can't be marked done and the leaderboard is hidden. Reload to try again." Record it as an owner decision in change.md, and recapture `after-states-participants-failed-*`.
- **Decision**: FIXED (Fix now).
  - The notice in `TasksCard.astro` and the kitchen sink's warning-alert sample in `DashboardControlStates.tsx` now carry the extended text. The JSX writes the apostrophe as `&apos;` for `react/no-unescaped-entities`.
  - `change.md` records the wording as an owner decision that replaces the "Participants failed" row of the plan's wording table.
  - All 15 states were recaptured from `astro dev` into the scratchpad and compared with PIL against the committed `after-states-*`.
    - Only `after-states-participants-failed-{desktop,mobile}.png` changed: they are 20 px and 40 px taller, for the longer notice. Those two were replaced.
    - The other 28 are pixel-identical. That includes `pending-invite`, which confirms that F2's `CardTitle` has no visual effect.
  - The archived S-04 review (`2026-10-01-checkoff-and-leaderboard/reviews/impl-review-phase-4.md:53`) had dismissed the vanishing controls as intended behaviour. This fix changes only the notice's wording.
