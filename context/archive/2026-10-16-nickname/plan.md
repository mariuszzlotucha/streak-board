# Nick zamiast e-maila (S-14 `nickname`) Implementation Plan

## Overview

Tożsamością członka grupy jest dziś adres e-mail: `list_group_members` zwraca go każdemu członkowi, widoki drukują go w liście członków, przy uczestnikach tasków, na tablicy wyników i w linii „Signed in as”, a teksty przy rejestracji i w polityce prywatności to obiecują. Ten plan wprowadza obowiązkowy nick, który zastępuje e-mail w kontrakcie danych, w HTML i w obietnicach aplikacji. Własny e-mail zostaje widoczny tylko dla właściciela konta na `/settings`. Zmiana idzie w dwóch wydaniach, bo job `compat` uruchamia smoke wdrożonego commitu na migracjach PR-a: wydanie 1 dodaje nick obok e-maila w RPC i przełącza na niego cały kod, wydanie 2 usuwa e-mail z RPC.

## Current State Analysis

Źródła: `context/changes/nickname/frame.md` (rama, pewność WYSOKA) i `context/changes/nickname/research.md` (badanie, status `complete`). Tabela hipotez z ramy w skrócie:

| Hipoteza                                                                   | Werdykt | Dowód                                                                                                                                                             |
| -------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nie ma etykiety innej niż e-mail dla żadnego konta                         | SILNE   | rejestracja zbiera e-mail i hasło; `user_metadata` nieczytane nigdzie w `src/`; `UNKNOWN_MEMBER` obsługuje tylko brak e-maila (`src/lib/leaderboard-rules.ts:39`) |
| Zamiana w widoku zostawia e-maile w danych                                 | SILNE   | RPC zwraca `u.email` (`supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:19,24`); wyspa `Leaderboard client:load rows={board.totals}`      |
| „Signed in as” to inna klasa (widzi tylko właściciel konta)                | SILNE   | `src/layouts/AppLayout.astro:46-48`, ostatni element w `<main>`; prop `email` z `dashboard.astro:37` i `settings.astro:19`                                        |
| Skrót z MVP stał się kontraktem (identyfikacja po e-mailu to decyzja S-01) | SILNE   | S-01 „members are identified by email”; S-09 dopisał obietnicę do rejestracji i polityki; S-11 odłożył display names; słownik: „nie wprowadzaj bez decyzji”       |

Co istnieje i co wiąże plan:

- **Jedna droga e-maila**: inner join `auth.users` w `list_group_members` (`:24`), grant dla `authenticated` (`:31`). Od RPC do HTML przez `GroupMember.email` (`src/lib/groups.ts:14`), `buildBoard` (`src/lib/leaderboard-rules.ts:136`), `participantsResolver` (`src/lib/dashboard-data.ts:168-171`) do `MembersCard.astro:32,42,44`, `TaskRow.astro:78`, `Leaderboard.tsx:32` i propsów wyspy (`DashboardView.astro:93`).
- **Pipeline żądania**: middleware woła tylko `auth.getUser()` (`src/lib/auth-state.ts:34`), `locals.user` to pełny `User` z `user_metadata` (`src/env.d.ts:3`); `PROTECTED_ROUTES = ["/dashboard", "/settings", "/api/groups", "/api/tasks"]` (`src/middleware.ts:8`), dopasowanie po równości albo prefiksie z `/` (`:29`). Każde logowanie i zaproszenie kończy się na `/dashboard`; ciasteczko `join_code` żyje 3600 s i nie jest ruszane po drodze.
- **Bramki CI**: `compat` (`.github/workflows/ci.yml:217-273`) buduje commit z tagu `production` i uruchamia jego smoke na migracjach PR-a; strażnik migracji flaguje `drop`, `create or replace` istniejącej funkcji i `revoke`, a linia `-- compat: <tekst>` zdejmuje flagi (`scripts/migration-guard.mjs:286-322`); strażnik pokrycia tras pinuje katalogi `["groups","tasks"]` i 13 plików (`tests/integration/data-routes.test.ts:1129,1135`); `npm run types:check` porównuje `src/types.ts` z lokalnym schematem.
- **Konwencje schematu**: zapis do danych członkostwa idzie przez funkcję SECURITY DEFINER (`join_group`, `group_members` bez polityk INSERT/UPDATE); każda tabela ma `revoke all … from anon, authenticated` i jawne granty; polityki `<tabela>_<operacja>_<zakres>` z `(select auth.uid())`; CHECK `<tabela>_<kolumna>_<reguła>`; reguły duplikowane w TS i SQL mają test kontraktu (`tests/integration/rule-contracts.test.ts`).
- **Wzorzec formularz + trasa**: `GroupSettingsCard.astro` → `RenameGroupForm.tsx` (walidacja z `group-rules.ts`, natywny POST, `FormField`, `SubmitButton`) → `src/pages/api/groups/rename.ts` (`prerender = false`, brak usera → `/auth/signin`, normalizacja → `?error=`, `reportMapped`, sukces → `/dashboard`) z mapowaniem w `src/lib/group-errors.ts`.
- **Harnessy tworzą konta bez nicka i oczekują `/dashboard`**: smoke (3 konta przez `POST /api/auth/signup`, `scripts/smoke.mjs:703-705,959-961,1167-1169`), Playwright (`scripts/e2e-user.mjs:87-99` drukuje dokładnie dwie linie env; `auth.setup.ts:21` i `helpers.ts:25` czekają na `**/dashboard`; persony `tests/e2e/local-supabase.ts:91-106`; rejestracja przez UI w `invite-join.spec.ts:53-71`), Vitest (`tests/helpers/supabase.ts:33-48`), RLS (`mk_user` wstawia do `auth.users (id, email)`, `supabase/checks/rls-scenarios.sql:28-37`).
- **Przypięcia do e-maili**: regexy smoke `memberRow`, `rowWithRemoveControl`, `rowWithConfirmedRemoveControl`, `removeTargetInRow`, `taskRowListing`, `leaderboardRow`, `signedInAs` (`scripts/smoke.mjs:129-244,353-355`), `bodyIncludes` z adresami i `bodyIncludes: "will see your e-mail address"` (`:506`), kitchen sink `bodyIncludes: "@example.test"` (`:653-661`); e2e `seed.spec.ts:31`, `checkoff-round-trip.spec.ts:29-37`, `invite-join.spec.ts:80-83`; integration `group-isolation.test.ts:64-68`; unit `leaderboard-rules.test.ts`, `dashboard-data.test.ts:244-249`; fixture'y `dashboard-fixtures.ts:73-76,98-102`; RLS `rls-scenarios.sql:458-459`.
- **Obietnice**: `EMAIL_VISIBILITY` (`src/pages/auth/signup.astro:17`), `WhoCanSee.astro:9,15,17`, `WhatWeCollect.astro:9-11,14-15,23-24`, `privacy.astro:28` (data), `README.md` (tabela tras, zdanie o `PROTECTED_ROUTES`, tabela RLS, opis smoke), `CLAUDE.md`, `context/domain/glossary.md:40,46,55`, destylacja W-06/N-10/N-18/Q-05, PRD bez zdania o e-mailu (następny FR to FR-010).

## Desired End State

- Każde konto ma nick (2–24 znaki po przycięciu, unikalny dosłownie w całej aplikacji) w tabeli `public.nicknames`, zanim zobaczy `/dashboard`, `/settings` albo wykona akcję `/api/groups/*`, `/api/tasks/*`: brak nicka kończy się przekierowaniem na `/account/nickname`.
- `list_group_members` zwraca `nickname` (wydanie 1: obok `email`; wydanie 2: zamiast). Kod aplikacji od wydania 1 nie czyta i nie przekazuje `email` członków: `GroupMember`, `StandingInput`, `TaskParticipant` niosą `nickname`, a HTML dashboardu nie zawiera żadnego adresu e-mail.
- Lista członków, uczestnicy tasków, tablica wyników, dialog usunięcia członka i linia „Signed in as” pokazują nick; członek bez nicka (konto sprzed zmiany, które się jeszcze nie zalogowało) jest dla innych „Unknown member”.
- `/settings` ma kartę Account z nickiem, własnym e-mailem i linkiem do zmiany nicka; `/account/nickname` wypełnia pole imieniem od Google, gdy jest w `user_metadata`.
- Tekst przy rejestracji, polityka prywatności, README, CLAUDE.md, słownik, destylacja i PRD (FR-010) mówią to, co robi kod.
- Weryfikacja: `npm run guard:migrations`, `npm run types:check`, `npm run lint`, `npm run build`, `npm test`, `npm run test:rls`, `npm run smoke`, `npx playwright test`, `npm run deps` zielone; `compat` zielony na obu PR-ach z migracją; produkcja po każdym wydaniu sprawdzona ręcznie.

### Key Discoveries:

- `compat` wymusza dwa wydania: wdrożony smoke (tag `production` = `144fd2a`, kod identyczny z `1e971f1`) dopasowuje adresy w wierszach członków, tasków i tablicy, więc migracja wydania 1 musi zostawić kolumnę `email` z prawdziwym adresem (`ci.yml:249-271`, `smoke.mjs:129-244`).
- Zmiana kolumn `returns table` to `drop function` + `create function` (precedens `is_group_member` w `20260925011727_harden_group_rls.sql:18-35`); każdy `drop` i `revoke` na istniejącym obiekcie wymaga linii `-- compat:` (`migration-guard.mjs:293,305-310,320-322`).
- Wymuszenie nicka w bazie (NOT NULL przy członkostwie, trigger na `auth.users`) zepsułoby `compat` i `test:rls` w tym samym PR-ze; wymuszenie w kodzie aplikacji dotyka każdego harnessu, który czeka na `/dashboard` (`research.md` §6).
- Nowa rodzina `/api/account` zapala strażnik pokrycia tras, `PROTECTED_ROUTES` i wyzwalacz odroczonego OPP-10 (`context/foundation/open-items.md:61`).
- Regex smoke `INVITE_IN_MEMBERS` (`smoke.mjs:369-370`) zakazuje `<h2` między polem „Invite link” a `</main>`: dashboard nie dostaje nowej karty; karta Account trafia tylko na `/settings`, gdzie regexy pinują obecność nagłówka „Group settings” i brak formularzy `/api/groups/*` bez grupy (`:390-401`), a regex rename pinuje `name="name"` (`:939,1106`), więc pole nicka nazywa się `nickname`.
- Globy ESLint „bez literałów” nie obejmują nowych katalogów (`eslint.config.js:86-93`); `src/pages/account/**` i `src/components/account/**` trzeba dopisać.
- Zawartość `user_metadata` konta Google (`full_name`, `name`) jest znana tylko z lektury źródeł GoTrue w archiwum S-07 i lokalny stos nie ma dostawcy Google: podpowiedź imienia jest najlepszym wysiłkiem, bez klucza pole zostaje puste.

## What We're NOT Doing

- **Backfill istniejących kont** (decyzja właściciela, 2026-10-16): konto sprzed wdrożenia dostaje nick dopiero przy następnym wejściu; do tego czasu inni członkowie widzą je jako „Unknown member”. To świadomy okres przejściowy wobec decyzji z ramy „inni nigdy nie widzą konta bez nazwy”.
- **Unikalność bez względu na wielkość liter** (decyzja właściciela): „Kasia” i „kasia” to dwa dozwolone nicki; małe litery służą tylko do porządkowania remisu na tablicy.
- **Automatyczne przyjęcie imienia od Google** (decyzja właściciela): imię jest tylko podpowiedzią w polu; nie ma ścieżki bez ekranu nicka.
- **Pole nicka na formularzu rejestracji**: jedna strona nicka obsługuje konta e-mail, Google i istniejące tą samą ścieżką. Wyzwalacz do zmiany: skargi na dodatkowy ekran po rejestracji.
- **Wymuszenie w bazie, że członek grupy ma nick** (trigger albo warunek w `join_group`): zepsułoby `compat` i `test:rls`; brama w aplikacji obejmuje `/api/groups/*`, ale bezpośrednie wywołanie `join_group` przez PostgREST z własnym tokenem jest możliwe i taki członek pokazuje się jako „Unknown member”. Akceptowane; kandydat do osobnej zmiany po wydaniu 2.
- **OPP-10** (ochrona każdej `/api/*` poza `/api/auth/*`): wyzwalacz „nowa rodzina `/api/*`” zapalił się; zostaje osobną zmianą zapisaną w `open-items.md`, bo zmienia odpowiedź nieznanych ścieżek z 404 na 302.
- **Zmiana nicka inaczej niż przez `/account/nickname`**, historia zmian, `updated_at`, usuwanie nicka (tylko kaskada z `auth.users`), zdjęcie profilowe od Google, nick w logach i Sentry.
- **E-mail na dashboardzie w jakiejkolwiek formie**, zmiany w `/api/auth/*`, w przepływie zaproszeń i w `preview_group`.
- **Zmiana nazwy `UNKNOWN_MEMBER`** ani jego tekstu „Unknown member”.
- **Zrzuty ekranu jako baseline**: `scripts/ui-screenshots.mjs` zbiera PNG do przejrzenia, bez porównań.
- **`docs/reference/contract-surfaces.md`**: nie istnieje i nie powstaje w tej zmianie.

## Implementation Approach

1. **Nick w tabeli `public.nicknames`**, nie w `user_metadata`: metadane użytkownik może ustawić sam przez GoTrue z pominięciem reguł długości i unikalności, a tabela dostaje RLS, CHECK, unikalność, kontrakt reguł TS↔DB, scenariusze RLS i `types.ts` jak pięć istniejących tabel. Zapis idzie przez funkcję SECURITY DEFINER `set_nickname(text)` z `insert … on conflict (user_id) do update` dla `auth.uid()` (wzorzec `join_group`), więc tabela ma jedną politykę `select` dla własnego wiersza, żadnych grantów kolumnowych, a wyścig dwóch kart rozstrzyga baza.
2. **Brama w middleware**: po sprawdzeniu sesji, na każdej ścieżce chronionej, jeden odczyt własnego wiersza `nicknames` trafia do `locals.nickname`; brak wiersza przekierowuje na `/account/nickname` (z wyjątkiem tej strony i jej trasy `POST /api/account/nickname`); błąd odczytu to 503 jak awaria Auth. Strony czytają nick z `locals`, bez drugiego zapytania.
3. **Jedna strona nicka dla wszystkich kont**: `/account/nickname` (formularz React jak `RenameGroupForm`, trasa jak `rename.ts`, błędy jak `group-errors.ts`); pierwsze zapisanie kończy się na `/dashboard` (oczekujące zaproszenie w ciasteczku przeżywa), zmiana z ustawień na `/settings`.
4. **Kontrakt danych przełączony w całości w wydaniu 1**: `listGroupMembers` rzutuje wiersze RPC na dokładnie cztery pola bez `email`, więc nawet gdy RPC zwraca jeszcze adres, nie trafia on do `DashboardData`, do propsów wyspy ani do HTML. Remis na tablicy porządkuje nick małymi literami, potem `userId`.
5. **Każdy harness nadaje nick**: smoke przez nową trasę (i sprawdza bramę jako wynik, zgodnie z lekcją o smoke), seed i persony e2e oraz Vitest wstawiają wiersz kluczem serwisowym, `auth.setup.ts` przechodzi przez bramę dla konta seed sprzed zmiany, `mk_user` w RLS wstawia wiersz.
6. **Wydanie 2 w osobnym PR-ze** po tym, jak tag `production` wskaże kod wydania 1: migracja usuwa `email` z `list_group_members`; `compat` uruchamia wtedy smoke wydania 1, który dopasowuje nicki i nigdy nie czyta `email`.

## Critical Implementation Details

- **Timing & lifecycle**: migracja A i migracja B nie mogą trafić do jednego PR-a ani do jednego wydania. PR fazy 2 wolno otworzyć dopiero, gdy `git ls-remote --tags origin production` wskazuje commit zawierający merge fazy 1; wcześniej `compat` uruchomi smoke sprzed nicka i będzie czerwony. W migracji A `drop function` + `create function` leżą w jednym pliku, który CLI stosuje w jednej transakcji, więc wdrożony Worker nie widzi brakującej funkcji; nawet gdyby okno istniało, wdrożony `/dashboard` odpowiada wtedy 503 `dashboard.load.failed`, jak przy każdej chwilowej awarii.
- **State sequencing**: w middleware odczyt nicka stoi po kontroli 503/302 dla ścieżek chronionych i obejmuje także `/api/groups/*` i `/api/tasks/*`; wyjątki (`/account/nickname`, `/api/account/nickname`) dotyczą tylko przekierowania, odczyt wykonuje się zawsze, bo trasa nicka używa `locals.nickname` do wyboru przekierowania po sukcesie.
- **User experience spec**: strona nicka nie dotyka ciasteczka `join_code`; pierwsze zapisanie zawsze kończy się na `/dashboard`, gdzie `loadDashboard` konsumuje oczekujące zaproszenie; linia „Signed in as” jest renderowana tylko, gdy nick istnieje, więc na stronie pierwszego wyboru jej nie ma.
- **Kolejność kroków smoke**: kroki bramy i zapisu nicka użytkownika A idą zaraz po „signin accepts correct password”, przed pierwszym odczytem dashboardu; użytkownik C zapisuje nick przed `POST /api/groups/join`, bo brama obejmuje tę trasę.
- **Debug & observability**: trzy nowe zdarzenia: `nickname.lookup.failed` (błąd odczytu w middleware, linia error, odpowiedź 503), `account.nickname.failed` (przez `reportMapped`: `unknown` i `forbidden` jako error, `nickname_taken` i `invalid_nickname` cicho), `account.nickname.exception`. Żadne nie niesie wartości nicka; `requestFields` jak dotąd.

## Phase 1: Nick: schemat, brama, widoki i obietnice (wydanie 1)

### Overview

Jeden PR i jedno wydanie: tabela `nicknames` z funkcją `set_nickname`, `list_group_members` z kolumną `nickname` obok `email`, brama w middleware, strona i trasa nicka, karta Account na `/settings`, kontrakt danych i widoki na nicku, każdy harness nadający nick, polityka prywatności, tekst rejestracji, README, CLAUDE.md, słownik, destylacja i PRD. Po merge'u właściciel zatwierdza `release` z migracją A i sprawdza produkcję. Fazę wykonuje jeden przebieg `/goal` z `/10x-goal-implement nickname phase 1` (lekcja „Implement plans with /10x-goal-implement, every phase in one run when the order allows”), a warunek `/goal` kończy go na fazie 1 („do not start Phase 2”): faza 2 nie może wejść do tego przebiegu, bo jej PR wolno otworzyć dopiero, gdy tag `production` wskaże wydany kod fazy 1. Po przebiegu, przed wypchnięciem, idzie przegląd `/10x-impl-review nickname phase 1`. Diff kodu fazy (bez `context/`, Markdownu i `package-lock.json`) najpewniej przekroczy 50 000 znaków, więc wymagany check `ai-review` przejrzy go bez narzędzi repo (`tools: skipped`); przed wypchnięciem zmierz go poleceniem `git diff origin/master...HEAD -- . ':!context' ':!*.md' ':!package-lock.json' | wc -c` (największy dotąd, PR #125, miał 142 055 znaków). Wynik `error` (timeout, `length`) ponawia etykieta `ai-cr:review`, wynik `fail` nigdy; powyżej 200 000 znaków (`too-large`) decyduje wyłącznie właściciel (break-glass w README, „AI code review”), a agent nie rusza bramki.

