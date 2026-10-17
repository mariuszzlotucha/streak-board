<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Public Surface Hardening

- **Plan**: context/changes/public-surface-hardening/plan.md
- **Mode**: Deep
- **Date**: 2026-10-17
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓, 2/2 symbols ✓ (`reportInfo`, `contactEmail`), `.well-known` routing ✓ (`node_modules/astro/dist/core/routing/create-manifest.js:95`), brief↔plan ✓

## Findings

### F1 — insertDirective w middleware przed next() nic nie robi

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 §2, Critical Implementation Details
- **Detail**: `insertDirective` zmienia politykę tylko, gdy istnieje `state.result` (`core/fetch/fetch-state.js:511`). Ten powstaje w handlerze strony wewnątrz `next()` (`core/pages/handler.js:30`). Przed `next()` wywołanie jest cichym no-opem, a po `next()` nagłówek jest już zbudowany (`runtime/server/render/page.js:29`).
- **Fix A ⭐ Recommended**: `Astro.csp.insertDirective` w `src/layouts/Layout.astro` w czasie renderowania.
- **Fix B**: Middleware dopisuje origin do `form-action` w gotowym nagłówku.
- **Decision**: FIXED (Fix A)

### F2 — Data buildu przez vite.define nie istnieje w vitest

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4–5
- **Detail**: Konfiguracje vitest nie używają `getViteConfig`, więc stała z `vite.define` jest w testach niezdefiniowana.
- **Fix**: Czysta funkcja `securityTxt(contact, builtAt)` w `src/lib/security-txt.ts`; trasa podaje stałą z fallbackiem.
- **Decision**: FIXED

### F3 — Fałszywy kontekst w middleware.test nie ma csp

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2, §5
- **Detail**: `buildContext` (`tests/integration/middleware.test.ts:34-44`) nie ma `csp`, a `context.csp` jest `undefined` bez configu CSP (`fetch-state.js:476`).
- **Fix**: Middleware nie używa `context.csp`; jedyny krok CSP w middleware to `toReportOnly`.
- **Decision**: FIXED

### F4 — Publiczny /api/csp-report może zaśmiecać logi

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §3
- **Detail**: `reportInfo` nie redaguje pól (`src/lib/log.ts:97-101`).
- **Fix**: Test, że `blocked-uri` i `document-uri` z query logują sam origin i samą ścieżkę.
- **Decision**: FIXED
