<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Grid save reliability (S-22)

- **Plan**: `context/changes/grid-save-reliability/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-20
- **Verdict**: REVISE → SOUND after triage (all six findings fixed in the plan)
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension             | Verdict                                       |
| --------------------- | --------------------------------------------- |
| End-State Alignment   | PASS                                          |
| Lean Execution        | PASS                                          |
| Architectural Fitness | PASS (1 observation, fixed)                   |
| Blind Spots           | WARNING → PASS (1 warning, 1 obs, both fixed) |
| Plan Completeness     | WARNING → PASS (3 warnings, all fixed)        |

## Grounding

16/16 existing paths ✓ (the 17th, `src/lib/client-error-codes.ts`, is the new module), 7/7 symbols ✓ (`CLIENT_ERROR_CODES`, `CLIENT_ERRORS_PATH`, `ClientErrorCode`, `sendCheckoff`, `CHECKOFF_TIMEOUT_MS`, `reportError`, `pageshow`), brief↔plan ✓, Progress 15/15 rows ↔ criteria ✓ (one `## Progress`, phase titles match, no checkboxes in phase blocks), `docs/reference/contract-surfaces.md` absent (check skipped). Verification agent confirmed: `npx astro check` is what CI runs (`.github/workflows/ci.yml:73`, after `npx astro sync`); the Stryker invocation is the form `test-plan.md:150` prescribes; the unit project (`vitest.unit.config.ts`, `environment: node`) imports a pure-constants module freely; the `typeof navigator` guard mirrors `src/lib/pwa/push.ts:161-166`; the 500-stub test proves interception of the `keepalive` fetch.

## Findings

### F1 — Mutation criterion contradicts the baseline for this module

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification, row 1.4
- **Detail**: Row 1.4 demanded every runtime mutant at `testsCompleted >= 1`; `context/foundation/mutation-baseline.md:39` and `test-plan.md:196` record that the `checkoff-client` mutants removing `controller.abort()` end as `Timeout` with `testsCompleted: 0` (detected, not survived), and the plan's own Testing Strategy said "must die or time out".
- **Fix**: Reword 1.4 with the `Timeout` exception and the baseline reference.
- **Decision**: FIXED (Fix in plan)

### F2 — `tests/unit/push.test.ts` imports the moved constants

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — §2 Client-error channel
- **Detail**: §2 named only `pwa-register.test.ts`, conditionally. `push.test.ts:12` imports `CLIENT_ERRORS_PATH` and `CLIENT_ERROR_CODES` from `@/lib/pwa/register` (used :73, :135-204) and `pwa-register.test.ts:3` imports `CLIENT_ERRORS_PATH` (:78, :111); both break at import once `register.ts` keeps nothing of the list.
- **Fix**: Both test files named in §2's file list and contract with the new import source; their assertions unchanged.
- **Decision**: FIXED (Fix in plan)

### F3 — A thrown `response.json()` would count as `network` and retry

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — §1 Client protocol, §4 Unit tests, Critical Implementation Details (Timing)
- **Detail**: `network` was defined as "a thrown fetch" with the abort told apart by `signal.aborted` in the `catch`. A non-JSON 200 (oracle row "an HTML page with status 200", `checkoff-client.test.ts:99-102`) throws from `response.json()` at `:58` into the same `catch` with the signal not aborted, so a server answer would be retried against the plan's own rule.
- **Fix**: A throw after the response arrived is `body` (own `try` around the body read, or a flag once the response arrived); the HTML-200 case added to §4 as `reason: "body"`, one request.
- **Decision**: FIXED (Fix in plan)

### F4 — Red proof for e2e runs against the reused green preview

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification, row 1.8
- **Detail**: `playwright.config.ts` sets `reuseExistingServer` outside CI and the preview daemon keeps serving the green `dist`, so the stashed sources would never reach the retry and beacon tests: a false red.
- **Fix**: Row 1.8 now stops the preview (`npx astro preview stop`) before the red run and again before the green re-run so Playwright's `webServer` rebuilds.
- **Decision**: FIXED (Fix in plan)

### F5 — No repo precedent for observing a beacon in Playwright

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (Beacons in Playwright); brief, Open Risks
- **Detail**: No spec in `tests/e2e` waits for a request or routes a `ping` (Playwright 1.63.0); the brief's fallback "route the path" would miss the beacon for the same reason the primary would.
- **Fix**: Fallback named as a `page.addInitScript` recorder replacing `navigator.sendBeacon`, read back with `page.evaluate`, in the plan and the brief.
- **Decision**: FIXED (Fix in plan)

### F6 — Three files named `client-errors`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — §2
- **Detail**: `src/lib/client-errors.ts` would sit next to the route `src/pages/api/client-errors.ts` and `tests/unit/client-errors.test.ts`; the brief already had to write "`client-errors.ts` (route)".
- **Fix**: The new module is `src/lib/client-error-codes.ts` (import `@/lib/client-error-codes`) in the plan and the brief.
- **Decision**: FIXED (Fix in plan)

## Triage summary

- Fixed: F1, F2, F3, F4, F5, F6 (6)
- Skipped / Accepted / Dismissed: none
- Verdict after fixes: SOUND
