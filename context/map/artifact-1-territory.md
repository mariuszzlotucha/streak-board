# Artifact 1 — Terytorium repozytorium (historia Gita)

Stan na: 2026-10-05, HEAD `d03c673`. Źródło: wyłącznie `git log` (bez GitHub CLI).

## Zastrzeżenie o oknie czasowym

Prośba dotyczyła 12 miesięcy, ale **cała historia repo to ~3 tygodnie**: pierwszy commit `2a1d8bf` ("init") z 2026-09-16, ostatni z 2026-10-05. Okno 12 miesięcy obejmuje więc 100% historii: 263 commity, w tym 71 merge'y PR i 192 commity nie-merge. Wszystkie 263 commity ma ten sam autor (Mariusz Złotucha), a boty i commity masowego formatowania nie występują.

Konsekwencje:

- Pojęcia „sezonowy" i „wygasający" mają tu tylko sens względem tygodni, nie miesięcy.
- Trend oznacza różnicę między 3 pełnymi tygodniami a 1 dniem (tydz. 4), więc to szkic, nie wzorzec.

## Metoda i filtry

- Zakres: `git log --since='12 months ago' --no-merges --name-status --no-renames` (192 commity).
- Wykluczone: `package-lock.json`, `src/types.ts` (generowany z bazy), `*.snap`, `.env*`, grafiki, `.astro/`.
  - Nie znaleziono: snapshotów, dotenvów, grafik ani commitów masowego formatowania. Filtry były więc zabezpieczeniem, a nie faktycznym odsiewem.
  - Nie wykluczono commitów typu `chore` ani `docs`. Nie ma w nich botów, tylko ręczna praca autora i agentów.
- Duże commity feature'owe zostały zachowane.
- `--no-renames` jest świadome, żeby `D` pokazywało usunięcia z danej ścieżki. Przeniesienia `context/changes/` → `context/archive/` wyglądają więc jak usunięcia plus dodania (patrz sekcja 8).

### Najważniejsze zniekształcenie: repo jest w dużej części dokumentacją procesu

Commity dotyczą w przeważającej mierze `context/` (plany, change.md, roadmap, lessons), czyli artefaktów workflow 10x. W sekcjach 1–2 podaję więc **dwie perspektywy**: całość oraz sam kod produktu (`src/`, `tests/`, `supabase/`, `scripts/`, `.github/`).

---

## 1. TOP 10 folderów/modułów

### 1a. Całość (liczba wpisów plików w commitach, po filtrach)

| #   | Folder               | Zmiany |
| --- | -------------------- | -----: |
| 1   | `context/changes`    |    287 |
| 2   | `context/archive`    |    107 |
| 3   | `src/pages`          |     69 |
| 4   | `context/foundation` |     65 |
| 5   | `src/components`     |     57 |
| 6   | `src/lib`            |     49 |
| 7   | `tests/integration`  |     23 |
| 8   | `context/audits`     |     20 |
| 9   | `tests/unit`         |     17 |
| 10  | `.claude/skills`     |     15 |

Dowód: pipeline `git log --name-only` zliczający 2 pierwsze poziomy ścieżki. `context/changes` i `context/archive` zawierają w dużej części te same pliki, które zostały przeniesione (patrz sekcja 8), więc zawyżają się nawzajem.

### 1b. Tylko kod produktu (pełna historia, foldery bezpośrednie)

| #   | Folder                 | Zmiany |
| --- | ---------------------- | -----: |
| 1   | `src/lib`              |     49 |
| 2   | `tests/integration`    |     23 |
| 3   | `scripts`              |     19 |
| 4   | `src/components/auth`  |     18 |
| 5   | `tests/unit`           |     17 |
| 6   | `src/pages/api/groups` |     16 |
| 7   | `src/pages/api/tasks`  |     15 |
| 8   | `src/pages/api/auth`   |     13 |
| 9   | `src/pages`            |     13 |
| 10  | `supabase/migrations`  |     11 |

Dowód: ten sam log, ograniczony do `src|tests|supabase|scripts|.github`. Pozycje 11–12 to `src/pages/auth` (10) i `src/components/tasks` (10).

**Wniosek:** gorącym centrum kodu jest `src/lib` (logika reguł i warstwa serwerowa). Obok niego ważne są testy i `scripts`.

## 2. TOP 10 plików

### 2a. Całość

| #   | Plik                                                            | Commity |
| --- | --------------------------------------------------------------- | ------: |
| 1   | `context/foundation/roadmap.md`                                 |      28 |
| 2   | `context/foundation/lessons.md`                                 |      24 |
| 3   | `context/changes/deployment/deployment-plan.md`                 |      24 |
| 4   | `CLAUDE.md`                                                     |      23 |
| 5   | `README.md`                                                     |      20 |
| 6   | `scripts/smoke.mjs`                                             |      19 |
| 7   | `context/changes/release-automation-and-auth-hardening/plan.md` |      18 |
| 8   | `context/changes/checkoff-and-leaderboard/plan.md`              |      15 |
| 9   | `src/pages/dashboard.astro`                                     |      12 |
| 10  | `.claude/.10x-cli-manifest.json`                                |      12 |

