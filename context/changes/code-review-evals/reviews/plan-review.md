<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Ewaluacje i utwardzenie AI-recenzenta

- **Plan**: `context/changes/code-review-evals/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-16
- **Verdict**: REVISE
- **Verdict after triage**: SOUND (all 10 findings fixed in the plan and the brief)
- **Findings**: 0 critical, 7 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

25/25 paths ✓, 15/15 symbols ✓, brief↔plan ✓ (oba dokumenty mają ten sam błędny warunek z `.env`, F5).

Weryfikacja: subagent sprawdził kod recenzenta, workflow i historię gita z dowodami `file:line`. Zachowanie promptfoo 0.124.1 sprawdziłem na lokalnej sondzie bez sieci (`validate`, `repeat`, `transform`, dwie instancje dostawcy), a pathspec w repo tymczasowym.

## Findings

### F1 — Commity tymczasowego repo padną w CI bez tożsamości gita

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, pkt 2 (Dostawca) i pkt 7 (Testy ewaluacji bez sieci)
- **Detail**: `buildCaseInput` tworzy tymczasowe repo z dwoma commitami dla 8 przypadków `files:`. Runner GitHuba nie ma `user.name` ani `user.email`, więc `git commit` padnie w jobie `integration`, gdzie `npm test` uruchamia test z pkt 7. Lokalnie wiersz 1.3 przejdzie, bo ta maszyna ma globalną tożsamość, więc błąd wyjdzie dopiero na PR-ze (2.6). Repo zna ten problem: `tests/unit/migration-guard.test.ts:418-434` („A CI runner has no git identity”) izoluje gita zmiennymi środowiska. promptfoo woła dostawcę bezpośrednio, więc izolacja musi być w dostawcy, nie w teście. Daje też diff taki jak w CI, bo globalne ustawienia (np. `diff.noprefix`) zmieniają jego format.
- **Fix**: Pkt 2: każde wywołanie gita w `buildCaseInput` biegnie z `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, stałymi `GIT_AUTHOR_*`/`GIT_COMMITTER_*` i `-c commit.gpgsign=false`, jak w `migration-guard.test.ts:418-434`.
- **Decision**: FIXED (Fix in plan)

