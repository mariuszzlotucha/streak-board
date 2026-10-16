# Frame Brief: Nick zamiast e-maila (S-14 `nickname`)

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_ przedmiotem problemu, oddzielone od tego, co początkowo założono. Data: 2026-10-16.

## Zgłoszona obserwacja

Aplikacja pokazuje adresy e-mail użytkowników na liście w StreakBoard (członkowie, uczestnicy tasków, tablica wyników) i obok przycisku Sign out („Signed in as …”). Właściciel nie chce ujawniać e-maili. Słowa właściciela: „teraz pokazuję na liście streakbaord i obok signout emmaile userów, a nie chcę ujawniać emaili”.

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: „dodanie nicka”: nick zastępuje e-mail.
- **Proponowany przez użytkownika kierunek**: nowy wycinek S-14 `nickname` w `context/foundation/roadmap.md`, potem zwykły łańcuch planowania.
- **Zawężenie przed delegowaniem**: problemem są wszystkie cztery miejsca (lista członków, uczestnicy tasków, tablica wyników, własna linia „Signed in as”). Ujawnieniem e-maila jest także to, co inny członek dostaje w tle: w HTML strony i z API, nie tylko to, co widać na ekranie.

## Mapa wymiarów

Obserwacja może pochodzić z każdego z tych wymiarów:

1. **Etykieta tożsamości** — aplikacja nie ma żadnej nazwy członka poza daną logowania; e-mail jest jedyną etykietą. Ramy zakładają, że potrzebna jest nowa, wybierana przez użytkownika. ← początkowe ujęcie
2. **Ścieżka danych** — e-maile płyną z RPC `list_group_members` przez typ `GroupMember` do HTML: lista członków, uczestnicy tasków, propsy wyspy Leaderboard, tekst dialogu usunięcia członka. Ramy zakładają, że zamiana w widoku wystarczy.
3. **Własne konto („Signed in as”)** — inna klasa niż pozostałe: widzi to tylko zalogowany, nie inni członkowie. Ramy traktują to miejsce jak resztę.
4. **Obietnice i kontrakty** — decyzja z S-01 „członek rozpoznawany po e-mailu” stała się tekstem przy rejestracji, polityką prywatności, regułą sortowania remisów i asercjami testów. Ramy zakładają, że to tylko skutki.

## Badanie hipotez

Badanie wykonane w głównym kontekście (odczyt plików bez pod-agentów; `TaskCreate` nie jest dostępny w tej sesji).

| Hipoteza                                                                                     | Dowody                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Werdykt |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1. Nie ma etykiety innej niż e-mail dla każdego konta                                        | Rejestracja zbiera tylko e-mail i hasło (`src/components/auth/SignUpForm.tsx`); imię od Google trafia do Supabase Auth, ale „The app uses only the e-mail address” (`src/components/privacy/WhatWeCollect.astro:14-15`); w `src/` nie ma użycia `user_metadata`; `UNKNOWN_MEMBER` obsługuje tylko brak e-maila (`src/lib/leaderboard-rules.ts:39`)                                                                                                                                                                                                                                                                     | SILNE   |
| 2. Zamiana w widoku zostawia e-maile w danych                                                | RPC zwraca `u.email` każdemu członkowi (`supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:11,19`; grant dla `authenticated` `:30-31`); `GroupMember.email` (`src/lib/groups.ts:12-17`); mapa e-maili uczestników (`src/lib/dashboard-data.ts:168-171`); `Leaderboard client:load rows={board.totals}` serializuje `StandingInput.email` do HTML (`src/components/dashboard/DashboardView.astro:93`, `leaderboard-rules.ts:29`); dialog usunięcia (`src/components/dashboard/MembersCard.astro:42-44`)                                                                                          | SILNE   |
| 3. „Signed in as” to inna klasa (widzi tylko właściciel konta)                               | `src/layouts/AppLayout.astro:47` drukuje `user?.email` przekazany z `src/pages/dashboard.astro:37` i `src/pages/settings.astro:19`; żaden inny widok nie pokazuje własnego e-maila                                                                                                                                                                                                                                                                                                                                                                                                                                     | SILNE   |
| 4. Skrót z MVP stał się kontraktem (identyfikacja po e-mailu to decyzja S-01, nie wymóg PRD) | S-01: „No profiles table / display names (members are identified by email)” (`context/archive/2026-09-25-group-create-join-manage/plan.md:33`; poza zakresem w `plan-brief.md:36`); S-09 dopisał obietnicę do rejestracji i polityki (`context/archive/2026-10-08-landing-page/plan.md:291`, `reviews/plan-review.md:35-36`); S-11 odłożył „display names” jako nowe dane (`context/archive/2026-10-09-dashboard-ui/plan.md:145`); słownik: „nie wprowadzaj bez decyzji” (`context/domain/glossary.md:55`); destylacja: Q-05 otwarte, remisy po e-mailu N-18 „PRD milczy” (`context/domain/01-domain-distillation.md`) | SILNE   |

