<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Dashboard UI Implementation Plan

- **Plan**: context/changes/dashboard-ui/plan.md
- **Mode**: Deep
- **Date**: 2026-10-12
- **Verdict**: REVISE (SOUND after triage: all six findings fixed in the plan)
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 39/39 paths ✓, 14/14 symbols ✓, brief↔plan ✓

Claims checked against the code and holding:

- **Smoke helpers.** The task-row helpers (`scripts/smoke.mjs:180-232`, `:293-315`) only need the title before each element in the same `<li>`. Moving `CheckoffControl` above the participant line and putting the recurrence badge inside the `EditTaskForm` island keep every helper matching; 16 simulated runs passed. No step depends on card order.
- **Phase 1 markup.** `CardTitle as="h2"` and the `Badge` spans still match `TASKS_HEADING`, `memberRow`, `groupHeading` and the e2e locators. No smoke regex or e2e locator touches the recurrence select. The new `RECURRENCE_FIELD` regex must allow attributes before `value`: `NativeSelectOption` renders `data-slot` and `class` there.
- **`CardTitle` users.** Only `src/components/dashboard/*`, `Leaderboard.tsx` and the dev `SignInStates.tsx` use it; the public and auth pages are untouched.
- **Contrast.** All 23 values in the token table reproduce within ±0.005.
- **Other references.** `FormField` and `SubmitButton` have exactly the 8 named importers. `?error=forbidden` maps to "You are not allowed to do that." (`src/lib/group-errors.ts:9`). Setting `Astro.response.status` has a precedent (`src/pages/dev/signin-kitchen-sink.astro:8`). Smoke already has a `PRODUCTION_BUILD` probe (`scripts/smoke.mjs:380-392`).
- **Also affected.** `ui/alert` is also used by `src/components/auth/ServerError.tsx`, so the `--destructive` change recolours the sign-in and sign-up error alerts as well. They get darker, which is covered by check 1.13.
- **Research correction.** `research.md:68` says the shadcn add needs no new npm dependency; see F1.

## Findings

### F1 — shadcn add brings in the npm package `cn`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1, change 1 (shadcn configuration and the two new components)
- **Detail**: The plan expected both new files to import `cn` from `@/lib/utils`, and the CLI to leave `package.json` and `package-lock.json` unchanged.
  - The `radix-maia` registry today ships `badge` and `native-select` with `import { cn } from "cn"` and `"dependencies": ["cn"]` (`npx shadcn@latest view badge native-select`, CLI 4.21.4).
  - The CLI rewrites only `@/` and `#` import paths (function `L`, `@shadcn/registry/dist/chunk-YOXNNYPQ.js`).
  - It skips a dependency only when `package.json` already lists it (function `g`, `chunk-ZPMWSHOX.js`).

  So the files keep `from "cn"`, and the CLI runs `npm install cn`. The six existing `ui/` components import `cn` from `@/lib/utils` (`button.tsx:3`, `card.tsx:2`). Followed as written, Phase 1 would add a dependency the plan rules out, and a second class-merging helper.

- **Fix A ⭐ Recommended**: After the add, point both imports at `@/lib/utils` and restore the package files. Add an ESLint `no-restricted-imports` rule for `cn`, and the step to the CLAUDE.md UI rule.
  - Strength: One `cn` for all eight `ui/` components; "no new npm dependency" holds; the next add fails lint instead of drifting.
  - Tradeoff: Every later `shadcn add` needs the same one-line fix.
  - Confidence: HIGH — the registry output and the CLI source agree, and the existing components already use `@/lib/utils`.
  - Blind spot: The add itself was not dry-run during the review.
