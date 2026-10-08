---
title: "Anti-Corruption Layer wokół Supabase: jedno miejsce, które zna kształt zależności"
created: 2026-10-06
type: refactor-plan
---

# Plan refaktoru — Anti-Corruption Layer wokół Supabase

**To jest plan, nie implementacja.** Nie zmieniałem kodu produkcyjnego, schematu ani konfiguracji. Cytaty `plik:linia` zweryfikowałem skryptem (gałąź `m4l5-ddd`, commit `dd2dee0`; drzewo robocze czyste poza `context/domain/`): z dokumentu wyciągnąłem 256 cytatów, 224 rozwiązałem automatycznie (plik istnieje, numer linii mieści się w pliku, przeczytałem treść cytowanej linii), a 32 dwuznaczne nazwy lub pliki spoza `src/` (trasy o tej samej nazwie w `groups/` i `tasks/`, `node_modules`, migracja SQL) sprawdziłem ręcznie. Przy pierwszej wersji poprawiłem 7 błędnych numerów. Skrypt potwierdza, że linia istnieje i zawiera cytowaną konstrukcję; nie dowodzi, że każde zdanie interpretacji jest słuszne. Co uruchomiłem, a czego nie: §0.

Oznaczenia: **[E]** zweryfikowane przeze mnie w tej sesji, **[I]** wnioskowanie, **[U]** nieznane lub niesprawdzone.

## Streszczenie

