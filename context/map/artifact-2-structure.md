# Artifact 2 — Struktura zależności

Stan na: 2026-10-05, HEAD `d03c673`. Wejście: `context/map/artifact-1-territory.md`.

## Metoda i jej ograniczenia

- Narzędzie: `dependency-cruiser` 18.5.0 (zainstalowany w repo, bez zmian w repo). Użyłem tymczasowej konfiguracji ze scratchpada. Plik `.dependency-cruiser.*` ani skrypt npm nie zostały dodane.
- Zakres: `src`, `tests`, `scripts`, `astro.config.mjs`, `vitest.config.ts`, `playwright.config.ts`. Wykluczone: `node_modules`, `dist`, `.astro`, `playwright-report`, `test-results`, `reports`, `context`, `public`.
- Ustawienia: `tsPreCompilationDeps: true`, `--ts-config tsconfig.json` (alias `@/*` → `src/*` rozwiązuje się poprawnie), 144 moduły.
- **Luka narzędzia:** dependency-cruiser nie parsuje `.astro`. Widział 11 plików `.astro` jako węzły z **0** zależnościami. Uzupełniłem to własnym skryptem: wyciąga `import ... from` z frontmattera `.astro` i rozwiązuje `@/` oraz ścieżki względne. Krawędzie z `.astro` pochodzą więc z regexu, nie z parsera. Regex mógł pominąć importy dynamiczne albo wielolinijkowe w nietypowym formacie.
- Podział na runtime i type-only opiera się na `dependencyTypes` z dependency-cruiser (`type-only` = `import type`). Zwykły `import` używany tylko jako typ liczy się jako runtime, więc runtime jest lekko przeszacowany.

Wynik: 261 krawędzi między plikami repo, z czego 243 runtime i 18 type-only. Nie rysuję pełnego grafu, bo byłby nieczytelny. Dalej są tabele i grafy per-warstwa.

### Rozdzielenie kategorii

| Kategoria        | Co obejmuje                                                             | Traktowanie               |
| ---------------- | ----------------------------------------------------------------------- | ------------------------- |
| Runtime produktu | `src/**`                                                                | Główny przedmiot analizy  |
| Typy             | `import type`, `src/types.ts` (generowany z bazy, nie edytować ręcznie) | Osobna kolumna / sekcja   |
| Test i tooling   | `tests/**`, `scripts/**`, `*.config.*`                                  | Liczony osobno (sekcja 7) |
| Build            | `dist/` (gitignorowany, zawiera `client/` i `server/`), `.astro/`       | **Wykluczony z analizy**  |
| Wygenerowany     | `src/types.ts`                                                          | Tylko jako cel type-only  |

Dowód dla `dist`: `git check-ignore dist .astro reports playwright-report test-results` zwraca wszystkie. Dowód dla `src/types.ts`: `git ls-files` go śledzi, a nagłówek to wygenerowany `Database`.

---

## 1. Entry pointy

Moduły bez żadnego importującego w `src/` (czyli punkty wejścia wskazywane przez router lub framework, nie przez kod):

| Typ                                     | Pliki                                                                                                         | Liczba |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -----: |
| Endpointy API (`export const POST/GET`) | `src/pages/api/{auth,groups,tasks}/*.ts`                                                                      |     16 |
| Strony                                  | `index.astro`, `dashboard.astro`, `auth/{signin,signup,confirm-email}.astro`, `dev/signin-kitchen-sink.astro` |      6 |
| Trasy `.ts` poza `api/`                 | `src/pages/auth/callback.ts`, `src/pages/join/[code].ts`                                                      |      2 |
| Middleware                              | `src/middleware.ts` (ładowany przez Astro; importuje go tylko test)                                           |      1 |
| Inne                                    | `src/env.d.ts`, `src/components/ui/LibBadge.astro`                                                            |      2 |

Dowód: węzły bez krawędzi przychodzących w grafie (lista `NO-INCOMING`). `middleware.ts` ma importującego tylko w `tests/integration/middleware.test.ts`.

**Wnioski:**

