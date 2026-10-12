<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard UI Implementation Plan

- **Plan**: context/changes/dashboard-ui/plan.md
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-10-12
- **Verdict**: APPROVED (after triage: F1–F5 fixed, F6 skipped)
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict                            |
| ------------------- | ---------------------------------- |
| Plan Adherence      | WARNING (1 finding, 1 observation) |
| Scope Discipline    | PASS                               |
| Safety & Quality    | WARNING (1 finding)                |
| Architecture        | PASS                               |
| Pattern Consistency | PASS (1 observation)               |
| Success Criteria    | PASS (2 observations)              |

## Scope and evidence

- **Work reviewed.** The staged, uncommitted diff on `s-11/dashboard-ui/phase-3`, compared with `master` at `78a47e3`. It has two parts:
  - a new `## Phase 14` section in `context/changes/deployment/deployment-plan.md` (+25 lines);
  - the Progress ticks 1.12, 2.10 and 3.1 in `plan.md`.

  The phase commit waits for the owner's manual check.

- **Plan adherence.** All three planned changes match:
  - the releases: both merges were released, and the owner approved each run in `production`;
  - the production check: Claude's anonymous check is recorded, and the owner's row is open as intended;
  - the records: the entry has the dates, merge commits, release runs, "no new migrations", the checks and the S-12 handoff. 14 is the next free number in `deployment-plan.md`.
- **Facts checked independently.** The checks used the GitHub API, the job logs, git and 8 anonymous GETs. Every claim in the entry holds:
  - merge times and commits;
  - run ids, job windows and step results;
  - the `production` approvals, both version ids and "Remote database is up to date.";
  - no change under `supabase/`, and no env-schema or wrangler change;
  - the token values in the live stylesheet;
  - the S-12 note at `refactor-opportunities/plan.md:111`;
  - the PR CI runs behind 1.12 (`3abd5fd`, run 38222602072) and 2.10 (`b2e14f9`, run 38277447571).
- **Boundaries held.** Only the two documents changed. No code, migration, config or secret changed.
- **Outside this review.** These are noted here, not raised as findings. Both release runs carry GitHub annotations:
  - steps written for Node.js 20 (`actions/checkout@v4`, `actions/setup-node@v4`) are forced onto Node.js 24;
  - the `ubuntu-latest` label moves to Ubuntu 26 from 2026-10-19.

  Neither failed a job. They affect every later release, not this slice.

## Success criteria (Phase 3)

| #   | Check                                                               | Result                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | `gh run list --workflow ci.yml --branch master`, `gh run view <id>` | PASS with an equivalent list command (F5). Runs 38222989341 (`7ca7942`) and 38277781844 (`78a47e3`): `changes`, `ci`, `smoke`, `integration` and `release` all `success`, including "Check the live deployment" |
| 3.2 | Manual: production dashboard checked on desktop and phone           | PENDING: the owner has not reported yet                                                                                                                                                                         |
| 3.3 | Manual: production public pages checked                             | PENDING: the owner has not reported yet                                                                                                                                                                         |
| 3.4 | Manual: release recorded in deployment-plan.md                      | PENDING: the entry is drafted and staged. Its owner row and status line wait for 3.2 and 3.3                                                                                                                    |

## After triage

- **Files changed by the fixes.**
  - `context/changes/deployment/deployment-plan.md`: Phase 14 (F1–F4).
  - `context/changes/refactor-opportunities/plan.md`: a note under the criterion at `:343` (F1).
  - `context/changes/dashboard-ui/change.md`: the section "Faza 3: wydanie (2026-10-12)" (F5).
- **Checks.**
  - `npx prettier --check` passes on all changed documents.
  - No code changed, so lint, tests and the build are not affected.
- **Closed after triage.** The owner reported the production check (3.2, 3.3) and the review of the record (3.4) as done on 2026-10-12. Phase 14's owner row is ticked, and its status is "Done".

## Findings

### F1 — S-12's plan also claims "Phase 14"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md:244, context/changes/refactor-opportunities/plan.md:324,343,469
- **Detail**: This entry takes `## Phase 14`, as S-11's plan allows: "Phase 14, or the next free number if S-12 records first" (`plan.md:884`). S-12's reviewed plan also records its release "as Phase 14", with no fallback:
  - the contract at `:324`;
  - the manual criterion at `:343`;
  - Progress row 5.11 at `:469`, whose title cannot change.

  S-12 will branch after this merge, so git shows no conflict. An implementer who follows row 5.11 would write a second `## Phase 14`. The lesson on parallel slices gives each slice its own Phase N number, and the handoff to S-12 does not mention the clash.

- **Fix**: Add a handoff bullet saying that S-12 records its release as Phase 15. Add the same note under S-12's criterion at `refactor-opportunities/plan.md:343`, the way the 503 note sits at `:111`. Row 5.11 keeps its title.
- **Decision**: FIXED (Fix now). The S-12 handoff in `deployment-plan.md` ends with a bullet saying that S-12 records its release as Phase 15. A note under S-12's criterion (`refactor-opportunities/plan.md:344`) says the same, and row 5.11 keeps its title.

