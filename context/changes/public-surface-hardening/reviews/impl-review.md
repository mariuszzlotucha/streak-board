<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Public Surface Hardening

- **Plan**: context/changes/public-surface-hardening/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Success criteria: on HEAD 683d431, `npm run test:unit` passed (638/638), `npm run lint` passed and `npx astro check` reported 0 errors. `npm test` (1096/1096), `npx playwright test` (29/29) and `npm run smoke` passed at the phase-2 gate on the same code (dca1b1b). Manual rows 1.5–1.6 and 2.6–2.13 are pending; none is falsely checked.

## Findings

### F1 — csp-report loguje ścieżkę i dyrektywę bez maskowania

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/csp-report.ts:113
- **Detail**: `reportInfo` loguje kontekst bez zmian (`src/lib/log.ts:97-101`). `path` traci query, ale zostawia segmenty, więc spreparowany raport z `/join/<code>` albo z adresem e-mail w ścieżce trafi do logu. Polityka prywatności (`src/components/privacy/WhatWeCollect.astro:40`) obiecuje maskowanie e-maili i kodów zaproszeń, a repo ma do tego `scrubSecrets` (`src/lib/redact.ts:10`). Endpoint jest publiczny, więc może to wysłać każdy.
- **Fix**: Przepuścić `path` i `directive` przez `scrubSecrets` (i ograniczyć `directive` do `[a-z-]+`), z testami dla `/join/abc` i e-maila w ścieżce.
- **Decision**: FIXED

### F2 — Jeden raport może zapisać kilkadziesiąt linii logu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/csp-report.ts:112-115
- **Detail**: Partia Reporting API może nieść wiele naruszeń; 8 KiB to około 40 linii `csp.violation` z jednego POST-a bez limitu.
- **Fix**: Logować najwyżej 5 naruszeń na żądanie (test na partię 6+).
- **Decision**: FIXED

### F3 — readAtMost skopiowane z client-errors

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/csp-report.ts:12-31
- **Detail**: Funkcja jest identyczna z `src/pages/api/client-errors.ts:10-29`.
- **Fix**: Przenieść `readAtMost` do `src/lib/read-body.ts` i używać w obu trasach.
- **Decision**: FIXED

### F4 — Brak komentarza, dlaczego JSON bez sprawdzania originu jest w porządku

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/csp-report.ts (handler POST)
- **Detail**: `client-errors.ts` wprost tłumaczy, że przyjmuje tylko `text/plain`, bo JSON z obcego originu ominąłby sprawdzanie Astro. `csp-report` świadomie przyjmuje JSON i tego nie wyjaśnia.
- **Fix**: Jedna linia komentarza: przeglądarki wysyłają raporty bez ciasteczek z dowolnej strony, więc trasa nic nie autoryzuje i tylko loguje znormalizowane pola.
- **Decision**: FIXED
