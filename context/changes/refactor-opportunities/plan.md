# Refactor opportunities: guards, safety net and explicit grants Implementation Plan

## Overview

`context/changes/refactor-opportunities/research.md` ranked ten refactor opportunities from the technical debt recorded in `context/changes/data-access/research.md` and left the decision to this plan. The decision: implement the five behaviour-neutral, pairwise independent opportunities (OPP-2, OPP-3, OPP-1, OPP-5, OPP-4) as five reversible phases, and leave the structural chain (route skeleton, zero-row trace, one client per request), the fail-closed `/api/*` gate and the release-order gate out, each with a revisit trigger. No phase changes what a user or an HTTP client can observe: Phase 1 adds telemetry on failure paths only, Phases 2 to 4 add CI checks and tests, Phase 5 grants privileges the deployed code already uses.

## Current State Analysis

- The baseline at `c9f6451` is green: `npm run lint` exit 0, `npx astro check` 0 errors, `npm test` 27 files and 385 tests in 6.4 s, `npm run test:rls` 293 assertions. Smoke and Playwright were not run.
- Five `console.error` calls remain outside `src/lib/log.ts`, all in `src/pages/dashboard.astro:68,77,82,101,126`; `no-console` is `"warn"` (`eslint.config.js:25`), so nothing fails on a new one. The S-08 plan deferred them on purpose (`context/archive/2026-10-02-observability-swallowed-errors/plan.md:45`).
- "Applied migrations are immutable" and the backward-compatibility rule (`lessons.md:77-82`) exist as prose only. `src/types.ts` has no freshness check. The only required check on `master` is `integration` and the ruleset has no bypass actor, so a guard is enforceable only if it fails that job.
- 2 of the 13 data routes are imported by a test; no test imports the group and task error mappers, `group-rules`, `join-code` or `checkoff-response`; six anonymous assertions in `tests/integration/group-isolation.test.ts` accept more than the database does.
- Group name, task title, recurrence list and join-code format exist in SQL and in TS; the recurrence list is checked by a regex over a migration file (`tests/unit/task-rules.test.ts:52-61`).
- `SELECT` and `DELETE` for `authenticated` on `groups`, `group_members` and `tasks` come from platform default privileges, not from a migration.
- Structural claims of the research were verified with ast-grep (last section of `research.md`): none refuted, two numbers corrected, and several findings that shaped this plan (see Key Discoveries).

## Desired End State

- No bare `console.*` call is left in `src` outside the helper, the dashboard reports its failed loads as `dashboard.*` events, and a new `console.*` call fails lint.
- A PR fails the required `integration` job when it edits, deletes or renames a merged migration (comment-only edits and a single-use, hash-bound allowlist entry excepted), when a new migration with a destructive statement lacks a `-- compat:` marker, when a new migration sorts before the newest merged one, or when `src/types.ts` differs from a fresh generation.
- Mappers, normalisers, the check-off response helper and all 13 data routes have characterization tests, a new route without rows turns the suite red, and the anonymous denials are asserted as exactly `42501`.
- The rules duplicated in SQL and TS are pinned by behaviour-based contract tests against the real database.
- The table-level privileges of `authenticated` and `anon` are in a migration and pinned in both directions by an RLS scenario.
- Verify: `npm run lint`, `npx astro check`, `npm test` and `npm run test:rls` pass on `master` after each phase, and the CI run of every phase PR is green.

### Key Discoveries:

- Only `integration` is required (`gh api repos/mariuszzlotucha/streak-board/rulesets/24254172`: `required_status_checks: [integration]`, `bypass_actors: []`, `strict_required_status_checks_policy: false`), and a failed `changes` job does not stop `integration` (`ci.yml:91`: `!cancelled()`, an empty output is not `'false'`). A guard in `changes` would be advisory, so the guards go into `integration` (research verification V27).
- `npm run deps` (dependency-cruiser) is defined at `package.json:17` and referenced nowhere in `.github/`, `.husky/`, `README.md` or `CLAUDE.md`, and dependency-cruiser does not parse `.astro` (`.dependency-cruiser.cjs:2`); ESLint is the enforceable tool (V26). Relevant to the deferred route skeleton, not to this plan.
- `vitest.config.ts:14` registers a `globalSetup` that needs the local stack (`tests/setup/global-setup.ts:103-110`): every `npm test` run, unit files included, needs `supabase start`; in CI the new suites run in the required `integration` job (V25).
- `tests/helpers/supabase.ts:164-165` registers `afterEach(cleanupGroups)` and `afterAll(cleanupUsers)` at import, so suites that do not use the database must not import it.
- The anonymous role gets HTTP 401 with SQLSTATE `42501` for `SELECT` on `groups`, `group_members`, `tasks`, `INSERT` on `groups` and the three RPCs (`join_group`, `list_group_members`, `preview_group`); probed against the local PostgREST at planning time. The `null` branch of the current assertions is never taken.
- `normalizeGroupName` and the database CHECK agree on 15 boundary cases (empty, space, tab, CRLF, NBSP, EM SPACE, VT, FF, one character, 80 and 81 ASCII, 80 and 81 emoji, padded 80 and 81; psql evaluation of the CHECK against the TS function). One real drift exists: a NUL character is accepted by the TS normalisers (`trimGroupName` trims only space, tab, CR and LF) and rejected by PostgREST with HTTP 400 and `22P05` ("unsupported Unicode escape sequence"), both for a group name and for a task title (both probed on the database side); the routes map it to `unknown`.
- The `-- compat:` heuristic (a `drop`, `alter policy`, `alter … rename`, or a `revoke` on an object created by an earlier file) flags exactly two of the seven existing migrations, `20260925011727_harden_group_rls.sql` and `20261001120000_harden_table_privileges.sql`; the other five revoke only objects they create themselves (read from the statements, not yet run; the Phase 2 fixture test pins it).
- `supabase db push --include-all` ("Include all migrations not found on remote history table", `npx supabase db push --help`) suggests that `db push` refuses a local migration older than the newest applied one [I]; research Open Question 8 is still untested, so Phase 2 adds an exact ordering rule instead of relying on the CLI.
- `supabase gen types typescript --local | prettier --stdin-filepath src/types.ts | diff -u src/types.ts -` gives a 0-line diff at HEAD; the lockfile resolves `supabase@2.117.0`, equal to the `supabase/setup-cli` pin in `ci.yml`. `gen types --local` runs a one-off container with the pg-meta image (the debug trace shows a `node` process connecting to the database), while the CI stack start excludes the `postgres-meta` service (`ci.yml:104`).
- Table-level privileges today, from `information_schema.role_table_grants`: `authenticated` has `DELETE,SELECT` on `groups`, `group_members`, `tasks`, `task_participants`, `task_checkoffs` and `SELECT` on `task_checkoff_periods`; `anon` has no row.
- Patterns to copy: mocked route tests with a hand-built `APIContext` (`tests/integration/groups-join-route.test.ts:7-35`), a small chainable fake client (`tests/unit/checkoffs-reporting.test.ts:13-21`), SQL scenario helpers `rls_check.expect_value` and `expect_error` (`supabase/checks/rls-scenarios.sql:89-142`), manual break-and-restore mutation checks (`context/foundation/test-plan.md:169-179`).
- The 13 routes have two kinds of behaviour: 8 uniform ones (`groups/{create,rename,delete}`, `tasks/{create,update,delete,join,leave}`) and 5 with their own logic (`groups/{join,leave,remove-member}` with cookie handling, a post-read and a self-guard; `tasks/{checkoff,uncheck}` with a JSON path chosen by the `Accept` header).