### F2 — The rollback note is incomplete

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/deployment/deployment-plan.md:252
- **Detail**: The entry says "Rollback is `npx wrangler rollback` and covers the code only". Two things are missing:
  - **The target.** A bare `wrangler rollback` returns to the prior version (`README.md:260`). After two releases on one day, that is Phase 1's `7c1f193d-…`, so it undoes Phase 2 only. Undoing the whole slice needs the version before that one. The last release before S-11 was run 37811849750 (PR #89), which deployed `ccd31a3f-a214-4d78-b2a8-7405317a9c1e`. A secret change since then would have added a newer version, so `npx wrangler deployments list` is the authority.
  - **The revert.** The plan's Migration Notes (`plan.md:951`) and Phase 11's rollback note pair the rollback with a revert on `master`. Without the revert, the next approved `release` ships the code again.

  No data is at risk, because there is no schema change.

- **Fix**: Replace the sentence with both targets and the revert:
  - a bare `npx wrangler rollback` undoes Phase 2 only;
  - undoing the whole slice is `npx wrangler rollback <id>`, with the version before `7c1f193d-…` from `npx wrangler deployments list`;
  - either way, revert the merged PR on `master` as well.
- **Decision**: FIXED (Fix now). The sentence is gone from the PR #103 release row. A plain "Rollback" bullet after that row gives both targets and the revert:
  - a bare rollback returns to Phase 1's `7c1f193d-…`;
  - `npx wrangler rollback <id>` takes the version before that one; the last pre-S-11 release deployed `ccd31a3f-…`;
  - either way, revert the merged PR on `master`.

### F3 — Two imprecise lines in the S-12 handoff

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md:266-267
- **Detail**:
  - "Textually unchanged" is true. But S-12's own pointer `src/pages/dashboard.astro:33-38` (`refactor-opportunities/plan.md:385`) no longer covers the `loadDashboard({...})` call. The call now sits at lines 22-27; at `2ec358b` it started at line 33.
  - "`loadSettings`, which reports `settings.load.failed` and answers `503`" attributes the 503 to the loader. The loader returns `loadFailed`, and the page sets the status (`src/pages/settings.astro:16`).
- **Fix**: Give the new lines (22-27) in the handoff. Reword the last bullet to "…`loadSettings`, which reports `settings.load.failed`; the page then answers `503`".
- **Decision**: FIXED (Fix now). The handoff now gives lines 22-27 next to the `:33-38` that S-12's plan cites, and its `/settings` bullet says that the page answers `503`.

### F4 — The cancelled release of the plan PR's merge is not recorded

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/deployment/deployment-plan.md:251
- **Detail**: The merge of plan PR #101 (`2ec358b`) started CI run 38206570239. Its `release` job waited from 05:09 UTC and was cancelled at 08:20:47 UTC, when the run for PR #102 queued in the same `release` concurrency group. It held documents only. Phase 13 records the same case (`deployment-plan.md:236`).
- **Fix**: Add one sentence to the PR #102 release row.
- **Decision**: FIXED (Fix now). The PR #102 release row ends with a sentence on run 38206570239, in the wording Phase 13 uses.

### F5 — 3.1's list command does not run with the installed gh

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/dashboard-ui/plan.md:897
- **Detail**: `gh run list --workflow ci.yml --branch master` exits 1 with "unknown flag: --branch". This machine has gh 2.4.0, the Ubuntu package from 2022. The criterion still passes with these commands:
  - `gh run list --workflow ci.yml --json databaseId,headBranch,headSha,conclusion`, filtered on `headBranch == "master"`;
  - `gh run view 38222989341` and `gh run view 38277781844`.

  The implement run's preflight checked only that `gh` is installed, not that it has this flag.

- **Fix**: Note the equivalent command in `change.md`, next to the other plan amendments.
- **Decision**: FIXED (Fix now). `change.md` has a new section "Faza 3: wydanie (2026-10-12)" with the equivalent command for criterion 3.1.

### F6 — CI-on-PR rows can only be ticked after their own phase

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/dashboard-ui/plan.md:995,1017
- **Detail**: Rows 1.12 and 2.10 ("CI jobs ci, smoke and integration pass on the PR") are ticked here, one phase late.
  - Under the lesson "push only after the review is triaged", the PR and its CI exist only after the phase commit. The row can therefore never land in its own phase's commit.
  - Phase 1's tick (commit `0b45e34`, 2026-10-12 08:28 UTC) was pushed to `s-11/dashboard-ui/phase-1` after PR #102 merged, so it never reached `master`. This phase carries the same line.

  Every later plan with this row hits the same gap.

- **Fix**: Record a lesson: tick a phase's "CI passes on the PR" row on the next phase's branch or in the closing docs PR, never on the merged branch.
- **Decision**: SKIPPED. The owner chose "Record as lesson", then cancelled the entry, so no lesson was added. Rows 1.12 and 2.10 are ticked in this phase.