Poza tym: e-maile członków nie trafiają do żadnej odpowiedzi JSON tras `/api/groups/*` i `/api/tasks/*` (grep `email` w `src/pages/api/`: tylko trasy auth), `preview_group` zwraca tylko nazwę grupy, a klienci nie czytają `auth.users` (komentarz migracji `:3-4`). Jedyna droga e-maila innego członka do przeglądarki to `list_group_members` i HTML z niego zbudowany.

## Sygnały zawężające

Odpowiedzi właściciela (2026-10-16), które zawęziły przestrzeń hipotez:

- **Zakres**: wszystkie cztery miejsca. Wymiar 3 wchodzi do problemu mimo innej klasy.
- **Ujawnienie**: także dane w tle. Wymiar 2 jest częścią problemu, nie skutkiem: kontrakt RPC i HTML muszą przestać nieść e-mail.
- **Rozpoznanie**: tak, po nazwie. Etykieta ma być rozpoznawalna dla znajomych, nie tylko rozróżnialna; wymiar 1 potwierdzony.
- **Dane Google**: aplikacja może używać imienia, które Google przekazuje przy logowaniu. Zdanie polityki „The app uses only the e-mail address” przestaje być prawdziwe.
- **Bez nicka**: nick obowiązkowy. Każde konto, także każde istniejące, ma nick, zanim wejdzie dalej; inni nigdy nie widzą konta bez nazwy.
- **Własny e-mail**: tylko w ustawieniach. Dashboard nie pokazuje e-maila; `/settings` może pokazywać e-mail konta.
- Q-05 z destylacji dostaje odpowiedź: e-mail nie pozostaje nazwą członka.

## Konwencja między systemami

Klienci nie czytają `auth.users`; dane o członkach idą przez funkcję SECURITY DEFINER ograniczoną `is_group_member` (migracja `:3-4`, `:10-28`), zgodnie z regułą PRD o widoczności tylko w obrębie własnej grupy (`context/foundation/prd.md:36`). Każda nowa tabela dostaje RLS i polityki per operacja i rolę (CLAUDE.md). Zmiana tego, kto co widzi, zmienia politykę prywatności w tej samej zmianie (CLAUDE.md; tak też S-11 odłożył display names, `dashboard-ui/plan.md:145`). Nazwa wyświetlana wymaga decyzji (`glossary.md:55`); ta rama ją zawiera. Wiodące ujęcie pasuje do konwencji: nazwa członka przechodzi przez tę samą granicę widoczności, przez którą dziś przechodzi e-mail.

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: tożsamością członka w kontrakcie danych, w widoku i w obietnicach aplikacji jest dana logowania (e-mail), którą `list_group_members` zwraca każdemu członkowi grupy; potrzebna jest nazwa członka, obowiązkowa dla każdego konta, która zastępuje e-mail w kontrakcie, w HTML i w obietnicach, a e-mail zostaje widoczny tylko dla właściciela konta w ustawieniach.

Początkowe ujęcie („nick zamiast e-maila”) się potwierdziło i zostało poszerzone. Nick w widoku to powierzchnia; źródłem jest kontrakt, bo e-mail jest jedyną etykietą członka i przeglądarka każdego członka dostaje go w HTML i z RPC. Rozwiązanie problemu oznacza, że żaden członek nie dostaje cudzego e-maila żadną drogą, każde konto ma nazwę, zanim pokaże się innym, a teksty przy rejestracji, polityka, słownik i PRD mówią to samo, co kod.

