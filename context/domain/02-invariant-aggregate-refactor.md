---
title: "Agregat Participation jako jedyny strażnik legalnego okresu odznaczenia"
created: 2026-10-06
type: refactor-plan
---

# Plan refaktoru — agregat-strażnik niezmiennika „legalny okres odznaczenia”

**To jest plan, nie implementacja.** Nie zmieniałem kodu produkcyjnego ani schematu. Cytaty `plik:linia` sprawdziłem w repozytorium (gałąź `m4l5-ddd`, commit `dd2dee0`). Szkice SQL z §4 uruchomiłem w scratchowym schemacie lokalnej bazy, w transakcji, którą wycofałem (nic nie zostało zapisane; szczegóły w §0).

## Streszczenie

- **Wybrany niezmiennik (INV-11):** odznaczenie jest zapisywane wyłącznie pod kanonicznym kluczem **bieżącego** okresu zadania (dzień w Warszawie, poniedziałek dla `weekly`, jeden fakt dla `once`), najwyżej raz. To jedyne wejście reguły streaka (`prd.md:99`), a dziś pilnuje go tylko aplikacja: baza przyjmuje dowolną datę z okna 9 dni i nie zna pojęcia „poniedziałek”.
- **Agregat:** `Participation` (tożsamość: zadanie + użytkownik). Jego zachowanie to polecenia SQL `check_off` i `uncheck` (precedens: `join_group`, `harden_group_rls.sql:53-82`), każde w jednej transakcji, z nazwanymi błędami `SB403/SB404/SB409`. Po stronie TS zostaje cienki adapter z błędami domenowymi.
- **Dlaczego nie czysty agregat w TS:** Worker rozmawia z bazą przez PostgREST, więc `load → zmień → save` to kilka wywołań bez wspólnej transakcji, a ścieżka bezpośredniego zapisu do tabeli zostaje otwarta (§4.1).
- **Koszt, który widać:** kalendarz okresu będzie zdefiniowany dwa razy (TS dla odczytu i wyspy, SQL dla zapisu). Zamiast udawać jedną implementację, plan wiąże je testem kontraktowym na tej samej wyroczni (§4.8).
- **Wdrożenie:** wzorzec rozszerz → przełącz → zawęź, trzy osobne wydania, bo `release` stosuje migracje przed wdrożeniem Workera (`README.md:336`).

---

## 0. Kontekst (KROK 0)

### Co przeczytałem

| Źródło                                                                     | Po co                                                                                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `context/foundation/prd.md`                                                | Business Logic `:95-99`, FR-008 `:80`, US-01 `:41-45`, Guardrails `:35-37`, Non-Goals `:109-114`                                          |
| `context/foundation/tech-stack.md:24`                                      | Streak liczony przy odczycie, bez zadań w tle                                                                                             |
| `context/foundation/test-plan.md:67`                                       | Ryzyko #4: streak liczony źle na granicy dnia lub tygodnia                                                                                |
| `context/archive/2026-10-01-checkoff-and-leaderboard/{plan-brief,plan}.md` | Decyzje S-04: okres, cofnięcie, model danych (czytane jako źródło, archiwum nie jest zmieniane)                                           |
| `context/foundation/lessons.md:133-138`                                    | Każdy zwrócony `{ error }` Supabase jest raportowany przez `log.ts`                                                                       |
| `context/domain/01-domain-distillation.md`, `glossary.md`                  | Wejście: słownik i ranking. **Wybór niezmiennika wyprowadziłem od nowa (§1–§2)**; zgodność z rankingiem #1 destylacji nie jest założeniem |
| `README.md`, `CLAUDE.md`                                                   | Komendy, kolejność wydania (`README.md:336`), konwencje migracji                                                                          |

### Stack i warstwy, w których żyje logika

| Warstwa          | Gdzie                                                                                | Rola wobec odznaczeń                                                                   |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| UI (wyspa React) | `src/components/tasks/CheckoffControl.tsx`, `src/lib/checkoff-client.ts`             | Podgląd optymistyczny tą samą funkcją co serwer; wykrywa „stronę otwartą przez północ” |
| UI (serwer)      | `src/pages/dashboard.astro`                                                          | Ładuje dane, liczy planszę, renderuje kontrolkę tylko uczestnikom (`:308-318`)         |
| HTTP             | `src/pages/api/tasks/{checkoff,uncheck}.ts`, `src/lib/checkoff-response.ts`          | Parsowanie, odczyt zadania, mapowanie wyniku                                           |
| Dostęp do danych | `src/lib/checkoffs.ts`                                                               | Liczy okres z zegara Workera, zapisuje, tłumaczy SQLSTATE                              |
| Reguły czyste    | `src/lib/streak-rules.ts`, `src/lib/leaderboard-rules.ts`                            | Kalendarz, spadek, suma, ranking (wspólne dla serwera i przeglądarki)                  |
| Baza             | `supabase/migrations/20261002090000_create_task_checkoffs.sql`                       | Tabela faktów, FK do uczestnictwa, polityki RLS, widok                                 |
| Testy            | `tests/{unit,integration}`, `supabase/checks/rls-scenarios.sql`, `scripts/smoke.mjs` | Wyrocznie reguł i granic RLS                                                           |

### Co zweryfikowałem, a czego nie

- **Zweryfikowane lokalnie (psql, transakcja wycofana, schemat `plan_scratch`):** funkcja okresu w SQL daje dla 11 instantów (dni DST, północ, tydzień, zmiana roku) te same wartości co wyrocznia planu S-04 (`plan.md:121-122`); szkice `check_off_at` i `uncheck_at` zachowują się jak w §4.3 (idempotencja, `weekly` → poniedziałek, `once`, błędy `SB403/SB404/SB409`, granica północy); trigger strażnika i zapytanie normalizujące z §4.7 działają. Funkcje z `revoke execute … from public, anon, authenticated` zachowują `EXECUTE` dla `service_role` (sprawdzone na `add_creator_to_task`).
- **Niezweryfikowane (do testów kontraktowych w Fazie 1):** (a) czy własne kody `SB4xx` i `DETAIL` dochodzą przez PostgREST do `error.code` i `error.details` (psql potwierdza tylko stronę Postgresa); (b) zachowanie współbieżne blokady `for no key update` (przypadki I12, I13 w §7); (c) dane produkcyjne (pytanie D-3); (d) publiczne wrappery `check_off` i `uncheck` (jednolinijkowa delegacja do wersji `*_at` z `auth.uid()` i `now()`), których nie uruchamiałem osobno: pokrywa je przypadek I9.
- Nie uruchamiałem `npm test`, `npm run test:rls` ani `smoke`: plan nic nie zmienia, a stack lokalny obsługuje jedną sesję testów naraz (`CLAUDE.md`, sekcja Parallel work).

---

## 1. Niezmienniki biznesowe (KROK 1)

Reguły, które w tej domenie muszą być zawsze prawdziwe. Źródła: dokument i kod. Nazwy z `glossary.md` (uczestnictwo, odznaczenie, okres).