### Changes Required:

#### 1. Migracja A: tabela, funkcja zapisu, RPC z kolumną nicka

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_nicknames.sql` (znacznik czasu z chwili utworzenia, nowszy niż każda scalona migracja; dziś najnowsza to `20261015180024`)

**Intent**: Dodać miejsce na nick z regułami egzekwowanymi przez bazę, funkcję zapisu dla zalogowanego użytkownika i kolumnę `nickname` w `list_group_members`, zachowując `email` dla wdrożonego kodu.

**Contract**:

- Tabela `public.nicknames`: `user_id uuid primary key references auth.users (id) on delete cascade`, `nickname text not null`, `created_at timestamptz not null default now()`; ograniczenia `nicknames_nickname_key unique (nickname)` (unikalność dosłowna), `nicknames_nickname_trimmed check (nickname = btrim(nickname, E' \t\r\n'))`, `nicknames_nickname_length check (char_length(nickname) between 2 and 24)` (punkty kodowe, jak `groups_name_length`).
- Uprawnienia i RLS: `revoke all on public.nicknames from anon, authenticated; grant select on public.nicknames to authenticated;` (żadnych grantów insert/update/delete; tabela ma dla `authenticated` dokładnie `SELECT` na poziomie tabeli), `enable row level security`, jedna polityka `nicknames_select_self` for select to authenticated using `user_id = (select auth.uid())`. Brak polityk INSERT/UPDATE/DELETE: zapis idzie przez funkcję, usunięcie przez kaskadę.
- Funkcja `public.set_nickname(p_nickname text) returns void`, `language sql`, `security definer`, `set search_path = ''`: `insert into public.nicknames (user_id, nickname) values ((select auth.uid()), p_nickname) on conflict (user_id) do update set nickname = excluded.nickname;`. `revoke execute … from public, anon; grant execute … to authenticated`. Naruszenia zgłaszają się naturalnie: 23505 (zajęty), 23514 (długość albo nieprzycięty), 42501 (anon).
- `list_group_members`: `drop function public.list_group_members (uuid);` i `create function` z `returns table (user_id uuid, email text, nickname text, joined_at timestamptz, is_owner boolean)`, ciało jak dziś plus `left join public.nicknames n on n.user_id = gm.user_id` i `n.nickname` w select (left join: członek bez wiersza zostaje na liście z `NULL`); ten sam filtr `is_group_member`, ta sama kolejność; ponowne `revoke execute … from public, anon` i `grant execute … to authenticated`.
- Jedna linia `-- compat: list_group_members keeps every column the deployed code reads (user_id, email, joined_at, is_owner) and adds nickname; drop and create run in one migration; the email column is removed in a later release once the production tag points at code that reads nickname only.` Komentarz nagłówkowy nazywa S-14, wyjaśnia brak backfillu (konto sprzed zmiany dostaje nick przy następnym wejściu) i mówi, że `service_role` zachowuje domyślne uprawnienia Supabase do `nicknames` (żadne `revoke` go nie wymienia), więc harnessy wstawiają wiersze kluczem serwisowym bez dodatkowego grantu. To pierwszy w repo zapis kluczem serwisowym do tabeli po `revoke all … from anon, authenticated`, więc pierwszym dowodem jest `npm test` (wiersz 1.5, `createTestUser`), uruchamiany przed smoke i e2e.

#### 2. Wygenerowane typy

**File**: `src/types.ts`

**Intent**: Odzwierciedlić nową tabelę, funkcję i sygnaturę RPC, żeby `npm run types:check` był zielony.

**Contract**: wygenerowane przez `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts` po `npx supabase db reset`; bez ręcznych edycji. `Tables.nicknames`, `Functions.set_nickname` (`Returns: undefined`), `Functions.list_group_members.Returns` z pięcioma polami.

#### 3. Reguły, błędy i odczyt nicka

**File**: `src/lib/nickname-rules.ts` (nowy)

**Intent**: Reguła nicka w jednym miejscu, bezpieczna dla przeglądarki, lustrzana wobec CHECK-ów w bazie.

**Contract**: `MIN_NICKNAME_LENGTH = 2`, `MAX_NICKNAME_LENGTH = 24`, `trimNickname(input: string): string` (ten sam zbiór znaków co `trimGroupName`: spacja, tabulator, CR, LF), `normalizeNickname(input: unknown): string | null` (przycięta wartość, gdy ma 2–24 punkty kodowe; inaczej `null`). Bez importów serwerowych (`npm run deps`).

**File**: `src/lib/nickname-errors.ts` (nowy)

**Intent**: Kody `?error=` strony nicka i mapowanie SQLSTATE, jak `group-errors.ts`.

**Contract**: `NicknameErrorCode = "not_configured" | "invalid_nickname" | "nickname_taken" | "forbidden" | "unknown"`; komunikaty: `invalid_nickname` → "Enter a nickname between 2 and 24 characters.", `nickname_taken` → "This nickname is already taken. Pick another one.", `not_configured` → "Nicknames are not available right now.", `forbidden` → "You are not allowed to do that.", `unknown` → "Something went wrong. Please try again."; `toNicknameErrorCode(error: { code?: string })`: `23505 → nickname_taken`, `23514 → invalid_nickname`, `42501 → forbidden`, inaczej `unknown`; `resolveNicknameError(param: string | null)` z allow-listą `Object.hasOwn` (obca wartość nigdy nie jest odbijana); `nicknameErrorMessage(code)`.

**File**: `src/lib/nicknames.ts` (nowy)

**Intent**: Odczyt własnego nicka dla middleware i podpowiedź dla pierwszego wyboru.

**Contract**: `getOwnNickname(supabase, userId: string): Promise<string | null>` (`from("nicknames").select("nickname").eq("user_id", userId).maybeSingle()`; rzuca zwróconym błędem jak `getMyGroup`); `suggestNickname(current: string | null, metadata: Record<string, unknown> | undefined): string`: bieżący nick, gdy jest; inaczej pierwsza z wartości `metadata.full_name`, `metadata.name`, która jest stringiem i przechodzi `normalizeNickname` (zwracana znormalizowana); inaczej `""`. Zapis nicka nie ma tu helpera: trasa woła `supabase.rpc("set_nickname", { p_nickname })` wprost, jak inne trasy wołają RPC.

#### 4. Brama w middleware i `locals`

**File**: `src/middleware.ts`

**Intent**: Żaden użytkownik bez nicka nie widzi stron chronionych ani nie wykonuje akcji grupowych; strony dostają nick bez drugiego zapytania.

**Contract**: `PROTECTED_ROUTES = ["/dashboard", "/settings", "/account", "/api/groups", "/api/tasks", "/api/account"]`; stała `NICKNAME_ROUTES = ["/account/nickname", "/api/account/nickname"]` (ścieżki dostępne bez nicka). Na ścieżce chronionej, po dotychczasowych odpowiedziach 503 i 302 i tylko dla zalogowanego: `getOwnNickname(supabase, user.id)` tym samym klientem, którego użył `resolveAuthState` (dziś `createClient(…)` powstaje inline w wywołaniu `resolveAuthState` w `src/middleware.ts:16` i nie jest zachowany, więc trzeba go przenieść do stałej `supabase`; gdy `locals.user` istnieje, stała nie jest `null`, bo `resolveAuthState(null)` daje `not_configured`); wynik do `context.locals.nickname`; rzucony błąd → `reportError("nickname.lookup.failed", error, requestFields(context))` i `unavailableResponse(context.request)` (503, bez zmiany tekstu strony); `null` poza `NICKNAME_ROUTES` → `context.redirect("/account/nickname")`. Poza ścieżkami chronionymi `locals.nickname = null` bez zapytania. Dopasowanie ścieżek jak dziś (równość albo prefiks z `/`).

**File**: `src/env.d.ts`

**Intent**: Typ `locals` zna nick.

**Contract**: `App.Locals.nickname: string | null` obok `user`.

#### 5. Strona, widok, formularz i trasa nicka

**File**: `src/pages/account/nickname.astro` (nowy)

**Intent**: Jedyne miejsce wyboru i zmiany nicka, dla kont e-mail, Google i istniejących.

**Contract**: strona chroniona (prefiks `/account`); czyta `Astro.locals.user` i `Astro.locals.nickname`; `error = resolveNicknameError(Astro.url.searchParams.get("error"))`; `mode = locals.nickname === null ? "choose" : "change"`; `suggestion = suggestNickname(locals.nickname, user?.user_metadata)`; renderuje `AppLayout` (`title="Nickname"`, `nickname={locals.nickname}`, bez `current`) i `NicknameView`; usuwa `?error=` z adresu tym samym skryptem co dashboard (patrz `ClearErrorParam.astro`).

**File**: `src/components/account/NicknameView.astro` (nowy)

**Intent**: Treść strony nicka, renderowana też przez kitchen sink.

**Contract**: props `{ mode: "choose" | "change"; suggestion: string; error: string | null }`; `PageHeading` z tytułem `Choose your nickname` (opis: "Members of your group will see it instead of your e-mail address.") albo `Your nickname` (opis: "Members of your group see this name."); przy `error` alert `destructive` z `AlertDescription` (jak `DashboardView.astro:51-56`), bez `role="alert"` w innym przypadku; `NicknameForm client:load initialValue={suggestion} submitLabel={mode === "choose" ? "Continue" : "Save nickname"}`; w trybie `change` link „Back to settings” do `/settings` (`buttonVariants({ variant: "ghost" })`). Jedyne `<h1>` strony to tytuł.

**File**: `src/components/account/NicknameForm.tsx` (nowy)

**Intent**: Formularz z walidacją po stronie klienta, jak `RenameGroupForm`.

**Contract**: props `{ initialValue: string; submitLabel: string }`; natywny `<form method="POST" action="/api/account/nickname" noValidate>`; `FormField id="nickname" name="nickname" label="Nickname" placeholder="e.g. Kasia"` z `hint` "2 to 24 characters. Members of your group will see it."; walidacja `trimNickname` pusty → "Nickname is required", `normalizeNickname` `null` → "Nickname must be 2 to 24 characters" (błąd pola `id="nickname-error"`, fokus na polu); `SubmitButton` z `pendingText="Saving..."`. Pole nigdy nie nazywa się `name`.

**File**: `src/pages/api/account/nickname.ts` (nowy)

**Intent**: Zapis nicka przez `set_nickname`, z błędami na stronie nicka.

**Contract**: `export const prerender = false`; `POST`: brak `locals.user` → 302 `/auth/signin`; `normalizeNickname(form.get("nickname"))` `null` → 302 `/account/nickname?error=invalid_nickname` (bez klienta); `createClient` `null` → `?error=not_configured`; `const { error, status } = await supabase.rpc("set_nickname", { p_nickname: nickname })`; błąd → `code = toNicknameErrorCode(error)`, `reportMapped("account.nickname.failed", code, error, { ...requestFields(context), status })`, 302 `/account/nickname?error=<code>`; sukces → 302 `/dashboard`, gdy `context.locals.nickname === null` (pierwszy wybór), inaczej 302 `/settings` (zmiana); `catch` → `reportError("account.nickname.exception", …)` i `?error=unknown`. Wbudowana kontrola Origin Astro odpowiada 403 na obcy Origin; GET nie istnieje (404).

**File**: `src/components/site/ClearErrorParam.astro` (nowy), `src/pages/dashboard.astro`

**Intent**: Jeden skrypt usuwający `?error=` z adresu dla dashboardu i strony nicka.

**Contract**: komponent renderuje dokładnie dzisiejszy `<script is:inline>` z `dashboard.astro:56-64` (bez zmiany treści, żeby smoke dalej widział ten sam skrypt); `dashboard.astro` używa komponentu zamiast kopii.

#### 6. Layout, dashboard, ustawienia i karta Account

**File**: `src/layouts/AppLayout.astro`

**Intent**: „Signed in as” pokazuje nick, a strona nicka renderuje się bez nawigacji Main.

**Contract**: props `title?: string`, `nickname: string | null` (zamiast `email`), `current?: "dashboard" | "settings"`; akapit „Signed in as <span>{nickname}</span>” renderowany tylko, gdy `nickname !== null` (ten sam markup, więc regex `signedInAs` smoke pasuje); nav Main (linki Dashboard i Settings) renderowany tylko, gdy `current` jest podane: strona nicka go nie ma, bo użytkownikowi bez nicka oba linki wracałyby przez bramę na `/account/nickname`; zostają marka i Sign out, a tryb zmiany ma link „Back to settings”.

**File**: `src/pages/dashboard.astro`, `src/pages/settings.astro`

**Intent**: Strony przekazują nick z `locals`; e-mail trafia tylko do karty Account.

**Contract**: `<AppLayout … nickname={Astro.locals.nickname} current="…">`; `settings.astro` przekazuje do `SettingsView` dodatkowo `email={user?.email}` i `nickname={Astro.locals.nickname}`.

**File**: `src/components/dashboard/SettingsView.astro`, `src/components/dashboard/AccountCard.astro` (nowy)

**Intent**: Jedyne miejsce w aplikacji, gdzie użytkownik widzi własny e-mail, plus wejście do zmiany nicka.

**Contract**: `SettingsView` props += `email: string | undefined`, `nickname: string | null`; w zdrowej gałęzi, w kolumnie `max-w-xl`, po bloku grupy (karta „Group settings” albo akapit „You are not in a group yet.”) renderuje `<AccountCard email nickname />`; gałąź `loadFailed` bez zmian. `AccountCard`: `Card` z `CardTitle as="h2">Account</CardTitle>`, `CardDescription` "Only you see your e-mail address.", lista `<dl>` z pozycjami „Nickname” (`nickname ?? "Not set yet"`) i „E-mail” (`email`), link `<a href="/account/nickname" class:list={buttonVariants({ variant: "outline", size: "sm" })}>` z tekstem „Change nickname” (albo „Choose nickname”, gdy `nickname` jest `null`). Żadnego formularza, żadnego pola `name="name"`.

#### 7. Kontrakt danych: nick zamiast e-maila

**File**: `src/lib/groups.ts`

**Intent**: Kod aplikacji nie niesie e-maila członka, nawet gdy RPC jeszcze go zwraca.

**Contract**: `GroupMember { user_id: string; nickname: string | null; joined_at: string; is_owner: boolean }`; `listGroupMembers` rzutuje każdy wiersz jawnie na te cztery pola (komentarz: do migracji B RPC zwraca też `email`, którego aplikacja nie może przekazać dalej); wynik nigdy nie zawiera klucza `email`.

**File**: `src/lib/leaderboard-rules.ts`

**Intent**: Tablica i remis działają na nicku.

**Contract**: `StandingInput.nickname: string | null` (zamiast `email`), `BoardInput.members: readonly { user_id: string; nickname: string | null }[]`, `buildBoard` mapuje `nickname`; `rankStandings` porządkuje remis kluczem `(row.nickname ?? UNKNOWN_MEMBER).toLowerCase()` jednostkami kodu, potem `userId` (reguła N-18 z nickiem; „Kasia” i „kasia” rozstrzyga `userId`); komentarz `UNKNOWN_MEMBER`: członek bez nicka albo uczestnik bez wiersza członka. Bez zmiany algorytmu pozycji.

**File**: `src/lib/dashboard-data.ts`

**Intent**: Uczestnicy tasków po nicku.

**Contract**: `TaskParticipant { nickname: string; isYou: boolean }`; `participantsResolver` mapuje `user_id → member.nickname ?? UNKNOWN_MEMBER`, brak wiersza członka → `UNKNOWN_MEMBER` jak dziś. `DashboardData` bez zmian poza typami.

#### 8. Widoki członków

**File**: `src/components/dashboard/MembersCard.astro`, `src/components/dashboard/TaskRow.astro`, `src/components/tasks/Leaderboard.tsx`

**Intent**: Nick w każdym z trzech widoków i w dialogu usunięcia.

**Contract**: `MembersCard` drukuje `member.nickname ?? UNKNOWN_MEMBER`, `triggerAriaLabel` „Remove {nickname ?? "this member"} from the group”, opis dialogu „{nickname ?? "This member"} will lose access to {groupName}, …”; `TaskRow` drukuje `participant.nickname`; `Leaderboard` drukuje `standing.nickname ?? UNKNOWN_MEMBER`. Markup bez zmian (te same elementy i klasy), żeby regexy smoke i testy e2e z nowymi wartościami pasowały bez zmian struktury.

#### 9. Kitchen sink, ESLint, Stryker

**File**: `src/components/dev/dashboard-fixtures.ts`, `src/pages/dev/dashboard-kitchen-sink.astro`

**Intent**: Brama wizualna pokazuje nicki, kartę Account i stany strony nicka.

**Contract**: fixture'y członków po nicku (`Olivia` właścicielka, `Max`, `Sam`, `Nora` poza grupą, `LONG_NICKNAME` o długości dokładnie 24 punktów kodowych w stanie `long-text`; opis stanu: „80-character group name and task title, a 24-character nickname”); `DashboardViewProps.email` → `nickname: string | null`; `SettingsViewProps` += `nickname: string | null`, zachowuje `email` dla karty Account; nowa lista `NICKNAME_STATES` (`nickname-choose` puste pole, `nickname-suggested` podpowiedź od Google, `nickname-change` zmiana istniejącego nicka, `nickname-error` po `?error=nickname_taken`) z `isNicknameStateId` i `nicknameFixture(id)` zwracającym propsy `NicknameView` plus `nickname` dla layoutu; kitchen sink renderuje stan nicka w `AppLayout` bez `current`, a indeks dostaje grupę „Nickname states” (skrypt zrzutów czyta stany z linków `?state=`). Komentarz w fixture'ach: smoke pinuje nick `Olivia` zamiast `@example.test`. Dwa istniejące wywołania `<AppLayout email=…>` (`dashboard-kitchen-sink.astro:37,44`) przechodzą na `nickname={dashboard.nickname}` i `nickname={settings.nickname}`, a wywołanie `SettingsView` (`:45-50`) dostaje `email={settings.email}` i `nickname={settings.nickname}`.

**File**: `eslint.config.js`

**Intent**: Reguła „bez literałów” obejmuje nowe katalogi widoków.

**Contract**: `viewLiteralsConfig.files` += `"src/pages/account/**"`, `"src/components/account/**"`.

**File**: `stryker.config.json`, `context/foundation/mutation-baseline.md`

**Intent**: Nowe moduły reguł wchodzą do testów mutacyjnych.

**Contract**: `mutate` += `src/lib/nickname-rules.ts`, `src/lib/nickname-errors.ts`, `src/lib/nicknames.ts`; baseline dostaje wiersze tych modułów i zaktualizowany wiersz `leaderboard-rules` po zawężonym uruchomieniu (`--mutate "src/lib/leaderboard-rules.ts:52-66"`; przed zmianą `rankStandings` leżało w liniach 49-63), z weryfikacją `testsCompleted >= 1` dla pokrytych mutantów (lekcja o Strykerze).

#### 10. Testy jednostkowe

**File**: `tests/unit/nickname-rules.test.ts`, `tests/unit/nickname-errors.test.ts`, `tests/unit/nicknames.test.ts` (nowe), `tests/unit/leaderboard-rules.test.ts`, `tests/unit/dashboard-data.test.ts`

**Intent**: Reguły, mapowanie błędów, podpowiedź i remis przypięte testami.

**Contract**: `nickname-rules`: zbiór przycinania (NBSP i EM SPACE zostają), długość w punktach kodowych (24 emoji przechodzi, 25 nie), granice 1/2/24/25, wejście niebędące stringiem → `null`. `nickname-errors`: mapowanie 23505/23514/42501/inne, allow-lista (`__proto__` i obce wartości → `null`). `nicknames.suggestNickname`: bieżący nick wygrywa; `full_name` przed `name`; wartość nieprzechodząca reguł albo niebędąca stringiem jest pomijana; brak metadanych → `""`. `leaderboard-rules`: pole `nickname` w fixture'ach, przypadki remisu po nicku małymi literami, „Kasia”/„kasia” rozstrzygane po `userId`, `null` jako „Unknown member”. `dashboard-data`: fixture'y członków po nicku, `participantsResolver` zwraca `{ nickname, isYou }`.

#### 11. Testy integracyjne

**File**: `tests/integration/middleware.test.ts`

**Intent**: Brama przypięta przypadkami, mock rozszerzony o odczyt tabeli.

**Contract**: mock `createClient` zwraca `{ auth: { getUser }, from }`, gdzie `from("nicknames").select("nickname").eq("user_id", id).maybeSingle()` zwraca zaskryptowane `{ data, error }`; `buildContext` ma `locals: { user: null, nickname: null }`. Przypadki: zalogowany bez wiersza na `/dashboard` → 302 `/account/nickname`; na `/api/tasks/checkoff` → 302 `/account/nickname`; z wierszem → 200 i `locals.nickname` ustawione; `/account/nickname` i `/api/account/nickname` bez wiersza → 200 (next wywołane), `locals.nickname === null`; błąd odczytu → 503 z `Retry-After` i jedna linia `nickname.lookup.failed` z `route` i `userId`; anonimowy → 302 `/auth/signin` bez odczytu (`from` niewywołane); strona publiczna bez odczytu. Istniejące przypadki dostają zaskryptowany wiersz, tam gdzie użytkownik jest zalogowany na ścieżce chronionej.

**File**: `tests/integration/data-routes.test.ts`

**Intent**: Nowa trasa w sieci charakteryzacyjnej; strażnik pokrycia zna rodzinę `account`.

**Contract**: `RouteId` += `"account/nickname"`, import `POST` z `@/pages/api/account/nickname`, wpis `ROUTES` (`event: "account.nickname"`, `validForm: { nickname: "Kasia" }`, `home: "/account/nickname"`). `RouteEntry` dostaje opcjonalne pole `home` (strona, na którą trasa wraca z `?error=`; domyślnie `"/dashboard"`), a `common()`, `mutationFailures()`, `nonFormBody()` i `throwingClient()` budują cele jako `${home}?error=<kod>` zamiast stałych `NOT_CONFIGURED`, `FORBIDDEN` i `UNKNOWN`, które dziś wskazują `/dashboard` (`data-routes.test.ts:175-230`); wiersze 13 istniejących tras się nie zmieniają, a `Location` dalej porównuje się dokładnie. Typ `Locals` += `nickname: string | null`, a `ANON` i domyślne `locals` w `run()` (`:1063`) dostają `nickname: null`, bo od tej wartości trasa wybiera cel po sukcesie. Wiersze: `common` (anonimowy → `/auth/signin`, brak konfiguracji → `/account/nickname?error=not_configured`), `nonFormBody` (→ `/account/nickname?error=unknown` z linią wyjątku), pusta wartość i 25 znaków → `invalid_nickname` bez klienta, `rpc` ok przy domyślnym `locals.nickname === null` → `/dashboard` z łańcuchem `[rpc("set_nickname", { p_nickname: "Kasia" })]`, `rpc` ok przy `locals.nickname === "Old"` → `/settings`, oraz `mutationFailures("account/nickname", [], …)`: 23505 → `nickname_taken` cicho, 23514 → `invalid_nickname` cicho, 42501 → `forbidden` z linią error i statusem, `XX000` → `unknown` z linią error. Trasa woła `rpc` z dokładnie jednym argumentem parametrów, bo fake zapisuje pełną listę argumentów (`tests/helpers/fake-supabase.ts:126-130`). Strażnik: katalogi dokładnie `["account", "groups", "tasks"]`, plików dokładnie 14.

**File**: `tests/integration/nicknames.test.ts` (nowy), `tests/integration/rule-contracts.test.ts`, `tests/integration/group-isolation.test.ts`

**Intent**: Reguły bazy, widoczność własnego wiersza i kontrakt RPC sprawdzone na prawdziwym stosie.

**Contract**: `nicknames.test.ts`: `set_nickname` jako użytkownik tworzy własny wiersz, drugie wywołanie zmienia wartość; drugi użytkownik z tym samym nickiem → 23505, z „Kasia” gdy istnieje „kasia” → sukces (unikalność dosłowna); użytkownik A nie widzi wiersza B (select zwraca `[]`), anon na tabeli i na funkcji → 42501; `list_group_members` zwraca `nickname` członka z wierszem i `null` po usunięciu wiersza kluczem serwisowym (left join); wynik `listGroupMembers` z prawdziwym klientem ma klucze dokładnie `["user_id", "nickname", "joined_at", "is_owner"]`. `rule-contracts.test.ts`: sekcja „nickname: normalizeNickname and nicknames_nickname_length/trimmed” metodą pliku (akceptowane: 2 znaki, 24 ASCII, 24 emoji, NBSP×2, 5 spacji + 24 + 2 tabulatory → znormalizowane; odrzucane: puste, 1 znak, 25 ASCII, 25 emoji, 5 spacji + 25 + 2 tabulatory → 23514 przez `set_nickname` z surowym wejściem); wiersze kasują się kaskadą z użytkownikami. `group-isolation.test.ts:64-68`: porównanie `nickname` zamiast `email`.

#### 12. Scenariusze RLS

**File**: `supabase/checks/rls-scenarios.sql`

**Intent**: Nowa tabela i funkcja przypięte tak jak pięć istniejących tabel.

**Contract**: `mk_user` wstawia też wiersz `nicknames` (`'u-' || left(v_id::text, 8)`); nagłówek pliku wymienia `nicknames` i `set_nickname`. Nowa sekcja „S-14: nicknames”: A widzi własny wiersz (1) i nie widzi wiersza B (0); `set_nickname` A zmienia własny nick; B z nickiem A → 23505; B z nickiem A w innej wielkości liter → sukces; 1 znak, 25 znaków i `' ab '` → 23514; anon `select` na tabeli i `set_nickname` → 42501; `delete from auth.users` kasuje wiersz; `authenticated` ma na `nicknames` dokładnie `SELECT` (osobna asercja obok pętli S-12, która pinuje `DELETE,SELECT` dla pięciu tabel). Sekcja S-01 `list_group_members`: asercje „every listed member has a nickname” i „the nickname comes from nicknames”, plus członek po usunięciu wiersza (jako `postgres`) nadal na liście z `nickname` NULL; asercje e-maila (`:458-459`) zostają do fazy 2. Listy tabel w check #6 (`:314,319`) dostają `nicknames`. Liczba asercji rośnie; nowa liczba trafia do zapisu w `deployment-plan.md`.

#### 13. Smoke

**File**: `scripts/smoke.mjs`, `README.md` (akapit „Smoke test”)

**Intent**: Smoke nadaje nicki trzem kontom, dowodzi bramy jako wyniku i pilnuje, że HTML dashboardu nie zawiera żadnego adresu e-mail.

**Contract**: stałe `nickA = "Smoke A " + stamp` i `nickA0 = "Smoke A0 " + stamp` (pierwszy wybór A, potem zmieniony), `nickB` i `nickC` analogicznie (każda stała ≤ 24 znaków, bo `stamp` to 13 cyfr z `Date.now()`; żadna nie jest podciągiem innej) oraz `ALL_EMAILS = [email, emailB, emailC]`. Kroki A, zaraz po „signin accepts correct password”: `GET /dashboard` → 302 `locationExact: "/account/nickname"`; `GET /settings` → 302 tamże; `GET /account/nickname` → 200 z `pageHeading("Choose your nickname")`, `formPostingTo("/api/account/nickname")`, `SIGN_OUT_FORM`, bez `NO_ERROR_ALERT`, bez „Signed in as” i bez nav Main (`bodyExcludes: 'aria-label="Main"'`); anonimowy `GET /account/nickname` → 302 `/auth/signin`; `POST {nickname: "x"}` → 302 `/account/nickname?error=invalid_nickname`; `GET /dashboard` → 302 `locationExact: "/account/nickname"` (odczyt stanu po odrzuconym zapisie, cookbook `test-plan.md` §6.4: A nadal bez nicka); strona z tym kodem → `alertMessage("Enter a nickname between 2 and 24 characters.")`; `?error=__proto__` → 200 bez `role="alert"`; `POST` z obcego Origin i nieszkodliwym ciałem `{nickname: "x"}` → 403; `GET /dashboard` → 302 `locationExact: "/account/nickname"` (stan nietknięty po odrzuconym zapisie); `GET /api/account/nickname` → 404; `POST {nickname: nickA0}` → 302 `locationExact: "/dashboard"`; `GET /account/nickname` → 200 z `pageHeading("Your nickname")`, polem `name="nickname"` o wartości `nickA0` i `signedInAs(nickA0)`; `POST {nickname: nickA}` → 302 `locationExact: "/settings"`; `GET /settings` → 200 z nagłówkiem `<h2>Account</h2>`, `nickA`, `email`, `linkTo("/account/nickname")`, `signedInAs(nickA)`. B, między krokami „user B signs in” i „join from a foreign origin is rejected” (ten drugi zostaje 403 z `setCookieExcludes: "join_code"`, bo wbudowana kontrola Origin Astro biegnie przed middleware): po zalogowaniu z oczekującym zaproszeniem `GET /dashboard` → 302 `/account/nickname` z `setCookieExcludes: "join_code"`; `POST {nickname: nickA}` → 302 `?error=nickname_taken`; `GET /dashboard` → 302 `/account/nickname` z `setCookieExcludes: "join_code"` (odrzucony zapis nie nadał B nicka, a zaproszenie czeka); `POST {nickname: nickB}` → 302 `/dashboard` z `setCookieExcludes: "join_code"` (zaproszenie przeżyło; istniejący krok podglądu zaproszenia to potwierdza). C: `POST /api/groups/join` bez nicka → 302 `/account/nickname` (brama obejmuje API), potem `POST {nickname: nickC}` → `/dashboard`, potem dołączenie jak dziś. Wszystkie regexy i `bodyIncludes` z adresami dostają nicki (`memberRow`, `rowWithRemoveControl`, `rowWithConfirmedRemoveControl`, `removeTargetInRow`, `taskRowListing`, `leaderboardRow`, `signedInAs`); każdy krok czytający `/dashboard` albo `/settings` dodaje `ALL_EMAILS` do `bodyExcludes` (karta Account na `/settings` pokazuje tylko własny adres, więc tam wyklucza się dwa cudze); krok rejestracji pinuje `bodyIncludes: "will see your nickname"`; krok kitchen sinka w dev `bodyIncludes: "Olivia"`, w produkcji `bodyExcludes: ["Olivia", "Dashboard kitchen sink"]`. README opisuje nowe kroki (brama, nick, karta Account, „Signed in as” z nickiem, notatka rejestracji o nicku, fixture'owy nick) i dopisuje `nicknames` do listy wymaganych migracji.

#### 14. E2E, seed i helpery Vitest

**File**: `tests/e2e/helpers.ts`, `tests/e2e/auth.setup.ts`, `scripts/e2e-user.mjs`, `tests/e2e/local-supabase.ts`, `tests/e2e/invite-join.spec.ts`, `tests/e2e/checkoff-round-trip.spec.ts`, `tests/e2e/seed.spec.ts`, `tests/helpers/supabase.ts`

**Intent**: Każde konto testowe ma nick, a przepływ rejestracji przez UI przechodzi przez prawdziwą bramę.

**Contract**: `helpers.ts` eksportuje `nicknameFor(email)` (część lokalna adresu, przycięta do 24 znaków) i `chooseNickname(page, nickname)` (czeka na hydrację, wypełnia pole „Nickname”, klika „Continue”, czeka na `**/dashboard`). `auth.setup.ts` po zalogowaniu czeka na `/dashboard` **albo** `/account/nickname`; na stronie nicka woła `chooseNickname(page, nicknameFor(username))` (konto seed sprzed zmiany w lokalnym `.env` przechodzi bramę raz), potem jak dziś. `scripts/e2e-user.mjs` po `createUser` wstawia kluczem serwisowym wiersz `{ user_id, nickname: nicknameFor(email) }` (ta sama reguła, powtórzona w jednej linii z komentarzem wskazującym `helpers.ts`), rzuca przy błędzie, dalej drukuje dokładnie dwie linie. `local-supabase.ts`: `Persona.nickname`, `createPersona(token)` wstawia `{ user_id, nickname: token }` kluczem serwisowym i rzuca, gdy `token` ma ponad 24 znaki. `invite-join.spec.ts`: po `page.goto("/dashboard")` oczekuje adresu `/account/nickname` i nagłówka „Choose your nickname” (poziom 1), `chooseNickname(page, memberToken)`, potem jak dziś; wiersze członków po nicku (`memberToken`, `owner.nickname`). `checkoff-round-trip.spec.ts`: `expectViewerTotal(page, persona.nickname, total)` (komentarz: nick, nie e-mail). `seed.spec.ts`: „Signed in as {nicknameFor(username)}” (komentarz: nick konta seed wynika z jego adresu; nie zmieniać go w UI). `tests/helpers/supabase.ts`: `TestUser.nickname`, `createTestUser` wstawia `vt-<12 znaków hex z uuid>` kluczem serwisowym. `group-data-isolation.spec.ts`: asercje bez zmian (token jest w nicku i w adresie), tylko komentarz `:54` mówi „owner nickname” zamiast „owner email”.

#### 15. Obietnice i dokumenty

**File**: `src/pages/auth/signup.astro`, `src/components/privacy/WhoCanSee.astro`, `src/components/privacy/WhatWeCollect.astro`, `src/pages/privacy.astro`

**Intent**: Teksty mówią to, co robi kod wydania 1.

**Contract**: `signup.astro`: stała `NICKNAME_VISIBILITY = "Members of your group will see your nickname, not your e-mail address."` w jednym wyrażeniu (smoke pinuje „will see your nickname”). `WhoCanSee`: pierwszy punkt „The other members of your group see your nickname, the tasks you create and join, the days or weeks you mark done, your streaks and your place on the leaderboard. They do not see your e-mail address.”; trzeci punkt „…and the group no longer shows your nickname.”; czwarty punkt „Nobody else sees your nickname or your e-mail address in the app; your e-mail address is shown only to you, on the settings page.” `WhatWeCollect`: punkt o koncie dopisuje „your nickname (2 to 24 characters, chosen by you and shown to the members of your group)”; punkt o Google kończy się „The app uses the e-mail address and proposes the name as your nickname; the profile picture is not used.” `privacy.astro:28`: `datetime` i tekst na datę commitu fazy.

**File**: `README.md`, `CLAUDE.md`

**Intent**: Dokumentacja tras, ochrony, schematu i smoke zgodna z kodem.

**Contract**: README: wiersz `POST /api/account/nickname` w tabeli tras („Signed-in user: set or change the nickname (field `nickname`, 2 to 24 characters, unique); the first save ends on `/dashboard`, a change on `/settings`”), zdanie o `PROTECTED_ROUTES` (+ `/account`, `/api/account`, i że użytkownik bez nicka jest kierowany na `/account/nickname` z każdej ścieżki chronionej poza tą stroną i jej trasą), akapit i tabela RLS (`nicknames`: `SELECT` / none; `set_nickname` wśród funkcji), akapit smoke (punkt 13), lista migracji wymaganych przez smoke. CLAUDE.md: lista endpointów (+ `src/pages/api/account/nickname.ts`), strona chroniona `/account/nickname` i brama w opisie middleware, tablica `PROTECTED_ROUTES`, zdanie o `AppLayout` („Signed in as” z nickiem, nav Main tylko z `current`), lista tabel schematu (+ `nicknames`).

**File**: `context/foundation/prd.md`, `context/domain/glossary.md`, `context/domain/01-domain-distillation.md`, `context/foundation/test-plan.md`

**Intent**: Dokumenty domeny znają nick i zamykają Q-05.

**Contract**: PRD: nowa podsekcja `### Konto` z `FR-010: Użytkownik ustawia nick (2–24 znaki, unikalny w aplikacji), który członkowie jego grupy widzą zamiast adresu e-mail; bez nicka nie wejdzie na dashboard. Priority: must-have` i notką Socratic (kontrargument: dodatkowy ekran po rejestracji; rozstrzygnięcie: e-mail nie może być nazwą widoczną dla grupy); w `## Access Control` zdanie „Członkowie grupy widzą nawzajem nicki, nie adresy e-mail; własny adres widzi tylko właściciel konta w ustawieniach.”; `## Open Questions` bez zmian. Słownik: w tabeli „Tożsamość” nowy wiersz „Nick | Nazwa członka widoczna dla jego grupy: 2–24 znaki po przycięciu, unikalna dosłownie w całej aplikacji, obowiązkowa przed wejściem na dashboard | `nicknames`, `nickname`, `normalizeNickname`, `set_nickname`, `locals.nickname` | username, display name, handle, profile”; wiersz „Nieznany członek” → „Nazwa osoby bez nicka (członek bez wiersza `nicknames` albo uczestnik bez wiersza członka)”; punkt „Nazwa wyświetlana lub profil” znika z listy „nie wprowadzaj bez decyzji”. Destylacja: W-06 „Nazwa członka bez nicka (także przy uczestniku, który nie jest członkiem)”; N-18 „w ramach remisu kolejność po nicku małymi literami, potem po id (S-14)”; Q-05 z dopiskiem „Rozstrzygnięte 2026-10-16: nick zamiast e-maila (S-14, `context/changes/nickname/`)”. `test-plan.md` §8: wpis o nowych testach S-14 (brama w middleware, trasa `account/nickname`, kontrakt nicka, scenariusze RLS, kroki smoke i e2e).