- **Wybrany przeciek (#1): Supabase** (`@supabase/supabase-js`, `@supabase/ssr` oraz kontrakt PostgREST i GoTrue, który te pakiety niosą). Fabrykę klienta importuje 25 plików, API biblioteki woła 28 miejsc w pięciu warstwach, SQLSTATE i kody GoTrue czyta 9 plików, a `locals.user` ma typ z SDK [E] (§1–§2).
- **Pułapka kryterium „grep po nazwie pakietu”:** dziś zwraca 3 pliki, bo typ klienta wędruje inferencją (`ReturnType<typeof createClient>`), a sam klient jako argument. Kryterium byłoby zielone przy 25 plikach znających API, więc §6.1 mierzy powierzchnię API (`.from(`, `.rpc(`, `.auth.`, SQLSTATE, kody GoTrue), a nie samą nazwę pakietu.
- **Czego w dokumentach nie ma:** żadnej deklaracji, że Supabase ma być wymienialny (§0). Najbliższa intencja to „one place” w archiwalnych planach, niedotrzymana przez 11 tras (§3.3). Dlatego plan nie obiecuje wymienialności, tylko spójność błędów, testowalność i strukturalne egzekwowanie reguły z `lessons.md:133-138`.
- **Czego w kodzie nie ma:** biblioteka serwerowa nie trafia do bundla klienta [E] (§3.2). Groźny przeciek jest inny: kontrakt „odmowa RLS = zero wierszy, bez błędu” jest zakodowany ręcznie w 6 trasach i działa tylko, gdy ktoś pamięta o `.select()` (§3.4).
- **Projekt:** dwa value objecty (`AppUser`, `BackendError`) jako jedyne miejsce znające kształt `User`, `PostgrestError` i `AuthError`; cztery wąskie porty (27 operacji, po jednej na każde z 28 dzisiejszych wywołań, z jednym złączeniem); jeden adapter w `src/lib/acl/supabase/`; kompozycja w `createBackend` (§4).
- **Wdrożenie:** 6 faz, każda neutralna dla zachowania i bez migracji, jedna trasa na commit. Kolejność względem planu 02 i `refactor-opportunities` jest w §6.3; koszt ok. 2,5–3 dni [I] po sieci charakteryzującej.

---

## 0. Kontekst (KROK 0)

### Co przeczytałem

| Źródło                                                                                                                  | Po co                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md:7-9`, `:25-26`                                                                                               | Architektura, „Auth flow”, konwencja typów w `src/types.ts`                                               |
| `README.md:15`, `:78-80`, `:285-294`                                                                                    | Stos, konfiguracja Supabase, konwencje raportowania (m.in. „Adding a Supabase call”, `:293`)              |
| `context/foundation/prd.md`                                                                                             | Nie wymienia Supabase (zgodnie z otwartością stosu); FR-001 mówi tylko „email/OAuth/passwordless” (`:50`) |
| `context/foundation/tech-stack.md:24`                                                                                   | Uzasadnienie stosu: Supabase daje „auth, PostgreSQL, and row-level access control out of the box”         |
| `context/foundation/shape-notes.md:145`                                                                                 | Preferencja użytkownika: „frontend w React, backend w NestJS” (oznaczona jako informacyjna)               |
| `context/foundation/infrastructure.md:59`                                                                               | Zaakceptowane ryzyko lock-inu, ale **Cloudflare**, nie Supabase                                           |
| `context/foundation/lessons.md:133-138`                                                                                 | Reguła „każdy zwrócony `{ error }` Supabase jest raportowany”                                             |
| `context/domain/01-domain-distillation.md:230`, `glossary.md:46`                                                        | Ranking #5 („Warstwa tłumacząca błędy Supabase”), termin „Użytkownik”                                     |
| `context/domain/02-invariant-aggregate-refactor.md` §4.4–4.5                                                            | `ParticipationRepository` i błędy `SB4xx`: nakłada się na ten plan (§6.3)                                 |
| `context/archive/2026-10-05-data-access/research.md`, `context/changes/refactor-opportunities/{research,plan-brief}.md` | D4, D8, D16, D19; OPP-1, OPP-6, OPP-7, OPP-8                                                              |
| `context/archive/*/plan.md` (3 pliki, §3.3)                                                                             | Deklarowane intencje „one place”                                                                          |

Wybór przecieku wyprowadziłem od nowa z kodu (§1–§2). Zbiega się z pozycją #5 destylacji, ale ją poszerza: #5 dotyczy samego tłumaczenia błędów, a to jedna z kilku powierzchni tej samej zależności.

### Stack, manifest i warstwy

Astro 7 SSR na Cloudflare Workers, React 19 (wyspy), Tailwind 4, shadcn/ui, Supabase (`package.json`, patrz niżej). Zależności zewnętrzne istotne dla granic warstw:

| Pakiet                                                           | `package.json`    | Zainstalowana |
| ---------------------------------------------------------------- | ----------------- | ------------- |
| `@supabase/supabase-js`                                          | `:28` (`^2.99.1`) | 2.116.0 [E]   |
| `@supabase/ssr`                                                  | `:27` (`^0.12.7`) | 0.12.7 [E]    |
| `@sentry/cloudflare`                                             | `:26` (`^11.2.0`) | 11.4.0 [E]    |
| `astro`                                                          | `:32` (`^7.3.2`)  |               |
| `lucide-react`                                                   | `:35`             |               |
| `clsx`, `tailwind-merge`, `radix-ui`, `class-variance-authority` |                   |               |

| Warstwa                      | Gdzie                                                                                                       | Co dziś wie o Supabase                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Middleware                   | `src/middleware.ts`                                                                                         | fabryka klienta, klasyfikacja `getUser()`, `User` w `locals`           |
| HTTP, dane                   | `src/pages/api/{groups,tasks}/*` (13 tras)                                                                  | konstruktor zapytań, `{ data, error, status }`, SQLSTATE, zero wierszy |
| HTTP, auth                   | `src/pages/api/auth/*` (4), `src/pages/auth/{callback,google/callback}.ts` (2)                              | `supabase.auth.*`, kody GoTrue                                         |
| Strony                       | `dashboard.astro`, `index.astro`, `Topbar.astro`                                                            | fabryka, `User.email`, kody błędów w query                             |
| Biblioteka dostępu do danych | `src/lib/{groups,tasks,checkoffs,auth-state}.ts`                                                            | typ klienta, zapytania                                                 |
| Mapowanie błędów             | `src/lib/{group-errors,task-errors,auth-errors}.ts`                                                         | SQLSTATE, kody GoTrue                                                  |
| Raportowanie                 | `src/lib/log.ts`                                                                                            | kształt błędu PostgREST                                                |
| Klient i konfiguracja        | `src/lib/supabase.ts`, `src/types.ts`, `src/env.d.ts`, `src/lib/config-status.ts`, `astro.config.mjs:22-23` | SDK, typy generowane, nazwy zmiennych                                  |
| Wyspy React                  | `src/components/**/*.tsx`                                                                                   | nic [E] (§3.2)                                                         |

### Deklaracje wymienialności: szukałem i nie znalazłem

Przeszukałem `README.md`, `CLAUDE.md` i całe `context/` pod kątem: swap, replace, portable, lock-in, vendor, adapter, „behind an interface”, „one place”. **Żaden dokument nie deklaruje, że Supabase ma być wymienialny**, ani że jest celowo odseparowany „żeby dało się go wymienić”. Najbliżej są:

- `shape-notes.md:145`, preferencja „backend w NestJS”, wprost „informacyjna”; wybrany stos (`tech-stack.md:24`) ją pominął. To możliwy kierunek, nie deklaracja.
- `infrastructure.md:59`, lock-in do Cloudflare zaakceptowany: „migrating off Cloudflare later means touching that entrypoint and env-access layer directly”. Dotyczy innej zależności.
- Intencje „one place” w archiwalnych planach (§3.3): to są deklaracje o **lokalizacji dostępu do danych**, nie o wymienialności.

Nie dopisuję więc tezy, której dokumenty nie zawierają. Uzasadnienie planu opiera się na liczbach z §1 i na tych intencjach.

### Co uruchomiłem, a czego nie

- **[E]** `npx depcruise src --config .dependency-cruiser.cjs`: „no dependency violations found (86 modules, 259 dependencies cruised)”; z JSON-a wyliczyłem importerów pakietów i domknięcie przechodnie od 17 modułów wysp (§3.2).
- **[E]** Wszystkie liczby bazowe z §6.1 to wyniki `grep` z tej sesji. Cytaty `plik:linia` przeszły skrypt opisany na górze dokumentu.
- **[E]** Czytałem źródła zainstalowanych `@supabase/postgrest-js` 2.116.0 (`src/PostgrestBuilder.ts`) i `@supabase/auth-js` 2.116.0 (`src/lib/errors.ts`, `dist/main/lib/error-codes.d.ts`).
- **[E]** Sonda ESLint (`eslint --stdin --stdin-filename src/pages/index.astro --rule '{"no-restricted-imports": …}'`) zgłosiła `2:1 '@/lib/supabase' import is restricted` w frontmatterze pliku `.astro`; nic nie zapisała na dysk (§6.1).
- **[E]** Czytałem testy integracyjne, które asercjonują zachowanie zerowych wierszy (§3.4), **nie uruchamiałem ich**.
- **Dokumentacja przez WebFetch:** strona błędów PostgREST dała tabelę mapowania SQLSTATE, strona o liczeniu (`count`) i referencja `update()` Supabase nie odpowiedziały na zadane pytania (zerowe wiersze, interakcja `count` z `max_rows`). Wynik WebFetch to streszczenie strony zrobione przez model, więc traktuję go jako „docs, reported”, a tam, gdzie strona milczy, **nie** rozstrzygam z dokumentacji (§5.3).
- **Nie uruchamiałem** `npm test`, `npm run test:rls`, `npm run smoke`, `astro check` ani buildu: plan niczego nie zmienia, a lokalny stos obsługuje jedną sesję testów naraz (`CLAUDE.md:30`). Nie dotykałem lokalnej bazy.
- **[U]** `dist/` jest starszy niż HEAD (02:17 vs 16:35 tego samego dnia), więc grep po `dist/client` (0 trafień) traktuję tylko jako poszlakę; podstawą jest graf importów.
- **[U]** Reguły alertów w Sentry, produkcyjne `max_rows`, zachowanie `SB4xx` przez PostgREST (plan 02).

---

## 1. Przeciekające zależności (KROK 1)

### 1.1 Kandydaci

| Zależność                              | Sygnały z kroku 1                                                                                                                                                                                                                             | Skala [E]                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase**                           | ten sam pakiet w wielu warstwach: **tak**; zduplikowana rekonstrukcja typu biblioteki: **tak** (6 razy); typ biblioteki w kontrakcie domeny: **tak** (`locals.user`, `AuthState`); to samo SDK po obu stronach granicy klient/serwer: **nie** | 25 plików z fabryką, 28 wywołań API, 36 plików `src/` znających API lub słownik                                                                                                                                                                          |
| Astro                                  | pakiet w wielu warstwach: tak, ale to warstwa frameworka (trasy, middleware)                                                                                                                                                                  | 25 plików importuje typy z `"astro"`; w `src/lib` 5 plików: `checkoff-response.ts:1`, `auth-email.ts:1`, `join-code.ts:1`, `supabase.ts:2-3`, `config-status.ts:1`; moduły wirtualne `astro:*`: `middleware.ts:2`, `supabase.ts:3`, `config-status.ts:1` |
| Sentry                                 | nie                                                                                                                                                                                                                                           | 3 pliki: `log.ts:1`, `sentry.ts:2-3`, `sentry-options.ts:1`; wszystkie raporty przechodzą przez `log.ts` (`README.md:285-294`)                                                                                                                           |
| `lucide-react`                         | jedna warstwa (prezentacja)                                                                                                                                                                                                                   | 15 plików: 14 komponentów i `dashboard.astro:12`; zero logiki domenowej                                                                                                                                                                                  |
| `clsx`, `tailwind-merge`               | nie                                                                                                                                                                                                                                           | 1 plik: `utils.ts:1-2` (`cn`)                                                                                                                                                                                                                            |
| `radix-ui`, `class-variance-authority` | nie                                                                                                                                                                                                                                           | wyłącznie `src/components/ui/*`                                                                                                                                                                                                                          |

### 1.2 Kto „zna” Supabase (wszystkie pliki, plik:linia)

| Powierzchnia                                         | Gdzie                                                                                                                                                                                                                                                                     | Ile                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fabryka klienta** `createClient(headers, cookies)` | `middleware.ts:16`, `dashboard.astro:50`, 19 tras: `groups/{create,delete,join,leave:16,remove-member:25,rename:22}`, `tasks/{checkoff,create,delete,join,leave,uncheck,update}`, `auth/{google,signin,signout,signup}`, `auth/callback.ts`, `auth/google/callback.ts:20` | 21 wywołań; 25 plików importuje `@/lib/supabase` (21 powyższych + typowo `groups.ts:1`, `tasks.ts:1`, `checkoffs.ts:4`, `auth-state.ts:3`) |
| **Konstruktor zapytań** w trasach                    | `groups/create.ts:29`, `rename.ts:34`, `delete.ts:30`, `leave.ts:23`, `remove-member.ts:41-47`, `join.ts:28` (rpc); `tasks/create.ts:38-40`, `update.ts:38`, `delete.ts:33`, `join.ts:34`, `leave.ts:28-33`                                                               | 11                                                                                                                                         |
| Konstruktor zapytań w bibliotece                     | `groups.ts:21,28,36`; `tasks.ts:15-18,30-35,58-62,72`; `checkoffs.ts:15,64,86`                                                                                                                                                                                            | 10                                                                                                                                         |
| **Auth API**                                         | `auth-state.ts:34`; `auth/signin.ts:18`, `signup.ts:20`, `signout.ts:9`, `google.ts:18`; `auth/callback.ts:25`; `auth/google/callback.ts:40`                                                                                                                              | 7                                                                                                                                          |
| **Typ klienta odtwarzany**                           | `groups.ts:3`, `tasks.ts:4`, `checkoffs.ts:7`, `auth-state.ts:5`; testy: `auth-state.test.ts:6`, `checkoffs-reporting.test.ts:6`                                                                                                                                          | 6                                                                                                                                          |
| **Typy SDK w kontrakcie**                            | `env.d.ts:3` (`User` w `App.Locals`); `auth-state.ts:1,7-13` (`User`, `AuthError` w `AuthState`) → `middleware.ts:17,20,22`, `dashboard.astro:32`, `Topbar.astro:8` (`user.email`)                                                                                        | 5 plików                                                                                                                                   |
| **SQLSTATE**                                         | `group-errors.ts:16,18,20,22`, `task-errors.ts:13`, `checkoffs.ts:42,46,65`, `api/tasks/join.ts:37`                                                                                                                                                                       | 4 pliki, 9 linii                                                                                                                           |
| **Słownik GoTrue**                                   | `auth-errors.ts:29,45-50,68,92-109`; `auth-state.ts:15-23,38`; `auth/callback.ts:29`; `index.astro:8` (kody w query przekierowania); `auth-rules.ts:3`                                                                                                                    | 5 plików                                                                                                                                   |
| **Kształt błędu w raporcie**                         | `log.ts:45-50`, `:75` (`name: "SupabaseError"`)                                                                                                                                                                                                                           | 1                                                                                                                                          |
| **Konfiguracja**                                     | `supabase.ts:3,7`; `config-status.ts:1,14`; `middleware.ts:25` (tekst komunikatu); `astro.config.mjs:22-23`                                                                                                                                                               | 4 + config                                                                                                                                 |
| **Typy generowane**                                  | `supabase.ts:4` jest jedynym importem `@/types` w `src/`                                                                                                                                                                                                                  | 1                                                                                                                                          |
| **Testy**                                            | 9 plików importuje `@/lib/supabase`                                                                                                                                                                                                                                       | 9                                                                                                                                          |

Razem 36 plików `src/` (25 z fabryką + `supabase.ts`, `env.d.ts`, `types.ts`, `config-status.ts`, `log.ts`, `group-errors.ts`, `task-errors.ts`, `auth-errors.ts`, `auth-rules.ts`, `index.astro`, `Topbar.astro`), plus `astro.config.mjs` i 9 testów.

### 1.3 Pełne listy plików dla zależności, które nie zostały wybrane

Dla porównania i dla kompletności kroku 1. Lista to **wszystkie** linie importu w `src/` [E].

**Astro: 28 linii w 26 plikach.**

| Warstwa                                           | Import                                             | Pliki                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib` (5 plików)                              | `from "astro"` (typy `AstroCookies`, `APIContext`) | `auth-email.ts:1`, `join-code.ts:1`, `supabase.ts:2`, `checkoff-response.ts:1`                                                                                                                                                                                |
| `src/lib`                                         | `from "astro:env/server"`                          | `supabase.ts:3`, `config-status.ts:1`                                                                                                                                                                                                                         |
| middleware                                        | `from "astro"`, `from "astro:middleware"`          | `middleware.ts:1`, `middleware.ts:2`                                                                                                                                                                                                                          |
| trasy (20 plików, `from "astro"`, typ `APIRoute`) |                                                    | `api/auth/{google,signin,signout,signup}.ts:1`; `api/groups/{create,delete,join,leave,remove-member,rename}.ts:1`; `api/tasks/{checkoff,create,delete,join,leave,uncheck,update}.ts:1`; `auth/callback.ts:1`; `auth/google/callback.ts:1`; `join/[code].ts:1` |

Ocena: warstwa tras i middleware to miejsce frameworka; pięć plików w `src/lib` to osobny, mniejszy temat (§6.6).

**Sentry: 3 pliki + moduł wirtualny Workera.**

| Plik                          | Co                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/lib/log.ts:1`            | `captureException`, `isEnabled`: jedyny lej raportów                                                                    |
| `src/lib/sentry.ts:1-3`       | `cloudflare:workers`, `withScope`, `wrapRequestHandler`; komentarz `:14` deklaruje, że to jedyny moduł z tymi importami |
| `src/lib/sentry-options.ts:1` | `linkedErrorsIntegration`, typy `CloudflareOptions`, `ErrorEvent`                                                       |
| `src/env.d.ts:8`              | deklaracja `cloudflare:workers` (typ `SentryEnv` z `sentry-options.ts`)                                                 |

Importer `@sentry/*` poza tymi plikami: brak. Trasy i strony nie importują Sentry.

**`lucide-react`: 15 plików, jedna warstwa (prezentacja).** `components/auth/{FormField,PasswordToggle,ServerError,SignInForm,SignUpForm,SubmitButton}.tsx`, `components/dev/SignInStates.tsx:2`, `components/groups/{ConfirmAction,CopyInviteLink,CreateGroupForm,JoinGroupForm,RenameGroupForm}.tsx`, `components/tasks/{CreateTaskForm,EditTaskForm}.tsx`, `pages/dashboard.astro:12`.

**`clsx`, `tailwind-merge`: `src/lib/utils.ts:1-2`.** Jedyny importer (`cn`).

**`radix-ui`, `class-variance-authority`: wyłącznie `src/components/ui/`**: `alert-dialog.tsx:3`, `alert.tsx:2`, `button.tsx:2,4`, `label.tsx:3` (shadcn, dodawane przez `npx shadcn@latest add`, `CLAUDE.md`).

---

## 2. Klasyfikacja i wybór #1 (KROK 2)

Osie: (a) liczba warstw i plików, (b) ryzyko i koszt wymiany biblioteki dziś, (c) czy dokumenty deklarują wymienialność (rozjazd intencja-kod).

| Zależność      | (a) warstwy / pliki                                                        | (b) koszt wymiany SDK dziś                                                                                                                             | (c) deklaracja wymienialności                                              |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Supabase**   | **5 warstw** (middleware, HTTP, strony, biblioteka, raportowanie) / **36** | **Wysoki:** każde z 28 wywołań ma własne tłumaczenie błędu; sama wymiana SDK = edycja 36 plików i 9 testów, bez możliwości zrobienia tego mechanicznie | **Brak deklaracji wymienialności.** Jest rozjazd „one place” vs kod (§3.3) |
| Astro          | 2 warstwy (trasy, 5 plików `src/lib`) / 26                                 | Wysoki, ale zaakceptowany (`infrastructure.md:59`)                                                                                                     | Lock-in zaakceptowany wprost                                               |
| Sentry         | 2 pliki fasady + `sentry-options.ts` / 3                                   | Niski: wymiana dotyka 3 plików                                                                                                                         | Brak; fasada już istnieje                                                  |
| `lucide-react` | 1 warstwa / 15                                                             | Niski (nazwy ikon)                                                                                                                                     | Brak                                                                       |

**Wybór: Supabase.** Uzasadnienie:

1. **Najwięcej warstw i plików** (5 / 36) i **jedyny przeciek z typem biblioteki w kontrakcie domeny** (`App.Locals`, `AuthState`).
2. **Znaczenie błędu zależy od miejsca wywołania, a znają je trasy.** To samo SQLSTATE znaczy co innego w czterech kontekstach (§3.1, D3), więc wymiana biblioteki nie jest operacją mechaniczną.
3. **Jedyny, w którym kod nie dotrzymuje własnej, zapisanej intencji** („one place”, §3.3). Sentry ma już fasadę (`log.ts`), Astro to zaakceptowany szkielet, `lucide-react` dotyka jednej warstwy.
4. Znajduje się na styku z **najgroźniejszym kontraktem** (§3.4): bezpieczeństwo odmowy zależy od cichego zachowania SDK.

**Co odrzuciłem i dlaczego.** Astro: typy `APIRoute`, `AstroCookies` w warstwie tras są na swoim miejscu; 5 plików w `src/lib` to osobny, mniejszy temat (§6.6, „Czego plan nie rusza”). Sentry: wzorcowy przykład ACL, który tu odtwarzamy (`log.ts` jest jedynym importerem `captureException`). `lucide-react`: zamiana ikon nie przecina granicy domeny.

**Ograniczenie, które trzeba powiedzieć wprost.** ACL izoluje SDK i kształt jego odpowiedzi. Nie ukryje, że **autoryzacja mieszka w bazie** (RLS): port musi wprost wyrażać „niewidoczne = `null`” i „odmowa = brak efektu” (§4.3), a podmiana platformy (nie samego SDK) nadal wymaga przepisania migracji, polityk i `supabase/checks/rls-scenarios.sql`, które leżą poza `src/`.

---

## 3. Diagnoza (KROK 3)

### 3.1 Duplikacja (cytaty)

**D1. Typ klienta odtwarzany sześć razy.**

```ts
// groups.ts:3, tasks.ts:4, checkoffs.ts:7, auth-state.ts:5 (i dwa testy)
type Supabase = NonNullable<ReturnType<typeof createClient>>;
```

**D2. Preambuła fabryki + guard „not configured” w 19 trasach** (`if (!supabase)`: 19 trafień). Przykład `groups/rename.ts:22-25`:

```ts
const supabase = createClient(context.request.headers, context.cookies);
if (!supabase) {
  return context.redirect("/dashboard?error=not_configured");
}
```

**D3. To samo SQLSTATE, cztery znaczenia, cztery miejsca.**

| SQLSTATE | Gdzie i co znaczy                                                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `23505`  | `group-errors.ts:18` → `already_in_group`; `api/tasks/join.ts:37` → cichy no-op; `checkoffs.ts:65` → sukces (idempotencja); `task-errors.ts:14` deleguje do mapy grupowej, więc unikat z zadania też daje `already_in_group` |
| `23503`  | `api/tasks/join.ts:37` → no-op; `checkoffs.ts:46` → `forbidden` + linia info                                                                                                                                                 |
| `42501`  | `group-errors.ts:22` → `forbidden`; `checkoffs.ts:42` → `forbidden` + raport błędu                                                                                                                                           |
| `23514`  | `group-errors.ts:16` → `invalid_name`; `task-errors.ts:13` → `invalid_title`                                                                                                                                                 |
| `P0002`  | `group-errors.ts:20` → `invalid_code` (rzucane przez `join_group`, `harden_group_rls.sql:71`)                                                                                                                                |

**D4. Słownik GoTrue.** `over_request_rate_limit` w czterech miejscach: `auth-errors.ts:29`, `:68`, `:103` oraz `auth/callback.ts:29` (ten ostatni **omija** `auth-errors.ts` i porównuje kod w trasie). Lista „sesja zniknęła” w `auth-state.ts:15-23`, lista „nieaktualna wymiana” w `auth-errors.ts:45-50`, lista rejestracji w `auth-errors.ts:92-109`, a `index.astro:8` trzeci raz parsuje słownik zwrotu dostawcy (`bad_oauth_state`, `bad_oauth_callback`, `flow_state_already_used`), obok `toGoogleReturnErrorCode` (`auth-errors.ts:59`). Kody pochodzą z dwóch źródeł: z serwera i z samego SDK (`pkce_code_verifier_not_found`, `auth-js/src/lib/errors.ts:269`), a typ `AuthError.code` to `ErrorCode | (string & {}) | undefined` (`errors.ts:21`), więc kompilator nie wymusza kompletności ani nie złapie literówki.

**D5. Rekonstrukcja wiersza → domena w dwóch kopiach.** `tasks.ts:22-25` (`getTask`) i `:37-41` (`listGroupTasks`) powtarzają `normalizeRecurrence` + `throw new Error(… unknown recurrence)`. Podobne łatki „typy generowane kłamią” jeszcze trzy razy: `groups.ts:26`, `:34`/`:38`, `checkoffs.ts:20`.

**D6. Stała cudzej konfiguracji.** `POSTGREST_MAX_ROWS = 1000` (`tasks.ts:50`, użyta `tasks.ts:64` i `checkoffs.ts:17`) powiela `supabase/config.toml:18` (`max_rows = 1000`).

**D7. Zduplikowana wiedza „czy skonfigurowany”.** `supabase.ts:7` (`!SUPABASE_URL || !SUPABASE_KEY`), `config-status.ts:14` (`Boolean(SUPABASE_URL && SUPABASE_KEY)`), tekst w `middleware.ts:25`, nazwy w `astro.config.mjs:22-23`.

**D8. Reguła pilnowana przeglądem.** `README.md:293`: „**Adding a Supabase call**: report its returned `error` through the helper … never map `error.code` and drop it”; `lessons.md:137`. Research (`refactor-opportunities/research.md:352`) potwierdza: „rests on review at HEAD: the only mechanical check I found is `no-console: "warn"`”.

**D9. Testy sprzężone z łańcuchem wywołań biblioteki.** `checkoffs-reporting.test.ts:13-20` (`fakeSupabase`: ręcznie zbudowany `chain.delete/eq/gte/lte/select/insert`), `groups-join-route.test.ts:7,32` (`vi.mock("@/lib/supabase")`, klient `{ rpc }`). Research: „only `groups/join` and `tasks/create` have mocked-route tests, and 11 of the 13 handlers … are never imported by any Vitest test” (`data-access/research.md:395`).

### 3.2 Przecieki przez granice

| Granica                               | Stan                  | Dowód                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Serwer → bundle klienta**           | **Nie przecieka [E]** | 17 modułów wysp (`src/components/**`, bez `ui/` i `dev/`) osiąga przechodnio tylko 8 modułów `src/lib` (`auth-rules`, `checkoff-client`, `checkoff-sync`, `group-rules`, `leaderboard-rules`, `streak-rules`, `task-rules`, `utils`); żaden nie importuje `@supabase/*`, `@sentry/*` ani `astro`. `grep` po `dist/client` bez trafień (poszlaka, §0). Sekrety są serwerowe: `astro.config.mjs:22-23` (`context: "server"`, `access: "secret"`) |
| **Serwer → serwer, w poprzek warstw** | **Przecieka mocno**   | 25 plików z fabryką, 28 wywołań; HTTP, strona, middleware i biblioteka zna to samo SDK                                                                                                                                                                                                                                                                                                                                                         |
| **Biblioteka → kontrakt domeny**      | **Przecieka**         | `env.d.ts:3` (`User` w `App.Locals`); `auth-state.ts:7-13`; do `.astro` dociera pełny obiekt GoTrue (`dashboard.astro:32`, `Topbar.astro:2`), a używane są **dwa pola**: `id` i `email` (`Topbar.astro:8`)                                                                                                                                                                                                                                     |
| **Biblioteka → telemetria**           | **Przecieka**         | `log.ts:45-50` zna `details`/`hint`/`code`/`status` PostgREST; `:75` nazywa błąd `SupabaseError`                                                                                                                                                                                                                                                                                                                                               |
| **Strona (UI) → dane**                | **Częściowo czysto**  | wyspy dostają prymitywy i DTO (`viewerId={user.id}`, `dashboard.astro:316,335`); `.astro` dostaje DTO z `src/lib` w nazwach kolumn (`group.owner_id`, `dashboard.astro:132`) i surowy `User`                                                                                                                                                                                                                                                   |

### 3.3 Intencja kontra kod

Brak deklaracji wymienialności (§0). Deklaracje „one place” są:

| Dokument                                                          | Cytat                                                                                                             | Co robi kod                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context/archive/2026-09-25-group-create-join-manage/plan.md:155` | „**Intent**: One place for server-side group logic shared by the dashboard and the API routes.”                   | Odczyty są w `groups.ts`, ale **6 mutacji grup wywołuje `supabase.from(...)` w trasach** (`create.ts:29`, `rename.ts:34`, `delete.ts:30`, `leave.ts:23`, `remove-member.ts:41`, `join.ts:28`) |
| `context/archive/2026-09-30-task-create-and-manage/plan.md:174`   | „**Intent**: One place that reads a task by id … in the style of `src/lib/groups.ts`.”                            | `getTask` istnieje (`tasks.ts:14`), ale **5 mutacji zadań** jest w trasach (`create.ts:38`, `update.ts:38`, `delete.ts:33`, `join.ts:34`, `leave.ts:28`)                                      |
| `context/archive/2026-10-01-checkoff-and-leaderboard/plan.md:224` | „Keep Supabase access for check-offs in one place that the routes, the dashboard and the integration tests share” | **Dotrzymane** (`checkoffs.ts`): dowód, że wzorzec działa w tym repo                                                                                                                          |

### 3.4 Przeciek groźny: zerowe wiersze to nie błąd

PostgREST pod RLS odpowiada na `UPDATE` i `DELETE`, którego polityka nie dopuszcza, **zerem wierszy bez błędu**. Aplikacja odróżnia odmowę od sukcesu wyłącznie przez `.select(...)` i `data.length === 0`:

- 6 tras: `groups/rename.ts:34,40`, `groups/delete.ts:30,36`, `groups/leave.ts:23,29`, `groups/remove-member.ts:41-47,53`, `tasks/update.ts:38,44`, `tasks/delete.ts:33,39`; plus ciche wyjście w `checkoffs.ts:94-96` (`reportInfo("uncheck.nothing_removed")`).
- Każda trasa opisuje ten kontrakt własnym komentarzem (`rename.ts:33`, `leave.ts:21-22`, `remove-member.ts:38-40`, `tasks/leave.ts:27`).
- **Scenariusz błędu:** nowa trasa (lub refaktor istniejącej) pomija `.select("id")`. `data` jest wtedy `null` (docs Supabase: „by default, updated rows are not returned”, [reported]), a trasa nie odróżnia odmowy od sukcesu. Nie ma testu, który to wykryje: 11 z 13 handlerów nie jest importowane przez żaden test Vitest (D9).
- Kontrakt potwierdzają testy na prawdziwym PostgREST [E, nie uruchamiałem]: `task-permissions.test.ts:74-100` (`error` null, `data` `[]`), `:121` (42501 przy WITH CHECK), `group-isolation.test.ts:128-152`.

To jest wiedza o bibliotece, która należy do adaptera, a nie do 6 tras.

---

## 4. Projekt ACL (KROK 4)

### 4.1 Gdzie mieszka

```
src/lib/ports.ts                  porty + value objecty + wyniki. Nie importuje pakietu, "astro" ani "@/types"
src/lib/backend.ts                korzeń kompozycji: createBackend(headers, cookies), isBackendConfigured()
src/lib/acl/supabase/             ACL. JEDYNE miejsce z importem @supabase/*, @/types i literałami SQLSTATE / GoTrue
  client.ts                       createServerClient + most cookie (dzisiejszy src/lib/supabase.ts)
  faults.ts                       klasyfikacja błędów; jedyny czytelnik error.code / error.status
  app-user.ts                     AppUser z User
  auth.ts  groups.ts  tasks.ts  participation.ts      adaptery portów
```

Typy DTO (`MyGroup`, `GroupMember`, `GroupTask`, `TaskParticipant`, `EnrolmentPeriods`) zostają tam, gdzie są (`groups.ts`, `tasks.ts`, `leaderboard-rules.ts`), żeby nie robić zbędnego ruchu w importach (`dashboard.astro:19,30`). `groups.ts`, `tasks.ts`, `checkoffs.ts` tracą kod zapytań, zostają typami i regułami. Konwencja z `CLAUDE.md:25` („shared types … belong in `src/types.ts`”) jest sprzeczna z faktem, że to plik generowany; Faza 6 ją doprecyzowuje (`src/types.ts` = wyłącznie typy bazy, importowane wyłącznie przez adapter).

### 4.2 Value objecty (jedyne miejsce znające kształt zależności)

**`AppUser`**: tożsamość widziana przez domenę. Zastępuje `User` w `App.Locals`, `AuthState` i `middleware.ts:17`. Z `User` używane są dwa pola (§3.2).

```ts
// src/lib/ports.ts
export interface AppUser {
  readonly id: string; // lower-case uuid, normalised at the boundary
  readonly email: string | null; // Topbar.astro:8 renders it; null renders nothing, like undefined
}

// src/lib/acl/supabase/app-user.ts  (the only file that knows GoTrue's User)
export function fromAuthUser(user: User): AppUser {
  return { id: user.id.toLowerCase(), email: user.email ?? null };
}
```

Normalizacja `id` na granicy czyni zbędnym defensywne `user.id.toLowerCase()` w `remove-member.ts:21` (zostawiam je w migracji, bez zmiany zachowania).

**`BackendError`**: jedyny typ błędu, który reszta aplikacji widzi. Ma te same nazwy pól, które `log.ts:45-50` czyta dziś z obiektu PostgREST, więc raport ma tę samą treść.

```ts
// src/lib/ports.ts
export class BackendError extends Error {
  readonly code: string | undefined; // SQLSTATE or GoTrue code; "" for a network failure
  readonly status: number | undefined; // HTTP status; 0 for a network failure
  readonly details: string | undefined;
  readonly hint: string | undefined;
}

// src/lib/acl/supabase/faults.ts  (the only file that reads error.code / error.status)
export type DataFault = "check" | "unique" | "foreign_key" | "denied" | "no_data" | "transient" | "other";
export type AuthFault =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "invalid_input"
  | "rate_limited"
  | "stale_exchange"
  | "session_gone"
  | "unavailable"
  | "other";

const SQLSTATE: Record<string, DataFault> = {
  "23514": "check",
  "23505": "unique",
  "23503": "foreign_key",
  "42501": "denied",
  P0002: "no_data",
  // plan 02: SB403, SB404, SB409, SB422 are registered here
};

export function classifyData(error: { code?: string }, status: number): DataFault {
  if (status === 0) return "transient"; // postgrest-js network failure: status 0, code "" (PostgrestBuilder.ts:346-357)
  return SQLSTATE[error.code ?? ""] ?? "other";
}

export function classifyAuth(error: AuthError): AuthFault {
  // same order as resolveAuthState today (auth-state.ts:36-40): session missing, then outage, then the code table
  if (isAuthSessionMissingError(error)) return "session_gone";
  if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) return "unavailable";
  return AUTH_CODES[error.code ?? ""] ?? "other"; // ONE table: session-gone, stale-exchange, rate-limit, sign-in, sign-up
}

export function toBackendError(error: PostgrestError | AuthError, status?: number): BackendError;
```

`classifyData` zwraca **rodzaj usterki**, nie wynik domenowy, bo znaczenie zależy od operacji (D3). Przekład „rodzaj usterki → wynik” jest w adapterze, per operacja (§4.4).

### 4.2b Mapowanie z i do persystencji

Konwersje wiersza i ładunku zapisu są **prywatne dla adaptera** (żaden plik poza `acl/supabase/` nie widzi typów `Database[...]`). Dziś te konwersje są rozsiane lub powtórzone (§3.1 D5); po refaktorze każda ma jedno miejsce:

```ts
// src/lib/acl/supabase/tasks.ts (adapter-private)
type TaskRow = Pick<Database["public"]["Tables"]["tasks"]["Row"], "id" | "title" | "recurrence" | "created_by">;
function toGroupTask(row: TaskRow): GroupTask; // normalizeRecurrence(row.recurrence); unknown value -> BackendError (replaces tasks.ts:22-25 and :37-41)
function taskInsert(
  groupId: string,
  creatorId: string,
  title: string,
  recurrence: TaskRecurrence,
): Database["public"]["Tables"]["tasks"]["Insert"];

// src/lib/acl/supabase/groups.ts
function toGroupMember(row: ListGroupMembersRow): GroupMember; // the generated type omits NULL e-mail (groups.ts:34-38): email: string | null
function toPreviewName(data: string | null): string | null; // the generated type omits NULL (groups.ts:26)

// src/lib/acl/supabase/participation.ts
function toEnrolmentPeriods(row: CheckoffPeriodsRow): EnrolmentPeriods | null; // null key column -> dropped (checkoffs.ts:20-24)
function checkoffInsert(
  userId: string,
  taskId: string,
  period: PeriodKey,
): Database["public"]["Tables"]["task_checkoffs"]["Insert"];
function periodFilter(
  recurrence: TaskRecurrence,
  period: PeriodKey,
): { eq?: PeriodKey; gte?: PeriodKey; lte?: PeriodKey };
// periodFilter holds today's uncheck() range logic (checkoffs.ts:87-93): daily exact day, weekly Monday..Monday+6, once none
```

Kierunek „domena → typ biblioteki” ogranicza się do ładunków zapisu (`taskInsert`, `checkoffInsert`, `{ name }`, `{ title }`) i parametrów wywołań auth (`{ email, password }`, `emailRedirectTo`, `redirectTo`); nic z domeny nie wraca do SDK w innej formie. **Operacje domenowe** (np. „czy to właściciel grupy”, `group.owner_id === user.id`, `remove-member.ts:56`, `dashboard.astro:132`) celowo **nie** trafiają do ACL: to reguły domeny (`glossary.md`: „Właściciel grupy”), a ACL zna tylko kształt zależności. ACL zawiera wyłącznie konwersje, klasyfikację błędów i budowę wyników.

### 4.3 Porty (wąskie)

Port jest wąski z konstrukcji: **każda operacja odpowiada dokładnie jednemu dzisiejszemu wywołaniu** (z jednym złączeniem: oba `exchangeCodeForSession` to jedno `completeSignIn`). Nic ponad to, czego potrzebują trasy: 21 wywołań danych + 7 auth = 28 miejsc → 27 operacji.

```ts
// src/lib/ports.ts: nothing in this file imports a package, "astro" or "@/types"
type Failed<C extends string> = { kind: "failed"; code: C; cause: BackendError };
type StoreCode = Exclude<GroupErrorCode, "not_configured">;

/** Zero rows is "no_effect": under RLS a refused UPDATE/DELETE is NOT an error. The adapter always asks for the rows. */
export type GroupWrite = { kind: "ok" } | { kind: "no_effect" } | Failed<StoreCode>;
export type TaskWrite = { kind: "ok" } | { kind: "no_effect" } | Failed<TaskErrorCode | StoreCode>;

export interface GroupsPort {
  mine(): Promise<MyGroup | null>; // null: caller has no group (RLS scopes the select)
  preview(code: string): Promise<string | null>; // name for a join code, null: unknown
  members(groupId: string): Promise<GroupMember[]>; // [] for a non-member
  create(ownerId: string, name: string): Promise<GroupWrite>;
  rename(groupId: string, name: string): Promise<GroupWrite>;
  remove(groupId: string): Promise<GroupWrite>;
  join(code: string): Promise<GroupWrite>; // unknown code: failed "invalid_code"
  leave(userId: string): Promise<GroupWrite>;
  removeMember(groupId: string, userId: string, actorId: string): Promise<GroupWrite>;
}
export interface TasksPort {
  get(id: string): Promise<GroupTask | null>; // null: RLS hides it or it does not exist
  list(groupId: string): Promise<GroupTask[]>;
  participants(): Promise<TaskParticipant[]>; // throws BackendError if the row cap may have cut it
  exists(id: string): Promise<boolean>;
  create(groupId: string, creatorId: string, title: string, recurrence: TaskRecurrence): Promise<TaskWrite>;
  rename(id: string, title: string): Promise<TaskWrite>;
  remove(id: string): Promise<TaskWrite>;
  join(id: string, userId: string): Promise<TaskWrite>; // already joined / task gone meanwhile: "ok" (idempotent)
  leave(id: string, userId: string): Promise<TaskWrite>; // not joined: "no_effect", quiet
}
export interface ParticipationPort {
  // plan 02 replaces it with ParticipationRepository (§6.3)
  periods(): Promise<EnrolmentPeriods[]>;
  checkOff(userId: string, task: GroupTask, now: Date): Promise<CheckoffOutcome>;
  uncheck(userId: string, task: GroupTask, now: Date): Promise<CheckoffOutcome>;
}
export interface AuthPort {
  currentUser(): Promise<AuthState>; // signed_in{AppUser} | anonymous | unavailable | unexpected
  signInWithPassword(email: string, password: string): Promise<SignInOutcome>;
  signUp(email: string, password: string, confirmUrl: string): Promise<SignUpOutcome>;
  signOut(): Promise<{ kind: "ok" } | { kind: "failed"; cause: BackendError }>;
  startGoogleSignIn(
    returnUrl: string,
  ): Promise<{ kind: "redirect"; url: string } | { kind: "failed"; cause: BackendError }>;
  completeSignIn(
    code: string,
  ): Promise<{ kind: "ok" } | { kind: "stale" | "rate_limited" | "failed"; cause: BackendError }>;
}
export interface Backend {
  readonly auth: AuthPort;
  readonly groups: GroupsPort;
  readonly tasks: TasksPort;
  readonly participation: ParticipationPort;
}
```

`SignInOutcome` i `SignUpOutcome` to `{ kind: "ok" }` albo `{ kind: "rejected"; reason; cause }`, gdzie `reason` używa dzisiejszych kodów (`SignInErrorCode`, `SignUpErrorCode` z `auth-errors.ts:3-11,71-72`), więc `reportMapped(event, outcome.reason, outcome.cause, …)` zachowuje dzisiejszą semantykę.

| Port                | Operacje     | Zastępuje (plik:linia)                                                                                                                        |
| ------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GroupsPort`        | 9            | `groups.ts:21,28,36`; `groups/{create:29,rename:34,delete:30,join:28,leave:23,remove-member:41}`                                              |
| `TasksPort`         | 9            | `tasks.ts:15,30,58,72`; `tasks/{create:38,update:38,delete:33,join:34,leave:28}`                                                              |
| `ParticipationPort` | 3            | `checkoffs.ts:15,64,86`                                                                                                                       |
| `AuthPort`          | 6 (7 miejsc) | `auth-state.ts:34`; `auth/{signin:18,signup:20,signout:9,google:18}`; `auth/callback.ts:25` + `auth/google/callback.ts:40` → `completeSignIn` |

**Czysta funkcja zwrotu dostawcy.** `classifyAuthReturn(params: URLSearchParams)` (z `faults.ts`, re-eksport przez `backend.ts`) przejmuje `toGoogleReturnErrorCode` (`auth-errors.ts:59-64`) i listę z `index.astro:8`, żeby słownik zwrotu miał jedno miejsce.

### 4.4 Adapter (pseudokod)

**Zerowe wiersze, raz (rozstrzyga §3.4):**

```ts
// src/lib/acl/supabase/groups.ts
rename: (async (groupId, name) => {
  const { data, error, status } = await sb.from("groups").update({ name }).eq("id", groupId).select("id");
  if (error) return failed(groupCode(classifyData(error, status)), error, status);
  return data.length === 0 ? { kind: "no_effect" } : { kind: "ok" }; // ".select()" lives here, nowhere else
},
  // per-operation meaning of a fault: today's toGroupErrorCode (group-errors.ts:14-27), 1:1
  function groupCode(f: DataFault): StoreCode {
    switch (f) {
      case "check":
        return "invalid_name";
      case "unique":
        return "already_in_group";
      case "no_data":
        return "invalid_code";
      case "denied":
        return "forbidden";
      default:
        return "unknown";
    }
  });
// tasks: "check" -> "invalid_title", the rest through groupCode (today's toTaskErrorCode, task-errors.ts:11-14).
// That delegation makes a unique violation from a task answer "already_in_group". Kept as is (characterisation); changing it is a separate decision (D-5).
```

**Idempotencja, raz (dziś w trasie `tasks/join.ts:36-38`):**

```ts
join: async (id, userId) => {
  const { error, status } = await sb.from("task_participants").insert({ task_id: id, user_id: userId });
  if (!error) return { kind: "ok" };
  const f = classifyData(error, status);
  if (f === "unique" || f === "foreign_key") return { kind: "ok" };   // already joined, or the task vanished meanwhile
  return failed(taskCode(f), error, status);
},
```

**Wymiana kodu, jedno miejsce zamiast dwóch tras (`auth/callback.ts:25-33`, `auth/google/callback.ts:40-50`):**

```ts
completeSignIn: async (code) => {
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (!error) return { kind: "ok" };
  const f = classifyAuth(error);   // "stale_exchange" | "rate_limited" | other
  const kind = f === "stale_exchange" ? "stale" : f === "rate_limited" ? "rate_limited" : "failed";
  return { kind, cause: toBackendError(error) };
},
```

**Czytanie przez wiersz → domena, raz (D5):** `toGroupTask(row)` robi `normalizeRecurrence` i rzuca `BackendError` dla nieznanej cykliczności; `getTask` i `list` używają go obie. Limit wierszy (D6) żyje w jednej funkcji `selectAll()` adaptera (§5.3, OQ-3).

### 4.5 Korzeń kompozycji i testowanie

```ts
// src/lib/backend.ts: what routes, pages and middleware import
export function createBackend(headers: Headers, cookies: AstroCookies): Backend | null {
  const client = createSupabaseClient(headers, cookies); // acl/supabase/client.ts
  if (!client) return null; // not configured: the same contract as createClient() === null today
  return {
    auth: authAdapter(client),
    groups: groupsAdapter(client),
    tasks: tasksAdapter(client),
    participation: participationAdapter(client),
  };
}
```

- **Jedno wywołanie fabryki na miejsce, jak dziś** (21). Nie zmieniam liczby klientów na żądanie: OPP-8 zmienia moment odświeżania tokenu (`research.md` OPP-8, „treat it as behaviour-affecting”). Po tym planie OPP-8 to zmiana w jednym pliku.
- `AstroCookies` zostaje w sygnaturze korzenia kompozycji (Astro to zaakceptowany szkielet, §2).
- **Szew testowy:** `tests/helpers/fake-backend.ts` (`fakeBackend(overrides)`) zamiast łańcucha `chain.delete/eq/select`. Testy tras mockują `@/lib/backend`, nie `@/lib/supabase`.
- **Testy kontraktowe adaptera** na lokalnym stosie są **specyfikacją portu**: zerowe wiersze (§5.3 OQ-1), błąd sieci (OQ-4), `maybeSingle` (OQ-5), kody własne (OQ-2). Przy podmianie biblioteki to je nowy adapter musi przejść.

---

## 5. Dowód izolacji i before/after (KROK 5)

### 5.1 Wymiana biblioteki dotyka tylko adaptera (lista)

|                | Dziś (wymiana SDK)                               | Po refaktorze                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Przepisywane   | 36 plików `src/` + `astro.config.mjs` + 9 testów | **7 plików** `src/lib/acl/supabase/*`; `src/types.ts` (generowany); `package.json:27-28`; `astro.config.mjs:22-23` (nazwy zmiennych)                                                                                                           |
| Jedna linia    |                                                  | `src/lib/backend.ts` (importy adapterów)                                                                                                                                                                                                       |
| Testy          | 9 plików z fixtureami łańcucha wywołań           | testy kontraktowe adaptera (specyfikacja)                                                                                                                                                                                                      |
| **Nietknięte** |                                                  | 19 tras, middleware, `dashboard.astro`, `index.astro`, `Topbar.astro`, `group-errors.ts`/`task-errors.ts`/`auth-errors.ts` (zostają komunikaty), `log.ts`, `checkoff-response.ts`, wszystkie `*-rules.ts`, wyspy React, `leaderboard-rules.ts` |

**Granica dowodu.** Dotyczy wymiany **SDK/klienta** przy tej samej bazie z RLS. Podmiana platformy (np. na własny backend) dodatkowo przepisze `supabase/migrations/*`, `supabase/checks/rls-scenarios.sql`, `tests/helpers/supabase.ts`, a nowy adapter musi odtworzyć semantykę portu (`null` dla niewidocznego, `no_effect` dla odmowy).

### 5.2 Before / after

**Trasa `groups/rename` (`rename.ts:22-42`)**: UI dostaje wynik domenowy, nie krotkę SDK.

```ts
// before
const supabase = createClient(context.request.headers, context.cookies);
if (!supabase) {
  return context.redirect("/dashboard?error=not_configured");
}
const group = await getMyGroup(supabase);
// …
const { data, error, status } = await supabase.from("groups").update({ name }).eq("id", group.id).select("id");
if (error) {
  const errorCode = toGroupErrorCode(error); // SQLSTATE in group-errors.ts
  reportMapped("groups.rename.failed", errorCode, error, { ...requestFields(context), status });
  return context.redirect(`/dashboard?error=${errorCode}`);
}
if (data.length === 0) {
  return context.redirect("/dashboard?error=forbidden");
}

// after
const backend = createBackend(context.request.headers, context.cookies);
if (!backend) {
  return context.redirect("/dashboard?error=not_configured");
}
const group = await backend.groups.mine();
// …
const result = await backend.groups.rename(group.id, name);
if (result.kind === "failed") {
  reportMapped("groups.rename.failed", result.code, result.cause, {
    ...requestFields(context),
    status: result.cause.status,
  });
  return context.redirect(`/dashboard?error=${result.code}`);
}
if (result.kind === "no_effect") {
  return context.redirect("/dashboard?error=forbidden");
}
```

Nazwa zdarzenia, pole `status` i adres przekierowania są **identyczne**; trasa nie zna ani `.select("id")`, ani SQLSTATE.

**`tasks/join` (`join.ts:34-38`)**: idempotencja `23505/23503` z trasy do adaptera.

```ts
// before
const { error, status } = await supabase.from("task_participants").insert({ task_id: taskId, user_id: user.id });
if (error) {
  if (error.code === "23505" || error.code === "23503") {
    return context.redirect("/dashboard");
  }
  // … toTaskErrorCode(error), reportMapped(…)
}
// after
const result = await backend.tasks.join(taskId, user.id); // already joined / gone meanwhile are "ok" in the adapter
if (result.kind === "failed") {
  /* reportMapped(…, result.code, result.cause, …); redirect */
}
```

**Słownik GoTrue (D4)**: cztery miejsca → jedna tabela.

```ts
// before: auth/callback.ts:29, auth-errors.ts:29, :68, :103
} else if (error.code === "over_request_rate_limit") { reportInfo("auth.callback.rate_limited", …) }
case "over_request_rate_limit": return "rate_limited";
return error.code === "over_request_rate_limit" ? "rate_limited" : "unknown";
case "over_request_rate_limit": case "over_email_send_rate_limit": return "rate_limited";
// after: faults.ts, one row of AUTH_CODES
over_request_rate_limit: "rate_limited", over_email_send_rate_limit: "rate_limited",
```

**Kontrakt domeny zamiast typu SDK:**

```ts
// before: env.d.ts:3
user: import("@supabase/supabase-js").User | null;
// after
user: import("@/lib/ports").AppUser | null; // Topbar.astro:8 `{user.email}` keeps compiling (string | null)
```

**Dashboard (`dashboard.astro:50-59`)**: te same cztery odczyty, ale z domeny, nie z klienta.

```ts
// before
const supabase = createClient(Astro.request.headers, Astro.cookies);
if (supabase) { group = await getMyGroup(supabase); … listGroupMembers(supabase, group.id), listGroupTasks(supabase, group.id),
  listTaskParticipants(supabase), listCheckoffPeriods(supabase) }
// after
const backend = createBackend(Astro.request.headers, Astro.cookies);
if (backend) { group = await backend.groups.mine(); … backend.groups.members(group.id), backend.tasks.list(group.id),
  backend.tasks.participants(), backend.participation.periods() }
```

**Test:**

```ts
// before: checkoffs-reporting.test.ts:13-20
function fakeSupabase(result: Result): Supabase {
  const chain: Record<string, unknown> = {};
  for (const method of ["delete", "eq", "gte", "lte"]) chain[method] = () => chain;
  chain.select = () => Promise.resolve(result);
  chain.insert = () => Promise.resolve(result);
  return { from: () => chain } as unknown as Supabase;
}
// after
const backend = fakeBackend({ participation: { checkOff: async () => ({ kind: "forbidden" }) } });
```

### 5.3 Pytania otwarte zależne od kontraktu biblioteki

| ID       | Pytanie                                                                                                        | Rozstrzygnięcie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Źródło                                                                                                                                                                                                                         | Gdzie zakodować                                                                                                                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OQ-1** | Czy odmowa RLS na `UPDATE`/`DELETE` zwraca błąd? (`data-access` D4; OPP-6)                                     | **Nie.** `error` null, `data` `[]`; 42501 tylko dla braku uprawnienia kolumny/tabeli lub WITH CHECK. Bez `.select()` wiersze nie wracają, więc zera nie widać                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Testy [E, nie uruchamiane]: `task-permissions.test.ts:74-100,121`, `group-isolation.test.ts:128-152`; docs Supabase tylko dla „updated rows are not returned”. Strony docs, które sprawdziłem, **milczą** o zerowych wierszach | **Adapter:** wynik `no_effect`; `.select()` w jednym miejscu. Polityka (odmowa czy cichy sukces) zostaje w trasie: to decyzja domenowa, i tak jedyna (OPP-6 staje się jedną linią)                                                                                                             |
| **OQ-2** | Czy własne SQLSTATE (`SB4xx`, plan 02) i `DETAIL` docierają do klienta?                                        | `code` = SQLSTATE; `message`/`details`/`hint` = MESSAGE/DETAIL/HINT. **Nieznany SQLSTATE → HTTP 400** (dla `SB403` też), więc `status` nie rozróżnia przypadków; klasyfikować po `code`. Docs [reported]. **[U] wykonanie** przez PostgREST                                                                                                                                                                                                                                                                                                                                                                                                               | Docs PostgREST (errors), przez streszczenie                                                                                                                                                                                    | `faults.ts`, tabela `SQLSTATE`; test kontraktowy w Fazie 1 (powiela przypadek planu 02 §0)                                                                                                                                                                                                     |
| **OQ-3** | Czy obcięcie przez `max_rows` da się wykryć bez stałej 1000? (`refactor-opportunities/research.md:198`, „[U]”) | **Mechanizm jest, rozstrzygnięcia z dokumentacji nie ma.** `postgrest-js` ustawia `count` z `Content-Range`, gdy jest `Prefer: count=exact`/`planned`/`estimated` (`PostgrestBuilder.ts:414-419`) [E]. Trzy strony docs PostgREST (errors, pagination/count, configuration) **nie mówią wprost**, czy suma w `Content-Range` przekracza `max_rows`; przykład `0-24/3573458` sugeruje sumę rzeczywistą. Dodatkowy fakt [reported]: dla `count=estimated` PostgREST liczy dokładnie **do progu `db-max-rows`**, a powyżej szacuje; to jest dokładnie ten zakres, który ma znaczenie przy wykrywaniu obcięcia, a nie płaci kosztu `exact` na dużych tabelach | źródło 2.116.0; docs PostgREST (pagination/count; configuration milczy), przez streszczenie i wyszukiwanie                                                                                                                     | **Decyzja: zostawić dzisiejszą heurystykę (`>= 1000`) w adapterze, stałą w jednym miejscu** (neutralne). Kandydat do późniejszej zmiany: `count: "estimated"` w jednym `selectAll()`; wchodzi dopiero po teście kontraktowym (1001 wierszy w schemacie testowym: `count` > `data.length`); D-3 |
| **OQ-4** | Jak wygląda błąd awarii sieci? (`lessons.md:135`)                                                              | `{ message: "<Name>: <msg>", details, hint, code: "" }`, `status: 0`, `data: null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `PostgrestBuilder.ts:296-357` (zwrot w `:346-357`) [E]                                                                                                                                                                         | `classifyData` → `transient` (dziś trafia do `unknown`; mapowanie na wynik bez zmian)                                                                                                                                                                                                          |
| **OQ-5** | `maybeSingle()` przy ≥2 wierszach                                                                              | Błąd `PGRST116`, status 406 (`PostgrestBuilder.ts:421-430`) [E]. `getMyGroup` ufa INV-01                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | źródło                                                                                                                                                                                                                         | Adapter bez zmian: rzuca `BackendError` (dashboard: `loadFailed`); opis w JSDoc `GroupsPort.mine`                                                                                                                                                                                              |
| **OQ-6** | Czy kompilator pomoże w tabeli kodów GoTrue?                                                                   | **Nie.** `AuthError.code` to `ErrorCode \| (string & {}) \| undefined` (`errors.ts:21`), a `pkce_code_verifier_not_found` jest kodem SDK spoza serwerowej unii `ErrorCode` (`error-codes.d.ts:6`)                                                                                                                                                                                                                                                                                                                                                                                                                                                         | źródło 2.116.0                                                                                                                                                                                                                 | `faults.ts`: tabela + test tabelowy (każdy kod z dzisiejszych list ma wiersz)                                                                                                                                                                                                                  |

---

## 6. Weryfikacja i plan (KROK 6)

### 6.1 Kryterium sukcesu: grep zwraca tylko katalog adaptera

Kryterium z promptu (`grep` po nazwie pakietu) **nie wystarcza** (C1 jest zielone już dziś). Mierzę powierzchnię API. Wartości bazowe zmierzyłem w tej sesji. W tabeli `\|` oznacza `|` (zapis uciekany ze względu na markdown).

| ID  | Polecenie (z `src/`)                                                                                                                                                                                                                                                                                                                                                                                   | Dziś                                                 | Po Fazie 6                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | `grep -rlE '@supabase/' src`                                                                                                                                                                                                                                                                                                                                                                           | 3 pliki (`auth-state.ts`, `supabase.ts`, `env.d.ts`) | tylko `src/lib/acl/supabase/*`                                                                                                                                                                                                                                                       |
| C2  | `grep -rlE 'from "@/lib/supabase"' src`                                                                                                                                                                                                                                                                                                                                                                | **25 plików**                                        | 0 (moduł usunięty)                                                                                                                                                                                                                                                                   |
| C3  | `grep -rnE '\.(from\|rpc)\("' src --include='*.ts' --include='*.astro'` (bez `types.ts`)                                                                                                                                                                                                                                                                                                               | 21 linii / 14 plików                                 | tylko adapter                                                                                                                                                                                                                                                                        |
| C3b | `grep -rnE 'supabase\.auth\.\|\.auth\.(getUser\|signIn\|signUp\|signOut\|exchange)' src`                                                                                                                                                                                                                                                                                                               | 7                                                    | tylko adapter                                                                                                                                                                                                                                                                        |
| C4  | `grep -rnE '"(23505\|23503\|23514\|42501\|P0002)"' src` (bez `types.ts`)                                                                                                                                                                                                                                                                                                                               | 9 linii / 4 pliki                                    | tylko `faults.ts`                                                                                                                                                                                                                                                                    |
| C5  | `grep -rlE 'over_request_rate_limit\|over_email_send_rate_limit\|flow_state_\|bad_code_verifier\|pkce_code_verifier\|user_already_exists\|email_exists\|invalid_credentials\|email_not_confirmed\|weak_password\|session_expired\|refresh_token_\|session_not_found\|bad_jwt\|no_authorization\|user_not_found\|validation_failed\|anonymous_provider_disabled\|email_address_invalid\|bad_oauth' src` | 5 plików                                             | tylko `faults.ts` (komentarz `auth-rules.ts:3` przeredagowany)                                                                                                                                                                                                                       |
| C6  | `grep -rnE 'NonNullable<ReturnType<typeof createClient>>' src tests`                                                                                                                                                                                                                                                                                                                                   | 6                                                    | 0                                                                                                                                                                                                                                                                                    |
| C7  | `grep -rnE 'PostgrestError\|AuthError\|SupabaseClient\|SupabaseError\|isAuth[A-Za-z]*Error' src`                                                                                                                                                                                                                                                                                                       | 2 pliki / 7 linii (`auth-state.ts`, `log.ts`)        | tylko adapter                                                                                                                                                                                                                                                                        |
| C8  | `grep -rnE 'SUPABASE_URL\|SUPABASE_KEY' src astro.config.mjs`                                                                                                                                                                                                                                                                                                                                          | 4 pliki / 8 linii                                    | `acl/supabase/client.ts` + `astro.config.mjs`                                                                                                                                                                                                                                        |
| C9  | `grep -rlE '@supabase/\|@/lib/supabase' tests scripts`                                                                                                                                                                                                                                                                                                                                                 | 13 plików                                            | tylko: testy kontraktowe adaptera, `tests/helpers/supabase.ts`, `tests/e2e/local-supabase.ts`, `tests/setup/global-setup.ts` (celowo mówią do prawdziwej bazy) oraz `tests/unit/log.test.ts` (buduje `AuthRetryableFetchError` jako wejście raportu; może przejść na `BackendError`) |

**Egzekwowanie: ESLint, nie dependency-cruiser.** Dowód: `.dependency-cruiser.cjs:2` mówi, że nie parsuje plików `.astro`; `npm run deps` nie jest w CI (`ci.yml:50-51` uruchamia `npm run lint` i `npx astro check`). ESLint obejmuje `.astro` (`eslint.config.js`, blok `astroConfig`) i działa w CI; sonda [E] pokazała, że `no-restricted-imports` łapie import w frontmatterze `.astro`.

```js
// eslint.config.js, nowy blok po astroConfig (szkic; Faza 6)
{
  files: ["src/**/*.{ts,tsx,astro}"],
  ignores: ["src/lib/acl/supabase/**", "src/lib/backend.ts", "src/types.ts"],
  rules: {
    "no-restricted-imports": ["error", { patterns: [
      { group: ["@supabase/*"], message: "Only src/lib/acl/supabase may import the Supabase SDK." },
      { group: ["@/types"], message: "Generated database types belong to the ACL." },
      { group: ["@/lib/acl/*", "@/lib/supabase"], message: "Use createBackend from @/lib/backend." },
    ] }],
    // import("@supabase/…") in a type position is a TSImportType, which no-restricted-imports does not see (env.d.ts:3 today)
    "no-restricted-syntax": ["error", { selector: "TSImportType[argument.literal.value=/^@supabase/]", message: "Use AppUser." }],
  },
}
```

Reguła dostaje dowód celowym naruszeniem: import `@supabase/supabase-js` w pliku `.astro` i `.ts` w `src/pages` musi zgasić `npm run lint`.

### 6.2 Które pliki dziś znają zależność, a które po refaktorze

| Dziś znają (36 plików `src/`)                                                                         | Po refaktorze                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `middleware.ts`; 19 tras; `dashboard.astro`; `groups.ts`, `tasks.ts`, `checkoffs.ts`, `auth-state.ts` | **nie znają** (znają `Backend` z `@/lib/backend` i porty z `@/lib/ports`)                                                           |
| `group-errors.ts`, `task-errors.ts`, `auth-errors.ts`                                                 | **nie znają SQLSTATE ani kodów GoTrue**; zostają komunikaty i `resolve*Error`; `to*ErrorCode(error)` znikają (przejmuje je adapter) |
| `log.ts`                                                                                              | nie zna `PostgrestError`; czyta pola `BackendError` (duck-typing zostaje dla obcych obiektów)                                       |
| `env.d.ts`, `index.astro`, `Topbar.astro`                                                             | `AppUser` i `classifyAuthReturn`; żadnego importu SDK                                                                               |
| `config-status.ts`                                                                                    | `isBackendConfigured()` zamiast czytania `SUPABASE_URL/KEY`                                                                         |
| `supabase.ts`, `types.ts`                                                                             | `supabase.ts` przenosi się do `acl/supabase/client.ts`; `types.ts` importuje tylko adapter                                          |
| —                                                                                                     | **znają: `src/lib/acl/supabase/*` (7 plików) i `src/types.ts`**                                                                     |

### 6.3 Plan faz

Zgodnie z `lessons.md:12-17`: jedna faza = jedna gałąź i jeden PR; komunikaty commitów po angielsku (`lessons.md:5-10`); `/10x-impl-review` po każdej fazie (`lessons.md:98-104`). **Żadna faza nie ma migracji**, więc `release` tylko ponownie wdraża Workera, ale zamknięcie według `lessons.md:77-81` (ręczny test głównego przepływu na produkcji) obowiązuje dla Faz 2–5. Estymaty [I].

| Faza | Zakres                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Test-first?                                             | Czas         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------ |
| 0    | Decyzje D-1…D-6 (§6.6); kolejność względem innych planów (tabela niżej); sprawdzić w Sentry, czy któryś alert nie kluczuje po nazwie wyjątku `SupabaseError` (ryzyko R1)                                                                                                                                                                                                                                                                                   | —                                                       | —            |
| 1    | **Fundament, zero zmian zachowania.** `ports.ts`, `acl/supabase/{client,faults,app-user}.ts`, `backend.ts`; `src/lib/supabase.ts` zostaje cienkim re-eksportem `createClient` (Branch by Abstraction: stare i nowe fabryki żyją obok siebie); `tests/helpers/fake-backend.ts`; testy: `faults.test.ts` (tabela), kontraktowe OQ-1, OQ-4, OQ-5 (i OQ-2 jeśli plan 02 Faza 1 jest gotowa)                                                                    | **Tak.** Czerwone najpierw: tabela błędów i kontrakt    | ok. 0,5 dnia |
| 2    | **Grupy.** `GroupsPort` + adapter; migracja 6 tras `groups/*` (jedna na commit), pre-readu w `tasks/create`, odczytów w `dashboard.astro`; `group-errors.ts` traci `switch` po SQLSTATE                                                                                                                                                                                                                                                                    | **Tak:** sieć charakteryzująca tras najpierw (§ niżej)  | ok. 0,5 dnia |
| 3    | **Zadania.** `TasksPort`; 5 tras `tasks/*`, pre-read `getTask` w `checkoff`/`uncheck`, dashboard; `task-errors.ts`; `POSTGREST_MAX_ROWS` do adaptera; `toGroupTask` raz                                                                                                                                                                                                                                                                                    | **Tak**                                                 | ok. 0,5 dnia |
| 4    | **Uczestnictwo.** Jeśli plan 02 Faza 2 jest wdrożona: adapter z planu 02 dostaje klienta z `client.ts`, a `toParticipationError` woła `classifyData`. Jeśli nie: przejściowy `ParticipationPort` z dzisiejszych `checkOff`/`uncheck`/`listCheckoffPeriods` z tymi samymi raportami `checkoff.*` (`checkoffs.ts:42-49`)                                                                                                                                     | **Tak** (`checkoffs-reporting.test.ts` → test adaptera) | 1–2 godz.    |
| 5    | **Tożsamość i auth.** `AuthPort`, `AppUser`; `middleware.ts`, `env.d.ts`, 4 trasy `auth/*`, 2 callbacki, `index.astro` (`classifyAuthReturn`); `auth-errors.ts` traci `switch` i listy kodów; 5 testów integracyjnych (`auth-callback`, `auth-google-callback`, `auth-google-start-route`, `auth-signin-route`, `middleware`) i `auth-state.test.ts` przechodzi na `fakeBackend`; `auth-google-roundtrip.test.ts` zostaje (prawdziwy klient + most cookie) | **Tak**                                                 | ok. 0,5 dnia |
| 6    | **Uszczelnienie.** Usunięcie `src/lib/supabase.ts`; reguła ESLint z §6.1 + dowód celowym naruszeniem; `config-status.ts` przez `isBackendConfigured`; `log.ts` bez nazw PostgREST; dokumenty: `CLAUDE.md` (Architecture, konwencja typów), `README.md:293`, `lessons.md:133-138` (reguła staje się strukturalna), `glossary.md`                                                                                                                            | Nie (porządki i reguła, dowodzona naruszeniem)          | 2–3 godz.    |

**Bramki każdej fazy:** `npm run lint`, `npx astro check`, `npm run build`, `npm test` (lokalny stos), `npm run smoke` (rzeczywisty HTTP: trasy i HTML dashboardu, `README.md:304`); `npm run test:rls` raz jako kontrola (SQL niezmieniony). Tylko jedna sesja z bazą naraz (`CLAUDE.md:30`). Stryker zawężony: `--mutate "src/lib/acl/supabase/faults.ts"` (`CLAUDE.md`, sekcja Mutation testing); każda przeżyta mutacja w tabeli kodów to brakujący wiersz testu.

**Odwracalność.** Faza = osobny PR, rewert merge'a. W Fazach 2–5 stary i nowy styl żyją obok siebie (re-eksport z Fazy 1), więc każda trasa jest osobnym, odwracalnym commitem. Bez migracji nie ma nic, czego rollback Workera nie cofnie.

**Kolejność względem innych planów:**

| Plan                                                  | Nakładanie                                                                                                         | Rekomendacja                                                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `02-invariant-aggregate-refactor.md`                  | Faza 2 tworzy `src/lib/participation.ts` z `ParticipationRepository(supabase, ids)` i własnym tłumaczeniem `SB4xx` | **Fazy 1–3 tego planu przed Fazą 2 planu 02**, żeby adapter planu 02 trafił od razu do ACL i czytał `classifyData`. Odwrotnie też działa (Faza 4 jest wtedy jednolinijkowa)                                                       |
| `refactor-opportunities` Faza 3 (sieć 13 tras, OPP-1) | Fixture to łańcuch wywołań supabase-js (`research.md` OPP-1: „Write the fake against the supabase-js call chain”)  | **Sieć najpierw** (opisuje wejście→wyjście tras; Fazy 2–3 tego planu migrują trasy tylko z siatką, bo 11 z 13 handlerów nie ma dziś testu, D9). Jej fixture to jeden helper; Fazy 2–5 podmieniają go na `fakeBackend` jednorazowo |
| OPP-7 (szkielet trasy), OPP-8 (jeden klient)          | Po ACL są zmianami w `backend.ts` i middleware                                                                     | Po tym planie. Plan celowo zachowuje 21 wywołań fabryki                                                                                                                                                                           |
| OPP-6 (ślad zerowych wierszy)                         | `no_effect` to jedno miejsce                                                                                       | Po Fazach 2–3                                                                                                                                                                                                                     |

Równoległe worktree (`lessons.md:119-124`): fazy dzielą `ports.ts` i `backend.ts` (wspólny moduł), więc **nie są niezależne**, idą sekwencyjnie.

### 6.4 Nowe nazwy „load-bearing” do zarejestrowania

Repo nie prowadzi rejestru kontraktów (brak `docs/`, jak w planie 02 §8). Terminy domenowe idą do `glossary.md`, reszta do `CLAUDE.md` i `README.md`.

| Rodzaj               | Nazwa                                                                                                                                               | Dlaczego nie wolno jej zmienić bez śladu                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Typ domeny           | `AppUser` (glosariusz: „Użytkownik”, `locals.user`; „Nie nazywaj”: `User` z SDK poza adapterem)                                                     | Kontrakt `App.Locals`                                                     |
| TS                   | `Backend`, `AuthPort`, `GroupsPort`, `TasksPort`, `ParticipationPort`, `BackendError`, `createBackend`, `isBackendConfigured`, `classifyAuthReturn` | API między trasą a adapterem                                              |
| Katalog              | `src/lib/acl/supabase/`                                                                                                                             | Jedyny dozwolony importer SDK; cel reguły ESLint                          |
| ESLint               | blok „ACL” w `eslint.config.js`                                                                                                                     | Egzekwuje kryterium C1–C3 w CI                                            |
| Zdarzenia logów      | **bez zmian**: `groups.*`, `tasks.*`, `auth.*`, `checkoff.*`, `uncheck.*` (`README.md:287`)                                                         | Grupowanie błędów w Sentry kluczuje po zdarzeniu i SQLSTATE (`log.ts:81`) |
| HTTP, przekierowania | **bez zmian**                                                                                                                                       | Smoke i testy tras                                                        |

### 6.5 Ryzyka

- **R1. Zmiana kształtu telemetrii.** Błąd z adaptera to `BackendError` (instancja `Error` ze stosem w ramkach adaptera), a nie goły obiekt PostgREST, więc gałąź `name: "SupabaseError"` (`log.ts:75`) przestaje dotyczyć błędów z adaptera. Odcisk `[event, code]` (`log.ts:81`) się nie zmienia, więc grupowanie zostaje. Alert kluczowany po nazwie wyjątku przestałby działać: sprawdzić w Fazie 0 [U].
- **R2. Granica abstrakcji.** Port nie ukryje, że autoryzacja jest w RLS (§2). Zabezpieczenie: semantyka w JSDoc portu i w testach kontraktowych, które są specyfikacją dla przyszłego adaptera.
- **R3. Most cookie przy PKCE.** Weryfikator PKCE jest zapisywany w trakcie `signInWithOAuth` i musi jechać na tej samej odpowiedzi (`auth/google.ts:7-9`, komentarz trasy). Adapter musi `await`-ować przed zwróceniem przekierowania. Pokrywają to `auth-google-roundtrip.test.ts` i smoke (Faza 5).
- **R4. Dwa klienty na żądanie zostają** (OPP-8): świadomie poza zakresem.
- **R5. Przejściowa duplikacja** (re-eksport + nowy styl). Ogranicza: jedna trasa na commit i uszczelnienie w Fazie 6.
- **R6. Churn testów:** 9 plików zmienia fixture; `auth-google-roundtrip.test.ts` zostaje.
- **R7. `dashboard.astro` nie ma testu** (OPP-2 dotyczy tylko jego raportowania): zmiany w Fazach 2–3 chroni smoke (asercje na HTML po każdej akcji) i ręczny przegląd.
- **R8. Zachowana dziwność** (§4.4): błąd unikatu z zadania daje `already_in_group`. Plan to zachowuje, żeby refaktor pozostał neutralny.

### 6.6 Decyzje właściciela

| ID  | Pytanie                                                                                                                                                                                                                                                                                                                                  | Rekomendacja                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Skoro dokumenty nie obiecują wymienialności Supabase, czy ten koszt (ok. 2,5–3 dni [I]) jest uzasadniony spójnością błędów, testowalnością i strukturalnym egzekwowaniem `lessons.md:133-138`? Research ocenia strukturalne zmiany jako drogie i opłacalne, „only if routes keep multiplying” (`refactor-opportunities/research.md:353`) | Tak dla **Faz 1–3 i 6** (zamykają ranking #5 destylacji: `grep` SQLSTATE w jednym pliku, oraz kontrakt zerowych wierszy w jednym miejscu). **Fazy 4–5 po decyzji**: auth jest stabilny od S-07, uczestnictwo ma własny plan (02) |
| D-2 | Nazwa katalogu: `src/lib/acl/supabase/` czy `src/lib/backend/`                                                                                                                                                                                                                                                                           | `acl/supabase/`: nazwa sama jest kryterium grep i celem reguły ESLint                                                                                                                                                            |
| D-3 | Przejść na `count: "estimated"` (lub `exact`) zamiast stałej 1000 (OQ-3)?                                                                                                                                                                                                                                                                | Nie teraz; dopiero po teście kontraktowym. Jeśli tak, `estimated`: dokładny do `max_rows`, tani powyżej                                                                                                                          |
| D-4 | Gdzie raportować: adapter czy trasa?                                                                                                                                                                                                                                                                                                     | Trasa (zachowuje `requestFields(context)` i nazwy zdarzeń); adapter raportuje tylko to, co raportuje dziś biblioteka (`checkoff.*`)                                                                                              |
| D-5 | Poprawić dziwność z §4.4 (unikat z zadania = `already_in_group`)?                                                                                                                                                                                                                                                                        | Osobno, po planie; tu charakteryzacja                                                                                                                                                                                            |
| D-6 | Kolejność względem planu 02 (tabela w §6.3)                                                                                                                                                                                                                                                                                              | Fazy 1–3 planu 03 pierwsze                                                                                                                                                                                                       |

### Czego plan nie rusza

Schemat, migracje, RLS i `supabase/checks/rls-scenarios.sql`; `tests/helpers/supabase.ts` i testy RLS (celowo używają prawdziwej bazy); Astro (`APIRoute`, `AstroCookies`; 5 plików `src/lib` z typami Astro to osobny, mniejszy temat); Sentry (już za `log.ts` i `sentry.ts`); `lucide-react`, `radix-ui`, `clsx`; nazwy kolumn w DTO (`join_code`, `owner_id`, `user_id`: zmiana nazw to osobna decyzja); `auth-rules.ts` (`MIN_PASSWORD_LENGTH = 6` powiela `supabase/config.toml:175`, `MAX_PASSWORD_LENGTH = 72` to limit dostawcy; walidacja formularza ich potrzebuje po stronie klienta, a hostowane ustawienie może się różnić od lokalnego [U]); liczba klientów na żądanie (OPP-8); szkielet trasy (OPP-7).

### Co dalej

Wejście do `/10x-new supabase-acl` → `/10x-research` → `/10x-plan` (`lessons.md:63`). Plan 02 i ten plan dzielą `faults.ts`, więc w `/10x-plan` warto zapisać ich kolejność jawnie.
