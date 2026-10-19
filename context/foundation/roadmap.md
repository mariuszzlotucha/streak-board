---
project: "StreakBoard"
version: 1
status: locked
created: 2026-09-24
updated: 2026-10-19
prd_version: 1
main_goal: quality
top_blocker: none
milestone_id: grid-polish
milestone_seq: 4
milestone_status: open
---

# Roadmap: StreakBoard

> Derived from PRD v1 (§Success Criteria → Secondary), the owner's decisions of 2026-10-08 and 2026-10-17 and the owner's description of 2026-10-17 (PWA) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-4: Siatka odznaczeń: czytelna na telefonie, z jasnym stanem i szybkim zapisem** — Status: open

- **Intent:** Poprawić siatkę odznaczeń grupy (S-13), którą członkowie grupy otwierają przy każdym tasku: ma być czytelna na ekranie telefonu, pokazywać wyraźnie, co już odznaczone, co zaległe i co zostało zapisane, oraz zapisywać odznaczenie szybko i bez cichych błędów. Zakres dotyczy widoku siatki; decyzją właściciela z 2026-10-19 kamień milowy niesie też jeden wycinek jakościowy (S-23, kotwica MS-04): porządki po health checku, bez zmiany zachowania widocznego dla użytkownika. Pytanie właściciela o north star siatki (jak sprawdzić, czy działa, bez analityki) zostaje otwarte i nie blokuje tego kamienia milowego.
- **Source materials:** opis właściciela z 2026-10-19 (kotwice MS-01 do MS-03, wybór „Czytelność na telefonie”, „Stan i informacja zwrotna”, „Szybkość i błędy zapisu”; decyzja: tylko poprawka widoku, bez pomiaru). Główne ograniczenia z istniejących dokumentów: PRD §Non-Functional Requirements (pełna używalność na ekranie smartfona), guardrail PRD (odznaczenie natychmiastowe), polityka prywatności bez analityki. Wycinek S-13 pozostaje wzorcem zakresu (`context/archive/2026-10-17-checkoff-grid/`). Dla S-23: `context/foundation/health-check.md` (2026-10-19) i `context/foundation/open-items.md` §6 (decyzja właściciela 2026-10-19: porządki z health checku wchodzą do M-4, wzorem wycinków jakościowych S-08, S-10 i S-12 w M-2).
- **Done when:** każdy S-NN poniżej (S-20, S-21, S-22, S-23) ma status `done`.
- **Scope anchors:**
  - MS-01: siatka odznaczeń jest czytelna na ekranie telefonu: rozmiar komórek, odstępy, nazwy uczestników i okresów mieszczą się bez poziomego przewijania, a nazwisko/nick nie zasłania kolumny (opis właściciela: „Czytelność na telefonie”).
  - MS-02: stan siatki jest widoczny od razu: odznaczone, zaległe i bieżący okres są rozróżnialne bez legendy, a po kliknięciu użytkownik dostaje potwierdzenie zapisu (opis właściciela: „Stan i informacja zwrotna”).
  - MS-03: odznaczenie zapisuje się szybko, a błąd zapisu jest pokazany użytkownikowi i nie znika po cichu; po błędzie stan siatki wraca do prawdziwego (opis właściciela: „Szybkość i błędy zapisu”).
  - MS-04: (jakościowy) zależności i runtime są uporządkowane według `context/foundation/health-check.md` z 2026-10-19: żadna znana podatność z dostępną poprawką nie zostaje w drzewie zależności (jedyna w kodzie wdrażanym to `devalue`), pakiety narzędziowe nie figurują jako zależności produkcyjne, wersja Node jest przypięta, a nowe podatności trafiają do PR-ów i do CI zamiast czekać na ręczny audyt (decyzja właściciela 2026-10-19).

## Vision recap

Grono znajomych korzystało wcześniej ze wspólnego arkusza Google, w którym ręcznie kolorowało komórki na zielono/czerwono, żeby widzieć nawzajem swoją konsekwencję w budowaniu nawyków — wartość dawała widoczność dla innych, ale ręczne prowadzenie było na tyle męczące, że narzędzie przestało być używane. Istniejące aplikacje do nawyków są projektowane dla pojedynczego użytkownika i nie obsługują modelu, w którym kilka osób śledzi ten sam cel równolegle; StreakBoard automatyzuje dokładnie ten sam prosty widok siatki i dodaje grywalizację (streaki), której arkusz nigdy nie miał.

## North star

**S-20: członek grupy widzi na telefonie siatkę odznaczeń, w której od razu widać, kto wykonał task, a kto nie** — MS-01 i MS-02 w jednym wycinku, bo bez czytelnego układu na telefonie nie ma czego pokazywać; to najmniejszy widoczny dla użytkownika kawałek poprawki, a S-21 i S-22 zmieniają to, co już jest na ekranie.

