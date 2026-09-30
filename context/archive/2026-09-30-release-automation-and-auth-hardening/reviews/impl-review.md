<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Release Automation and Auth Hardening

- **Plan**: context/changes/release-automation-and-auth-hardening/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Checks run: `npm run lint` PASS, `npx astro check` PASS (0 errors), callback test 7/7 PASS, prettier on changed docs PASS, no `version: latest`, privileged secrets only in the `release` job, no `three jobs` in README. `actionlint` not installed (the workflow has run green on GitHub). Every planned change is MATCH; no out-of-scope items.

## Findings

### F1 — Build runs after `db push`, so a build failure leaves schema ahead of code

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:108-121
- **Detail**: Step order follows the plan (db push, build, deploy). If `npm run build` fails, production has the new schema and old code. Re-running is safe (idempotent) and migrations must be backward compatible, but the failure window is avoidable.
- **Fix**: Move `npm run build` before `Apply pending migrations`.
  - Strength: A build failure can no longer leave the schema ahead; deploy still follows db push.
  - Tradeoff: Deviates from the plan's literal step order (documented intent, "schema before code", is kept).
  - Confidence: HIGH — build does not depend on the DB.
  - Blind spot: README step order text must be updated too.
- **Decision**: FIXED (build moved before db push; README step order updated)

### F2 — Workflow has no `permissions:` block and actions are pinned to floating tags

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml (whole file; `uses:` at lines 13, 35, 65, 92)
- **Detail**: No top-level `permissions:` so `GITHUB_TOKEN` gets the repository default. `supabase/setup-cli@v1` is a third-party action on a tag, and it runs in a job holding the DB password and Cloudflare token.
- **Fix A ⭐ Recommended**: Add `permissions: { contents: read }` at workflow level.
  - Strength: One-line, least privilege, no behaviour change.
  - Tradeoff: None significant.
  - Confidence: HIGH — no job writes to the repo.
  - Blind spot: Not verified that no step needs another scope.
- **Fix B**: Also pin `supabase/setup-cli` (and the others) to commit SHAs.
  - Strength: Removes the tag-retarget supply-chain risk in the credentialed job.
  - Tradeoff: SHAs need manual bumps.
  - Confidence: MEDIUM — maintenance cost depends on Dependabot use.
  - Blind spot: No Dependabot config checked.
- **Decision**: FIXED via Fix A (workflow-level `permissions: contents: read`)

### F3 — Post-deploy check does not exercise `/auth/callback`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:123-140
- **Detail**: Only `/` (200) and `/dashboard` (302) are checked. A missing or broken callback route would pass the release.
- **Fix**: Add a check that `/auth/callback` answers 302 with a location ending in `/auth/signin?error=link_expired`.
- **Decision**: FIXED (callback check added to the post-deploy step)

### F4 — README gaps on secrets location and superseded releases

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: README.md (Deployment and CI sections)
- **Detail**: `SUPABASE_URL`/`SUPABASE_KEY` must exist both as repository secrets (`ci` job) and as `production` environment secrets (`release` build); the README does not say so explicitly. It also says releases are "serialised" without noting that a queued newer push supersedes an older pending run.
- **Fix**: Add one sentence for each.
- **Decision**: FIXED (two README sentences added)