## What We're NOT Doing

- OPP-7 (a shared route skeleton), OPP-6 (an info trace on the six zero-row branches, which reopens a deliberate decision of S-01, S-02 and S-08) and OPP-8 (one Supabase client per request through `locals`): deferred as one chain. Triggers: a 14th data route is added or review finds a route that does not report a returned error (OPP-7, OPP-6); production shows `42501` or `forbidden` right after a token refresh, or the hosted refresh-token reuse window turns out to be short (OPP-8). Phase 3 is the safety net that chain needs; each would open its own change with `/10x-new`.
- OPP-10 (protect every `/api/*` path except `/api/auth/*`): it changes the answer for unknown API paths from 404 to a redirect, so it is a separate behaviour change. Trigger: a new `/api/*` route family is added.
- OPP-9 (an "old code against new schema" release gate and Playwright in CI): owned by S-10 (`context/foundation/roadmap.md:148-160`, `context/foundation/test-plan.md:80,125`). The Phase 2 guards cover three exact or heuristic checks, not that gate. S-10 also overlaps Phases 3 and 4 (unit tests for logic without tests, rule modules): this plan does them first and S-10's research should treat their output as existing. No roadmap edit: this change has no roadmap row and each change edits only its own rows of shared docs.
- A 503 for essential dashboard load failures (audit finding G5): a behaviour change that fits S-11.
- Replacing the hard-coded row cap with a count-based truncation check (OPP-4 option B): not verified against the installed supabase-js.
- An ESLint `no-restricted-imports` rule against direct `@/lib/supabase` imports from routes: belongs with the route skeleton.
- Fixing the NUL drift, the `prerender = false` chore on three auth routes, or any change to an existing migration (the Phase 2 guard forbids it).
- Mutation runs with Stryker on the rule modules (S-10); this plan uses manual break-and-restore checks.
- Editing `CLAUDE.md` (it defers CI jobs and scripts to the README, which Phase 2 updates) and `roadmap.md`.
- The items the research found not worth a refactor: D2, D3, D6, D9, D16, D18, D20, D21 and the test gaps T6, T8, T12, T13.

## Implementation Approach

Five phases, independent in code and ordered only by their criteria (Phase 5's rows 5.3 and 5.4 use scripts that Phase 2 adds), each reverted by reverting its merge. The order is by self-containment and value, not by cost: OPP-2 first (small, fully self-contained, a deferred gap), then the CI guards (costlier than Phases 4 and 5 [I], but the only items that cut a production-side risk, and from Phase 2 on they check every later PR, the Phase 5 migration included), then the two test phases, then the grants, which are cheap but the least self-contained (the only phase that ships a migration and needs the owner's hosted query, a release approval and, for two rows, the Phase 2 scripts). The order differs from the research ranking, which put OPP-1 second because it gates the structural chain; with that chain deferred the argument no longer applies and value puts the guards first. Phases 3 and 4 only add tests, so `src` stays untouched there (a criterion checks it); behaviour is pinned as it is today, including the quiet zero-row branches. Two rules apply where a phase needs them: code that no test covers (only the dashboard page, in Phase 1) is edited only after its current answers are recorded, and enforcement that is not itself a test (the lint rule in Phase 1, the CI steps in Phase 2) is switched on in its own commit after what it checks passes; the tests of Phases 3 to 5 are checks of their own and need no separate switch.

Per `context/foundation/lessons.md`: each phase runs on its own branch `refactor-opportunities/phase-<N>` cut from a fresh `master` (no roadmap id), commits are in English, `/10x-impl-review refactor-opportunities phase <N>` is triaged before the branch is pushed, and the PR is opened with `gh pr create`. Inside Phases 1 to 4 every logical step is its own commit, so a step can be reverted separately; a step that later ones depend on (the page before the lint rule, a script before its CI step) is reverted after them. Run the phases one at a time: every phase uses the local stack for tests or manual checks and only one session may run database-backed commands at a time (`context/foundation/lessons.md:119-124`), and Phase 2 is the only one that edits `ci.yml`. Every merge to `master` queues a `release` run that waits for approval in `production` (`.github/workflows/ci.yml:112-118`): approve it for Phases 1 and 5, which change what is deployed; for Phases 2 to 4 (the same Worker) approve it or let a newer push supersede it (`README.md:211`).

## Critical Implementation Details

- **State sequencing.** The migration and types guards are steps of the `integration` job, not of `changes`, and the migration guard runs before the stack starts so it fails fast. It needs the base ref, so the job's checkout uses `fetch-depth: 0`, as the `changes` job already does, and it runs on pull requests only.
- **Debug & observability.** `types:check` needs the pg-meta image in CI, and the stack start excludes the `postgres-meta` service (`ci.yml:104`); `gen types --local` is expected to pull the image itself. If the step fails on an image or connection error in the phase PR, remove `postgres-meta` from the `-x` list of the `integration` job only.
- **Timing & lifecycle.** The Phase 5 migration reaches production only through the `release` job after approval in the `production` environment. Do not apply it by hand and do not edit any older migration to describe it.

## Phase 1: Dashboard load failures through the log helper (OPP-2)

### Overview

Report the five failed dashboard loads through `src/lib/log.ts` instead of bare `console.error`, so they reach the Workers log and Sentry with request ids, and make `no-console` an error so the convention is enforced. The HTTP response stays the same: 200 with the same banners and degraded sections. No automated test can cover the page, so what it answers today is recorded first (item 0) and the manual rows compare against that baseline. Three commits in this order: the page, the lint rule (it turns the convention on only after nothing violates it, and is reverted before the page), the docs.

### Changes Required:

#### 0. Baseline of the page (before the first edit)

