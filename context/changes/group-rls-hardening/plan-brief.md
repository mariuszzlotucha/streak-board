# Utwardzenie RLS grup (group-rls-hardening) — Plan Brief

> Full plan: `context/changes/group-rls-hardening/plan.md`

## What & Why

`/code-review` migracji F-01 (commit `9efb772`) wykrył luki w RLS grup; część z nich odtworzyłem na lokalnej bazie. Najgroźniejsze: właściciel może usunąć własne członkostwo i wejść do drugiej grupy (łamie „jedna grupa na użytkownika"), do grupy można dołączyć znając samo UUID (bez `join_code`), a `is_group_member()` jest publiczną wyrocznią członkostwa. Poprawiamy to jedną nową migracją, zanim S-01 zacznie budować na tym schemacie.

## Starting Point

F-01 jest zarchiwizowane (`context/archive/2026-09-25-group-schema-and-rls/`): tabele `groups` i `group_members`, funkcja `is_group_member(uuid, uuid)`, trigger auto-dołączenia właściciela i sześć polityk RLS. Żaden kod aplikacji jeszcze ich nie używa (tylko wygenerowany `src/types.ts`), więc zmiana sygnatur nikogo nie psuje.

## Desired End State

Do grupy dołącza się wyłącznie przez `join_group(p_join_code)`; właściciel zawsze pozostaje członkiem swojej grupy, a zwykły członek może wyjść. Klient zapisuje w `groups` tylko `name` (i `owner_id` przy tworzeniu). Powtarzalny skrypt SQL potwierdza to jednym poleceniem i pada, gdy ktoś zepsuje RLS.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dołączanie do grupy | Funkcja `join_group(p_join_code)` (`SECURITY DEFINER`), bez polityki INSERT na `group_members` | Zamyka obejście `join_code` u źródła i usuwa błąd `INSERT ... RETURNING` (nie ma bezpośredniego insertu). | Plan (użytkownik) |
| Zakres względem S-01 | Dostarczamy tylko stronę bazodanową dołączania; API/UI zostają w S-01 | Wciąga do tej zmiany minimum FR-002 potrzebne do domknięcia luki. | Plan |
| Wyjście z grupy | Zwykły członek może usunąć własny wiersz; właściciel nie może (tylko usunięcie grupy) | Bez tego pomyłkowe dołączenie jest bezwyjściowe przy `UNIQUE(user_id)`; odchodzi od odłożenia w F-01 i wychodzi poza literalne FR-003. | Plan (użytkownik) |
| Wyrocznia członkostwa | `is_group_member(p_group_id)` czyta `auth.uid()` wewnątrz | `REVOKE EXECUTE` nie zadziała — polityki wołają funkcję z uprawnieniami użytkownika. | Plan |
| Kolumny `groups` | Uprawnienia kolumnowe: INSERT `(owner_id, name)`, UPDATE `(name)` | Właściciel nie ustawi trywialnego `join_code` ani nie zmieni `id`. | Plan |
| Długość `join_code` | 12 znaków hex (było 8) | Po zmianie kod jest jedyną bramką, a `join_group` pozwala zgadywać go bez limitu. | Plan |
| Walidacja `name` | `CHECK` 1–80 znaków po `btrim` | Blokuje puste i ogromne nazwy. | Plan |
| Wydajność RLS | `(select auth.uid())` we wszystkich politykach | Unika przeliczania per wiersz; wzorzec skopiują przyszłe tabele. | Plan |
| Weryfikacja | Skrypt `supabase/checks/rls-scenarios.sql` z asercjami, uruchamiany ręcznie | Powtarzalny dla S-01..S-04 bez nowego narzędzia; nie w `supabase/tests/`, żeby nie zostać wzięty za pgTAP. | Plan (użytkownik) |

## Scope

**In scope:** nowa migracja (funkcje, polityki, uprawnienia kolumnowe, `CHECK`, domyślny `join_code`), regeneracja `src/types.ts`, skrypt scenariuszy RLS, jedna podsekcja README.

**Out of scope:** edycja starej migracji, API/UI grup (S-01), rate limiting `join_group`, retry kolizji kodu, rotacja/wygasanie kodów, normalizacja kodu, transfer własności, pgTAP/CI, zastosowanie migracji na produkcji.

## Architecture / Approach

Jedna migracja SQL w kolejności wymuszonej zależnościami: drop polityk zależnych od starej funkcji → drop starej `is_group_member` → create nowych funkcji (`is_group_member(uuid)`, `join_group(text)`) → create polityk i uprawnień kolumnowych. Potem regeneracja typów. Cały projekt migracji został sprawdzony w transakcji z rollbackiem na lokalnej bazie — wszystkie scenariusze dały oczekiwane wyniki.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja utwardzająca + typy | Nowa migracja + odświeżony `src/types.ts`, zweryfikowane `db reset`/lint/build i szybką kontrolą ręczną | Kolejność drop/create; klient S-01 nie może wysyłać `id`/`join_code` w INSERT do `groups` |
| 2. Skrypt scenariuszy RLS | `supabase/checks/rls-scenarios.sql` (PASS/FAIL) + wpis w README; dowód, że pada po celowej mutacji polityki INSERT | Skrypt nie jest w CI — trzeba pamiętać o ręcznym uruchamianiu |

**Prerequisites:** Docker i lokalny Supabase (`npx supabase start`) — potwierdzone; `.env` parsowalny przez CLI.
**Estimated effort:** ~1–2 sesje implementacyjne (2 fazy; migracja prawie gotowa jako prototyp).

## Open Risks & Assumptions

- `join_group` można wywoływać bez limitu; 48-bitowy kod ma to uczynić niepraktycznym — bez rate limitu w bazie, akceptowane.
- `P0002` vs `23505` pozwala sprawdzać ważność kodu bez dołączania — akceptowane przy tej samej entropii.
- Migracja nie zmienia istniejących kodów (8 znaków); `CHECK` na `name` zawiedzie na produkcji, jeśli są tam naruszające wiersze — nie sprawdzono, czy F-01 jest na produkcji (push poza zakresem).
- Self-leave wychodzi poza literalne FR-003; S-02/S-03 muszą zdecydować, co z taskami wychodzącego członka.
- S-01 musi używać `rpc('join_group')` i wysyłać do `groups` wyłącznie `name`/`owner_id` — jego plan powinien to uwzględnić.

## Success Criteria (Summary)

- Bezpośredni INSERT do `group_members` jest odrzucony; `join_group` dołącza tylko z poprawnym kodem.
- Właściciel nie opuści własnej grupy przez usunięcie członkostwa; zwykły członek może wyjść.
- Nie ma publicznej wyroczni członkostwa, a klient nie zmieni `join_code` ani `id`.
- `supabase/checks/rls-scenarios.sql` przechodzi na pełnym schemacie i pada po odtworzeniu starej polityki INSERT na `group_members`.
