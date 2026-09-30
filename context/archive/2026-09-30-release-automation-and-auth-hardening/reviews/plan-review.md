<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Release Automation and Auth Hardening

- **Plan**: context/changes/release-automation-and-auth-hardening/plan.md
- **Mode**: Deep (checks done inline, no sub-agent)
- **Date**: 2026-09-30
- **Verdict**: REVISE (SOUND after fixes)
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding
10/10 paths ✓, symbols ✓ (Object.hasOwn whitelist, PROTECTED_ROUTES, AUTH_ROUTES, `db push --yes`), brief↔plan ✓, Progress↔phases ✓ (23 rows, 1:1). Contract-surfaces check skipped (file absent).

## Findings

### F1 — Release job lands on master before its environment exists

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 vs Phase 4 §1
- **Detail**: The `production` environment, reviewer and secrets are created only in Phase 4, but Phase 2's PR is merged first. `gh api repos/mariuszzlotucha/streak-board/environments` returns 0 environments. A job referencing a missing environment makes GitHub create it with no protection rules, so the first master push after the Phase 2 merge runs `release` with no approval gate (and fails on missing secrets).
- **Fix A ⭐ Recommended**: Create environment, reviewer and secrets before merging Phase 2
  - Strength: The gate exists before the job does; Phase 4 shrinks to SMTP, Workers Builds and the production check.
  - Tradeoff: Needs the Cloudflare and Supabase tokens earlier.
  - Confidence: HIGH — the environments API confirms none exist yet.
  - Blind spot: A first run before Phase 1 is merged deploys older code.
- **Fix B**: Guard the job with `if: vars.PRODUCTION_URL != ''`
  - Strength: Job stays skipped until the variable is added.
  - Tradeoff: A forgotten variable silently disables releases.
  - Confidence: MEDIUM — depends on variable visibility before the environment exists.
  - Blind spot: Auto-created environment with the variable set but no reviewer.
- **Decision**: FIXED (Fix A)

### F2 — "Second click" test runs in the wrong browser state

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 criterion 4.8, Testing Strategy step 2
- **Detail**: After the first click the user is signed in; middleware redirects signed-in users away from `/auth/signin` (`src/middleware.ts:26-28`), so a second click in the same browser ends on `/dashboard`.
- **Fix**: Say "second click in a signed-out or private window" in 4.8 and in the manual steps.
- **Decision**: FIXED

### F3 — `db push` flag left open; approver cannot see the migrations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Release job
- **Detail**: The flag exists (`supabase db push --yes`). Approval happens before the job starts, so the reviewer never sees `migration list`; pending migrations are visible only in the merge diff.
- **Fix**: Name `--yes` in the contract; add to the README runbook that the approver checks `supabase/migrations/` in the merge commit before approving.
- **Decision**: FIXED

### F4 — Post-deploy check does not assert the redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Release job, last step
- **Detail**: `curl -f` fails only on 400+, so a `/dashboard` answering 200 would pass (smoke lesson: assert outcomes).
- **Fix**: Compare `%{http_code}` explicitly (`/` = 200, `/dashboard` = 302 with location ending `/auth/signin`).
- **Decision**: FIXED

### F5 — No word on re-running a failed release

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes
- **Detail**: If deploy fails after `db push`, re-running the failed job is safe (`db push` is a no-op for applied migrations) but the plan does not say so.
- **Fix**: Add one line to Migration Notes and the README runbook.
- **Decision**: FIXED

### F6 — Criterion 2.2 is not a mechanical check

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 criteria (2.2)
- **Detail**: A grep "listing only lines in that job" needs a human read; `SUPABASE_URL`/`KEY` legitimately also appear in `ci`.
- **Fix**: Narrow the grep to the four privileged names, or move it to the manual reviewer check (2.4).
- **Decision**: FIXED
