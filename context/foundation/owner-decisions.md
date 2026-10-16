# Decyzje właściciela

Stan z 2026-10-16. Odpowiedzi właściciela na pytania z `open-items.md` i `open-items-blocked.md`, zadane w rozmowie. Każdy wpis ma decyzję, skutek i to, co zostaje do zrobienia. Źródła pytań Q-01…Q-09: `context/domain/01-domain-distillation.md` §5.

## Produkt i dane

- **Reguła spadku streaka (R-01, R-07, Q-01)**: reguła stoi. Pominięty okres dzieli streak w dół, `floor(value / 2^missed)` (`src/lib/streak-rules.ts:69`), więc streak 1 spada do 0.
  - Skutek: PRD (`context/foundation/prd.md:97`) i sekcja `## Open Questions` (`prd.md:116-118`, dziś „None") do poprawy zgodnie z regułą.
  - Do zrobienia: poprawka PRD, polityki prywatności i słownika razem z S-13.
- **Osierocone taski (Q-02)**: zostają jak dziś. Task twórcy, który opuścił grupę, nie może edytować ani usunąć nikt, dopóki twórca nie wróci (`tasks_update_by_creator`, `tasks_delete_by_creator` w `supabase/migrations/20260930120000_create_tasks.sql`).
  - Do zrobienia: nic.
- **Powrót usuniętego członka (Q-03)**: może wrócić tym samym linkiem, jak dziś. `join_group` (`supabase/migrations/20260925011727_harden_group_rls.sql:56`) sprawdza tylko kod, nie historię członkostwa. Link budowany jest w `src/pages/dashboard.astro:34`. Kod zaproszenia zostaje bez rotacji.
  - Do zrobienia: nic.
- **Okno dat w `task_checkoffs` (Q-04)**: akceptowana luka zaufania. Polityka insert przyjmuje daty od UTC−7 dni do UTC+1 dnia (`supabase/migrations/20261002090000_create_task_checkoffs.sql:63`), więc przez bezpośrednie API da się odznaczyć dzień wstecz albo jutro. Kod bez zmian.
  - Do zrobienia: opisać jako znaną lukę w dokumentacji, razem z S-13.
- **Poziomy i taski indywidualne (Q-06, R-10, R-11)**: znikają z PRD. Kodu ich nie ma (B-01, B-05 w destylacji).
  - Do zrobienia: poprawka PRD (`prd.md:20`, `:29`) razem z S-13.
- **Taski weekly z datą inną niż poniedziałek (Q-08)**: wynik zapytania na produkcji to 0. Podał go właściciel, nie sprawdzałem tego sam.
  - Do zrobienia: nic.

## Strażnik migracji i testy

- **Zduplikowana linia allowlisty (2.6)**: blokować, exit 1, jak zakłada plan S-12. Dziś strażnik przepuszcza duplikat z dwoma ostrzeżeniami.
  - Do zrobienia: zmiana strażnika, potem ponowna kontrola 2.6 na scratch branchu, który nie jest wypychany.
- **Nazwy testów (3.6)**: zmienić na zdania. 42 z 150 nazw w `tests/integration/data-routes.test.ts` zaczyna się od kodu SQLSTATE. Kody zostają w asercjach.
  - Do zrobienia: zmiana nazw.

## Zgody i ustawienia

- **Draft PR z celowo czerwonym `integration` (2.8)**: nie robimy. Blokada merge'a nie została sprawdzona ręcznie.
- **Reset lokalnej bazy (4.6, 5.6)**: zgoda na `npx supabase db reset` lokalnie i na scratch migrację, która osłabia `groups_name_length` do `between 1 and 81` (4.6). Produkcja nie jest dotykana.
  - Status: wykonane 2026-10-16. 4.6: `npm test` czerwony po osłabieniu do 81 (9 nieudanych testów w `tests/integration/rule-contracts.test.ts`, z kaskadą), po resecie zielony. 5.6: `db reset`, `test:rls` 300 asercji, `npm test` 743 testy zielone. Szczegóły w `deployment-plan.md`, Phase 17.
- **Dependabot alerts (sekcja 5 w `open-items.md`)**: włączyć w Settings → Code security.
  - Status: włączone 2026-10-16 przez API (`PUT …/vulnerability-alerts`, 204, odczyt 204).
- **CODEOWNERS dla `.github/`**: odroczyć. Powód: jeden właściciel repozytorium.
- **Max rows w API (5.12)**: pominąć. Zostaje jako opcjonalne.

## Plan

- **Utwardzenie AI-recenzenta (`code-review-evals`)**: zaplanować całość przez `/10x-plan`. Obejmuje podrobione znaczniki w diffie, pliki z bajtem NUL, marker `<!-- ai-cr:summary -->`, demo bez limitu diffu, brak testów workflow i wstrzyknięcia podbijające same wyniki. Szczegóły w `open-items-blocked.md`.
  - Do zrobienia: `/10x-plan` dla `code-review-evals`.
