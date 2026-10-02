<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Observability: failures reach the response and monitoring

- **Plan**: context/changes/observability-swallowed-errors/plan.md
- **Scope**: Phase 2 of 3
- **Reviewed phases**: 2
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations

## Verdicts

| Dimension           | Verdict                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| Plan Adherence      | PASS (all 5 items MATCH; responses, redirects and outcome shapes unchanged) |
| Scope Discipline    | PASS                                                                        |
| Safety & Quality    | PASS                                                                        |
| Architecture        | PASS                                                                        |
| Pattern Consistency | PASS (13 handlers uniform)                                                  |
| Success Criteria    | PASS (automated 2.1-2.7 green; manual 2.8-2.12 pending)                     |

## Findings

### F1 — `data.length` without a null guard in uncheck

- **Severity**: OBSERVATION · **Impact**: LOW · **Dimension**: Safety & Quality · **Location**: src/lib/checkoffs.ts:95
- **Detail**: The client always returns an array after `.select()` on a delete.
- **Decision**: SKIPPED — the type is non-null, a guard would be flagged by `no-unnecessary-condition`.

### F2 — Bare invite code in an error message is not scrubbed

- **Severity**: OBSERVATION · **Impact**: LOW · **Dimension**: Safety & Quality · **Location**: src/lib/redact.ts
- **Detail**: Only `/join/<code>` and `Key (…)=(…)` are masked, as planned; the join RPC does not echo the code today.
- **Decision**: ACCEPTED — planned scope; revisit if an RPC starts echoing the code.

### F3 — Uniformity of the 13 handlers

- **Detail**: No inconsistency. **Decision**: ACCEPTED (no action).

### F4 — signout has no `.exception` path

- **Detail**: Unchanged from before; plan only asks for the returned error. **Decision**: ACCEPTED.

### F5 — Test coverage gaps (10 of 13 handlers have no route test, no `safely` test)

- **Detail**: Plan asked for one representative route per kind; handlers are mechanically identical. **Decision**: ACCEPTED.