> Gwiazda przewodnia (ang. north star) to najmniejszy kompleksowy wycinek widoczny dla użytkownika, którego dostarczenie jako pierwszego potwierdza główną hipotezę kamienia milowego — umieszczony tak wcześnie, jak pozwalają jego zależności. Tutaj hipoteza brzmi: siatka czytelna na telefonie jest czytana przez członków grupy przy każdym tasku, a nie tylko na komputerze.

## At a glance

| ID   | Change ID               | Outcome (user can …)                                                                                                                                                                                    | Prerequisites | PRD refs                                          | Status   |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------- | -------- |
| S-20 | grid-mobile-readability | czytać siatkę odznaczeń grupy na ekranie telefonu bez przewijania w poziomie i rozpoznać uczestników i okresy                                                                                           | —             | PRD §NFR (smartfon); MS-01                        | planning |
| S-21 | grid-state-feedback     | rozpoznać bez legendy odznaczone, zaległe i bieżący okres oraz dostać potwierdzenie po odznaczeniu                                                                                                      | S-20          | PRD §Vision; MS-02                                | ready    |
| S-22 | grid-save-reliability   | odznaczyć szybko, a po błędzie zapisu zobaczyć komunikat i prawdziwy stan siatki                                                                                                                        | —             | PRD guardrail (odznaczenie natychmiastowe); MS-03 | ready    |
| S-23 | dependency-hygiene      | (jakościowy) korzystać z aplikacji budowanej z zależności bez znanych podatności z dostępną poprawką, przy narzędziach poza zależnościami produkcyjnymi, przypiętym Node i alertach bezpieczeństwa w CI | —             | — (jakościowe; MS-04)                             | done     |

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

(brak — M-4 nie wymaga przekrojowego odblokowania: siatka i jej dane z S-13 już istnieją.)

## Slices

### S-20: Siatka odznaczeń czytelna na telefonie