### Success Criteria:

#### Automated Verification:

- Strażnik migracji przyjmuje migrację A ze znacznikiem: `npm run guard:migrations`
- Migracja A stosuje się na czystym stosie, a wygenerowane typy są świeże: `npx supabase db reset && npm run types:check`
- Lint, kontrola typów Astro i build przechodzą: `npm run lint && npm run build`
- Testy jednostkowe (reguły, błędy, podpowiedź, remis, resolver) przechodzą: `npm run test:unit`
- Testy integracyjne (middleware, trasy z 14 plikami i rodziną `account`, `nicknames`, kontrakt reguł, izolacja grup) przechodzą: `npm test`
- Scenariusze RLS z sekcją S-14 przechodzą: `npm run test:rls`
- Smoke z krokami bramy, nicków i wykluczeniem adresów przechodzi na podglądzie produkcyjnym: `npm run build && npm run preview` oraz `BASE_URL=http://localhost:4321 npm run smoke`
- Testy e2e w obu projektach przechodzą z seedem i personami z nickiem: `npx playwright test`
- Reguły zależności przechodzą: `npm run deps`
- Zawężone mutacje nowych modułów i remisu uruchamiają testy: `npm run test:mutation -- --mutate "src/lib/nickname-rules.ts,src/lib/nickname-errors.ts,src/lib/nicknames.ts,src/lib/leaderboard-rules.ts:52-66" --logLevel info` (jedna lista po przecinku: powtórzone `--mutate` zostawia tylko ostatnią wartość) z `testsCompleted >= 1` dla każdego pokrytego mutanta w `reports/mutation/mutation.json`
- Zrzuty stanów kitchen sinka (w tym `nickname-*`, `settings-*` z kartą Account i stany dashboardu z nickami) powstają bez błędu konsoli: `OUT_DIR=context/changes/nickname/screenshots BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs s14 states` (przy działającym `astro dev`)

