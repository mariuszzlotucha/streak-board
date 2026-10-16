# Nick zamiast e-maila (S-14 `nickname`) — Plan Brief

> Full plan: `context/changes/nickname/plan.md`
> Frame brief: `context/changes/nickname/frame.md`
> Research: `context/changes/nickname/research.md`

## What & Why

> **Rzeczywisty problem, wokół którego należy planować, to**: tożsamością członka w kontrakcie danych, w widoku i w obietnicach aplikacji jest dana logowania (e-mail), którą `list_group_members` zwraca każdemu członkowi grupy; potrzebna jest nazwa członka, obowiązkowa dla każdego konta, która zastępuje e-mail w kontrakcie, w HTML i w obietnicach, a e-mail zostaje widoczny tylko dla właściciela konta w ustawieniach.

Właściciel nie chce pokazywać adresów e-mail użytkowników. Nick obowiązkowy dla każdego konta zastępuje adres w czterech miejscach (lista członków, uczestnicy tasków, tablica wyników, „Signed in as”) oraz w RPC i w tekstach, które dziś obiecują co innego.

## Starting Point

Jedyną etykietą członka jest `u.email` z inner joina `auth.users` w `list_group_members`; płynie przez `GroupMember`, `StandingInput` i `TaskParticipant` do HTML i do propsów wyspy Leaderboard. Middleware czyta tylko sesję, każde logowanie kończy się na `/dashboard`, a każdy harness (smoke, Playwright, Vitest, RLS) tworzy konta bez nicka. Job `compat` uruchamia smoke wdrożonego commitu na migracjach PR-a, a strażnik migracji wymaga linii `-- compat:` przy `drop` i `revoke`.

## Desired End State

Użytkownik bez nicka trafia z każdej ścieżki chronionej na `/account/nickname`, wybiera nazwę (2–24 znaki, unikalna) i dopiero potem widzi dashboard. Grupa widzi nicki wszędzie, a HTML dashboardu nie zawiera żadnego adresu e-mail; własny adres jest tylko na `/settings` w karcie Account. Po drugim wydaniu `list_group_members` nie zwraca już adresu nikomu. Polityka, tekst rejestracji, README, słownik i PRD mówią to samo co kod.

## Key Decisions Made

| Decision                  | Choice                                                                                               | Why (1 sentence)                                                                                                    | Source   |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Zakres                    | Nick w czterech miejscach, także w HTML i RPC; e-mail tylko na `/settings`                           | Ujawnieniem jest też to, co inny członek dostaje w tle.                                                             | Frame    |
| Obowiązkowość             | Nick dla każdego konta, także istniejących; członkowie rozpoznają się po nazwie                      | Etykieta ma być rozpoznawalna, nie tylko rozróżnialna.                                                              | Frame    |
| Dwa wydania               | Wydanie 1 dodaje `nickname` obok `email` w RPC; wydanie 2 usuwa `email`                              | `compat` uruchamia smoke wdrożonego commitu, który dopasowuje adresy.                                               | Research |
| Wymuszenie                | W kodzie aplikacji (middleware), nie w bazie                                                         | Warunek w bazie zepsułby `compat` i `test:rls` w tym samym PR-ze.                                                   | Research |
| Miejsce nicka             | Tabela `public.nicknames`, zapis przez `set_nickname` (SECURITY DEFINER, upsert)                     | `user_metadata` użytkownik zmienia sam z pominięciem reguł; tabela dostaje RLS, CHECK, unikalność i kontrakt TS↔DB. | Plan     |
| Unikalność                | Dosłowna w całej aplikacji; „Kasia” i „kasia” to dwa nicki                                           | Decyzja właściciela; lista członków jednoznaczna, indeks po samej kolumnie.                                         | Plan     |
| Reguły                    | 2–24 punkty kodowe po przycięciu spacji, tabulatora, CR i LF; dowolne znaki                          | Lustrzane wobec `groups_name_length`; CHECK w bazie plus `normalizeNickname` w TS z testem kontraktu.               | Plan     |
| Istniejące konta          | Bez backfillu; do pierwszego logowania inni widzą „Unknown member”                                   | Decyzja właściciela: najprostsza migracja, świadomy okres przejściowy.                                              | Plan     |
| Imię od Google            | Tylko podpowiedź w polu nicka (`full_name`, potem `name`)                                            | Jedna ścieżka dla wszystkich kont; użytkownik decyduje, co zobaczy grupa.                                           | Plan     |
| Rodzina tras              | `/account/nickname` i `POST /api/account/nickname`; `PROTECTED_ROUTES` += `/account`, `/api/account` | Nick należy do konta, nie do grupy; strażnik tras i README dostają nową rodzinę, OPP-10 zostaje osobną zmianą.      | Plan     |
| Przekierowanie po zapisie | Pierwszy wybór → `/dashboard`, zmiana → `/settings`                                                  | Oczekujące zaproszenie konsumuje dashboard; zmiana wraca tam, skąd przyszła.                                        | Plan     |
| Remis na tablicy (N-18)   | Po nicku małymi literami, potem `userId`                                                             | Ta sama reguła co dziś z nowym kluczem; działa identycznie na serwerze i w wyspie.                                  | Plan     |
| Roadmapa                  | S-14 przed S-13 i w „Done when” M-2                                                                  | S-14 jest planowany, S-13 nie ma folderu; siatka powstaje od razu z nickami.                                        | Plan     |

