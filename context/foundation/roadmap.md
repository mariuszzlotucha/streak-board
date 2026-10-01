---
project: "StreakBoard"
version: 1
status: draft
created: 2026-09-24
updated: 2026-10-02
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
- **Done when:** każdy S-06 do S-11 poniżej ma status `done`.
- **Scope anchors:** źródło nie ma własnych identyfikatorów, więc zakres jest zapisany jako kotwice `MS-NN`, po jednej na wycinek: MS-01 do MS-05 z wyników opisanych w pliku wejściowym, MS-06 z późniejszego opisu użytkownika:
  - MS-01: użytkownik wchodzi na aplikację pod własną domeną właściciela, a rejestracja, logowanie i link potwierdzający działają na tej domenie.
  - MS-02: (jakościowy) zmiany w aplikacji są chronione testami wybranymi według ryzyka, a jakość testów jednostkowych jest mierzona mutacjami.
  - MS-03: niezalogowany użytkownik widzi stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania.
  - MS-04: zalogowany użytkownik korzysta z czytelniejszego, spójnego wizualnie widoku grupy, tasków i tablicy wyników.
  - MS-05: (jakościowy) awaria w krytycznym przepływie aplikacji nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu.
  - MS-06: użytkownik może zalogować się kontem Google (logowanie bez hasła); to ta część FR-001 z PRD (OAuth/passwordless), która nie weszła do M-1.

## Vision recap

Grono znajomych korzystało wcześniej ze wspólnego arkusza Google, w którym ręcznie kolorowało komórki na zielono/czerwono, żeby widzieć nawzajem swoją konsekwencję w budowaniu nawyków — wartość dawała widoczność dla innych, ale ręczne prowadzenie było na tyle męczące, że narzędzie przestało być używane. Istniejące aplikacje do nawyków są projektowane dla pojedynczego użytkownika i nie obsługują modelu, w którym kilka osób śledzi ten sam cel równolegle; StreakBoard automatyzuje dokładnie ten sam prosty widok siatki i dodaje grywalizację (streaki), której arkusz nigdy nie miał.

## North star

**S-06: użytkownik wchodzi na aplikację pod domeną `streakboard.app`, a rejestracja, logowanie i link potwierdzający działają na tej domenie** — to najmniejszy kompleksowy przepływ, od którego zależy, czy ktokolwiek spoza obecnego grona wejdzie do produktu i zostawi informację zwrotną; błędna konfiguracja adresu potrafi po cichu zepsuć rejestrację na produkcji, więc warto to sprawdzić jako pierwsze, a ten wycinek zmienia też adres, na który wskazują kolejne.

> Gwiazda przewodnia (ang. north star) to najmniejszy kompleksowy wycinek widoczny dla użytkownika, którego dostarczenie jako pierwszego potwierdza główną hipotezę tego kamienia milowego — umieszczony tak wcześnie, jak pozwalają jego zależności, bo reszta ma znaczenie tylko wtedy, gdy to działa. Tutaj hipoteza brzmi: nowa osoba trafia pod docelowy adres, zakłada konto i dociera do dashboardu bez ręcznych obejść.

## At a glance

| ID   | Change ID                      | Outcome (user can …)                                                                                                                | Prerequisites                                           | PRD refs                           | Status   |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------- | -------- |
| S-06 | custom-domain                  | wejść na aplikację pod domeną `streakboard.app`; rejestracja, logowanie i link potwierdzający działają na tej domenie               | domena `streakboard.app` w Cloudflare (Registrar i DNS) | — (operacyjne; MS-01)              | ready    |
| S-07 | google-login                   | zarejestrować się i zalogować kontem Google, bez ustawiania hasła                                                                   | S-06                                                    | FR-001 (OAuth/passwordless); MS-06 | proposed |
| S-08 | observability-swallowed-errors | (jakościowy) awaria w krytycznym przepływie nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu   | —                                                       | — (jakościowe; MS-05)              | ready    |
| S-09 | landing-page                   | zobaczyć jako niezalogowany stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania           | S-06, S-07                                              | — (UI; MS-03)                      | proposed |
| S-10 | test-coverage                  | (jakościowy) zmiany w aplikacji są chronione testami wybranymi według ryzyka, a jakość testów jednostkowych jest mierzona mutacjami | —                                                       | — (jakościowe; MS-02)              | ready    |
| S-11 | dashboard-ui                   | korzystać z czytelniejszego, spójnego wizualnie widoku grupy, tasków i tablicy wyników                                              | S-08, S-10                                              | — (UI; MS-04)                      | proposed |

## Streams