| ID         | Niezmiennik                                                                                                                                                                                                  | Źródło w dokumentach                                                               | Źródło w kodzie                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-01     | Użytkownik należy do najwyżej jednej grupy                                                                                                                                                                   | `prd.md:111`                                                                       | UNIQUE `create_groups_and_group_members.sql:24`                                                                                                               |
| INV-02     | Właściciel jest zawsze członkiem i opuszcza grupę tylko przez jej usunięcie                                                                                                                                  | `prd.md:107`                                                                       | polityki `harden_group_rls.sql:127-152`; kopia w trasie `leave.ts:29-34` i w UI `dashboard.astro:373`                                                         |
| INV-03     | Do grupy wchodzi się tylko z kodem                                                                                                                                                                           | `prd.md:56`                                                                        | `join_group` `harden_group_rls.sql:53-82`; „code entropy is the only defence” `:54-55`                                                                        |
| INV-04     | Dane grupy widzą tylko jej członkowie                                                                                                                                                                        | `prd.md:36`                                                                        | `is_group_member` `harden_group_rls.sql:35-48`; polityki `create_tasks.sql:48-50`, `create_task_checkoffs.sql:54-56`                                          |
| INV-05     | Tytuł 1–80 znaków; cykliczność ∈ {once, daily, weekly} i niezmienna                                                                                                                                          | `prd.md:64`                                                                        | CHECK `create_tasks.sql:25-26`, brak UPDATE poza `title` `:38-40`; kopia TS `task-rules.ts:7-8`                                                               |
| INV-06     | Tylko twórca (dopóki jest w grupie) zmienia tytuł i usuwa zadanie                                                                                                                                            | `prd.md:68`, `:107`                                                                | polityki `create_tasks.sql:56-63`                                                                                                                             |
| INV-07     | Uczestnik zadania jest członkiem grupy tego zadania                                                                                                                                                          | `prd.md:72`                                                                        | decyzja `create_task_participants.sql:9-11`, triggery `:72-116`, znany wyścig `:15-20`; kompensacje `leaderboard-rules.ts:127-128`, `dashboard.astro:143-149` |
| INV-08     | Odznaczenie należy do uczestnictwa; wyjście z zadania lub grupy kasuje historię                                                                                                                              | `prd.md:76-79` (milczy o historii)                                                 | FK z kaskadą `create_task_checkoffs.sql:13-17`, `:34`                                                                                                         |
| INV-09     | Odznacza tylko uczestnik i tylko własne wiersze                                                                                                                                                              | `prd.md:107`                                                                       | polityki `create_task_checkoffs.sql:58-68`                                                                                                                    |
| INV-10     | System nie weryfikuje, czy zadanie faktycznie wykonano (zaufanie)                                                                                                                                            | `prd.md:81-83`, `:113`                                                             | brak weryfikacji; „Trust-based by design” `create_task_checkoffs.sql:10-11`                                                                                   |
| **INV-11** | **Odznaczenie dotyczy wyłącznie bieżącego okresu zadania i jest zapisane pod kanonicznym kluczem okresu (`daily`: dzień w Warszawie; `weekly`: poniedziałek; `once`: jeden fakt); każdy okres najwyżej raz** | US-01 „na dziś” `prd.md:45`; FR-008 `:80`; `plan.md:37`, `:59`; `plan-brief.md:38` | tylko aplikacja: `checkoffs.ts:63`; baza tylko „ogranicza” `create_task_checkoffs.sql:8-11`, `:63`                                                            |
| INV-12     | Cofnąć można tylko bieżący okres (`once`: zawsze); przeszłości nie da się zmienić z aplikacji                                                                                                                | `plan.md:62`; `plan-brief.md:26`                                                   | aplikacja `checkoffs.ts:85-93`; polityka DELETE pozwala usunąć dowolny własny wiersz `create_task_checkoffs.sql:66-68`                                        |
| INV-13     | Powtórzone odznaczenie jest no-opem                                                                                                                                                                          | `plan-brief.md:30`                                                                 | PK `create_task_checkoffs.sql:33`; `checkoffs.ts:54-55`, `:65`                                                                                                |
| INV-14     | Odznaczenie dotyczy okresu, który użytkownik widział (strona otwarta przez północ)                                                                                                                           | `plan.md:72`                                                                       | tylko klient: `checkoff-client.ts:60`, `CheckoffControl.tsx:85-90`                                                                                            |
| INV-15     | Streak = funkcja faktów i „teraz”; spadek połowi wartość w dół; nic nie jest persystowane                                                                                                                    | `prd.md:97`; `tech-stack.md:24`                                                    | `streak-rules.ts:69-75`, `:96-150`; wyrocznia `streak-rules.test.ts:1-20`                                                                                     |
| INV-16     | Wynik członka = suma streaków po zadaniach, w których uczestniczy; remisy dzielą pozycję                                                                                                                     | `prd.md:97`, `:99`                                                                 | `leaderboard-rules.ts:49-63`, `:107-139`                                                                                                                      |

Numeracja INV-xx jest własna tego dokumentu (mapa domeny używa N-xx). INV-10 to świadoma decyzja o zaufaniu, nie coś do egzekwowania, więc w klasyfikacji nie konkuruje o wybór.

---

## 2. Klasyfikacja i wybór #1 (KROK 2)

Legenda. **Rdzeń:** ●●● rdzeń sensu produktu (grywalizacja i widoczność, `prd.md:18-20`), ●● wspierający, ● generyczny. **Rozsmarowanie:** liczba warstw / plików, w których reguła żyje. **Egzekwowanie:** ✔ egzekwowany przez bazę lub jedno miejsce, ◐ częściowo (znana luka), ✖ deklarowany albo naruszalny.

| ID         | Rdzeń                      | Rozsmarowanie                      | Egzekwowanie | Uwaga                                              |
| ---------- | -------------------------- | ---------------------------------- | ------------ | -------------------------------------------------- |
| INV-01     | ●●                         | 2 warstwy / 2 pliki                | ✔            | UNIQUE w bazie                                     |
| INV-02     | ●●                         | 3 / 3                              | ✔            | UI i trasa to kopie wygody; strażnikiem jest RLS   |
| INV-03     | ●●                         | 1 / 1                              | ✔            | siła kodu = jedyna obrona (znana, zaakceptowana)   |
| INV-04     | ●●                         | 1 / 3 migracje                     | ✔            | RLS                                                |
| INV-05     | ●●                         | 2 / 2                              | ✔            | dwie kopie, ale CHECK jest autorytetem             |
| INV-06     | ●                          | 1 / 1                              | ◐            | osierocone zadanie zaakceptowane `prd.md:69-71`    |
| INV-07     | ●● (FR-006)                | 3 / 4                              | ◐            | wyścig opisany, skutek skompensowany przy odczycie |
| INV-08     | ●●                         | 2 / 2                              | ✔            | FK z kaskadą                                       |
| INV-09     | ●●                         | 1 / 1                              | ✔            | RLS + FK                                           |
| INV-10     | ●                          | —                                  | n/d          | świadoma decyzja o zaufaniu (`prd.md:113`)         |
| **INV-11** | **●●●**                    | **5 warstw / 8 plików**            | **✖**        | **baza nie zna kanonicznego klucza; okno 9 dni**   |
| INV-12     | ●●●                        | 3 / 3                              | ✖            | baza pozwala usunąć każdy własny wiersz            |
| INV-13     | ●●                         | 2 / 2                              | ✔            | celowo „połykane” 23505                            |
| INV-14     | ●● (guardrail `prd.md:37`) | 2 / 2                              | ✖            | tylko klient, po fakcie                            |
| INV-15     | ●●●                        | 1 / 1 (+ ta sama funkcja w wyspie) | ✔            | jedna czysta funkcja i wyrocznia testowa           |
| INV-16     | ●●●                        | 1 / 1                              | ✔            | `buildBoard`, testy rankingu                       |

### Wybór: INV-11 (z fasetami INV-12 i INV-14)

**Dlaczego rdzeniowy.** Wartość produktu to grywalizacja streaków wokół wspólnej tablicy (`prd.md:18-20`), a PRD mówi wprost, że reguła „korzysta z pojedynczego wejścia”: czy zadanie odznaczono w swoim okresie (`prd.md:99`). Fakt odznaczenia jest więc jedynym wejściem do INV-15 i INV-16. Błędny fakt daje błędny wynik każdego, kto go zawiera, i nie ma żadnej drugiej linii obrony, bo `streakValue` ufa temu, co dostaje.

**Dlaczego najsłabiej egzekwowany spośród rdzeniowych.** INV-15 i INV-16 są rdzeniem tak samo, ale mają jedną implementację i wyrocznię (`streak-rules.test.ts:1-20`). INV-11 ma 8 plików w 5 warstwach (wyspa, trasa, dostęp do danych, reguły czyste, baza) i żadnej warstwy, która wymusza całość: trasa liczy okres (`checkoffs.ts:63`), baza go tylko „ogranicza” (`create_task_checkoffs.sql:63`), a odczyt naprawia dane, których baza nie powinna była przyjąć (`streak-rules.ts:107-127`). Pozostałe słabo egzekwowane niezmienniki są wspierające (INV-06, INV-07) i mają zaakceptowany lub skompensowany skutek.

**Rozważone i odłożone.** INV-07 (uczestnik ⊆ członek) ma znany wyścig (`create_task_participants.sql:15-20`), ale jego skutek to nadmiarowy wiersz, który tablica pomija (`leaderboard-rules.ts:127-128`); wraca jako opcjonalna Faza 5, bo ten sam agregat może zamknąć go blokadą. INV-06 to decyzja właściciela produktu, nie refaktor.

---

## 3. Diagnoza wybranego niezmiennika (KROK 3)

### 3.1 Gdzie dziś żyje reguła

