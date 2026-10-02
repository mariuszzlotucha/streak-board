<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Custom domain Implementation Plan

- **Plan**: context/changes/custom-domain/plan.md
- **Mode**: Deep (sub-agent przerwany limitem użycia, trzy twierdzenia zweryfikowane inline z kodu)
- **Date**: 2026-10-02
- **Verdict**: REVISE → SOUND po triage (4 z 4 ustaleń naprawione w plan.md i plan-brief.md; Progress ma 38 wierszy zgodnych 1:1 z kryteriami)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (1 observation) |
| Plan Completeness | WARNING |

## Grounding

13/13 paths ✓, 8/8 symbols ✓, brief↔plan ✓ (2 zdania briefu do zmiany po F1). `docs/reference/contract-surfaces.md` nie istnieje, więc kontrola powierzchni kontraktowych pominięta.

Claims verified (wrangler 4.131.1 `cli.js`, `@cloudflare/vite-plugin` 1.54.8, `@astrojs/cloudflare` 14.3.1, odczyt w głównym checkoucie):

1. Deploy bez `routes` nie rusza domen z panelu: CONFIRMED. Zapisuje je wyłącznie `triggersDeploy` (`cli.js:153664-153696`); odczyty tylko w `:153619` i `:164034`.
2. `workers_dev` i `preview_urls` trafiają do `dist/server/wrangler.json`: CONFIRMED w źródle (`index.mjs:41854-41878`, `:84560-84647`; customizer adaptera w `@astrojs/cloudflare/dist/wrangler.js` ich nie dotyka). Potwierdzenie w runtime zostaje kryterium 4.3.
3. Brak walidacji blokującej deploy bez celów: CONFIRMED. Jest tylko log "No targets deployed" (`cli.js:153913`); `workers_dev` i `preview_urls` są walidowane jako boolean (`:20931-20948`).

Sub-agent (general-purpose) zakończył się błędem limitu użycia (HTTP 429) bez wyników; kontrole wykonał recenzent, więc nie są niezależne od autora planu.

## Findings