Pomoc nawigacyjna — grupuje pozycje ze wspólnym łańcuchem Prerequisites. Kanoniczna kolejność jest w grafie zależności poniżej; ta tabela to proponowana kolejność czytania równoległych ścieżek.

| Stream | Theme                   | Chain                    | Note                                                                                                                                        |
| ------ | ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Wejście dla nowych osób | `S-06` → `S-07` → `S-09` | Adres, logowanie bez hasła i strona startowa składają się na ścieżkę nowej osoby do dashboardu: to wejście do informacji zwrotnej od rynku. |
| B      | Siatka testów i widok   | `S-10` → `S-11`          | Testy przed zmianą wyglądu; `S-11` dołącza do strumienia C w `S-08` (wspólny kontrakt błędów i smoke).                                      |
| C      | Widoczność awarii       | `S-08`                   | Samodzielny, może ruszyć od razu, równolegle z `S-06`; musi się skończyć przed `S-11`.                                                      |

## Baseline

What's already in place in the codebase as of `2026-10-02` (auto-researched; the user confirmed the domain).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 (SSR; Vite 8.3.0 wymagany przez Astro i adapter) + React 19 + Tailwind 4 + komponenty shadcn/ui; strony auth, `/dashboard` (grupa, taski, tablica wyników, wyspy React) i `/join/[code]`; `/` to nadal szablon startowy („10x Astro Starter"), a nie strona produktu.
- **Backend / API:** present — 16 tras API (auth, groups, tasks) i `/auth/callback`; 24 wywołania `console.error` w trasach, callbacku i dashboardzie (zachowanie przy błędach do zweryfikowania w audycie S-08).
- **Data:** present — Supabase (Postgres + RLS): 7 migracji (grupy, członkostwo, taski, uczestnicy, odznaczenia, utwardzenia RLS i uprawnień), lokalny stos i testy RLS.
- **Auth:** present — Supabase Auth email+hasło (żaden dostawca OAuth nie jest włączony), sesje w cookie, middleware chroni `/dashboard`, `/api/groups` i `/api/tasks`; link potwierdzający wraca przez `/auth/callback`; e-maile z własnego SMTP (Resend) wg README.
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
  - Czy stary adres `workers.dev` ma pozostać aktywny po przepięciu na własną domenę (równolegle, z przekierowaniem czy wyłączony)? — Owner: user. Block: no — rozstrzyga `/10x-frame` lub `/10x-research`.
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „1. custom-domain" (praca operacyjna bez UI: kroki wymagające dostępu wykonuje właściciel; zakres obejmuje też poprawę dokumentacji, która dziś zakłada adres `workers.dev`).
- **Risk:** Błędne Redirect URLs lub Site URL w Supabase łamią rejestrację na produkcji (znane z `release-automation-and-auth-hardening` w M-1: bez adresu na liście Supabase po cichu wraca do Site URL, a użytkownik po potwierdzeniu nie jest zalogowany), więc idzie pierwszy: zmienia adres, na który wskazują kolejne wycinki. Zmiana nie dotyka schematu bazy; kod wraca przez rollback Workera, ale ustawień w panelu Supabase rollback nie obejmuje.
- **Status:** ready

### S-07: Logowanie kontem Google

- **Outcome:** użytkownik może zarejestrować się i zalogować kontem Google, bez ustawiania hasła.
- **Change ID:** google-login
- **PRD refs:** FR-001 (OAuth/passwordless); MS-06
- **Prerequisites:** S-06
- **Parallel with:** S-08, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - „Passwordless" — czy chodzi tylko o logowanie kontem Google (OAuth), czy także o link logujący wysyłany e-mailem? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - Co z istniejącymi kontami email+hasło, gdy ten sam adres zaloguje się przez Google: połączyć konta czy rozdzielić? — Owner: user. Block: no — decyzja produktowa i bezpieczeństwa przy `/10x-frame`.
  - Czy ekran zgody Google wymaga od domeny strony głównej i polityki prywatności (a więc czy S-09 musi powstać wcześniej, czy wystarczy przejściowy opis)? — Owner: user. Block: no — rozstrzyga `/10x-research`.