- Aplikacja ma 16 endpointów API plus 2 trasy `.ts` w `pages/`. Wszystkie są liśćmi (nikt ich nie importuje poza testami integracyjnymi).
- `src/pages/auth/callback.ts` istnieje w repo, ale `CLAUDE.md` nie wymienia go przy opisie plików (wymienia tylko `signin`, `signup` i `confirm-email` w `src/pages/auth/`). To rozjazd dokumentacji z kodem.
- `LibBadge.astro` (`src/components/ui`) nie ma importujących. To martwy kod albo kandydat do usunięcia (unknown: może być używany tylko przez dev).

## 2. Kierunki zależności (warstwy)

Macierz importów runtime wewnątrz `src/` (źródło → cel):

| Źródło → cel                                                                     | Krawędzie |
| -------------------------------------------------------------------------------- | --------: |
| `pages/api` → `lib`                                                              |        76 |
| `components` → `components`                                                      |        23 |
| `components` → `ui-kit`                                                          |        17 |
| `pages` (widoki) → `lib`                                                         |        15 |
| `lib` → `lib`                                                                    |        14 |
| `pages` → `components`                                                           |        13 |
| `components` → `lib`                                                             |        10 |
| `components` → `hooks`                                                           |         9 |
| `pages` → `ui-kit`                                                               |         7 |
| `ui-kit` → `lib` (tylko `utils.ts`)                                              |         6 |
| `pages` → `layouts`                                                              |         6 |
| `middleware` → `lib`                                                             |         4 |
| inne (`hooks`→`lib`, `layouts`→`components`, `layouts`→`lib`, `ui-kit`→`ui-kit`) |      po 1 |

Type-only: `lib`→`lib` 9, `components`→`lib` 1, `lib`→`src/types.ts` 1.

Dowód: grupowanie krawędzi po warstwie ze ścieżki.

**Wniosek: kierunek jest czysty i jednostronny.** `pages`/`api` → `components` → `lib`. Nie ma żadnej krawędzi `lib` → `components`, `lib` → `pages` ani `components` → `pages`/`api` (sprawdzone zapytaniem `LIB->non-lib` = pusty wynik oraz `COMP->pages/api` = pusty).

## 3. Lokalne centra (fan-in / fan-out)

### Fan-in (kto jest najczęściej importowany, runtime)

| Plik                                                    | Importujących | Uwagi                                                                            |
| ------------------------------------------------------- | ------------: | -------------------------------------------------------------------------------- |
| `src/lib/supabase.ts`                                   |            24 | 16 endpointów API, `middleware`, `dashboard.astro`, `auth/callback.ts`, 5 testów |
| `src/lib/log.ts`                                        |            19 | raportowanie błędów (Sentry)                                                     |
| `src/lib/group-rules.ts`                                |            15 | reguły grup, dzielone przez klienta i serwer                                     |
| `src/components/ui/button.tsx`                          |            11 | shadcn                                                                           |
| `src/components/auth/FormField.tsx`, `SubmitButton.tsx` |          po 8 | formularze auth                                                                  |
| `src/components/hooks/useFormSubmitting.ts`             |             8 |                                                                                  |
| `src/lib/task-rules.ts`, `tasks.ts`, `group-errors.ts`  |          po 8 |                                                                                  |
| `tests/helpers/supabase.ts`                             |             8 | centrum testów integracyjnych                                                    |

Type-only fan-in: `src/lib/supabase.ts` 6, `task-rules.ts` 4, `src/types.ts` 3 (`supabase.ts`, `tests/helpers/supabase.ts`, `tests/e2e/local-supabase.ts`).

### Fan-out (kto importuje najwięcej, runtime)

| Plik                                               | Zależności |
| -------------------------------------------------- | ---------: |
| `src/pages/dashboard.astro`                        |         22 |
| `src/components/dev/SignInStates.tsx`              |          8 |
| `src/components/auth/SignUpForm.tsx`               |          6 |
| `src/pages/api/tasks/{checkoff,uncheck,update}.ts` |       po 6 |
| `src/pages/auth/{signin,signup}.astro`             |       po 6 |

Dowód: zliczenie krawędzi wychodzących i przychodzących.

**Wnioski:**

- **`src/lib/supabase.ts` to największe centrum.** Każdy endpoint API tworzy klienta Supabase sam, bezpośrednio (16 z 16 plików API importuje `supabase.ts`). Zmiana jego kontraktu dotyka 24 plików. Powtarza się to z artefaktem 1: `supabase.ts` to jedno z miejsc przekrojowych.
- **`dashboard.astro` to największy hub wyjścia (22 zależności, 455 linii)** i było też jednym z najczęściej zmienianych plików produktu (12 commitów, artefakt 1). To wskazuje na ryzykowny, nadmiernie skupiony widok.
- Dwa najczęściej importowane moduły domenowe (`group-rules.ts`, `task-rules.ts`) to czyste reguły bez zależności zewnętrznych, więc centrum jest stabilne.