#### Manual Verification:

- `compat` na PR-ze fazy zielony: smoke wdrożonego commitu przechodzi na schemacie z migracją A (sprawdzane na PR-ze po wypchnięciu: przebieg `/10x-goal-implement` nie ma polecenia, które by to uruchomiło, więc wiersz stoi pod Manual)
- Przegląd zrzutów z `context/changes/nickname/screenshots/` w obu szerokościach: strona nicka (pusta, z podpowiedzią, zmiana, błąd), karta Account na ustawieniach, lista członków, uczestnicy i tablica z nickami, stan `long-text` z 24-znakowym nickiem bez przepełnienia
- Lokalnie, nowe konto e-mail: po rejestracji i wejściu na `/dashboard` strona „Choose your nickname”, zapis kończy się na dashboardzie z „Signed in as {nick}”; drugie konto nie może wziąć tego samego nicka i widzi komunikat; link zaproszenia otwarty przed rejestracją przeżywa krok nicka i dashboard pyta o dołączenie
- Lokalnie, konto sprzed zmiany (utworzone `admin.createUser` bez wiersza `nicknames`, będące członkiem grupy): inni widzą je jako „Unknown member”, a ono samo po zalogowaniu trafia na stronę nicka i po zapisie znika etykieta zastępcza
- `/settings` pokazuje kartę Account z nickiem i własnym e-mailem; „Change nickname” prowadzi na stronę ze wstępnie wypełnionym polem, a zapis wraca na `/settings`
- Przegląd `/privacy`, `/auth/signup`, README i CLAUDE.md: żadne zdanie nie mówi już, że członkowie widzą adres e-mail
- PR fazy scalony przez właściciela, `release` zatwierdzony w środowisku `production` z migracją A (`<YYYYMMDDHHmmss>_add_nicknames.sql`), `db push` zgłasza dokładnie tę migrację
- Kontrola produkcji na `https://streakboard.app` (właściciel): własne konto trafia raz na stronę nicka, po zapisie dashboard pokazuje nick w liście członków i na tablicy; członkowie, którzy się jeszcze nie zalogowali, widnieją jako „Unknown member”; `/settings` pokazuje własny e-mail; `/privacy` ma nowy tekst
- Konto Google na produkcji (właściciel, lokalny stos nie ma dostawcy): strona nicka proponuje imię od Google; wynik (klucz obecny czy pole puste) zapisany w `deployment-plan.md`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Wydanie 2: `list_group_members` bez e-maila

