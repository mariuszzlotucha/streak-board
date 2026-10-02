<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Observability: failures reach the response and monitoring

- **Plan**: context/changes/observability-swallowed-errors/plan.md
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning (dismissed), 2 observations

## Verdicts

| Dimension           | Verdict                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Plan Adherence      | PASS (7 of 7 items MATCH; installed SDK is 11.4.0, satisfies ^11.2.0) |
| Scope Discipline    | PASS                                                                  |
| Safety & Quality    | PASS                                                                  |
| Architecture        | PASS                                                                  |
| Pattern Consistency | PASS                                                                  |
| Success Criteria    | PASS (automated 3.1-3.6 green; manual 3.7-3.13 pending)               |

## Findings

### F1 — Unhandled error reported twice (reportError + wrapper capture)

- **Severity**: WARNING · **Impact**: MEDIUM · **Dimension**: Safety & Quality · **Location**: src/middleware.ts catch, src/lib/sentry.ts
- **Detail**: Reviewer claimed `wrapRequestHandler` (captureErrors defaults to true) would send a second event after the middleware's catch rethrows.
- **Decision**: DISMISSED — `captureException` and `captureEvent` in @sentry/core client.js call `checkOrSetAlreadyCaught(originalException)` and drop an already-seen error; the middleware rethrows the same object, so it is sent once, with the helper's tag and fingerprint. Not exercised at runtime with the real wrapper; confirm in manual check 3.10 (one issue per forced event).

### F2 — scrubEvent works on serialised JSON and can drop an event

- **Severity**: OBSERVATION · **Impact**: LOW · **Location**: src/lib/sentry-options.ts
- **Detail**: A malformed `Key (x)=(` fragment could make the scrubbed JSON invalid; `beforeSend` then throws and the event is lost (fail-closed). Server-side IP inference is controlled in the Sentry project ("Prevent Storing of IP Addresses").
- **Decision**: ACCEPTED — fail-closed is the safe direction; add the project IP setting to the manual Sentry setup (3.9).

### F3 — No test with the real wrapper; errors before the middleware are not reported

- **Severity**: OBSERVATION · **Impact**: LOW
- **Decision**: ACCEPTED — planned scope (wrapper mocked in tests, covered by smoke and manual checks 3.10-3.11; routing errors out of scope per the plan).