- **Fix B**: Accept `cn` as a direct dependency.
  - Strength: No manual step; later adds work unchanged.
  - Tradeoff: Two class-merging helpers side by side, and a new dependency (the owner's call under `/10x-ui`).
  - Confidence: MED — it is unverified whether `cn` merges Tailwind 4.3 classes the way `tailwind-merge` does.
  - Blind spot: Whether `cn` resolves `w-fit` against `w-full` on the NativeSelect wrapper.
- **Decision**: FIXED — Fixed via Fix A. Changed in the plan: Key Discoveries (NativeSelect), Phase 1 change 1 contract, change 10 (`no-restricted-imports` block, CLAUDE.md Components rule).

### F2 — The view's props leave out the viewer's e-mail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 6 (The view as a component)
- **Detail**: The props were "the fields of `DashboardData` plus `viewerId` and `inviteLink`". The page body also renders `<AccountCard email={user?.email} />` (`dashboard.astro:88`), and Phase 1 keeps that card inside the view. Without an e-mail prop, "Signed in as" loses the address, which e2e checks (`tests/e2e/seed.spec.ts:31`); smoke does not check it. Lines 62 and 76 also read `user`.
- **Fix**: Add `email` to the `DashboardView` props (Phase 2 passes it to `AppLayout` instead), use `viewerId` at `:62` and `:76`, and give the Phase 1 fixtures a viewer e-mail.
- **Decision**: FIXED — Phase 1 changes 6 and 7.

### F3 — The S-12 handoff doesn't reach S-12's plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, change 13; Migration Notes
- **Detail**: S-12 (`refactor-opportunities`, status `plan_reviewed`) is not implemented yet. Its step 1.6 (`context/changes/refactor-opportunities/plan.md:110`, Progress `:402`) expects "status 200 with the 'Something went wrong' banner as before". If S-11 lands first, S-12 gets a 503 and a new error page, and the reason is recorded only in S-11's `change.md` and `deployment-plan.md`, which S-12's implementation does not read. S-12 edits the same page, so it could switch the status back to 200.
- **Fix**: In change 13, if S-12 is still unimplemented, add a one-line note under its criterion at `plan.md:110`, leaving its Progress title unchanged.
- **Decision**: FIXED — Phase 2 change 13, criterion 2.17 text, Migration Notes and the brief's S-12 risk.

### F4 — The contrast gate only runs by hand

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1, change 5; Testing Strategy
- **Detail**: The brief promises a token contrast gate that keeps the next view on the contract, and Testing Strategy counts `scripts/token-contrast.mjs` among the automated checks. Nothing ran it automatically. The `ci` job runs lint, astro check and build (`.github/workflows/ci.yml:48-52`), and lint-staged runs only ESLint and Prettier.
- **Fix**: Add `node scripts/token-contrast.mjs` as a step in the `ci` job after `npm run lint` (`ci.yml:50`), and name it in README's CI section.
- **Decision**: FIXED — Phase 1 change 5 (Files and a CI bullet) and Testing Strategy.

### F5 — Smoke can pass against the dev server

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (Timing); criteria 1.8 and 2.7
- **Detail**: The screenshot script uses `astro dev` on port 4321, and the smoke criteria start the preview on the same port; the timing note covered only Playwright. If `astro dev` still answers on 4321, smoke tests it instead:
  - its build-mode probe (`scripts/smoke.mjs:380-392`) reports "dev server";
  - the new kitchen-sink step then expects 200;
  - the Secure cookie checks are skipped.

  Criteria 1.8 and 2.7 would then pass without testing the production build.

- **Fix**: Extend the timing note to smoke, and count a smoke run only when it prints `INFO  production build`.
- **Decision**: FIXED — the timing bullet, criteria 1.8 and 2.7 (titles unchanged).

### F6 — Two statements don't match the design

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Performance Considerations; Phase 2 manual criterion 2.15
- **Detail**:
  - Performance Considerations called the `replaceState` script "one small module script", but Phase 2 change 1 makes it `<script is:inline>`.
  - Criterion 2.15 expected notices to be "announced as status and the error as alert". These regions are in the server HTML, and screen readers generally announce live regions only when their content changes.
- **Fix**: Say "one small inline script", and check the roles in the browser's accessibility tree.
- **Decision**: FIXED — Performance Considerations and criterion 2.15 (title unchanged).

## Triage

| Outcome   | Findings                           |
| --------- | ---------------------------------- |
| Fixed     | F1 (Fix A), F2, F3, F4, F5, F6 (6) |
| Skipped   | —                                  |
| Accepted  | —                                  |
| Dismissed | —                                  |

Verdict after fixes: REVISE → SOUND. The Progress section is unchanged: 37 rows, the same titles, and no checkboxes outside it.