### Overview

Osobny przebieg `/goal` z `/10x-goal-implement nickname phase 2` i osobny PR, oba dopiero gdy tag `production` wskazuje kod fazy 1. Migracja B usuwa kolumnę `email` z `list_group_members`; `compat` uruchamia wtedy smoke fazy 1, który dopasowuje nicki i wyklucza adresy. Faza domyka obietnicę „także RPC” z ramy i zapisuje oba wydania w planie wdrożenia. Od wydania 1 do wydania 2 polityka prywatności mówi, że członkowie nie widzą cudzego adresu, a `list_group_members` nadal go zwraca przy bezpośrednim wywołaniu PostgREST (przegląd fazy 1, F2): fazę 2 uruchom zaraz po zatwierdzeniu wydania 1 i przesunięciu tagu, przed S-13, a okno (daty obu wydań) zapisz w `deployment-plan.md` Phase 18.

### Changes Required:

#### 1. Migracja B

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_drop_email_from_list_group_members.sql`

**Intent**: Żaden członek nie dostaje cudzego e-maila żadną drogą.

**Contract**: `-- compat: list_group_members loses the email column; the deployed code (production tag at or after the S-14 phase 1 merge) reads user_id, nickname, joined_at and is_owner only, and its smoke matches nicknames, never addresses.`; `drop function public.list_group_members (uuid);` i `create function` z `returns table (user_id uuid, nickname text, joined_at timestamptz, is_owner boolean)`, to samo ciało bez `u.email` (join `auth.users` znika, bo nic z niego nie jest czytane; filtr `is_group_member`, left join `nicknames` i kolejność bez zmian); ponowne `revoke execute … from public, anon` i `grant execute … to authenticated`. Komentarz nagłówkowy nazywa S-14 wydanie 2.

#### 2. Typy, komentarze i testy kontraktu

**File**: `src/types.ts`, `src/lib/groups.ts`, `tests/integration/nicknames.test.ts`, `supabase/checks/rls-scenarios.sql`

**Intent**: Kontrakt bez e-maila przypięty na trzech poziomach.

**Contract**: `src/types.ts` wygenerowane ponownie (`Returns` z czterema polami); komentarz w `listGroupMembers` przestaje mówić o `email` w odpowiedzi RPC (jawne rzutowanie zostaje). `nicknames.test.ts`: surowe `rpc("list_group_members")` zwraca wiersze o kluczach dokładnie `["is_owner", "joined_at", "nickname", "user_id"]` (posortowane) i żadna wartość nie zawiera `@`. RLS: asercje e-maila z sekcji S-01 (`:458-459`) usunięte, nowa asercja `select ('email' = any(proargnames))::text from pg_proc where proname = 'list_group_members'` → `false` („S-14 list_group_members has no email column”); nagłówek pliku i README (akapit RLS) wspominają wydanie 2.

#### 3. Zapis wdrożeń

**File**: `context/changes/deployment/deployment-plan.md`, `README.md`

**Intent**: Oba wydania S-14 udokumentowane; stan tagu zapisany na dzień.

**Contract**: nowa sekcja „Phase 18 — S-14 nickname: two releases” (frontmatter `status` i `last_updated` zaktualizowane) z zapisem wydania 1 (data, numer runu `release`, migracja A, wersja Cloudflare, przesunięcie tagu, wynik kontroli produkcji, wynik próby z kontem Google, nowa liczba asercji RLS) i miejscem na zapis wydania 2 (uzupełniany po jego zatwierdzeniu w zamykającym PR-ze dokumentacyjnym, zgodnie z lekcją o wierszach zależnych od własnego wydania); rollback: kod przez `npx wrangler rollback` i ręczne przesunięcie tagu, schemat bez cofania (kod sprzed migracji B czytałby `email`, którego już nie ma, więc rollback kodu poniżej fazy 1 wymaga przywrócenia kolumny osobną migracją). README: zdanie w akapicie RLS, że `list_group_members` zwraca nick, nie adres.

### Success Criteria:

#### Automated Verification:

- Strażnik migracji przyjmuje migrację B ze znacznikiem: `npm run guard:migrations`
- Migracja B stosuje się, a typy są świeże: `npx supabase db reset && npm run types:check`
- Lint i build przechodzą: `npm run lint && npm run build`
- Testy integracyjne z asercją kluczy odpowiedzi RPC przechodzą: `npm test`
- Scenariusze RLS bez asercji e-maila i z asercją braku kolumny przechodzą: `npm run test:rls`
- Smoke fazy 1 przechodzi bez zmian na schemacie bez kolumny `email`: `npm run build && npm run preview` oraz `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- `compat` na PR-ze fazy zielony: smoke z tagu `production` (kod fazy 1) przechodzi na schemacie z migracją B (sprawdzane na PR-ze po wypchnięciu, jak w fazie 1)
- Przed otwarciem PR-a: `git ls-remote --tags origin production` wskazuje commit zawierający merge fazy 1 (`git merge-base --is-ancestor <merge fazy 1> <sha tagu>` wychodzi 0)
- PR fazy scalony przez właściciela, `release` zatwierdzony z migracją B (`<YYYYMMDDHHmmss>_drop_email_from_list_group_members.sql`), `db push` zgłasza dokładnie tę migrację
- Kontrola produkcji (właściciel): dashboard z grupą ładuje się, lista członków, uczestnicy i tablica pokazują nicki, `/settings` pokazuje własny e-mail
- Zapis wydania 2 w `deployment-plan.md` Phase 18 (data, run, wersja Cloudflare, przesunięcie tagu, wynik kontroli) w zamykającym PR-ze dokumentacyjnym

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `nickname-rules`: przycinanie tylko spacji, tabulatora, CR i LF; długość w punktach kodowych; granice 1/2/24/25; wejście niebędące stringiem.
- `nickname-errors`: mapowanie 23505/23514/42501/inne; `resolveNicknameError` z allow-listą (`__proto__`, obce wartości).
- `nicknames.suggestNickname`: pierwszeństwo bieżącego nicka, `full_name` przed `name`, pomijanie wartości spoza reguł.
- `leaderboard-rules`: remis po nicku małymi literami, potem `userId`; `null` jako „Unknown member”; sumy bez zmian.
- `dashboard-data`: `participantsResolver` z nickiem i „Unknown member” dla nieaktualnego uczestnika.

