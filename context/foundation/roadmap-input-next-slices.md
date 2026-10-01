# Wejście dla `/10x-roadmap`: kolejne wycinki po S-04

Notatka robocza do przekazania skillowi `/10x-roadmap` (np. `/10x-roadmap @context/foundation/roadmap-input-next-slices.md`). Źródło: ustalenia użytkownika z 2026-10-01, po zamknięciu S-04 (`checkoff-and-leaderboard`). Wszystkie pozycje z `roadmap.md` mają wtedy status `done`.

## Kontekst

- Wszystkie wycinki z PRD (F-01, S-01 do S-05) są zrobione i wdrożone.
- `main_goal` roadmapy: `market-feedback`.
- Dodać pięć nowych wycinków jako kolejne elementy `S-NN` (numeracja po S-05) wraz z wierszami w `## At a glance` i `## Backlog Handoff`.
- Wycinek 1 wymaga **odparkowania** pozycji „Domena własna / środowisko staging" z sekcji `## Parked` (przekreślić z datą odparkowania, jak zrobiono przy CI/CD). Staging pozostaje zaparkowany.
- Wycinek 5 wymaga **odparkowania** pozycji „Observability (logowanie strukturalne, error tracking)" z `## Parked`.
- Poza zakresem PRD: te wycinki nie realizują nowych FR-ów, to praca operacyjna, UI i jakościowa. Kolumna „PRD refs" ma więc wskazać powód (jak przy S-05: „operacyjne"), a nie wymyślać numerów FR.

## Proponowana kolejność

1. `custom-domain`
2. `test-coverage`
3. `landing-page`
4. `dashboard-ui`
5. `observability-swallowed-errors`

Uzasadnienie: domena jest mała i zmienia adres, na który wskazują kolejne kroki; testy dają siatkę bezpieczeństwa przed zmianą wyglądu. Wycinek 5 jest niezależny od pozostałych i można go wstawić wcześniej (nawet przed 2), jeśli ważniejsze jest wykrywanie awarii niż testy. Zamiana 2 i 4 jest dopuszczalna, jeśli UI jest pilniejsze niż testy (wtedy e2e powstaje już pod nowy wygląd).

## Wycinki

### 1. custom-domain

- **Outcome:** użytkownik wchodzi na aplikację pod własną domeną właściciela, a rejestracja, logowanie i link potwierdzający działają na tej domenie.
- **Change ID:** `custom-domain`
- **Typ:** operacyjny, bez UI. Głównie kroki ręczne właściciela (DNS i Cloudflare, ustawienia Supabase); skill przygotowuje listę, właściciel wykonuje kroki wymagające dostępu.
- **Zakres:**
  - podpięcie domeny do Workera Cloudflare i DNS;
  - Supabase: Site URL i Redirect URLs (w tym `/auth/callback`) na nową domenę;
  - sprawdzenie linku potwierdzającego i własnego SMTP po zmianie adresu;
  - poprawienie dokumentacji (`README.md` Deployment, `deployment-plan.md`, `infrastructure.md`), która dziś zakłada adres `workers.dev`;
  - wpis w `deployment-plan.md` (data, wynik), zgodnie z lekcją o zamykaniu wycinka.
- **Prerequisites:** S-05 (zautomatyzowane wydania), działa produkcja.
- **Ryzyko:** błędne Redirect URLs łamią rejestrację na produkcji (znane z S-05). Zmiana nie ma rollbacku schematu, ale tu schematu nie dotyka; Worker wraca przez `npx wrangler rollback`.
- **Otwarte (do ustalenia przy `/10x-frame` lub `/10x-research`):** nazwa domeny; gdzie jest DNS (Cloudflare czy zewnętrzny rejestrator); czy stary adres `workers.dev` ma zostać aktywny.

### 2. test-coverage

- **Outcome:** (jakościowy) zmiany w aplikacji są chronione testami wybranymi według ryzyka, a jakość testów jednostkowych jest mierzona mutacjami.
- **Change ID:** `test-coverage`
- **Typ:** jakościowy. Plan oprzeć o `context/foundation/test-plan.md` (etapy, ryzyka, bramki), nie o hasło „pokryć wszystko".
- **Zakres:**
  - testy jednostkowe (Vitest, `tests/unit/`) dla logiki, która ich jeszcze nie ma;
  - Stryker (konfiguracja już jest: `stryker.config.json`): uruchomić na modułach z regułami, ocenić wynik mutacji, domknąć słabe testy;
  - e2e Playwright (setup już jest: `playwright.config.ts`, `tests/e2e/`): kluczowe przepływy zamiast wszystkiego;
  - zgodnie z test-planem §7 UI nie jest objęte testami DOM w Vitest; granice zakresu ustalić w planie.
- **Prerequisites:** brak technicznych (korzysta z istniejącego setupu).
- **Ryzyko:** zakres bez granic. Plan musi wybrać etapy z test-planu i zapisać, czego nie testuje.

### 3. landing-page

- **Outcome:** niezalogowany użytkownik widzi stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania.
- **Change ID:** `landing-page`
- **Typ:** nowy widok, więc zwykły łańcuch (`/10x-frame` → `/10x-new` → `/10x-research` → `/10x-plan`…). `/10x-ui` dopiero przy późniejszych poprawkach (zasada z `CLAUDE.md`).
- **Zakres:** strona dla niezalogowanych (dziś brak strony domenowej poza auth i dashboardem); przekierowanie zalogowanego, jeśli takie zachowanie ma sens; spójność z systemem projektowym (shadcn/ui, Tailwind 4).
- **Prerequisites:** brak technicznych; sensownie po `custom-domain` (adres publiczny).
- **Otwarte (do ustalenia przy `/10x-frame`):** co strona obiecuje i do czego prowadzi (to decyzja produktowa); treści i język; czy ma być widoczny podgląd tablicy wyników.
- **Smoke:** nowa strona wymaga kroków smoke, które sprawdzają wynik (nie tylko brak błędu), zgodnie z lekcją o smoke.