Uwaga: pozycja 3 to wspólny plan wdrożeń, który nadal istnieje w `context/changes/deployment/` (nie został zarchiwizowany) i jest edytowany przy każdym slice'u. `.claude/.10x-cli-manifest.json` to prawdopodobnie plik aktualizowany automatycznie przez CLI kursu. Nie jest to praca nad produktem.

### 2b. Tylko kod produktu

| #   | Plik                                 | Commity |
| --- | ------------------------------------ | ------: |
| 1   | `scripts/smoke.mjs`                  |      19 |
| 2   | `src/pages/dashboard.astro`          |      12 |
| 3   | `package.json`                       |       9 |
| 4   | `tests/helpers/supabase.ts`          |       8 |
| 5   | `supabase/checks/rls-scenarios.sql`  |       8 |
| 6   | `src/middleware.ts`                  |       7 |
| 7   | `src/lib/tasks.ts`                   |       6 |
| 8   | `src/pages/api/auth/signin.ts`       |       5 |
| 9   | `src/pages/api/auth/signup.ts`       |       5 |
| 10  | `src/components/auth/SignUpForm.tsx` |       5 |

Dowód: licznik plików z `git log --name-only`, po odrzuceniu ścieżek `context/` i `.claude/`.

**Wniosek:** najbardziej zmienne pliki kodu to `scripts/smoke.mjs` (test dymny, dopisywany do każdej funkcji) i `dashboard.astro` (jedyny widok chroniony, do którego trafia każdy nowy slice).

## 3. Aktywność w czasie

Tygodnie od poniedziałku. Tydzień 4 to jeden dzień (2026-10-05), więc jest niemiarodajny.

| Tydzień (pon.)       | Commity nie-merge |
| -------------------- | ----------------: |
| 2026-09-14           |                11 |
| 2026-09-21           |                47 |
| 2026-09-28           |               133 |
| 2026-10-05 (1 dzień) |                 1 |

Dowód: `git log --format=%ad` z grupowaniem po tygodniu. Do 2026-09-30 commity dotyczyły głównie dokumentów, a od 2026-10-01 pojawiło się ich wyraźnie więcej (część to sekwencje drobnych commitów review). Nie wiem, czy ta kumulacja to tempo pracy, czy artefakt metody (jeden commit na fazę planu, osobny commit na poprawki z review).

## 4. Obszary: stałe, rosnące, wygasające

Liczba commitów dotykających obszaru, w tygodniach [09-14, 09-21, 09-28, 10-05]:

| Obszar                    | Suma | Tygodnie      | Klasyfikacja                  |
| ------------------------- | ---: | ------------- | ----------------------------- |
| `context/changes+archive` |  148 | 4, 35, 109, 0 | rosnący (proces)              |
| `context/foundation`      |   59 | 2, 16, 41, 0  | rosnący (proces)              |
| `src/lib`                 |   25 | 1, 8, 16, 0   | **rosnący**                   |
| `supabase/migrations`     |   10 | 0, 4, 6, 0    | **rosnący**                   |
| `tests/integration`       |   17 | 0, 0, 17, 0   | **nowy** (od 2026-09-28)      |
| `tests/unit`              |   10 | 0, 0, 10, 0   | **nowy**                      |
| `tests/helpers`           |    8 | 0, 0, 8, 0    | **nowy**                      |
| `src/pages/api/tasks`     |    5 | 0, 0, 5, 0    | **nowy** (slice zadań)        |
| `scripts`                 |   19 | 1, 9, 9, 0    | stały                         |
| `src/components`          |   20 | 1, 12, 7, 0   | wygasający                    |
| `src/pages` (widoki)      |   18 | 1, 10, 7, 0   | wygasający                    |
| `src/pages/api/groups`    |    7 | 0, 6, 1, 0    | wygasający (slice zakończony) |
| `src/pages/api/auth`      |    8 | 1, 5, 2, 0    | wygasający                    |

Dowód: skrypt przypisujący pliki do obszarów po prefiksie ścieżki i zliczający po tygodniu (nie-merge, bez plików wykluczonych).

- **Sezonowe:** brak. Okno ~3 tygodnie nie pozwala tego ocenić (unknown).
- Obszary „wygasające" odzwierciedlają kolejność slice'ów (grupy → zadania → check-off), nie porzucenie kodu. Dashboard i `src/components/tasks` zostaną ruszone przy kolejnych slice'ach.

