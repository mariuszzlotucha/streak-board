---
project: "StreakBoard"
version: 1
status: locked
created: 2026-09-24
updated: 2026-10-18
prd_version: 1
main_goal: market-feedback
top_blocker: time
milestone_id: history-and-reminders
milestone_seq: 3
milestone_status: done
---

# Roadmap: StreakBoard

> Derived from PRD v1 (§Success Criteria → Secondary), the owner's decisions of 2026-10-08 and 2026-10-17 and the owner's description of 2026-10-17 (PWA) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-3: Historia, przypomnienia i instalacja: siatka odznaczeń grupy, przypomnienie o niewykonanym tasku i aplikacja PWA** — Status: done

- **Intent:** Domknąć kryteria drugorzędne PRD v1 i dać aplikacji miejsce na telefonie: członek grupy widzi historię wykonania tasków w prostej siatce, którą grono prowadziło wcześniej ręcznie we wspólnym arkuszu, użytkownik dostaje przypomnienie o tasku, którego jeszcze nie odznaczył, a aplikację można zainstalować na ekranie głównym jak zwykłą aplikację (PWA). Wszystkie trzy mają podtrzymać codzienny powrót do odznaczania, a ich wartość sprawdzamy u realnych użytkowników.
- **Source materials:** `context/foundation/prd.md` (v1), §Success Criteria → Secondary; punkty tej sekcji nie mają identyfikatorów FR ani US, więc zakres jest zapisany jako kotwice `MS-NN` poniżej. Decyzje właściciela: 2026-10-08 (z historii tylko prosta siatka, bez wykresów i statystyk) i 2026-10-17 (S-13 przeniesiony z M-2, M-3 oparty na kryteriach drugorzędnych PRD, przypomnienia odparkowane). Opis właściciela z 2026-10-17: „Żeby aplikacja była PWA” (kotwica MS-03). Prośba właściciela z 2026-10-17 o utwardzenie publicznej powierzchni po skanach botów w logach Cloudflare (kotwica MS-04). Opis właściciela z 2026-10-18: „aplikacja powinna promować bardziej PWA, instalowanie samej siebie”, i decyzja, że to jeszcze M-3 (kotwica MS-05). Konieczne FR z PRD (FR-001 do FR-012) pokryły M-1 i M-2 (`## Milestone History`).
- **Done when:** każdy S-NN poniżej (S-13, S-16, S-17, S-18, S-19) ma status `done`.
- **Scope anchors:** po jednej na wycinek: MS-01 i MS-02 przepisane z PRD §Success Criteria → Secondary, MS-03 z opisu właściciela:
  - MS-01: członek grupy widzi historię wykonania tasku jako prostą siatkę: uczestnicy × ostatnie okresy, wykonane i niewykonane (PRD §Vision: zielono-czerwona siatka jako pierwotna wartość, FR-013; §Success Criteria → Secondary „Historia/statystyki długoterminowe” bez zmian; decyzja właściciela 2026-10-08: w zakresie samej siatki, wykresy i statystyki zostają w `## Parked`; do 2026-10-17 kotwica MS-08 kamienia M-2).
  - MS-02: użytkownik dostaje przypomnienie o tasku, do którego jest zapisany, a którego nie odznaczył w bieżącym okresie (PRD: „Powiadomienia/przypomnienia o niewykonanym tasku”; odparkowane decyzją właściciela 2026-10-17).
  - MS-03: aplikacja jest PWA: użytkownik instaluje ją na ekranie głównym telefonu (albo na komputerze) i uruchamia jak osobną aplikację (opis właściciela 2026-10-17: „Żeby aplikacja była PWA”; działanie offline zostaje wyłączone przez PRD §Non-Goals, chyba że właściciel zdecyduje inaczej).
  - MS-04: publiczna powierzchnia aplikacji jest utwardzona: odpowiedzi niosą nagłówki bezpieczeństwa (nosniff, Referrer-Policy, ochrona przed osadzaniem w ramkach, Permissions-Policy, najpierw CSP w trybie Report-Only), jest `/.well-known/security.txt`, a operator ustawia w Cloudflare HSTS, rekordy SPF i DMARC (domena nie wysyła poczty) i regułę WAF na skany `/wp-*` i `*.php` (prośba właściciela 2026-10-17: produkcja nie wysyła żadnego nagłówka bezpieczeństwa, domena nie ma SPF ani DMARC, boty pytają o `/wp-admin/install.php`).
  - MS-05: aplikacja sama zachęca do instalacji: użytkownik, który otwiera ją w przeglądarce, dowiaduje się, jak zainstalować ją na swoim urządzeniu i co mu to daje (na iPhonie przypomnienia działają tylko po instalacji) (opis właściciela 2026-10-18: „aplikacja powinna promować bardziej PWA, instalowanie samej siebie”; zmienia decyzję z planu S-17 z 2026-10-17, by nie robić własnego przycisku instalacji ani podpowiedzi dla iOS).

