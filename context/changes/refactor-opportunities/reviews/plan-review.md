<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Refactor opportunities: guards, safety net and explicit grants

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 4 observations
- **Triage**: all 6 findings fixed in the plan and the brief (F3 via Fix A); verdict after fixes: SOUND
- **Scope**: the plan after the edits made once its first review was done (a page baseline in Phase 1, five Phase 2 commits that separate mechanism from enforcement, the wording of the phase order). The first review (8 findings, all fixed) is in git history at `1f0f29a`.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 119/119 checks ✓ (97 carried over from the first review and re-run, 22 new for the edited plan: 15 line anchors in `dashboard.astro`, `checkoff.ts`, `uncheck.ts`, `groups.ts`, `tasks.ts`, `README.md`, `eslint.config.js` and `lessons.md`, and 7 path, symbol and absence checks), brief↔plan ✓, Progress↔Phase ✓ (43 criteria, 43 rows, identical titles, no checkbox outside `## Progress`). `docs/reference/contract-surfaces.md` does not exist, so that check was skipped.

Deep mode was run inline, without a sub-agent (the session policy allows spawning one only on an explicit request). Claims that held:

- The grep of criterion 1.1 prints exactly the five `console.error` lines of `src/pages/dashboard.astro` (68, 77, 82, 101, 126) at baseline and nothing else.
- The `-- compat:` heuristic flags exactly `20260925011727_harden_group_rls.sql` (drops and `alter policy`) and `20261001120000_harden_table_privileges.sql` (revokes on tables created by earlier files); the other five revoke only objects they create themselves and contain no `drop` (read statement by statement, the script does not exist yet).
- The Phase 3 contract matches the two routes read, `tasks/checkoff.ts` and `groups/leave.ts`: an anonymous redirect to `/auth/signin` before any client, the `checkoff.invalid_id` info line before the client, `not_configured` after validation, the `checkoff.task_gone` info line for a null `getTask`, `new Date()` at `checkoff.ts:37`, and the quiet zero-row branch with a post-read in `leave.ts`.
- `requestFields` returns `route`, `userId` and `ray` (`null` without a `cf-ray` header), so row 1.6 holds locally.
- `rls_check.expect_value` inserts one row into `rls_check.results` per assertion and the summary counts them, so six plus one assertions give "+7".
- `vitest@^5.0.3` supports `toFake`. Ruleset 24254172 requires `integration` only and has no bypass actor.

Claims that failed: the isolation of the `tasks` revoke in row 1.7 (F1) and the assumption that a required `integration` run sees the final base (F3). The probes behind F1 ran in transactions that were rolled back; the table privileges were re-read afterwards and are unchanged.

## Findings

### F1 — Revoking `select` on `tasks` fails all three secondary reads

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — row 1.7 and the five-state baseline (item 0)
- **Detail**: Row 1.7 treats the three revokes as isolated injections ("for each secondary read in turn ... the matching line"). The policies of `task_participants` and `task_checkoffs` read `public.tasks` in an `exists (...)` subquery (`supabase/migrations/20261001090000_create_task_participants.sql:54,60`, `20261002090000_create_task_checkoffs.sql:56,62`) and `task_checkoff_periods` is `security_invoker = true` (`20261002090000_create_task_checkoffs.sql:77-78`). Probed on the local database in rolled-back transactions: after `revoke select on public.tasks from authenticated`, reads of `task_participants`, of the view and of `tasks` all fail with `permission denied for table tasks`; revoking on `task_participants` or on the view fails that read only. The first injection therefore logs three events in one request (`dashboard.tasks.failed`, `dashboard.participants.failed`, `dashboard.checkoffs.failed`) and renders the page with the Tasks card hidden and both notes, so `dashboard.tasks.failed` is never seen alone and a verifier who expects one line may read the other two as a defect.
- **Fix**: In row 1.7 and item 0 say that the `tasks` revoke fails all three reads (expect three lines, and that page is the baseline of that state) and that the `task_participants` and view revokes isolate one event each.
- **Decision**: FIXED (Fix in plan: row 1.7, in the criteria and in Progress, and item 0 say that the `tasks` revoke fails all three reads)