## 5. Fix / revert / hotfix

- **Revert:** 0 commitów (`git log --all -i --grep=revert` → 0).
- **Hotfix:** 0 commitów.
- **Fix:** 21 z 192 commitów nie-merge (**11%**). Rozkład typów: docs 80, chore 37, feat 33, fix 21, test 3, inne 18.

Dowód: `git log --no-merges --format=%s`, klasyfikacja po prefiksie Conventional Commits.

**Wniosek:** 19 z 21 commitów `fix` to „apply phase N review findings" / „apply full-plan review findings" (np. `db0f1ff`, `067ab77`, `0f5332a`, `9a3385e`). Są to zaplanowane poprawki po przeglądzie kodu, a nie awarie z produkcji. Tylko 2 `fix` wyglądają na korektę zachowania poza pętlą review:

- `35b08ea` (branding landing page),
- `c785072` (limit długości zapamiętanego e-maila).

Jedyna zmiana z `fix` o charakterze defensywnym w bazie: `a548bdb` (CHECK na `groups.name`).

**Unknown:** nie wiem, ile defektów wykryto na produkcji. W historii nie ma commitów typu revert ani hotfix, ale brak śladu nie dowodzi braku błędów, zwłaszcza że aplikacja jest młoda (wdrożenie to tydzień 2–3). Repo nie ma też zewnętrznego trackera zgłoszeń w tym materiale.

## 6. Obszary zmieniające się razem

Poziom: obszar (nie plik). Liczone tylko dla kodu produktu (bez `context/`).

### Pary

| Commity | Para                                    |
| ------: | --------------------------------------- |
|      14 | `src/components` + `src/pages` (widoki) |
|      14 | `scripts` + `src/lib`                   |
|      14 | `scripts` + `src/pages` (widoki)        |
|      13 | `scripts` + `src/components`            |
|      12 | `src/components` + `src/lib`            |
|      12 | `agent-tooling` + `root-config/docs`    |
|      12 | `src/lib` + `src/pages` (widoki)        |
|      10 | `src/lib` + `tests/unit`                |
|       7 | `src/lib` + `src/pages/api/auth`        |
|       7 | `tests/helpers` + `tests/integration`   |

### Trójki

| Commity | Trójka                                                |
| ------: | ----------------------------------------------------- |
|      11 | `scripts` + `src/components` + `src/pages` (widoki)   |
|      11 | `scripts` + `src/lib` + `src/pages` (widoki)          |
|      10 | `src/components` + `src/lib` + `src/pages` (widoki)   |
|      10 | `scripts` + `src/components` + `src/lib`              |
|       6 | `scripts` + `src/lib` + `src/pages/api/auth`          |
|       6 | `scripts` + `src/components` + `src/pages/api/groups` |

Dowód: zliczenie kombinacji obszarów w ramach jednego commita.

**Wniosek:** typowy slice dotyka jednocześnie `src/lib` (logika), widoków + komponentów (UI) i `scripts/smoke.mjs` (test dymny). Test dymny jest więc sprzężony z każdą zmianą UI i logiki. Para `src/lib` + `tests/unit` (10 commitów) sugeruje, że testy jednostkowe powstają razem z regułami, ale tylko od tygodnia 3.

**Unknown:** obserwacja dotyczy wspólnych commitów, nie zależności w kodzie. Zależności mierzy artefakt 2.

## 7. Pliki zmieniające się z wieloma obszarami

Liczba innych obszarów kodu produktu, z którymi plik był zmieniany w tym samym commicie:

| Plik                            | Inne obszary | Commity |
| ------------------------------- | -----------: | ------: |
| `README.md`                     |           18 |      20 |
| `CLAUDE.md`                     |           17 |      23 |
| `package.json`                  |           16 |       9 |
| `scripts/smoke.mjs`             |           16 |      19 |
| `src/middleware.ts`             |           15 |       7 |
| `src/pages/api/auth/signin.ts`  |           15 |       5 |
| `src/pages/api/auth/signout.ts` |           15 |       3 |
| `src/pages/api/auth/signup.ts`  |           15 |       5 |
| `eslint.config.js`              |           14 |       3 |
| `src/env.d.ts`                  |           13 |       2 |

Dowód: dla każdego pliku suma obszarów występujących w tych samych commitach.

**Wnioski:**

- `README.md`, `CLAUDE.md` i `package.json` to centra dokumentacji i konfiguracji, które dotykają wszystkie slice'y.
- `scripts/smoke.mjs` i `src/middleware.ts` są jedynymi plikami kodu z prawdziwie przekrojowym zasięgiem.
- Trzy pliki `src/pages/api/auth/*` mają wysoki wskaźnik, ale tylko 3–5 commitów. Zmieniły się w kilku dużych commitach (m.in. `init` i hartowanie auth), co zawyża liczbę „innych obszarów".