**File**: none (the captures stay outside the repository, for example in a scratch directory)

**Intent**: Pin what `/dashboard` answers today in every state this phase touches, because no automated test can cover an `.astro` frontmatter; the manual rows then compare against recorded output instead of memory.

**Contract**: on the fresh phase branch, before `dashboard.astro` is edited, with the local stack up, no other session using it and a signed-in test user who is in a group with at least one task (the secondary reads run only for a group member, `src/pages/dashboard.astro:53`), save the status code and the HTML of `GET /dashboard` in five states: all reads healthy; PostgREST stopped; `select` revoked on `public.tasks`; on `public.task_participants`; on the view `public.task_checkoff_periods` (the injections of rows 1.6 and 1.7, each undone before the next one is applied; the `tasks` revoke also fails the participants and check-off reads, because their policies and the security-invoker view read `tasks`, so that state shows all three secondary reads down). After the edit repeat the same five captures and `diff` each against its baseline, on the same Warsaw day because the board is computed from `new Date()` (`src/pages/dashboard.astro:94`). Equal means an empty diff; a value that differs on every run (for instance a cache-busting query string from the dev server [I]) is masked identically in both runs and named in the PR; any other difference is a regression of this phase.

#### 1. Dashboard frontmatter

**File**: `src/pages/dashboard.astro`

**Intent**: Replace each `console.error` with `reportError` and drop the five `eslint-disable-next-line no-console` comments; the flags and messages the page sets (`tasksFailed`, `participantsFailed`, `checkoffsFailed`, `loadFailed`, `error`) stay exactly as they are.

**Contract**: `reportError(event, cause, requestFields(Astro))` with events `dashboard.tasks.failed` (`tasksResult.reason`), `dashboard.participants.failed` (`participantsResult.reason`), `dashboard.checkoffs.failed` (`checkoffsResult.reason`), `dashboard.leaderboard.failed` (`boardError`, the compute throw) and `dashboard.load.failed` (`loadError` in the outer catch), following the `<area>.<action>.<outcome>` convention of the README. Nothing but the helper's own fields goes into the context: no e-mail, cookie, body or invite code (`pendingCode` is not passed). `Astro` satisfies the helper's structural parameter because `AstroGlobal extends APIContext` (`node_modules/astro/dist/types/public/context.d.ts:14,422,583`); if `astro check` disagrees, pass `{ request: Astro.request, routePattern: Astro.routePattern, locals: Astro.locals }`. A failed members read or any unexpected throw ends in the outer catch and reports `dashboard.load.failed` once; the three secondary reads report independently, at most one event each per request, and `dashboard.leaderboard.failed` can only fire when all three succeeded.

#### 2. Lint rule

**File**: `eslint.config.js` (own commit)

**Intent**: Turn the README rule "never a bare `console.error`" into a lint failure, now that nothing in `src` violates it.

**Contract**: `no-console` goes from `"warn"` to `"error"` in the base config (`eslint.config.js:25`). `src/lib/log.ts` keeps its block and line disables, `scripts/**/*.mjs` keeps `no-console: off`, and `tests/` has no direct `console` call (only `vi.spyOn`).

#### 3. Docs

**File**: `README.md` (Observability section)

**Intent**: Say that the dashboard reports through the helper with `dashboard.*` events and that a bare `console` call in `src` now fails lint.

**Contract**: one added sentence in each of the "Event names" and "Adding a Supabase call" bullets; no other section changes. The first says that dashboard events are all `.failed` because the data helpers rethrow returned errors (`src/lib/groups.ts:22`, `src/lib/tasks.ts:20`), so the page cannot tell them from thrown ones; the second says that a bare `console` call in `src` now fails lint.

### Success Criteria:

#### Automated Verification:

- No bare console call remains outside the helper: `grep -rnE 'console\.(error|warn|log|info|debug)' src --include='*.ts' --include='*.tsx' --include='*.astro' | grep -v 'src/lib/log.ts'` prints nothing
- Lint passes with `no-console` as an error: `npm run lint`
- Type check passes, which confirms `requestFields(Astro)` compiles: `npx astro check`
- Existing suites stay green: `npm test`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With the local stack up, the baseline of item 0 recorded and no other session using the stack, stop PostgREST (`docker stop supabase_rest_10x-astro-starter`) and load `/dashboard` as the same test user: the status code and the HTML equal the baseline of that state (the same "Something went wrong" banner as before), and the dev server output carries exactly one `dashboard.load.failed` error line with `route`, `userId`, `ray` and the cause; start the container again and see the page equal the healthy baseline
- For each secondary read in turn, as the same test user (a group member, because the secondary reads run only for one), run `revoke select on public.tasks from authenticated`, then the same for `public.task_participants` and the view `public.task_checkoff_periods`, reload `/dashboard` and see the matching `dashboard.tasks.failed`, `dashboard.participants.failed` or `dashboard.checkoffs.failed` line with code `42501` (the `tasks` revoke fails all three reads, because the policies of `task_participants` and `task_checkoffs` and the security-invoker view read `tasks`, so expect all three lines there and the Tasks card hidden; the other two revokes fail only their own read) and a status code and HTML equal to the baseline of that state; restore each grant right after (`grant select on … to authenticated`) and see the page equal the healthy baseline
- No e-mail, cookie, request body or invite code appears in any of the new lines, and `dashboard.leaderboard.failed` is checked by reading the call site unless some real data makes the compute throw (record which in the PR)
- After the merge and the owner's approval of the `release` run, `/dashboard` loads on the production URL for a signed-in user as before (the new events appear only when a read fails)

**Implementation Note**: No automated test can cover an `.astro` frontmatter in the current stack, the same limit the S-08 plan accepted; the baseline of item 0, recorded before the first edit, and the manual fault injection above are the verification. After the automated checks pass, pause for the human to confirm the manual ones. Row 1.9 needs this PR's own merge and release, so it is not confirmed with the others: it is ticked after the release, in a small closing docs PR (as rows 5.9 to 5.11 are) or in the next phase's PR, never before the production check.

---

## Phase 2: CI guards for the migration and code seam (OPP-3)

### Overview

Three guards in the required `integration` job: merged migrations stay immutable, a destructive new migration carries a `-- compat:` marker, and `src/types.ts` equals a fresh generation. The first two live in one script (rules: immutability, marker, and an ordering rule that keeps a new migration newer than every merged one) with unit tests; the third is one npm script and one CI step. Mechanism and enforcement are separate steps. Five commits, in this order: the migration guard with its tests (nothing runs it in CI yet); the two npm scripts `guard:migrations` and `types:check` (both pass locally, nothing is enforced yet); the CI step that runs the migration guard (immutability, marker and ordering), which switches that enforcement on; the CI step that checks the generated types, its own commit because the pg-meta image in CI is the least verified part and the step can then be adjusted or reverted without switching the migration guard off; the docs and lesson. A CI commit is added only after its script passes locally (rows 2.3 and 2.4), so the first red CI run is a real finding and not a wiring error, and reverting a CI commit alone switches that guard off.