### F2 — Row 1.9 can be confirmed only after the merge and the release, and Phase 1 does not say when it is ticked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — row 1.9 and the Implementation Note
- **Detail**: Row 1.9 (the production check, added as the fix of the first review's F3) needs this PR's own merge and an approved `release` run. Per `lessons.md:105-110` the manual rows are confirmed before the branch is pushed and the PR is opened, so 1.9 cannot be confirmed at that point. Phase 5's note solves the same problem for rows 5.9 to 5.11 (a small closing docs PR after the release, the pattern of `lessons.md:77-82` and `:126-131`); Phase 1's note does not mention 1.9. The implementer has to guess: leave Phase 1 with an open row, stop and wait, or tick it early.
- **Fix**: Add to the Phase 1 Implementation Note that row 1.9 needs this PR's own release and is ticked after it, in a small closing docs PR (as for rows 5.9 to 5.11) or in the next phase's PR, never before the production check.
- **Decision**: FIXED (Fix in plan: the Phase 1 Implementation Note says row 1.9 is ticked after the release, in a closing docs PR or in the next phase's PR)

### F3 — The ordering rule cannot see a migration merged after the PR's last CI run

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — guard rules (Ordering), docs
- **Detail**: The rule compares a new migration with the tree of `origin/$BASE_REF` at the moment `integration` runs. The ruleset has `strict_required_status_checks_policy: false` (`gh api repos/mariuszzlotucha/streak-board/rulesets/24254172`), so a PR whose last green run predates the merge of another migration PR can still merge, and its older timestamp lands behind the newer one on `master`. By the plan's own inference [I], `db push` then refuses the file and `release` fails after the build, on this and every later release until the owner acts, while the guard forbids the clean recovery by rename or delete. `CLAUDE.md` sets up parallel worktrees, so two open migration PRs are a normal case; this plan's own sequence has one migration (Phase 5) and avoids it, but other slices may overlap.
- **Fix A ⭐ Recommended**: Document the limit and the recovery: one sentence in the Ordering bullet and in the README backward-compatibility paragraph saying that the branch is updated (so `integration` re-runs) before a migration PR is merged when another migration has merged since, and that a merged out-of-order file is applied by the owner with `supabase db push --include-all` (credentialed, by hand), because the guard forbids rename and delete.
  - Strength: No policy change and about two sentences; it uses the CLI flag that exists for this case.
  - Tradeoff: It relies on discipline; the failure is still caught only by `release`.
  - Confidence: MED — the refusal and the effect of `--include-all` are inferred from the help text [I], not observed.
  - Blind spot: `db push` behaviour on an out-of-order file stays untested.
- **Fix B**: Ask the owner to enable "Require branches to be up to date before merging" on the ruleset (`strict_required_status_checks_policy: true`) and add a Manual row to Phase 2 that confirms it with `gh api`.
  - Strength: It closes the race mechanically for this rule and for every other base-relative check in `integration`.
  - Tradeoff: It is an owner-only change of merge policy, and every PR must be updated and re-run after another merge.
  - Confidence: HIGH — the flag is `false` today (read with `gh api`).
  - Blind spot: The effect on the docs-only flow (skipped jobs still report) was not tested.
- **Decision**: FIXED (Fix A: the Ordering bullet, the README description and the brief record the limit, the update-the-branch advice and the `--include-all` recovery; the strict flag is noted in Key Discoveries)

### F4 — "Two rules hold in every phase" overclaims

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach; brief (Key Decisions "Safety order" and Architecture / Approach)
- **Detail**: The sentence added after the first review says a check that can fail a PR is switched on in its own commit after what it checks passes, and calls both rules valid "in every phase", but the named cases are Phases 1 and 2 only. Phase 3's coverage guard is part of the route-suite commit ("three commits ... the fake client with the route suite"), the Phase 4 contract suite and the Phase 5 RLS scenario are checks that can fail a PR too, and Phase 5 states no commit structure at all (the commit sentence covers Phases 1 to 4). A strict reading would make `/10x-impl-review` flag Phases 3 and 5. The first rule has the same shape ("every phase", one instance).
- **Fix**: Reword to "Two rules apply where a phase needs them: code that no test covers (only the dashboard page, Phase 1) is edited only after its current answers are recorded, and enforcement that is not itself a test (the lint rule in Phase 1, the CI steps in Phase 2) is switched on in its own commit after what it checks passes", and make the brief's decisions row and Architecture sentence say "enforcement" instead of "each check that can fail a PR".
- **Decision**: FIXED (Fix in plan: the two rules apply where a phase needs them and rule 2 is limited to enforcement that is not a test; the brief's decisions row and Architecture sentence are aligned)

### F5 — The guard spec leaves two details to the implementer

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — changes 1 and 2
- **Detail**: (a) The fixture test runs "over the real seven migrations ... stable because merged migrations are immutable". That holds for a fixed list of the seven names; a directory glob is not stable, because the first later migration that is flagged and carries a marker would turn the test red and the next author would loosen it. (b) `--entry` "prints the allowlist line" without saying what the reason text is; a helpful placeholder of 20 or more characters (for example "TODO explain why this edit is needed") passes the length rule when left unedited, which empties the owner's anti-abuse requirement. The unit tests list a short reason but not an unedited placeholder.
- **Fix**: State that the fixture uses a fixed list of the seven file names (the migrations at `c9f6451`), and that `--entry` ends the line with the literal `<reason>` (under 20 characters), with a unit case that an unedited line fails.
- **Decision**: FIXED (Fix in plan: a fixed list of the seven names for the fixture, the `<reason>` placeholder in `--entry` and a unit case for the unedited line)

### F6 — The reason given for not editing CLAUDE.md is no longer true

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: What We're NOT Doing
- **Detail**: The bullet says `CLAUDE.md` "carries unrelated uncommitted edits". They were committed on the planning branch as `54ab68d` at the owner's request, so the stated reason is false. The decision itself still stands: `CLAUDE.md` defers scripts and CI jobs to the README ("don't duplicate that here"), and Phase 2 updates the README.
- **Fix**: Replace the parenthetical with the current reason: `CLAUDE.md` defers CI jobs and scripts to the README, which Phase 2 updates.
- **Decision**: FIXED (Fix in plan: the parenthetical now gives the current reason)
