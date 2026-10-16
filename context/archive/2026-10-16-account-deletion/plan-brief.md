# Usunięcie konta i przekazanie własności grupy (S-15) — Plan Brief

> Full plan: `context/changes/account-deletion/plan.md`
> Frame brief: `context/changes/account-deletion/frame.md`
> Research: `context/changes/account-deletion/research.md`

## What & Why

Użytkownicy mają odchodzić sami, bez e-maila do operatora. Z ramy: **usunięcie konta musi zabrać dane osoby, ale nie dane, z których korzystają inni.** Grupa właściciela przechodzi na innego członka, a taski usuwającego zostają w grupie razem z postępem pozostałych.

## Starting Point

Baza wymusza dziś odwrotność: `groups.owner_id` ma `restrict` (konta właściciela nie da się usunąć), `tasks.created_by` kasuje taski z odznaczeniami wszystkich, a serwer ma tylko klucz anon. Polityka prywatności mówi „There is no delete button yet”. Gotowe są okno `ConfirmAction`, wzorzec funkcji `security definer` (`set_nickname`) i obsługa sesji usuniętego użytkownika (`user_not_found` → wylogowanie).

## Desired End State

Na `/settings` „Delete account” otwiera okno, które mówi, co zniknie i co zostanie; właściciel z członkami wybiera w nim następcę. Po potwierdzeniu konto znika w jednej transakcji, użytkownik ląduje na `/?account=deleted`. Właściciel może też przekazać grupę zwykłą akcją „Transfer ownership”, a nowy właściciel raz widzi baner na dashboardzie.

## Key Decisions Made

| Decision                   | Choice                                                 | Why (1 sentence)                                                                                | Source          |
| -------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------- |
| Los grupy właściciela      | Przetrwa                                               | Inni członkowie nie tracą wspólnej przestrzeni.                                                 | Frame           |
| Taski usuwającego          | Zostają z postępem innych                              | Dane wspólne przeżywają autora.                                                                 | Frame           |
| Następca                   | Właściciel wybiera w oknie                             | Właściciel decyduje, komu ufa.                                                                  | Plan            |
| Jedyny członek-właściciel  | Grupa znika z kontem                                   | Nikt inny jej nie używa.                                                                        | Plan            |
| Zarządca tasków usuniętego | Właściciel grupy po usunięciu, bez zapisu do udziału   | Każdy task ma zarządcę; udział zostaje dobrowolny.                                              | Plan            |
| Przekazanie własności      | Także zwykła akcja w ustawieniach                      | Właściciel może przekazać grupę i potem wyjść.                                                  | Plan            |
| Siła potwierdzenia         | Okno z przyciskiem, bez karencji i ponownego logowania | Okno chroni przed pomyłką; Google nie ma hasła.                                                 | Frame / Plan    |
| Mechanizm usunięcia        | Funkcja `security definer` w bazie                     | Jedna transakcja, bez klucza service-role; `postgres` ma `DELETE` na `auth.users` na produkcji. | Research / Plan |
| Dziennik bezpieczeństwa    | Wpisy usuwającego usuwane                              | Polityka obiecuje go trzymać do usunięcia konta.                                                | Plan            |
| Powiadomienie              | Jednorazowy baner dla nowego właściciela               | Nowy właściciel od razu wie o przejęciu.                                                        | Plan            |
| Po usunięciu               | Landing z komunikatem `role="status"`                  | Potwierdza wynik bez zachęty do ponownego logowania.                                            | Plan            |
| `tasks.created_by`         | `restrict` zamiast `cascade`                           | Usunięcie w panelu Supabase nie skasuje po cichu cudzego postępu (jak `groups.owner_id`).       | Plan            |

## Scope

**In scope:** migracja (funkcje przekazania i usunięcia, flaga banera, `restrict`, czyszczenie dziennika), trasy `groups/transfer`, `groups/dismiss-owner-notice`, `account/delete`, okno z wyborem członka, baner, komunikat na landingu, testy integracyjne i RLS, smoke, e2e, kitchen sink, polityka prywatności, PRD (FR-003, FR-011, FR-012), słownik, N-02/Q-09/INV-02, `CLAUDE.md`, `README.md`, wydanie.

**Out of scope:** karencja i przywracanie, ponowne logowanie, wpisywanie słowa w oknie, automatyczny wybór następcy, powiadomienia dla innych członków, zapis odbiorcy do udziału w taskach, czyszczenie logów aplikacji i Sentry przed retencją.

## Architecture / Approach

Reguły zostają w bazie. `delete_own_account(p_successor)` → `delete_account(uid, successor)`: blokada grupy, przekazanie albo usunięcie grupy, przepisanie tasków na właściciela grupy, usunięcie wpisów dziennika, `delete from auth.users` (kaskada reszty). `transfer_group_ownership(p_new_owner)` ustawia właściciela i flagę banera. Funkcje wewnętrzne z jawnym `user_id` są tylko dla operatora (SQL Editor). Trasy wołają RPC, raportują błąd (`P0003` → `invalid_successor`) i przekierowują; trasa usunięcia woła potem `signOut()`.

## Phases at a Glance

| Phase                  | What it delivers                                | Key risk                                                              |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| 1. Reguły w bazie      | Migracja, typy, testy integracyjne i RLS        | Zła kolejność w funkcji = błąd FK albo taski u usuwającego            |
| 2. Przekazanie i baner | Akcja w ustawieniach, trasy, baner, smoke, e2e  | Kroki smoke'a zakładające stałego właściciela                         |
| 3. Usunięcie konta     | Okno w 4 wariantach, trasa, landing, smoke, e2e | Ciasteczka sesji po usunięciu; pomocniki testów a usunięty użytkownik |
| 4. Dokumenty           | Polityka, PRD, domena, `CLAUDE.md`, `README.md` | Polityka niezgodna z kodem                                            |
| 5. Wydanie             | Merge, `release`, kontrola produkcji, zapis     | Brak uprawnienia do dziennika na produkcji                            |

**Prerequisites:** gałąź planistyczna zmergowana; uprawnienie `DELETE` roli `postgres` na `auth.users` i `auth.audit_log_entries` potwierdzone na produkcji (2026-10-16).
**Estimated effort:** jeden przebieg `/10x-goal-implement` dla Faz 1–4 (jeden PR), potem Faza 5 u właściciela.

## Open Risks & Assumptions

- `DELETE` na `auth.users` i `auth.audit_log_entries` potwierdzono na produkcji 2026-10-16 (wiersz 1.7 odhaczony); późniejsza zmiana uprawnień po stronie Supabase wywróciłaby usunięcie konta.
- Supabase może w przyszłości ograniczyć DML na schemacie `auth`; wtedy potrzebna jest droga przez API admina.
- Usunięcie w panelu Supabase twórcy tasku lub właściciela grupy kończy się błędem „Database error deleting user” (FK `restrict`); operator używa `delete_account` (README).
- Zaakceptowane okno wyścigu: następca, który wychodzi z grupy w tych samych milisekundach co przekazanie, zostawia właściciela spoza grupy (blokada wiersza grupy tego nie zatrzymuje); naprawa ręczna, jak przy oknie w `create_task_participants`.

## Success Criteria (Summary)

- Członek usuwa konto, a jego taski i odznaczenia innych zostają u właściciela grupy.
- Właściciel usuwa konto albo przekazuje grupę, a wybrany członek przejmuje ją z banerem; jedyny członek usuwa grupę razem z kontem.
- Polityka prywatności opisuje dokładnie to, co robi kod.