### Changes Required:

#### 1. Migration guard script

**File**: `scripts/migration-guard.mjs` (new)

**Intent**: One script with pure, exported functions and a thin CLI that compares the working tree with the PR's base and fails on the migration rules.

**Contract**: `node scripts/migration-guard.mjs --base <ref>` (default `origin/master`) reads `git diff --name-status --find-renames <ref>...HEAD -- supabase/migrations`; exit 0 passes, exit 1 prints violations as `::error file=…::` annotations and each used exception as a `::warning file=…::` annotation. `--entry <migration file>` prints the allowlist line for the file's current content, with the literal `<reason>` (under 20 characters) as the reason, so a line committed without editing it fails the length rule.

- Immutability: `A` is fine; `D` and `R*` always fail and cannot be allowlisted (the hosted history records the version, a missing file breaks `db push`); `M` passes when the file differs from the base only in comments and blank lines (comparison normalises line endings and trailing whitespace, and strips `--` comments outside single-quoted strings) and otherwise fails unless an allowlist entry authorises it.
- Allowlist `supabase/checks/migration-edit-allowlist.txt`: one line per exception, `<migration file name> <sha256 of the edited file> <reason of at least 20 characters>`; `#` lines and blank lines are ignored. Rules against abuse: the file is append-only (the base file's lines must be an unchanged prefix of HEAD's); an entry counts only if it is new in this PR, its hash equals the sha256 of the migration at HEAD, and the file is an `M` change that is not comment-only; an entry that matches no such edit is itself a violation (no pre-authorisation, no stale entry); every used entry prints a warning with file and reason. A later edit of the same file needs a new entry because the hash changes.
- Marker: for each `A` migration F, flag a `drop` statement of any object, `alter policy`, an `alter … rename`, or a `revoke` whose target (table, view or function; `all tables in schema` counts) is created by a migration that sorts before F by file name. A flagged F needs one line `-- compat: <non-empty text>` anywhere in the file. This is a heuristic that prompts the author; it proves nothing about compatibility and the message says so.
- Ordering: an `A` migration must sort after every migration at the base ref; otherwise a violation that says to rename it to a newer timestamp (the file is new in the PR, so a rename is free; `supabase db push` is expected to refuse a file older than the newest applied one [I], research Open Question 8). The rule sees the base at the time `integration` runs, and the ruleset does not require branches to be up to date (`strict_required_status_checks_policy: false`), so a PR whose last run predates the merge of another migration is not re-checked: update the branch (re-run `integration`) before merging a migration PR when another migration has merged since. A merged out-of-order file cannot be renamed or deleted past the guard; the owner applies it with `supabase db push --include-all` (credentialed, by hand, never through the chat) [I].
- Typing: every export carries JSDoc (`@param`, `@returns`): `allowJs` is on, but the test that imports the script is linted with `strictTypeChecked` while `scripts/**/*.mjs` have type checking disabled (`eslint.config.js:76-81`), so untyped exports would trip the `no-unsafe-*` rules.

#### 2. Guard tests

**File**: `tests/unit/migration-guard.test.ts` (new)

**Intent**: Pin every rule and every abuse case, and prove the whole path once against a real git repository.

**Contract**: pure-function cases with in-memory strings: comment-only edit passes, statement edit fails, delete and rename fail even with an entry, an entry already present at base authorises nothing, a wrong hash, a reason under 20 characters (the unedited `--entry` placeholder included), a non-append-only change, an entry for an unedited file and an entry for a comment-only edit all fail, a valid new entry passes with a warning; marker cases for `drop policy`, `alter policy`, a rename and a `revoke` on an earlier table (flagged), a `revoke` on the migration's own table or function (not flagged), a marker with and without text; an added migration older than the newest at base fails and a newer one passes. A fixture test over a fixed list of the seven migration file names at `c9f6451` (not a directory glob, which the first later migration that is flagged and carries a marker would turn red) asserts that exactly `20260925011727_harden_group_rls.sql` and `20261001120000_harden_table_privileges.sql` need a marker (stable because merged migrations are immutable). One end-to-end test builds a throwaway repository in `os.tmpdir()` (base commit, then a comment edit, a statement edit, an allowlisted edit with the right hash, and an added destructive migration without a marker) and asserts the exit codes; the repository gets its own git identity (`-c user.name` and `-c user.email`, or `GIT_AUTHOR_*` and `GIT_COMMITTER_*`) because a CI runner has none.

#### 3. npm scripts

**File**: `package.json` (own commit, before any CI step)

**Intent**: Give the guard and the types check one local command each, the same one CI runs.

**Contract**: `guard:migrations` is `node scripts/migration-guard.mjs`; `types:check` is `supabase gen types typescript --local | prettier --stdin-filepath src/types.ts | diff -u src/types.ts -` (both binaries resolve from `node_modules/.bin`; it exits non-zero with a unified diff when the file is stale, and a failed generation also ends in a non-empty diff).

#### 4. CI wiring

**File**: `.github/workflows/ci.yml` (`integration` job; two commits, one per step, each after its script passes locally)

**Intent**: Switch the enforcement on, in the job where a failure blocks the merge.

**Contract**: the checkout of `integration` uses `fetch-depth: 0`; a step `Check migrations` runs `npm run guard:migrations -- --base "origin/$BASE_REF"` with `BASE_REF: ${{ github.base_ref }}`, only when `github.event_name == 'pull_request'`, before `Start local Supabase`; a step `Check generated types are fresh` runs `npm run types:check` after the stack is up and, on failure, prints the regeneration command (`npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`). The steps stay out of `changes`, which is not required (see Key Discoveries).

#### 5. Docs and lesson

**File**: `README.md`, `context/foundation/test-plan.md`, `context/foundation/lessons.md`

**Intent**: Record the guards where authors look and capture the placement rule so the next CI guard does not repeat the mistake.

