# Decyzje właściciela

Stan z 2026-10-16, uzupełniony 2026-10-17 i 2026-10-18. Odpowiedzi właściciela na pytania z `open-items.md` i `open-items-blocked.md`, zadane w rozmowie. Każdy wpis ma decyzję, skutek i to, co zostaje do zrobienia. Źródła pytań Q-01…Q-09: `context/domain/01-domain-distillation.md` §5.

## Produkt i dane

- **Reguła spadku streaka (R-01, R-07, Q-01)**: reguła stoi. Pominięty okres dzieli streak w dół, `floor(value / 2^missed)` (`src/lib/streak-rules.ts:69`), więc streak 1 spada do 0.
  - Skutek: PRD (`context/foundation/prd.md:97`) i sekcja `## Open Questions` (`prd.md:116-118`, dziś „None") do poprawy zgodnie z regułą.
  - Zrobione 2026-10-17 w S-13 (commit `06921d6`, PR #169): PRD §Business Logic i §Open Questions, słownik; punkt o polityce prywatności trafił do opisu streaka na stronie głównej (`src/components/landing/SpreadsheetPitch.astro`), bo polityka nie opisywała reguły spadku.
- **Osierocone taski (Q-02)**: zostają jak dziś. Task twórcy, który opuścił grupę, nie może edytować ani usunąć nikt, dopóki twórca nie wróci (`tasks_update_by_creator`, `tasks_delete_by_creator` w `supabase/migrations/20260930120000_create_tasks.sql`).
  - Do zrobienia: nic.
- **Powrót usuniętego członka (Q-03)**: może wrócić tym samym linkiem, jak dziś. `join_group` (`supabase/migrations/20260925011727_harden_group_rls.sql:56`) sprawdza tylko kod, nie historię członkostwa. Link budowany jest w `src/pages/dashboard.astro:34`. Kod zaproszenia zostaje bez rotacji.
  - Do zrobienia: nic.
- **Okno dat w `task_checkoffs` (Q-04)**: akceptowana luka zaufania. Polityka insert przyjmuje daty od UTC−7 dni do UTC+1 dnia (`supabase/migrations/20261002090000_create_task_checkoffs.sql:63`), więc przez bezpośrednie API da się odznaczyć dzień wstecz albo jutro. Kod bez zmian.
  - Zrobione 2026-10-17 w S-13 (`06921d6`): znana luka w PRD §Open Questions.
- **Poziomy i taski indywidualne (Q-06, R-10, R-11)**: znikają z PRD. Kodu ich nie ma (B-01, B-05 w destylacji).
  - Zrobione 2026-10-17 w S-13 (`06921d6`): PRD §Vision i §Success Criteria bez poziomów i tasków indywidualnych.
- **Taski weekly z datą inną niż poniedziałek (Q-08)**: wynik zapytania na produkcji to 0. Podał go właściciel, nie sprawdzałem tego sam.
  - Do zrobienia: nic.
- **Nazwa członka widoczna dla grupy (Q-05)**: e-mail przestaje być nazwą członka. Decyzje z `/10x-frame nickname` (2026-10-16): członkowie rozpoznają się po nazwie; nick obowiązkowy dla każdego konta, także istniejących; aplikacja może używać imienia przekazywanego przez Google (polityka do zmiany); własny e-mail widoczny tylko na `/settings`; ujawnieniem jest też to, co inny członek dostaje w HTML i z RPC.
  - Decyzje z `/10x-plan nickname` (2026-10-16): unikalność nicka dosłowna w całej aplikacji („Kasia” i „kasia” to dwa nicki; zastąpione 2026-10-17, zob. „Unikalne nazwy”); długość 2–24 znaki po przycięciu, dowolne znaki jak w nazwie grupy; bez backfillu istniejących kont, czyli do pierwszego logowania inni widzą takie konto jako „Unknown member” (świadomy okres przejściowy wobec „inni nigdy nie widzą konta bez nazwy”); imię od Google tylko jako podpowiedź w polu nicka; S-14 idzie przed S-13 i wchodzi do „Done when” M-2.
  - Zrobione 2026-10-16: wycinek S-14 `nickname` według planu `context/archive/2026-10-16-nickname/plan.md` (dwie fazy, dwa wydania; `deployment-plan.md`, Phase 18), zarchiwizowany w PR #154.
- **Unikalne nazwy (2026-10-17)**: tytuł tasku jest unikalny w grupie, nazwa grupy i nick w całej aplikacji. Wszystkie trzy porównywane są bez względu na wielkość liter, po przycięciu spacji, tabulatorów, CR i LF. To zastępuje decyzję S-14 o dosłownej unikalności nicka.
  - Skutek: migracja `20261017150000_unique_names.sql` (indeksy `tasks_group_title_key`, `groups_name_key`, `nicknames_nickname_key` na `lower(...)`), kody błędów `title_taken` i `name_taken`, zdanie w polityce prywatności (zajęta nazwa jest zgłaszana bez wskazania, czyja jest). PR #184.
  - Migracja nie ma backfillu. Przed wdrożeniem produkcja nie miała żadnego konta (właściciel usunął jedyne), więc nie miała duplikatów.
  - Znane ograniczenie (code review #184, niska waga): `lower()` zależy od collation bazy (en_US.UTF-8, libc). Zmiana collation albo wersji glibc mogłaby po cichu zmienić, które nazwy są uznane za równe.
  - Do zrobienia: nic.

## Strażnik migracji i testy

- **Zduplikowana linia allowlisty (2.6)**: blokować, exit 1, jak zakłada plan S-12. Wcześniej strażnik przepuszczał duplikat z dwoma ostrzeżeniami.
  - Zrobione 2026-10-16 w `scripts/migration-guard.mjs`. Kontrola na scratch branchu, który nie był wypychany: dwie identyczne linie exit 1, jedna exit 0 z jednym ostrzeżeniem.
- **Nazwy testów (3.6)**: zmienić na zdania. 42 z 150 nazw w `tests/integration/data-routes.test.ts` zaczynało się od kodu SQLSTATE. Kody zostają w asercjach.
  - Zrobione 2026-10-16 w `tests/integration/data-routes.test.ts`: nazwy opisują przypadek, kody zostają w asercjach.

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
  - Zrobione: plan w `context/archive/2026-10-16-code-review-evals/plan.md` (PR #158), implementacja w PR #159, archiwum w PR #162.
  - Wiązanie werdyktu: zostaje surowszy werdykt z modelu i reguły. Kryterium z planu: sama reguła wiąże tylko przy B = 0 i A ≥ 1 (A: przebiegi zaakceptowanych PR-ów, które oblał sam model; B: przebiegi przypadków z błędem, które wyłapał sam model). Sesja ewaluacji 2026-10-16/17 (`z-ai/glm-5.1`, `new` ×2 na 15 przypadkach, 28 przebiegów z werdyktem, 1,49 USD; poprawka budżetowa właściciela: najwyżej 3 USD, klucz z powłoki) dała A = 0 i B = 0, więc `reviewDiff` zostaje bez zmian. Wyniki w `context/archive/2026-10-16-code-review-evals/eval-results.md`.
  - Zrobione 2026-10-17: właściciel przeczytał `eval-results.md` (wiersz 2.5 planu).
