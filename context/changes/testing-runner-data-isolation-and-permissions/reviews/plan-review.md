<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Test rollout Phase 1 — runner, data isolation and permissions

- **Plan**: context/changes/testing-runner-data-isolation-and-permissions/plan.md
- **Mode**: Deep (claims verified locally, no sub-agent)
- **Date**: 2026-09-30
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
10/10 paths ✓, symbols ✓ (project_id, sign_in_sign_ups, FR-003, PRD Access Control), brief↔plan ✓, Progress↔Phase ✓ (30 rows after fixes), contract-surfaces.md absent (skipped). Vitest 5.0.3 engines `^22.12.0 || ^24.0.0 || >=26.0.0` fit `.nvmrc` 22.14.0 and local Node 24.21.0.

## Findings

### F1 — Destructive scenarios vs one-group-per-user and rate limit

- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 1 helpers, Phase 3 scenarios, Critical Implementation Details
- **Detail**: Groups were cleaned only in afterAll while Phase 3 scenarios are destructive and a user can be in one group only; fresh users per test approach `sign_in_sign_ups = 30` per 5 min (`supabase/config.toml:190`).
- **Fix**: Users per file, groups per test with afterEach cleanup via the admin client.
- **Decision**: FIXED (Fix in plan)

### F2 — Weak workflow-validity check in 4.4

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 4 Automated Verification
- **Detail**: `gh workflow view ci.yml` shows the remote workflow, not the local edit.
- **Fix**: Use `npx prettier --check .github/workflows/ci.yml`.
- **Decision**: FIXED (Fix in plan)

### F3 — Ambiguous denial reason in Phase 2 insert test

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Blind Spots
- **Location**: Phase 2 isolation scenarios
- **Detail**: B already owns GB, so the insert could fail on 23505 instead of RLS.
- **Fix**: Run it as C (no group) and assert 42501.
- **Decision**: FIXED (Fix in plan)

### F4 — Helper hardening missing from the contract

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 and §3
- **Detail**: Clients need persistSession/autoRefreshToken off; a crashed file leaves users behind.
- **Fix**: Add client options and a teardown sweep by test e-mail prefix.
- **Decision**: FIXED (Fix in plan)

### F5 — "Required" gate needs branch protection

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: End-State Alignment
- **Location**: Phase 4 §1, test-plan §5
- **Detail**: A CI job blocks merges only if `master` protection requires it.
- **Fix**: Add a Phase 4 manual step (Progress row 4.8).
- **Decision**: FIXED (Fix in plan)
