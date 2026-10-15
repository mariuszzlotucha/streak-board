# Test coverage (S-10): risk-chosen tests, mutation-measured unit quality, e2e of the key flows — Plan Brief

> Full plan: `context/changes/test-coverage/plan.md`
> Research: `context/changes/test-coverage/research.md`

## What & Why

Slice S-10 closes M-2's quality outcome MS-02: changes are protected by tests chosen by risk, and the unit tests' quality is measured by mutations. The plan takes the two unstarted phases of `context/foundation/test-plan.md` (the release ordering gate for risk #1; auth boundaries and input validation for risks #5 and #6), makes Stryker actually measure the unit tests, adds browser tests for three key flows under the S-11 markup and runs them in CI, and writes down what the slice does not test. Nothing under `src/` changes.

## Starting Point

The test base is already broad (32 Vitest files, 293 SQL assertions, a 2,167-line smoke, 3 Playwright files), but every Vitest run needs the local stack, Playwright and Stryker run nowhere, and both Stryker reports so far are meaningless: on Vitest 5 the runner's per-mutant test filter matches no test (its name separator is a space, Vitest 5's is `" > "`), so every covered mutant is reported survived with zero tests. The release orders schema before code, but no job proves the deployed code survives a new migration, and the deployed commit is PR #105 (`30c01bb`), not `master`, because every release since 2026-10-12 was cancelled. S-12 (`refactor-opportunities`, reviewed, unimplemented) owns the unit tests S-10 would mutate.

## Desired End State

`npm run test:unit` and `npm run test:mutation` run without the stack, every rule module has a recorded mutation baseline with its survivors reviewed, five Playwright specs pass on desktop and phone locally and in an `e2e` CI job, smoke asserts the Origin and method boundaries on every mutation route, a `compat` job checks each migration PR against the commit tagged `production`, and `test-plan.md` says what CI really runs and what the project deliberately leaves untested.

## Key Decisions Made

