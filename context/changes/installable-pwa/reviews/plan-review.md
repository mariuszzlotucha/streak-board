<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Installable PWA (S-17)

- **Plan**: context/changes/installable-pwa/plan.md
- **Mode**: Deep
- **Date**: 2026-10-17
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

9/9 paths ✓, 4/4 symbols ✓ (`reportError`, `requestFields`, `PRODUCTION_BUILD`, `src/lib/site.ts`), brief↔plan ✓. Build run by the verifier: passes.

## Findings

### F1 — Origin check does not cover a JSON POST

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, changes 8 and 12
- **Detail**: Astro rejects a foreign Origin only for form-urlencoded, multipart, text/plain or a missing content-type (`node_modules/astro/dist/core/app/origin-check.js:2-21`); a cross-site JSON POST to `/api/client-errors` passes, so the smoke step "foreign Origin → 403" would fail for JSON.
- **Fix**: Accept only `text/plain` (a sendBeacon string body); any other content-type → 415 with no report.
- **Decision**: FIXED

### F2 — E2E update simulation relies on unverified routing of sw.js

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 13
- **Detail**: Per Playwright 1.63 docs, page/context.route does not see requests handled by a service worker; whether the browser's fetch of the SW script goes through context.route is undocumented.
- **Fix A ⭐ Recommended**: E2E checks registration and no cache; the update logic gets a unit test of `register.ts` with a stubbed `navigator.serviceWorker`; the message is checked on the kitchen sink.
  - Strength: Each part is tested deterministically where it can be.
  - Tradeoff: The full update path in a browser is checked only by hand.
  - Confidence: HIGH — the uncertain mechanism is removed from CI.
  - Blind spot: The real controllerchange in Chromium is checked manually.
- **Fix B**: Keep the e2e update through context.route.
  - Strength: Full automation if it works.
  - Tradeoff: Risk of redesign and flakiness on CI.
  - Confidence: LOW — undocumented behaviour.
  - Blind spot: mobile-chromium.
- **Decision**: FIXED (Fix A)

### F3 — Kitchen-sink state for the message has no place in the structure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1, changes 7 and 12
- **Detail**: States are three arrays (`dashboard-fixtures.ts:21,57,100`) rendered inside `AppLayout`, which takes only `title`, `nickname` and `current` (`dashboard-kitchen-sink.astro:43-69`); `UpdateNotice` lives in `Layout`.
- **Fix**: Add a dev-only `showUpdateNotice` prop on Layout, pass it through AppLayout, and add an `update-notice` state to the dashboard group.
- **Decision**: FIXED

### F4 — Assets and 404 described from the root wrangler.jsonc

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis; changes 5 and 9
- **Detail**: `public/` → `dist/client`. Deploy uses the generated `dist/server/wrangler.json`. The adapter appends its own `/_astro/*` rule to `_headers` (`@astrojs/cloudflare/dist/index.js:475-499`). `404.astro` is rendered by SSR (`handler.js:62-84`).
- **Fix**: Correct the description: `_headers` with no `/_astro` rules, 404 as SSR with no prerender.
- **Decision**: FIXED