## Scope

**In scope:** tabela `nicknames` z RLS i `set_nickname`; `list_group_members` z `nickname` (wydanie 1) i bez `email` (wydanie 2); brama w middleware z `locals.nickname`; strona `/account/nickname`, formularz i trasa; „Signed in as” z nickiem; karta Account na `/settings`; `GroupMember`, `StandingInput`, `TaskParticipant` i trzy widoki na nicku; fixture'y i stany kitchen sinka; smoke, e2e, Vitest, RLS z nickami; polityka prywatności, tekst rejestracji, README, CLAUDE.md, słownik, destylacja, PRD FR-010, plan wdrożenia.

**Out of scope:** backfill istniejących kont; unikalność bez względu na wielkość liter; automatyczne przyjęcie imienia od Google; pole nicka przy rejestracji; wymuszenie nicka w bazie; OPP-10; historia zmian i usuwanie nicka; zdjęcie od Google; zmiany w `/api/auth/*` i w zaproszeniach; baseline'y zrzutów.

## Architecture / Approach

Middleware po sprawdzeniu sesji czyta własny wiersz `nicknames` na każdej ścieżce chronionej (`/dashboard`, `/settings`, `/account`, `/api/groups`, `/api/tasks`, `/api/account`), kładzie wynik w `locals.nickname` i bez wiersza przekierowuje na `/account/nickname` (strona i jej trasa są wyjątkiem; błąd odczytu to 503). Strona nicka to `AppLayout` + `NicknameView` + formularz React, trasa woła `set_nickname` i mapuje 23505/23514 na `nickname_taken`/`invalid_nickname`. `listGroupMembers` rzutuje wiersze RPC na cztery pola bez `email`, więc adres nie trafia do `DashboardData` ani do propsów wyspy, nawet dopóki RPC go zwraca; widoki i remis działają na `nickname`. Wydanie 2 usuwa kolumnę z RPC, gdy tag `production` wskazuje kod wydania 1.

## Phases at a Glance

| Phase                                                   | What it delivers                                                                                                                   | Key risk                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Nick: schemat, brama, widoki i obietnice (wydanie 1) | Tabela i funkcja, RPC z `nickname`, brama, strona i trasa, karta Account, widoki na nicku, wszystkie harnessy i dokumenty; release | Duży PR dotykający siedmiu harnessów; `compat` wymaga, by migracja A zostawiła `email` z prawdziwym adresem |
| 2. Wydanie 2: `list_group_members` bez e-maila          | Migracja B, typy, asercje RLS i integracyjne, Phase 18 w planie wdrożenia; release                                                 | PR otwarty za wcześnie (tag sprzed fazy 1) zaczerwieni `compat`                                             |

**Prerequisites:** scalony PR planistyczny z gałęzi `s-14/nickname/plan`; lokalny stos Supabase (`supabase start`) i tylko jedna sesja na raz z testami bazodanowymi; zatwierdzanie `release` w środowisku `production` przez właściciela; faza 2 dopiero po przesunięciu tagu `production` na kod fazy 1.
**Estimated effort:** ~3–4 sesje na fazę 1 (jeden przebieg `/goal` albo trzy mniejsze sesje: schemat, brama i widoki, harnessy i dokumenty) plus ~1 sesja na fazę 2; dwa zatwierdzenia `release` i dwie kontrole produkcji.

## Open Risks & Assumptions

- Klucze `user_metadata` konta Google (`full_name`, `name`) znane tylko z lektury źródeł GoTrue; bez klucza pole zostaje puste, co sprawdza właściciel na produkcji (wiersz 1.20).
- Między wydaniem 1 a 2 `list_group_members` nadal zwraca `email` każdemu członkowi grupy; HTML już go nie zawiera, ale zapytanie PostgREST z własnym tokenem tak. Polityka opisuje, co aplikacja pokazuje; okno zamyka faza 2.
- Konta sprzed wdrożenia są dla innych „Unknown member” do pierwszego logowania; liczba takich kont na produkcji nie jest nigdzie zapisana (właściciel może ją sprawdzić zapytaniem w SQL Editorze).
- CLI Supabase stosuje plik migracji w jednej transakcji (założenie z zachowania narzędzia, nie z repo); gdyby nie, okno między `drop` a `create` dałoby wdrożonemu `/dashboard` jedno 503 jak przy chwilowej awarii.
- Bezpośrednie wywołanie `join_group` przez PostgREST omija bramę; taki członek jest „Unknown member”. Akceptowane, kandydat do osobnej zmiany po wydaniu 2.
- Liczba asercji RLS zmienia się (dziś 300); dokumenty, które ją cytują, dostają nową liczbę w fazie 1 i w Phase 18.

## Success Criteria (Summary)

- Użytkownik bez nicka nie zobaczy dashboardu ani nie wykona akcji grupowej, a po wyborze nicka wszystkie cztery miejsca pokazują nick; drugi taki sam nick jest odrzucany z komunikatem.
- HTML dashboardu nie zawiera żadnego adresu e-mail (smoke wyklucza wszystkie trzy adresy w każdym kroku), a po wydaniu 2 `list_group_members` nie ma kolumny `email` (test integracyjny i asercja RLS).
- `compat` zielony na obu PR-ach, oba `release` zatwierdzone, obie kontrole produkcji zapisane w `deployment-plan.md` Phase 18; polityka, rejestracja, README, słownik i PRD mówią to samo co kod.
