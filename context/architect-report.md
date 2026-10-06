---
title: "Raport architektoniczny z modułu 4 (10xArchitect): StreakBoard"
created: 2026-10-06
type: architect-report
---

# Raport architektoniczny z modułu 4: StreakBoard

Raport odpowiada na dwa różne pytania i nie miesza ich dowodów. Każdy wniosek odwołuje się do konkretnego artefaktu i miejsca, które go uzasadnia: sekcji, tabeli albo identyfikatora, np. L3 V20 lub L5-02 D-2. Mapowanie etykiet na pliki znajduje się w §1. Liczby podaję tylko tam, gdzie niosą wniosek. Brak danych oznaczam „BRAK artefaktu”.

| Pytanie                                           | Artefakty  | Co z nich wynika                                                                                                             |
| ------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **A. Jak bezpiecznie zmienić kod?**               | L2, L3, L4 | gdzie jest ryzyko, jak działa przepływ, czym i w jakiej kolejności go chronić (§2–§4)                                        |
| **B. Czy kod odpowiada temu, jak działa biznes?** | L5         | język domeny, rozjazdy dokument–kod, niezmiennik z projektem agregatu-strażnika (niewdrożonym), przeciekająca zależność (§5) |

Plan z A jest opisany jako refaktoryzacja bez zamierzonej zmiany zachowania widocznego dla użytkownika (L4-plan, „Overview”; zastrzeżenie w §4). Diagnoza z B może prowadzić do zmian takiego zachowania. Przykład dotyczy odznaczenia (w kodzie check-off), czyli zapisu faktu „uczestnik wykonał task w okresie” (L5-gl). Rozdzielam w nim fakt, projekt L5 i moją decyzję:

- **Fakt:** dziś klient wysyła tylko identyfikator tasku, a serwer wyznacza okres z własnego zegara według reguły kalendarza (dzień w Warszawie, dla `weekly` poniedziałek) i zapisuje odznaczenie pod tym okresem, niezależnie od okresu widzianego przez użytkownika (L5-02 §3.5, V4). Serwer nie sprawdza zgodności z okresem widzianym przez użytkownika: trasa go nie zna, a baza sprawdza o okresie tylko, czy mieści się w oknie dat, nie czy jest bieżący (L5-02 §3.2, §3.5). Zwrócony okres porównuje z widzianym dopiero klient, po zapisie (to INV-14, faseta INV-11: odznaczenie dotyczy okresu, który użytkownik widział; L5-02 §1, §2, §3.5). Reguła kalendarza jest w kodzie (`periodKeyFor`) i w modelu L5 (T-10, N-19), ale nie wynika z PRD i wymaga potwierdzenia przez właściciela produktu (§6).
- **Projekt L5-02 (niewdrożony):** żądanie HTTP ma nieść okres widziany przez użytkownika (`expected_period`); trasa i adapter TS przekazują go do funkcji SQL. W tych funkcjach mają być sprawdzane przed zapisem reguły agregatu `Participation`, w tym P6: okres widziany przez użytkownika ma być bieżący (decyzja architektoniczna L5-02: reguły agregatu wykonuje baza, nie kod TS). Przy różnicy operacja kończy się błędem domenowym „okres nieaktualny” (SQLSTATE `SB409`), który trasa zwraca wyspie jako HTTP 409, bez zapisu (§4.1, §4.2 P6, §4.4–§4.6, D-1). Efekt w UI: to samo przeładowanie strony co dziś, tyle że odznaczenie nie zostaje zapisane; komunikatu L5-02 nie przewiduje (§4.6, D-1).
- **Decyzja (§6, 02 D-1):** odrzucać odznaczenie z nieaktualnego widoku. Dotyczy to semantyki biznesowej konfliktu, nie implementacji, i zmienia zachowanie produktu (nie jest to neutralny refaktor): zamiast przypisywać odznaczenie do bieżącego okresu, jak dziś, system go nie zapisze. Jest to moja decyzja, a nie fakt z artefaktu ani automatyczny skutek raportu; obsługa konfliktu w UI pozostaje otwarta.

## 1. Opisane projekty

