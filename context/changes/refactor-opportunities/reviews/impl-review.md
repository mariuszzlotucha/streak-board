<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Refactor opportunities: guards, safety net and explicit grants

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

Reviewed branch `s-12/refactor-opportunities/implementation` (a8d092d..2df6e80 on top of origin/master 22a3e5c). Every Automated row of every phase was re-run on HEAD and passed: the two greps print nothing, `npm run lint`, `npx astro check`, `npm test` (40 files, 693 tests), `npm run build`, `npm run guard:migrations -- --base origin/master` (1 change, 0 violations), `npm run types:check` (empty diff), `npm run test:rls` (300 assertions). `git diff --stat origin/master...HEAD -- src` shows only the two Phase 1 files (single-branch run; no `src` change since the Phase 2 commit). No Manual row is ticked, so none is a false tick; all 20 stay pending.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Block comments are not stripped by the migration guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/migration-guard.mjs:81-105
- **Detail**: `stripLineComments` knows only `--` and single-quoted strings. Probed on the module: `flaggedStatements("/* we drop nothing */ select 1;")` returns 1 (a spurious `-- compat:` demand); `"/* don't */\nselect 1; -- drop x\n"` returns 1 because the apostrophe inside the block comment flips the string state and the later `--` comment survives; `isCommentOnlyEdit("/* a */ select 1;", "/* b */ select 1;")` returns false, so a block-comment-only edit of a merged migration is rejected although the plan's immutability rule exempts "comments and blank lines". No merged migration uses `/*` today, so the seven-name fixture cannot see it.
- **Fix**: In `stripLineComments`, remove `/\*[\s\S]*?\*/` (replacing each with the same number of newlines, so line numbers stay) before the character loop, and add unit cases for a block comment containing `drop` and one containing an apostrophe.
- **Decision**: FIXED — block comments outside strings are stripped in `stripLineComments` (newlines kept); two unit cases added; 28 guard tests green.

### F2 — Ordering rule compares whole file names, not the 14-digit version

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/migration-guard.mjs:391-395
- **Detail**: `name <= newest` compares full names, so an added `20261015180024_zzz.sql` sorts after the merged `20261015180024_grant_core_table_privileges.sql` and passes, although Supabase keys migrations by the 14-digit version and a duplicate version is refused or ambiguous on `db push`. The plan's rule says a new migration must be "newer" than every merged one.
- **Fix**: Compare `name.slice(0, 14) <= newest.slice(0, 14)` and add a same-timestamp case to the ordering tests.
- **Decision**: FIXED — the ordering rule compares the 14-digit version; message says "older or equal timestamp"; same-timestamp test added (29 guard tests green).

### F3 — deployment-plan Phase 15 entry written before the release

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md:275-286
- **Detail**: The plan (Phase 5 Changes 3, Implementation Note, row 5.11) has the S-12 entry written with real values in a small closing docs PR after the release. The branch pre-writes it as a skeleton with `TBD` placeholders and unticked boxes; it states that nothing in it is a recorded result, so it is not a false record. Its hosted query orders `grantee, table_name` where row 5.7 says `table_name, grantee` (same result set).
- **Fix**: Keep the skeleton and name it in the PR description as the place the closing docs PR fills in; rows 5.9 to 5.11 stay unticked until then.
- **Decision**: ACCEPTED — skeleton kept; the PR description names it as the entry the closing docs PR fills in.

### F4 — Two "Available Scripts" README bullets outside the Phase 2 docs contract

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: README.md:61-62
- **Detail**: The Phase 2 docs contract names the CI section and the backward-compatibility paragraph. The branch also adds `npm run guard:migrations` and `npm run types:check` to "Available Scripts". Harmless and consistent with CLAUDE.md, which defers every script's description to that README section.
- **Fix**: Keep; list it among the deviations in the PR description.
- **Decision**: ACCEPTED — bullets kept; listed as a deviation in the PR description.

### F5 — `create or replace` on a known object is not a flagged shape

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/migration-guard.mjs:254-276
- **Detail**: The marker heuristic flags `drop`, `alter policy`, `alter … rename` and `revoke` on an earlier object, exactly as the plan lists. `create or replace function/view` on a name from an earlier migration passes without a marker, although replacing one of the three RPCs (`join_group`, `list_group_members`, `preview_group`) is the most likely breaking shape for the deployed routes. The `known` set the rule needs is already computed.
- **Fix A ⭐ Recommended**: Add `create or replace (function|view) <known name>` to the flagged shapes, with a test.
  - Strength: Covers the breaking shape the deployed code is most exposed to, using data the rule already has.
  - Tradeoff: Goes one shape beyond the plan's list; a signature-preserving `create or replace` will ask for a marker it does not need.
  - Confidence: MED — the heuristic is documented as prompting the author, so one more prompt matches its purpose.
  - Blind spot: The seven-name fixture must still flag exactly two; `20260925011727` replaces a function it also created, which the earlier-object test exempts.
- **Fix B**: Leave the heuristic as planned and record the gap in `test-plan.md` §6.5 next to the pending old-code-against-new-schema gate.
  - Strength: Keeps the implementation on the plan's text; the real guard for this case is S-10's release gate.
  - Tradeoff: The most likely breaking migration shape stays unprompted until S-10 lands.
  - Confidence: MED — depends on how soon an RPC changes.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — `create or replace function|procedure|view` of an object an earlier migration created is flagged; JSDoc, README marker bullet and a unit test updated; fixture still flags exactly two.

### F6 — No worded error when the base ref cannot be resolved

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/migration-guard.mjs:433-435, 484-510
- **Detail**: A missing base ref (a local run before `git fetch`, or a shallow clone) escapes `git(["merge-base", …])` as a raw stack trace with exit 1. CI has `fetch-depth: 0`, so this affects local runs only. `scripts/token-contrast.mjs` throws worded errors at its boundaries.
- **Fix**: Wrap `main` in a try/catch that prints `::error::cannot resolve base <ref>; run git fetch origin` and exits 1.
- **Decision**: FIXED — `main` catches the merge-base failure, prints a worded `::error::` and returns 1; end-to-end test case added (31 guard tests green).

### F7 — Route coverage guard watches only the two existing directories

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/data-routes.test.ts:1112-1127
- **Detail**: The guard reads `src/pages/api/groups` and `src/pages/api/tasks`, exactly as planned, so a new sibling directory (for instance `src/pages/api/invites/`) would hold routes with no rows and the suite would stay green. The plan's revisit trigger for OPP-7 is "a 14th data route is added", which such a route would be.
- **Fix**: Read `src/pages/api/` and include every directory except `auth`, so a new route family turns the guard red.
- **Decision**: FIXED — the guard lists every directory under `src/pages/api` except `auth` and pins the list to `["groups", "tasks"]`; data-routes suite green (150 tests). The probe-directory break-check was not run (the shell command that creates and removes a file under `src` was denied); it stays part of Manual row 3.5.