| Warstwa          | Miejsce                                                                                    | Co robi z regułą                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Reguły czyste    | `streak-rules.ts:42-53` (`periodKeyFor`)                                                   | Definiuje kalendarz: data w `Europe/Warsaw`, dla `weekly` poniedziałek (`:34-36`)                              |
| Dostęp do danych | `checkoffs.ts:63-65` (`checkOff`)                                                          | Liczy okres z zegara Workera i wstawia `{task_id, user_id, period}`; 23505 przechodzi jako sukces              |
| Dostęp do danych | `checkoffs.ts:85-97` (`uncheck`)                                                           | Dla `daily` kasuje dokładny klucz, dla `weekly` **zakres** 7 dni, dla `once` wszystko (`:87-93`)               |
| HTTP             | `checkoff.ts:31-37`, `uncheck.ts:32-39`                                                    | Najpierw osobny odczyt zadania (`getTask`), potem zapis z `new Date()`: dwa wywołania, bez wspólnej transakcji |
| Baza             | `create_task_checkoffs.sql:31`                                                             | `period date not null`: żadnego CHECK, żadnego pojęcia poniedziałku                                            |
| Baza             | `create_task_checkoffs.sql:58-64`                                                          | Polityka INSERT: `period` między UTC−7 a UTC+1, niezależnie od cykliczności                                    |
| Baza             | `create_task_checkoffs.sql:66-68`                                                          | Polityka DELETE: każdy własny wiersz, dowolny okres                                                            |
| Odczyt           | `streak-rules.ts:107-127` (`snapshotOf`)                                                   | Przyciąga klucze `weekly` do poniedziałku, zwija powtórki, pomija klucze z przyszłości                         |
| Odczyt           | `leaderboard-rules.ts:117-123`                                                             | Drugi raz liczy bieżący okres, już dla planszy                                                                 |
| UI               | `CheckoffControl.tsx:78`, `:85-90`; `checkoff-client.ts:60`                                | Pilnuje, czy zapisany okres jest tym, który użytkownik widział                                                 |
| Testy            | `task-checkoff-flow.test.ts:92-99`, `:210-211`; `task-checkoffs.test.ts:76-80`, `:150-163` | **Utrwalają** dzisiejszą słabość (§3.5)                                                                        |

### 3.2 Które warstwy jej nie egzekwują

- **Baza** jest warstwą, która widzi każdą ścieżkę zapisu, a wymusza tylko: unikalność identycznego klucza (`:33`), uczestnictwo (`:34`) i okno dat (`:63`). Nie wymusza: „okres jest bieżący”, „klucz `weekly` to poniedziałek”, „`once` ma jeden fakt”, „usunąć można tylko bieżący okres”.
- **Dostęp do danych** polega na zegarze jednego Workera i na tym, że wołający podał prawdziwe `now` (`checkoffs.ts:57-63`; test `task-checkoff-flow.test.ts:92-99` wręcz **wymaga**, by zegar był parametrem zapisu).
- **Odczyt** nie egzekwuje, tylko tolerancyjnie naprawia (§3.4, S4).

### 3.3 Niespójności

1. **Dwa zegary.** Aplikacja liczy dzień w Warszawie (`streak-rules.ts:7`), polityka INSERT w UTC z celowym luzem (`create_task_checkoffs.sql:19-20`, `:63`). Okno 9 dni obejmuje więc nie tylko „dziś w Warszawie”, ale też 7 dni wstecz i jutro.
2. **Trzy różne „cofnięcia” zakodowane po stronie TS** w zależności od cykliczności (`checkoffs.ts:87-93`), podczas gdy baza zna jedno: „usuń własny wiersz” (`create_task_checkoffs.sql:66-68`).
3. **Odczyt i zapis zgadzają się przez zbieg okoliczności.** Trasa zawsze wysyła poniedziałek; `snapshotOf` przyciąga tydzień do poniedziałku (`streak-rules.ts:109`); `uncheck` kasuje cały tydzień (`checkoffs.ts:92`). Komentarz w kodzie mówi wprost, po co ta redundancja: „the API accepts any day inside the window” (`checkoffs.ts:90-91`).
4. **Dokument kontra baza.** Plan S-04 wyłączył „past or future periods” (`plan-brief.md:38`) i zapisał „Only the current day/week can be ticked or undone” (`plan.md:37`), ale ten sam plan przyjął, że bezpośredni klient może zapisać dzień z okna (`plan.md:41`).

### 3.4 Gdzie błąd jest „połykany” zamiast zatrzymywać operację

| ID  | Miejsce                                         | Co ginie                                                                                                                                    |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `checkoffs.ts:65`                               | 23505 przechodzi jako sukces. To **celowa** idempotencja (INV-13), ale wołający nie odróżni zapisu od no-opa                                |
| S2  | `checkoffs.ts:46-49`                            | 23503 („nie jesteś uczestnikiem”) i 42501 (odmowa RLS) spłaszczone do jednego `forbidden`; powód zostaje tylko w wierszu logu               |
| S3  | `checkoffs.ts:94-97`, komentarz `uncheck.ts:38` | Cofnięcie przez **nie-uczestnika** zwraca `ok`, tak samo jak „nic nie było zaznaczone”. Wyspa pokaże „zapisano”, choć uczestnictwa nie ma   |
| S4  | `streak-rules.ts:107-127`                       | Klucze naruszające INV-11 (inny dzień tygodnia, duplikat, przyszłość) są po cichu naprawiane w wyniku; nic nie zgłasza, że baza je przyjęła |
| S5  | `checkoffs.ts:90-92`                            | Kasowanie zakresu 7 dni maskuje wiersze spoza poniedziałku                                                                                  |
| S6  | `leaderboard-rules.ts:127-128`                  | Uczestnik, który nie jest członkiem, jest pomijany bez śladu (kompensacja INV-07; poza zakresem tego planu)                                 |

Dla porządku: błędy **odczytu** nie są połykane. Dashboard degraduje je widocznie (`dashboard.astro:80-83`, `:99-103`), więc to nie jest problem tego planu.

### 3.5 Gdzie klient (UI) jest jedynym strażnikiem

INV-14. Serwer w ogóle nie dostaje okresu, który użytkownik widział: trasa czyta wyłącznie `task_id` (`checkoff.ts:19`). Zapisuje okres zegara serwera (`checkoffs.ts:63`) i odsyła go, a dopiero wyspa porównuje (`checkoff-client.ts:60`) i przeładowuje stronę (`CheckoffControl.tsx:85-90`). Plan S-04 opisuje to jako zamierzone (`plan.md:72`), ale oznacza to, że **zapis już się stał**, zanim ktokolwiek sprawdził zamiar.

### 3.6 Scenariusze naruszenia (wynikają z kodu)

| ID  | Scenariusz                                                                                                                | Dlaczego dziś możliwy                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `weekly`: wiersz na środę obok wiersza na poniedziałek tego samego tygodnia                                               | PK obejmuje datę (`:33`), polityka nie zna dnia tygodnia (`:63`); test to **zakłada**: `task-checkoff-flow.test.ts:210-211`                                         |
| V2  | Dopisanie pominiętego dnia z ostatnich 7                                                                                  | okno `UTC−7` (`:63`; `task-checkoffs.test.ts:154-157`). Przykład z planu: pon–czw + sob = 3 (`plan.md:124`); po dopisaniu piątku historia pon–sob daje 6            |
| V3  | „Odznaczenie jutra”                                                                                                       | okno `UTC+1` (`:63`); `snapshotOf` pomija klucze z przyszłości do czasu ich okresu (`streak-rules.ts:122`), więc w ten dzień zadanie jest już „zrobione”            |
| V4  | Strona otwarta przez północ: kliknięcie po północy zapisuje **następny** dzień, a dopiero potem wyspa przeładowuje stronę | `checkoffs.ts:63` + `CheckoffControl.tsx:85-90`; poniedziałkowy zamiar zamienia się w wtorkowy kredyt                                                               |
| V5  | `once`: drugi wiersz w innym dniu (np. ze starej karty)                                                                   | PK różni się datą; `checkOff` wstawia nowy klucz dla `once` (`checkoffs.ts:63-64`). Wynik się nie zmienia (`streak-rules.ts:101`), ale „jeden fakt” nie jest prawdą |

