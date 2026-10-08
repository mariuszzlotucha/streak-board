---
project: "StreakBoard"
version: 1
status: draft
created: 2026-09-24
updated: 2026-10-08
prd_version: 1
main_goal: market-feedback
top_blocker: time
milestone_id: ready-for-real-users
milestone_seq: 2
milestone_status: open
---

# Roadmap: StreakBoard

> Derived from context/foundation/roadmap-input-next-slices.md, the user's later additions and PRD v1 (FR-001) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-2: Gotowość na realnych użytkowników: adres, logowanie, strona startowa, widok, testy i widoczne awarie** — Status: open

- **Intent:** Po zamknięciu pierwszego pełnego cyklu (M-1) doprowadzić wdrożone MVP do stanu, w którym można je pokazać realnym użytkownikom i zbierać od nich informację zwrotną: własny adres, łatwe logowanie kontem Google, strona startowa tłumacząca produkt, czytelniejszy widok grupy, testy chroniące zmiany oraz awarie, które nie giną po cichu.
- **Source materials:** `context/foundation/roadmap-input-next-slices.md` (MS-01 do MS-05, zakres uzgodniony z użytkownikiem po zamknięciu wszystkich pozycji M-1), późniejszy opis użytkownika (MS-06) oraz FR-001 z PRD v1 („email/OAuth/passwordless"), na którym opiera się MS-06. Poza FR-001 ten kamień milowy nie realizuje nowych FR-ów.
- **Done when:** każdy S-06 do S-13 poniżej ma status `done`.
- **Scope anchors:** źródło nie ma własnych identyfikatorów, więc zakres jest zapisany jako kotwice `MS-NN`, po jednej na wycinek: MS-01 do MS-05 z wyników opisanych w pliku wejściowym, MS-06 z późniejszego opisu użytkownika:
  - MS-01: użytkownik wchodzi na aplikację pod własną domeną właściciela, a rejestracja, logowanie i link potwierdzający działają na tej domenie.
  - MS-02: (jakościowy) zmiany w aplikacji są chronione testami wybranymi według ryzyka, a jakość testów jednostkowych jest mierzona mutacjami.
  - MS-03: niezalogowany użytkownik widzi stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania.
  - MS-04: zalogowany użytkownik korzysta z czytelniejszego, spójnego wizualnie widoku grupy, tasków i tablicy wyników.
  - MS-05: (jakościowy) awaria w krytycznym przepływie aplikacji nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu.
  - MS-06: użytkownik może zalogować się kontem Google (logowanie bez hasła); to ta część FR-001 z PRD (OAuth/passwordless), która nie weszła do M-1.
  - MS-07: (jakościowy) wybrane okazje refaktoryzacji z analizy data-access są wdrożone bez zmiany zachowania widocznego dla użytkownika (decyzja użytkownika 2026-10-08: istniejąca zmiana `refactor-opportunities` staje się wycinkiem).
  - MS-08: członek grupy widzi siatkę odznaczeń: uczestnicy × ostatnie okresy tasku, wykonane i niewykonane (decyzja użytkownika 2026-10-08: odparkowanie historii w zakresie prostej siatki, bez wykresów i statystyk).

## Vision recap

Grono znajomych korzystało wcześniej ze wspólnego arkusza Google, w którym ręcznie kolorowało komórki na zielono/czerwono, żeby widzieć nawzajem swoją konsekwencję w budowaniu nawyków — wartość dawała widoczność dla innych, ale ręczne prowadzenie było na tyle męczące, że narzędzie przestało być używane. Istniejące aplikacje do nawyków są projektowane dla pojedynczego użytkownika i nie obsługują modelu, w którym kilka osób śledzi ten sam cel równolegle; StreakBoard automatyzuje dokładnie ten sam prosty widok siatki i dodaje grywalizację (streaki), której arkusz nigdy nie miał.

## North star

**S-06: użytkownik wchodzi na aplikację pod domeną `streakboard.app`, a rejestracja, logowanie i link potwierdzający działają na tej domenie** — to najmniejszy kompleksowy przepływ, od którego zależy, czy ktokolwiek spoza obecnego grona wejdzie do produktu i zostawi informację zwrotną; błędna konfiguracja adresu potrafi po cichu zepsuć rejestrację na produkcji, więc warto to sprawdzić jako pierwsze, a ten wycinek zmienia też adres, na który wskazują kolejne.

> Gwiazda przewodnia (ang. north star) to najmniejszy kompleksowy wycinek widoczny dla użytkownika, którego dostarczenie jako pierwszego potwierdza główną hipotezę tego kamienia milowego — umieszczony tak wcześnie, jak pozwalają jego zależności, bo reszta ma znaczenie tylko wtedy, gdy to działa. Tutaj hipoteza brzmi: nowa osoba trafia pod docelowy adres, zakłada konto i dociera do dashboardu bez ręcznych obejść.

## At a glance

| ID   | Change ID                      | Outcome (user can …)                                                                                                                                     | Prerequisites                                           | PRD refs                           | Status   |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------- | -------- |
| S-06 | custom-domain                  | wejść na aplikację pod domeną `streakboard.app`; rejestracja, logowanie i link potwierdzający działają na tej domenie                                    | domena `streakboard.app` w Cloudflare (Registrar i DNS) | — (operacyjne; MS-01)              | done     |
| S-07 | google-login                   | zarejestrować się i zalogować kontem Google, bez ustawiania hasła                                                                                        | S-06                                                    | FR-001 (OAuth/passwordless); MS-06 | done     |
| S-08 | observability-swallowed-errors | (jakościowy) awaria w krytycznym przepływie nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu                        | —                                                       | — (jakościowe; MS-05)              | done     |
| S-09 | landing-page                   | zobaczyć jako niezalogowany stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania                                | S-06, S-07                                              | — (UI; MS-03)                      | done     |
| S-10 | test-coverage                  | (jakościowy) zmiany w aplikacji są chronione testami wybranymi według ryzyka, a jakość testów jednostkowych jest mierzona mutacjami                      | —                                                       | — (jakościowe; MS-02)              | ready    |
| S-11 | dashboard-ui                   | korzystać z czytelniejszego, spójnego wizualnie widoku grupy, tasków i tablicy wyników                                                                   | S-08, S-10                                              | — (UI; MS-04)                      | proposed |
| S-12 | refactor-opportunities         | (jakościowy) znane ciche luki są zamknięte: raportowanie błędów dashboardu, strażnicy migracji i typów w CI, testy tras i reguł, jawne uprawnienia tabel | —                                                       | — (jakościowe; MS-07)              | planning |
| S-13 | checkoff-grid                  | zobaczyć siatkę odznaczeń grupy: kto wykonał task w każdym z ostatnich okresów                                                                           | S-11                                                    | — (UI; MS-08)                      | proposed |

## Streams

Pomoc nawigacyjna — grupuje pozycje ze wspólnym łańcuchem Prerequisites. Kanoniczna kolejność jest w grafie zależności poniżej; ta tabela to proponowana kolejność czytania równoległych ścieżek.

| Stream | Theme                   | Chain                    | Note                                                                                                                                        |
| ------ | ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Wejście dla nowych osób | `S-06` → `S-07` → `S-09` | Adres, logowanie bez hasła i strona startowa składają się na ścieżkę nowej osoby do dashboardu: to wejście do informacji zwrotnej od rynku. |
| B      | Siatka testów i widok   | `S-10` → `S-11` → `S-13` | Testy przed zmianą wyglądu; `S-11` dołącza do strumienia C w `S-08`; siatka odznaczeń powstaje już w nowym widoku.                          |
| C      | Widoczność awarii       | `S-08` → `S-12`          | Domknięcie cichych luk po S-08; `S-12` jest niezależny technicznie i może iść równolegle z `S-10`.                                          |

## Baseline

What's already in place in the codebase as of `2026-10-02` (auto-researched; the user confirmed the domain).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 (SSR; Vite 8.3.0 wymagany przez Astro i adapter) + React 19 + Tailwind 4 + komponenty shadcn/ui; strony auth, `/dashboard` (grupa, taski, tablica wyników, wyspy React) i `/join/[code]`; `/` to nadal szablon startowy („10x Astro Starter"), a nie strona produktu.
- **Backend / API:** present — 17 tras API (auth, groups, tasks), `/auth/callback` i `/auth/google/callback` (stan po S-07); 24 wywołania `console.error` w trasach, callbacku i dashboardzie (zachowanie przy błędach do zweryfikowania w audycie S-08).
- **Data:** present — Supabase (Postgres + RLS): 7 migracji (grupy, członkostwo, taski, uczestnicy, odznaczenia, utwardzenia RLS i uprawnień), lokalny stos i testy RLS.
- **Auth:** present — Supabase Auth email+hasło oraz Google (od S-07: dostawca włączony w Supabase, aplikacja Google w statusie Testing), sesje w cookie, middleware chroni `/dashboard`, `/api/groups` i `/api/tasks`; link potwierdzający wraca przez `/auth/callback`, logowanie Google przez `/auth/google/callback`; e-maile z własnego SMTP (Resend) wg README.
- **Deploy / infra:** present — Cloudflare Workers pod adresem `workers.dev`; CI w GitHub Actions (joby `ci`, `smoke` i `integration`; `release` czeka na wszystkie trzy i na zatwierdzenie w środowisku `production`: migracje, potem deploy); domena `streakboard.app` zarejestrowana (Cloudflare Registrar, DNS w Cloudflare, potwierdzone przez właściciela), aplikacja jeszcze na niej nie stoi (wg README).
- **Observability:** partial — Workers Logs włączone; brak error trackingu (żadnego Sentry/OTel w zależnościach ani kodzie); `context/audits/` jeszcze nie istnieje, skill `/10x-observability-audit` jest zainstalowany.
- **Tests (poza standardową listą warstw):** present — Vitest (5 plików unit, 9 integracyjnych na lokalnym Supabase), Playwright (setup, seed, izolacja grup), smoke przez HTTP (skrypt na ponad 1600 linii; stronę `/` sprawdza tylko statusem 200), konfiguracja Stryker (testy mutacyjne); w `test-plan.md` etapy 1 i 4 wdrożone, 2 i 3 nierozpoczęte, a §4 wciąż mówi „e2e: none — not planned".

## Foundations

(brak — M-2 nie wymaga przekrojowego odblokowania. Żadna warstwa ze stanu bazowego nie jest `absent`; konfiguracja dostawcy logowania, error tracking, konfiguracja testów i wiązanie domeny wchodzą do pierwszego wycinka, który ich potrzebuje (S-07, S-08, S-10, S-06), zgodnie z zasadą progresywnego ujawniania elementów technicznych.)

## Slices

### S-06: Własna domena produktu

- **Outcome:** użytkownik wchodzi na aplikację pod domeną `streakboard.app`, a rejestracja, logowanie i link potwierdzający działają na tej domenie.
- **Change ID:** custom-domain
- **PRD refs:** — (operacyjne; MS-01)
- **Prerequisites:** domena `streakboard.app` w Cloudflare (Registrar i DNS)
- **Parallel with:** S-08, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - Czy stary adres `workers.dev` ma pozostać aktywny po przepięciu na własną domenę (równolegle, z przekierowaniem czy wyłączony)? — Owner: user. Block: no — rozstrzyga `/10x-frame` lub `/10x-research`. Rozstrzygnięte: wyłączony po weryfikacji nowego adresu (faza 4, `workers_dev: false` i `preview_urls: false`).
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „1. custom-domain" (praca operacyjna bez UI: kroki wymagające dostępu wykonuje właściciel; zakres obejmuje też poprawę dokumentacji, która dziś zakłada adres `workers.dev`).
- **Risk:** Błędne Redirect URLs lub Site URL w Supabase łamią rejestrację na produkcji (znane z `release-automation-and-auth-hardening` w M-1: bez adresu na liście Supabase po cichu wraca do Site URL, a użytkownik po potwierdzeniu nie jest zalogowany), więc idzie pierwszy: zmienia adres, na który wskazują kolejne wycinki. Zmiana nie dotyka schematu bazy; kod wraca przez rollback Workera, ale ustawień w panelu Supabase rollback nie obejmuje.
- **Status:** done

### S-07: Logowanie kontem Google

- **Outcome:** użytkownik może zarejestrować się i zalogować kontem Google, bez ustawiania hasła.
- **Change ID:** google-login
- **PRD refs:** FR-001 (OAuth/passwordless); MS-06
- **Prerequisites:** S-06
- **Parallel with:** S-08, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - „Passwordless" — czy chodzi tylko o logowanie kontem Google (OAuth), czy także o link logujący wysyłany e-mailem? — Owner: user. Block: no — rozstrzyga `/10x-frame`. Rozstrzygnięte: tylko konto Google; e-mail+hasło zostaje, bez linku logującego.
  - Co z istniejącymi kontami email+hasło, gdy ten sam adres zaloguje się przez Google: połączyć konta czy rozdzielić? — Owner: user. Block: no — decyzja produktowa i bezpieczeństwa przy `/10x-frame`. Rozstrzygnięte: Supabase łączy konta automatycznie po tym samym adresie e-mail (ten sam użytkownik, ta sama grupa); opcji „rozdzielić" nie ma, a komunikaty błędów formularzy e-mail dostają statyczną podpowiedź o Google.
  - Czy ekran zgody Google wymaga od domeny strony głównej i polityki prywatności (a więc czy S-09 musi powstać wcześniej, czy wystarczy przejściowy opis)? — Owner: user. Block: no — rozstrzyga `/10x-research`. Rozstrzygnięte: aplikacja Google zostaje w statusie Testing, który nie wymaga strony głównej ani polityki prywatności, więc S-09 nie musi powstać wcześniej; polityka prywatności jest bramką publikacji aplikacji Google i trafia do S-09.
- **Źródło zakresu:** opis użytkownika (MS-06) i FR-001 z PRD („email/OAuth/passwordless"); praca z krokami ręcznymi właściciela po stronie Google i Supabase (projekt i klient OAuth, ekran zgody; sekret klienta wyłącznie w panelu Supabase, nigdy w repozytorium ani w czacie).
- **Risk:** Konfiguracja po trzech stronach (Google, Supabase, aplikacja), a pełnego przepływu nie da się przejść lokalnie ani w smoke bez prawdziwego konta Google, więc weryfikacja produkcyjna jest częścią zamknięcia. Kod zaproszenia zapamiętany w cookie przed logowaniem musi przetrwać przekierowanie do Google i z powrotem, a callback logowania zamienia dziś każdy błąd na stały komunikat o wygasłym linku, co dla Google byłoby mylące. Idzie zaraz po S-06, bo adresy przekierowań i ekran zgody konfiguruje się raz, na docelowej domenie; omija wysyłkę e-maili potwierdzających, z którą były problemy w M-1.
- **Status:** done

### S-08: Awarie krytycznego przepływu nie są połykane

- **Outcome:** (jakościowy) awaria w krytycznym przepływie aplikacji nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu.
- **Change ID:** observability-swallowed-errors
- **PRD refs:** — (jakościowe; MS-05)
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-09, S-10
- **Blockers:** —
- **Unknowns:**
  - Zakres części A rozszerzono decyzją z planowania (2026-10-02): helper raportujący, middleware i wszystkie gałęzie zwróconego błędu w 13 trasach plus wyniki odznaczania, zamiast jednego znaleziska. — Owner: user. Block: no — rozstrzygnięte.
  - Który krytyczny przepływ audytujemy (kandydaci: odznaczanie i cofanie odznaczenia, dołączanie do grupy) i które znalezisko z raportu naprawiamy? — Owner: user. Block: no — wybór po raporcie z audytu observability.
  - Czy część B (narzędzie do śledzenia błędów na Workerze, darmowy plan wystarczy) wchodzi w zakres i czy konto jest założone po stronie użytkownika? — Owner: user. Block: no.
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „5. observability-swallowed-errors" (część A: audyt jednego przepływu i naprawa jednego znaleziska wraz z testem, że awaria nie jest już sukcesem; część B: opcjonalny monitoring z kluczem DSN jako sekretem, nigdy w repozytorium ani w czacie; raport audytu jest wejściem do planu).
- **Risk:** Zmiana odpowiedzi na błąd może zmienić kontrakt, na którym polegają wyspa odznaczania (mapuje 403 i 404 na „odrzucone", a inne błędy na „nie zapisano") i smoke; error tracking na Workerze zwiększa zużycie CPU (limit 10 ms na planie Free), więc narzut trzeba sprawdzić. Wycinek jest niezależny, więc może ruszyć od razu, równolegle z S-06; stoi przed S-11, bo oba dotykają wyspy odznaczania i smoke, a stany błędu w nowym widoku powinny wynikać z ustalonego już kontraktu błędów.
- **Status:** planning

### S-09: Strona startowa dla niezalogowanych

- **Outcome:** niezalogowany użytkownik widzi stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania.
- **Change ID:** landing-page
- **PRD refs:** — (UI; MS-03)
- **Prerequisites:** S-06, S-07
- **Parallel with:** S-08, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - Co strona obiecuje i do czego prowadzi (decyzja produktowa)? — Owner: user. Block: no — rozstrzyga `/10x-frame`. Rozstrzygnięte (2026-10-08): wspólny cel i widoczność (kilka osób śledzi ten sam nawyk i widzi nawzajem swoją konsekwencję, zamiennik wspólnego arkusza, wg wizji PRD); prowadzi do rejestracji i logowania, a odbiorcą jest obca osoba z publicznego linku.
  - Treść i język strony (reszta aplikacji jest po angielsku) — Owner: user. Block: no. Rozstrzygnięte (2026-10-08): angielski. `/` nie jest już szablonem (commit `35b08ea` dał ogólny opis produktu), więc treść jest przepisywana z ogólnego opisu na obietnicę z PRD.
  - Czy ma być widoczny podgląd tablicy wyników i czy zalogowany użytkownik jest przekierowywany na dashboard? — Owner: user. Block: no. Rozstrzygnięte (2026-10-08): bez podglądu tablicy; zalogowany jest przekierowywany z `/` na `/dashboard`.
  - Google Safe Browsing oznacza `streakboard.app` (status „Some pages on this site are unsafe", social engineering, stan z 2026-10-05, po przepisaniu treści): które URL-e i czy domena jest zweryfikowana w Google Search Console? — Owner: user. Block: no. Częściowo rozstrzygnięte (2026-10-08): domena zweryfikowana w Search Console (usługa „Domain"); „Security issues" pokazuje jeden problem, „Strony wprowadzające w błąd", bez przykładowych URL-i. Decyzja właściciela (2026-10-08): najpierw nowa strona i polityka prywatności na produkcji, potem prośba o przegląd w Search Console i adresy strony głównej i polityki w Google Auth Platform (Branding). Zdjęcie flagi należy do zakresu S-09, a `/10x-archive` czeka, aż właściciel potwierdzi wszystkie zgłoszenia do Google i wynik przeglądu (`context/archive/2026-10-08-landing-page/frame.md`, `change.md`).
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „3. landing-page" (nowy widok: zwykły łańcuch od `/10x-frame`; `/10x-ui` dopiero przy późniejszych poprawkach).
- **Risk:** Zależności od S-06 (adres publiczny) i S-07 (strona prowadzi do finalnego zestawu metod rejestracji i logowania) są kolejnościowe, nie techniczne. `/` ma już ogólny opis produktu (commit `35b08ea`), ale nie ma polityki prywatności, a jedyny dzisiejszy test tej strony to sprawdzenie statusu 200 w smoke, więc to przepisanie istniejącego widoku, nie widok od zera, a nowe kroki smoke muszą sprawdzać wynik (treść i dokąd prowadzą linki), nie tylko brak błędu (lekcja o smoke). Przepisana strona `/` musi zachować przekierowanie na `/auth/signin?error=oauth_failed` dla `error_code` równego `bad_oauth_state`, `bad_oauth_callback` i `flow_state_already_used` (dodane w S-07: tak wraca przeglądarka z wygasłego lub zużytego logowania Google; pilnują go kroki smoke). Flaga Safe Browsing na domenie (frame 2026-10-08) zatrzymuje obcą osobę przed stroną niezależnie od treści, a jej zdjęcie zależy od przeglądu po stronie Google, nie od wdrożenia.
- **Status:** done

### S-10: Testy dobrane według ryzyka

- **Outcome:** (jakościowy) zmiany w aplikacji są chronione testami wybranymi według ryzyka, a jakość testów jednostkowych jest mierzona mutacjami.
- **Change ID:** test-coverage
- **PRD refs:** — (jakościowe; MS-02)
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - Jak uzgodnić `test-plan.md` z decyzją o e2e: §4 mówi dziś „e2e: none — not planned", a wejście wprost wlicza e2e kluczowych przepływów (Playwright jest już skonfigurowany) — odświeżyć test-plan przed planowaniem czy uzgodnić to w planie wycinka? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „2. test-coverage" (testy jednostkowe dla logiki bez testów, testy mutacyjne na modułach z regułami, e2e kluczowych przepływów zamiast wszystkiego; UI poza testami DOM wg test-planu §7).
- **Risk:** Najszerszy wycinek M-2 i zakres bez granic: plan musi wybrać etapy z test-planu (niezrealizowane są etap 2, bramka kolejności wydania, i etap 3, granice auth i walidacja), zapisać, czego nie testuje, i może rozpaść się na kilka zmian (status przesuwa tylko pierwsza). Stoi przed S-11 jako siatka bezpieczeństwa przed zmianą wyglądu, a przed S-09 nie musi, bo strona startowa zastępuje szablon sprawdzany dziś tylko statusem 200; nie ma zależności technicznych, więc może iść równolegle z wcześniejszymi wycinkami.
- **Status:** ready

### S-11: Czytelniejszy widok grupy, tasków i tablicy wyników

- **Outcome:** zalogowany użytkownik korzysta z czytelniejszego, spójnego wizualnie widoku grupy, tasków i tablicy wyników.
- **Change ID:** dashboard-ui
- **PRD refs:** — (UI; MS-04)
- **Prerequisites:** S-08, S-10
- **Parallel with:** S-06, S-07, S-09
- **Blockers:** —
- **Unknowns:** —
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „4. dashboard-ui" (praca nad widokiem, który już się renderuje, więc `/10x-ui`; przepisanie asercji smoke i sprawdzenie e2e należą do zakresu tego wycinka).
- **Stan wejściowy (2026-10-08):** `dashboard.astro` jest już podzielony (PR `refactor/split-dashboard`): ładowanie danych to `loadDashboard` w `src/lib/dashboard-data.ts` z testami jednostkowymi (`tests/unit/dashboard-data.test.ts`), a karty to komponenty w `src/components/dashboard/` (`GroupHeaderCard`, `MembersCard`, `TasksCard`, `TaskRow`, `OwnerActions`, `LeaveGroupCard`, `PendingInviteCard`, `NoGroupCards`, `AccountCard`). HTML strony został bez zmian (porównany w 7 stanach), więc smoke nie wymagał zmian. Restyling robi się na tych komponentach, a stany degradacji są przypięte testami.
- **Risk:** Zależności od S-10 (siatka bezpieczeństwa) i S-08 (kontrakt odpowiedzi na błąd ustalony przed przebudową stanów błędu) są kolejnościowe, nie techniczne; zamiana z S-10 jest dopuszczalna, jeśli UI jest pilniejszy niż testy (wtedy e2e powstaje już pod nowy wygląd). Rozbudowany smoke (ponad 1600 linii) dopasowuje dzisiejszy markup, więc zmiana wyglądu łamie go, dopóki asercje nie zostaną przepisane (to część tego wycinka); wyspy optymistyczne muszą zachować zgodność HTML serwera z pierwszym renderem klienta, a PRD wymaga pełnej użyteczności na smartfonie i natychmiastowego odznaczania.
- **Status:** proposed

### S-12: Okazje refaktoryzacji z analizy data-access

- **Outcome:** (jakościowy) znane ciche luki są zamknięte bez zmiany zachowania: błędy dashboardu trafiają do raportowania, CI pilnuje niezmienności migracji i aktualności typów, trasy i reguły mają testy charakteryzujące, a uprawnienia tabel są jawne w migracji.
- **Change ID:** refactor-opportunities
- **PRD refs:** — (jakościowe; MS-07)
- **Prerequisites:** —
- **Parallel with:** S-09, S-10
- **Blockers:** —
- **Unknowns:** —
- **Źródło zakresu:** `context/changes/refactor-opportunities/` (research z rankingiem dziesięciu okazji i plan pięciu faz, `plan_reviewed`); zmiana powstała 2026-10-06 poza roadmapą i stała się wycinkiem decyzją użytkownika 2026-10-08.
- **Stan wejściowy (2026-10-08):** po podziale `dashboard.astro` pięć wywołań `console.error`, które zmienia faza 1, jest w `loadDashboard` (`src/lib/dashboard-data.ts`), nie we frontmatterze strony. Faza 1 może więc pokryć zdarzenia `dashboard.*.failed` testami jednostkowymi (`tests/unit/dashboard-data.test.ts` już mockuje każdy odczyt), zamiast opierać się tylko na ręcznym wstrzykiwaniu awarii; plan trzeba odpowiednio zaktualizować przed `/10x-implement`. Ryzyko konfliktu z S-11 w `dashboard.astro` zniknęło.
- **Risk:** Plan już jest, więc to najkrótsza droga do zamkniętego wycinka. Faza 1 zmienia raportowanie błędów dashboardu, więc lepiej skończyć S-12 przed S-11: S-11 dostaje wtedy awarie widoczne w monitoringu i testy tras. Bramka kolejności wydania i e2e zostają w S-10, a ostatnia faza (uprawnienia) wymaga właściciela i wydania na produkcję.
- **Status:** planning

### S-13: Siatka odznaczeń grupy

- **Outcome:** członek grupy widzi dla każdego tasku siatkę: uczestnicy × ostatnie okresy, z zaznaczeniem, kto w danym okresie wykonał task, a kto nie.
- **Change ID:** checkoff-grid
- **PRD refs:** — (UI; MS-08)
- **Prerequisites:** S-11
- **Parallel with:** S-12
- **Blockers:** —
- **Unknowns:**
  - Ile okresów pokazuje siatka (np. 7 dni / 4 tygodnie) i czy zależy to od tasku `daily`/`weekly`? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - PRD wyklucza dziś „historię/statystyki długoterminowe”: zaktualizować PRD (wyłączenie tylko wykresów i statystyk) przed planem czy w planie wycinka? — Owner: user. Block: no.
- **Źródło zakresu:** decyzja użytkownika 2026-10-08 (odparkowanie z `## Parked`, pozycja „Historia/statystyki długoterminowe”, w zakresie samej siatki). PRD §Vision opisuje siatkę zielono-czerwoną jako pierwotną wartość produktu.
- **Stan wejściowy (2026-10-08):** po podziale `dashboard.astro` nowy odczyt wielu okresów trafia do `loadDashboard` (`src/lib/dashboard-data.ts`, z testami jednostkowymi), a siatka to nowy komponent obok `TaskRow`/`TasksCard` w `src/components/dashboard/`. Polityka prywatności też jest podzielona na sekcje (`src/components/privacy/`), więc zmiana „kto co widzi” to edycja `WhoCanSee.astro`.
- **Risk:** Dane już są (`task_checkoffs` per okres), więc to głównie nowy odczyt i widok. Idzie po S-11, żeby nie stylować siatki dwa razy. Zmienia, co członkowie grupy widzą o sobie nawzajem (historia zamiast bieżącego okresu), więc w tej samej zmianie trzeba zaktualizować politykę prywatności, słownik (`glossary.md` dziś zalicza historię do rzeczy, których aplikacja nie obiecuje) i PRD. Odczyt wielu okresów dokłada pracy do `/dashboard`, którego czas CPU nie był mierzony (otwarte ryzyko po S-04).
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                                                       | Ready for `/10x-plan` | Notes                                                                                                                                                                                                                         |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-06       | custom-domain                  | Własna domena produktu: wiązanie, Supabase Site URL i Redirect URLs, dokumentacja           | yes                   | Gwiazda przewodnia. Run `/10x-plan custom-domain` (po `/10x-frame` w sprawie adresu `workers.dev`, `/10x-new` i `/10x-research`); zamknięcie wg lekcji o wydaniu.                                                             |
| S-07       | google-login                   | Logowanie kontem Google: konfiguracja dostawcy, trasa startowa, przycisk, callback          | yes                   | S-06 jest zrobione, więc adresy przekierowań i ekran zgody konfiguruje się na docelowej domenie. Zwykły łańcuch od `/10x-frame`; kroki ręczne właściciela po stronie Google i Supabase.                                       |
| S-08       | observability-swallowed-errors | Awarie krytycznego przepływu trafiają do odpowiedzi API i do monitoringu                    | yes                   | Niezależny, może ruszyć od razu. Najpierw `/10x-observability-audit` (raport w `context/audits/observability/`), potem Run `/10x-plan observability-swallowed-errors` (po `/10x-new` i `/10x-research`); część B opcjonalna.  |
| S-09       | landing-page                   | Strona startowa dla niezalogowanych użytkowników                                            | yes                   | S-06 i S-07 zrobione. Frame: `context/archive/2026-10-08-landing-page/frame.md` (obietnica z PRD, polityka prywatności, zalogowany → `/dashboard`, flaga Safe Browsing). Run `/10x-research`, potem `/10x-plan landing-page`. |
| S-10       | test-coverage                  | Testy dobrane według ryzyka: jednostkowe, mutacyjne i e2e kluczowych przepływów             | yes                   | Niezależny; musi się skończyć przed S-11. Run `/10x-plan test-coverage` (po `/10x-new` i `/10x-research`); plan oparty o `test-plan.md` (etapy 2 i 3 nierozpoczęte), granice zakresu zapisane w planie.                       |
| S-11       | dashboard-ui                   | Czytelniejszy widok grupy, tasków i tablicy wyników                                         | no                    | Czeka na S-08 i S-10 (kolejność). Widok już się renderuje, więc `/10x-ui`; przepisanie asercji smoke w zakresie.                                                                                                              |
| S-12       | refactor-opportunities         | Okazje refaktoryzacji: raportowanie dashboardu, strażnicy CI, testy tras, jawne uprawnienia | yes                   | Plan gotowy (`plan_reviewed`): Run `/10x-implement refactor-opportunities`. Najlepiej przed S-11. Faza 1 do aktualizacji po podziale dashboardu (kod w `src/lib/dashboard-data.ts`).                                          |
| S-13       | checkoff-grid                  | Siatka odznaczeń grupy: uczestnicy × ostatnie okresy                                        | no                    | Czeka na S-11. Zwykły łańcuch od `/10x-frame`; aktualizacja PRD, słownika i polityki prywatności w zakresie.                                                                                                                  |

## Open Roadmap Questions

1. **Czy Google zdjął flagę Safe Browsing z `streakboard.app` po prośbie o przegląd z 2026-10-08?** — Owner: user. Block: no (S-09 zarchiwizowany decyzją właściciela 2026-10-08 przed werdyktem). Źródłem werdyktu jest Search Console; sprawdzać co 2-3 dni do około 22 października i zapisać wynik w `context/changes/deployment/deployment-plan.md` (Phase 13, ostatni wiersz). Odrzucenie: poprawki w nowej zmianie, bez cofania stron publicznych. Po zapisaniu wyniku usuń to pytanie.

## Parked

- **Wiele grup na jednego użytkownika** — Why parked: PRD §Non-Goals; upraszcza model danych i UI na MVP.
- **Konfigurowalne (admin/głosowanie) tempo spadku streaka** — Why parked: PRD §Non-Goals; stała reguła dla wszystkich grup na MVP, konfigurowalność to pomysł na dużo większą skalę.
- **Weryfikacja/anti-cheat wykonania tasku** — Why parked: PRD §Non-Goals; system oparty na zaufaniu w gronie znajomych.
- **Działanie offline** — Why parked: PRD §Non-Goals; aplikacja wymaga połączenia z internetem na MVP.
- **Powiadomienia/przypomnienia o niewykonanym tasku** — Why parked: PRD §Success Criteria Secondary; poza pierwszym widocznym przepływem.
- **Historia/statystyki długoterminowe (wykresy streaków w czasie)** — Why parked: PRD §Success Criteria Secondary. Częściowo odparkowane 2026-10-08: prosta siatka odznaczeń trafiła do S-13 (`checkoff-grid`); wykresy, statystyki i rekordy streaka zostają zaparkowane.
- ~~**Automatyczny deploy na merge (CI/CD)**~~ — Unparked 2026-09-25: Workers Builds i tak wdraża `master`, a automatyzacja migracji trafiła do S-05 (`release-automation-and-auth-hardening`).
- ~~**Domena własna / środowisko staging**~~ — Unparked 2026-10-02: domena własna trafiła do S-06 (`custom-domain`); środowisko staging zostaje zaparkowane (osobna pozycja poniżej).
- **Środowisko staging** — Why parked: `context/foundation/infrastructure.md` i deployment-plan.md — poza zakresem; wydzielone z pozycji „Domena własna / środowisko staging" przy odparkowaniu domeny 2026-10-02.
- ~~**Observability (logowanie strukturalne, error tracking)**~~ — Unparked 2026-10-02: trafiła do S-08 (`observability-swallowed-errors`) w zakresie audytu jednego przepływu, naprawy jednego połkniętego błędu i opcjonalnego error trackingu; pierwotnie logowanie strukturalne nie było celem tego wycinka, ale plan (decyzja z wywiadu planistycznego, 2026-10-02) obejmuje wspólny helper raportujący i wszystkie gałęzie zwróconego błędu Supabase, nie jeden przepływ.

## Milestone History

- **M-1: Pierwszy pełny cykl: grupa → task → odznaczenie → tablica wyników** (`first-group-checkin-loop`) — closed 2026-10-02. F-01 oraz S-01 do S-05 `done`: pełny przepływ z głównego kryterium sukcesu PRD (FR-001 do FR-009) działa na produkcji, a migracje i wydania są zautomatyzowane; zmiany zarchiwizowane w `context/archive/` (2026-09-25 do 2026-10-01).

## Done

- **S-06: użytkownik wchodzi na aplikację pod domeną `streakboard.app`, a rejestracja, logowanie i link potwierdzający działają na tej domenie.** — Archived 2026-10-02 → `context/archive/2026-10-02-custom-domain/`. Lesson: —.
- **S-07: użytkownik może zarejestrować się i zalogować kontem Google, bez ustawiania hasła.** — Archived 2026-10-06 → `context/archive/2026-10-05-google-login/`. Lesson: —.
- **S-08: (jakościowy) awaria w krytycznym przepływie aplikacji nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu.** — Archived 2026-10-02 → `context/archive/2026-10-02-observability-swallowed-errors/`. Lesson: —.
- **S-09: niezalogowany użytkownik widzi stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania.** — Archived 2026-10-08 → `context/archive/2026-10-08-landing-page/`. Lesson: —.