## Pewność

**WYSOKA** — każda hipoteza ma dowody `file:line`, ujęcie pasuje do konwencji projektu, a sześć odpowiedzi właściciela rozstrzyga zakres. Nie ma kroku weryfikacji przed `/10x-plan`; jedyna niewiadoma liczbowa (ile kont istnieje na produkcji, które dostaną obowiązkowy nick) nie zmienia ram, tylko rozmiar migracji danych.

## Co zmienia się dla /10x-plan

Plan obejmuje więcej niż widok:

- **Kontrakt danych**: `list_group_members` przestaje zwracać e-mail; typy `GroupMember` (`groups.ts:12-17`), `StandingInput` (`leaderboard-rules.ts:29`), `TaskParticipant` (`dashboard-data.ts:154-157`) i `src/types.ts` (generowany); klucz remisu na tablicy (dziś e-mail, N-18) i `UNKNOWN_MEMBER`.
- **Nazwa dla każdego konta**: obowiązkowa, także dla kont istniejących przed wdrożeniem; nowa tabela z RLS. Imię od Google jest dozwolonym źródłem (sposób użycia to decyzja planu); dla kont e-mail+hasło nazwę podaje użytkownik.
- **Własny e-mail**: znika z dashboardu, może zostać na `/settings`.
- **Obietnice**: `EMAIL_VISIBILITY` (`src/pages/auth/signup.astro:17`, przypięte przez smoke), `WhoCanSee.astro:9,15,17`, `WhatWeCollect.astro:14-15`, `glossary.md:40,55` (W-06, display name), PRD (nowy FR; dziś brak nicka), zamknięcie Q-05 w `context/foundation/owner-decisions.md`.
- **Testy przypięte do e-maili**: smoke `memberRow`, `rowWithRemoveControl`, `taskRowListing`, `leaderboardRow` (`scripts/smoke.mjs:129-242`), e2e `expectViewerTotal` (`tests/e2e/checkoff-round-trip.spec.ts:29-36`), kontrola „a member gets the emails” (`tests/integration/group-isolation.test.ts:111-125`), fixture'y (`src/components/dev/dashboard-fixtures.ts:73-100`), `tests/unit/dashboard-data.test.ts:248`.

Poza ramą, do planu: reguły nicka (długość, unikalność; propozycja w roadmapie S-14), mechanika wymuszenia nicka dla kont bez niego, sposób użycia imienia od Google. Otwarte dla właściciela, poza ramą: kolejność względem S-13 (wspólne pliki: `WhoCanSee.astro`, PRD, słownik, `dashboard-data.ts`), czy S-14 wchodzi do M-2, liczba kont na produkcji (zapytanie wykonuje właściciel).

## Odniesienia

- Pliki źródłowe: `supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:3-31`, `src/lib/groups.ts:12-40`, `src/lib/dashboard-data.ts:154-174`, `src/lib/leaderboard-rules.ts:29,39,51`, `src/components/dashboard/DashboardView.astro:93`, `src/components/dashboard/MembersCard.astro:32,42-44`, `src/components/dashboard/TaskRow.astro:78`, `src/components/tasks/Leaderboard.tsx:32`, `src/layouts/AppLayout.astro:47`, `src/pages/auth/signup.astro:17`, `src/components/privacy/WhoCanSee.astro`, `src/components/privacy/WhatWeCollect.astro:14-15`
- Dokumenty: `context/foundation/roadmap.md` (S-14), `context/domain/glossary.md:40,55`, `context/domain/01-domain-distillation.md` (W-06, N-18, Q-05), `context/archive/2026-09-25-group-create-join-manage/plan.md:33`, `context/archive/2026-10-08-landing-page/plan.md:291`, `context/archive/2026-10-09-dashboard-ui/plan.md:145`
- Powiązane badania: `context/changes/nickname/research.md` (jeszcze nie istnieje; `/10x-research nickname`)
- Zadania badawcze: brak (badanie w głównym kontekście)