Do V1–V3 potrzebny jest bezpośredni dostęp do PostgREST. Klucz `SUPABASE_KEY` jest sekretem serwerowym (`astro.config.mjs:23`), więc praktyczne prawdopodobieństwo jest niskie, a PRD akceptuje brak weryfikacji **wykonania** (`prd.md:113`). Plan nie uznaje jednak okna dat za decyzję produktową: plan S-04 mówi „tylko bieżący okres” (`plan.md:37`, `:62`), a okno było tylko luzem na różnicę zegarów (`create_task_checkoffs.sql:19-20`). To pytanie D-2 do właściciela (§9). V4 nie wymaga żadnego ataku.

---

## 4. Projekt agregatu-strażnika (KROK 4)

### 4.1 Gdzie ma mieszkać agregat (decyzja architektoniczna)

| Opcja | Opis                                                                                     | Ocena                                                                                                                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Agregat w TS; `load → metoda → save` klientem użytkownika                                | **Odrzucona.** Worker + PostgREST: każde wywołanie to osobna transakcja, więc „uczestniczy?”, „okres bieżący?” i zapis rozjeżdżają się w czasie (to dzisiejszy układ `getTask` + `insert`, `checkoff.ts:31-37`). Ścieżka bezpośredniego zapisu do tabeli zostaje otwarta                             |
| B     | Agregat w TS; klucz `service_role` w Workerze; granty zapisu odebrane                    | **Odrzucona.** Jedno miejsce w TS, ale cała autoryzacja przechodzi z RLS na kod aplikacji, a sekret omija RLS wszędzie. Repo nie ma tego klucza ani precedensu; testy traktują bazę jako granicę (`task-checkoffs.test.ts:94`)                                                                       |
| **C** | **Agregat jako polecenia w bazie (funkcje SQL) + cienki adapter TS z nazwanymi błędami** | **Wybrana.** Precedens: `join_group` jest „the only way to join a group” i działa jako `SECURITY DEFINER` (`harden_group_rls.sql:53-82`); triggery uczestnictwa też (`create_task_participants.sql:72-116`). Jedno wywołanie = jedna transakcja. Każda ścieżka zapisu przechodzi przez tę samą bramę |

**Uczciwie o słowie „jedyne miejsce”.** Dla zapisu jest nim funkcja w bazie. Kalendarz okresu istnieje jednak w dwóch implementacjach, bo wyspa React i odczyt potrzebują go w TS (§4.8). Egzekwowanie jest jedno; definicja „jaki to dzień” jest powiązana testem, nie zjednoczona.

### 4.2 Agregat `Participation`

- **Tożsamość:** `(task_id, user_id)`, czyli wiersz `task_participants`.
- **Granica spójności:** uczestnictwo i jego fakty w `task_checkoffs`. Cykl życia (dołączenie, wyjście, kaskady) pozostaje w FK i triggerach z S-03.
- **Stan:** zbiór faktów (okres, moment), tylko dopisywany lub kasowany. Brak licznika, więc nie ma problemu „lost update”: każde polecenie jest jednym zdaniem SQL pod blokadą wiersza uczestnictwa.
- **Niezmienniki agregatu:**

| ID  | Reguła                                                                                                                 | Egzekwuje                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1  | Fakt istnieje tylko dla istniejącego uczestnictwa                                                                      | FK `create_task_checkoffs.sql:34` (bez zmian) + SB403 w poleceniu |
| P2  | Fakt zapisany teraz ma okres **bieżący**: `period = period_of(recurrence, now())`                                      | polecenie `check_off`                                             |
| P3  | Klucze kanoniczne: `weekly` = poniedziałek, `once` = najwyżej jeden fakt                                               | polecenie + trigger strażnika (stan, każdy autor zapisu)          |
| P4  | Najwyżej jeden fakt na (uczestnictwo, kanoniczny okres)                                                                | PK + P3                                                           |
| P5  | Cofnięcie dotyka tylko bieżącego okresu (`once`: wszystkich faktów uczestnictwa)                                       | polecenie `uncheck`                                               |
| P6  | Polecenie może nieść okres, który aktor widział; jeśli różni się od bieżącego, jest odrzucone **bez skutku ubocznego** | SB409                                                             |
| P7  | Aktorem jest zawsze wywołujący (`auth.uid()`); żadne polecenie nie przyjmuje identyfikatora użytkownika                | `check_off`/`uncheck` bez parametru użytkownika                   |
| P8  | Powtórka polecenia jest no-opem **widocznym w wyniku** (`changed = false`), nie błędem                                 | wartość zwracana                                                  |

### 4.3 Metody domenowe

Wszystkie w schemacie `public`, `SECURITY DEFINER`, `set search_path = ''`, nazwy w pełni kwalifikowane (jak `harden_group_rls.sql:35-48`).

| Sygnatura                                                                                                    | Dla kogo                     | Rola                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `period_of(p_recurrence text, p_at timestamptz) returns date` (stable)                                       | wewnętrznie                  | Jedyna definicja okresu po stronie zapisu                                                                                                             |
| `check_off(p_task_id uuid, p_expected_period date default null) returns table(period date, changed boolean)` | `authenticated`              | Polecenie publiczne: aktor = `auth.uid()`, czas = `now()`                                                                                             |
| `uncheck(p_task_id uuid, p_expected_period date default null) returns table(period date, changed boolean)`   | `authenticated`              | Cofnięcie bieżącego okresu                                                                                                                            |
| `check_off_at(p_user_id uuid, p_task_id uuid, p_at timestamptz, p_expected_period date default null)`        | tylko `service_role` (testy) | To samo polecenie z jawnym aktorem i czasem: **szew testowy**, bez niego nie da się deterministycznie sprawdzić północy, DST ani nieaktualnego okresu |
| `uncheck_at(…)`                                                                                              | tylko `service_role` (testy) | j.w.                                                                                                                                                  |

Wersje `*_at` mają `revoke execute … from public, anon, authenticated` (wzorzec `create_task_participants.sql:85`); publiczne wrappery wołają je z `auth.uid()` i `now()`.

**Preconditions, w tej kolejności (fail-fast):**

1. Zadanie jest widoczne dla aktora (aktor jest członkiem grupy zadania) → inaczej `SB404`.
2. Jeśli podano `p_expected_period`, równa się bieżącemu okresowi → inaczej `SB409` z bieżącym okresem w `DETAIL`.
3. Aktor uczestniczy w zadaniu (wiersz uczestnictwa zablokowany `for no key update`) → inaczej `SB403`.

**Szkic `check_off_at`** (zweryfikowany w schemacie scratch; w migracji `public.` zamiast `plan_scratch.`):

```sql
create function public.check_off_at(
  p_user_id uuid, p_task_id uuid, p_at timestamptz, p_expected_period date default null)
returns table (period date, changed boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_recurrence text; v_period date; v_rows int;
begin
  -- 1. zadanie widoczne dla aktora (to samo znaczenie co polityka SELECT na tasks: członkostwo w grupie)
  select t.recurrence into v_recurrence
  from public.tasks t
  where t.id = p_task_id
    and exists (select 1 from public.group_members gm
                where gm.group_id = t.group_id and gm.user_id = p_user_id);
  if not found then raise exception 'task is not visible' using errcode = 'SB404'; end if;

  -- 2. okres bieżący i zamiar aktora
  v_period := public.period_of(v_recurrence, p_at);
  if p_expected_period is not null and p_expected_period <> v_period then
    raise exception 'period is not the current one' using errcode = 'SB409', detail = v_period::text;
  end if;

  -- 3. uczestnictwo; blokada porządkuje polecenia i wyjście z zadania (wyjście bierze FOR UPDATE)
  perform 1 from public.task_participants tp
   where tp.task_id = p_task_id and tp.user_id = p_user_id for no key update;
  if not found then raise exception 'not participating' using errcode = 'SB403'; end if;

  -- 4. efekt: najwyżej jeden fakt na kanoniczny okres (once: jeden fakt w ogóle)
  if v_recurrence = 'once' and exists (select 1 from public.task_checkoffs c
                                       where c.task_id = p_task_id and c.user_id = p_user_id) then
    return query select v_period, false; return;
  end if;
  insert into public.task_checkoffs (task_id, user_id, period)
  values (p_task_id, p_user_id, v_period) on conflict do nothing;
  get diagnostics v_rows = row_count;
  return query select v_period, v_rows = 1;
end $$;
```

`uncheck_at` ma te same trzy preconditions i inny efekt: `once` → `delete … where task_id and user_id`; `daily` i `weekly` → `delete … where … and period = v_period` (dokładny klucz, bo po P3 jest kanoniczny; znika zakres z `checkoffs.ts:92`); wynik `changed = row_count > 0`. Brak uczestnictwa to **błąd** `SB403`, nie ciche `ok` (naprawia S3).

