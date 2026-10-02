<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Custom domain Implementation Plan

- **Plan**: context/changes/custom-domain/plan.md
- **Scope**: Phases 3 and 4 of 4 (one PR at the owner's request)
- **Reviewed phases**: 3, 4
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

Mode: the diff is documentation plus two keys in `wrangler.jsonc` (commit `81f0520` on `s-06/custom-domain/phase-3-4`), so the review was done inline without sub-agents. The edits themselves were written by a delegated sub-agent; the gates, the diff read and the Progress rows were done in the main session. Triage was done by Claude without asking the owner (all three findings are low-impact and each has one obvious fix); the owner can overrule any decision in the PR.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

| Row     | Command                                                                       | Result                                                    |
| ------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| 2.1     | `curl` `https://streakboard.app/` after the release of PR #61                 | `200`; `/auth/signin` 200, `/dashboard` 302, callback 302 |
| 3.1     | `gh api .../environments/production/variables` (`PRODUCTION_URL`)             | `https://streakboard.app`                                 |
| 3.2     | `grep -n '^\*\*Production:\*\*' README.md`                                    | line 7 contains `https://streakboard.app`                 |
| 3.3     | `grep -nE 'Until the custom domain binding\|will move to it' README.md`       | prints nothing                                            |
| 3.4/4.4 | `npx prettier --check README.md deployment-plan.md roadmap.md wrangler.jsonc` | passes                                                    |
| 4.1     | `npm run lint`                                                                | exit 0 (after `astro check` generated the types)          |
| 4.2     | `npx astro check`                                                             | 0 errors, 0 warnings, 0 hints (103 files)                 |
| 4.3     | `npm run build` and the `dist/server/wrangler.json` read                      | prints `false false`                                      |

Lint note: the first `npm run lint` in this fresh worktree failed with 36 errors on unresolved `import.meta.env` types because `.astro/` types did not exist yet; after `npx astro check` generated them the same command passes. No source file changed.

Scope: changed files are the plan's `wrangler.jsonc`, `README.md`, `deployment-plan.md`, `roadmap.md` (Unknown only, no Status) and the Progress rows of `plan.md`. Nothing under `src/`, `supabase/`, `tests/` or `ci.yml` changed. Rows left open on purpose: 3.5 and 4.5 to 4.11 need the release of this PR or the owner; 4.12 is half done (the roadmap decision is in, the Phase 3 release result goes into the closing PR); 4.13 is the closing PR.

## Findings

### F1 — README stated post-release facts in the present tense

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md ("Custom domain" subsection and checklist step 7); deployment-plan.md (checklist annotation)
- **Detail**: The delegated edit wrote "the old address no longer serves the app" and "the `workers.dev` entry is gone from the Redirect URLs" as done. Both become true only after this PR's release and the owner's Supabase step, so between merge and those steps the README would be ahead of reality.
- **Fix**: Reword to what the merge itself does ("stops serving the app with the first deploy that carries these keys"; "removed after the release that carries it").
- **Decision**: FIXED: reworded in README.md and in the deployment-plan.md annotation before the commit

### F2 — Phases 3 and 4 in one PR weaken the canary

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: plan.md Implementation Approach and Phase 3 Implementation Note
- **Detail**: The plan keeps the two platform questions in separate releases so a failure has one cause. In the combined release a red "Check the live deployment" step (403 or 503 from the zone's bot protection) would leave `workers.dev` already switched off. The cause stays unambiguous, because switching `workers.dev` off cannot make `https://streakboard.app/` fail and the domain survival was proved by the release of PR #61. The cost is the recovery path: `workers.dev` has to be switched back on in the dashboard before the fix.
- **Fix**: None needed; recorded in Phase 10 with the rollback path, and the PR body repeats it.
- **Decision**: SKIPPED: accepted as the owner's explicit choice; documented in deployment-plan.md Phase 10

### F3 — README environment table re-padded by the formatting hook

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: README.md (environment table, about 20 whitespace-only lines)
- **Detail**: The `PRODUCTION_URL` purpose text is longer than the old column width, so `prettier --write` re-padded every table row. The earlier row was already mis-padded (visible in the diff), so this is formatting debt the hook settled.
- **Fix**: Accept; a parallel slice touching the same table resolves the conflict on merge (plan Migration Notes).
- **Decision**: SKIPPED: accepted as is