### F2 — Bramka 1.12 nie odróżnia szumu od regresji i nie ma ścieżki porażki

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1, pkt 5 (Raport), wiersz 1.12, Implementation Note; Faza 2, pkt 3 (Lekcja)
- **Detail**: Przy ×3 dwa kryteria wiersza 1.12 padają przypadkiem, nawet gdy zmiana niczego nie pogarsza. „Regresja” to mniej zaliczonych powtórzeń `new` niż `old`. Przypadek zaliczany w 80% przebiegów przez obu recenzentów pokazuje taki spadek w ok. 29% porównań, a przy kilku niestabilnych przypadkach (np. #116, gdzie fail daje tylko model) fałszywa regresja jest bardziej prawdopodobna niż jej brak. „Tokeny rozumowania #103 w zakresie starego”: maksimum z 3 przebiegów `new` przekracza maksimum z 3 `old` w 50% porównań przy identycznych rozkładach, a ten sam prompt na #103 dał raz 7 740, raz 17 692 tokenów (`lessons.md:164`). Plan nie mówi też, co robić przy prawdziwej porażce (`length`, potwierdzona regresja po sufiksie): nie ma bisekcji, ponownego przebiegu ani budżetu. Poprzednia zmiana promptu potrzebowała trzech rund (`lessons.md:172`). Zapas ok. 15 USD z briefu przy planowanych 10–13 USD nie pokrywa nawet jednej dodatkowej rundy `compare` (6–8 USD). Nowa lekcja z fazy 2 robi z tej nieokreślonej reguły stałą bramkę każdej zmiany recenzenta.
- **Fix A ⭐ Recommended**: `report.ts` oznacza przypadki podejrzane, sesja powtarza je ×5, #103 ma stały sufit tokenów, a notatka fazy 1 opisuje ścieżkę porażki, którą przejmuje lekcja (bisekcja, zgoda właściciela na wydatek ponad szacunek, poprawki z sesji jako osobne commity przed fazą 2).
  - Strength: Szum nie blokuje fazy 2, a regresję potwierdza tani ponowny przebieg (`--filter-pattern` jest w 0.124.1; ok. 0,6 USD na przypadek). Sufit 24 576 (75% z 32 768, `config.ts:72`) wynika z `lessons.md:165`, a nie z trzech losowych prób.
  - Tradeoff: Dodatkowy krok w sesji; ×5 nie wykryje małej zmiany odsetka zaliczeń.
  - Confidence: MED — arytmetyka jest prosta, ale wariancję każdego przypadku pokaże dopiero smoke.
  - Blind spot: Próg 24 576 to wybór, nie pomiar.
- **Fix B**: Cały `compare` ×5, regresja dopiero przy spadku o co najmniej 2.
  - Strength: Jeden przebieg, bez dodatkowego kroku.
  - Tradeoff: `compare` kosztuje ok. 10–13 USD zamiast 6–8, cała sesja ok. 14–18 USD, ponad zapas; próg dalej leży blisko szumu.
  - Confidence: MED — ta sama arytmetyka.
  - Blind spot: Nadal brak ścieżki na prawdziwą porażkę i sufitu tokenów.
- **Decision**: FIXED (Fix A)

### F3 — Wykluczenia bramki chowają więcej niż dane ewaluacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, pkt 6 (Wyłączenia bramki i formatowania), wiersz 1.9
- **Detail**: `':(exclude)packages/code-reviewer/evals/cases'` wyklucza każdy plik w katalogu, nie tylko YAML, a `':(exclude)*package-lock.json'` każdą ścieżkę kończącą się tą nazwą, bo `*` łapie `/`. Sprawdzone w repo tymczasowym: z diffu znikają `packages/code-reviewer/evals/cases/evil.ts` i `src/xpackage-lock.json`. Plik `.ts` w `cases/` zaimportowany z `src/` przejdzie bramkę nieprzeczytany. To ta sama klasa ukrywania kodu, którą zmiana zamyka dla bajtu NUL.
- **Fix**: Pathspec `':(exclude)package-lock.json'`, `':(exclude)packages/code-reviewer/evals/package-lock.json'` i `':(exclude)packages/code-reviewer/evals/cases/*.yaml'` (sprawdzone: `evil.ts` i `xpackage-lock.json` zostają w diffie). Za nim idą `CI_DIFF_PATHSPECS`, wiersz 1.9 i README. Test offline sprawdza, że każdy plik w `cases/` ma rozszerzenie `.yaml`.
- **Decision**: FIXED (Fix in plan)

### F4 — `promptfoo validate` woła konstruktory, a `repeat` na górze ginie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, pkt 2 (Dostawca), pkt 4 (Konfiguracje), wiersz 1.5
- **Detail**: Oba zachowania sprawdzone na sondzie promptfoo 0.124.1, bez sieci. `validate` wczytuje plik dostawcy i uruchamia konstruktor: konstruktor, który rzuca, daje „Failed to validate configuration: constructor ran” i exit 1. Wiersz 1.5 waliduje `promptfooconfig.compare.yaml` w przebiegu `/10x-goal-implement`, zanim powstanie worktree `eval-old`, więc konstruktor, który ładuje recenzenta z `reviewerRoot` albo sprawdza tę ścieżkę, zatrzyma przebieg na 1.5. `repeat: 3` na najwyższym poziomie przechodzi `validate` („Configuration is valid.”) i jest po cichu ignorowane: 2 wyniki zamiast 6. Działa tylko `evaluateOptions.repeat`; `--repeat 1` z CLI nadpisuje tę wartość, więc wiersz 1.11 działa tak, jak go zapisano.
- **Fix**: Pkt 2: konstruktor tylko zapisuje opcje, recenzent ładuje się przy pierwszym `callApi` (zapamiętana obietnica), a test offline tworzy dostawcę z `reviewerRoot: "/nonexistent"` bez błędu. Pkt 4: `evaluateOptions: { repeat, maxConcurrency: 4 }`, a test offline sprawdza w trzech konfiguracjach powtórzenia 3, 3 i 1.
- **Decision**: FIXED (Fix in plan)

### F5 — Skrypty ewaluacji wczytują `.env`: klucza tam nie ma, są inne sekrety

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, pkt 1 (skrypty z `--env-file ../../../.env`); brief, Prerequisites
- **Detail**: Brief wymaga „`OPENROUTER_API_KEY` w głównym `.env`”, a skrypty przekazują ten plik promptfoo. Główny `.env` nie ma dziś tego klucza (czytane były tylko nazwy zmiennych). Ma za to klucze Supabase, login i hasło konta E2E oraz adres kontaktowy. Klucz jest w środowisku powłoki, a CLI i tak daje powłoce pierwszeństwo (`utils.ts:12-16`). `--env-file` nie daje więc ewaluacjom nic, czego potrzebują. Za to sekrety aplikacji trafiają do procesu z 626 zewnętrznymi pakietami, wbrew zasadzie z CLAUDE.md, by dawać tylko potrzebne sekrety.
- **Fix**: Usunąć `--env-file` ze skryptów. Ewaluacje i oceniający czytają `OPENROUTER_API_KEY` z powłoki, README ewaluacji to opisuje, a brief dostaje poprawiony warunek wstępny.
- **Decision**: FIXED (Fix in plan)

### F6 — Sufiks pomija odwołania do tagów, a asercje negatywne tracą sens

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, pkt 10 (Losowy sufiks tagów wejścia) i pkt 6
- **Detail**: Pkt 10 wymienia pierwszy akapit `REVIEWER_INSTRUCTIONS`, `repoToolsInstructions`, `code-reviewer-agent.test.ts:109` i `code-reviewer-tools.test.ts:242-255`. Pomija `prompts/reviewer.ts:26` („When <changed-files> is present…”), czyli stałą, która trafia do modelu i nazywałaby tag, którego już nie ma. Pomija też `code-reviewer-agent.test.ts:162` (`toContain("<changed-files>")`), którą dziś spełnia sam komunikat systemowy, więc po zmianie padnie albo dalej niczego nie sprawdzi, JSDoc `prompts/reviewer.ts:112-120` i `tools.ts:101` oraz README pakietu `:10`, `:120`, `:181-182`. `code-reviewer-tools.test.ts:252` (`not.toContain("<changed-files>")`) przy tagach z sufiksem przechodzi zawsze. Do tego tekst wyniku `skipped` (`review.yml:197`) wymienia stare wykluczenia, a pkt 6 go nie zmienia.
- **Fix**: Pkt 10 wymienia te miejsca. Asercje negatywne sprawdzają prefiks `<changed-files-`, pozytywne pełny tag z podanym `fenceSuffix`. Pkt 6 zmienia tekst `skipped`, a test workflow go przypina.
- **Decision**: FIXED (Fix in plan)

### F7 — Harness i testy CLI pomijają to, czego wymagają gh, akcja i klucz

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, pkt 8 (Testy logiki workflow), pkt 11, wiersze 1.7–1.8
- **Detail**: Stub `gh` „przy `--paginate` zwraca fixture bez zmian”. Wyszukiwanie sticky (`review.yml:226-227`) łączy `--paginate` z `--jq`, a gh stosuje `--jq` do każdej strony i drukuje napisy bez cudzysłowów, więc stub bez `--jq` odda temu krokowi surowy JSON. W blokach `run:` nie ma binarki `jq`: filtry liczy gojq wbudowany w gh. Akcja czyta `GITHUB_ACTION_PATH` (`action.yml:76`), `REVIEWER_ROOT` (`:131`) i bezwzględny `DIFF_FILE` oraz woła `openssl rand -hex 16` (`:139`). Harness nie ewaluuje `if:`, więc „`skipped` bez wywołania npm” sprawdzi tylko przez `skip=true` i `outcome=skipped` w `GITHUB_OUTPUT`. Provider OpenRouter przyjmuje pusty klucz (`loadApiKey` zwraca `""`), więc gdy kontrola przed modelem się zepsuje, wiersze 1.7–1.8 i test CLI wyślą diff do openrouter.ai (401), zamiast paść lokalnie.
- **Fix**: Pkt 8: stub stosuje `--jq` jak `jq -r` przy każdym wywołaniu, także z `--paginate`. Harness ustawia te trzy zmienne i zostawia `openssl` w `PATH`. Przypadek z samych białych znaków sprawdza `GITHUB_OUTPUT` i pusty log npm. Test CLI i wiersze 1.7–1.8 usuwają klucz (`env -u OPENROUTER_API_KEY`) zamiast ustawiać pusty.
- **Decision**: FIXED (Fix in plan)

### F8 — Stary recenzent może przeczytać dosłowne ataki narzędziami

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details („Dosłowne ataki tylko w przypadkach”)
- **Detail**: Wykluczenie usuwa przypadki tylko z diffu. `<changed-files>` pochodzi z `git diff --name-status base...head` bez pathspec (`tools.ts:162`), a `readFile` i `searchCode` czytają każdą zmienioną ścieżkę z head (`tools.ts:282-308`, `:341-347`). Wyniki narzędzi nie są ogrodzone (README pakietu `:196`). Przy włączonych narzędziach (diff do 50 000 znaków, `config.ts:49`) stary recenzent może na tym PR-ze przeczytać `score-raising.yaml` albo `fence-lookalikes.yaml`. Plan zakłada, że wyłączenie z diffu wystarcza.
- **Fix**: Critical Implementation Details nazywa to ryzyko szczątkowe, opis PR-a mówi, że przypadki to celowe dane testowe z atakami, a wyjściem awaryjnym zostaje proces z README.
- **Decision**: FIXED (Fix in plan)

### F9 — Wiązanie z fazy 2 omija porównanie, którego wymaga lekcja tej fazy

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, pkt 1 (Wiązanie werdyktu) i pkt 3 (Lekcja)
- **Detail**: Nowa lekcja wymaga `compare` ×3 przed każdą zmianą promptu, modelu, narzędzi albo wiązania. Pkt 1 może zmienić wiązanie bez nowego przebiegu. Dane z fazy 1 mają `modelVerdict` i `ruleVerdict` każdego przebiegu, więc skutek wiązania samą regułą da się policzyć bez modelu. Nie mówi tego ani plan, ani lekcja, więc przegląd implementacji zobaczy fazę 2 łamiącą regułę, którą sama wprowadza.
- **Fix**: `report.ts` drukuje też zaliczenia przy wiązaniu samą regułą, pkt 1 je cytuje, a lekcja mówi, że zmianę samego wiązania ocenia się na werdyktach z ostatniego `compare`, bez nowego przebiegu.
- **Decision**: FIXED (Fix in plan)

### F10 — `open-items.md` §4 ma siedem pól, a plan odhacza sześć

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, pkt 4 (Dokumenty foundation)
- **Detail**: §4 ma pole „Zaplanować `code-review-evals` przez `/10x-plan`” (`open-items.md:50`) i sześć pól zakresu (`:51-56`). Plan odhacza „sześć punktów”, więc pole planowania zostaje otwarte.
- **Fix**: Pkt 4 odhacza wszystkie siedem pól.
- **Decision**: FIXED (Fix in plan)
