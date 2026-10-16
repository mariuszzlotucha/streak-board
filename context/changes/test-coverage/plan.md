# Test coverage (S-10): risk-chosen tests, mutation-measured unit quality, e2e of the key flows — Implementation Plan

## Overview

Slice S-10 closes milestone M-2's quality outcome MS-02: "changes in the application are protected by tests chosen by risk, and the quality of the unit tests is measured by mutations" (`context/foundation/roadmap.md:154-166`). The plan takes the two unstarted phases of `context/foundation/test-plan.md` (phase 2, the release ordering gate for risk #1; phase 3, auth boundaries and input validation for risks #5 and #6), makes mutation testing actually measure the unit tests (today every covered mutant is reported as survived with zero tests completed), adds browser tests for three key flows under the S-11 markup and runs them in CI, and records in the test plan what the slice deliberately does not test. No file under `src/` changes: the slice ships tests, test and CI configuration, scripts and documents only.

The change is roadmap slice S-10 (`Change ID: test-coverage`); it is implemented after S-12 (`refactor-opportunities`) has merged, as decided on 2026-10-15 (see Key Decisions in the brief).

## Current State Analysis

- **The test base is larger than the test plan describes, and every Vitest run needs the local stack.** At HEAD `241afb9` there are 16 unit and 16 integration files under `tests/`, 293 SQL assertions in `supabase/checks/rls-scenarios.sql`, a 2,167-line `scripts/smoke.mjs` and 5 files under `tests/e2e/` (research §2). `vitest.config.ts:13-14` is one project whose `globalSetup` throws without `supabase status` (`tests/setup/global-setup.ts:36-55`), so `npm test`, the hooks `.claude/hooks/{end-of-turn,related-tests}.sh` and Stryker all need `supabase start`. No file under `tests/unit/` imports `tests/helpers/supabase.ts` or `inject` (grep at HEAD), so a unit project without the global setup is a pure configuration split. Vitest 5.0.3 supports `test.projects` (`node_modules/vitest/dist/chunks/plugin.d.BsjqSb4-.d.ts:3650`).
- **Stryker has never measured anything, and the cause is established.** The runner names a test by joining suite and test names with a single space (`node_modules/@stryker-mutator/vitest-runner/dist/src/test-helpers.js:11`, and the worker copy `stryker-setup.js:66`), builds the per-mutant `testNamePattern` from those names (`vitest-test-runner.js:144-153`) and drops tests without a result (`:171-173`). Vitest 5.0.3 matches the pattern against `fullTestName`, whose separator is `" > "` (`node_modules/vitest/dist/task-utils.js:51-53,224`), so every filtered mutant run skips all tests and the mutant is reported `Survived` with `testsCompleted: 0`; only static mutants, which run without a filter, ever kill. Verified on 2026-10-15 with four narrowed runs on `src/lib/landing.ts` (15 mutants, 11 runtime ones with 3-5 covering tests each and 0 completed; `vitest.related` and `coverageAnalysis` make no difference). The runner's peer range is `vitest >= 2.0.0` (no upper bound); the latest published runner is still 10.0.0 (2026-08-14), older than Vitest 5.0.0 (2026-09-03). Two more facts: `--logLevel debug` crashes the runner on Vitest 5 (circular JSON in its config dump, `vitest-test-runner.js:95`), and the tracked directory symlinks `.claude/skills/ai-sdk` and `.claude/skills/migrate-ai-sdk-v6-to-v7` crash the sandbox copy with `EISDIR` unless ignored. A second masking: a static mutant that makes a module throw at import (for example an empty time zone in `src/lib/streak-rules.ts:7`) collects no tests and is also reported `Survived` with 0 tests.
- **Risk #1 (schema before code) has a narrower gap than the test plan states, and `master` is not what is deployed.** The `release` job orders build, `supabase db push --yes`, `wrangler deploy` and an anonymous live check (`.github/workflows/ci.yml:146-237`); S-12 Phase 2 adds migration immutability, a `-- compat:` marker, an ordering rule and a generated-types check (`context/changes/refactor-opportunities/plan.md:117-189`) and leaves the "old code against new schema" gate and Playwright in CI to S-10 (`plan.md:45`). No job proves that the deployed code survives a new migration during the interval between `db push` and `wrangler deploy`. Every `release` run since 2026-10-12 was cancelled or left waiting (PRs #106-#123, `gh run list`), so the deployed commit is the merge of PR #105, `30c01bb2ee9107327a2933425b7fdef9996eadea` (its `release` job concluded `success`), not HEAD.
- **Risks #5 and #6 are enforced mostly outside the handlers.** The foreign-Origin boundary is Astro's built-in check (`node_modules/astro/dist/core/app/origin-check.js:7-27`; `astro.config.mjs` has no `security` key), tested only by smoke on 11 of the 17 POST routes; `api/auth/{signin,signup,signout}` and `api/groups/{join,rename,leave}` have no foreign-Origin step (research §5). Form routes answer 302 with an allow-listed `?error=` code (`src/pages/api/groups/create.ts:19-21`), not the 4xx of `test-plan.md:49,69`; 4xx exists only in the check-off JSON mode (`src/lib/checkoff-response.ts:10-16`). `toSignInErrorCode` and `toSignUpErrorCode` (`src/lib/auth-errors.ts:24-34,92-109`) have no unit test; the e-mail return leaving the `join_code` cookie alone is asserted only implicitly: `tests/integration/auth-callback.test.ts:19` builds its context with `cookies: {}`, so any cookie call in the route would throw and fail the success case.
- **The Playwright suite fits the S-11 markup but runs nowhere.** `playwright.config.ts` (projects `setup` and `chromium`, `webServer` build + preview, CI retries and one worker), `tests/e2e/{auth.setup,seed.spec,group-data-isolation.spec,helpers,local-supabase}.ts`; the last green run is S-11's on 2026-10-12. Playwright 1.63.0 ships the `Pixel 7` descriptor (412×839, touch). No workflow, script or hook mentions `playwright` or `stryker`.
- **The ruleset requires `integration` and `ai-review`** (`gh api repos/mariuszzlotucha/streak-board/rulesets/24254172`, read 2026-10-15; `strict` false, no bypass actors), so `ci` and `smoke` are advisory today: a red lint, build or smoke run does not block a merge, and the `required (wired)` of test-plan §5's lint+build and smoke rows describes the CI wiring, not the ruleset. The S-12 plan's "only `integration`" (`refactor-opportunities/plan.md:28`) predates the `ai-review` row added on 2026-10-14.
- **S-12 is `plan_reviewed` with nothing implemented** and its Phases 3-4 add unit tests for `group-errors`, `task-errors`, `group-rules`, `join-code`, `checkoff-response` and DB contract tests for the rules duplicated in SQL (`refactor-opportunities/plan.md:193-289`); both changes would edit `.github/workflows/ci.yml`, `package.json`, `context/foundation/test-plan.md`, `tests/unit/` and the README.
- **`test-plan.md` §4 still says "e2e: none — not planned"** (`:102`), §6.3 the same (`:152`), §3 uses `shipped` where the orchestrator's literal is `complete` and points at change folders that now live under `context/archive/` (`:79,82`), and the §8 ledger says 2026-10-01 while §5 was edited on 2026-10-14. The test-plan skill allows a §2 backport in place and otherwise edits §1-§5 only through `--refresh` or an explicit owner instruction (`.claude/skills/10x-test-plan/SKILL.md:445-460,572-579`).

## Desired End State

