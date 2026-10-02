<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Observability: failures reach the response and monitoring

- **Plan**: context/changes/observability-swallowed-errors/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 3 warnings (1 fixed, 2 skipped), 7 observations

## Verdicts

| Dimension           | Verdict                                                          |
| ------------------- | ---------------------------------------------------------------- |
| Plan Adherence      | PASS                                                             |
| Scope Discipline    | PASS (eslint ignore for `context/audits/**` is a recorded extra) |
| Safety & Quality    | PASS                                                             |
| Architecture        | PASS                                                             |
| Pattern Consistency | PASS                                                             |
| Success Criteria    | PASS (automated 1.1-1.6 green; manual 1.7-1.10 pending)          |

## Findings

### F1 — `details` and `hint` dropped for Error instances

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/log.ts (errorFields)
- **Detail**: postgrest-js `PostgrestError extends Error`, so the `instanceof Error` branch skipped `details`/`hint`.
- **Fix**: read details/hint for any object (scrubbed).
- **Decision**: FIXED — details/hint read for every object; test added in tests/unit/log.test.ts.

### F2 — 429 from Auth is treated as signed out

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth-state.ts:38
- **Detail**: A 4xx without a known code is `unexpected` (302 plus an `auth.unexpected` report). The plan's classification contract is explicit about 5xx and network failures only.
- **Decision**: SKIPPED — keeps the plan's contract; the case is reported, so it is visible. Candidate for a later slice.

### F3 — `Key (a)=(v)` scrubber stops at the first `)`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/redact.ts:6
- **Detail**: A key value containing `)` would leak its tail.
- **Decision**: SKIPPED — invite codes and ids never contain `)`.

### F4-F10 — Observations

- ReDoS-ish quadratic e-mail pattern on long input (F4), scrubber coverage limited to the three planned patterns and context values not scrubbed (F5), `requestFields` unguarded (F6, the `rate_limited` branch was wrapped in `safely`), comment accuracy in auth-state (F7, fixed), `auth.unavailable` logged on every request (F8), unverified cookie merge on the 503 (F9), aliased import in checkoff-response (F10).
- **Decision**: ACCEPTED (F6 and F7 fixed in code).