Wszystkie artefakty powstały na **jednym repozytorium: StreakBoard** (`streak-board`). Artefaktów z innego projektu nie ma.

| Lekcja | Artefakt                                                                                                                                                           | Stan repo                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| L2     | `context/map/repo-map.md` (liczby z jego raportów `artifact-1…3` w tym samym katalogu)                                                                             | `d03c673`, 2026-10-05                   |
| L3     | `context/changes/data-access/research.md`                                                                                                                          | `6814f69`, `feat/m4l3-feature-analysis` |
| L4     | `context/changes/refactor-opportunities/`: `research.md` (L4-research), `plan-brief.md` (L4-brief), `plan.md` (L4-plan), `reviews/plan-review.md` (L4-review)      | `c9f6451`, 2026-10-06                   |
| L5     | `context/domain/`: `01-domain-distillation.md` (L5-01), `02-invariant-aggregate-refactor.md` (L5-02), `03-anti-corruption-layer.md` (L5-03), `glossary.md` (L5-gl) | `dd2dee0`, `m4l5-ddd`                   |

**Stack:** Astro SSR z wyspami React na Cloudflare Workers, Supabase (Auth, Postgres z RLS) (L2 §1). Historia to ~3 tygodnie i jeden autor, więc L2 pokazuje aktywność, nie trend, i nie pozwala ocenić bus factoru (L2 §7).

**Liczby i wniosek, który niosą:**

- 13 tras mutujących (L3 „Summary”) to 13 punktów wejścia; kontrakt „odmowa RLS = zero wierszy, bez błędu” (L5-03 §3.4) jest ręcznie powielony w 6 z nich (L3 V7).
- 5 tabel i 7 migracji (L3 „Summary”) opisują persystencję, nie granice domeny: uczestnictwo i odznaczenia to jeden kontekst na dwóch tabelach, a wynik nie ma tabeli (L5-01 §1.5).
- 385 testów Vitest i 293 asercje SQL (L4-plan, „Current State Analysis”) nie zamykają INV-11: testy bazy sprawdzają okno dat, nie kanoniczność klucza (L5-01 §5).

## 2. Mapa projektu (L2)

| Strefa (L2 §4, każda ≥2 sygnały)                                                                                                         | Sygnał techniczny (L2)                                                       | Znaczenie dla produktu (L5)                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Odznaczenia i ranking serii (w L2: „Check-off i ranking serii”): `streak-rules`, `leaderboard-rules`, `checkoffs`, `CheckoffControl.tsx` | reguła zależy od strefy czasowej; ten sam kod w bundlu klienta i na serwerze | **Core**: jedyna reguła domenowa, sedno wartości (L5-01 §2). Odznaczenie zapisuje fakt, streak liczy się przy odczycie (§5.1)           |
| Dostęp do danych: migracje `harden_*`, `rls-scenarios.sql`                                                                               | 4 z 11 commitów to poprawki po review; uprawnienia bez grafu zależności      | izolacja grup (`prd.md:36`) i kod zaproszenia jako jedyna bramka wejścia (N-04, N-05; L5-01 §3)                                         |
| Logowanie i sesja: `middleware.ts`, `api/auth/*`                                                                                         | jedyna brama dla 3 prefiksów, oparta na napisach; trzy slice’y utwardzające  | **Generic**: FR-001 deleguje do gotowego dostawcy (L5-01 §2)                                                                            |
| Widok `dashboard.astro`                                                                                                                  | 22 zależności, 4 poprawki po review; poza Vitest                             | niesie ostrzeżenia o kasowaniu historii (`:208`, `:294`, `:387`; N-12) i „Unknown member” dla uczestnika-nie-członka (`:144-149`; N-10) |

**Unknowns** (L2 §7): SQL poza grafem, kontrakty w napisach, 13 modułów `lib` bez bezpośredniego importu w testach. To, że baza nie egzekwuje INV-11, widać dopiero w SQL, którego L2 nie analizuje (L5-02 §3.2).

## 3. Analiza ficzera (L3)