## Vision recap

Grono znajomych korzystało wcześniej ze wspólnego arkusza Google, w którym ręcznie kolorowało komórki na zielono/czerwono, żeby widzieć nawzajem swoją konsekwencję w budowaniu nawyków — wartość dawała widoczność dla innych, ale ręczne prowadzenie było na tyle męczące, że narzędzie przestało być używane. Istniejące aplikacje do nawyków są projektowane dla pojedynczego użytkownika i nie obsługują modelu, w którym kilka osób śledzi ten sam cel równolegle; StreakBoard automatyzuje dokładnie ten sam prosty widok siatki i dodaje grywalizację (streaki), której arkusz nigdy nie miał.

## North star

**S-13: członek grupy widzi siatkę odznaczeń: uczestnicy × ostatnie okresy tasku, wykonane i niewykonane** — PRD §Vision mówi, że „sam prosty widok siatki (zielony/czerwony) już wystarczał, by to działało”, więc siatka najtańszym kosztem sprawdza u realnych użytkowników, czy powrót tego widoku podtrzymuje regularność; dane już są, a S-11 i S-14 są zrobione, więc może iść od razu.

> Gwiazda przewodnia (ang. north star) to najmniejszy kompleksowy wycinek widoczny dla użytkownika, którego dostarczenie jako pierwszego potwierdza główną hipotezę tego kamienia milowego — umieszczony tak wcześnie, jak pozwalają jego zależności, bo reszta ma znaczenie tylko wtedy, gdy to działa. Tutaj hipoteza brzmi: widok historii, który grono prowadziło ręcznie w arkuszu, wraca automatycznie, a członkowie grupy zaglądają do niego, żeby widzieć nawzajem swoją konsekwencję.

## At a glance

| ID   | Change ID                | Outcome (user can …)                                                                                                                                      | Prerequisites | PRD refs                                     | Status |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------- | ------ |
| S-13 | checkoff-grid            | zobaczyć siatkę odznaczeń grupy: kto wykonał task w każdym z ostatnich okresów                                                                            | S-11, S-14    | PRD §Vision, FR-013; MS-01                   | done   |
| S-16 | task-reminders           | dostać przypomnienie o tasku, do którego jest zapisany, a którego nie odznaczył w bieżącym okresie                                                        | —             | — (PRD §Success Criteria → Secondary; MS-02) | done   |
| S-17 | installable-pwa          | zainstalować aplikację na ekranie głównym telefonu albo na komputerze i uruchamiać ją jak osobną aplikację (PWA)                                          | —             | — (opis właściciela; MS-03)                  | done   |
| S-18 | public-surface-hardening | odwiedzać aplikację, która wysyła nagłówki bezpieczeństwa, publikuje kontakt do zgłaszania luk i której domeny nie da się podrobić w poczcie              | —             | — (prośba właściciela; MS-04)                | done   |
| S-19 | install-promotion        | dowiedzieć się w aplikacji, jak zainstalować ją na swoim urządzeniu (na iPhonie instrukcja, w Chrome i Edge przycisk), i po co (przypomnienia na iPhonie) | S-16, S-17    | — (opis właściciela; MS-05)                  | done   |

## Baseline