Wrapper publiczny:

```sql
create function public.check_off(p_task_id uuid, p_expected_period date default null)
returns table (period date, changed boolean)
language sql security definer set search_path = ''
as $$ select * from public.check_off_at((select auth.uid()), p_task_id, now(), p_expected_period) $$;
-- revoke execute … from public, anon;  grant execute … to authenticated;
```

Wywołanie przez `service_role` (bez `auth.uid()`) kończy się `SB404`: brak aktora = zadanie niewidoczne, więc nie ma ścieżki „po cichu jako nikt”.

### 4.4 Błędy domenowe

| SQLSTATE | Znaczenie                              | Klasa TS                        | HTTP (JSON)                       | Redirect (bez JS)            | Raport (`log.ts`)                                     |
| -------- | -------------------------------------- | ------------------------------- | --------------------------------- | ---------------------------- | ----------------------------------------------------- |
| `SB404`  | zadanie niewidoczne lub usunięte       | `TaskGoneError`                 | 404 `gone`                        | `/dashboard`                 | info (`checkoff.task_gone`, jak `checkoff.ts:33`)     |
| `SB403`  | aktor nie uczestniczy                  | `NotParticipatingError`         | 403 `forbidden`                   | `/dashboard?error=forbidden` | info (`checkoff.not_enrolled`, jak `checkoffs.ts:47`) |
| `SB409`  | okres nieaktualny; `DETAIL` = bieżący  | `StalePeriodError`              | **409** `stale` + `period` (nowe) | `/dashboard`                 | info (`checkoff.stale_period`, nowe)                  |
| `SB422`  | stan niekanoniczny (trigger strażnika) | zwykły `Error`                  | 500 `unknown`                     | `/dashboard?error=unknown`   | error (nie powinno się zdarzyć)                       |
| `42501`  | odmowa uprawnień (np. `anon`)          | `PermissionDeniedError`         | 403 `forbidden`                   | `/dashboard?error=forbidden` | error (jak `checkoffs.ts:43`)                         |
| inne     | awaria                                 | `Error` (oryginał jako `cause`) | 500 `unknown`                     | `/dashboard?error=unknown`   | error (`checkoff.failed`, jak `checkoff.ts:39`)       |

Reguła z `lessons.md:133-138` zostaje zachowana: adapter raportuje **każdy** zwrócony `{ error }`, a zdarzenia i fingerprint `[event, code]` (`log.ts:81`) pozostają stabilne.

### 4.5 Repozytorium i atomowość

**Dlaczego nie `load → mutate → save`.** Worker nie ma jak utrzymać transakcji między wywołaniami PostgREST. Odczyt „czy uczestniczy i jaki jest okres”, a potem zapis, dałby okno wyścigu z wyjściem z zadania i z północą. Stan agregatu to zbiór faktów dopisywanych jednym zdaniem, więc jedyna zmiana, która go modyfikuje, to polecenie w bazie. **Jedno `rpc` = jedno żądanie HTTP = jedna transakcja**: odczyt zadania, kontrola okresu, blokada uczestnictwa i zapis są w niej razem. Wyścig „tyknięcie vs wyjście z zadania” rozstrzyga blokada: wyjście bierze `FOR UPDATE` wiersza uczestnictwa, polecenie `FOR NO KEY UPDATE`, więc jedno czeka na drugie; fakt bez uczestnictwa jest niemożliwy (FK).

**Port TS** (`src/lib/participation.ts`, zastępuje zapisy z `checkoffs.ts`):

```ts
export interface PeriodChange {
  period: PeriodKey;
  changed: boolean;
}

export class ParticipationError extends Error {}
export class TaskGoneError extends ParticipationError {}
export class NotParticipatingError extends ParticipationError {}
export class PermissionDeniedError extends ParticipationError {}
export class StalePeriodError extends ParticipationError {
  constructor(readonly currentPeriod: PeriodKey) {
    super("period is not the current one");
  }
}

export interface ParticipationRepository {
  /** Odznacza bieżący okres. Idempotentne. Rzuca TaskGoneError | NotParticipatingError | StalePeriodError | PermissionDeniedError | Error. */
  checkOff(taskId: string, opts?: { expectedPeriod?: PeriodKey }): Promise<PeriodChange>;
  /** Cofa bieżący okres (`once`: wszystkie fakty uczestnictwa). Idempotentne; ten sam zestaw błędów. */
  uncheck(taskId: string, opts?: { expectedPeriod?: PeriodKey }): Promise<PeriodChange>;
  /** Odczyt dla modelu odczytu (dzisiejsze `listCheckoffPeriods`, bez zmian zachowania). */
  listPeriods(): Promise<EnrolmentPeriods[]>;
}

export function participationRepository(supabase: Supabase, ids: { userId: string }): ParticipationRepository;
```

Pseudokod adaptera (jedno miejsce tłumaczenia SQLSTATE, jedno miejsce raportowania):

```ts
async function command(fn: "check_off" | "uncheck", taskId: string, expected?: PeriodKey) {
  const { data, error, status } = await supabase
    .rpc(fn, { p_task_id: taskId, p_expected_period: expected ?? null })
    .single();
  if (error) throw toParticipationError(fn, error, status, ids); // tu też reportInfo/reportError wg tabeli §4.4
  if (!data.changed && fn === "uncheck") reportInfo("uncheck.nothing_removed", { ...ids, taskId });
  return { period: data.period, changed: data.changed };
}
```

Odczyt (`listPeriods`) pozostaje jednym zapytaniem do widoku `task_checkoff_periods` (`checkoffs.ts:14-26`), bo to model odczytu, nie agregat; po P3 jego klucze są kanoniczne z konstrukcji.

### 4.6 Cienka trasa i wyspa

```ts
// src/pages/api/tasks/checkoff.ts (uncheck.ts analogicznie)
export const POST: APIRoute = async (context) => {
  // 1. parse
  const user = context.locals.user; // jak dziś: redirect na logowanie bez sesji
  const form = await context.request.formData();
  const taskId = normalizeUuid(form.get("task_id")); // błędne → { kind: "invalid" }
  const expected = normalizePeriodKey(form.get("expected_period")); // nowa czysta funkcja; brak → null
  const supabase = createClient(context.request.headers, context.cookies); // brak → not_configured

  // 2. agregat (jedno wywołanie; zadanie, okres i uczestnictwo sprawdza baza)
  try {
    const { period } = await participationRepository(supabase, { userId: user.id }).checkOff(taskId, {
      expectedPeriod: expected,
    });
    return checkoffResponse(context, { kind: "ok", period });
  } catch (error) {
    // 3. błąd domenowy → odpowiedź (raport już zrobił adapter)
    return checkoffResponse(context, toCheckoffResult(error));
  }
};
```

- `checkoffResponse` zyskuje wynik `stale` (409 `{ ok:false, error:"stale", period }`; bez JS redirect na `/dashboard`), obok istniejących w `checkoff-response.ts:10-16`.
- Zniknęły: odczyt `getTask` w obu trasach, `new Date()` w trasach i parametr `userId` przekazywany do zapisu.
- **Wyspa (przeniesienie egzekucji z klienta na serwer):** `CheckoffControl.tsx` dodaje do obu formularzy ukryte pole `expected_period` (`value={currentPeriod}`, tylko gdy `recurrence !== "once"`), a `sendCheckoff` wysyła je w `URLSearchParams` (nadal form-encoded, więc kontrola Origin Astro działa: `checkoff-client.ts:21-24`). Odpowiedź 409 mapuje się na istniejący wynik `stale` (przeładowanie, `CheckoffControl.tsx:85-90`), ale **bez wcześniejszego zapisu**. Porównanie `body.period === expectedPeriod` (`checkoff-client.ts:60`) zostaje na jedno wydanie jako pas bezpieczeństwa na czas wdrożenia (stara wyspa + nowy serwer i odwrotnie), potem można je usunąć.

### 4.7 Zamknięcie drzwi (Migracja B) i strażnik stanu

Po przełączeniu kodu (Faza 2) osobna migracja:

1. **Normalizacja istniejących danych** (nie zmienia żadnego wyniku na tablicy, bo `snapshotOf` i tak przyciąga klucze `weekly` do poniedziałku, `streak-rules.ts:109`, a `once` jest „1 przy dowolnym kluczu”, `:101`). Zweryfikowane na danych scratch: wiersze `weekly` spoza poniedziałku zwijają się do poniedziałka bez duplikatów, nadmiarowe fakty `once` znikają:

   ```sql
   with weekly as (
     select c.task_id, c.user_id, c.period, date_trunc('week', c.period)::date as monday
     from public.task_checkoffs c join public.tasks t on t.id = c.task_id where t.recurrence = 'weekly'),
   dropped as (
     delete from public.task_checkoffs c using weekly w
     where c.task_id = w.task_id and c.user_id = w.user_id and c.period = w.period and w.period <> w.monday
     returning w.task_id, w.user_id, w.monday)
   insert into public.task_checkoffs (task_id, user_id, period)
   select distinct task_id, user_id, monday from dropped on conflict do nothing;
   -- analogicznie dla `once`: zostaje najwcześniejszy fakt uczestnictwa
   ```

2. **Odebranie ścieżki bezpośredniej:** `revoke insert, delete on public.task_checkoffs from authenticated`; `drop policy task_checkoffs_insert_self`, `task_checkoffs_delete_self`. `select` i widok bez zmian. Kaskady FK działają bez tych uprawnień (są wykonywane przez system).
3. **Strażnik stanu** (działa dla każdego autora zapisu, także `service_role` i migracji):

   ```sql
   create function public.guard_checkoff_period() returns trigger
   language plpgsql security definer set search_path = '' as $$
   declare v_recurrence text;
   begin
     select t.recurrence into v_recurrence from public.tasks t where t.id = new.task_id;
     if v_recurrence = 'weekly' and extract(isodow from new.period) <> 1 then
       raise exception 'weekly period must be a Monday' using errcode = 'SB422'; end if;
     if v_recurrence = 'once' and exists (select 1 from public.task_checkoffs c
                                          where c.task_id = new.task_id and c.user_id = new.user_id) then
       raise exception 'a once task keeps one fact per participation' using errcode = 'SB422'; end if;
     return new;
   end $$;
   create trigger task_checkoffs_guard_period before insert on public.task_checkoffs
     for each row execute function public.guard_checkoff_period();
   ```

Podział: **funkcje** egzekwują _przejście_ (tylko bieżący okres, P2, P5, P6); **trigger** egzekwuje _stan_ (klucze kanoniczne, P3). Czas-zależnej reguły nie da się wyrazić jako CHECK, a ten podział nie powiela żadnej reguły: trigger nie zna zegara, funkcje nie zgadują dnia tygodnia.

### 4.8 Kalendarz: dwie implementacje, jedna wyrocznia

TS (`periodKeyFor`, `streak-rules.ts:42-53`) zostaje: wyspa podgląda nią zmianę, a `buildBoard` liczy nią bieżący okres dla odczytu (`leaderboard-rules.ts:122`). SQL (`period_of`) służy tylko zapisowi. Ryzyko rozjazdu ogranicza:

- **Test kontraktowy** (DB, `npm test`): dla zestawu instantów z wyroczni S-04 (`plan.md:121-122`) i dodatkowych (granice DST, niedziela 23:59 → poniedziałek 00:00, zmiana roku) `period_of(r, at)` = `periodKeyFor(r, at)`. Wartości SQL dla 11 instantów już zgodne (§0).
- **Awaria głośna, nie cicha:** gdyby TS i SQL kiedyś się rozjechały, wyspa wyśle `expected_period`, którego baza nie uzna, i każde kliknięcie skończy się `stale` (widoczne od razu), zamiast po cichu zapisać zły dzień.

---

## 5. Before / after dla każdego dzisiejszego miejsca reguły (KROK 5)

| ID  | Dziś                                                                                                                                                                             | Po refaktorze                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `checkoffs.ts:63` trasa liczy okres z `new Date()` (`checkoff.ts:37`)                                                                                                            | Brak okresu po stronie zapisu w TS; `check_off` liczy `period_of(…, now())` w bazie                                                                                                            |
| B2  | `checkoffs.ts:64-65` insert + 23505 jako sukces                                                                                                                                  | `on conflict do nothing`, wynik `changed:false` (idempotencja jawna, S1)                                                                                                                       |
| B3  | `checkoffs.ts:36-51` 23503 i 42501 → jedno `forbidden`                                                                                                                           | `SB403` → `NotParticipatingError`, `SB404` → `TaskGoneError`, `42501` → `PermissionDeniedError` (S2)                                                                                           |
| B4  | `checkoffs.ts:85-97` zakres tygodnia, ciche `ok` dla nie-uczestnika                                                                                                              | `uncheck`: dokładny kanoniczny klucz; nie-uczestnik → `SB403`; `changed` jawne (S3, S5)                                                                                                        |
| B5  | `checkoff.ts:31-37`, `uncheck.ts:32-39` `getTask` + zapis (2 wywołania)                                                                                                          | 1 wywołanie `rpc`; zadanie sprawdza baza w tej samej transakcji                                                                                                                                |
| B6  | `create_task_checkoffs.sql:58-64` polityka INSERT z oknem 9 dni                                                                                                                  | Polityka usunięta, `insert` odebrany; wejście tylko przez `check_off` (P2)                                                                                                                     |
| B7  | `create_task_checkoffs.sql:66-68` polityka DELETE: dowolny własny wiersz                                                                                                         | Polityka usunięta, `delete` odebrany; cofnięcie tylko przez `uncheck` (P5)                                                                                                                     |
| B8  | `create_task_checkoffs.sql:31` `period date` bez CHECK                                                                                                                           | Trigger `task_checkoffs_guard_period`: poniedziałek dla `weekly`, jeden fakt dla `once` (P3)                                                                                                   |
| B9  | `streak-rules.ts:107-127` ciche naprawianie kluczy                                                                                                                               | **Bez zmian** (to tolerancja modelu odczytu, nie egzekwowanie). Po Migracji B ścieżka naprawy jest martwa dla poprawnych danych; testy `streak-rules.test.ts:184` zostają jako test tolerancji |
| B10 | `leaderboard-rules.ts:117-123` drugi kalendarz (odczyt)                                                                                                                          | **Bez zmian**; powiązany z SQL testem kontraktowym (§4.8)                                                                                                                                      |
| B11 | `CheckoffControl.tsx:85-90`, `checkoff-client.ts:60` klient jedynym strażnikiem okresu                                                                                           | Serwer odrzuca `SB409` → 409 przed zapisem; klient tylko reaguje (przeładowanie)                                                                                                               |
| B12 | Testy utrwalające słabość: `task-checkoff-flow.test.ts:92-99`, `:210-211`, `task-checkoffs.test.ts:76-80`, `:150-163`, helper `checkOffAs` (`tests/helpers/supabase.ts:117-119`) | Przepisane: historia przez `check_off_at` (service role), a dawne „przyjmuje okno” stają się przypadkami **odmowy** (§7)                                                                       |
| B13 | Komentarz migracji `create_task_checkoffs.sql:8-11` („period computed by the app, only bounded”)                                                                                 | Migracje są niezmienne (konwencja `harden_group_rls.sql:15`); nowa migracja opisuje nowy stan, README i `CLAUDE.md` aktualizowane w Fazie 4                                                    |

Przykład B1/B5 w kodzie:

```ts
// przed (checkoff.ts:31-37, checkoffs.ts:57-67)
const task = await getTask(supabase, taskId);
if (!task) return checkoffResponse(context, { kind: "gone" });
const outcome = await checkOff(supabase, user.id, task, new Date()); // period = periodKeyFor(task.recurrence, now)

// po
const { period } = await participationRepository(supabase, { userId: user.id }).checkOff(taskId, {
  expectedPeriod: expected,
}); // okres, uczestnictwo i widoczność: w bazie
```

---

## 6. Plan faz

Zgodnie z `lessons.md:12-17`: jedna faza = jedna gałąź i jeden PR. Kolejność wynika z wydania: `release` stosuje migracje (`supabase db push`), a dopiero potem wdraża Workera (`README.md:202`, `:336`). Dlatego migracja **zawężająca** nie może wyjść razem z kodem, który jej potrzebuje: stary Worker, jeszcze działający po `db push`, wstawiałby bezpośrednio i dostawałby 42501.

