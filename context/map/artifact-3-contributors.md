# Artifact 3 — Kontrybutorzy w wybranych obszarach

Stan na: 2026-10-05, HEAD `d03c673`. Wejście: `artifact-1-territory.md`, `artifact-2-structure.md`. Podane są wyłącznie nazwy autorów, bez adresów e-mail.

## Główny wniosek

**W całym repo jest jeden kontrybutor: Mariusz Złotucha.** Wiedza w każdym z pięciu obszarów jest w pełni skupiona u tej osoby. Nie da się z historii Gita wskazać nikogo drugiego, z kim można by się skontaktować w sprawie bugfixów, migracji, uprawnień czy integracji.

## Metoda i filtry

- Zakres: `git log --no-merges` (192 commity) dla ścieżek danego obszaru. Cała historia to ~3 tygodnie (2026-09-16 → 2026-10-05), więc okno 12 miesięcy obejmuje 100% commitów (patrz artefakt 1).
- **Filtr botów i automatyzacji:** autorzy i committerzy to w 100% ta sama osoba (`git log --format=%an` i `%cn`: 192 × Mariusz Złotucha). Nie ma autorów-botów (`dependabot`, `github-actions` itp.) ani autorów-agentów AI. Filtr nie usunął żadnego commita.
- **Commity agenta jako współautora zostały zachowane**, zgodnie z zasadą: 175 z 192 commitów ma w treści `Co-Authored-By: Claude Sonnet 5` (48) lub `Claude Sonnet 5.5` (127). Człowiek jest ich autorem w Gicie, a agent tylko współautorem.
- 17 commitów nie ma stopki współautora. To głównie `chore(archive)`, dodawanie skilli i `init` (np. `a72c2e9`, `4352d5d`, `2a1d8bf`). Nie dotyczą one pięciu obszarów poza `init`.
- `git blame -w` (HEAD) liczy linie według autora Gita. Daje 100% dla tej samej osoby w każdym obszarze.

### Ograniczenie interpretacyjne

Autorstwo w Gicie nie mówi, kto faktycznie napisał kod. 175 z 192 commitów to współpraca z agentem, a `blame` przypisuje wszystkie linie człowiekowi. Nie mogę z samej historii rozróżnić, które decyzje podjął człowiek, a które zaproponował agent. Jedyny sygnał to liczba commitów ze współautorem Claude.

---

## Obszary

### 1. Sesja i auth

Ścieżki: `src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*`, `src/pages/auth/callback.ts`, `src/lib/{auth-state,auth-rules,auth-errors}.ts`.