**Przepływ** (strefa „dostęp do danych” w L2 §4): 13 tras POST z natywnych formularzy, grupa wynika z członkostwa, nie z requestu (V6, V20). Wszystkie 21 wywołań DB (18 `.from`, 3 `.rpc`) idzie klientem z sesją cookie, bez service-role (V1, V3), więc granty, RLS i triggery działają niewidocznie dla tras. V to wiersze weryfikacji w L3 §4.1.

**Dług** (L3 §2.1): (1) wydanie, D12: `db push --yes` biegnie przed `wrangler deploy` (V26), a zgodność wsteczna migracji to tylko proza (`lessons.md:81`; V24). (2) Ciche awarie, D4+D5: 6 tras z pustym wynikiem bez raportu (V7), `dashboard.astro` bez importu `lib/log` i z 5× `console.error` (V11). (3) Luka testowa, D8+D7: 11 z 13 handlerów bez importu w żadnym teście (V14), 6 modułów `lib` z 0 importerów (V15). Weryfikacja objęła 28 wierszy: 1 obalony (V9, filtr w `uncheck`), 1 nowy fakt (V28).

## 4. Plan refaktoryzacji (L4)

**Wybór** (z rankingu 10 okazji w L4-research §11): 5 zachowawczych, OPP-2, 3, 1, 5 i 4. **Pięć faz** (L4-plan, Phase 1–5): (1) 5× `console.error` → `reportError` i `no-console` jako error, więc nowy `console.*` wywala lint; (2) `migration-guard.mjs` i `types:check` w wymaganym jobie `integration`, który wywala edycję zmergowanej migracji, migrację destrukcyjną bez markera, migrację starszą od najnowszej i nieświeże `types.ts`; (3) testy charakteryzujące mapperów i 13 tras; (4) testy kontraktowe SQL↔TS (dryf NUL przypięty testem, nienaprawiany, bo to zmiana zachowania: L4-brief, „Key Decisions Made”); (5) migracja z jawnymi grantami i scenariusz RLS.

**Neutralność to deklaracja planu, nie pomiar.** Faza 1 zmienia telemetrię (nowe zdarzenia Sentry i logi; L4-research OPP-2), a Faza 5 jest neutralna tylko tam, gdzie hostowana baza już ma te granty ([I]; L4-research OPP-4). Sprawdzi to dopiero zapytanie właściciela na końcu Fazy 5 (L4-plan, Phase 5).