- **Źródło zakresu:** opis użytkownika (MS-06) i FR-001 z PRD („email/OAuth/passwordless"); praca z krokami ręcznymi właściciela po stronie Google i Supabase (projekt i klient OAuth, ekran zgody; sekret klienta wyłącznie w panelu Supabase, nigdy w repozytorium ani w czacie).
- **Risk:** Konfiguracja po trzech stronach (Google, Supabase, aplikacja), a pełnego przepływu nie da się przejść lokalnie ani w smoke bez prawdziwego konta Google, więc weryfikacja produkcyjna jest częścią zamknięcia. Kod zaproszenia zapamiętany w cookie przed logowaniem musi przetrwać przekierowanie do Google i z powrotem, a callback logowania zamienia dziś każdy błąd na stały komunikat o wygasłym linku, co dla Google byłoby mylące. Idzie zaraz po S-06, bo adresy przekierowań i ekran zgody konfiguruje się raz, na docelowej domenie; omija wysyłkę e-maili potwierdzających, z którą były problemy w M-1.
- **Status:** proposed

### S-08: Awarie krytycznego przepływu nie są połykane

- **Outcome:** (jakościowy) awaria w krytycznym przepływie aplikacji nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu.
- **Change ID:** observability-swallowed-errors
- **PRD refs:** — (jakościowe; MS-05)
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-09, S-10
- **Blockers:** —
- **Unknowns:**
  - Który krytyczny przepływ audytujemy (kandydaci: odznaczanie i cofanie odznaczenia, dołączanie do grupy) i które znalezisko z raportu naprawiamy? — Owner: user. Block: no — wybór po raporcie z audytu observability.
  - Czy część B (narzędzie do śledzenia błędów na Workerze, darmowy plan wystarczy) wchodzi w zakres i czy konto jest założone po stronie użytkownika? — Owner: user. Block: no.
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „5. observability-swallowed-errors" (część A: audyt jednego przepływu i naprawa jednego znaleziska wraz z testem, że awaria nie jest już sukcesem; część B: opcjonalny monitoring z kluczem DSN jako sekretem, nigdy w repozytorium ani w czacie; raport audytu jest wejściem do planu).
- **Risk:** Zmiana odpowiedzi na błąd może zmienić kontrakt, na którym polegają wyspa odznaczania (mapuje 403 i 404 na „odrzucone", a inne błędy na „nie zapisano") i smoke; error tracking na Workerze zwiększa zużycie CPU (limit 10 ms na planie Free), więc narzut trzeba sprawdzić. Wycinek jest niezależny, więc może ruszyć od razu, równolegle z S-06; stoi przed S-11, bo oba dotykają wyspy odznaczania i smoke, a stany błędu w nowym widoku powinny wynikać z ustalonego już kontraktu błędów.
- **Status:** ready

### S-09: Strona startowa dla niezalogowanych

- **Outcome:** niezalogowany użytkownik widzi stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania.
- **Change ID:** landing-page
- **PRD refs:** — (UI; MS-03)
- **Prerequisites:** S-06, S-07
- **Parallel with:** S-08, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - Co strona obiecuje i do czego prowadzi (decyzja produktowa)? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - Treść i język strony (reszta aplikacji jest po angielsku, a dzisiejsza strona `/` to angielski szablon startowy) — Owner: user. Block: no.
  - Czy ma być widoczny podgląd tablicy wyników i czy zalogowany użytkownik jest przekierowywany na dashboard? — Owner: user. Block: no.
- **Źródło zakresu:** `context/foundation/roadmap-input-next-slices.md`, sekcja „3. landing-page" (nowy widok: zwykły łańcuch od `/10x-frame`; `/10x-ui` dopiero przy późniejszych poprawkach).
- **Risk:** Zależności od S-06 (adres publiczny) i S-07 (strona prowadzi do finalnego zestawu metod rejestracji i logowania) są kolejnościowe, nie techniczne. `/` istnieje, ale opisuje szablon startowy, a jedyny dzisiejszy test tej strony to sprawdzenie statusu 200 w smoke, więc to przepisanie istniejącego widoku, nie widok od zera, a nowe kroki smoke muszą sprawdzać wynik (treść i dokąd prowadzą linki), nie tylko brak błędu (lekcja o smoke).
- **Status:** proposed

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
- **Risk:** Zależności od S-10 (siatka bezpieczeństwa) i S-08 (kontrakt odpowiedzi na błąd ustalony przed przebudową stanów błędu) są kolejnościowe, nie techniczne; zamiana z S-10 jest dopuszczalna, jeśli UI jest pilniejszy niż testy (wtedy e2e powstaje już pod nowy wygląd). Rozbudowany smoke (ponad 1600 linii) dopasowuje dzisiejszy markup, więc zmiana wyglądu łamie go, dopóki asercje nie zostaną przepisane (to część tego wycinka); wyspy optymistyczne muszą zachować zgodność HTML serwera z pierwszym renderem klienta, a PRD wymaga pełnej użyteczności na smartfonie i natychmiastowego odznaczania.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                                              | Ready for `/10x-plan` | Notes                                                                                                                                                                                                                        |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-06       | custom-domain                  | Własna domena produktu: wiązanie, Supabase Site URL i Redirect URLs, dokumentacja  | yes                   | Gwiazda przewodnia. Run `/10x-plan custom-domain` (po `/10x-frame` w sprawie adresu `workers.dev`, `/10x-new` i `/10x-research`); zamknięcie wg lekcji o wydaniu.                                                            |
| S-07       | google-login                   | Logowanie kontem Google: konfiguracja dostawcy, trasa startowa, przycisk, callback | no                    | Czeka na S-06 (adresy przekierowań i ekran zgody konfiguruje się raz, na docelowej domenie). Zwykły łańcuch od `/10x-frame` (znaczenie „passwordless", łączenie kont); kroki ręczne właściciela.                             |
| S-08       | observability-swallowed-errors | Awarie krytycznego przepływu trafiają do odpowiedzi API i do monitoringu           | yes                   | Niezależny, może ruszyć od razu. Najpierw `/10x-observability-audit` (raport w `context/audits/observability/`), potem Run `/10x-plan observability-swallowed-errors` (po `/10x-new` i `/10x-research`); część B opcjonalna. |
| S-09       | landing-page                   | Strona startowa dla niezalogowanych użytkowników                                   | no                    | Czeka na S-06 i S-07 (kolejność). Nowy widok: zwykły łańcuch od `/10x-frame`; smoke z asercjami skutków.                                                                                                                     |
| S-10       | test-coverage                  | Testy dobrane według ryzyka: jednostkowe, mutacyjne i e2e kluczowych przepływów    | yes                   | Niezależny; musi się skończyć przed S-11. Run `/10x-plan test-coverage` (po `/10x-new` i `/10x-research`); plan oparty o `test-plan.md` (etapy 2 i 3 nierozpoczęte), granice zakresu zapisane w planie.                      |
| S-11       | dashboard-ui                   | Czytelniejszy widok grupy, tasków i tablicy wyników                                | no                    | Czeka na S-08 i S-10 (kolejność). Widok już się renderuje, więc `/10x-ui`; przepisanie asercji smoke w zakresie.                                                                                                             |

## Open Roadmap Questions

(brak — nierozstrzygnięte pytania dotyczą pojedynczych wycinków i są w ich polach Unknowns)

## Parked

- **Wiele grup na jednego użytkownika** — Why parked: PRD §Non-Goals; upraszcza model danych i UI na MVP.
- **Konfigurowalne (admin/głosowanie) tempo spadku streaka** — Why parked: PRD §Non-Goals; stała reguła dla wszystkich grup na MVP, konfigurowalność to pomysł na dużo większą skalę.
- **Weryfikacja/anti-cheat wykonania tasku** — Why parked: PRD §Non-Goals; system oparty na zaufaniu w gronie znajomych.
- **Działanie offline** — Why parked: PRD §Non-Goals; aplikacja wymaga połączenia z internetem na MVP.
- **Powiadomienia/przypomnienia o niewykonanym tasku** — Why parked: PRD §Success Criteria Secondary; poza pierwszym widocznym przepływem.
- **Historia/statystyki długoterminowe (wykresy streaków w czasie)** — Why parked: PRD §Success Criteria Secondary.
- ~~**Automatyczny deploy na merge (CI/CD)**~~ — Unparked 2026-09-25: Workers Builds i tak wdraża `master`, a automatyzacja migracji trafiła do S-05 (`release-automation-and-auth-hardening`).
- ~~**Domena własna / środowisko staging**~~ — Unparked 2026-10-02: domena własna trafiła do S-06 (`custom-domain`); środowisko staging zostaje zaparkowane (osobna pozycja poniżej).
- **Środowisko staging** — Why parked: `context/foundation/infrastructure.md` i deployment-plan.md — poza zakresem; wydzielone z pozycji „Domena własna / środowisko staging" przy odparkowaniu domeny 2026-10-02.
- ~~**Observability (logowanie strukturalne, error tracking)**~~ — Unparked 2026-10-02: trafiła do S-08 (`observability-swallowed-errors`) w zakresie audytu jednego przepływu, naprawy jednego połkniętego błędu i opcjonalnego error trackingu; logowanie strukturalne nie jest celem tego wycinka.

## Milestone History

- **M-1: Pierwszy pełny cykl: grupa → task → odznaczenie → tablica wyników** (`first-group-checkin-loop`) — closed 2026-10-02. F-01 oraz S-01 do S-05 `done`: pełny przepływ z głównego kryterium sukcesu PRD (FR-001 do FR-009) działa na produkcji, a migracje i wydania są zautomatyzowane; zmiany zarchiwizowane w `context/archive/` (2026-09-25 do 2026-10-01).

## Done

(brak — `/10x-archive` dopisze wpis po zarchiwizowaniu pierwszej zmiany z M-2)
