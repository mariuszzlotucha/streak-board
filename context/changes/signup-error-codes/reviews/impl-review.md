<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Signup error codes and remembered email

- **Plan**: context/changes/signup-error-codes/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Remembered-email cookie is validated on write but not on read

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth-email.ts:24
- **Detail**: `rememberEmail` enforces trim and a 254-character cap, but `takeRememberedEmail` returns whatever the browser sends. A hand-crafted `auth_email` cookie (malformed percent-encoding, very long value) is prefilled as-is. Verified: the value is HTML-escaped (`<script>` came out as `&lt;script&gt;`), and a malformed value does not 500, so this is self-inflicted cosmetic noise only, not an injection.
- **Fix**: Return `""` from `takeRememberedEmail` when the value is longer than `MAX_EMAIL_LENGTH`, so both sides share one rule.
- **Decision**: FIXED — Fix now: oversized cookie values are dropped on read