### F1 — Wiersze po-release i zapis końcowy nie mają miejsca w żadnym PR

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach; Phase 3 (Changes #3, 3.5, 3.7); Phase 4 (Changes #4, 4.5, 4.6, 4.8-4.12)
- **Detail**: Plan mówi, że każda faza kończy się PR-em z zapisem wyników w `deployment-plan.md`, ale część kryteriów da się spełnić dopiero po merge i wydaniu właśnie tego PR-a: 3.5, 4.5, 4.6, 4.8-4.11, a także 3.7 ("records ... the release run and its result") i 4.12 ("Phase 10 is Done with ... release runs and results"). PR nie może zawierać wyniku własnego releasu, więc zapis końcowy wymaga dodatkowego commita po wydaniu, a plan nie mówi, gdzie ma trafić. Lekcje: faza kończy się commitem, impl-review, pushem i PR-em, a wynik produkcyjny jest notowany po wydaniu. Kryterium 2.1 pokazuje właściwy wzorzec (wynik Fazy 1 sprawdza Faza 2), ale nie zastosowano go dalej. Skutek: /10x-implement nie zamknie Fazy 3 i 4 albo odznaczy wiersze bez dowodu.
- **Fix**: Dopisać regułę "wynik releasu fazy N zapisuje PR fazy N+1", a wynik Fazy 4 i status Done zapisać jednym końcowym commitem dokumentacyjnym po kontrolach (PR `s-06/custom-domain/closing`). Wiersze wymagające własnego releasu są sprawdzane po merge i odznaczane w następnym commicie. Przeformułować 3.7 i 4.12, rozdzielić zapis przed-merge i po-release w Phase 3 #3 i Phase 4 #4, poprawić "4 small PRs" w briefie.
  - Strength: Zachowuje zatwierdzone cztery fazy i wzorzec z 2.1; wynik trafia do repo zgodnie z lekcją o zamykaniu wycinka.
  - Tradeoff: Jeden dodatkowy mały PR (jego release można zatwierdzić albo zostawić jako superseded, bo niesie tylko dokumentację).
  - Confidence: HIGH — w S-05 wiersze 4.6-4.9 odznaczono SHA późniejszych commitów, a wpisy Phase 7-9 w deployment-plan.md powstały po wydaniach.
  - Blind spot: Jak dokładnie /10x-implement traktuje wiersze odznaczane po merge, nie sprawdzałem.
- **Decision**: FIXED (Fix in plan) — dodano regułę "Post-release rows and records" w Implementation Approach, zapis wyniku releasu w następnej fazie (Phase 2 #4, Phase 3 #3, Phase 4 #4), krok 5 "Closing docs commit" w Phase 4, nowe brzmienie 2.9, 3.7, 4.12 i nowy wiersz 4.13, poprawki briefu

### F2 — Worktree bez zależności: polecenia z kryteriów nie uruchomią się

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach; kryteria 1.6, 2.2, 3.4, 4.1-4.4
- **Detail**: Kryteria używają `npx prettier --check`, `npm run lint`, `npx astro check` i `npm run build`, ale ten worktree nie ma `node_modules`, a hooki Husky nie działają (`core.hooksPath=.husky/_`, katalog `.husky/_` nie istnieje). Odtworzone: `prettier --check` na plikach worktree kończy się "Cannot find package 'prettier-plugin-astro'". Lekcja o równoległych worktree wymaga `npm ci` i kopii `.env`/`.dev.vars` przed sesją, która edytuje kod lub uruchamia testy; plan tego nie przenosi.
- **Fix**: Dodać do Implementation Approach punkt "Worktree setup before Phase 1": `npm ci` w worktree (instaluje też hooki przez `prepare`) oraz kopia `.env` i `.dev.vars` z głównego checkoutu przed buildem w Fazie 4.
- **Decision**: FIXED (Fix in plan) — dodano punkt "Worktree setup before Phase 1" w Implementation Approach

### F3 — Niefatalne ostrzeżenie o różnicy konfiguracji i brak szybkiej ścieżki awaryjnej

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (Debug & observability); Phase 4 rollback
- **Detail**: Gdy Worker był ostatnio wdrożony z panelu (`last_deployed_from === "dash"`), deploy pobiera zdalną konfigurację razem z trasami i domenami (`cli.js:164015-164062`), porównuje ją z lokalną i przy różnicy destrukcyjnej loguje "The local configuration ... differs from the remote configuration ... Uploading the Worker will override the remote configuration" (`:164344-164367`). W CI bez `--strict` `deployConfirm` zwraca true (`:163989-164001`), deploy idzie dalej i niczego nie usuwa; z `--strict` przerywa. Plan opisuje tylko "No targets deployed". Ktoś, kto zobaczy to ostrzeżenie po dodaniu domeny, może dopisać `routes` (wbrew decyzji planu) albo `--strict`. Rollback Fazy 4 ("workers_dev: true" i release) jest wolny, gdy nowy host padnie.
- **Fix**: Dodać do Debug & observability dwa zdania (ostrzeżenie jest niefatalne; nie dopisywać `routes` ani `--strict`) oraz do rollbacku Fazy 4: awaryjnie włączyć `workers.dev` w panelu, a trwałą poprawkę zrobić przez PR.
- **Decision**: FIXED (Fix in plan) — dodano ostrzeżenie o niefatalnym komunikacie do Debug & observability oraz ścieżkę awaryjną do rollbacku Fazy 4

### F4 — Drobne nieścisłości zakotwiczeń i sformułowań

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State; Key Discoveries; Phase 1 (#1, 1.7); Phase 2 (#2)
- **Detail**: (a) Renderowanie e-maili w wyspie Leaderboard jest zakotwiczone pod `leaderboard-rules.ts:29,136` (kształt danych); render to `src/components/tasks/Leaderboard.tsx:33`. (b) "Cloudflare's docs do not state the API token permissions" jest szersze niż sprawdzony zakres (jedna strona, Custom Domains, odczyt 2026-10-02). (c) Pre-check 1.7 "lists only the workers.dev entry" pomija możliwy wiersz Preview URLs w panelu; bezpieczniej: "no custom domain or route". (d) Phase 2 #2 wymaga grupy z innym członkiem, a wystarczy zalogowany członek grupy (`showTasks` wymaga tylko grupy, `dashboard.astro:138`, `:335`; własny e-mail jest też w `:444`).
- **Fix**: Poprawić te cztery miejsca, po jednej linii każde.
- **Decision**: FIXED (Fix in plan) — poprawiono cztery miejsca (kotwica Leaderboard.tsx:33, zakres twierdzenia o dokumentacji, pre-check 1.7, warunek w Phase 2 #2)