| Faza           | Zakres                                                                                                                                                                                                                                                                                                                                                         | Test-first?                                                                                                                                                                                               | Wydanie                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0              | Decyzje D-1…D-4 (§9); dwa zapytania kontrolne na produkcji (D-3): `weekly` spoza poniedziałku (zapytanie z „Gotowe, gdy” Fazy 3) oraz uczestnictwa `once` z więcej niż jednym faktem: `select count(*) from (select 1 from task_checkoffs c join tasks t on t.id = c.task_id where t.recurrence = 'once' group by c.task_id, c.user_id having count(*) > 1) x` | —                                                                                                                                                                                                         | —                                                                                              |
| 1              | **Migracja A (addytywna):** `period_of`, `check_off_at`, `check_off`, `uncheck_at`, `uncheck`; `revoke/grant`; regeneracja `src/types.ts` (`npx supabase gen types typescript --local`)                                                                                                                                                                        | **Tak.** Najpierw czerwone: scenariusze SQL w `rls-scenarios.sql`, `tests/integration/participation-commands.test.ts` (przypadki L*, I1–I3, I7–I9, I12–I14), w tym test przejścia `SB4xx` przez PostgREST | Przed kodem; nic jeszcze nie woła nowych funkcji                                               |
| 2              | **Kod:** `src/lib/participation.ts` (port, błędy, adapter), trasy `checkoff`/`uncheck`, `checkoff-response.ts` (`stale`/409), `normalizePeriodKey`, wyspa (`expected_period`), kroki smoke                                                                                                                                                                     | **Tak** dla mapowania błędów (unit, zamiast `checkoffs-reporting.test.ts`), tras i smoke 409; **nie** dla zmian wyspy (zachowanie sprawdza smoke i ręczny przegląd)                                       | Po wydaniu Fazy 1. Bezpośredni zapis nadal możliwy, więc dotychczasowe testy pozostają zielone |
| 3              | **Migracja B (zawężająca):** normalizacja danych, `revoke insert, delete`, drop dwóch polityk, trigger strażnika; testy: `checkOffAs` → `rpc`, nowe przypadki odmowy I4–I6, I10                                                                                                                                                                                | **Tak.** Czerwone najpierw: bezpośredni insert i delete mają dać 42501, wiersz `weekly` na środę przez `service_role` ma dać `SB422`                                                                      | Dopiero gdy Faza 2 działa na produkcji                                                         |
| 4              | Sprzątanie i dokumentacja: usunięcie `checkOff`, `uncheck`, `CheckoffOutcome`, `failureOutcome` z `checkoffs.ts` (zostaje `listCheckoffPeriods`), komentarz `checkoffs.ts:90-91`, README (trasy, `expected_period`, 409, RLS), `CLAUDE.md`, `glossary.md`                                                                                                      | Nie (porządki i dokumenty)                                                                                                                                                                                | Z Fazą 3 lub zaraz po                                                                          |
| 5 (opcjonalna) | `join_task(p_task_id)` z `select … from group_members … for share` w tej samej transakcji: zamyka wyścig z `create_task_participants.sql:15-20` (sama migracja proponuje taką blokadę); INV-07 staje się szczelny                                                                                                                                              | Tak                                                                                                                                                                                                       | Osobny PR, niezależny od 1–4                                                                   |

**Gotowe, gdy** (kryteria do uruchomienia):

- Po Fazie 1: `npm run test:rls` i `npm test` zielone, w tym test kontraktowy `period_of` = `periodKeyFor`.
- Po Fazie 2: `npm run smoke` zielony ze stepem 409 dla nieaktualnego okresu; `grep -rn "new Date()" src/pages/api/tasks/checkoff.ts src/pages/api/tasks/uncheck.ts` bez trafień; `grep -rn "getTask" src/pages/api/tasks/{checkoff,uncheck}.ts` bez trafień.
- Po Fazie 3: próba `insert` do `task_checkoffs` klientem `authenticated` kończy się 42501 (dla dziś, wczoraj i jutra); `select count(*) from task_checkoffs c join tasks t on t.id = c.task_id where t.recurrence = 'weekly' and extract(isodow from c.period) <> 1` zwraca 0 na lokalnej i, po D-3, na produkcyjnej bazie.
- Po Fazie 4: `grep -rn "periodKeyFor" src/lib/checkoffs.ts` bez trafień (kalendarz zapisu nie żyje już w TS).

**Odwracalność.** Migracja A: `drop function`. Migracja B: nowa migracja przywracająca granty i dwie polityki (ich definicje są w `create_task_checkoffs.sql:43-46`, `:58-68`) oraz `drop trigger`. Normalizacja danych nie jest odwracalna, ale nie zmienia wyników (§4.7).

**Test-first a istniejąca dyscyplina.** Repo ma wyrocznie pisane z PRD i runner (`streak-rules.test.ts:1-20`, `test-plan.md:137`), więc nowe przypadki zapisuję z reguł P1–P8, nie z kodu. Mutacje: Stryker tylko na nowych czystych funkcjach TS (`toParticipationError`, `normalizePeriodKey`) z zawężeniem `--mutate "ścieżka:start-koniec"` (`CLAUDE.md`, sekcja Mutation testing). Dla SQL mutacje ręczne: zamiana `<>` na `=` w kontroli okresu, usunięcie `for no key update`, usunięcie gałęzi `once`, zmiana `date_trunc('week', …)` na `'day'`. Każda ma zaczerwienić co najmniej jeden test z §7.

---

## 7. Przypadki testowe niezmiennika

Typy: **SQL** (`rls-scenarios.sql`), **INT** (`tests/integration`), **UNIT**, **SMOKE**. Instanty z wyroczni S-04 (`plan.md:121-122`).

### Legalne operacje

| ID  | Typ       | Given / When / Then                                                                                                                 |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| L1  | SQL, INT  | Uczestnik `daily` odznacza w bieżącym dniu Warszawy → `period` = data Warszawy, `changed = true`, jeden wiersz                      |
| L2  | SQL, INT  | Powtórka w tym samym okresie → `changed = false`, nadal jeden wiersz, brak błędu                                                    |
| L3  | SQL       | `weekly`, odznaczenie w środę → zapis pod poniedziałkiem; drugie w piątek tego tygodnia → no-op                                     |
| L4  | SQL       | `once`: pierwsze odznaczenie zapisuje fakt; w innym dniu → no-op, nadal jeden fakt                                                  |
| L5  | SQL       | `22:00:00Z` w CEST (północ w Warszawie) → okres +1 dzień, nowy wiersz                                                               |
| L6  | SQL, UNIT | Dni DST: 23-godzinny `2026-03-29` i 25-godzinny `2026-10-25` to po jednym okresie; granice jak w wyroczni                           |
| L7  | SQL       | Niedziela 23:30 (`2026-10-04T21:30:00Z`) → `weekly` = `2026-09-28`; poniedziałek 00:30 (`22:30:00Z`) → `2026-10-05`                 |
| L8  | INT       | `uncheck` `daily` usuwa bieżący dzień, drugie `uncheck` → `changed = false` bez błędu                                               |
| L9  | INT       | `uncheck` `weekly` usuwa tylko wiersz bieżącego poniedziałku; wcześniejsze tygodnie zostają                                         |
| L10 | INT       | `uncheck` `once` usuwa wszystkie fakty uczestnictwa niezależnie od dnia                                                             |
| L11 | INT       | `expected_period` równy bieżącemu → ok                                                                                              |
| L12 | INT       | Wyjście z zadania kasuje historię (kaskada), ponowne dołączenie i odznaczenie działa (jak `task-checkoff-flow.test.ts:305-322`)     |
| L13 | UNIT      | `snapshotOf` nadal toleruje nieposortowane i zduplikowane klucze (`streak-rules.test.ts:178-191`), bo odczyt pozostaje tolerancyjny |

### Nielegalne operacje