| Pole              | Wartość                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kontrybutorzy     | Mariusz Złotucha: 13 commitów (100%)                                                                                                                                                             |
| Współautor Claude | 12 z 13 (brak tylko w `init`)                                                                                                                                                                    |
| Linie w HEAD      | 345 (100% jedna osoba)                                                                                                                                                                           |
| Zakres dat        | 2026-09-16 → 2026-10-02                                                                                                                                                                          |
| Typy commitów     | feat 10, fix 2, init 1                                                                                                                                                                           |
| Tematy (slice'y)  | `observability-swallowed-errors` (4), `ui-styles-audit` (2), `signup-error-codes` (2), `group-create-join-manage` (2), `task-create-and-manage` (1), `release-automation-and-auth-hardening` (1) |
| Bugfixy           | `49d9160` (2026-10-02, triage review fazy 1 observability), `641f6d4` (2026-09-25, poprawki review fazy 2 grup)                                                                                  |

Dowód: `git log --no-merges -- <ścieżki>`, `git blame --line-porcelain -w`.

Osoby związane z edge case'ami: Mariusz Złotucha (jedyna). Edge case'y obsłużone w tym obszarze to m.in. rozróżnienie awarii Auth (503) od braku sesji (302) w middleware (slice `observability-swallowed-errors`) oraz kody błędów rejestracji (slice `signup-error-codes`, commit `c785072` ogranicza długość zapamiętanego e-maila).

Wiedza: **skupiona** (1 osoba, w tym 100% linii).

### 2. Baza i uprawnienia

Ścieżki: `supabase/migrations/`, `supabase/checks/` (w tym `rls-scenarios.sql`), `src/types.ts`.

| Pole              | Wartość                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kontrybutorzy     | Mariusz Złotucha: 11 commitów (100%)                                                                                                                                           |
| Współautor Claude | 11 z 11                                                                                                                                                                        |
| Linie w HEAD      | 2192 (100% jedna osoba)                                                                                                                                                        |
| Zakres dat        | 2026-09-25 → 2026-10-01                                                                                                                                                        |
| Typy commitów     | feat 7, fix 4                                                                                                                                                                  |
| Tematy (slice'y)  | `task-join-and-leave` (3), `group-rls-hardening` (3), `task-create-and-manage` (2), `group-schema-and-rls` (1), `group-create-join-manage` (1), `checkoff-and-leaderboard` (1) |
| Bugfixy           | `a548bdb` (CHECK na `groups.name`), `38d5eee`, `db0f1ff`, `9a3385e` (poprawki z review slice'ów zadań)                                                                         |

Dowód: ten sam zestaw poleceń. Uwaga: w artefakcie 1 pojawia się liczba 10 dla samego `supabase/migrations`. Tu jest 11, bo doliczono `supabase/checks` i `src/types.ts`.

Osoby związane z migracjami i uprawnieniami (RLS, triggery, widok `task_checkoff_periods`): Mariusz Złotucha (jedyna). To obszar o najwyższym udziale poprawek po review: 4 z 11 commitów to `fix`, a trzy slice'e (`group-rls-hardening`, `task-create-and-manage`, `task-join-and-leave`) wracały do migracji po przeglądzie.

Wiedza: **skupiona** (1 osoba). Ryzyko jest podwyższone, bo logika uprawnień siedzi w SQL, a artefakt 2 pokazał, że graf importów jej nie widzi.

### 3. Reguła check-offów i rankingu

Ścieżki: `src/lib/{streak-rules,leaderboard-rules,checkoffs,checkoff-sync,checkoff-client,checkoff-response}.ts`, `src/components/tasks/{CheckoffControl,Leaderboard}.tsx`.

| Pole              | Wartość                                                              |
| ----------------- | -------------------------------------------------------------------- |
| Kontrybutorzy     | Mariusz Złotucha: 8 commitów (100%)                                  |
| Współautor Claude | 8 z 8                                                                |
| Linie w HEAD      | 721 (100% jedna osoba)                                               |
| Zakres dat        | 2026-10-01 → 2026-10-02 (dwa dni)                                    |
| Typy commitów     | feat 6, docs 2                                                       |
| Tematy (slice'y)  | `checkoff-and-leaderboard` (6), `observability-swallowed-errors` (2) |
| Bugfixy           | brak commitów `fix` dotykających tych ścieżek                        |

Dowód: ten sam zestaw poleceń.

Osoby związane z edge case'ami: Mariusz Złotucha (jedyna). Znany edge case to wrażliwość reguły streaków na strefę czasową. `vitest.config.ts` wymusza `TZ=America/Los_Angeles`, żeby ujawniać błędy zależne od strefy.

Wiedza: **skupiona**, a historia jest **płytka**: cały obszar powstał w ciągu dwóch dni, a brak commitów `fix` oznacza brak historii napraw, nie brak błędów (unknown).

### 4. `src/pages/dashboard.astro`

| Pole              | Wartość                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Kontrybutorzy     | Mariusz Złotucha: 12 commitów (100%)                                                                                    |
| Współautor Claude | 11 z 12 (brak tylko w `init`)                                                                                           |
| Linie w HEAD      | 455 (100% jedna osoba)                                                                                                  |
| Zakres dat        | 2026-09-16 → 2026-10-01                                                                                                 |
| Typy commitów     | feat 7, fix 4, init 1                                                                                                   |
| Tematy (slice'y)  | `group-create-join-manage` (5), `task-join-and-leave` (2), `task-create-and-manage` (2), `checkoff-and-leaderboard` (2) |
| Bugfixy           | `641f6d4`, `46c9b49`, `86400f7`, `7445ad0` (wszystkie to poprawki z review faz)                                         |

Dowód: ten sam zestaw poleceń.

Osoby związane z tym plikiem: Mariusz Złotucha (jedyna). Plik rośnie z każdym slice'em (grupy → zadania → check-off) i 4 z 12 commitów to poprawki po review. To jedyny widok chroniony, więc każdy nowy slice musi go zmienić.

Wiedza: **skupiona** w jednej osobie i **nagromadzona w jednym pliku** (22 zależności, patrz artefakt 2).

### 5. Obserwowalność

Ścieżki: `src/lib/{log,sentry,sentry-options,redact}.ts`.

| Pole              | Wartość                              |
| ----------------- | ------------------------------------ |
| Kontrybutorzy     | Mariusz Złotucha: 3 commity (100%)   |
| Współautor Claude | 3 z 3                                |
| Linie w HEAD      | 214 (100% jedna osoba)               |
| Zakres dat        | 2026-10-02 (jeden dzień)             |
| Typy commitów     | feat 2, fix 1                        |
| Tematy (slice'y)  | `observability-swallowed-errors` (3) |
| Bugfixy           | `49d9160` (triage review fazy 1)     |

Dowód: ten sam zestaw poleceń.

Osoby związane z integracją Sentry (Cloudflare Workers): Mariusz Złotucha (jedyna). Integracja powstała w jeden dzień (`c01d4b7`, `5cf7a3c`, `280b11e`).

Wiedza: **skupiona**, a historia jest **najkrótsza** ze wszystkich pięciu obszarów.

---

## Skupiona czy rozproszona wiedza

| Obszar             | Kontrybutorów | Ocena                                                   |
| ------------------ | ------------: | ------------------------------------------------------- |
| Sesja i auth       |             1 | skupiona                                                |
| Baza i uprawnienia |             1 | skupiona (podwyższone ryzyko: SQL poza grafem importów) |
| Reguła check-offów |             1 | skupiona, historia płytka                               |
| `dashboard.astro`  |             1 | skupiona, jeden duży plik                               |
| Obserwowalność     |             1 | skupiona, najkrótsza historia                           |

Żaden obszar nie ma rozproszonej wiedzy. Różnica między obszarami to głównie liczba commitów, wiek i udział poprawek po review (baza: 4 z 11, `dashboard.astro`: 4 z 12).

## Unknowns

1. **Jeden autor w Gicie:** nie ma z kim rozmawiać „o obszarze" poza właścicielem repo. Ranking kontrybutorów jest pusty z założenia.
2. **Rzeczywiste autorstwo decyzji:** 175 z 192 commitów to współpraca z agentem. Z historii nie wynika, które decyzje projektowe (np. polityki RLS, reguła streaków) podjął człowiek, a które zaproponował agent.
3. **Wiedza poza Gitem:** nie sprawdzono pull requestów, komentarzy w review, issue ani czatów (nie używałem GitHub CLI). W `context/` są dokumenty procesu (plany, review, lessons), które mogą zawierać uzasadnienia decyzji, ale nie czytałem ich treści.
4. **Okno 3 tygodni:** brak historii, która pozwoliłaby zobaczyć rotację kontrybutorów, ich odejścia czy powroty.
5. **Brak revertów i hotfixów** (artefakt 1) ogranicza listę „osób związanych z bugfixami" do poprawek z zaplanowanego review. Nie ma śladu osób reagujących na awarie produkcyjne.
6. **Nazwa autora w Gicie** (`user.name`) może nie odpowiadać jednej osobie fizycznej (np. konto współdzielone). Nie mam jak tego sprawdzić.