What's already in place in the codebase as of `2026-10-17` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 (SSR) + React 19 + Tailwind 4 + komponenty shadcn/ui; strony `/` (strona produktu), `/privacy`, auth, `/dashboard` (widok z S-11, karty w `src/components/dashboard/`), `/settings`, `/account/nickname` i `/join/[code]`.
- **Backend / API:** present — 21 plików tras w `src/pages/api/` (auth, groups, tasks, account) oraz `/auth/callback` i `/auth/google/callback`; dane dashboardu ładuje `loadDashboard` (`src/lib/dashboard-data.ts`).
- **Data:** present — Supabase (Postgres + RLS), 11 migracji: `groups`, `group_members`, `tasks`, `task_participants`, `task_checkoffs` (odczyt przez widok `task_checkoff_periods`) i `nicknames`; nie ma tabeli ustawień przypomnień.
- **Auth:** present — Supabase Auth: e-mail+hasło i Google (aplikacja Google „In production” od 2026-10-15), sesje w cookie, middleware z `PROTECTED_ROUTES` i bramką nicka; e-mail potwierdzający wysyła Supabase przez własny SMTP (Resend).
- **Deploy / infra:** present — Cloudflare Workers na `streakboard.app` (`workers_dev: false`); CI w GitHub Actions: `changes`, `ci`, `smoke`, `e2e`, `integration`, `compat` i `release` (migracje, potem deploy, po zatwierdzeniu w środowisku `production`) oraz bramka `ai-review`; `wrangler.jsonc` nie ma Cron Triggers, więc Worker nie ma harmonogramu.
- **Observability:** partial — Workers Logs i Sentry (`src/lib/sentry.ts`, `src/lib/log.ts`) dla błędów; brak metryk.
- **Przypomnienia (poza standardową listą warstw):** absent — aplikacja sama nie wysyła e-maili (robi to tylko Supabase Auth), nie ma handlera `scheduled` Workera, powiadomień push ani service workera.
- **PWA (poza standardową listą warstw):** absent — nie ma manifestu aplikacji ani service workera; wspólny nagłówek stron (`src/layouts/Layout.astro`) ma tylko `favicon.svg` i `favicon.png` (48×48).
- **Tests (poza standardową listą warstw):** present — Vitest (28 plików unit, 20 integracyjnych na lokalnym Supabase), Playwright (11 specyfikacji, job `e2e`), smoke przez HTTP, Stryker (testy mutacyjne) i scenariusze RLS w SQL.

## Foundations

(brak — M-3 nie wymaga przekrojowego odblokowania. Harmonogram i wysyłka przypomnień, których stan bazowy nie ma, wchodzą do S-16, pierwszego wycinka, który ich potrzebuje, a manifest aplikacji i service worker do S-17, zgodnie z zasadą progresywnego ujawniania elementów technicznych; siatka korzysta z danych, które już są.)

## Slices

### S-13: Siatka odznaczeń grupy

