# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-17 (§5: the AI reviewer's eval suite as a manual process gate, `code-review-evals`)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`
(excluded: `context/`, `dist/`, `node_modules/`, `scripts/`, `.claude/`;
22 commits in the last 30 days).

## 2. Risk Map

Najważniejsze scenariusze awarii, które projekt musi chronić, uporządkowane
według ryzyka = wpływ × prawdopodobieństwo. Ryzyka opisują scenariusze w
języku użytkownika i biznesu, a nie nazwy testów. Kolumna Source cytuje
_dowody, które podniosły ryzyko_, nigdy plik jako „miejsce awarii" (to zadanie
`/10x-research`, patrz §1 zasada #3).

| #   | Risk (failure scenario)                                                                                                                                                      | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kod wymagający nowego schematu trafia na produkcję przed migracją, a zalogowani użytkownicy dostają błąd zamiast funkcji                                                     | High   | High       | interview Q2; roadmap S-05 problem 1 (Workers Builds wdraża `master`); `lessons.md` reguły wydania produkcyjnego                                    |
| 2   | Członek jednej grupy widzi grupy, członków lub (później) taski i wyniki innej grupy                                                                                          | High   | Medium     | PRD Guardrails; interview Q1, Q3; archive `group-schema-and-rls`, `group-rls-hardening`; hot-spot dir `supabase/`                                   |
| 3   | Nie-twórca usuwa grupę, zmienia jej nazwę lub usuwa członka (brak kontroli własności, nie tylko zalogowania)                                                                 | High   | Medium     | PRD Access Control, FR-003; archive `group-create-join-manage`; hot-spot dir `src/pages/api/groups` (10 commits/30d)                                |
| 4   | Streak liczony źle na granicy dnia lub tygodnia: zły spadek, okres policzony dwa razy lub strefa czasowa dzieli użytkowników                                                 | High   | Medium     | interview Q1; PRD Business Logic i Guardrails; roadmap S-04 (niewiadoma wartości spadku); tech-stack („streak liczony przy odczycie")               |
| 5   | Rejestracja i logowanie na produkcji przestają działać (potwierdzenie na `localhost`, link jednorazowy, limit e-maili), a zalew rejestracji blokuje prawdziwych użytkowników | Medium | High       | roadmap S-05 problemy 2–4; hot-spot dirs `src/components/auth` (18 commits/30d), `src/pages/api/auth` (9 commits/30d); archive `signup-error-codes` |
| 6   | API akceptuje żądanie z obcego Origin lub niepoprawne dane (kod zaproszenia, nazwa grupy), bo walidacja jest tylko po stronie klienta                                        | Medium | Medium     | `lessons.md` reguła smoke (granica 403 na obcy Origin); PRD Access Control; hot-spot dir `src/lib` (17 commits/30d)                                 |

Ryzyka 2–4 i 6 pokrywają perspektywę nadużyć (autoryzacja/IDOR, niezaufane
dane wejściowe). Ryzyko 5 obejmuje nadużycie zasobów (zalew e-maili). Wyciek
sekretów/PII nie jest osobnym wierszem: sekrety są tylko po stronie serwera
(`tech-stack.md`, CLAUDE.md), więc tę klasę należy zweryfikować w badaniu
etapu 3, a nie zakładać wiersz bez dowodu.

Natychmiastowość odznaczenia (guardrail PRD) to wymaganie wydajnościowe. Ocenia
się je ręcznie lub obserwowalnością, nie testem, i nie ma wiersza w mapie.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                       | Must challenge                                         | Context `/10x-research` must ground                                                                              | Likely cheapest layer                                                | Anti-pattern to avoid                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | Niezgodność schematu i kodu jest wykrywana przez bramkę przed produkcją, a nie przez użytkownika                                                                                  | „Migracja działa lokalnie, więc produkcja też"         | Jak Workers Builds i CI wyzwalają deploy, kolejność `db push` i deployu, zgodność schematu z generowanymi typami | Bramka CI lub hook (spójność migracji i typów) plus smoke po wydaniu | Bramka sprawdzająca tylko obecność plików migracji; e2e tam, gdzie tani check wystarczy                                                   |
| #2   | Użytkownik spoza grupy A nie odczyta ani nie zmieni danych grupy A przy bezpośrednim zapytaniu do bazy, nie tylko przez UI                                                        | „Dashboard pokazuje tylko moją grupę, więc RLS działa" | Polityki per operacja i rola, tabele objęte RLS, klient użytkownika kontra klucz serwisowy                       | Integracja na lokalnym Supabase z dwoma użytkownikami z różnych grup | Mockowanie Supabase, które wyklucza działanie RLS; oczekiwania spisane z polityk (problem wyroczni)                                       |
| #3   | Tylko twórca grupy może ją usunąć, zmienić nazwę i usunąć członka; każda inna rola dostaje odmowę w API i w bazie                                                                 | „Zalogowany oznacza uprawniony"                        | Kontrola uprawnień w endpointach i w RLS, co egzekwuje klient, a co serwer                                       | Integracja na endpoincie i bazie z rolami twórca/członek/obcy        | Tylko ścieżka pozytywna; asercja kodu statusu bez sprawdzenia, że dane się nie zmieniły                                                   |
| #4   | Streak rośnie o 1 za wykonany okres, spada o część stanu za pominięty (nie zeruje), suma wyznacza ranking; wynik jest poprawny na granicy północy i tygodnia                      | „Test z dzisiejszą datą wystarczy"                     | Reguła spadku z PRD i decyzja o wartości, źródło „dnia" (strefa czasowa), model cykliczności z S-02              | Unit na czystej funkcji reguły z wyrocznią z PRD                     | Oczekiwana wartość skopiowana z kodu; zależność od zegara systemowego zamiast wstrzykniętej daty                                          |
| #5   | Nowy użytkownik rejestruje się, potwierdza e-mail i trafia zalogowany na `/dashboard` na produkcji; powtórne kliknięcie i limit nie blokują innych                                | „Status 200 z rejestracji oznacza udaną rejestrację"   | Konfiguracja Site URL i Redirect URLs, trasa callback (S-05), mapowanie kodów błędów                             | Integracja na mapowaniu błędów plus ręczny smoke produkcyjny         | E2E przeciw prawdziwej poczcie; e2e logowania Google (dostawcy nie da się uruchomić lokalnie: hopy sprawdzają smoke i live check wydania) |
| #6   | Żądanie z obcego Origin jest odrzucane (403); niepoprawne dane są odrzucane z kodem błędu (302 z ?error= na trasach formularzy, 4xx w trybie JSON odznaczania) i nic nie zapisują | „Formularz waliduje, więc serwer nie musi"             | Kto egzekwuje Origin, walidacja po stronie serwera, obsługa kodu zaproszenia w cookie                            | Rozszerzony `npm run smoke` plus unit na regułach walidacji          | Asercja „brak błędu" zamiast zmierzonego skutku; snapshot odpowiedzi                                                                      |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                              | Goal (one line)                                                                                                               | Risks covered | Test types                            | Status   | Change folder                                                             |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- | ------------------------------------------------------------------------- |
| 1   | Runner + data isolation and permissions | Zainicjować runner i lokalną bazę; udowodnić, że obca grupa nie czyta ani nie zmienia danych, a nie-twórca nie zarządza grupą | #2, #3        | integration (RLS + API)               | complete | context/archive/2026-09-30-testing-runner-data-isolation-and-permissions/ |
| 2   | Release ordering gate                   | Udowodnić, że niezgodny schemat i kod są wykrywane przed produkcją                                                            | #1            | CI check, extended smoke              | complete | context/archive/2026-10-15-test-coverage/ (S-10)                          |
| 3   | Auth boundaries and input validation    | Rejestracja i błędy zachowują się poprawnie; API odrzuca obcy Origin i złe dane                                               | #5, #6        | integration, smoke, unit (validation) | complete | context/archive/2026-10-15-test-coverage/ (S-10)                          |
| 4   | Streak rule                             | Udowodnić poprawność reguły streaka na granicach dnia i tygodnia (po S-04 i decyzji o wartości spadku)                        | #4            | unit (pure function)                  | complete | context/archive/2026-10-01-checkoff-and-leaderboard/ (S-04)               |

Kolejność: etap 2 ma ryzyko High × High, ale etap 1 dostarcza runner i lokalną
bazę, z których korzystają kolejne etapy, oraz chroni najbardziej obawiany
obszar (interview Q3). Etap 3 zależy częściowo od S-05 (`/auth/callback`).
Etap 4 dostarczyła zmiana S-04 (`checkoff-and-leaderboard`) razem z regułą
spadku streaka (połowa, w dół). Etapy 2 i 3 dostarczyła zmiana S-10
(`test-coverage`): strażników mechaniki migracji (niezmienność, marker
`-- compat:`, kolejność, świeże typy) dała wcześniej S-12, a S-10 dodała
bramkę `compat` (kod z produkcji kontra nowy schemat, §6.5) i tag `production`.
Nie planuję warstwy AI-native dla aplikacji: tańsze testy deterministyczne dają
ten sam sygnał (zasada #1). Wyjątek to ewaluacja AI-recenzenta (§5, promptfoo
z oceniającym LLM): sprawdza narzędzie CI, nie aplikację. Pierwotnie plan nie
przewidywał też e2e; dołączyło do stosu w S-10 decyzją właściciela z 2026-10-15
(§4, §5, §6.3), z asercjami funkcjonalnymi, bez porównań zrzutów ekranu.

## 4. Stack

Klasyczna baza testów projektu. Rekomendacje opierają się na lokalnych
manifestach i konfiguracji oraz narzędziach dostępnych w bieżącej sesji.

| Layer              | Tool                                  | Version                       | Notes                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint + build       | ESLint + `astro build`                | per `package.json`            | Działa lokalnie i w CI; pre-commit: husky + lint-staged                                                                                                                                                                           |
| HTTP smoke         | `npm run smoke` (`scripts/smoke.mjs`) | n/a                           | Jedyny test zachowania; reguła z `lessons.md`: asercje skutków, nie braku błędów                                                                                                                                                  |
| unit + integration | Vitest                                | 5.0.3 (checked: 2026-09-30)   | `npm test`; testy w `tests/integration/` i `tests/unit/` (czyste reguły), globalny setup w `tests/setup/global-setup.ts`                                                                                                          |
| integration DB     | lokalny stos Supabase (`supabase/`)   | per CLI (checked: 2026-09-30) | Potwierdzone w etapie 1: testy RLS i uprawnień; dodatkowo `npm run test:rls` (scenariusze SQL)                                                                                                                                    |
| e2e                | Playwright Test (`@playwright/test`)  | 1.63.0 (checked: 2026-10-15)  | `npx playwright test`; specyfikacje w `tests/e2e/` (seed, izolacja grup, trzy kluczowe przepływy z S-10); projekty `chromium` i `mobile-chromium` (Pixel 7); w CI job `e2e` (§5). Dołączone decyzją właściciela 2026-10-15 (S-10) |

**Stack grounding tools (current session):**

- Docs: Context7 — not available in current session; checked: 2026-09-30
- Search: Exa.ai — not available in current session (dostępny tylko wbudowany `WebSearch`/`WebFetch`); checked: 2026-09-30
- Runtime/browser: Playwright MCP — not available in current session; not used; checked: 2026-09-30
- Provider/platform: brak MCP dla GitHub, Cloudflare i Supabase; dostępne CLI `gh`, `supabase`, `wrangler` (istotne dla bramek CI etapu 2); checked: 2026-09-30

Baza testów: **Vitest + integracja z lokalnym Supabase** (`tests/`), od etapu 1.
Pliki `*.test.*` w `.claude/` należą do narzędzi skilli, nie do aplikacji.

## 5. Quality Gates

Gate'y, które muszą przejść przed wejściem zmiany na produkcję.
„Required after §3 Phase N" oznacza, że gate jest egzekwowany po wdrożeniu
danego etapu; wcześniej ma status `planned`.

| Gate                                                                | Where                                                          | Required?                                                                                                                                                  | Catches                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| lint + build                                                        | local + CI                                                     | required (wired)                                                                                                                                           | dryf składni i typów                                                                                         |
| smoke                                                               | local + CI                                                     | required (wired)                                                                                                                                           | zepsute podstawowe przepływy HTTP                                                                            |
| unit + integration (RLS, uprawnienia)                               | local + CI (job `integration`)                                 | required (wired)                                                                                                                                           | wyciek między grupami, brak kontroli własności                                                               |
| migration/code consistency check                                    | CI on PR (jobs `integration` i `compat`)                       | required (wired): strażnicy S-12 (niezmienność, marker, kolejność, typy) + job compat (kod z produkcji kontra nowy schemat); oba w rulesecie od 2026-10-16 | kod wymagający schematu, którego produkcja nie ma; migracja, której wdrożony kod nie przeżyje                |
| extended smoke (Origin, walidacja, auth)                            | local + CI                                                     | required (wired)                                                                                                                                           | przyjęcie obcego Origin i złych danych, regresje auth                                                        |
| unit (streak rule)                                                  | local + CI (job `integration`, `npm test`)                     | required (wired)                                                                                                                                           | błędna reguła streaka na granicach okresów                                                                   |
| AI code review (ai-review)                                          | CI on PR                                                       | required (wired)                                                                                                                                           | defekty oceniane przez AI w sześciu kryteriach przeglądu                                                     |
| Ewaluacja AI-recenzenta (promptfoo, `packages/code-reviewer/evals`) | lokalnie, przed zmianą promptu, modelu, narzędzi albo wiązania | ręczna (proces, lekcja)                                                                                                                                    | regresje recenzenta na przypadkach z błędami i wstrzyknięciami oraz fałszywe faile na zaakceptowanych PR-ach |
| e2e (kluczowe przepływy, desktop + telefon)                         | local + CI (job `e2e`)                                         | required (job `e2e`, w rulesecie od 2026-10-16; `release` na nim czeka)                                                                                    | zepsuty przepływ zaproszenia, odznaczania lub ustawień grupy w przeglądarce                                  |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja zostaje wypełniona po
wdrożeniu odpowiedniego etapu; wcześniej brzmi „TBD — see §3 Phase N."

### 6.1 Adding a unit test

- Wzorzec (etap 4): czysta funkcja z wstrzykniętym momentem (`now` jako argument, nigdy `new Date()` w środku) i tabela wyroczni zapisana z PRD i planu w komentarzu na górze pliku, zanim powstała implementacja. Przykłady: `tests/unit/streak-rules.test.ts`, `tests/unit/leaderboard-rules.test.ts`.
- Każda oczekiwana wartość jest wyliczona ręcznie (nie uruchomieniem kodu), testy nazywa się wynikiem, a granice (północ w Warszawie, dni DST, zmiana roku, poniedziałek jako początek tygodnia) mają własne wiersze.
- Stan na poziomie modułu (`src/lib/checkoff-sync.ts`) testuje się z `vi.resetModules()` i dynamicznym importem; czas z `vi.useFakeTimers()`. `vitest.unit.config.ts` (blok `shared`, wspólny dla obu projektów Vitest) ustawia `TZ=America/Los_Angeles`, więc reguła zależna od strefy maszyny zawodzi lokalnie i w CI.
- Reguła z etapu 3 (walidacja): mapowanie kodów błędów GoTrue na kody `?error=` logowania i rejestracji żyje w tabelach wyroczni `tests/unit/auth-errors.test.ts` (wiersze spisane z README i komentarzy modułu, nie z uruchomienia kodu; `email_not_confirmed` nie da się wywołać na lokalnym stosie z auto-potwierdzaniem, więc ta tabela i test komunikatu to jego jedyne pokrycie automatyczne). To, że powrót z linku e-mail nie dotyka cookie zaproszenia, przypina bezcookie'owy kontekst `tests/integration/auth-callback.test.ts`: każde wywołanie cookie rzuciłoby błąd i oblałoby przypadek sukcesu.
- Testy mutacyjne (etap 3, faza 5 S-10): `npm run test:mutation` uruchamia Strykera na projekcie unit (`vitest.unit.config.ts` nie ma globalnego setupu, więc stos Supabase może być zatrzymany); zawężaj do modułu lub zakresu linii bieżącej zmiany: `npm run test:mutation -- --mutate src/lib/<moduł>.ts` albo `-- --mutate "src/lib/<moduł>.ts:13-18"`, zawsze z `--logLevel info` (`--logLevel debug` wywala runner na Vitest 5). Raport `reports/mutation/mutation.json` (gitignore) czytaj zaraz po biegu, bo kolejny go nadpisuje; zanim uwierzysz wynikowi, sprawdź `testsCompleted` każdego mutanta runtime: wartość 0 przy statusie `Survived` oznacza, że żaden test nie dobiegł (błąd narzędzia albo mutant statyczny, który wywala moduł przy imporcie lub plik testowy przy kolekcji; wtedy Stryker zgłasza „przeżył" zamiast „zabity", a `testsCompleted` liczy tylko testy innych plików). Linia bazowa wszystkich 14 modułów z werdyktem dla każdego przeżywającego mutanta (`equivalent`, `unobservable`, `import-time throw`, `fixed by <test>`) jest w `context/foundation/mutation-baseline.md`. Reguła ponownego pomiaru: gdy zmienia się reguła modułu albo jego plik testowy, uruchom mutację tego modułu ponownie, porównaj z wierszem linii bazowej i potraktuj niższy wynik jak znalezisko przeglądu do wyjaśnienia (nowy mutant równoważny to wyjaśnienie, nowy zabijalny przeżywający to słaby test). Asercję dodaj tylko za mutanta, którego zauważyłby użytkownik lub biznes (zły streak, ranking, okres, kod błędu, cel przekierowania, komunikat, przyjęte błędne wejście), z wartością oczekiwaną spisaną z PRD, README lub komentarza modułu, nigdy z wyjścia mutanta; nie goń za progiem.

### 6.2 Adding an integration test

- Wzorzec (etap 1): dwóch lub więcej użytkowników z różnych grup, odmowa dostępu do cudzych danych i brak zmiany stanu. Przykład: `tests/integration/group-isolation.test.ts`.
- Użytkowników tworzy `createTestUser()` z `tests/helpers/supabase.ts` (admin `createUser` + logowanie kluczem anon, więc zapytania idą przez RLS). Grupę zakłada `createGroupAs(user, name)`, dołącza `joinGroupAs(user, code)`. Sprzątanie robią hooki `afterEach`/`afterAll` z helpera.
- Każda odmowa ma parę: pozytywną kontrolę (członek widzi swoją grupę) w tym samym pliku, inaczej „0 wierszy" może znaczyć zepsuty test, a nie działające RLS.
- Oczekiwania wynikają z PRD (Access Control, FR-003), nie z polityk w migracjach (problem wyroczni).
- Reguła: po każdej odmowie asertuj liczbę dotkniętych wierszy (`.select()` po `update`/`delete` zwraca `[]`) i odczytaj stan ponownie przez `adminClient()` (omija RLS), np. `adminGroupA()` i `adminMemberIdsOfA()`.

### 6.3 Adding an e2e test

- Uruchom `/10x-e2e` dla fazy planu, która nazywa ryzyko z §2 wymagające przeglądarki (funkcja już zbudowana); inne ryzyka idą do `/10x-tdd` lub `/10x-implement`.
- Kopiuj wzorzec seeda `tests/e2e/seed.spec.ts`: lokatory po roli i etykiecie (`getByRole`, `getByLabel`), własne persony z `tests/e2e/local-supabase.ts` (`createPersona`, `createGroupAs`, `joinGroupAs`; spec, który tworzy konto przez formularz, usuwa je przez `deleteAccountsByEmail`), czekanie na stan (URL, widoczny tekst, `waitForHydration` przed wpisywaniem do wyspy React), a sprzątanie w `afterEach` rzuca błąd zamiast przemilczeć brak wiersza.
- Jeden test na plik, nazwany ryzykiem (`risk #N: …`) w komentarzu na górze; każdy spec biegnie w obu projektach (`chromium` i `mobile-chromium`), więc asercje są funkcjonalne i niezależne od szerokości ekranu. Wyjątek: kontrakt układu (strona i opakowanie siatki nie przewijają się poziomo, S-20), który każdy projekt sprawdza przy własnej szerokości.
- Przed commitem celowo zepsuj przepływ (np. zmień etykietę przycisku lub trasę) i zobacz czerwony wynik, potem przywróć. Bez porównań zrzutów ekranu (§7).
- Komendy: `npx playwright test tests/e2e/<name>.spec.ts` (jeden spec), `npx playwright test` (cały zestaw), `npx playwright test --project=mobile-chromium` (sam telefon); konto seeda z `.env` lub `node scripts/e2e-user.mjs` (README, Tests).

### 6.4 Adding a test for a new API endpoint

- Etap 1 (uprawnienia): odmowa dla roli członek i nie-członek, wzorzec w `tests/integration/group-permissions.test.ts`. Trzy role (twórca, członek, obcy) wykonują tę samą operację; twórca ma pozytywną kontrolę, pozostali dostają odmowę.
- Każda odmowa kończy się `expectGaUntouched()`: odczyt nazwy, właściciela, kodu i członków przez `adminClient()`, a nie samą asercją kodu statusu lub braku błędu.
- Operacje idą bezpośrednio przez klienta użytkownika (`from("groups").update/delete`, `rpc`), czyli tą samą granicą RLS, którą egzekwują endpointy `/api/groups/*`.
- Etap 3 (obcy Origin, złe dane), wzorzec w `scripts/smoke.mjs`: każda trasa mutująca ma cztery kroki. (1) Krok z obcego Origin (`origin: FOREIGN_ORIGIN`) z nieszkodliwym ciałem (puste pole, zły kod, złe hasło, zajęty adres), tak aby nic się nie zmieniło nawet przy wyłączonej kontroli, oczekiwane 403; komentarz kroku mówi, dlaczego ciało jest nieszkodliwe, a `setCookieExcludes` dowodzi, że handler nie ruszył (brak cookie `auth_email`, `join_code`, `sb-`). (2) Krok GET na tej samej trasie, oczekiwane 404 (zalogowana sesja na trasach chronionych, bo anonimowy GET dostaje 302 z middleware). (3) Odczyt stanu po odrzuconym zapisie: następny krok czyta dashboard i asertuje, że nazwa, członkostwo lub zadanie są nietknięte, nie tylko kod statusu. (4) Krok niereflektowania `?error=`: obca wartość (`__proto__`, zmyślony kod) renderuje stronę bez `role="alert"` i bez wartości w markupie (poza `<script>`, bo runtime wysp Astro zawiera literal `__proto__`), obok kroku z poprawnym kodem jako kontroli pozytywnej.

### 6.5 Adding a test for a schema or migration change

- Write a compatible migration: the schema ships before the code and never rolls back, so a new migration must work with the deployed code. Add tables and columns first; remove, rename, drop a policy or revoke a privilege only in a later release, once no deployed code depends on it, and say how the deployed code keeps working in one `-- compat: <text>` line of that migration (the guard requires the line for a destructive migration; it proves nothing, the author does). Never edit, rename or delete a merged migration: undo its effect in a new one. Name the file with a timestamp newer than every merged migration.
- Commands, locally with the stack up: `npm run guard:migrations` (against `origin/master`; `-- --base <ref>` for another base), `npx supabase db reset` to apply the new file, `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts` and `npm run types:check` (it must print nothing), then `npm test` and `npm run test:rls`. The `integration` job runs the guard (on a PR) and the types check before the tests. When a merged file really has to change, `node scripts/migration-guard.mjs --entry supabase/migrations/<file>` prints the allowlist line for `supabase/checks/migration-edit-allowlist.txt` (replace `<reason>` with at least 20 characters). Unit tests for the guard's rules: `tests/unit/migration-guard.test.ts`.
- The release compatibility gate (§3 Phase 2, S-10): the `compat` job in `.github/workflows/ci.yml` runs on every PR that touches `supabase/migrations/` (the `changes` job's `migrations` output; the job is skipped on other PRs and runs when `changes` cannot tell). It checks out the commit the `production` tag points at into `deployed/`, starts the local stack from the PR checkout (so the PR's migrations are the schema), builds the deployed commit and runs that commit's own `npm run smoke` against its production preview. The `release` job moves the tag after every successful deploy; after a `wrangler rollback` the owner moves it by hand (README, Rollback). A missing tag fails the job with "no production tag: create it at the deployed commit"; it never skips.
- When `compat` is red: the deployed code does not survive the new schema in the interval between `db push` and `wrangler deploy`, or after a code rollback. Do not weaken the smoke of the deployed commit (it is frozen at the tag) and do not edit the gate; split the migration: the additive part (new table, column, policy, function) in this PR, the destructive part (drop, rename, policy change, revoke) in a later release, once the deployed code no longer depends on it, with its `-- compat:` line. A red run on a PR whose code change the smoke of the deployed commit cannot know about (a new route it does not call) is not possible: the gate runs the old smoke against the old code, only the schema is new.
- Before relying on the gate for a real migration, see it both red and green once: the two scratch PRs of S-10 Phase 6 (a `drop column` the deployed code reads, then an additive migration) are the pattern.

### 6.6 Per-rollout-phase notes

(Opcjonalnie. Po każdym etapie `/10x-implement` dopisuje 2–3 linie o tym, co
zaskoczyło.)

**Etap 2 (bramka zgodności wydania, S-10 `test-coverage`, faza 6, 2026-10-16):**

- `master` nie jest tym, co działa na produkcji: każdy run `release` od 2026-10-12 do 2026-10-15 był anulowany przez grupę współbieżności albo czekał na zatwierdzenie, więc wdrożony commit odstawał od `master` o kilkanaście PR-ów. Stąd tag `production` przesuwany przez job `release`, a nie porównanie z `master`; commit z planowania (`30c01bb`) był już nieaktualny w dniu utworzenia tagu (`fb62d74`, run 38796422365).
- Bramka buduje stary kod i uruchamia jego własny smoke (zamrożony razem z tagiem), więc nowy krok smoke w PR nic tu nie zmienia; zmienia się tylko schemat. Job nigdy nie pomija braku tagu: bez tagu jest czerwony z komunikatem, bo pominięcie liczyłoby się jako zaliczony required check.

**Etap 3, faza 5 (linia bazowa mutacji, S-10 `test-coverage`, 2026-10-16):**

- Pierwszy pomiar 14 modułów reguł i mapowań dał 673 mutanty i wynik 94,35 % po przeglądzie (`context/foundation/mutation-baseline.md`); siedem asercji w pięciu plikach `tests/unit/` zabiło 25 mutantów, które zauważyłby użytkownik (puste komunikaty logowania i rejestracji, etykiety cykliczności, nazwa cookie zaproszenia, dwa kody „sesja wygasła" i każdy kodowany błąd 4xx zgłaszany zamiast przemilczany, kolejność dwóch członków bez e-maila). Reszta przeżywających (37) to mutanty równoważne lub nieobserwowalne, głównie w `streak-rules`: `Object.hasOwn(..., null)`, skróty w `decayStreak` i flaga „już posortowane".
- Zaskoczenie: mutant statyczny, który wywala moduł przy imporcie (`Intl.DateTimeFormat` z pustą strefą) albo plik testowy przy kolekcji (`groupPeriodsByEnrolment` wołane w ciele `describe`), figuruje w raporcie jako `Survived`, nie jako błąd, a `testsCompleted` ma 0 albo liczbę testów innych plików. Stąd kontrola `testsCompleted` w §6.1 przed zaufaniem wynikowi. Mutant usuwający `controller.abort()` w `checkoff-client` kończy się statusem `Timeout` (test z fałszywym zegarem nigdy się nie kończy): to wykrycie, nie przeżycie.

**Etap 3 (granice auth i walidacja, S-10 `test-coverage`, 2026-10-15):**

- Badanie zastało granicę w większości gotową (11 z 17 tras POST miało krok z obcego Origin); etap dopisał brakujące 6 kroków 403 (signin, signup, signout, join, rename, leave), 8 kroków GET 404 i 2 kroki niereflektowania `?error=` na dashboardzie (227 → 243 kroków smoke) oraz tabele wyroczni dwóch mapperów auth w `tests/unit/auth-errors.test.ts`.
- Zaskoczenie: `__proto__` jest w każdej stronie z wyspami (runtime Astro wymienia go jako klucz zakazany), więc kontrola niereflektowania tej jednej wartości omija elementy `<script>` (zwykły substring nigdy by nie przeszedł); zmyślony kod jest sprawdzany w całym ciele odpowiedzi, skrypty włącznie.
- Backport do §2: wiersz #6 opisuje odrzucenie złych danych kodem błędu (302 z `?error=` na trasach formularzy, 4xx tylko w trybie JSON), bo tak zachowują się trasy; wiersz #5 nazywa e2e logowania Google antywzorcem (dostawca nie działa lokalnie).

**Etap 4 (reguła streaka, S-04):**

- Dzień liczy się wg daty w Europe/Warsaw, nie UTC: poniedziałek 00:30 w Warszawie to jeszcze niedziela w UTC, a dni DST mają 23 i 25 godzin. Dlatego tabela oracle ma osobne wiersze dla granicy dnia, dni DST i poniedziałku 00:30.
- Sprawdzenie mutacyjne (zepsuć kod, zobaczyć czerwony wynik, przywrócić z kopii) wykryło test wejścia `applyDeltas`, który początkowo nie rozróżniał mutacji wejścia od kopii (przegląd fazy 5, F6).
- Natychmiastowość odznaczenia pozostaje ocenianą ręcznie i obserwowalnością (§7); testy pokrywają protokół (`checkoff-client`) i sumy (`checkoff-sync`), nie wrażenie opóźnienia.

**Etap 1 (runner + izolacja + uprawnienia):**

- Odrzucone `UPDATE`/`DELETE` przez RLS nie zwracają błędu, tylko 0 wierszy; naruszenie uprawnień do kolumn daje SQLSTATE `42501`. Dlatego asertuj liczbę wierszy i stan z `adminClient()`.
- Kolejność sprzątania: najpierw grupy, potem użytkownicy (`ON DELETE RESTRICT` na właścicielu). Jeden użytkownik może mieć jedną grupę, więc grupy są per test (`beforeEach`), a użytkownicy per plik (`beforeAll`).
- Sprawdzenie mutacyjne: osłabić politykę (`alter policy ...`), uruchomić `npm test` i zobaczyć czerwony wynik, potem przywrócić schemat przez `npx supabase db reset`.

## 7. What We Deliberately Don't Test

Wyłączenia uzgodnione podczas wywiadu (Q5). Przyszli współtwórcy powinni je
respektować, dopóki nie zmieni się założenie.

- **Wygląd UI i snapshoty komponentów** — ciągle się zmieniają i dają mały sygnał. Re-evaluated 2026-10-15 (S-10, po design systemie S-11): wygląd pozostaje wyłączony. Bramką wyglądu jest kitchen sink `/dev/dashboard-kitchen-sink` i `scripts/ui-screenshots.mjs` oglądane przez człowieka; e2e (§6.3) asertuje funkcję (role, etykiety, stan po akcji), bez `toHaveScreenshot`. Re-evaluate, jeśli regresja wizualna dotrze na produkcję. (Source: Phase 2 interview Q5; S-10 plan.)
- **E2E logowania Google** — dostawcy nie da się uruchomić lokalnie; hopy sprawdzają smoke (trasa startowa i powrotna) i live check joba `release` (302 do Supabase, 302 do `accounts.google.com`), a pełny przepływ właściciel sprawdza na produkcji. Re-evaluate, jeśli Supabase lub Google udostępnią lokalny dostawca testowy. (Source: §2 wiersz #5; S-10 research.)
- **Potwierdzenie e-mail na produkcji** — wymaga prawdziwej skrzynki i jednorazowego linku; lokalny stos auto-potwierdza, a `/auth/callback` pokrywają testy integracyjne i smoke. Pozostaje ręcznym sprawdzeniem właściciela przy zmianie adresu lub SMTP. (Source: §2 wiersz #5; README, Production auth settings.)
- **Limity hostowanego Auth i captcha pod prawdziwym zalewem** — konfiguracja żyje tylko w dashboardzie Supabase, więc test nie ma jej skąd odczytać; testowane jest wyłącznie mapowanie odpowiedzi 429 (`over_email_send_rate_limit`, `over_request_rate_limit`) na komunikaty (`tests/unit/auth-errors.test.ts`), a wartości limitów i stan captcha właściciel odczytuje z dashboardu (zapis w `context/changes/deployment/deployment-plan.md`, etap 16). Re-evaluate, jeśli zalew rejestracji zablokuje prawdziwych użytkowników. (Source: §2 wiersz #5; S-10 plan, faza 4.)
- **Anti-cheat odznaczania tasków** — poza zakresem PRD (Non-Goals), system opiera się na zaufaniu w gronie znajomych. Re-evaluate, jeśli grupy przestaną być zaufanym gronem. (Source: PRD Non-Goals.)
- **Natychmiastowość odznaczenia** — wymaganie wydajnościowe, oceniane ręcznie lub obserwowalnością, nie testem. Re-evaluate, jeśli pojawi się skarga na opóźnienie. (Source: brief Phase 3, challenger findings.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-15 (etapy 1–4 wdrożone; §3 i §5 zamknięte w S-10 `test-coverage`; notatki §6.6 faz 5–6 i linia bazowa mutacji z 2026-10-16)
- §4 (wiersz e2e), §5 (gate e2e) i §7 edited 2026-10-15 on the owner's instruction in S-10 (`test-coverage`): e2e dołączone do stosu i bramek, §6.3 wypełnione, §6.5 opisuje bramkę `compat`; 2026-10-16: §3 (ścieżka archiwum, wiersze 2 i 3) i §5 (wiersze e2e i compat po zmianie rulesetu) zaktualizowane
- 2026-10-16, S-14 (`nickname`, faza 1): nowe testy bez zmiany strategii — brama nicka w middleware (`tests/integration/middleware.test.ts`, przekierowanie na `/account/nickname`, wyjątki strony i trasy nicka, 503 `nickname.lookup.failed`), trasa `account/nickname` w sieci charakteryzacyjnej (`tests/integration/data-routes.test.ts`, strażnik pokrycia: rodziny `account`, `groups`, `tasks`, 14 plików), kontrakt reguły nicka TS↔DB (`tests/integration/rule-contracts.test.ts`) i zachowanie bazy (`tests/integration/nicknames.test.ts`), testy jednostkowe reguł, błędów, podpowiedzi i remisu po nicku, sekcja RLS „S-14: nicknames" (`supabase/checks/rls-scenarios.sql`), kroki smoke (brama jako wynik, stan po każdym odrzuconym zapisie, zero cudzych adresów e-mail w HTML) i e2e (rejestracja przez UI przechodzi stronę nicka z oczekującym zaproszeniem; persony i konto seed z nickiem)
- 2026-10-17, `code-review-evals`: §5 dostaje wiersz „Ewaluacja AI-recenzenta (promptfoo, `packages/code-reviewer/evals`)", bramkę ręczną (proces, nie check CI), którą wiąże lekcja „Run the eval suite, old against new, before shipping a reviewer change" (`context/foundation/lessons.md`); §3 i linia AI-native niżej nazywają ją wyjątkiem: sprawdza narzędzie CI, nie aplikację
- Stack versions last verified: 2026-10-15 (Vitest 5.0.3, Playwright Test 1.63.0, Stryker 10.0.0 z łatką separatora nazw testów, Supabase CLI 2.117.0 w CI)
- AI-native tool references last verified: 2026-10-17 (dla aplikacji brak; ewaluacja AI-recenzenta w §5 używa promptfoo 0.124.1)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