**Contract**: `README.md` CI section lists the two steps and the backward-compatibility paragraph (`README.md:233`) names the immutability rule, the `-- compat:` marker, the ordering rule with its limit (update the branch before merging a migration PR after another migration merged, and the owner's `supabase db push --include-all` recovery for a merged out-of-order file) and the allowlist flow; `test-plan.md` §5 marks the "migration/code consistency check" row as partly wired (immutability, marker, ordering, types) with the old-code-against-new-schema gate still pending, and §6.5 replaces its "TBD" with how to write a compatible migration and which commands to run; `lessons.md` gets one appended entry in the existing format: enforcement steps belong inside the job that holds the required check, because a failed `changes` job does not stop it.

### Success Criteria:

#### Automated Verification:

- Guard unit tests and the end-to-end guard test pass: `npm test`
- Lint passes, the script included: `npm run lint`
- The guard passes on this branch against master: `npm run guard:migrations -- --base origin/master`
- The generated types are fresh locally: `npm run types:check`
- Type check passes: `npx astro check`

#### Manual Verification:

- On a scratch local branch that is never pushed: a statement edit in an existing migration makes the guard exit 1, a comment-only edit exits 0, a new migration with `drop policy` and no marker exits 1 and passes with `-- compat: <reason>`, a new migration with a timestamp older than the newest at base exits 1, an allowlist line from `--entry` passes with a warning, and copying a line that is already at base, or editing the file again, exits 1
- Changing one identifier in `src/types.ts` locally makes `npm run types:check` exit 1 with a diff; restore the file
- With the owner's go-ahead, a draft PR from a scratch branch that edits a statement of `20260925011727_harden_group_rls.sql` shows `integration` failing with the annotation and the merge blocked; close it unmerged and delete the branch
- README, `test-plan.md` and the new `lessons.md` entry read correctly
- After the PR is open, all its checks pass with both new steps: `gh pr checks` shows `integration`, `ci` and `smoke` passing

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase.

---

## Phase 3: Characterization net for the data routes (OPP-1)

### Overview

Pin today's behaviour of the error mappers, the input normalisers, the check-off response helper and all 13 data routes, and make the anonymous assertions exact, before anyone changes any of them. Tests only: no file under `src/` changes. Three commits, each revertible alone: the pure unit tests, the exact anonymous assertions, the fake client with the route suite.

### Changes Required:

#### 1. Pure unit tests

**File**: `tests/unit/group-errors.test.ts`, `tests/unit/task-errors.test.ts`, `tests/unit/group-rules.test.ts`, `tests/unit/join-code.test.ts`, `tests/unit/checkoff-response.test.ts` (new)

**Intent**: Pin the documented behaviour with oracle values written from the code comments, the SQL rules and the README, not by running the code.

**Contract**: `toGroupErrorCode` maps `23514`, `23505`, `P0002`, `42501` to `invalid_name`, `already_in_group`, `invalid_code`, `forbidden` and anything else, including a missing code, to `unknown`; `resolveGroupError` and `resolveTaskError` return a message only for own keys (`__proto__`, `toString`, `constructor`, an unknown value and `null` give `null`) and `groupErrorMessage` covers every code; `toTaskErrorCode` maps `23514` to `invalid_title` and delegates the rest. `normalizeGroupName` and `trimGroupName`: non-string, empty and whitespace-only give `null`, only space, tab, CR and LF are trimmed (NBSP is not), 80 code points pass and 81 fail for ASCII and for emoji, the trimmed value is returned. `normalizeJoinCode`: a bare code, an uppercase code, a pasted invite link with trailing slash, query or hash, 1 and 64 characters pass, 65, non-hex and empty fail. `normalizeUuid`: canonical lower and upper case give lowercase, braced, hyphenless and non-string give `null`. `join-code`: `rememberJoinCode` ignores an invalid code, `peekJoinCode` drops a forged cookie value, `clearJoinCode` repeats the path `/` (with a cookie stub). `checkoffResponse`: every failure kind and `ok` in both modes, with the statuses and the `Cache-Control: no-store` header of the JSON path and the redirect targets of the other, and `Accept` matched case-insensitively and as a substring.

#### 2. Exact anonymous assertions

**File**: `tests/integration/group-isolation.test.ts`

**Intent**: Make the six anonymous assertions as strict as the database is, so a different error or a silent empty result fails.

**Contract**: lines 193, 197 (`toSatisfy` accepting `null` or `RLS_VIOLATION`) and lines 203, 227, 231, 235 (`not.toBeNull()` on the error) assert `error.code === "42501"` and `data === null`; the positive controls at lines 188-189 and 214-223 stay.

#### 3. Fake client

**File**: `tests/helpers/fake-supabase.ts` (new)

**Intent**: One chainable, thenable stand-in for the supabase-js client, written against the call chain and not against route internals, so the same suite stays valid if a route is restructured later.

**Contract**: `createFakeSupabase(script)` returns `{ client, calls, remaining }`; `script` is a list of `{ data?, error?, status? }` results consumed in the order the route awaits queries (a `maybeSingle()`, `single()`, a chain awaited directly, and `rpc()` each consume one); every other method returns the chain; an await beyond the script throws a descriptive error, and `remaining()` lets a test assert that no scripted result was left over; `calls` records the table or rpc name and the method chain with its arguments. The file must not import `tests/helpers/supabase.ts` (it registers database cleanup hooks on import).

#### 4. Route suite and coverage guard

**File**: `tests/integration/data-routes.test.ts` (new)

**Intent**: One table-driven suite for the 13 routes in `src/pages/api/groups` and `src/pages/api/tasks`, plus a test that fails when a route has no rows.

**Contract**: rows are `{ name, route, form?, headers?, script, locals?, client?, expect }` with descriptive names used as test titles; `createClient` is mocked as in `groups-join-route.test.ts:7`, the context is hand-built (`request`, `routePattern`, `locals`, `cookies` spies, `redirect`), `console.error` and `console.info` are spied. Dimensions, where a route has them: anonymous gives a redirect to `/auth/signin` with no client and no report; invalid input gives the documented redirect before any client is created (and, for `checkoff` and `uncheck`, the `*.invalid_id` info line with the `invalid` response); a null client gives `not_configured` after validation; a mutation error gives the mapped code with the report policy (`42501` is an error line with `outcome: forbidden`, a domain code is quiet, `XX000` is an error line with `outcome: unknown`, and `status` is carried); an empty result gives today's response with no report (this pins the quiet zero-row branches as they are); pre-read results (`getMyGroup` null, `getTask` null, `taskExists` false) give the documented response; any thrown error or a non-form body gives the `<route>.exception` line and `unknown`; cookie effects (`groups/create` and `groups/join` clear the join cookie as today); the JSON mode of `checkoff` and `uncheck`; and the recorded call chain once per route. Each script must be consumed exactly. The clock is pinned for every row (`vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime(...)`, restored in `afterEach`), because `checkoff.ts:37` and `uncheck.ts:39` read `new Date()` and the resulting `period` is part of the JSON body and of the call chain: the instant is chosen so that its Warsaw day differs from its Los Angeles day (`vitest.config.ts:12` fixes `TZ=America/Los_Angeles`), and the `checkoff` and `uncheck` rows carry the expected `period` (the day for daily, the Monday key for weekly). The guard test lists `*.ts` files in the two route directories and requires each to appear in the table. `groups-join-route.test.ts` and `tasks-create-route.test.ts` stay unchanged, because they pin report fields and secret scrubbing in more detail; the table includes those two routes for uniform coverage.

### Success Criteria:

#### Automated Verification:

- New unit and route suites pass together with the existing ones: `npm test`
- Tests are linted and type-checked: `npm run lint && npx astro check`
- No source file changed: `git diff --stat origin/master...HEAD -- src` prints nothing

#### Manual Verification:

- Break-and-restore checks (restore with `git checkout -- <file>`), each making at least one test red: the name limit in `src/lib/group-rules.ts` set to 81; the `42501` and `23505` cases swapped in `src/lib/group-errors.ts`; the zero-row redirect in `src/pages/api/groups/rename.ts:41` changed to `/dashboard`; the `reportError("uncheck.failed", …)` call removed from `src/pages/api/tasks/uncheck.ts:41`
- The coverage guard goes red when an empty `src/pages/api/tasks/probe.ts` is added and green again when it is deleted
- The row names read as sentences and a red row names its route and case

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase.

---

## Phase 4: Contract tests for rules duplicated in SQL and TS (OPP-5)

### Overview

Replace the regex over a migration file with behaviour-based contract tests against the real database, and cover the rules that exist twice: group name, task title, recurrence list and join-code format. Tests only. Two commits: the contract suite, then the removal of the regex test.

### Changes Required:

#### 1. Contract suite

**File**: `tests/integration/rule-contracts.test.ts` (new)

**Intent**: For each boundary input assert that the TS rule and the database agree, using the real insert path of a signed-in client, so drift on either side turns CI red.

**Contract**: group name, equal acceptance for the 15 cases verified at planning: accepted are NBSP, EM SPACE, VT, FF, one character, 80 ASCII, 80 emoji and 5 spaces plus 80 characters plus 2 tabs; rejected are empty, space, tab, CRLF, 81 ASCII, 81 emoji and the padded 81 (the insert sends the normalised value when TS accepts and the raw input when it rejects, as the route does). Task title: the same NBSP, emoji and padding cases through a group and creator. Recurrence: `once`, `daily` and `weekly` are accepted by the database and by `normalizeRecurrence`; `monthly`, `Daily`, an empty string and `" once"` are rejected by both, the database with `23514`. Join code: the code generated by `createGroupAs` is lowercase hex and `normalizeJoinCode(code) === code`, the same code inside an invite link with a query and a hash normalises back, `join_group` accepts the normalised code for a second user, and an unknown well-formed code answers `P0002`. Known drift, pinned as it is and not fixed: a NUL character is accepted by `normalizeGroupName` and `normalizeTaskTitle` and rejected by PostgREST with HTTP 400 and `22P05`; the test is named as a known drift and says that rejecting NUL in the TS normalisers changes behaviour and is a separate change (if that is ever done the test turns red and becomes an equivalence row). Mechanics: follow the helper pattern of `context/foundation/test-plan.md:178`: one user per file (`beforeAll`), accepted cases through `createGroupAs` and `createTaskAs` (they track the ids, and `afterEach(cleanupGroups)` frees the owner, who can own only one group), and a raw insert only for rejected cases, because nothing is created; an untracked group would make `afterAll(cleanupUsers)` fail on `owner_id … on delete restrict`.

#### 2. Remove the regex test

**File**: `tests/unit/task-rules.test.ts` (own commit)

**Intent**: Drop the check that reads a migration file by name and parses it with a regex, now that the contract suite covers the same list through the database.

**Contract**: remove the `matches the values allowed by the database CHECK` test (`:52-61`) and the then unused `node:fs` and `node:url` imports; the other tests in the file stay.

### Success Criteria:

#### Automated Verification:

- Contract tests pass: `npm test`
- The regex-on-SQL test is gone: `grep -n "_create_tasks.sql" tests/unit/task-rules.test.ts` prints nothing
- Lint and type check pass: `npm run lint && npx astro check`
- No source file changed: `git diff --stat origin/master...HEAD -- src` prints nothing

#### Manual Verification:

- TS-side break-and-restore checks, each turning a contract test red: `MAX_GROUP_NAME_LENGTH` set to 81 in `src/lib/group-rules.ts`; NBSP (U+00A0) added to the trim set; `"monthly"` added to `TASK_RECURRENCES`
- SQL-side check on the local database only, with the owner's go-ahead because it ends in `npx supabase db reset`: in a scratch migration weaken `groups_name_length` to `between 1 and 81`, apply it, see `npm test` go red, then restore with `npx supabase db reset` (the procedure of `context/foundation/test-plan.md:179`)

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones before the next phase.

---

## Phase 5: Explicit table grants (OPP-4)

### Overview

Move the table-level privileges the app already depends on from platform defaults into a migration and pin the full table-level privilege picture in both directions with an RLS scenario. The migration is a no-op where the privileges exist, so production behaviour does not change; the phase ends with a production release and the owner's check of the hosted database.

### Changes Required:

#### 1. Grant migration

**File**: `supabase/migrations/<timestamp>_grant_core_table_privileges.sql` (new, created with `npx supabase migration new grant_core_table_privileges`)

**Intent**: Make `SELECT` and `DELETE` for `authenticated` on `groups`, `group_members` and `tasks` explicit; today they come from default privileges and `20261001120000_harden_table_privileges.sql:16-17` only says they are "kept untouched".

**Contract**: `grant select, delete on public.groups, public.group_members, public.tasks to authenticated;` with a header comment that says these are the privileges the deployed code already uses (idempotent, backward compatible, non-destructive, so no `-- compat:` marker is needed). The timestamp sorts after `20261002090000`.

#### 2. Privilege scenario

**File**: `supabase/checks/rls-scenarios.sql`

**Intent**: Fail when a privilege is missing or when an extra one appears, instead of relying on defaults.

**Contract**: a new `do $$ … $$` block before the summary, run as postgres, using `rls_check.expect_value` over `information_schema.role_table_grants` for schema `public`: `authenticated` has exactly `DELETE,SELECT` on `groups`, `group_members`, `tasks`, `task_participants` and `task_checkoffs` and exactly `SELECT` on the view `task_checkoff_periods` (six assertions), and `anon` has no table-level grant in the schema (one assertion, count 0). Column-level grants are outside this scenario.

#### 3. Docs

**File**: `README.md`, `context/changes/deployment/deployment-plan.md`

**Intent**: Record what the scenarios now assert and the production result of this phase.

**Contract**: the `README.md` paragraph on RLS scenario checks (`README.md:192`) lists the privilege table; `deployment-plan.md` gets a `Phase 13` entry in the format of Phases 11 and 12 with the date, the applied migration, the owner's hosted query result and the live check.

### Success Criteria:

#### Automated Verification:

- RLS scenarios pass including the new block, reporting 7 more assertions than the 293 of the baseline: `npm run test:rls`
- Existing suites stay green: `npm test`
- Lint stays green, and so do the generated types once Phase 2 has landed (the migration changes no type; if Phase 5 runs first, only `npm run lint` applies until then): `npm run lint && npm run types:check`
- The Phase 2 guard accepts the new migration as an added, non-destructive file (requires Phase 2; if Phase 5 runs first, tick this row when Phase 2 lands): `npm run guard:migrations -- --base origin/master`

#### Manual Verification:

- Local mutation check: revoke `select, delete` on the three tables from `authenticated`, see `npm run test:rls` go red on the new block, apply the migration SQL and see it green again
- With the owner's go-ahead, a fresh-database check that wipes local data: `npx supabase db reset && npm run test:rls && npm test`
- The owner runs the hosted privilege query in the Supabase dashboard SQL editor (never through the chat) and the result matches the scenario table: `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1, 2 order by 1, 2;` returns the six `authenticated` rows and no `anon` row; a difference stops the phase for a re-plan
- After the PR is open, its CI run, which starts a fresh stack and applies every migration, is green: `gh pr checks`
- Release: after the merge, check that `supabase/migrations/` of the merge commit lists exactly the new migration, approve the `release` run in the `production` environment, and see the live check pass
- On the production URL: sign in, the dashboard shows the group and its tasks, tick a task and undo it
- Date, applied migration and result are noted in `context/changes/deployment/deployment-plan.md` as Phase 13
- Optional: the owner reads Project Settings, API, Max rows on the hosted project and records it in the PR (no change is planned)

**Implementation Note**: After the automated checks pass, pause for the human to confirm the manual ones, including the hosted query before the merge and the release approval after it. Rows 5.9 to 5.11 need this PR's own release, so they are ticked, together with the `deployment-plan.md` entry, in a small closing docs PR after the release (the pattern of `context/foundation/lessons.md:77-82` and the goal-run lesson).

---

## Testing Strategy

### Unit Tests:

- Phase 2: every rule and abuse case of the migration guard on in-memory strings, the real-migrations fixture (a fixed list of the seven names, exactly two need a marker) and one end-to-end run against a throwaway git repository.
- Phase 3: error mappers, input normalisers, `join-code` and `checkoffResponse`, with oracle values taken from comments, SQL rules and the README.

### Integration Tests:

- Phase 3: the 13-route table suite with the scripted fake client, run in the `integration` job; the six anonymous assertions are exact.
- Phase 4: contract tests against the local database through a signed-in client; the SQL scenario of Phase 5 runs in the same job.
- `scripts/smoke.mjs` is unchanged (no HTTP behaviour changes); CI runs it on every PR.

### Manual Testing Steps:

1. Phase 1: record the baseline of the page before the first edit, then inject faults on the dashboard reads (stop PostgREST, revoke one read grant at a time), compare each state with its baseline, read the log lines, restore.
2. Phases 2 to 4: break-and-restore checks, scratch-branch guard demos, and, with the owner's go-ahead, one draft PR that shows a red guard.
3. Phase 5: the hosted privilege query by the owner, the release approval and a production check of sign-in, the dashboard and one tick with its undo.

## Performance Considerations

CI time grows by the guard (seconds, before the stack starts), by `types:check` (one `gen types` run on a stack that is already up, plus a possible one-off image pull on first run) and by the new suites (a few seconds). The dashboard reports only on failure paths, so the request cost does not change when reads succeed.

## Migration Notes

Only Phase 5 touches the database: one additive `grant` that works with the code that is deployed now, applied by the gated `release` job (`db push` is idempotent and skips applied versions). A grant is undone by a later migration, never by editing this one; schema does not roll back with the code. The other phases need no data migration and are reverted by reverting their merge.

## References

- Related research: `context/changes/refactor-opportunities/research.md` (ranking, verification table V1-V28, Open Questions)
- Input analysis: `context/changes/data-access/research.md` (D1-D22, T1-T13)
- Deferred decisions: `context/archive/2026-10-02-observability-swallowed-errors/plan.md:39,42,43,45`
- Release path and ruleset: `.github/workflows/ci.yml:17-40,89-110,141-209`, `gh api repos/mariuszzlotucha/streak-board/rulesets/24254172`
- Rules: `context/foundation/lessons.md:77-82,133-145`, `context/foundation/test-plan.md:80,120-127,160-179`, `context/foundation/roadmap.md:148-173`
- Patterns: `tests/integration/groups-join-route.test.ts:7-35`, `tests/unit/checkoffs-reporting.test.ts:13-21`, `supabase/checks/rls-scenarios.sql:89-142`
- Code touched: `src/pages/dashboard.astro:68,77,82,101,126`, `eslint.config.js:25`, `src/lib/log.ts:88-130`, `supabase/migrations/20261001120000_harden_table_privileges.sql:16-17`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dashboard load failures through the log helper (OPP-2)

#### Automated

- [ ] 1.1 No bare console call remains outside the helper: `grep -rnE 'console\.(error|warn|log|info|debug)' src --include='*.ts' --include='*.tsx' --include='*.astro' | grep -v 'src/lib/log.ts'` prints nothing
- [ ] 1.2 Lint passes with `no-console` as an error: `npm run lint`
- [ ] 1.3 Type check passes, which confirms `requestFields(Astro)` compiles: `npx astro check`
- [ ] 1.4 Existing suites stay green: `npm test`
- [ ] 1.5 Production build succeeds: `npm run build`

#### Manual

- [ ] 1.6 With the local stack up, the baseline of item 0 recorded and no other session using the stack, stop PostgREST (`docker stop supabase_rest_10x-astro-starter`) and load `/dashboard` as the same test user: the status code and the HTML equal the baseline of that state (the same "Something went wrong" banner as before), and the dev server output carries exactly one `dashboard.load.failed` error line with `route`, `userId`, `ray` and the cause; start the container again and see the page equal the healthy baseline
- [ ] 1.7 For each secondary read in turn, as the same test user (a group member, because the secondary reads run only for one), run `revoke select on public.tasks from authenticated`, then the same for `public.task_participants` and the view `public.task_checkoff_periods`, reload `/dashboard` and see the matching `dashboard.tasks.failed`, `dashboard.participants.failed` or `dashboard.checkoffs.failed` line with code `42501` (the `tasks` revoke fails all three reads, because the policies of `task_participants` and `task_checkoffs` and the security-invoker view read `tasks`, so expect all three lines there and the Tasks card hidden; the other two revokes fail only their own read) and a status code and HTML equal to the baseline of that state; restore each grant right after (`grant select on … to authenticated`) and see the page equal the healthy baseline
- [ ] 1.8 No e-mail, cookie, request body or invite code appears in any of the new lines, and `dashboard.leaderboard.failed` is checked by reading the call site unless some real data makes the compute throw (record which in the PR)
- [ ] 1.9 After the merge and the owner's approval of the `release` run, `/dashboard` loads on the production URL for a signed-in user as before (the new events appear only when a read fails)

### Phase 2: CI guards for the migration and code seam (OPP-3)

#### Automated

- [ ] 2.1 Guard unit tests and the end-to-end guard test pass: `npm test`
- [ ] 2.2 Lint passes, the script included: `npm run lint`
- [ ] 2.3 The guard passes on this branch against master: `npm run guard:migrations -- --base origin/master`
- [ ] 2.4 The generated types are fresh locally: `npm run types:check`
- [ ] 2.5 Type check passes: `npx astro check`

#### Manual

- [ ] 2.6 On a scratch local branch that is never pushed: a statement edit in an existing migration makes the guard exit 1, a comment-only edit exits 0, a new migration with `drop policy` and no marker exits 1 and passes with `-- compat: <reason>`, a new migration with a timestamp older than the newest at base exits 1, an allowlist line from `--entry` passes with a warning, and copying a line that is already at base, or editing the file again, exits 1
- [ ] 2.7 Changing one identifier in `src/types.ts` locally makes `npm run types:check` exit 1 with a diff; restore the file
- [ ] 2.8 With the owner's go-ahead, a draft PR from a scratch branch that edits a statement of `20260925011727_harden_group_rls.sql` shows `integration` failing with the annotation and the merge blocked; close it unmerged and delete the branch
- [ ] 2.9 README, `test-plan.md` and the new `lessons.md` entry read correctly
- [ ] 2.10 After the PR is open, all its checks pass with both new steps: `gh pr checks` shows `integration`, `ci` and `smoke` passing

### Phase 3: Characterization net for the data routes (OPP-1)

#### Automated

- [ ] 3.1 New unit and route suites pass together with the existing ones: `npm test`
- [ ] 3.2 Tests are linted and type-checked: `npm run lint && npx astro check`
- [ ] 3.3 No source file changed: `git diff --stat origin/master...HEAD -- src` prints nothing

#### Manual

- [ ] 3.4 Break-and-restore checks (restore with `git checkout -- <file>`), each making at least one test red: the name limit in `src/lib/group-rules.ts` set to 81; the `42501` and `23505` cases swapped in `src/lib/group-errors.ts`; the zero-row redirect in `src/pages/api/groups/rename.ts:41` changed to `/dashboard`; the `reportError("uncheck.failed", …)` call removed from `src/pages/api/tasks/uncheck.ts:41`
- [ ] 3.5 The coverage guard goes red when an empty `src/pages/api/tasks/probe.ts` is added and green again when it is deleted
- [ ] 3.6 The row names read as sentences and a red row names its route and case

### Phase 4: Contract tests for rules duplicated in SQL and TS (OPP-5)

#### Automated

- [ ] 4.1 Contract tests pass: `npm test`
- [ ] 4.2 The regex-on-SQL test is gone: `grep -n "_create_tasks.sql" tests/unit/task-rules.test.ts` prints nothing
- [ ] 4.3 Lint and type check pass: `npm run lint && npx astro check`
- [ ] 4.4 No source file changed: `git diff --stat origin/master...HEAD -- src` prints nothing

#### Manual

- [ ] 4.5 TS-side break-and-restore checks, each turning a contract test red: `MAX_GROUP_NAME_LENGTH` set to 81 in `src/lib/group-rules.ts`; NBSP (U+00A0) added to the trim set; `"monthly"` added to `TASK_RECURRENCES`
- [ ] 4.6 SQL-side check on the local database only, with the owner's go-ahead because it ends in `npx supabase db reset`: in a scratch migration weaken `groups_name_length` to `between 1 and 81`, apply it, see `npm test` go red, then restore with `npx supabase db reset` (the procedure of `context/foundation/test-plan.md:179`)

### Phase 5: Explicit table grants (OPP-4)

#### Automated

- [ ] 5.1 RLS scenarios pass including the new block, reporting 7 more assertions than the 293 of the baseline: `npm run test:rls`
- [ ] 5.2 Existing suites stay green: `npm test`
- [ ] 5.3 Lint stays green, and so do the generated types once Phase 2 has landed (the migration changes no type; if Phase 5 runs first, only `npm run lint` applies until then): `npm run lint && npm run types:check`
- [ ] 5.4 The Phase 2 guard accepts the new migration as an added, non-destructive file (requires Phase 2; if Phase 5 runs first, tick this row when Phase 2 lands): `npm run guard:migrations -- --base origin/master`

#### Manual

- [ ] 5.5 Local mutation check: revoke `select, delete` on the three tables from `authenticated`, see `npm run test:rls` go red on the new block, apply the migration SQL and see it green again
- [ ] 5.6 With the owner's go-ahead, a fresh-database check that wipes local data: `npx supabase db reset && npm run test:rls && npm test`
- [ ] 5.7 The owner runs the hosted privilege query in the Supabase dashboard SQL editor (never through the chat) and the result matches the scenario table: `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1, 2 order by 1, 2;` returns the six `authenticated` rows and no `anon` row; a difference stops the phase for a re-plan
- [ ] 5.8 After the PR is open, its CI run, which starts a fresh stack and applies every migration, is green: `gh pr checks`
- [ ] 5.9 Release: after the merge, check that `supabase/migrations/` of the merge commit lists exactly the new migration, approve the `release` run in the `production` environment, and see the live check pass
- [ ] 5.10 On the production URL: sign in, the dashboard shows the group and its tasks, tick a task and undo it
- [ ] 5.11 Date, applied migration and result are noted in `context/changes/deployment/deployment-plan.md` as Phase 13
- [ ] 5.12 Optional: the owner reads Project Settings, API, Max rows on the hosted project and records it in the PR (no change is planned)