| Decision                  | Choice                                                                                                                                                           | Why (1 sentence)                                                                                                             | Source                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Order against S-12        | S-12 implements all five phases first; S-10 starts after and measures the tests S-12 writes                                                                      | Matches the roadmap order, keeps "not twice" without reopening a reviewed plan, and the shared files fail the worktree check | Plan (owner, 2026-10-15) |
| `test-plan.md` governance | §2-§8 edited in this change by the owner's explicit instruction; the §2 backport (risk #6 wording, stale risk #5 anti-pattern) included                          | The document already contradicts the repo (§4 "e2e: none") and a `--refresh` would delay the slice by a planning cycle       | Plan (owner, 2026-10-15) |
| Form-error contract       | 302 with an allow-listed `?error=` code stays the contract; 4xx only in the check-off JSON mode                                                                  | No behaviour change inside a test slice; S-08 fixed and S-11 kept this contract, and smoke binds to it                       | Plan (owner, 2026-10-15) |
| Key e2e flows             | Invite link → sign-up → sign-in → join → member view; Mark done → streak and board → reload → Undo; the group settings dialogs                                   | The first two cross the most boundaries and only smoke drives them; the owner added the dialogs as a rendered-UI facet of #3 | Plan (owner, 2026-10-15) |
| Playwright in CI          | A separate `e2e` job on every code PR, advisory until the owner adds it to the ruleset at the close                                                              | Catches a broken key flow before merge without blocking on first-run flakiness                                               | Plan (owner, 2026-10-15) |
| Phone viewport            | A `mobile-chromium` project (Pixel 7) running the same specs, functional assertions only                                                                         | The PRD's only NFR gets an automated check for a config entry, inside §7's exclusion of appearance tests                     | Plan (owner, 2026-10-15) |
| Release gate (risk #1)    | A `compat` job runs the deployed commit's smoke against the PR's migrations; the `release` job moves a `production` tag after each deploy                        | Proves exactly the deploy-interval exposure against what is really live; `master` is not what is deployed                    | Plan (owner, 2026-10-15) |
| Where mutation runs live  | Local, scripted (`npm run test:mutation -- --mutate <file>`), baselines and survivor verdicts recorded; no CI job, no numeric gate                               | Follows the `CLAUDE.md` rule (narrowed, survivors one by one, no 100 % chase) at zero CI cost                                | Plan (owner, 2026-10-15) |
| Stryker fix               | An upstream runner that matches Vitest 5 if one exists, else a two-line `patch-package` patch of the name separator; a Vitest pin is the owner's call            | The cause is the separator alone (file filter verified fine); the fix was not run during planning, so Phase 1 proves it      | Plan (diagnostic)        |
| Stack-free unit project   | `vitest.config.ts` composes a unit project (no global setup) and an integration project; `npm test` unchanged; hooks use the unit project when the stack is down | No unit file touches the DB helper, and the split is the lever that makes mutation runs cheap and the hook useful offline    | Research OQ9 → Plan      |
| Deliberately untested     | Google sign-in e2e, production e-mail confirmation, real rate limits and captcha, UI appearance, immediacy, owner-only API denials in e2e                        | Not drivable locally, excluded by design, or already proven by a cheaper layer; recorded in §7 and the plan                  | Plan                     |

## Scope

**In scope:** the Vitest split and scripts; the Stryker fix, config and `test:mutation`; the mutation baseline and strengthened unit tests for 14 rule modules; three new Playwright specs and the persona helpers; the phone project, the seeded CI account and the `e2e` job; smoke Origin, GET and `?error=` steps; the auth mapper tables; the `production` tag, the `migrations` output and the `compat` job; README, `CLAUDE.md` Commands line, `test-plan.md` §2-§8, two lessons, the deployment-plan entry.

**Out of scope:** any change under `src/`; the unit and DB contract tests S-12 Phases 3-4 write; Stryker on glue modules or in CI; a `--refresh` of the test plan; a production canary, staging or Supabase branching; editing the ruleset (the owner does it); parallel worktrees with S-12.

## Architecture / Approach

Six phases after S-12 merges, one PR each on `s-10/test-coverage/phase-<N>`, reviewed per phase. Phase 1 is the enabler (stack-free unit project, working Stryker, proven on `landing.ts`); Phase 2 writes the specs through `/10x-e2e` with a deliberate break each; Phase 3 wires the phone project and the `e2e` job; Phase 4 finishes test-plan phase 3 (smoke, mapper tests, the §2 backport); Phase 5 records the mutation baseline on the tests S-12 has added and closes the weak ones; Phase 6 builds the `compat` gate with the `production` tag and closes the documents and the ruleset. Enforcement (a job, a hook branch) is switched on in its own commit after what it checks passes locally.

## Phases at a Glance

| Phase                                                 | What it delivers                                                                                                   | Key risk                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1. Stack-free unit project and a working mutation run | `test:unit` without the stack, hooks using it, Stryker executing covering tests on Vitest 5, docs and a lesson     | The separator fix is unverified; if neither upgrade nor patch kills, the phase stops and asks |
| 2. E2E of the key flows                               | Specs for the invite path, the check-off round trip and the settings dialogs, each with a deliberate-break check   | Hydration and dialog timing; cleanup of browser-created accounts                              |
| 3. Playwright in CI with a phone viewport             | `mobile-chromium`, the seeded account script, the `e2e` job with browser cache and failure artifacts, docs         | CI flakiness and a 4-5 minute budget per PR                                                   |
| 4. Auth boundaries and input validation               | Smoke Origin/GET/`?error=` steps, mapper tables, the §2 backport, test-plan phase 3 complete                       | Step placement in a 2,167-line smoke; the owner's hosted read-back is manual                  |
| 5. Mutation baseline on the rule modules              | Scores and survivor verdicts for 14 modules, strengthened tests, the §6.1 cookbook                                 | Needs S-12 Phases 3-4; import-time-throw survivors must be classified, not chased             |
| 6. Release compatibility gate and closing             | `production` tag, `migrations` output, `compat` job, README, test-plan §3/§5/§6.5/§7/§8, lessons, deployment entry | The deployed-commit assumption (`30c01bb`) and the owner's ruleset change                     |

**Prerequisites:** S-12 merged (all five phases); the local stack, `.env` and `.dev.vars` with `CONTACT_EMAIL`; the owner available for the hosted read-back, two scratch PRs, the release approval and the ruleset change.
**Estimated effort:** 6 PRs over roughly 6-9 agent sessions; Phases 2 and 5 are the longest, Phase 3 and 6 depend on CI round trips.

## Open Risks & Assumptions

- The Stryker fix was diagnosed but not run during planning (the patched-runner attempt was denied); Phase 1's success row 1.3 is the proof, and a Vitest 4 pin is explicitly the owner's decision if both routes fail.
- The deployed commit is assumed to be `30c01bb` (PR #105); the owner confirms it before the initial `production` tag is pushed.
- S-12 may rename or reshape the files Phase 5 depends on; the phase checks its precondition and the plan gets a touch-up if names changed.
- The `compat` job runs the deployed commit's own smoke, which needs that commit's `.env` and `.dev.vars` shape; the first green scratch run proves the recipe.
- `e2e` and `compat` are advisory until the owner adds them to the ruleset, and so are `smoke` and `ci` today (only `integration` and `ai-review` are required); the closing ruleset edit adds all four.
- The two 1.4 GB Stryker sandboxes left by the planning diagnostic in `.stryker-tmp/` are gitignored and can be deleted by the owner at any time.

## Success Criteria (Summary)

- A developer can run the unit tests and a narrowed mutation run without the stack, and the baseline shows how many mutants each rule module's tests kill and why the rest survive.
- A broken invite path, check-off round trip or settings dialog, on desktop or phone, fails the `e2e` job before merge; a migration the deployed code cannot survive fails `compat`.
- `test-plan.md` phases 2 and 3 are `complete`, its stack and gates match CI, and §7 names what the project deliberately leaves untested.