## 4. Cykle importów

- Cykle runtime: **0**.
- Cykle ze wszystkimi krawędziami (z type-only): **0**.
- Reguła `no-circular` w dependency-cruiser: 0 naruszeń.

Dowód: SCC (algorytm Tarjana) na grafie z krawędziami z dependency-cruiser i z regexu `.astro` oraz własna reguła `no-circular` w konfiguracji tymczasowej.

**Unknown:** cykle przez importy dynamiczne, przez `astro:*`/`cloudflare:workers` (moduły wirtualne, nierozwiązane przez narzędzie) i przez referencje poza importami (np. wywołania po URL, patrz sekcja 6) są poza zasięgiem tej analizy.

## 5. Podejrzane przekroczenia granic warstw

Sprawdzone reguły i wyniki:

| Reguła                                                                       | Wynik                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib` nie importuje `components`/`pages`                                     | OK (0)                                                                                                                                                                                                                                       |
| `components` nie importuje `pages`/`api`                                     | OK (0)                                                                                                                                                                                                                                       |
| Wyspy React (`components`, `hooks`) nie sięgają do modułów tylko-serwerowych | OK. Domknięcie z `components` obejmuje 8 modułów `lib`: `auth-rules`, `checkoff-client`, `checkoff-sync`, `group-rules`, `leaderboard-rules`, `streak-rules`, `task-rules`, `utils`. Żaden nie jest serwerowy (`supabase`, `log`, `sentry`). |
| Moduły współdzielone z klientem nie mają zależności serwerowych              | OK. Ich importy zewnętrzne: tylko `clsx` i `tailwind-merge` w `utils.ts`. Pliki `group-rules`, `task-rules` i `leaderboard-rules` mają w komentarzu zapis „no `astro:env/server`, no Supabase client".                                       |
| Endpointy API używają warstwy `lib/*` do dostępu do danych                   | Częściowo (patrz niżej)                                                                                                                                                                                                                      |

Dowód: domknięcie przechodnie importów z `src/components/**/*.{ts,tsx}` po krawędziach runtime. Pliki `src/lib/*-rules.ts` i `checkoff-client.ts` zawierają komentarze o zakazie zależności serwerowych. Dodatkowo `grep` po `astro:` w tych plikach trafia wyłącznie w komentarze.

### Podejrzane miejsca

1. **Strony i endpointy tworzą klienta Supabase same.** 16 z 16 tras API, `dashboard.astro`, `auth/callback.ts` i `middleware.ts` importują `src/lib/supabase.ts`. Dostęp do danych jest rozproszony między `lib/{groups,tasks,checkoffs}.ts` (używane przez 12 plików API i dashboard) a bezpośrednimi wywołaniami w trasach. Nie ma jednej wąskiej warstwy dostępu do bazy. Czy któryś endpoint omija `lib/*` i wykonuje zapytania inline? Nie sprawdzałem treści (unknown).
2. **`src/lib/checkoff-response.ts` importuje typ `APIContext` z `astro`** (`import type`). Moduł `lib` zależy więc od frameworka, choć tylko typowo. To jedyne takie przypadki w `lib` poza `supabase.ts` i `config-status.ts` (oba z `astro:env/server`).
3. **`src/lib/checkoffs.ts` łączy trzy warstwy:** reguły (`streak-rules`), dostęp do danych (`tasks.ts`, typ `supabase`) i raportowanie (`log.ts`). To najgłębszy łańcuch w `lib` (`checkoffs` → `tasks` → `task-rules` → `group-rules`).
4. **Wyspy React z logiką domenową:** komponenty importują reguły domenowe z `lib` (`task-rules`, `group-rules`, `streak-rules`, `leaderboard-rules`). To zamierzone współdzielenie walidacji i obliczeń z serwerem, ale znaczy, że zmiana reguły rusza jednocześnie bundle klienta i serwer (patrz sekcja 6).

**Unknown:** analiza statyczna nie widzi, czy reguły w komponencie i na serwerze są wywoływane spójnie (np. czy serwer powtarza każdą walidację klienta).

## 6. Zależności między kontraktami, frontendem i backendem

### 6a. Kontrakt wspólny (kod współdzielony)

Moduły `*-rules.ts` i `checkoff-client.ts` są importowane i przez wyspy React (frontend), i przez endpointy lub strony serwerowe (backend), np.:

- `group-rules.ts`: `CreateGroupForm`, `JoinGroupForm`, `RenameGroupForm` (klient) oraz `task-rules.ts` i `join-code.ts` (serwer),
- `task-rules.ts`: `CreateTaskForm`, `EditTaskForm` (klient), `tasks.ts` i `dashboard.astro` (serwer),
- `streak-rules.ts`, `leaderboard-rules.ts`: `CheckoffControl`, `Leaderboard` (klient) oraz `checkoffs.ts` (serwer),
- `auth-rules.ts`: `SignUpForm` (klient), `auth-errors.ts` (serwer).

To najsilniejsza, jawna więź front↔back w repo.

### 6b. Kontrakt przez URL (niewidoczny w grafie importów)

Komponenty i strony wywołują endpointy po ścieżce tekstowej (np. `CreateGroupForm` → `/api/groups/create`, `JoinGroupForm` → `/api/groups/join`, `RenameGroupForm` → `/api/groups/rename`, `CheckoffControl` → `/api/tasks/checkoff` i `/api/tasks/uncheck`, `CreateTaskForm` → `/api/tasks/create`, `EditTaskForm` → `/api/tasks/update`; `dashboard.astro` ma formularze do `delete/join/leave/remove-member`). Kontrakt jest tylko napisem. Zmiana nazwy trasy albo kształtu odpowiedzi nie jest wykrywana przez TypeScript ani przez dependency-cruiser.

Dowód: `grep` po `fetch(`, `action=` i `href=` w `src/`. Ścieżki wyciągnięte regexem, więc lista nie jest gwarantowana jako pełna.

Dodatkowo `PROTECTED_ROUTES = ["/dashboard", "/api/groups", "/api/tasks"]` w `src/middleware.ts` to kolejny kontrakt oparty na prefiksach napisów: nowa trasa poza tymi prefiksami (np. `/api/auth/*` albo `/api/...` pod inną nazwą) nie jest chroniona.

### 6c. Kontrakt danych (baza → typy)

`src/types.ts` (generowany z lokalnej bazy, nie edytować ręcznie) ma tylko 3 importujących (`supabase.ts`, `tests/helpers/supabase.ts`, `tests/e2e/local-supabase.ts`). Reszta `lib` dostaje typy bazy pośrednio przez typ klienta z `supabase.ts` (type-only, 6 importujących). Zmiana schematu w `supabase/migrations/` propaguje się więc przez jeden punkt (`supabase.ts`).

Migracje (`supabase/migrations/`) nie mają krawędzi importu do kodu. Spójność schematu z `lib` weryfikują dopiero testy integracyjne i `supabase/checks/rls-scenarios.sql`.

**Unknown:** schemat bazy (tabele, polityki RLS, widok `task_checkoff_periods`, triggery) jest w SQL, którego dependency-cruiser nie analizuje. Nie wiem, które moduły `lib` zależą od których tabel i funkcji RPC.

## 7. Ryzyka testowania w izolacji

### 7a. Test i tooling (osobno od produktu)

| Katalog             | Importuje z `src`                                   | Uwagi                                                                                                                                                       |
| ------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit`        | `lib` (11 krawędzi)                                 | Moduły: `task-rules`, `auth-state`, `checkoff-client`, `checkoff-sync`, `checkoffs`, `leaderboard-rules`, `log`, `redact`, `sentry-options`, `streak-rules` |
| `tests/integration` | `lib` (8), `api` (3), `pages` (1), `middleware` (1) | Wymagają lokalnego Supabase; `vitest.config.ts` ma `globalSetup`, a `npm test` zakłada działający stack                                                     |
| `tests/e2e`         | typ z `src/types.ts`                                | Playwright, osobny runner                                                                                                                                   |
| `scripts/smoke.mjs` | brak importów                                       | Test dymny poza grafem (sterowany HTTP, nie importami)                                                                                                      |

Dowód: krawędzie runtime z `tests/` i `scripts/`.

### 7b. Ryzyka

1. **Testy integracyjne uruchamiają realne handlery z prawdziwym `supabase.ts`.** 5 testów importuje `src/lib/supabase.ts`, a `middleware.test.ts` import `src/middleware.ts`. `supabase.ts` zależy od `astro:env/server` (moduł wirtualny Astro, `couldNotResolve` w dependency-cruiser), więc izolowanie handlerów wymaga mockowania tego modułu (unknown: jak to jest zrobione w testach, nie czytałem ich).
2. **Dwa moduły z zależnością od runtime Cloudflare/Sentry:** `src/lib/sentry.ts` (`cloudflare:workers`, `@sentry/cloudflare`) i `src/lib/log.ts` (`@sentry/cloudflare`, 19 importujących, w tym `checkoffs.ts`). `log.ts` ma test jednostkowy, `sentry.ts` nie ma żadnego importu z `tests/`. Moduł dołączony do 19 plików zależy od zewnętrznego SDK, więc test jednostkowy dowolnego z nich ciągnie je przechodnio.
3. **Brak bezpośrednich importów testowych dla 13 modułów `lib`** (pokrycie przez importy z `tests/`): `auth-email`, `auth-errors`, `auth-rules`, `checkoff-response`, `config-status`, `group-errors`, `group-rules`, `groups`, `http`, `join-code`, `sentry`, `task-errors`, `utils`. Część z nich testuje się pośrednio (np. `group-rules` przez `task-rules`, a `groups.ts` przez trasy integracyjne). Nie zakładam, że są nieprzetestowane (unknown: pokrycie liczone w czasie wykonania).
4. **Widoki `.astro` nie są importowalne w Vitest.** `dashboard.astro` (22 zależności, 455 linii) zawiera logikę łączącą dane z kilku modułów i tylko `e2e` oraz `smoke` ją dotykają. Jedyny test integracyjny dotykający `pages/` to trasa `auth/callback.ts`.
5. **Wspólny helper `tests/helpers/supabase.ts` (8 importujących)** to pojedyncze centrum testów: jego zmiana przesuwa wszystkie testy integracyjne naraz. Zależy od `tests/setup/constants.ts` i `src/types.ts`.
6. **Strefa czasowa:** `vitest.config.ts` wymusza `TZ=America/Los_Angeles`, żeby ujawnić błędy reguł daty (komentarz w pliku). To dowód, że reguły streaków (`streak-rules.ts`, `leaderboard-rules.ts`) są wrażliwe na środowisko, mimo że mają zero zależności zewnętrznych.

---

## Zbiorcze unknowns (ograniczenia analizy statycznej)

1. **`.astro` nie jest parsowany przez dependency-cruiser.** Krawędzie z 11 plików `.astro` pochodzą z mojego regexu. Importy dynamiczne, `Astro.glob`, `import.meta.glob` i komponenty używane przez przekazanie `slot` nie zostały sprawdzone.
2. **Moduły wirtualne i środowiskowe** (`astro:env/server`, `astro:middleware`, `cloudflare:workers`) są nierozwiązane (`couldNotResolve`: 4). Zależności od runtime Workers są widoczne tylko jako nazwy.
3. **Kontrakty tekstowe** (URL tras, prefiksy `PROTECTED_ROUTES`, nazwy kolumn i funkcji SQL, klucze cookie `join code`) nie istnieją w grafie importów.
4. **Baza danych jest poza analizą:** migracje, RLS, triggery i widoki nie mają krawędzi do kodu.
5. **Type-only vs runtime:** zwykłe `import` używane tylko jako typ liczy się jako runtime, więc liczba krawędzi type-only (18) to dolna granica.
6. **Granice warstw sprawdzono po ścieżce katalogu**, nie po treści: nie wiem, czy endpoint nie duplikuje logiki, która powinna być w `lib`.
7. **Nie uruchamiałem testów ani buildu.** Wnioski o izolacji testów wynikają z grafu importów i `vitest.config.ts`, nie z działania.
8. **`dist/`, `.astro/`, `playwright-report/`, `test-results/`, `reports/` i `context/`** pominięte celowo.
9. **Aplikacja ma ~3 tygodnie historii i jednego autora** (artefakt 1), więc obserwacje o strukturze mogą szybko się zdezaktualizować.