**Czego nie robimy:** odłożone z warunkami powrotu są OPP-7, 6, 8 i 10 (L4-brief, „Key Decisions Made”). Poza zakresem (L4-plan, „What We're NOT Doing”): bramka „old code against new schema” i Playwright w CI (S-10), 503 dla dashboardu (S-11), edycja `CLAUDE.md`. **Review** (L4-review, nagłówek i „Grounding”): REVISE (0 krytycznych, 2 ostrzeżenia, 4 obserwacje), po naprawie SOUND (119/119 sprawdzeń). **Status (L4-plan, Progress): 0 z 43 wierszy odhaczonych, implementacja nie ruszyła.**

## 5. Domena wg DDD (L5)

§5 odpowiada na trzy pytania: jakie pojęcia tworzą język StreakBoard (§5.1), jaki niezmiennik jest najważniejszy i gdzie go obejść (§5.3), jaka zależność przecieka i jak sprawdzić jej izolację (§5.4). L5 to diagnoza i plany; wyników ich implementacji nie ma (BRAK artefaktu).

### 5.1 Pięć pojęć, które tworzą język StreakBoard (L5-01 §1, L5-gl)

| Termin                           | Znaczenie biznesowe                                                                                    | Nazwa w kodzie                                                     | Rozjazd                                                                                                                                                                                                                 | Proponowana decyzja (L5)                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Odznaczenie** (kod: check-off) | Zapis faktu „uczestnik wykonał task w okresie” (T-09); system nie sprawdza, czy task wykonano (INV-10) | `task_checkoffs`, `checkOff`, `uncheck`, trasy `checkoff`          | Zapis, nie zmiana serii: streak liczy się przy odczycie (INV-15). PRD mówi o tym trzema sformułowaniami: „odznaczyć wystąpienie” (`prd.md:80`), „oznaczony jako zrealizowany” (`:45`), „wykona przypisany task” (`:97`) | L5-gl: pisz „odznaczenie”, unikaj completion, tick, „done” |
| **Okres**                        | Dzień w Warszawie, dla `weekly` poniedziałek (T-10)                                                    | `PeriodKey`, `periodKeyFor`, `task_checkoffs.period`               | PRD: „na dziś” bez definicji dnia (`prd.md:45`; B-07); baza liczy dzień w UTC z oknem UTC−7…UTC+1 (W-15)                                                                                                                | §5.2: R-08 (pytanie Q-04), R-09 (kod)                      |
| **Streak**                       | Wartość per uczestnik i task; suma po taskach to wynik członka (T-11, T-13)                            | `streakValue`, `decayStreak`; suma: `total`                        | Jedno słowo, dwa znaczenia (W-14): PRD zlewa je w „suma streaków” (`prd.md:97`). Klasy `Streak` nie ma, ale model jest: reguła w jednym module (`streak-rules.ts:69-75`, `:96-150`)                                     | §5.2: R-01 (dokument)                                      |
| **Twórca**                       | Właściciel grupy (stały) albo twórca tasku (traci uprawnienia po wyjściu z grupy) (W-13)               | `groups.owner_id` vs `tasks.created_by`                            | PRD używa „twórca” dla obu (`prd.md:58`, `:68`)                                                                                                                                                                         | L5-gl: „właściciel grupy” vs „twórca tasku”                |
| **Enrolment** (uczestnictwo)     | Para task + użytkownik z historią odznaczeń (W-02)                                                     | `EnrolmentPeriods`, `task_participants`; nowy kod: „participation” | Pojęcie tylko kodowe (zero trafień w `prd.md`, `shape-notes.md`, `roadmap.md`); osoba ma 4 nazwy w 4 rolach (W-16)                                                                                                      | L5-gl: w nowym kodzie „participation”                      |

### 5.2 Rozjazdy dokument–kod (L5-01 §4)

12 rozjazdów (R-01…R-12). L5-01 proponuje: 8× poprawić dokument, 1× kod (R-09), 3× pytanie do właściciela (R-08, R-10, R-11). Pozycję #1 w rankingu refaktoru (L5-01 §5: legalny okres odznaczenia; w raporcie §5.3) uzasadniają R-08 i R-09. Cztery przykłady; moje decyzje w ich sprawie są w §6.

| ID         | Dokument mówi                                                | Kod robi                                                                                                                                                                                                                                                                        | Proponowana decyzja (L5-01)   |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| R-01       | Streak „nie zeruje się całkowicie” (`prd.md:97`)             | `decayStreak` połowi w dół, 1 spada do 0 (`streak-rules.ts:69-75`); odchylenie opisuje archiwalny plan S-04 (`archive/2026-10-01-checkoff-and-leaderboard/plan.md:60`)                                                                                                          | Dokument                      |
| R-08       | US-01: odznaczenie „na dziś” (`prd.md:45`)                   | trasa wyznacza okres z zegara serwera (`checkoffs.ts:63`), baza przyjmuje każdą datę z okna 9 dni (`create_task_checkoffs.sql:63`)                                                                                                                                              | Pytanie do właściciela (Q-04) |
| R-09       | `weekly` = poniedziałek (`create_task_checkoffs.sql:8-9`)    | `period date` bez CHECK (`:31`); poniedziałek wymusza tylko trasa, a odczyt i `uncheck` naprawiają tydzień po cichu (`streak-rules.ts:109`, `checkoffs.ts:90-92`)                                                                                                               | Kod (ranking #1 w L5-01 §5)   |
| R-10, R-11 | Taski „indywidualne” (`prd.md:29`) i „poziomy” (`prd.md:20`) | brak odpowiednika: każdy task ma `group_id NOT NULL` (`create_tasks.sql:20`). „BRAK w kodzie” stawiano po wyszukaniu wariantów (`level`, `badge`, `achievement`, `medal`; `individual`, `personal`, `private`, `solo`) w `src/`, `supabase/`, `scripts/`, `tests/` (B-01, B-05) | Pytanie do właściciela (Q-06) |

### 5.3 Niezmiennik INV-11 (L5-02 §1–§3)

**Reguła:** odznaczenie dotyczy wyłącznie bieżącego okresu, pod kanonicznym kluczem (`daily`: dzień w Warszawie, `weekly`: poniedziałek, `once`: jeden fakt), każdy okres najwyżej raz. Źródła: `prd.md:45` („na dziś”), FR-008 (`prd.md:80`), archiwalny plan S-04 (`plan.md:37` w tym samym katalogu). Fakt odznaczenia jest jedynym wejściem do streaka i wyniku (INV-15, INV-16), a `streakValue` ufa temu, co dostaje (L5-02 §2), więc błędny fakt zmienia wynik każdego, kto go zawiera.

**Ocena wyboru** (L5-02 §2): INV-11 żyje w 5 warstwach i 8 plikach i żadna nie wymusza całości, a INV-15 (streak) ma jedną funkcję i wyrocznię testową (`streak-rules.test.ts:1-20`). W PRD ma oparcie „bieżący okres” (US-01), ale strefy i poniedziałku jako początku tygodnia PRD nie podaje (N-19); wprowadził je plan S-04 (`plan-brief.md:23` tamże), więc kanoniczny klucz jest decyzją projektową, nie regułą biznesową. To rekomendacja agenta, nie zatwierdzona reguła (moja decyzja: niżej).

**Fakt: kto go dziś pilnuje** (L5-02 §3.1–§3.5):

- **UI:** wysyła tylko `task_id` (`checkoff-client.ts:41`). Okres, który użytkownik widział, zostaje w wyspie i dopiero po odpowiedzi serwera jest porównywany ze zwróconym (`checkoff-client.ts:60`), po czym wyspa przeładowuje stronę (`CheckoffControl.tsx:85-90`). To pilnuje tylko INV-14, i to po fakcie: zapis już się stał.
- **Trasa:** czyta tylko `task_id` (`checkoff.ts:19`), więc sama wyznacza okres z zegara Workera (`checkoffs.ts:63`). Odczyt zadania i zapis to dwa wywołania bez wspólnej transakcji (`checkoff.ts:31-37`).
- **Baza**, jedyna warstwa widząca każdą ścieżkę zapisu: zapisuje okres podany przez trasę, a wymusza tylko unikalność identycznego klucza (`create_task_checkoffs.sql:33`), uczestnictwo (`:34`) i okno dat (`:63`). Nie wymusza bieżącego okresu, poniedziałku dla `weekly` ani jednego faktu dla `once`, a polityka DELETE pozwala kasować dowolny własny wiersz (`:66-68`).
- **Odczyt:** `snapshotOf` po cichu naprawia złe klucze (`streak-rules.ts:107-127`).
- **Testy:** nie zamykają reguły. Sprawdzają okno dat (`task-checkoffs.test.ts:150-163`), a nie kanoniczność klucza, a jeden wprost zakłada słabość: wiersz na inny dzień tygodnia dla `weekly` ma przejść (`task-checkoff-flow.test.ts:210-211`).

**Fakt (wynika z kodu): możliwe obejścia** (L5-02 §3.6): V1, `weekly` z wierszem na środę obok poniedziałku; V2, dopisanie pominiętego dnia z ostatnich 7; V3, odznaczenie jutra; V4, odznaczenie po końcu okresu, który użytkownik widział (strona otwarta przez północ): przepływ opisany wyżej kończy się zapisem pod nowym okresem, więc streak zmienia się wbrew zamiarowi użytkownika (D-1); nie wymaga ataku. V1–V3 wymagają bezpośredniego dostępu do PostgREST, a `SUPABASE_KEY` jest sekretem serwerowym, więc prawdopodobieństwo jest niskie.

**Projekt L5-02 (niewdrożony), kandydat na strażnika:** agregat **`Participation`** (task + użytkownik; granica spójności: uczestnictwo i jego odznaczenia; reguły P1–P8, m.in. P2: zapisywany jest tylko okres bieżący, i P6: operacja z widzianym okresem innym niż bieżący jest odrzucana bez skutku ubocznego; L5-02 §4.2). Decyzja architektoniczna L5-02 (§4.1, opcja C; precedens: `join_group`): zachowanie agregatu ma mieszkać w funkcjach SQL `check_off` i `uncheck` (§4.3), wołanych przez RPC, bo baza widzi każdą ścieżkę zapisu (§3.2), a w PostgREST każde wywołanie to osobna transakcja, więc `load → zmień → save` w TS rozjeżdża się w czasie (§4.5); agregat w TS odrzucono (opcje A i B). Warstwy w planie: żądanie HTTP z `expected_period` → trasa → adapter TS (implementacja portu `ParticipationRepository`, §4.5) → funkcja SQL (w jednej transakcji najpierw reguły agregatu, potem zapis) → wynik albo błąd domenowy `SB409`, który adapter tłumaczy na `StalePeriodError`, a trasa zwraca jako HTTP 409 (§4.4–§4.6).

**Moja decyzja:** przyjmuję bieżący okres (02 D-2) i odrzucanie odznaczeń z nieaktualnym okresem (02 D-1); normalizacja istniejących wierszy czeka na dane z produkcji (02 D-3, Q-08). Miejsce agregatu (opcja C, §4.1) to wybór planu L5-02, nie moja decyzja z §6. Strażnik pozostaje planem, nic z niego nie wdrożono; rozstrzygnięcia zbiera §6.

### 5.4 Granica zależności: przecieka Supabase (L5-03)

**Fakt (diagnoza L5-03):** zna go 5 warstw (middleware, HTTP, strony, biblioteka, raportowanie) i 36 plików `src/` (28 wywołań API: 21 danych + 7 auth; L5-03 §1.2, §2). Dokumenty nie deklarują wymienialności, więc ACL uzasadnia spójność błędów i testowalność, nie przenośność (L5-03 §0). Groźny przeciek to ręczny kontrakt „odmowa RLS = zero wierszy, bez błędu” w 6 trasach, tych samych co D4 w L3 (L5-03 §3.4).

**Projekt L5-03 (niewdrożony):** 2 value objecty (`AppUser`, `BackendError`), 4 porty (`GroupsPort` 9 operacji, `TasksPort` 9, `ParticipationPort` 3, `AuthPort` 6; razem 27), adapter w `src/lib/acl/supabase/`, 6 faz bez migracji, ok. 2,5–3 dni [I] za całość (L5-03 §4, §6.3, „Streszczenie”; szacunku per faza brak).

**Projekt L5-03: jak sprawdzić izolację** (§5.1, §6.1): po Fazie 6 `grep -rlE '@supabase/' src` (C1) zwraca wyłącznie `src/lib/acl/supabase/*`, a wyszukiwania C2–C5 po powierzchni API (fabryka klienta, `.from(`/`.rpc(`, SQLSTATE, kody GoTrue) wskazują tylko adapter albo 0 wyników. Egzekwować to ma ESLint (`no-restricted-imports`; szkic bloku dla Fazy 6, L5-03 §6.1), z dowodem celowym naruszeniem. Sam C1 nie wystarcza: dziś zwraca tylko 3 pliki, choć fabrykę klienta importuje 25 (C2), a `.from(`/`.rpc(` stoi w 14 (C3), więc byłby zielony przy 25 plikach znających API. Wymiana SDK dotknęłaby wtedy 7 plików adaptera zamiast 36 plików `src/`.

**Moja decyzja:** Fazy 1–3 i 6 (03 D-1; §6); Fazy 4–5 (uczestnictwo, auth) czekają na osobną decyzję.

### 5.5 Wnioski architektoniczne z domeny (propozycje L5; przyjęte tylko decyzje z §6, nic nie wdrożono)

Plan zakłada: strażnik INV-11 w bazie, nie w trasie ani w UI (L5-02 §4); Supabase za portami, żeby kontrakt błędów miał jedno miejsce (L5-03 §4); poprawka dokumentu, nie kodu, dla 8 z 12 rozjazdów (L5-01 §4). Proponowana kolejność (L5-03 §6.3): sieć testowa z L4 (Faza 3), ACL (Fazy 1–3), potem Faza 2 planu 02, bo bez siatki migracja tras byłaby ślepa.

## 6. Decyzje, które należą do mnie

**Z L4** (kolumna _Source_ w `plan-brief.md` i `plan-review.md`). Rozstrzygnąłem zakres (5 zachowawczych OPP), trzy guardy OPP-3, styl OPP-1 (jedna tabelaryczna suita z guardem pokrycia), jednorazowy wyjątek od niezmienności migracji, kształt OPP-4 i 5 grubszych faz zamiast 7. Plan sam ustawił guardy przed testami (tną ryzyko produkcyjne), a w review ograniczenie reguły kolejności migracji zamknięto rekomendowanym wariantem A (dokumentacja i recovery). Wariant B, czyli zmiana polityki merge (`strict_required_status_checks_policy`), to decyzja właściciela repozytorium i pozostaje otwarta.

**Z L5, rozstrzygnięte przy tym raporcie** (artefakty L5 podają przy nich tylko rekomendacje i nadal pokazują je jako otwarte):

- **Okno dat (02 D-2).** L5-02 rekomenduje zamknąć lukę. **Decyzja: zamykam ją, funkcje SQL mają zapisywać tylko bieżący okres.** Plan 02 wbudowuje tę decyzję w SQL już w Fazie 1, więc musi zapaść przed nią, a R-08 zniknie dopiero po Fazie 3 (Migracja B odbiera bezpośredni zapis; L5-02 §6).
- **Okres widziany przez użytkownika (02 D-1).** L5-02 rekomenduje odrzucić, bo zamiar użytkownika dotyczył widzianego okresu, a zapis pod innym okresem zmienia jego streak (V4). **Decyzja: przyjmuję tę rekomendację: odznaczenie albo jego cofnięcie ma być odrzucane bez zapisu, gdy widziany okres nie jest już bieżący, a kontrakt przyjmuję z L5-02 §4.4: błąd domenowy `SB409`, który trasa zwraca jako HTTP 409 `stale` z bieżącym okresem (JSON dla wyspy; bez JS przekierowanie na `/dashboard`).** Dziś zapis ląduje pod okresem wyznaczonym z zegara serwera (V4). To zmiana zachowania widocznego dla użytkownika, a nie neutralny refaktor, więc Faza 2 planu 02, nie L4.
- **ACL (03 D-1).** L5-03 rekomenduje Fazy 1–3 i 6, a Fazy 4–5 „po decyzji”. **Decyzja: robię Fazy 1–3 i 6.** Fazy 4–5 (auth, uczestnictwo) czekają na osobną decyzję.
- **Spadek streaka (Q-01).** L5-01 pyta, czy reguła „połowa, w dół” jest ostateczna, i proponuje opisać ją w PRD (R-01). **Decyzja: jest ostateczna.** Do poprawy jest PRD, nie kod.

**Nadal otwarte** (według artefaktów): 02 D-3 i D-4, 03 D-2…D-6, część 03 D-1 o Fazach 4–5, Q-02…Q-09 (w tym Q-04) i wariant B z L4 review F3 (polityka merge). **Niewiadome, które zgłaszam przy tym raporcie** (rozstrzyga właściciel produktu): (1) reguła okresu, czyli strefa Warszawa i poniedziałkowy początek `weekly`: jest w kodzie i w modelu L5 (T-10, N-19), ale PRD jej nie podaje (B-07), a L5-01 nie stawia o nią pytania; (2) obsługa konfliktu 409 w UI: L5-02 przewiduje tylko przeładowanie (§4.6), komunikatu nie.

## Luki i zależności

- **BRAK artefaktu:** wyników implementacji L4 i L5, zapisu decyzji z §6 w artefaktach L5, danych produkcyjnych (stanu hostowanej bazy, domyślnych uprawnień Supabase i produkcyjnego `max_rows` z L3; Q-07 i Q-08 z L5), uruchomionych smoke i Playwrighta.
- **Korekty między warstwami:** L3 sprostował L2 (formularze, nie `fetch`; V20), L4 poprawił L3 (pre-read w 9, nie 10 z 13 tras; L3 V5, L4 V11).
