<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Installable PWA (S-17)

- **Plan**: context/changes/installable-pwa/plan.md
- **Scope**: Phase 1 of 2 (Phase 2 is Manual only, after the release)
- **Reviewed phases**: 1
- **Date**: 2026-10-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Plan adherence: 14/14 planned changes MATCH. Small deviations (icon script imports `sharp` directly; update checks on `visibilitychange`; extra smoke/e2e assertions) are documented in the run report and the README. Nothing from "What We're NOT Doing" appears.

Success criteria (HEAD f74dabf): lint ✓, token-contrast ✓, astro check + build ✓, test:unit 525/525 ✓, all re-run during the review. Smoke 329/0 ✓, e2e 23/23 ✓ and `npm test` 934/934 ✓ were run in the goal run on 3f29bf6, the same code. Manual 1.8–1.11 are pending; 1.8 is in fact done (the note is in the plan), but only the owner ticks it.

## Findings

### F1 — Body size checked only after reading the whole body

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/client-errors.ts:19
- **Detail**: `await context.request.arrayBuffer()` buffers the full body before the 256-byte check, so a large POST to a public route costs Worker memory and CPU before it gets a 400.
- **Fix**: Reject early on `Content-Length` > 256 (413). Without the header, read `request.body` as a stream and stop after 257 bytes. Add a unit test for both.
- **Decision**: FIXED — 413 on a declared Content-Length > 256 before reading; the stream is read up to 257 B; unit tests for both paths; README updated

### F2 — Public endpoint can flood the Sentry quota

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/client-errors.ts:27
- **Detail**: The origin check stops browser cross-site POSTs, but `curl` with no Origin and body `sw_register_failed` passes; each request creates one Sentry error. The plan explicitly left out a rate limit ("What We're NOT Doing"), so this is a known, accepted risk, but it is unrecorded where an operator would look.
- **Fix A ⭐ Recommended**: Keep `reportError` and record the residual risk in README "Observability" (and the plan's NOT-doing note). `reportError` already sets the fingerprint `[event, code]` (`src/lib/log.ts:81`), so a flood collapses into one Sentry issue and doesn't bury real errors.
  - Strength: No code change; it stays within the plan's "no rate limit"; operators know where the risk is.
  - Tradeoff: A flood still uses event quota.
  - Confidence: HIGH — fingerprint confirmed in code.
  - Blind spot: The quota size on the current Sentry plan.
- **Fix B**: A Cloudflare rate-limit/WAF rule for `/api/client-errors` (owner, dashboard).
  - Strength: Actually stops the flood at the edge.
  - Tradeoff: A dashboard step outside the repo; the Free plan has a limited number of rules.
  - Confidence: MED — not checked on this account.
  - Blind spot: Available rules on the Workers Free plan.
- **Decision**: FIXED (Fix A) — residual risk written into README "Observability"

### F3 — "New version" notice on every release

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: public/sw.js:7-21, src/lib/pwa/register.ts:16-18
- **Detail**: Every release changes `sw.js` only if its bytes change — but the notice fires on `controllerchange`, i.e. only when `sw.js` itself changes. Because `sw.js` is static, releases that don't touch it show no notice, and code updates still reach the user on the next navigation (no cache). The notice therefore appears only on SW changes, not on every app release.
- **Fix**: None needed for S-17; if a notice per app release is wanted later, version `sw.js` per build.
- **Decision**: SKIPPED