### 4. dashboard-ui

- **Outcome:** zalogowany użytkownik korzysta z czytelniejszego, spójnego wizualnie widoku grupy, tasków i tablicy wyników.
- **Change ID:** `dashboard-ui`
- **Typ:** praca nad widokiem, który już się renderuje, więc **`/10x-ui`** (przechodzi przez ten sam łańcuch; ma audyt, kontrakt systemu projektowego, stany komponentów i bramkę zrzutu ekranu).
- **Zakres:** `src/pages/dashboard.astro` i komponenty w `src/components/tasks/`, `src/components/groups/`; plan S-04 wprost zostawił „restyling i nowe tokeny" na późniejszy `/10x-ui`.
- **Ograniczenie, które plan musi uwzględnić:** `scripts/smoke.mjs` dopasowuje obecny markup (jeden `<li>` na task bez zagnieżdżonych `<li>`, `role="alert"` tylko dla błędów, `<ol aria-label="Leaderboard">`, liczby w osobnych elementach). Zmiana wyglądu wymaga przepisania asercji smoke i sprawdzenia e2e; te zmiany należą do zakresu tego wycinka. Island optymistyczny (`CheckoffControl`, `Leaderboard`) musi zachować zgodność HTML serwera z pierwszym renderem klienta.
- **Prerequisites:** sensownie po `test-coverage` (siatka bezpieczeństwa).

### 5. observability-swallowed-errors

- **Outcome:** (jakościowy) awaria w krytycznym przepływie aplikacji nie jest połykana ani zamieniana na sukces: trafia do odpowiedzi API i do monitoringu.
- **Change ID:** `observability-swallowed-errors`
- **Źródło:** zadanie kursowe użytkownika: „Zidentyfikuj połknięty błąd we własnym projekcie. Uruchom `/10x-observability-audit` dla jednego krytycznego przepływu swojej aplikacji. Z raportu wybierz jedno znalezisko, w którym błąd jest połykany albo zamieniany na sukces, i napraw je tak, żeby awaria trafiała do odpowiedzi API i do monitoringu." Opcjonalnie: skonfigurować monitoring (Sentry lub inne narzędzie, darmowy plan Sentry wystarczy) przez `/10x-new` → `/10x-plan` → `/10x-implement`; szczegóły w sekcji kursu o Sentry MCP.
- **Typ:** audyt, poprawka i opcjonalna konfiguracja monitoringu. Dwie części: (A) audyt jednego przepływu i naprawa jednego znaleziska, (B) opcjonalnie monitoring.
- **Zakres:**
  - wybrać jeden krytyczny przepływ (kandydaci: check-off `POST /api/tasks/checkoff|uncheck` albo dołączanie do grupy) i uruchomić audyt;
  - z raportu wybrać jedno znalezisko typu „błąd połknięty lub zamieniony na sukces" i naprawić je tak, żeby awaria trafiała do odpowiedzi API (kod statusu i treść) oraz do monitoringu;
  - dołożyć test, który dowodzi, że awaria nie jest już sukcesem (zgodnie z lekcją o asercjach wyniku);
  - część B: Sentry (lub inne narzędzie) na Cloudflare Workers; DSN jako sekret, nigdy w repozytorium ani w czacie.
- **Skill:** `/10x-observability-audit` jest zainstalowany w `.claude/skills/` (dodany commitem `a72c2e9`). Wybiera krytyczne przepływy z `context/foundation`, uruchamia audyt i zapisuje raport w `context/audits/observability/`. Raport jest wejściem do planu tego wycinka.
- **Punkt startowy z kodu (do weryfikacji w audycie, nie ustalony fakt):** trasy API mają `try/catch`, który loguje `console.error` i odpowiada stałym komunikatem; część odczytów w `dashboard.astro` degraduje się po cichu do notki „unavailable". `wrangler.jsonc` ma włączone observability (Workers Logs), ale nie ma error trackingu.
- **Prerequisites:** brak technicznych; opcjonalna część B wymaga konta Sentry po stronie użytkownika.
- **Ryzyko:** zmiana sposobu odpowiedzi na błąd może zmienić kontrakt, na którym polega island (`checkoff-client.ts` mapuje 403/404/5xx na `rejected`/`failed`) i smoke. Plan musi to uwzględnić. Sentry w Workerze zwiększa zużycie CPU (limit 10 ms na planie Free), więc sprawdzić narzut.

## Co NIE jest w tym wejściu

- Nowe FR-y z PRD i zmiany w regule streaka.
- Powiadomienia i historia/wykresy streaków: zostają w `## Parked` (observability jest teraz wycinkiem 5).
- Środowisko staging: zostaje zaparkowane.
- Pomiar czasu CPU `/dashboard` (otwarte ryzyko po S-04, patrz `context/archive/2026-10-01-checkoff-and-leaderboard/` i `deployment-plan.md` Phase 9). Do dodania jako osobny punkt tylko, jeśli użytkownik tego zechce.

## Po `/10x-roadmap`: kroki dla pierwszego wycinka

`/10x-frame` (jeśli trzeba), `/10x-new custom-domain`, `/10x-research custom-domain`, `/10x-plan custom-domain`, `/10x-plan-review custom-domain` (max effort), potem `/10x-implement` fazami z `/10x-impl-review` po każdej, na końcu pełny `/10x-impl-review`, release na produkcji i `/10x-archive` (Haiku).