- `npm run test:unit` runs every unit test without the local stack; `npm test` runs everything as today; both agent hooks run the unit project when the stack is down instead of skipping.
- `npm run test:mutation -- --mutate <module>` runs Stryker on the stack-free unit project and executes the covering tests of every mutant on Vitest 5; every rule and mapping module under `src/lib/` has a recorded baseline score and a survivor review in `context/foundation/mutation-baseline.md`, and the weak tests that review found are closed.
- Five Playwright specs (seed, isolation, invite path, check-off round trip, group settings dialogs) pass locally in a desktop and a phone project, and the `e2e` job runs them on every code PR.
- Smoke asserts the foreign-Origin and GET boundaries on every mutation route and the `?error=` non-reflection on the dashboard; the two auth mappers are unit-tested (the e-mail return's hands-off treatment of the invite cookie stays pinned by the cookie-less context of `tests/integration/auth-callback.test.ts`); `test-plan.md` risk #6 describes the 302-with-code contract.
- A `compat` job runs the deployed commit's smoke against a stack that carries the PR's migrations on every PR that touches `supabase/migrations/`, and the `release` job moves the `production` tag after each successful deploy.
- `test-plan.md` §2-§8 match the repository (phases 2 and 3 `complete`, e2e in the stack and gates, the §7 exclusions re-evaluated), the README documents every new command and job, and the owner has added `ci`, `smoke`, `e2e` and `compat` to the ruleset's required checks (today only `integration` and `ai-review` are required).
- Verify: Success Criteria of each phase; at the end `npm run lint`, `npx astro check`, `npm test`, `npm run test:unit` (stack down), `npm run smoke`, `npx playwright test` all green, and the CI run of the last phase PR green with the two new jobs.

### Key Discoveries:

- The Stryker runner's two name-join sites are `node_modules/@stryker-mutator/vitest-runner/dist/src/test-helpers.js:11` and `stryker-setup.js:66` (`nameParts.join(' ').trim()`); Vitest 5's separator is `" > "` (`node_modules/vitest/dist/task-utils.js:51-53`). The per-mutant file filter is fine (a cwd-relative substring match, verified), so the fix is the separator alone.
- Static mutants complete tests and kill (`mutant-test-planner.js:43-46,92-98` sends no test filter for them), which is why the old reports show a handful of kills; a baseline review must read `testsCompleted` from `reports/mutation/mutation.json`, because the clear-text "Tests ran" list names planned, not executed, tests.
- Vitest 5 `test.projects` (`plugin.d.BsjqSb4-.d.ts:3650`); the runner's own options are `vitest.configFile`, `vitest.dir`, `vitest.related` (`src-generated/vitest-runner-options.ts:15-25`), so pointing Stryker at a unit-only config needs no change to `vitest.config.ts` beyond the split.
- Both hooks already probe the stack with `curl … /auth/v1/health` and branch on it (`end-of-turn.sh:50-59`, `related-tests.sh:21-23`); the split gives the "stack down" branch something to run.
- Patterns to copy: the seed spec (`tests/e2e/seed.spec.ts`), personas and admin cleanup (`tests/e2e/local-supabase.ts:69-126`), the hydration wait (`helpers.ts:10`); smoke's `request()` with `origin: FOREIGN_ORIGIN` and harmless bodies (`scripts/smoke.mjs:69-89,777-805`); the `changes` job output and the fail-safe `if:` (`ci.yml:17-40`); the smoke job's stack start and `.env`/`.dev.vars` writing (`ci.yml:73-89`).
- Accessible names the specs bind to: `Mark done <title>` / `Undo <title>` buttons and `Done today` (`src/components/tasks/CheckoffControl.tsx:112,121,137`), the `Streak` value in its own element (`:145-148`), the Leaderboard list `aria-label="Leaderboard"` with the `You` badge and the total (`Leaderboard.tsx:28-35`), the invite page `Join <group>?` h1 and its only `Join group` button (`PendingInviteCard.astro:16-25`), `Group <name>` h1 and `N members` (`MembersCard.astro:26`), the settings dialogs `Leave this group?` with "your streaks in its tasks will be lost" and `Delete this group?` (`GroupSettingsCard.astro:29-51`), the sign-up form fields `Email`, `Password`, `Confirm password` and `Create account` (`SignUpForm.tsx:78-142`), `/auth/confirm-email` after sign-up (`src/pages/api/auth/signup.ts:29`).
- Local sign-up auto-confirms (`supabase/config.toml:209` `enable_confirmations = false`), so the invite spec can create its account through the real form; production confirmation stays out of tests by design (`test-plan.md:68`).
- The `release` job runs with `permissions: contents: read` inherited from the workflow (`ci.yml:9-10`); moving a tag from it needs `contents: write` on that job only. No tag exists in the repo today (`git tag -l` empty).
- The smoke job writes `SUPABASE_URL`, `SUPABASE_KEY` and `CONTACT_EMAIL` into `.env` and copies it to `.dev.vars` before the build (`ci.yml:77-83`); the preview reads the build-time copy of `.dev.vars` (memory note of 2026-10-12), so the `e2e` and `compat` jobs must do the same before building.

## What We're NOT Doing

- No change under `src/`: no server-side e-mail or password validation before GoTrue, no 4xx for form routes (the 302-with-code answer is the contract, decided 2026-10-15), no `prerender = false` chore on the three auth routes (smoke proves the Origin check applies to them regardless), no replacement of `dashboard-data.ts`'s `console.error` calls (S-12 Phase 1).
- No unit tests for `group-rules`, `group-errors`, `task-errors`, `join-code`, `checkoff-response` and no DB contract tests: S-12 Phases 3-4 write them first (decided 2026-10-15); S-10 measures and strengthens them in Phase 5.
- No mutation runs on glue (routes, `dashboard-data`, `settings-data`, `log`, `sentry`), no CI job for Stryker, no numeric mutation gate (`thresholds.break` stays `null`), no 100 % chase: survivors are reviewed one by one (`CLAUDE.md`, Mutation testing).
- No `--refresh` of the test plan: §2-§8 are edited in this change by the owner's explicit instruction of 2026-10-15; the hot-spot counts of §1-§2 (2026-09-30) are left as they are.
- No e2e for Google sign-in (the provider cannot run locally; smoke and the release live check cover the hops), for e-mail confirmation on production, for owner-only API denials (`group-permissions` and smoke cover them), and no `toHaveScreenshot` or visual regression (test-plan §7 re-evaluated: still excluded, the kitchen sink and `scripts/ui-screenshots.mjs` remain the gate).
- No real rate-limit, flood or captcha test: hosted Auth settings are read back by the owner and recorded; only the 429 mapping is tested.
- No authenticated production canary (option B of the S-12 research), no staging environment, no Supabase branching, no automated down-migrations.
- No required-check change by the agent: the owner adds `ci`, `smoke`, `e2e` and `compat` to the ruleset (closing step); the agent never edits the ruleset.
- No parallel worktree with S-12: the shared files fail the independence check of `lessons.md:119-124`; S-10 starts after S-12's last PR merges.

## Implementation Approach

Six phases, one PR each, in this order: (1) the stack-free unit project and the Stryker fix, the enabler for every later measurement; (2) the three e2e specs, driven by `/10x-e2e test-coverage phase 2` so each one is reviewed against the e2e rules and proven by a deliberate break before it exists in CI; (3) the phone project and the `e2e` job; (4) the smoke, unit and integration additions of test-plan phase 3 with the §2 backport; (5) the mutation baseline, after S-12 Phases 3-4 have landed; (6) the `compat` gate with the `production` tag, and the closing documents. Phases 1-4 depend on nothing in S-12 beyond merged files; Phase 5 needs S-12 Phases 3-4 and Phase 6 the `ci.yml` state after S-12 Phase 2; since S-10 starts after S-12 (decision of 2026-10-15), each phase only checks its precondition and stops with a message when it is missing.

Per `context/foundation/lessons.md`: every phase runs on its own branch `s-10/test-coverage/phase-<N>` cut from a fresh `master`, commits are in English, `/10x-impl-review test-coverage phase <N>` is triaged before the branch is pushed, the PR is opened with `gh pr create` and its URL shown. Only one session at a time uses the local stack, the preview port and Playwright (`lessons.md:119-124`); stop any `astro dev` or `astro preview` daemon (`npx astro dev stop`, `npx astro preview stop`) before smoke, Playwright or a mutation run, and keep `CONTACT_EMAIL` in `.dev.vars` (rebuild after changing it). Enforcement that is not itself a test (a CI job, a hook change) is switched on in its own commit after what it checks passes locally, as S-12 does, so the first red run is a finding and not a wiring error. Every merge queues a `release` run that waits for approval in `production`: for Phases 1-5 approve it or let the next push supersede it (the Worker is unchanged); approve the Phase 6 release, because it is the first run that moves the `production` tag.

## Critical Implementation Details

- **Timing & lifecycle.** The `compat` job can only pass once the `production` tag exists, and the `release` job only moves it on the next approved release: Phase 6 creates the initial tag by hand at the deployed commit before its CI step is committed, and the job fails with a clear message, never skips, when the tag is missing. The deployed commit at planning time is `30c01bb` (PR #105, `release` success on 2026-10-12 21:22 UTC); the owner confirms that no manual deploy or `wrangler rollback` happened since before the tag is pushed.
- **Debug & observability.** Stryker on Vitest 5 crashes at `--logLevel debug`; use `info`. Read per-mutant results from `reports/mutation/mutation.json` (`testsCompleted`, `coveredBy`, `killedBy`), not from the clear-text report. A survivor with `testsCompleted: 0` after the Phase 1 fix means the mutant broke the module at import (a static mutant), not that the tests are weak; classify it as such in the review.
- **State sequencing.** In Phase 1 the hook change lands after the unit project passes without the stack, and the Stryker config after the runner fix is verified by the narrowed run; in Phase 3 the `e2e` job is committed after both projects pass locally; in Phase 6 the `changes` output and the `compat` job land after the tag exists and the two scratch-PR checks (one red, one green) are done with the owner's go-ahead.

## Phase 1: Stack-free unit project and a working mutation run

### Overview

Split the Vitest configuration into a unit project (no global setup) and an integration project (the current global setup), give the unit project its own script and make both hooks use it when the stack is down; then make Stryker run on the unit project and actually execute the covering tests on Vitest 5, prove it on `src/lib/landing.ts`, and document the commands. Three commits in this order: the Vitest split with the scripts and hooks; the Stryker fix and configuration; the docs and the lesson.

### Changes Required:

#### 1. Vitest projects

**Files**: `vitest.config.ts`, `vitest.unit.config.ts` (new), `vitest.integration.config.ts` (new)

**Intent**: Keep `npm test` running every suite while letting the unit suite run, and be mutated, without the local stack.

**Contract**: `vitest.unit.config.ts` is a complete, standalone Vitest config for the project `unit`: `include: ["tests/unit/**/*.test.ts"]`, no `globalSetup`, and the shared settings of today's config (`resolve.alias["@"]`, `environment: "node"`, `env.TZ = "America/Los_Angeles"`, `testTimeout`, `hookTimeout`). `vitest.integration.config.ts` is the project `integration`: `include: ["tests/integration/**/*.test.ts"]` with `globalSetup: ["./tests/setup/global-setup.ts"]` and the same shared settings (share them through one small exported object rather than copying the values twice). `vitest.config.ts` composes both through `test.projects` so `vitest run` (`npm test`) runs everything, `vitest related <file> --run` keeps working across both projects, and `vitest run --project unit` runs the unit project alone. The e2e files (`*.spec.ts`, `*.setup.ts`) stay outside both includes.

#### 2. npm scripts

**File**: `package.json`

**Intent**: One command each for the stack-free unit run and for a mutation run.

**Contract**: `test:unit` runs the unit project only (`vitest run --project unit`, or the unit config file; it must pass with the stack stopped); `test:mutation` is `stryker run`, so `npm run test:mutation -- --mutate <path>` narrows it as `CLAUDE.md` requires; `test` stays `vitest run`. `CLAUDE.md`'s Commands line lists the two new scripts.

#### 3. Agent hooks

**Files**: `.claude/hooks/end-of-turn.sh`, `.claude/hooks/related-tests.sh`

**Intent**: Give the "stack down" branch of both hooks the unit project to run instead of skipping Vitest entirely.

**Contract**: when the health probe answers nothing, `end-of-turn.sh` runs `npx vitest run --project unit` and its note says that the integration project was skipped because the stack is down; `related-tests.sh` runs `npx vitest related "$REL" --run --project unit` in the same case. With the stack up both hooks run as today (the new config files already trigger the sweep through the `*.ts` arm of `end-of-turn.sh:29`).

#### 4. Stryker fix and configuration

**Files**: `stryker.config.json`, `package.json`, `package-lock.json`, `patches/@stryker-mutator+vitest-runner+10.0.0.patch` (new, patch route only)

**Intent**: Make the per-mutant test selection work on Vitest 5 and point Stryker at the unit project, narrowed to the rule and mapping modules.

**Contract**: First check the registry for a `@stryker-mutator/vitest-runner` newer than 10.0.0 whose `collectTestName` matches Vitest 5 (joins with `" > "` or reads `fullTestName`); if one exists, upgrade `@stryker-mutator/core` and the runner together (the upgrade route). Otherwise add `patch-package` as a devDependency with a `postinstall` script and commit the patch that changes `nameParts.join(' ')` to `nameParts.join(' > ')` in `dist/src/test-helpers.js:11` and `dist/src/stryker-setup.js:66` of the installed runner (the patch route; `npm ci` in CI and in every worktree applies it). If neither route makes the narrowed run below kill a covered runtime mutant, stop the phase and report: pinning Vitest to 4.x is the owner's decision, not this plan's. Configuration: `vitest.configFile: "vitest.unit.config.ts"`, `vitest.related` kept `true`, `ignorePatterns` listing `.claude/**` (the two symlinked skill folders crash the sandbox copy), `.wrangler/**` (692 MB of the 703 MB sandbox measured on 2026-10-15), `dist/**`, `.astro/**`, `context/**`, `docs/**`, `playwright-report/**` and `test-results/**`; `packages/**` stays in the copy, because `tests/unit/code-reviewer-{agent,tools}.test.ts` import `../../packages/code-reviewer/*` and would not load without it, `reporters: ["progress", "clear-text", "html", "json"]`, `thresholds.break` unchanged at `null`, and `mutate` defaulting to the 14 rule and mapping modules without I/O: `src/lib/{auth-errors,auth-state,checkoff-client,checkoff-response,checkoff-sync,group-errors,group-rules,join-code,landing,leaderboard-rules,redact,streak-rules,task-errors,task-rules}.ts`, each narrowable further with `--mutate`.

#### 5. Docs and lesson

**Files**: `README.md` (Available Scripts and Tests sections), `CLAUDE.md` (Commands line and the Tests sentence), `context/foundation/lessons.md`

**Intent**: Record the commands, the caveats and the rule that a mutation tool is trusted only after it has killed a covered mutant.

**Contract**: README Tests gains the stack-free unit run, the mutation command with its narrowed form, the `--logLevel debug` caveat, the patch or upgrade note and where the JSON report lives; `CLAUDE.md:46` (the Commands line) lists `test:unit` and `test:mutation`, and `CLAUDE.md:48` with the README Available Scripts entry (`README.md:59`) say that `npm test` needs the stack while `npm run test:unit` does not; `lessons.md` gets one appended entry in the existing format (Context: Stryker and Vitest; Problem: the two reports with zero tests per mutant and the two dates they went unnoticed; Rule: before trusting a mutation score, confirm on the smallest module that covered runtime mutants complete tests and die, and keep the runner's and the framework's test-name separator in step).

### Success Criteria:

#### Automated Verification:

- The unit project runs without the stack: with the local stack stopped, `npm run test:unit` passes and runs every file under `tests/unit/`
- The whole suite is unchanged: with the stack up, `npm test` passes and runs the same number of files and tests as the previous `master` run (both numbers recorded in the PR)
- The narrowed mutation run executes the covering tests on Vitest 5: with the stack stopped, `npm run test:mutation -- --mutate src/lib/landing.ts` finishes, and in `reports/mutation/mutation.json` every runtime mutant has `testsCompleted >= 1` and at least one runtime mutant is `Killed`
- A clean install keeps the fix: after `npm ci`, the two runner files contain the `" > "` separator (patch route) or the upgraded runner version is the one locked in `package-lock.json` (upgrade route)
- Lint and type check pass with the new config files: `npm run lint && npx astro check`

#### Manual Verification:

- Hook behaviour: with the stack stopped, a turn that edits a unit-tested module makes the end-of-turn hook run the unit project (its note names the skipped integration project); with the stack up both hooks behave as before
- README (Tests), the `CLAUDE.md` Commands line and the new `lessons.md` entry read correctly, including the `--logLevel debug` and `ignorePatterns` caveats

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase. The two gitignored sandboxes left by the planning diagnostic (`.stryker-tmp/sandbox-Jgjln0`, `.stryker-tmp/sandbox-m1NSnI`, about 700 MB each, almost all of it a copy of `.wrangler/`) can be deleted by the owner at any time; the agent's settings deny `rm -rf`.

---

## Phase 2: E2E of the key flows

### Overview

Three browser-level flows, each tied to a test-plan risk facet, each modelled on `tests/e2e/seed.spec.ts` with its own personas, cleanup and a deliberate-break check, driven by `/10x-e2e test-coverage phase 2` against the production preview on port 4321. The flows were chosen on 2026-10-15: the invite path, the check-off round trip and the group settings dialogs. One test per file; the settings flow is two files (member, owner). Every new spec opts out of the shared `storageState`, as `group-data-isolation.spec.ts:18` does, because its own identity is part of the risk.

### Changes Required:

#### 1. Persona helpers

**File**: `tests/e2e/local-supabase.ts`

**Intent**: Give the specs the three operations the existing helpers lack, through the persona's own session so RLS applies, and a cleanup for an account the browser created.

**Contract**: `readJoinCode(persona, groupId)` returns the group's `join_code` through the owner's client; `joinGroupAs(persona, code)` calls the `join_group` RPC with the persona's client and throws on error; `deleteAccountsByEmail(emails)` lists users through the admin API (paginated, as `tests/setup/global-setup.ts:79-86` does), deletes the groups they own and then the accounts, and throws on any failure. The local-host guard of `localStack()` stays the only path to credentials.

#### 2. Invite path spec

**File**: `tests/e2e/invite-join.spec.ts` (new)

**Intent**: Protect risk #6's invite-cookie facet (the code survives the sign-in redirect and is spent on join) and risk #2's membership facet (the new member sees exactly the group they joined), which only smoke drives today and without a browser.

**Contract**: header `// risk: test-plan.md #6 (invite code in the cookie) and #2 (the member sees the joined group) — seed: tests/e2e/seed.spec.ts`. Setup: an owner persona with a group (`createPersona`, `createGroupAs`, `readJoinCode`). Flow: a signed-out page opens `/join/<code>` and lands on `/auth/signin`; signs up through the real form (`Email`, `Password`, `Confirm password`, `Create account`, after `waitForHydration`) with a unique `e2e-<token>@example.test` address and lands on `/auth/confirm-email` (URL asserted, not the heading, which differs between dev and the preview build); signs in through the form; the dashboard shows the h1 `Join <group>?` and its only `Join group` button; after the click the dashboard shows the h1 `Group <name>`, `2 members`, the new member's e-mail with the `You` badge and the owner's with `Owner`. Cleanup: `deletePersonas([owner])` and `deleteAccountsByEmail([member])`, both checked. Deliberate break: make `peekJoinCode` return `null` (or `rememberJoinCode` not set the cookie) and see the spec fail on the `Join <group>?` assertion.

#### 3. Check-off round trip spec

**File**: `tests/e2e/checkoff-round-trip.spec.ts` (new)

**Intent**: Protect risk #4's user-facing facet: the streak and the Leaderboard total the viewer sees after a tap equal the rule's result, survive a reload and return on undo. This path exists only in the hydrated UI (`CheckoffControl.tsx`, `Leaderboard.tsx`, the delta store) and nothing drives it today.

**Contract**: header `// risk: test-plan.md #4 (the streak shown after a tick) — seed: tests/e2e/seed.spec.ts`. Setup: a persona with a group and one daily task (`createTaskAs`); the persona joins the task through its client (the control renders only for a participant, `TaskRow.astro:57`). Flow: sign in through the form; in the task's list item, click `Mark done <title>`; expect `Done today`, the streak value `1` in the row and `1` as the viewer's total in the `Leaderboard` list (the row with the `You` badge), all without a reload; `page.reload()` and expect the same; click `Undo <title>`; expect `Mark done <title>`, streak `0` and total `0`; reload and expect the same. Waits are on state, never on time. Cleanup: `deletePersonas`. Deliberate break: make the check-off route skip the insert (or `sendCheckoff` resolve `saved` without a request) and see the post-reload assertion fail. The spec asserts function, not latency; test-plan §7 keeps the immediacy requirement out of tests.

#### 4. Group settings dialogs specs

**Files**: `tests/e2e/group-settings-member.spec.ts`, `tests/e2e/group-settings-owner.spec.ts` (new)

**Intent**: Protect risk #3's rendered facet, chosen by the owner on 2026-10-15: the settings page shows each role only its own controls, and the confirmation dialogs cancel and confirm correctly. The endpoint denials themselves stay with `group-permissions.test.ts` and smoke.

**Contract**: headers name risk #3 and the seed. Member spec: owner persona with a group, member persona joined through `joinGroupAs`; the member signs in, opens `/settings`, sees the `Leave group` button and no `Delete group` button or rename form; opens the dialog `Leave this group?` whose text contains "your streaks in its tasks will be lost"; cancels and still sees the group on `/dashboard`; confirms and lands on the no-group dashboard (`Join with code` visible, no `Group <name>` h1). Owner spec: owner persona with a group; signs in, opens `/settings`, renames through the form and sees the h1 `Group <new name>` on the dashboard; opens `Delete this group?`, cancels (group still shown), confirms and lands on the no-group dashboard. Cleanup: `deletePersonas` for every persona (groups already deleted by the flow or by the helper). Deliberate break: render the `Delete group` control for a member (or make the dialog's confirm not submit) and see the matching spec fail.

### Success Criteria:

#### Automated Verification:

- Invite spec green against the production preview: `npx playwright test tests/e2e/invite-join.spec.ts`
- Check-off spec green: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`
- Settings specs green: `npx playwright test tests/e2e/group-settings-member.spec.ts tests/e2e/group-settings-owner.spec.ts`
- Full suite green, seed and isolation included: `npx playwright test`
- Lint passes on the new specs and helpers: `npm run lint`

#### Manual Verification:

- Deliberate-break checks: each new spec turned red on its risk assertion when the behaviour it protects was broken, and green again after the revert (the break and the red line are recorded in the PR)
- Leftover check after a green and a red run: no persona accounts (admin `listUsers` by the test tokens) and no groups of theirs remain
- Spec titles and origin headers name the risk facet and the seed, and no spec waits on time or uses a CSS selector

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase. `/10x-e2e` flips the Automated rows per spec; the Manual rows stay for the owner.

---

## Phase 3: Playwright in CI with a phone viewport

### Overview

Add the phone project to the Playwright config, seed the account the `setup` project needs on a fresh stack, and run the whole suite in a new `e2e` job on every code PR, advisory until the owner adds it to the ruleset. Commits: the phone project (after both projects pass locally); the seed script; the `e2e` job (after the script passes locally); the docs.

### Changes Required:

#### 1. Phone project

**File**: `playwright.config.ts`

**Intent**: Prove the key flows at phone size, the PRD's only NFR (`context/foundation/prd.md:93`), with functional assertions only.

**Contract**: a project `mobile-chromium` with `...devices["Pixel 7"]` (412×839, touch), the same `storageState` and `dependencies: ["setup"]` as `chromium`; every spec runs in both projects; `npx playwright test --project=mobile-chromium` runs the phone set alone. No screenshot assertions (test-plan §7).

#### 2. Seed account script

**File**: `scripts/e2e-user.mjs` (new)

**Intent**: Create the confirmed account the `setup` project and `seed.spec.ts` sign in with, on a fresh CI stack where `.env` has no credentials.

**Contract**: `node scripts/e2e-user.mjs` resolves the stack like `tests/setup/global-setup.ts:22-55` (the `TEST_SUPABASE_*` variables first, else `supabase status -o env`), refuses a non-local host, creates `e2e-ci-<token>@example.test` with a random password through the admin API with `email_confirm: true`, and prints exactly two lines, `E2E_USERNAME=<email>` and `E2E_PASSWORD=<password>`, for the CI step to append to `$GITHUB_ENV`; it exits non-zero on any failure and never prints keys. ESLint's `scripts/**/*.mjs` scope applies (no type checking, console allowed).

#### 3. The `e2e` job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the suite on every code PR and push, next to `smoke`, with the browser cached and the report kept on failure.

**Contract**: job `e2e` with `needs: changes` and the same fail-safe `if:` as `smoke` (`ci.yml:61`); steps: checkout, Node 22 with npm cache, Supabase CLI 2.117.0, `npm ci`, `actions/cache` on `~/.cache/ms-playwright` keyed by the runner OS and the `@playwright/test` version from `package-lock.json`, `npx playwright install --with-deps chromium`, the stack start with the `smoke` job's `-x` list, the `.env`/`.dev.vars` writing of `ci.yml:77-83` (with `CONTACT_EMAIL`), the seed script's two lines appended to `$GITHUB_ENV` (the password masked with `::add-mask::`), `npx playwright test` (with `CI` set, the config's `webServer` builds and starts the preview itself and does not reuse a server), `actions/upload-artifact` with `if: failure()` for `playwright-report/` and `test-results/`, and `supabase stop --no-backup` with `if: always()`. The job is not a required check until the owner adds it (Phase 6).

#### 4. Docs

**Files**: `README.md` (Tests and CI sections), `context/foundation/test-plan.md` (§4, §5, §6.3, §8), `context/foundation/test-stack.md` is left to `/10x-e2e-setup` and not edited

**Intent**: Document the e2e commands, the phone project, the seeded account and the job, and make the test plan say what CI runs.

**Contract**: README Tests gets an e2e paragraph (single-spec and full-suite commands, both projects, `E2E_USERNAME`/`E2E_PASSWORD` locally from `.env` or from `scripts/e2e-user.mjs`, the port rule and the daemon stop); README CI lists `e2e` with what it does. `test-plan.md` §4 e2e row becomes `Playwright Test (@playwright/test) | 1.63.0 (checked: 2026-10-15) | npx playwright test; specyfikacje w tests/e2e/ (seed, izolacja grup, trzy kluczowe przepływy z S-10); projekty chromium i mobile-chromium (Pixel 7); w CI job e2e (§5). Dołączone decyzją właściciela 2026-10-15 (S-10)`; §5 gains the row `e2e (kluczowe przepływy, desktop + telefon) | local + CI (job e2e) | advisory; required po dodaniu do rulesetu (zamknięcie S-10) | zepsuty przepływ zaproszenia, odznaczania lub ustawień grupy w przeglądarce`; §6.3 replaces "Not planned" with the cookbook: run `/10x-e2e` for a plan phase that names a risk, copy the seed pattern (role locators, own personas, state waits, cleanup that throws), one test per file, both projects, a deliberate break before the commit, no screenshots; §8 records that §4 and §5 were edited on the owner's instruction of 2026-10-15 in S-10.

### Success Criteria:

#### Automated Verification:

- Both projects pass locally: `npx playwright test` runs every spec in `chromium` and `mobile-chromium` and passes
- The seed script refuses a non-local stack: `TEST_SUPABASE_URL=https://example.supabase.co TEST_SUPABASE_ANON_KEY=x TEST_SUPABASE_SERVICE_ROLE_KEY=x node scripts/e2e-user.mjs` exits non-zero and creates nothing
- Lint passes, the script included: `npm run lint`
- The `e2e` job passes on the phase PR with both projects: `gh pr checks` shows `e2e` green (ticked with the PR head SHA on the next phase branch or in the closing docs PR, never on the merged branch)

#### Manual Verification:

- The `e2e` job's duration on the PR run is within budget (at most 6 minutes) and the report artifact is attached when a spec fails (check once with a deliberately failing spec on the PR branch before the final push, reverted before the review)
- README (Tests, CI) and test-plan §4, §5, §6.3 and §8 read correctly

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase.

---

## Phase 4: Auth boundaries and input validation (test-plan phase 3)

### Overview

Close the gaps of risks #5 and #6 that the research found: six mutation routes without a foreign-Origin smoke step, GET steps missing on several routes, the `?error=` non-reflection on the dashboard asserted nowhere, and two auth mappers without a unit test. Apply the §2 backport the research surfaced and mark test-plan phase 3 complete. Tests, smoke and documents only. Commits: smoke steps; unit tests; the test-plan edits.

### Changes Required:

#### 1. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Assert the Origin and method boundaries on every mutation route and that an unknown `?error=` value is neither reflected nor shown as an alert, with bodies chosen so that nothing changes even if the boundary were off (the smoke lesson, `lessons.md:26-31`).

**Contract**: foreign-Origin steps (`origin: FOREIGN_ORIGIN`, expected 403) for `api/auth/signin` (the wrong password), `api/auth/signup` (the already registered address), `api/auth/signout` (an anonymous jar), `api/groups/join` (an empty form, user B before joining), `api/groups/rename` (an empty name, the owner) and `api/groups/leave` (the owner, whom the database refuses anyway); each step's comment says why the body is harmless, and the next existing step that reads state doubles as the state-intact check. GET steps (expected 404) for `api/groups/{create,join,rename,leave}`, `api/tasks/create` and `api/auth/{signin,signup,signout}`. Two steps for a signed-in user: `/dashboard?error=__proto__` and `/dashboard?error=not-a-code` answer 200 with no `role="alert"` and without the value in the body. Steps are placed where the session state they need already exists.

#### 2. Mapper unit tests

**File**: `tests/unit/auth-errors.test.ts`

**Intent**: Pin the two untested mappers with a full table, so a changed or dropped branch turns a test red.

**Contract**: `toSignInErrorCode`: `invalid_credentials` and `email_not_confirmed` pass through, `over_request_rate_limit` becomes `rate_limited`, any other code and a missing code become `unknown`. `toSignUpErrorCode`: `user_already_exists` and `email_exists` become `email_taken`; `weak_password` stays; `validation_failed`, `anonymous_provider_disabled` and `email_address_invalid` become `invalid_input`; `over_request_rate_limit` and `over_email_send_rate_limit` become `rate_limited`; anything else and a missing code become `unknown`. Oracle values come from the README's auth-error documentation and the module's comments, written as table rows, not by running the code. `email_not_confirmed` cannot be produced on the local stack (auto-confirm), so this table and the message test are its only automated coverage, noted in the test.

#### 3. Test-plan edits

**File**: `context/foundation/test-plan.md`

**Intent**: Apply the §2 backport the research surfaced, mark phase 3 complete and fill the phase-3 cookbook.

**Contract**: §2 Risk Response Guidance, row #6, "What would prove protection" becomes `Żądanie z obcego Origin jest odrzucane (403); niepoprawne dane są odrzucane z kodem błędu (302 z ?error= na trasach formularzy, 4xx w trybie JSON odznaczania) i nic nie zapisują`; row #5 "Anti-pattern" becomes `E2E przeciw prawdziwej poczcie; e2e logowania Google (dostawcy nie da się uruchomić lokalnie: hopy sprawdzają smoke i live check wydania)`; no file anchors are added (§1 principle #3). §3 row 3 Status `complete`, Change folder `context/changes/test-coverage/ (S-10)`. §5 "extended smoke" row Required `required (wired)` (true in the ruleset from Phase 6's criterion 6.7, which adds `smoke` and `ci` together with `e2e` and `compat`; until then the row reads as today's smoke row does). §6.4 replaces its TBD with the pattern: a foreign-Origin step with a harmless body and 403, a GET step with 404, a state-intact read after a rejected write, and the `?error=` non-reflection step; §6.1 gets the line that the validation rule of phase 3 lives in the mapper tables of `tests/unit/auth-errors.test.ts`, and that the e-mail return's hands-off treatment of the invite cookie is pinned by the cookie-less context of `tests/integration/auth-callback.test.ts` (any cookie call would throw and fail the success case). §6.6 gets a 2-3 line phase note by `/10x-implement`.

### Success Criteria:

#### Automated Verification:

- Smoke passes with the new steps against the production preview: `npm run smoke` (the step count rises by the number of added steps, recorded in the PR)
- Unit and integration suites pass with the mapper tables: `npm test`
- Lint passes: `npm run lint`
- Smoke still passes in CI: `gh pr checks` shows `smoke` green (ticked with the PR head SHA on the next branch or in the closing docs PR)

#### Manual Verification:

- Deliberate break: with `security: { checkOrigin: false }` in `astro.config.mjs` (never committed) every foreign-Origin smoke step fails and the rest passes; the file is restored afterwards
- Test-plan §2 backport, §3 row 3, §5 row, §6.1, §6.4 and §6.6 read correctly
- The owner reads back the hosted Auth settings (sign-in/sign-up and e-mail rate limits, captcha on or off, Confirm email on) in the Supabase dashboard and records them in the PR description, to be carried into the Phase 6 deployment-plan entry

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase.

---

## Phase 5: Mutation baseline on the rule modules

### Overview

With S-12 Phases 3-4 merged, run the mutation tool from Phase 1 on each of the 14 rule and mapping modules, record the baseline, review every survivor one by one, and close the weak tests whose survivor a user or the business would notice. Tests and documents only; `src/` stays untouched. Commits: the baseline document after the first full pass; the strengthened tests with the updated scores; the cookbook.

### Changes Required:

#### 1. Precondition

**Files**: `tests/unit/{group-errors,task-errors,group-rules,join-code,checkoff-response}.test.ts`, `tests/integration/rule-contracts.test.ts` (from S-12)

**Intent**: Measure the tests that exist, not write them twice.

**Contract**: the phase starts only when those files exist on `master`; otherwise it stops with the message that S-12 Phases 3-4 have not merged.

#### 2. Baseline document

**File**: `context/foundation/mutation-baseline.md` (new)

**Intent**: Make the measurement visible and comparable, without committing the JSON reports (gitignored under `reports/`).

**Contract**: one table row per module with the run date, mutants, killed, survived, no-coverage, runtime errors, timeouts, score and wall time, each from `reports/mutation/mutation.json` of a run `npm run test:mutation -- --mutate <module>` with the stack stopped; below it one list per module of the survivors: mutant id, line, mutator, and a verdict from `equivalent`, `unobservable` (no user-visible or business-relevant effect), `import-time throw` (a static mutant with `testsCompleted: 0` that breaks the module at import) or `fixed by <test name>`. A runtime mutant with `testsCompleted: 0` that is not an import-time throw is a tooling failure and stops the phase.

#### 3. Closing the weak tests

**Files**: the existing files under `tests/unit/` for the modules concerned

**Intent**: Add assertions only where a survivor represents a wrong streak, rank, period, error code, redirect target, message or an accepted invalid input.

**Contract**: each added assertion is named in the baseline's verdict, its expected value is written from the PRD, README or module comment (never copied from the mutant's output), and the module is re-run so the table shows the new score. Equivalent and unobservable mutants are listed, not killed; no threshold is chased.

#### 4. Cookbook and README

**Files**: `context/foundation/test-plan.md` (§6.1, §6.6), `README.md` (Tests)

**Intent**: Say how and when to re-measure.

**Contract**: §6.1 gains the mutation paragraph: the command, the narrowed form, that the unit config is stack-free, the JSON `testsCompleted` caveat, the `--logLevel debug` caveat, the link to the baseline, and the re-run rule (re-run a module's mutation when its rule or its test file changes, compare with the baseline, and treat a lower score as a review finding to explain); §6.6 gets the phase note; README Tests points at the baseline.

### Success Criteria:

#### Automated Verification:

- Precondition holds: `tests/unit/{group-errors,task-errors,group-rules,join-code,checkoff-response}.test.ts` and `tests/integration/rule-contracts.test.ts` exist on `master`
- Every listed module has a recorded run: `mutation-baseline.md` has one row per module, and no runtime mutant in any run has `testsCompleted: 0` except those classified as import-time throws
- Suites pass with the strengthened tests: `npm test` with the stack up and `npm run test:unit` with the stack stopped
- No source change: `git diff --stat origin/master...HEAD -- src` prints nothing
- Lint passes: `npm run lint`

#### Manual Verification:

- Survivor review complete: every survivor has a verdict, and every `fixed by` verdict names an assertion that exists
- Determinism spot check: re-running one module's mutation reproduces its recorded score
- Test-plan §6.1, §6.6 and README read correctly

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase.

---

## Phase 6: Release compatibility gate and closing

### Overview

Build the gate for risk #1 that S-12 left to S-10: a `production` tag that the `release` job moves after every successful deploy, and a `compat` job that, on every PR touching `supabase/migrations/`, builds the deployed commit and runs its own smoke against a stack carrying the PR's migrations. Then close the slice: the remaining test-plan sections, the lessons entry, the deployment-plan entry and the owner's ruleset additions. Commits in this order: the initial tag (a push, no commit); the `release` tag step; the `changes` output; the `compat` job (after the two scratch-PR checks); the docs.

### Changes Required:

#### 1. Initial tag

**File**: none (a tag in the remote)

**Intent**: Give the gate something to compare against before the first release moves the tag.

**Contract**: after the owner confirms the deployed commit (at planning time `30c01bb`, the merge of PR #105; the owner checks `npx wrangler deployments list` with the `!` prefix and that no `wrangler rollback` happened), the implementer pushes `production` at that commit (`git tag production <sha> && git push origin production`) and records the SHA in the PR.

#### 2. Tag step in the release job

**File**: `.github/workflows/ci.yml` (`release` job)

**Intent**: Keep the tag equal to what is live, automatically.

**Contract**: the `release` job gets `permissions: { contents: write }` at job level (the workflow default stays `read`); a step `Mark the deployed commit` right after `Deploy Worker` force-moves `production` to `github.sha` and pushes it; the live check follows as today. The README Rollback section says that after `npx wrangler rollback` the owner moves the tag by hand to the rolled-back commit.

#### 3. Migration output in `changes`

**File**: `.github/workflows/ci.yml` (`changes` job)

**Intent**: Run the gate only when a PR touches migrations, failing safe.

**Contract**: a second output `migrations`, `true` when the PR diff lists a path under `supabase/migrations/`, `false` otherwise and on push events; a failed `changes` job leaves it empty, which the gate treats as "run".

#### 4. The `compat` job

**File**: `.github/workflows/ci.yml` (new job)

**Intent**: Prove that the deployed code survives the new schema during the deploy interval, the exposure risk #1 names.

**Contract**: job `compat` with `needs: changes` and `if: ${{ !cancelled() && github.event_name == 'pull_request' && needs.changes.outputs.migrations != 'false' }}`; steps: checkout of the PR, a step `git ls-remote --exit-code --tags origin production` that fails with the message "no production tag: create it at the deployed commit" when the tag is missing, a second `actions/checkout@v4` with `ref: refs/tags/production` and `path: deployed`, Node 22, Supabase CLI 2.117.0, `npm ci` in both checkouts, the stack start from the PR checkout (so the PR's migrations apply), the `.env`/`.dev.vars` writing of `ci.yml:77-83` inside `deployed/`, `npm run build` there, `npm run preview -- --port 4321 &` there with the curl wait of `ci.yml:88`, `BASE_URL=http://localhost:4321 npm run smoke` run from `deployed/` (the deployed commit's own script and expectations), and `supabase stop --no-backup` with `if: always()`. A top comment explains that a red run means the migration is not backward compatible with the deployed code and must be split (add first, remove later). The job is skipped on PRs without migrations, so a required check passes there.

#### 5. Docs, test plan, lessons, deployment plan

**Files**: `README.md` (CI, Release, Rollback), `context/foundation/test-plan.md` (§3, §5, §6.5, §6.6, §7, §8), `context/foundation/lessons.md`, `context/changes/deployment/deployment-plan.md`

**Intent**: Record the gate and close the slice's documents.

**Contract**: README CI lists `compat` and the `production` tag; Release step 3 names the tag move; Rollback names the manual tag move; the backward-compatibility paragraph names the gate. `test-plan.md`: §3 row 2 Status `complete`, Change folder `context/changes/test-coverage/ (S-10)`, rows 1 and 4 Status `complete` with their archive folders (`context/archive/2026-09-30-testing-runner-data-isolation-and-permissions/`, `context/archive/2026-10-01-checkoff-and-leaderboard/ (S-04)`), the paragraph under the table amended to say e2e joined in S-10 by the owner's decision of 2026-10-15; §5 "migration/code consistency check" row becomes `required (wired): strażnicy S-12 (niezmienność, marker, kolejność, typy) + job compat (kod z produkcji kontra nowy schemat); required po dodaniu compat do rulesetu` with Catches `kod wymagający schematu, którego produkcja nie ma; migracja, której wdrożony kod nie przeżyje`; the lint+build and smoke rows keep `required (wired)`, which criterion 6.7 makes true in the ruleset; §6.5 adds how the gate works and what to do when it is red; §7 re-evaluates its first bullet (appearance stays excluded: the kitchen sink and the screenshot script remain the gate, e2e asserts function; re-evaluate if a visual regression reaches production) and adds bullets for Google sign-in e2e, e-mail confirmation on production, hosted rate limits and captcha with a real flood (owner read-back, only the 429 mapping tested); §8 ledger dates 2026-10-15 with the owner-instruction note and the stack versions (Vitest 5.0.3, Playwright 1.63.0, Stryker 10.0.0 with the fix, Supabase CLI 2.117.0). `lessons.md` gets one appended entry: a CI job that needs the deployed code reads the `production` tag, never `master` (context: the cancelled release runs of 2026-10-12 to 2026-10-15). `deployment-plan.md` gets the S-10 entry under Phase 16 (S-12 takes 15), in the format of Phase 14: every S-10 release run (approved or superseded), the initial tag, the hosted Auth read-back from Phase 4, the ruleset additions and the production check.

### Success Criteria:

#### Automated Verification:

- The initial tag exists at the confirmed deployed commit: `git ls-remote --tags origin production` shows that SHA
- The phase PR's own CI run is green with the new jobs: `gh pr checks` shows `ci`, `smoke`, `integration`, `e2e` green and `compat` skipped (the PR adds no migration); ticked with the PR head SHA in the closing docs PR
- Lint and formatting pass on the edited documents and workflow: `npm run lint`

#### Manual Verification:

- With the owner's go-ahead, a scratch draft PR that adds a migration the deployed code cannot survive (for example a `drop column` on a column it reads) shows `compat` failing in the deployed commit's smoke; closed unmerged, branch deleted
- With the owner's go-ahead, a scratch draft PR that adds a compatible, additive migration shows `compat` passing; closed unmerged, branch deleted
- Release and tag move: after the merge, the owner approves the `release` run; `git fetch --tags origin && git rev-parse production` equals the merge commit and the live check passes
- The owner adds `ci`, `smoke`, `e2e` and `compat` to the required checks of the `master` ruleset; `gh api repos/mariuszzlotucha/streak-board/rulesets/24254172` lists `integration`, `ai-review`, `ci`, `smoke`, `e2e` and `compat`
- README (CI, Release, Rollback), test-plan §3, §5, §6.5, §7, §8 and the lessons entry read correctly
- The `deployment-plan.md` Phase 16 entry is written with every S-10 release run, the initial tag, the hosted Auth read-back and the ruleset change; the rows that need this PR's own checks, release or the ruleset change are ticked in a small closing docs PR
- Production check after the Phase 6 release: sign in, the dashboard shows the group and its tasks, tick a task and undo it (the Worker code is unchanged; the check proves the release path with the tag step)

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones, including the two scratch PRs before the `compat` commit is pushed and the ruleset change after the release. The slice is closed by `/10x-impl-review test-coverage` and `/10x-archive test-coverage` after the closing docs PR merges.

---

## Testing Strategy

### Unit Tests:

- Phase 1: the existing unit files, run stack-free; the narrowed mutation run on `src/lib/landing.ts` as the proof of the tooling.
- Phase 4: the two auth mapper tables in `tests/unit/auth-errors.test.ts`.
- Phase 5: assertions added to existing unit files for survivors that matter, named in the baseline.

### Integration Tests:

- Phase 4: no new integration file; the e-mail return's hands-off treatment of the invite cookie stays pinned by the existing `tests/integration/auth-callback.test.ts` (its context has no cookie methods, so any cookie call fails the success case).
- Smoke (`scripts/smoke.mjs`) gains the Origin, GET and `?error=` steps in Phase 4 and keeps running in CI on every code PR; Phase 6's `compat` job runs the deployed commit's smoke against the new schema.
- Playwright: five specs in two projects, locally against the preview and in the `e2e` job from Phase 3 on.

### Manual Testing Steps:

1. Phase 1: the hook behaviour with the stack down and up.
2. Phase 2: one deliberate break per spec and the leftover check after a green and a red run.
3. Phase 4: the Origin check switched off once in `astro.config.mjs` to see the new smoke steps fail; the owner's hosted Auth read-back.
4. Phase 5: the survivor verdicts and a determinism re-run.
5. Phase 6: two scratch PRs (red and green `compat`), the release approval with the tag move, the ruleset change and the production check.

## Performance Considerations

CI grows by the `e2e` job on every code PR (about 4-5 minutes: stack, browser install from cache, build, five specs in two projects) and by `compat` on migration PRs only (about 4 minutes: a second `npm ci` and build). Locally, `npm run test:unit` takes seconds without the stack, and a mutation run of one module takes between 15 seconds (`landing.ts`) and a few minutes (`streak-rules.ts`, 130 mutants) with the stack stopped. The hook's stack-down branch adds the unit run to turns that edit code.

## Migration Notes

No schema change and no data migration. The `production` tag is new repository metadata: created once by hand at the deployed commit, then moved by the `release` job; after a manual `wrangler rollback` the owner moves it by hand (README Rollback). Reverting a phase is reverting its merge; reverting Phase 6 also means deleting the tag or leaving it as documentation.

## References

- Related research: `context/changes/test-coverage/research.md` (test base inventory §2-§3, phase anchors §4-§5, Stryker §6, e2e §7, S-12 overlap §8, test-plan corrections §9, open questions)
- Stryker cause and diagnostic runs (2026-10-15): `node_modules/@stryker-mutator/vitest-runner/dist/src/{test-helpers.js:11,stryker-setup.js:66,vitest-test-runner.js:95,144-153,171-173}`, `node_modules/vitest/dist/task-utils.js:51-53,224`, `node_modules/@stryker-mutator/core/dist/src/mutants/mutant-test-planner.js:43-46,92-98`
- Test plan and its rules: `context/foundation/test-plan.md:42-49,60-69,77-82,96-102,120-128,135-163,182-203`, `.claude/skills/10x-test-plan/SKILL.md:445-460,572-579`
- Roadmap and scope: `context/foundation/roadmap.md:154-166,220`, `context/foundation/roadmap-input-next-slices.md:41-52`, `context/foundation/prd.md:93`
- S-12 plan (ownership and shared files): `context/changes/refactor-opportunities/plan.md:28,41-52,117-189,193-289`, `plan-brief.md:64`, `research.md:280-293`
- Lessons applied: `context/foundation/lessons.md:19-24,26-31,77-82,84-89,91-96,98-110,112-117,119-124,140-152`
- CI, release and ruleset: `.github/workflows/ci.yml:9-10,17-40,59-91,116-237`, `gh api repos/mariuszzlotucha/streak-board/rulesets/24254172`, `gh run list --workflow ci.yml --branch master --event push` (runs #105-#123)
- Test configuration and hooks: `vitest.config.ts`, `stryker.config.json`, `playwright.config.ts`, `tests/setup/global-setup.ts:22-55,73-101`, `tests/helpers/supabase.ts:164-165`, `.claude/hooks/end-of-turn.sh:48-59`, `.claude/hooks/related-tests.sh:21-25`, `.claude/settings.json:26-28` (`rm -rf` denied)
- E2E patterns and markup: `tests/e2e/{seed.spec,group-data-isolation.spec,helpers,local-supabase,auth.setup}.ts`, `src/components/tasks/CheckoffControl.tsx:105-156`, `src/components/tasks/Leaderboard.tsx:21-40`, `src/components/dashboard/{PendingInviteCard,MembersCard,GroupSettingsCard,TaskRow}.astro`, `src/components/auth/SignUpForm.tsx:77-143`, `src/pages/api/auth/signup.ts:18-29`, `src/pages/join/[code].ts`, `src/lib/join-code.ts`, `src/pages/api/groups/join.ts`, `supabase/config.toml:180-213`
- Smoke patterns: `scripts/smoke.mjs:20-110,682-727,772-805,916-996`
- Auth mapping and cookies: `src/lib/auth-errors.ts:24-34,92-109`, `tests/integration/auth-callback.test.ts:1-60`, `README.md:155-172`
- Deployment record format: `context/changes/deployment/deployment-plan.md:245-273`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Stack-free unit project and a working mutation run

#### Automated

- [x] 1.1 The unit project runs without the stack: with the local stack stopped, `npm run test:unit` passes and runs every file under `tests/unit/` — 21b7800
- [x] 1.2 The whole suite is unchanged: with the stack up, `npm test` passes and runs the same number of files and tests as the previous `master` run (both numbers recorded in the PR) — 21b7800
- [x] 1.3 The narrowed mutation run executes the covering tests on Vitest 5: with the stack stopped, `npm run test:mutation -- --mutate src/lib/landing.ts` finishes, and in `reports/mutation/mutation.json` every runtime mutant has `testsCompleted >= 1` and at least one runtime mutant is `Killed` — 21b7800
- [x] 1.4 A clean install keeps the fix: after `npm ci`, the two runner files contain the `" > "` separator (patch route) or the upgraded runner version is the one locked in `package-lock.json` (upgrade route) — 21b7800
- [x] 1.5 Lint and type check pass with the new config files: `npm run lint && npx astro check` — 21b7800

#### Manual

- [ ] 1.6 Hook behaviour: with the stack stopped, a turn that edits a unit-tested module makes the end-of-turn hook run the unit project (its note names the skipped integration project); with the stack up both hooks behave as before
- [ ] 1.7 README (Tests), the `CLAUDE.md` Commands line and the new `lessons.md` entry read correctly, including the `--logLevel debug` and `ignorePatterns` caveats

### Phase 2: E2E of the key flows

#### Automated

- [x] 2.1 Invite spec green against the production preview: `npx playwright test tests/e2e/invite-join.spec.ts` — 0e08366
- [x] 2.2 Check-off spec green: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts` — 0e08366
- [x] 2.3 Settings specs green: `npx playwright test tests/e2e/group-settings-member.spec.ts tests/e2e/group-settings-owner.spec.ts` — 0e08366
- [x] 2.4 Full suite green, seed and isolation included: `npx playwright test` — 0e08366
- [x] 2.5 Lint passes on the new specs and helpers: `npm run lint` — 0e08366

#### Manual

- [x] 2.6 Deliberate-break checks: each new spec turned red on its risk assertion when the behaviour it protects was broken, and green again after the revert (the break and the red line are recorded in the PR) — PR #133 description, P2: `peekJoinCode` → `null` (invite spec :68), `checkOff` ok without the insert (check-off spec :77), `isOwner || true` (member spec :49), delete route no-op (owner spec :64), each red then restored; confirmed by the owner 2026-10-16
- [ ] 2.7 Leftover check after a green and a red run: no persona accounts (admin `listUsers` by the test tokens) and no groups of theirs remain
- [ ] 2.8 Spec titles and origin headers name the risk facet and the seed, and no spec waits on time or uses a CSS selector

### Phase 3: Playwright in CI with a phone viewport

#### Automated

- [x] 3.1 Both projects pass locally: `npx playwright test` runs every spec in `chromium` and `mobile-chromium` and passes — 99a4f77
- [x] 3.2 The seed script refuses a non-local stack: `TEST_SUPABASE_URL=https://example.supabase.co TEST_SUPABASE_ANON_KEY=x TEST_SUPABASE_SERVICE_ROLE_KEY=x node scripts/e2e-user.mjs` exits non-zero and creates nothing — 99a4f77
- [x] 3.3 Lint passes, the script included: `npm run lint` — 99a4f77
- [x] 3.4 The `e2e` job passes on the phase PR with both projects: `gh pr checks` shows `e2e` green (ticked with the PR head SHA on the next phase branch or in the closing docs PR, never on the merged branch) — PR #133, head ed73bb0, run 38824562138

#### Manual

- [ ] 3.5 The `e2e` job's duration on the PR run is within budget (at most 6 minutes) and the report artifact is attached when a spec fails (check once with a deliberately failing spec on the PR branch before the final push, reverted before the review)
- [ ] 3.6 README (Tests, CI) and test-plan §4, §5, §6.3 and §8 read correctly

### Phase 4: Auth boundaries and input validation (test-plan phase 3)

#### Automated

- [x] 4.1 Smoke passes with the new steps against the production preview: `npm run smoke` (the step count rises by the number of added steps, recorded in the PR) — 5c803b1
- [x] 4.2 Unit and integration suites pass with the mapper tables: `npm test` — 5c803b1
- [x] 4.3 Lint passes: `npm run lint` — 5c803b1
- [x] 4.4 Smoke still passes in CI: `gh pr checks` shows `smoke` green (ticked with the PR head SHA on the next branch or in the closing docs PR) — PR #133, head ed73bb0, run 38824562138

#### Manual

- [x] 4.5 Deliberate break: with `security: { checkOrigin: false }` in `astro.config.mjs` (never committed) every foreign-Origin smoke step fails and the rest passes; the file is restored afterwards — PR #133 description, P4: 21 foreign-Origin steps red plus 4 state-intact steps, `astro.config.mjs` unchanged on the branch (`git diff origin/master...HEAD -- src` and the config were clean); confirmed by the owner 2026-10-16
- [ ] 4.6 Test-plan §2 backport, §3 row 3, §5 row, §6.1, §6.4 and §6.6 read correctly
- [x] 4.7 The owner reads back the hosted Auth settings (sign-in/sign-up and e-mail rate limits, captcha on or off, Confirm email on) in the Supabase dashboard and records them in the PR description, to be carried into the Phase 6 deployment-plan entry — read back on 2026-10-16 (sign-ups and sign-ins 30 per 5 min per IP, e-mails 30 per hour, captcha off, Confirm email on), in the PR #133 description and deployment-plan Phase 16

### Phase 5: Mutation baseline on the rule modules

#### Automated

- [x] 5.1 Precondition holds: `tests/unit/{group-errors,task-errors,group-rules,join-code,checkoff-response}.test.ts` and `tests/integration/rule-contracts.test.ts` exist on `master` — a7731bf
- [x] 5.2 Every listed module has a recorded run: `mutation-baseline.md` has one row per module, and no runtime mutant in any run has `testsCompleted: 0` except those classified as import-time throws — a7731bf
- [x] 5.3 Suites pass with the strengthened tests: `npm test` with the stack up and `npm run test:unit` with the stack stopped — a7731bf
- [x] 5.4 No source change: `git diff --stat origin/master...HEAD -- src` prints nothing — a7731bf
- [x] 5.5 Lint passes: `npm run lint` — a7731bf

#### Manual

- [ ] 5.6 Survivor review complete: every survivor has a verdict, and every `fixed by` verdict names an assertion that exists
- [ ] 5.7 Determinism spot check: re-running one module's mutation reproduces its recorded score
- [ ] 5.8 Test-plan §6.1, §6.6 and README read correctly

### Phase 6: Release compatibility gate and closing

#### Automated

- [x] 6.1 The initial tag exists at the confirmed deployed commit: `git ls-remote --tags origin production` shows that SHA (`fb62d74`, pushed 2026-10-16) — 577bb4e
- [x] 6.2 The phase PR's own CI run is green with the new jobs: `gh pr checks` shows `ci`, `smoke`, `integration`, `e2e` green and `compat` skipped (the PR adds no migration); ticked with the PR head SHA in the closing docs PR — PR #133, head ed73bb0, run 38824562138
- [x] 6.3 Lint and formatting pass on the edited documents and workflow: `npm run lint` — 81f9fdc

#### Manual

- [x] 6.4 With the owner's go-ahead, a scratch draft PR that adds a migration the deployed code cannot survive (for example a `drop column` on a column it reads) shows `compat` failing in the deployed commit's smoke; closed unmerged, branch deleted — scratch PR #131 (`tasks.title` renamed), `compat` red in the deployed smoke, run 38822675599; closed unmerged, branch deleted; deployment-plan Phase 16; confirmed by the owner 2026-10-16
- [x] 6.5 With the owner's go-ahead, a scratch draft PR that adds a compatible, additive migration shows `compat` passing; closed unmerged, branch deleted — scratch PR #132 (nullable `tasks.scratch_note`), `compat` green with 227/227 deployed smoke steps, run 38822678146; closed unmerged, branch deleted; deployment-plan Phase 16; confirmed by the owner 2026-10-16
- [x] 6.6 Release and tag move: after the merge, the owner approves the `release` run; `git fetch --tags origin && git rev-parse production` equals the merge commit and the live check passes — run 38825633332 approved by the owner, `production` at 45b7657 (moved by the job, "forced update" from fb62d74), live check green, 2026-10-16
- [x] 6.7 The owner adds `ci`, `smoke`, `e2e` and `compat` to the required checks of the `master` ruleset; `gh api repos/mariuszzlotucha/streak-board/rulesets/24254172` lists `integration`, `ai-review`, `ci`, `smoke`, `e2e` and `compat` — owner's PUT on 2026-10-16, read back the same day
- [ ] 6.8 README (CI, Release, Rollback), test-plan §3, §5, §6.5, §7, §8 and the lessons entry read correctly
- [x] 6.9 The `deployment-plan.md` Phase 16 entry is written with every S-10 release run, the initial tag, the hosted Auth read-back and the ruleset change; the rows that need this PR's own checks, release or the ruleset change are ticked in a small closing docs PR — closeout PR #134, 2026-10-16
- [x] 6.10 Production check after the Phase 6 release: sign in, the dashboard shows the group and its tasks, tick a task and undo it (the Worker code is unchanged; the check proves the release path with the tag step) — owner, 2026-10-16, after release run 38825633332: all ok