| ID  | Typ             | Given / When / Then                                                                                                                                                           |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | SQL, INT        | Członek grupy, który nie uczestniczy w zadaniu → `SB403`, brak wiersza                                                                                                        |
| I2  | SQL, INT        | Użytkownik innej grupy, użytkownik bez grupy, nieistniejące zadanie → `SB404`, brak wiersza                                                                                   |
| I3  | SQL, INT, SMOKE | `expected_period` ≠ bieżący (strona otwarta przez północ) → `SB409` z bieżącym okresem w `DETAIL`, **brak zapisu**; SMOKE: JSON 409 `{"ok":false,"error":"stale","period":…}` |
| I4  | SQL, INT        | Bezpośredni `insert` do `task_checkoffs` klientem `authenticated` (dziś, wczoraj, jutro) → 42501 (po Fazie 3)                                                                 |
| I5  | SQL, INT        | Bezpośredni `delete` z `task_checkoffs` klientem `authenticated` → 42501 (po Fazie 3)                                                                                         |
| I6  | SQL             | `service_role` wstawia `weekly` na środę → `SB422`; drugi fakt `once` → `SB422`                                                                                               |
| I7  | INT             | `anon` woła `check_off` i `uncheck` → 42501                                                                                                                                   |
| I8  | INT             | `authenticated` woła `check_off_at` / `uncheck_at` → 42501                                                                                                                    |
| I9  | INT             | Polecenie wołane jako M zapisuje wiersz **M**; nie istnieje parametr, którym da się podstawić innego użytkownika (P7)                                                         |
| I10 | INT             | Były członek z „duchem” uczestnictwa (wyścig `create_task_participants.sql:15-20`) → `SB404`, jak dziś `task-checkoffs.test.ts:132`                                           |
| I11 | INT             | Cofnięcie przez nie-uczestnika → `SB403` (dziś ciche `ok`, S3)                                                                                                                |
| I12 | INT             | Dwa równoległe `check_off` tego samego uczestnictwa → dokładnie jedno `changed = true`                                                                                        |
| I13 | INT             | `check_off` równolegle z wyjściem z zadania → po obu stanie nie ma faktu bez uczestnictwa (albo `SB403`, albo kaskada go usunęła)                                             |
| I14 | INT             | Kontrakt kalendarza: dla ≥ 30 instantów (§4.8) `period_of` = `periodKeyFor`, osobno `daily` i `weekly`                                                                        |
| I15 | INT             | Przejście własnych kodów przez PostgREST: `error.code === "SB409"`, `error.details` = bieżący okres                                                                           |

---

## 8. Nowe nazwy „load-bearing” do zarejestrowania

Repo **nie prowadzi** rejestru kontraktów: katalog `docs/` nie istnieje, a wyszukanie `contract-surfaces.md` w `/home/mariusz/code` (głębokość 4) nic nie znalazło. Proponuję wpisać nazwy w miejsca, które już istnieją: terminy domenowe do `context/domain/glossary.md`, trasy i pola do tabeli tras w `README.md`, a schemat do zdania o schemacie w `CLAUDE.md`. Jeśli właściciel chce osobny rejestr, ta tabela jest jego treścią.

| Rodzaj           | Nazwa                                                                                                                                                                                   | Dlaczego nie wolno jej zmienić bez śladu                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Agregat / termin | `Participation` (uczestnictwo; w nowym kodzie zamiast „enrolment”, `glossary.md`)                                                                                                       | Nazwa korzenia w planach i testach                                                        |
| SQL              | `public.period_of`, `public.check_off`, `public.uncheck`, `public.check_off_at`, `public.uncheck_at`                                                                                    | Wołane po nazwie z `rpc`; typy generowane                                                 |
| SQL              | `public.guard_checkoff_period`, trigger `task_checkoffs_guard_period`                                                                                                                   | Test I6 i scenariusze RLS                                                                 |
| SQLSTATE         | `SB403` nie uczestniczy, `SB404` zadanie niewidoczne, `SB409` okres nieaktualny (`DETAIL` = bieżący), `SB422` stan niekanoniczny                                                        | Adapter mapuje je po kodzie; fingerprint Sentry `[event, code]` (`log.ts:81`)             |
| TS               | `ParticipationRepository`, `participationRepository`, `ParticipationError`, `TaskGoneError`, `NotParticipatingError`, `StalePeriodError`, `PermissionDeniedError`, `normalizePeriodKey` | API między trasą a adapterem                                                              |
| HTTP             | pole `expected_period` (form-encoded); JSON `error: "stale"` z `period`, status 409                                                                                                     | Wyspa i smoke; rozszerza `checkoff-response.ts:10-16`                                     |
| Zdarzenia logów  | zachować `checkoff.not_enrolled`, `uncheck.not_enrolled`, `checkoff.task_gone`, `uncheck.task_gone`, `uncheck.nothing_removed`; dodać `checkoff.stale_period`, `uncheck.stale_period`   | Alerty i grupowanie błędów kluczują po nazwie zdarzenia                                   |
| Usuwane          | polityki `task_checkoffs_insert_self`, `task_checkoffs_delete_self`; z `checkoffs.ts`: `checkOff`, `uncheck`, `CheckoffOutcome`, `failureOutcome`                                       | `rls-scenarios.sql:330-333` asercjonuje te polityki: trzeba je zmienić razem z migracją B |

---

## 9. Decyzje właściciela, ryzyka, luki

### Decyzje do potwierdzenia

Nie trzeba ich podejmować wszystkie naraz. Kolumna „Najpóźniej przed” mówi, kiedy dana decyzja zaczyna być zapisana w kodzie. Dwie z nich (D-2, D-4) są wbudowane w SQL już w Fazie 1; zmiana zdania później to tania migracja `create or replace function`, ale lepiej ustalić je przed jej napisaniem albo świadomie przyjąć rekomendację jako domyślną.

| ID  | Najpóźniej przed                                                                            | Pytanie                                                                                                        | Rekomendacja                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Fazą 2 (trasa i wyspa; w Fazie 1 funkcje i tak przyjmują opcjonalny `p_expected_period`)    | Strona otwarta przez północ: odrzucić kliknięcie (409, nic nie zapisane) czy zapisać pod nowym dniem jak dziś? | Odrzucić: zamiar użytkownika dotyczył widzianego okresu, a zapis pod innym dniem zmienia jego streak (V4). Zmiana zachowania widoczna dla użytkownika, ale kończy się tym samym przeładowaniem                                                                               |
| D-2 | **Fazą 1** (funkcje zapisują wyłącznie bieżący okres, P2; Faza 3 odbiera bezpośredni zapis) | Czy okno wstecz/naprzód (V2, V3) to akceptowana luka zaufania, czy ma zniknąć?                                 | Zniknąć: plan S-04 mówi „tylko bieżący okres” (`plan.md:37`, `:62`), a PRD akceptuje brak weryfikacji wykonania (`prd.md:113`), nie podróże w czasie. Jeśli „zapomniałem odznaczyć wczoraj” ma być funkcją, to osobna decyzja produktowa z własną regułą, nie luz w polityce |
| D-3 | Fazą 3 (wymaga operatora produkcyjnej bazy; nie blokuje Faz 1–2)                            | Operator produkcyjnej bazy: ile wierszy `weekly` jest spoza poniedziałku i ile uczestnictw `once` ma >1 fakt?  | Zapytanie kontrolne z §6 przed Fazą 3; normalizacja jest bezpieczna, ale warto znać skalę                                                                                                                                                                                    |
| D-4 | **Fazą 1** (`uncheck` rzuca `SB403` dla nie-uczestnika)                                     | Cofnięcie przez nie-uczestnika: ciche `ok` (dziś) czy błąd 403?                                                | Błąd: dziś wyspa pokazuje „zapisano” bez uczestnictwa (S3)                                                                                                                                                                                                                   |

### Ryzyka

- **Sprzężenie widoczności.** Funkcje powielają znaczenie polityki SELECT na `tasks` („widoczne = członek grupy”). Zmiana modelu widoczności (np. wiele grup) musi zmienić też funkcje; pilnuje tego przypadek I2.
- **`SECURITY DEFINER` omija RLS.** Stąd jawne sprawdzenie członkostwa wewnątrz, `set search_path = ''`, `revoke execute … from public, anon` i brak parametru użytkownika w wersji publicznej (P7). Szew `*_at` jest dostępny tylko dla `service_role`.
- **Duży koszt testów.** `checkOffAs` jest użyty 55 razy (`task-checkoffs.test.ts`: 49, `task-checkoff-flow.test.ts`: 6), a `rls-scenarios.sql` ma 5 bezpośrednich `insert` i 7 `delete` na `task_checkoffs`. Faza 3 to w dużej części przepisanie fikstur na `check_off_at`.
- **Dwa kalendarze** (§4.8): ograniczone testem I14 i głośną awarią.
- **Rozszerzenie kontraktu HTTP** (409, `expected_period`): rejestrowane w §8, objęte smoke.

### Czego ten plan nie rusza

INV-01…INV-06 (egzekwowane lub zaakceptowane), INV-15 i INV-16 (jedna implementacja, wyrocznia), logika spadku (`decayStreak`), model odczytu `snapshotOf`/`buildBoard`, zachowanie „wyjście kasuje historię” (INV-08). Opcjonalna Faza 5 zamyka INV-07 tym samym narzędziem, ale nie jest warunkiem żadnej z faz 1–4.