- **Outcome:** członek grupy widzi dla każdego tasku siatkę: uczestnicy × ostatnie okresy, z zaznaczeniem, kto w danym okresie wykonał task, a kto nie.
- **Change ID:** checkoff-grid
- **PRD refs:** PRD §Vision, FR-013; MS-01
- **Prerequisites:** S-11, S-14 (oba `done` w M-2; decyzja właściciela 2026-10-16: nick przed siatką, bo oba wycinki edytują politykę prywatności, PRD, słownik, `dashboard-data.ts`, smoke i fixture'y, a siatka ma od razu pokazywać nicki)
- **Parallel with:** S-16, S-17 (różne widoki; wspólne mogą być PRD, polityka prywatności, słownik, smoke i fixture'y kitchen sinka, więc uzgodnić kolejność merge'y)
- **Blockers:** —
- **Unknowns:**
  - Ile okresów pokazuje siatka (np. 7 dni / 4 tygodnie) i czy zależy to od tasku `daily`/`weekly`? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - PRD §Success Criteria → Secondary wymienia „historię/statystyki długoterminowe (wykresy streaków w czasie)”, a S-13 daje tylko siatkę: doprecyzować ten punkt w PRD (siatka w zakresie, wykresy i statystyki nadal w `## Parked`) w tej samej zmianie? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
- **Źródło zakresu:** PRD §Success Criteria → Secondary („Historia/statystyki długoterminowe”) w zakresie samej siatki (decyzja właściciela 2026-10-08, odparkowanie z `## Parked`); PRD §Vision opisuje siatkę zielono-czerwoną jako pierwotną wartość produktu. Do 2026-10-17 wycinek M-2 (kotwica MS-08), przeniesiony do M-3 decyzją właściciela. Poprawki dokumentów, które właściciel związał z S-13 (2026-10-16, `context/foundation/open-items.md` §3): PRD (opis streaka, poziomy i taski indywidualne, sekcja Open Questions), polityka prywatności (streak), słownik i opis okna dat jako znanej luki (Q-04).
- **Stan wejściowy (2026-10-08):** po podziale `dashboard.astro` nowy odczyt wielu okresów trafia do `loadDashboard` (`src/lib/dashboard-data.ts`, z testami jednostkowymi), a siatka to nowy komponent obok `TaskRow`/`TasksCard` w `src/components/dashboard/`. Polityka prywatności też jest podzielona na sekcje (`src/components/privacy/`), więc zmiana „kto co widzi” to edycja `WhoCanSee.astro`.
- **Risk:** Dane już są (`task_checkoffs` per okres), więc to głównie nowy odczyt i widok; idzie pierwszy w M-3 jako gwiazda przewodnia. Siatka uczestnicy × okresy to najszerszy widok w aplikacji, a PRD wymaga pełnej używalności na ekranie smartfona, więc układ na wąskim ekranie należy do zakresu. Zmienia, co członkowie grupy widzą o sobie nawzajem (historia zamiast bieżącego okresu), więc w tej samej zmianie trzeba zaktualizować politykę prywatności, słownik (`glossary.md` dziś zalicza historię do rzeczy, których aplikacja nie obiecuje) i PRD. Odczyt wielu okresów dokłada pracy do `/dashboard`, którego czas CPU nie był mierzony (otwarte ryzyko po S-04).
- **Status:** done

### S-16: Przypomnienie o niewykonanym tasku

- **Outcome:** użytkownik dostaje przypomnienie o tasku, do którego jest zapisany, a którego nie odznaczył w bieżącym okresie (dzień albo tydzień).
- **Change ID:** task-reminders
- **PRD refs:** — (PRD §Success Criteria → Secondary; MS-02)
- **Prerequisites:** —
- **Parallel with:** S-13, S-17 (różne widoki; wspólne mogą być PRD, polityka prywatności, słownik, smoke i fixture'y kitchen sinka, więc uzgodnić kolejność merge'y; przy kanale push S-17 idzie pierwszy, patrz Unknowns)
- **Blockers:** —
- **Unknowns:**
  - Jakim kanałem: e-mail, powiadomienie w przeglądarce (push) czy tylko w aplikacji? Przypomnienie w samej aplikacji nie dotrze do kogoś, kto jej nie otwiera, a push wymaga zgody przeglądarki i service workera, których dziś nie ma. Przy kanale push S-17 (PWA) staje się warunkiem wstępnym, bo na iOS powiadomienia web push działają tylko w aplikacji dodanej do ekranu głównego. — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - Kiedy i jak często: o której porze i w jakiej strefie czasowej (okres liczy się od dnia albo tygodnia), raz na okres czy częściej, i jak dla tasku tygodniowego? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - Zgoda i wypisanie się: przypomnienia domyślnie włączone czy dopiero po włączeniu przez użytkownika, gdzie jest to ustawienie i czy wiadomość ma link wypisania? — Owner: user. Block: no — rozstrzyga `/10x-frame`; polityka prywatności zmienia się w tej samej zmianie.
  - Jak aplikacja wysyła i planuje przypomnienia: dziś e-maile wysyła tylko Supabase Auth (SMTP Resend), a Worker nie ma harmonogramu, więc potrzebny jest klucz dostawcy jako sekret Workera (krok właściciela) i zadanie cykliczne mieszczące się w limicie CPU planu. — Owner: team. Block: no — rozstrzyga `/10x-research`.
- **Źródło zakresu:** PRD §Success Criteria → Secondary („Powiadomienia/przypomnienia o niewykonanym tasku”), do 2026-10-17 w `## Parked`; odparkowane decyzją właściciela 2026-10-17 przy wyborze źródeł M-3.
- **Risk:** Pierwszy wycinek, który działa bez żądania użytkownika: zadanie cykliczne musi zmieścić się w limicie CPU Workera (10 ms na planie Free, ryzyko znane z S-08) przy przeglądaniu wszystkich zapisanych uczestników, a nieudana wysyłka nie może zginąć po cichu (kontrakt błędów z S-08). Wiadomości do użytkowników zmieniają to, co polityka prywatności mówi o użyciu adresu e-mail, więc polityka, PRD i słownik zmieniają się w tej samej zmianie, a usunięcie konta (S-15) musi usuwać też ustawienia przypomnień. Idzie po S-13, ale nic go od niej nie uzależnia, więc może iść równolegle.
- **Status:** done

### S-17: Aplikacja do zainstalowania (PWA)

- **Outcome:** użytkownik instaluje StreakBoard na ekranie głównym telefonu (albo na komputerze) i uruchamia go jak osobną aplikację, z własną ikoną i bez paska przeglądarki.
- **Change ID:** installable-pwa
- **PRD refs:** — (opis właściciela; MS-03)
- **Prerequisites:** —
- **Parallel with:** S-13, S-16 (wspólne mogą być nagłówek stron, smoke i polityka prywatności, jeśli zmieni się to, co aplikacja zapisuje w przeglądarce, więc uzgodnić kolejność merge'y)
- **Blockers:** —
- **Unknowns:**
  - Czy PWA ma działać offline? PRD §Non-Goals wyklucza tryb offline-first, więc domyślnie aplikacja zostaje online, a service worker nie pokazuje starych danych; zmiana wymaga decyzji właściciela i zmiany PRD. — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - Ikony i wygląd po instalacji: dziś są tylko `favicon.svg` i `favicon.png` (48×48), a instalacja potrzebuje większych ikon, nazwy, koloru motywu i ekranu startowego. — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - Na jakich systemach sprawdzamy instalację (Android, iOS, komputer) i co aplikacja pokazuje, gdy nie ma sieci? — Owner: user. Block: no — rozstrzyga `/10x-frame`.
- **Źródło zakresu:** opis właściciela z 2026-10-17: „Żeby aplikacja była PWA”. PRD §User & Persona: użytkownik sięga po produkt codziennie, żeby odznaczyć task, a PRD §Non-Functional Requirements wymaga pełnej używalności na ekranie smartfona.
- **Risk:** Service worker zostaje w przeglądarce między sesjami i wydaniami: zbyt szeroka pamięć podręczna mogłaby po wylogowaniu pokazać cudzy dashboard na wspólnym urządzeniu (guardrail PRD: widoczność tylko dla własnej grupy) albo trzymać stary kod po wycofaniu wydania, więc strony i dane po zalogowaniu nie trafiają do cache, a aktualizacja service workera należy do zakresu. Odznaczenie ma zostać natychmiastowe (guardrail PRD). Idzie po S-16, chyba że S-16 wybierze kanał push: wtedy S-17 idzie pierwszy.
- **Status:** done

### S-18: Utwardzenie publicznej powierzchni

- **Outcome:** odwiedzający dostaje strony z nagłówkami bezpieczeństwa (nosniff, Referrer-Policy, zakaz osadzania w ramkach, Permissions-Policy, CSP najpierw w trybie Report-Only), badacz znajduje kontakt w `/.well-known/security.txt`, a nikt nie wyśle poczty podszywającej się pod domenę aplikacji.
- **Change ID:** public-surface-hardening
- **PRD refs:** — (prośba właściciela; MS-04)
- **Prerequisites:** —
- **Parallel with:** S-16 (wspólne mogą być middleware i polityka prywatności, więc uzgodnić kolejność merge'y)
- **Blockers:** —
- **Unknowns:**
  - Jaką CSP wymusić po okresie Report-Only (Supabase, Google OAuth, Sentry, service worker, push) i gdzie zbierać raporty? — Owner: team. Block: no — rozstrzyga `/10x-research`.
  - Czy domena wysyła albo będzie wysyłać pocztę (np. potwierdzenia Supabase przez własny SMTP)? Od tego zależy, czy SPF i DMARC mogą być `-all` i `p=reject`. — Owner: user. Block: no — rozstrzyga `/10x-frame`.
  - Czy zastąpić zarządzany przez Cloudflare `robots.txt` własnym w repo? — Owner: user. Block: no.
- **Źródło zakresu:** prośba właściciela z 2026-10-17 po przeglądzie logów Cloudflare (skany `/wp-admin/install.php`) i sprawdzeniu produkcji: brak nagłówków bezpieczeństwa, brak SPF i DMARC, `security.txt` daje 404.
- **Risk:** Zbyt ciasna CSP albo `X-Frame-Options` mogą zepsuć logowanie Google, push albo service worker, więc CSP idzie najpierw jako Report-Only; HSTS, DNS i WAF to kroki operatora w panelu Cloudflare (ręczne wiersze planu), nie kod.
- **Status:** done

### S-19: Zachęta do instalacji aplikacji

- **Outcome:** użytkownik, który otwiera StreakBoard w przeglądarce, dowiaduje się w aplikacji, jak zainstalować ją na swoim urządzeniu: na iPhonie widzi instrukcję „Udostępnij → Do ekranu początkowego”, w Chrome i Edge przycisk instalacji, i wie, że na iPhonie przypomnienia działają tylko z zainstalowanej aplikacji. W zainstalowanej aplikacji zachęty nie ma.
- **Change ID:** install-promotion
- **PRD refs:** — (opis właściciela; MS-05)
- **Prerequisites:** S-17 (aplikacja da się zainstalować), S-16 (przypomnienia, o których zachęta mówi)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Gdzie zachęta się pokazuje (dashboard, strona główna, ustawienia przy przełączniku przypomnień) i czy da się ją zamknąć na stałe na danym urządzeniu? — Owner: user. Block: no — rozstrzyga `/10x-frame` albo `/10x-plan`.
  - Jak rozpoznać iPhone'a z Safari i inne przeglądarki bez własnego monitu instalacji, i co pokazać w przeglądarce wbudowanej w komunikator, z której nie da się zainstalować aplikacji? — Owner: team. Block: no — rozstrzyga `/10x-research`.
- **Źródło zakresu:** opis właściciela z 2026-10-18 po teście z kolegą na iPhonie: dziś jedyną wskazówką jest napis przy przełączniku przypomnień w ustawieniach („Install StreakBoard on your home screen to get reminders.”), a Safari na iPhonie nie pokazuje żadnego monitu instalacji.
- **Risk:** Zachęta nie może być natrętna ani pokazywać się w zainstalowanej aplikacji; systemowy monit instalacji jest tylko w przeglądarkach Chromium, a rozpoznawanie iPhone'a po przeglądarce bywa zawodne, więc zachęta musi mieć sensowny wariant domyślny. Zmienia decyzję z planu S-17 (bez własnego przycisku i bez podpowiedzi dla iOS).
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                                                           | Ready for `/10x-plan` | Notes                                                                                                                                                                         |
| ---------- | ------------------------ | ----------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-13       | checkoff-grid            | Siatka odznaczeń grupy: uczestnicy × ostatnie okresy                                            | yes                   | Gwiazda przewodnia M-3. Najpierw `/10x-frame` (liczba okresów, doprecyzowanie PRD); w zakresie PRD, polityka prywatności, słownik i poprawki dokumentów z `open-items.md` §3. |
| S-16       | task-reminders           | Przypomnienie o niewykonanym tasku: kanał, harmonogram, zgoda                                   | yes                   | Najpierw `/10x-frame` (kanał, pora, zgoda), potem `/10x-research` (wysyłka i harmonogram na Workerze). Polityka prywatności, PRD i słownik w zakresie.                        |
| S-17       | installable-pwa          | Aplikacja PWA: instalacja na ekranie głównym, ikony, service worker bez cache danych            | yes                   | Najpierw `/10x-frame` (offline czy nie, ikony, systemy), potem `/10x-research`. Przy kanale push w S-16 idzie przed S-16.                                                     |
| S-18       | public-surface-hardening | Utwardzenie publicznej powierzchni: nagłówki bezpieczeństwa, security.txt, SPF/DMARC, HSTS, WAF | yes                   | Kod: nagłówki w middleware, CSP Report-Only, `security.txt`. Ręcznie w Cloudflare: HSTS, SPF/DMARC, reguła WAF.                                                               |
| S-19       | install-promotion        | Zachęta do instalacji: instrukcja dla iPhone'a, przycisk w Chrome i Edge, powód (przypomnienia) | yes                   | Zmienia decyzję z planu S-17. Najpierw `/10x-frame` (miejsca, zamykanie, przeglądarki w komunikatorach), potem `/10x-plan`.                                                   |

## Open Roadmap Questions

Brak otwartych pytań na poziomie roadmapy: PRD `## Open Questions` mówi „None”, a niewiadome wycinków są zapisane przy S-13, S-16 i S-17. Zamknięte pytania M-2 (publikacja aplikacji Google, flaga Safe Browsing) są w historii tego pliku i w `context/changes/deployment/deployment-plan.md` (Phase 13).

## Parked

- **Wiele grup na jednego użytkownika** — Why parked: PRD §Non-Goals; upraszcza model danych i UI na MVP.
- **Konfigurowalne (admin/głosowanie) tempo spadku streaka** — Why parked: PRD §Non-Goals; stała reguła dla wszystkich grup na MVP, konfigurowalność to pomysł na dużo większą skalę.
- **Weryfikacja/anti-cheat wykonania tasku** — Why parked: PRD §Non-Goals; system oparty na zaufaniu w gronie znajomych.
- **Działanie offline** — Why parked: PRD §Non-Goals; aplikacja wymaga połączenia z internetem na MVP. S-17 (PWA) zostawia to wyłączenie, chyba że właściciel zdecyduje inaczej przy `/10x-frame`.
- ~~**Powiadomienia/przypomnienia o niewykonanym tasku**~~ — Unparked 2026-10-17: trafiły do S-16 (`task-reminders`, kotwica MS-02 kamienia M-3) decyzją właściciela przy wyborze źródeł M-3.
- **Historia/statystyki długoterminowe (wykresy streaków w czasie)** — Why parked: PRD §Success Criteria Secondary. Częściowo odparkowane 2026-10-08: prosta siatka odznaczeń trafiła do S-13 (`checkoff-grid`, od 2026-10-17 w M-3); wykresy, statystyki i rekordy streaka zostają zaparkowane.
- ~~**Automatyczny deploy na merge (CI/CD)**~~ — Unparked 2026-09-25: Workers Builds i tak wdraża `master`, a automatyzacja migracji trafiła do S-05 (`release-automation-and-auth-hardening`).
- ~~**Domena własna / środowisko staging**~~ — Unparked 2026-10-02: domena własna trafiła do S-06 (`custom-domain`); środowisko staging zostaje zaparkowane (osobna pozycja poniżej).
- **Środowisko staging** — Why parked: `context/foundation/infrastructure.md` i deployment-plan.md — poza zakresem; wydzielone z pozycji „Domena własna / środowisko staging" przy odparkowaniu domeny 2026-10-02.
- ~~**Observability (logowanie strukturalne, error tracking)**~~ — Unparked 2026-10-02: trafiła do S-08 (`observability-swallowed-errors`) w zakresie audytu jednego przepływu, naprawy jednego połkniętego błędu i opcjonalnego error trackingu; pierwotnie logowanie strukturalne nie było celem tego wycinka, ale plan (decyzja z wywiadu planistycznego, 2026-10-02) obejmuje wspólny helper raportujący i wszystkie gałęzie zwróconego błędu Supabase, nie jeden przepływ.

## Milestone History

- **M-1: Pierwszy pełny cykl: grupa → task → odznaczenie → tablica wyników** (`first-group-checkin-loop`) — closed 2026-10-02. F-01 oraz S-01 do S-05 `done`: pełny przepływ z głównego kryterium sukcesu PRD (FR-001 do FR-009) działa na produkcji, a migracje i wydania są zautomatyzowane; zmiany zarchiwizowane w `context/archive/` (2026-09-25 do 2026-10-01).
- **M-2: Gotowość na realnych użytkowników: adres, logowanie, strona startowa, widok, testy i widoczne awarie** (`ready-for-real-users`) — closed 2026-10-17. S-06, S-07, S-08, S-09, S-10, S-11, S-12, S-14 i S-15 `done`: aplikacja działa pod `streakboard.app` z logowaniem Google, stroną startową z polityką prywatności, nowym widokiem grupy, nickami zamiast e-maili i usuwaniem konta, awarie trafiają do odpowiedzi API i do monitoringu, a testy dobrane według ryzyka (z e2e i testami mutacyjnymi) pilnują zmian; zmiany zarchiwizowane w `context/archive/` (2026-10-02 do 2026-10-16). S-13 (siatka odznaczeń, kotwica MS-08) przeniesiony do M-3 decyzją właściciela 2026-10-17.
- **M-3: Historia, przypomnienia i instalacja: siatka odznaczeń grupy, przypomnienie o niewykonanym tasku i aplikacja PWA** (`history-and-reminders`) — closed 2026-10-17. S-13, S-16, S-17 i S-18 `done`: członek grupy widzi siatkę odznaczeń przy każdym tasku, przypomnienia Web Push przychodzą o 20:00 czasu warszawskiego, aplikację da się zainstalować jako PWA, a publiczna powierzchnia ma nagłówki bezpieczeństwa, CSP w trybie Report-Only i `security.txt`, a domeny nie da się podrobić w poczcie; zmiany zarchiwizowane w `context/archive/` (2026-10-17). Przy zamknięciu strona główna przestała opisywać aplikację jako wspólny arkusz i opisuje siatkę przy każdym tasku (PR #187). Właściciel nie otwiera kolejnego kamienia milowego (decyzja 2026-10-17).
- **M-3: Historia, przypomnienia i instalacja: siatka odznaczeń grupy, przypomnienie o niewykonanym tasku i aplikacja PWA** (`history-and-reminders`) — reopened 2026-10-18. Decyzja właściciela: zachęta do instalacji aplikacji (S-19, kotwica MS-05) należy jeszcze do M-3, więc kamień milowy jest znowu otwarty; wpis o zamknięciu powyżej zostaje bez zmian.
- **M-3: Historia, przypomnienia i instalacja: siatka odznaczeń grupy, przypomnienie o niewykonanym tasku i aplikacja PWA** (`history-and-reminders`) — closed 2026-10-18. Po ponownym otwarciu S-19 `done`: aplikacja otwarta w przeglądarce sama zachęca do instalacji — karta „Install StreakBoard” na dashboardzie (do „Not now” na danym urządzeniu) i stały blok przy przełączniku przypomnień w ustawieniach podają kroki dla danej przeglądarki (w Chrome i Edge przycisk instalacji, gdy przeglądarka na to pozwala, w przeglądarce komunikatora prośbę o otwarcie strony w Safari albo Chrome) i powód (na iPhonie przypomnienia działają tylko z zainstalowanej aplikacji), a w zainstalowanej aplikacji zachęty nie ma; zmiana zarchiwizowana w `context/archive/2026-10-18-install-promotion/`. Przy zamknięciu nagłówek przykleił się do góry ekranu, a strona omija pasek stanu i dolną krawędź ekranu (`viewport-fit=cover` i wcięcia `env(safe-area-inset-*)`), bo na iPhonie kolegi pasek stanu nachodził na nagłówek (PR #198). Kontrole na urządzeniach czekają w `context/changes/deployment/deployment-plan.md` (Phase 24 i 26). Właściciel nie otwiera kolejnego kamienia milowego (decyzja 2026-10-17, potwierdzona 2026-10-18).

## Done

- **S-16: użytkownik dostaje przypomnienie o tasku, do którego jest zapisany, a którego nie odznaczył w bieżącym okresie (dzień albo tydzień).** — Archived 2026-10-17 → `context/archive/2026-10-17-task-reminders/`. Lesson: —.
- **S-17: użytkownik instaluje StreakBoard na ekranie głównym telefonu (albo na komputerze) i uruchamia go jak osobną aplikację, z własną ikoną i bez paska przeglądarki.** — Archived 2026-10-17 → `context/archive/2026-10-17-installable-pwa/`. Lesson: —.
- **S-13: członek grupy widzi dla każdego tasku siatkę: uczestnicy × ostatnie okresy, z zaznaczeniem, kto w danym okresie wykonał task, a kto nie.** — Archived 2026-10-17 → `context/archive/2026-10-17-checkoff-grid/`. Lesson: —.
- **S-18: odwiedzający dostaje strony z nagłówkami bezpieczeństwa (nosniff, Referrer-Policy, zakaz osadzania w ramkach, Permissions-Policy, CSP najpierw w trybie Report-Only), badacz znajduje kontakt w `/.well-known/security.txt`, a nikt nie wyśle poczty podszywającej się pod domenę aplikacji.** — Archived 2026-10-17 → `context/archive/2026-10-17-public-surface-hardening/`. Lesson: —.
- **S-19: użytkownik, który otwiera StreakBoard w przeglądarce, dowiaduje się w aplikacji, jak zainstalować ją na swoim urządzeniu: na iPhonie widzi instrukcję „Udostępnij → Do ekranu początkowego”, w Chrome i Edge przycisk instalacji, i wie, że na iPhonie przypomnienia działają tylko z zainstalowanej aplikacji. W zainstalowanej aplikacji zachęty nie ma.** — Archived 2026-10-18 → `context/archive/2026-10-18-install-promotion/`. Lesson: —.