### Integration Tests:

- Middleware: brama dla stron i API, wyjątki strony i trasy nicka, 503 przy błędzie odczytu, brak odczytu dla anonimowego.
- Trasa `account/nickname`: pełny zestaw wierszy w sieci charakteryzacyjnej i strażnik pokrycia z rodziną `account`.
- Baza: `set_nickname` (insert, update, 23505, 23514, 42501 dla anon), widoczność własnego wiersza, left join w `list_group_members`, kontrakt reguł TS↔DB, klucze odpowiedzi RPC (faza 2), scenariusze RLS.
- Smoke: brama jako wynik (302 na stronę nicka, zaproszenie nietknięte), stan po każdym odrzuconym zapisie (brama nadal przekierowuje), zapis i zmiana nicka, komunikaty błędów, obcy Origin, GET 404, nicki w każdym wierszu, brak adresów e-mail w HTML dashboardu.
- E2E: rejestracja przez UI przechodzi przez stronę nicka z oczekującym zaproszeniem; tablica po nicku; „Signed in as” z nickiem konta seed; `auth.setup.ts` odporny na konto seed bez nicka.

### Manual Testing Steps:

1. Nowe konto e-mail lokalnie: rejestracja → `/dashboard` → „Choose your nickname” → zapis → dashboard z „Signed in as”.
2. Drugie konto próbuje tego samego nicka: komunikat „This nickname is already taken. Pick another one.”; po zmianie wielkości liter zapis przechodzi.
3. Link zaproszenia przed rejestracją: po kroku nicka dashboard pyta „Join {group}?”.
4. Konto sprzed zmiany w grupie: inni widzą „Unknown member”; po jego zalogowaniu i wyborze nicka etykieta znika.
5. `/settings`: karta Account z nickiem i e-mailem; zmiana nicka wraca na `/settings`.
6. Produkcja po wydaniu 1 i po wydaniu 2 zgodnie z wierszami ręcznymi faz; konto Google na produkcji (podpowiedź imienia).

