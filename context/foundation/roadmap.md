---
project: "StreakBoard"
version: 1
status: draft
created: 2026-09-24
updated: 2026-09-24
prd_version: 1
main_goal: market-feedback
top_blocker: time
milestone_id: first-group-checkin-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: StreakBoard

> Derived from context/foundation/prd.md (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pierwszy pełny cykl: grupa → task → odznaczenie → tablica wyników** — Status: open

- **Intent:** Dostarczyć kompletny, widoczny dla użytkownika przepływ z Primary Success Criterion PRD: zalogowany użytkownik zakłada lub dołącza do grupy, tworzy lub dołącza do tasku, odznacza go jako wykonany i widzi swój wynik na tablicy wyników grupy — pierwsza pełna walidacja hipotezy produktu z realną grupą znajomych.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** F-01 oraz S-01 do S-04 poniżej mają status `done`.
- **Scope anchors:** FR-001 do FR-009, US-01 (pełne pokrycie PRD w tym kamieniu milowym — PRD nie ma jeszcze drugiej transzy).

## Vision recap

Grono znajomych korzystało wcześniej ze wspólnego arkusza Google, w którym ręcznie kolorowało komórki na zielono/czerwono, żeby widzieć nawzajem swoją konsekwencję w budowaniu nawyków — wartość dawała widoczność dla innych, ale ręczne prowadzenie było na tyle męczące, że narzędzie przestało być używane. Istniejące aplikacje do nawyków są projektowane dla pojedynczego użytkownika i nie obsługują modelu, w którym kilka osób śledzi ten sam cel równolegle; StreakBoard automatyzuje dokładnie ten sam prosty widok siatki i dodaje grywalizację (streaki), której arkusz nigdy nie miał.

## North star

**S-04: Użytkownik odznacza task jako wykonany i widzi wynik w tablicy grupy** — to jedyna historyjka użytkownika w PRD (US-01) i dosłownie odpowiada Primary Success Criterion; jeśli to nie zadziała (odznaczenie nie jest natychmiastowe, albo tablica wyników nie motywuje), reszta produktu nie ma sensu.

> Gwiazda przewodnia (ang. north star) to najmniejszy kompleksowy wycinek widoczny dla użytkownika, którego dostarczenie jako pierwsze potwierdza główną hipotezę produktu — umieszczony tak wcześnie, jak pozwalają jego zależności, bo wszystko inne ma znaczenie tylko wtedy, gdy to zadziała. Tutaj gwiazda przewodnia ląduje na końcu łańcucha zależności celowo: żeby odznaczyć task, użytkownik musi mieć grupę (S-01) i task, do którego jest zapisany (S-02, S-03) — to prawdziwe zależności, nie sztuczne opóźnienie.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                  | Prerequisites | PRD refs                              | Status   |
| ---- | -------------------------- | ------------------------------------------------------------------------ | -------------- | ---------------------------------------- | -------- |
| F-01 | group-schema-and-rls       | (foundation) schemat grup/członkostwa + RLS wg guardrail widoczności     | —              | Access Control, Guardrail                | ready    |
| S-01 | group-create-join-manage   | założyć/dołączyć do grupy przez link/kod; jako twórca zarządzać grupą     | F-01           | FR-001, FR-002, FR-003                   | proposed |
| S-02 | task-create-and-manage     | utworzyć task w grupie; jako twórca edytować/usunąć swój task            | S-01           | FR-004, FR-005                           | proposed |
| S-03 | task-join-and-leave        | dołączyć do tasku innego członka i wypisać się z niego                   | S-02           | FR-006, FR-007                           | proposed |
| S-04 | checkoff-and-leaderboard   | odznaczyć task jako wykonany i od razu zobaczyć tablicę wyników grupy    | S-03           | FR-008, FR-009, US-01, Business Logic    | proposed |

## Baseline

What's already in place in the codebase as of `2026-09-24` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 7 + React 19 + Tailwind 4 + jeden komponent shadcn/ui (`src/components/ui/button.tsx`); istnieją tylko strony auth i pusty dashboard (`src/pages/dashboard.astro`), brak stron domenowych.
- **Backend / API:** partial — konwencja Astro API routes działa dla auth (`src/pages/api/auth/*.ts`); brak endpointów domenowych.
- **Data:** absent — klient Supabase podłączony (`src/lib/supabase.ts`), ale brak migracji/tabel/seed danych (`supabase/migrations/` nie istnieje).
- **Auth:** partial — logowanie email/hasło + middleware sesji działa (`src/middleware.ts`, chroni `/dashboard`), ale brak modelu grup/ról/RLS.
- **Deploy / infra:** present — aplikacja już wdrożona na Cloudflare Workers (`https://10x-astro-starter.mariusz-zlotucha.workers.dev`), CI (lint/build/smoke) działa, deploy pozostaje manualny (`wrangler deploy`).
- **Observability:** absent — brak logowania strukturalnego, error trackingu, korelacji requestów.

## Foundations

### F-01: Schemat grup i RLS dla widoczności per-grupa

- **Outcome:** (foundation) w bazie Supabase istnieją tabele grup i członkostwa (`groups`, `group_members`) wraz z politykami RLS wymuszającymi guardrail „widoczność tylko dla własnej grupy”.
- **Change ID:** group-schema-and-rls
- **PRD refs:** Access Control (model dwupoziomowy grupa/task), Success Criteria Guardrail („widoczność tylko dla własnej grupy”)
- **Unlocks:** S-01, S-02, S-03, S-04 — każdy z nich czyta/zapisuje dane w kontekście grupy przez ten schemat i te polityki
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Błąd w RLS na tym etapie po cichu łamie guardrail (wyciek widoczności między grupami) dla każdego kolejnego wycinka — warto to domknąć, zanim jakakolwiek praca pionowa na tym wyląduje.
- **Status:** ready

## Slices

### S-01: Założenie i zarządzanie grupą

- **Outcome:** użytkownik może założyć grupę, dołączyć do istniejącej grupy przez link/kod, a jako jej twórca — usunąć grupę lub usunąć z niej członka.
- **Change ID:** group-create-join-manage
- **PRD refs:** FR-001, FR-002, FR-003
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To pierwsza jednostka nadrzędna, pod którą zagnieżdża się wszystko dalej — dobry podział uprawnień twórca/członek tutaj oszczędza przeróbek w S-02/S-03.
- **Status:** proposed

### S-02: Tworzenie i zarządzanie taskiem

- **Outcome:** użytkownik może utworzyć task w swojej grupie (jednorazowy lub powtarzalny: dziennie/tygodniowo), a jako jego twórca — edytować go lub usunąć.
- **Change ID:** task-create-and-manage
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kształt pola cykliczności (dziennie/tygodniowo) wybrany tutaj determinuje logikę streaka w S-04 — ustalić go świadomie, żeby uniknąć migracji wstecz.
- **Status:** proposed

### S-03: Dołączanie i wypisywanie się z tasku

- **Outcome:** użytkownik może dołączyć (zapisać się) do tasku stworzonego przez innego członka grupy i wypisać się z tasku, do którego jest zapisany.
- **Change ID:** task-join-and-leave
- **PRD refs:** FR-006, FR-007
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wypisanie się w trakcie trwającego streaka rodzi pytanie UX (co dzieje się z dotychczasowym streakiem) — wystarczająco małe, żeby rozstrzygnąć je w `/10x-plan`, nie tutaj.
- **Status:** proposed

### S-04: Odznaczenie tasku i tablica wyników

- **Outcome:** użytkownik odznacza wystąpienie tasku jako wykonane i natychmiast widzi zaktualizowany wynik w tablicy wyników swojej grupy.
- **Change ID:** checkoff-and-leaderboard
- **PRD refs:** FR-008, FR-009, US-01, Business Logic
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Dokładna wartość, o jaką spada streak za pominięty dzień/okres (PRD: „wartość mniejsza niż jego pełny stan”, bez konkretnej liczby) — Owner: user. Block: no — `/10x-plan` może przyjąć rozsądną wartość domyślną; PRD celowo nie wymaga konfigurowalności na MVP.
- **Risk:** To jest gwiazda przewodnia — jeśli odznaczenie nie jest odczuwalnie natychmiastowe (guardrail) albo tablica wyników nie działa poprawnie, cała hipoteza produktu pozostaje niepotwierdzona mimo ukończenia reszty mapy drogowej.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                          | Ready for `/10x-plan` | Notes                              |
| ---------- | -------------------------- | ------------------------------------------------------------------ | ----------------------- | ------------------------------------ |
| F-01       | group-schema-and-rls       | Schemat danych grup/członkostwa + RLS per-grupa                    | yes                     | Run `/10x-plan group-schema-and-rls` |
| S-01       | group-create-join-manage   | Założenie grupy, dołączanie przez link/kod, zarządzanie grupą      | no                      | Czeka na F-01                        |
| S-02       | task-create-and-manage     | Tworzenie i zarządzanie taskiem w grupie                           | no                      | Czeka na S-01                        |
| S-03       | task-join-and-leave        | Dołączanie/wypisywanie się z tasku                                 | no                      | Czeka na S-02                        |
| S-04       | checkoff-and-leaderboard   | Odznaczenie tasku + tablica wyników (streak)                       | no                      | Czeka na S-03; gwiazda przewodnia    |

## Open Roadmap Questions

1. **Czy logowanie OAuth/passwordless (część literalnego brzmienia FR-001) jest potrzebne na MVP, czy wystarczy już działające logowanie email+hasło?** — Owner: user. Block: roadmap-wide (informacyjne, nie blokuje żadnego wycinka — obecny mechanizm logowania wystarcza do przejścia całego przepływu S-01 → S-04).

## Parked

- **Wiele grup na jednego użytkownika** — Why parked: PRD §Non-Goals; upraszcza model danych i UI na MVP.
- **Konfigurowalne (admin/głosowanie) tempo spadku streaka** — Why parked: PRD §Non-Goals; stała reguła dla wszystkich grup na MVP, konfigurowalność to pomysł na dużo większą skalę.
- **Weryfikacja/anti-cheat wykonania tasku** — Why parked: PRD §Non-Goals; system oparty na zaufaniu w gronie znajomych.
- **Działanie offline** — Why parked: PRD §Non-Goals; aplikacja wymaga połączenia z internetem na MVP.
- **Powiadomienia/przypomnienia o niewykonanym tasku** — Why parked: PRD §Success Criteria Secondary; poza pierwszym widocznym przepływem.
- **Historia/statystyki długoterminowe (wykresy streaków w czasie)** — Why parked: PRD §Success Criteria Secondary.
- **Automatyczny deploy na merge (CI/CD)** — Why parked: `context/changes/deployment/deployment-plan.md` jawnie wyklucza to z zakresu; deploy pozostaje manualny (`wrangler deploy`) na MVP.
- **Domena własna / środowisko staging** — Why parked: `context/foundation/infrastructure.md` i deployment-plan.md — poza zakresem.
- **Observability (logowanie strukturalne, error tracking)** — Why parked: żaden FR must-have tego nie wymaga przy obecnej skali (grono znajomych); rozważyć ponownie, jeśli grupa urośnie (per Risk Register w infrastructure.md).

## Milestone History

(brak — to pierwszy kamień milowy)

## Done

(brak — żaden wycinek jeszcze nie ukończony)
