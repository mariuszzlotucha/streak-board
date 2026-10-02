<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Observability: failures reach the response and monitoring

- **Plan**: context/changes/observability-swallowed-errors/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension           | Verdict                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Plan Adherence      | PASS                                                                                                 |
| Scope Discipline    | PASS (extras: eslint ignore for context/audits/**, CLAUDE.md sentence, roadmap/change/lessons edits) |
| Safety & Quality    | PASS                                                                                                 |
| Architecture        | PASS                                                                                                 |
| Pattern Consistency | PASS                                                                                                 |
| Success Criteria    | PASS (all automated rows green; manual and production rows pending)                                  |

## Findings

### F1 — EMAIL scrubber also masks `pkg@1.2.3` tokens in stack frames

- **Severity**: OBSERVATION · **Impact**: LOW · **Location**: src/lib/redact.ts:5
- **Decision**: ACCEPTED — only reduces stack readability; fail-safe direction.

### F2 — `auth.unavailable` is error-level on every request during an outage

- **Severity**: OBSERVATION · **Impact**: LOW · **Location**: src/middleware.ts:19
- **Decision**: ACCEPTED — bounded by the Sentry key rate limit and spike protection (README, plan risk section).

### F3 — 7 `console.error` sites left in dashboard.astro and callback.ts

- **Severity**: OBSERVATION · **Impact**: LOW
- **Decision**: ACCEPTED — explicitly out of scope in the plan; S-11 builds on this.

Cross-phase checks: Sentry wrapper covers the middleware body, 503 and unhandled catch; all `unknown`/`forbidden` reports reach Sentry scrubbed, info lines never do; README/CLAUDE.md claims match the code; no DSN or secret in the repo.