## Performance Considerations

Brama dodaje jeden odczyt PostgREST po kluczu głównym na każde żądanie chronione: `/dashboard` z 5 do 6 wywołań, `/settings` z 1 do 2, każdy POST `/api/groups/*` i `/api/tasks/*` o jedno więcej. Odczyt idzie tym samym klientem co `getUser()`, równolegle z niczym (musi poprzedzić decyzję o przekierowaniu). `list_group_members` dostaje left join po kluczu głównym `nicknames`. Czas CPU `/dashboard` nie był mierzony przed zmianą (otwarte ryzyko z S-04) i nie jest mierzony tutaj.

## Migration Notes

- Migracja A jest addytywna dla wdrożonego kodu: nowa tabela, nowa funkcja, RPC z kolumną więcej. Wdrożony kod nie wie o bramie, więc konta utworzone między `db push` a `wrangler deploy` wydania 1 dostają nick przy następnym żądaniu po deployu.
- Bez backfillu: istniejące konta na produkcji (liczba nieznana; właściciel może ją odczytać zapytaniem `select count(*) from auth.users;` w SQL Editorze) pokazują się innym jako „Unknown member” do pierwszego zalogowania po wydaniu 1.
- Migracja B jest destrukcyjna dla kodu sprzed fazy 1 i wolno ją wdrożyć tylko po przesunięciu tagu na kod fazy 1; rollback kodu poniżej fazy 1 po migracji B wymaga osobnej migracji przywracającej kolumnę `email`.
- Lokalnie po każdej migracji: `npx supabase db reset`, regeneracja `src/types.ts`, `npm run types:check`, `npm test`, `npm run test:rls` (cookbook `test-plan.md` §6.5).

## References

- Rama: `context/changes/nickname/frame.md`
- Badanie: `context/changes/nickname/research.md`
- RPC i konwencje: `supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:10-31`, `supabase/migrations/20260925011727_harden_group_rls.sql:18-51` (drop + create, `join_group`), `supabase/migrations/20261001090000_create_task_participants.sql:26-60` (revoke, granty, polityki)
- Wzorzec formularz + trasa: `src/components/dashboard/GroupSettingsCard.astro`, `src/components/groups/RenameGroupForm.tsx`, `src/pages/api/groups/rename.ts`, `src/lib/group-errors.ts`, `src/lib/group-rules.ts`
- Pipeline żądania: `src/middleware.ts`, `src/lib/auth-state.ts`, `src/env.d.ts`, `tests/integration/middleware.test.ts`
- Kontrakt danych i widoki: `src/lib/groups.ts:12-40`, `src/lib/leaderboard-rules.ts:27-63,84-139`, `src/lib/dashboard-data.ts:154-174`, `src/components/dashboard/{MembersCard,TaskRow,SettingsView}.astro`, `src/components/tasks/Leaderboard.tsx`, `src/layouts/AppLayout.astro`
- Bramki: `.github/workflows/ci.yml:217-273` (`compat`), `scripts/migration-guard.mjs:286-322`, `tests/integration/data-routes.test.ts:1121-1142`, `tests/integration/rule-contracts.test.ts:16-24`
- Harnessy: `scripts/smoke.mjs`, `scripts/e2e-user.mjs:83-100`, `tests/e2e/{auth.setup.ts,helpers.ts,local-supabase.ts,invite-join.spec.ts,checkoff-round-trip.spec.ts,seed.spec.ts}`, `tests/helpers/supabase.ts:33-48`, `supabase/checks/rls-scenarios.sql`
- Kitchen sink: `src/components/dev/dashboard-fixtures.ts`, `src/pages/dev/dashboard-kitchen-sink.astro`, `scripts/ui-screenshots.mjs`
- Dokumenty: `src/pages/auth/signup.astro:16-17`, `src/components/privacy/{WhoCanSee,WhatWeCollect}.astro`, `README.md`, `CLAUDE.md`, `context/foundation/prd.md`, `context/domain/glossary.md`, `context/domain/01-domain-distillation.md`, `context/changes/deployment/deployment-plan.md`
- Lekcje: `context/foundation/lessons.md` (jeden przebieg `/goal` i jeden PR; `compat` czyta tag `production`; każdy zwrócony `{ error }` raportowany; smoke asertuje wyniki; mutacje po uruchomieniu zawężonym; zamknięcie wycinka przez merge, zatwierdzenie `release` i kontrolę produkcji)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Nick: schemat, brama, widoki i obietnice (wydanie 1)

#### Automated

- [x] 1.1 Strażnik migracji przyjmuje migrację A ze znacznikiem — d8ae9ae
- [x] 1.2 Migracja A stosuje się na czystym stosie, a wygenerowane typy są świeże — d8ae9ae
- [x] 1.3 Lint, kontrola typów Astro i build przechodzą — d8ae9ae
- [x] 1.4 Testy jednostkowe przechodzą — d8ae9ae
- [x] 1.5 Testy integracyjne przechodzą — d8ae9ae
- [x] 1.6 Scenariusze RLS z sekcją S-14 przechodzą — d8ae9ae
- [x] 1.7 Smoke z krokami bramy, nicków i wykluczeniem adresów przechodzi — d8ae9ae
- [x] 1.8 Testy e2e w obu projektach przechodzą — d8ae9ae
- [x] 1.9 Reguły zależności przechodzą — d8ae9ae
- [x] 1.10 Zawężone mutacje nowych modułów i remisu uruchamiają testy — d8ae9ae
- [x] 1.11 Zrzuty stanów kitchen sinka powstają bez błędu konsoli — d8ae9ae

#### Manual

- [x] 1.12 `compat` na PR-ze fazy zielony — 62204c7
- [x] 1.13 Przegląd zrzutów w obu szerokościach — owner, 2026-10-16: checked, all ok
- [x] 1.14 Lokalnie nowe konto e-mail przechodzi stronę nicka, drugie konto dostaje komunikat o zajętym nicku, zaproszenie przeżywa krok nicka — owner, 2026-10-16: checked, all ok
- [x] 1.15 Lokalnie konto sprzed zmiany jest „Unknown member” do zalogowania i wyboru nicka — owner, 2026-10-16: checked, all ok
- [x] 1.16 `/settings` pokazuje kartę Account, zmiana nicka wraca na `/settings` — owner, 2026-10-16: checked, all ok
- [x] 1.17 Przegląd `/privacy`, `/auth/signup`, README i CLAUDE.md — owner, 2026-10-16: checked, all ok
- [x] 1.18 PR scalony, `release` zatwierdzony z migracją A — 62204c7
- [x] 1.19 Kontrola produkcji po wydaniu 1 — 62204c7
- [x] 1.20 Konto Google na produkcji: podpowiedź imienia sprawdzona i zapisana — 62204c7

### Phase 2: Wydanie 2: `list_group_members` bez e-maila

#### Automated

- [x] 2.1 Strażnik migracji przyjmuje migrację B ze znacznikiem — 11985cb
- [x] 2.2 Migracja B stosuje się, a typy są świeże — 11985cb
- [x] 2.3 Lint i build przechodzą — 11985cb
- [x] 2.4 Testy integracyjne z asercją kluczy odpowiedzi RPC przechodzą — 11985cb
- [x] 2.5 Scenariusze RLS bez asercji e-maila i z asercją braku kolumny przechodzą — 11985cb
- [x] 2.6 Smoke fazy 1 przechodzi bez zmian na schemacie bez kolumny `email` — 11985cb

#### Manual

- [x] 2.7 `compat` na PR-ze fazy zielony — a08916e
- [x] 2.8 Tag `production` zawiera merge fazy 1 przed otwarciem PR-a — a08916e
- [x] 2.9 PR scalony, `release` zatwierdzony z migracją B — a08916e
- [x] 2.10 Kontrola produkcji po wydaniu 2 — a08916e
- [x] 2.11 Zapis wydania 2 w `deployment-plan.md` Phase 18 — 40d0f1e