- **Outcome:** członek grupy na ekranie telefonu widzi siatkę każdego tasku bez poziomego przewijania; uczestnicy i okresy są czytelne, a długi nick nie wypycha kolumn.
- **Change ID:** grid-mobile-readability
- **PRD refs:** PRD §Non-Functional Requirements (pełna używalność na smartfonie); MS-01
- **Prerequisites:** —
- **Parallel with:** S-22 (inne pliki: układ siatki kontra logika zapisu; wspólny może być tylko smoke i fixture'y kitchen sinka)
- **Blockers:** —
- **Unknowns:**
  - Co dokładnie jest nieczytelne na telefonie: liczba okresów, szerokość kolumny nicku, czy przewijanie w poziomie? Owner: user (zrzut ekranu z telefonu). Block: no — rozstrzyga `/10x-frame`.
- **Risk:** siatka to najszerszy widok w aplikacji; zmiana układu nie może zepsuć widoku komputerowego ani kitchen sinka (`scripts/smoke.mjs` wiąże markup siatki).
- **Status:** planning

### S-21: Stan siatki i potwierdzenie zapisu

- **Outcome:** odznaczone, zaległe i bieżący okres są rozróżnialne bez legendy, a po odznaczeniu pojawia się krótkie potwierdzenie.
- **Change ID:** grid-state-feedback
- **PRD refs:** PRD §Vision (zielono-czerwona siatka); MS-02
- **Prerequisites:** S-20 (stan ma być czytelny na telefonie, zanim zostanie dopracowany)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jak oznaczyć zaległość bez mylenia z odznaczeniem (kolor z tokenów, kształt, tekst)? Owner: user. Block: no — rozstrzyga `/10x-frame`.
- **Risk:** nowe kolory muszą przejść `node scripts/token-contrast.mjs` w obu motywach; potwierdzenie nie może zasłaniać siatki.
- **Status:** ready

### S-22: Szybki zapis odznaczenia i jawne błędy

- **Outcome:** odznaczenie zapisuje się od razu w widoku; gdy zapis się nie uda, użytkownik widzi komunikat, a siatka wraca do prawdziwego stanu.
- **Change ID:** grid-save-reliability
- **PRD refs:** PRD guardrail (odznaczenie natychmiastowe); MS-03
- **Prerequisites:** —
- **Parallel with:** S-20 (logika zapisu kontra układ siatki)
- **Blockers:** —
- **Unknowns:**
  - Czy odznaczenie ma być optymistyczne (od razu w widoku, cofane przy błędzie), czy czekać na odpowiedź serwera? Owner: user. Block: no — rozstrzyga `/10x-frame`.
- **Risk:** błąd, który znika po cichu, wraca do stanu sprzed S-08 (połknięte błędy); kontrakt błędów z S-08 obowiązuje.
- **Status:** ready

### S-23: Czyste zależności, przypięty runtime i alerty bezpieczeństwa w CI

- **Outcome:** (jakościowy) drzewo zależności nie ma znanych podatności z dostępną poprawką (jedyna w kodzie wdrażanym, `devalue`, znika w pierwszej fazie), pakiety narzędziowe nie figurują jako zależności produkcyjne, wersja Node jest przypięta tak, że maszyna z innym Node dowiaduje się o tym przy instalacji, a nowe podatności trafiają do PR-ów Dependabota i do kroku audytu w CI.
- **Change ID:** dependency-hygiene
- **PRD refs:** — (jakościowe; MS-04). Źródło: `context/foundation/health-check.md` (2026-10-19), lista kroków w `context/foundation/open-items.md` §6 (6.1, 6.2, 6.5, 6.7, 6.8; decyzje 6.3 i 6.9).
- **Prerequisites:** —
- **Parallel with:** S-20, S-21, S-22 (inne pliki: manifest pakietów, lockfile i konfiguracja CI kontra widok siatki; wspólny jest tylko lockfile, którego wycinki siatki nie powinny ruszać)
- **Blockers:** —
- **Unknowns:**
  - `patch-package` zostaje (upstream Strykera bez poprawki) i lockfile evals: zostawić z wyłączonymi PR-ami Dependabota czy usunąć i uruchamiać evale jednorazowo? — Owner: user (open-items 6.3 i 6.9). Block: no — rozstrzyga `/10x-plan`.
  - Czy krok audytu w CI ma od razu blokować merge, czy najpierw tylko raportować? — Owner: user. Block: no — rozstrzyga `/10x-plan`.
- **Risk:** aktualizacja lockfile dotyka całego drzewa naraz, więc faza musi przejść pełne CI, smoke i e2e, nie tylko testy jednostkowe; `npm audit fix --force` cofnęłoby `shadcn` i `patch-package` do starych wersji głównych (zakaz w `open-items.md` §6.1); zmiana zakresu pakietów nie zmienia wdrażanego bundla, więc nie ma skutku widocznego dla użytkownika do sprawdzenia.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                                            | Ready for `/10x-plan` | Notes                                                                                                                                                                         |
| ---------- | ----------------------- | ---------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-20       | grid-mobile-readability | Siatka odznaczeń czytelna na telefonie                           | yes                   | Gwiazda przewodnia M-4. Najpierw zrzut ekranu od właściciela.                                                                                                                 |
| S-21       | grid-state-feedback     | Stan siatki (odznaczone, zaległe, bieżący okres) i potwierdzenie | yes                   | Po S-20.                                                                                                                                                                      |
| S-22       | grid-save-reliability   | Szybki zapis odznaczenia i jawny błąd                            | yes                   | Równolegle z S-20.                                                                                                                                                            |
| S-23       | dependency-hygiene      | Czyste zależności, przypięty Node i alerty bezpieczeństwa w CI   | yes                   | Jakościowy, niezależny od S-20 do S-22. Najpierw decyzje właściciela 6.3 i 6.9 z `open-items.md`, potem Run `/10x-plan dependency-hygiene` (po `/10x-new` i `/10x-research`). |

## Open Roadmap Questions

Jedno pytanie zostaje otwarte u właściciela: jak bez analityki sprawdzić, czy siatka odznaczeń (S-13, FR-013) spełnia gwiazdę przewodnią M-3. S-13 celowo nie dodał analityki ani testu hipotezy, bo polityka prywatności obiecuje „No analytics” (`context/archive/2026-10-17-checkoff-grid/plan.md`, „What We're NOT Doing”), a M-3 zamknięto bez odpowiedzi. Pytanie nie blokuje żadnego wycinka. PRD `## Open Questions` zapisuje to samo pytanie i znaną lukę Q-04 (okno dat w `task_checkoffs`, zaakceptowana przez właściciela, kod bez zmian). Niewiadome wycinków są zapisane przy każdym z nich (S-13, S-16, S-17, S-18, S-19). Zamknięte pytania M-2 (publikacja aplikacji Google, flaga Safe Browsing) są w historii tego pliku i w `context/changes/deployment/deployment-plan.md` (Phase 13).

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
- **S-23: (jakościowy) drzewo zależności nie ma znanych podatności z dostępną poprawką (jedyna w kodzie wdrażanym, `devalue`, znika w pierwszej fazie), pakiety narzędziowe nie figurują jako zależności produkcyjne, wersja Node jest przypięta tak, że maszyna z innym Node dowiaduje się o tym przy instalacji, a nowe podatności trafiają do PR-ów Dependabota i do kroku audytu w CI.** — Archived 2026-10-19 → `context/archive/2026-10-19-dependency-hygiene/`. Lesson: —.