**Unknown:** wynik dla `signin`, `signup` i `signout` może być artefaktem ich obecności w commicie `init` (1494 zmienione linie).

## 8. Pliki obecne w historii, ale nieistniejące dziś

Łącznie **111** ścieżek, które wystąpiły w historii z operacją `D` (usunięte) i nie ma ich w HEAD.

| Grupa                                                                     | Liczba | Dowód                                                                |
| ------------------------------------------------------------------------- | -----: | -------------------------------------------------------------------- |
| `context/changes/...` (pliki przeniesione do `context/archive/`)          |    106 | 114 przeniesień `R` w `context/changes` (`git log -M --name-status`) |
| `.agents/skills/design-mobile-apps/`, `.agents/skills/reddit-automation/` |      2 | `0b5e5f4` (2026-09-25)                                               |
| `.claude/skills/design-mobile-apps`, `.claude/skills/reddit-automation`   |      2 | `0b5e5f4` (2026-09-25)                                               |
| `CLAUDE.md.scaffold`                                                      |      1 | `ec3aa8a` (2026-09-17)                                               |

**Wnioski:**

- Z kodu produktu nie usunięto żadnego pliku `src/`, `tests/`, `supabase/` ani `scripts/`.
- Wszystkie usunięcia poza `context/` to porządkowanie narzędzi agenta i szkieletu `CLAUDE.md.scaffold`.
- Wpisy o `context/changes/...` to głównie archiwizacja zmian (przeniesienie zakończonych slice'ów do `context/archive/`). `context/changes/deployment/deployment-plan.md` do nich nie należy: nadal leży w `context/changes/`.

**Unknown:** nie sprawdzałem, czy któryś z 106 plików archiwalnych został usunięty (a nie tylko przeniesiony), bo wymagałoby to porównania zawartości `context/archive/` z listą `D`.

---

## 9. Największe zmiany feature'owe (kod, `src/`+`supabase/`+`tests/`+`scripts/`)

| Zmienione linie | Commit                 | Opis                                                               |
| --------------: | ---------------------- | ------------------------------------------------------------------ |
|            1494 | `2a1d8bf` (2026-09-16) | init                                                               |
|            1006 | `4fcfdc3` (2026-10-01) | check-off: tabela, RLS i widok odczytu (p2)                        |
|             973 | `c435901` (2026-10-01) | reguła streaków i logika rankingu (p1)                             |
|             699 | `05cc307` (2026-10-01) | warstwa serwerowa check-off i undo (p3)                            |
|             679 | `c01d4b7` (2026-10-02) | helper raportowania błędów i obsługa awarii auth w middleware (p1) |
|             625 | `c5fd44b` (2026-09-25) | widok grupy, link zaproszenia, wyjście i zmiana nazwy (p3)         |
|             585 | `c80cf77` (2026-09-25) | tworzenie grupy i dołączanie linkiem/kodem (p2)                    |
|             568 | `7e97a84` (2026-09-30) | tabela `tasks` i RLS (p1)                                          |

Slice'y z największą liczbą commitów (z prefiksu `type(scope)`): `release-automation-and-auth-hardening` (18), `checkoff-and-leaderboard` (16), `testing-runner-data-isolation-and-permissions` (13), `task-create-and-manage` (13), `group-create-join-manage` (12).

**Wniosek:** reguły biznesowe (`streak-rules.ts`, `leaderboard-rules.ts`) powstały w pojedynczych dużych commitach, więc ich historia jest płytka.

---

## Zbiorcze unknowns

1. **Okno 3 tygodnie zamiast 12 miesięcy:** trendy, sezonowość i „wygasanie" to szkic, nie wzorzec.
2. **Jeden autor (263/263 commitów):** bus factor nie da się z tych danych ocenić, a artefakt 3 będzie mało zróżnicowany.
3. **Brak revertów i hotfixów:** nie dowodzi to braku defektów produkcyjnych. Brakuje danych o incydentach (issues, Sentry, logi wdrożeń).
4. **Rozmiar commitów nie odpowiada rozmiarowi pracy:** repo wymusza workflow „jedna faza = jeden commit + commit poprawek z review", więc liczba commitów mierzy proces.
5. **Zawyżone liczby w `context/`:** archiwizacja (114 przeniesień) powiela te same pliki w `context/changes` i `context/archive`.
6. **Nie sprawdzono:** treści diffów, jakości testów, rzeczywistych zależności między modułami (artefakt 2) ani udziału poszczególnych kontrybutorów (artefakt 3).
7. **`.claude/.10x-cli-manifest.json` (12 commitów):** prawdopodobnie automatyczny plik narzędzi kursu. Nie wykluczyłem go z tabeli 2a, tylko oznaczyłem.
