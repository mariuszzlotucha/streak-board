---
title: "Raport architektoniczny z modułu 4 (10xArchitect): StreakBoard"
created: 2026-10-06
type: architect-report
---

# Raport architektoniczny z modułu 4: StreakBoard

Fakty i rekomendacje mają odwołania do artefaktów (etykiety w §1), [I] oznacza wniosek, moje decyzje są w §6, a braki oznaczam „BRAK artefaktu”.

## 1. Opisane projekty

Wszystkie wejścia powstały na jednym repozytorium, **StreakBoard** (`streak-board`):

- **L2** (`d03c673`): `context/map/repo-map.md` z raportami `artifact-1…3`.
- **L3** (`6814f69`): `context/changes/data-access/research.md`.
- **L4** (`c9f6451`): `context/changes/refactor-opportunities/`: `research.md` (L4-research), `plan-brief.md` (L4-brief), `plan.md` (L4-plan), `reviews/plan-review.md` (L4-review).
- **L5** (`dd2dee0`): `context/domain/`: `01-domain-distillation.md` (L5-01), `02-invariant-aggregate-refactor.md` (L5-02), `03-anti-corruption-layer.md` (L5-03), `glossary.md` (L5-gl).

**Stack:** Astro SSR z wyspami React na Cloudflare Workers, Supabase (Auth, Postgres z RLS) (L2 §1). **Skala:** 144 moduły w grafie importów i 16 endpointów API (`artifact-2`), 5 tabel (L3 „Summary”). **Kontekst:** 192 commity nie-merge jednego autora w ok. 3 tygodnie, czyli aktywność, nie trend (L2 §1, §5, §7).

## 2. Mapa projektu (L2)

- **Strefy ryzyka** (L2 §4): (1) sesja: `middleware.ts` to jedyna brama dla `/dashboard`, `/api/groups` i `/api/tasks`, oparta na prefiksach napisów, więc jej błąd dotyka ich naraz; (2) dostęp do danych: 4 z 11 commitów to poprawki po review, a uprawnienia nie mają grafu zależności, więc nie widać, co zależy od której polityki; (3) odznaczenia i ranking serii: reguła zależy od strefy czasowej, a ten sam kod działa w kliencie i na serwerze; (4) `dashboard.astro`: 22 zależności, poza Vitest.
- **Lokalne centra** (`artifact-2` §3): największy fan-in ma `src/lib/supabase.ts` (24), ale to 20-liniowa fabryka, a ryzyko leży w middleware (L2 §4a); największy fan-out: `dashboard.astro`.
- **Entry pointy** (`artifact-2` §1): 16 endpointów API, 6 stron, 2 trasy `.ts` poza `api/` i `middleware.ts`.
- **Unknowns** (L2 §7): SQL poza analizą statyczną, kontrakty w napisach, 13 modułów `lib` bez bezpośredniego importu w testach.

## 3. Analiza ficzera (L3)

**Przepływ** „data-access” (L3, „Research Question”): jak dostęp do danych grup i zadań rozstrzyga baza; to strefa ryzyka (2) z L2 §4. **Wejście:** 13 tras POST, głównie z formularzy HTML (V4, V20); grupę wyznacza członkostwo, nie request (V6), a 21 wywołań bazy idzie klientem z sesją cookie, więc o dostępie decyduje baza (V1, L3 „Summary”). **Stan** zmienia się w 13 trasach i niejawnie w bazie: triggery dopisują właściciela do grupy i twórcę do tasku, a wyjście z grupy kasuje uczestnictwa i, kaskadą, odznaczenia (L3 §1.1a). **Wraca** przekierowanie (przy odznaczeniu JSON) albo `?error=<kod>`, a 0 wierszy z UPDATE lub DELETE daje `?error=forbidden` bez logu (L3 §1.1a).

**Dług** (L3 §2.1; V to wiersze weryfikacji z §4.1, skutki to scenariusze [I] z L3):

1. **Wydanie (D12):** `db push --yes` biegnie przed `wrangler deploy`, a zgodności wstecznej pilnuje tylko proza (V24, V26), więc migracja może odebrać uprawnienie działającemu jeszcze Workerowi.
2. **Ciche awarie (D4, D5):** 6 tras z pustym wynikiem bez raportu (V7), `dashboard.astro` tylko z `console.error` (V11); pierwszym sygnałem jest skarga użytkownika.
3. **Luka testowa (D8, D7):** 11 z 13 handlerów i 6 modułów `lib` bez importu w testach (V14, V15); zmiany odpowiedzi trasy nie zauważy żaden test.

Ryzyka 2 i 3 sprawdził ast-grep z kontrolą grepem (L3 §4.2; V11, V15 „confirmed”, V7, V14 „refined”).

## 4. Plan refaktoryzacji (L4)

**Co refaktoryzuję:** 5 z 10 okazji wyprowadzonych z długu L3 (L4-research §11), które nie zmieniają niczego, co widzi użytkownik lub klient HTTP, są niezależne i cofają się osobno (L4-brief, „Key Decisions Made”). **Docelowy kształt:** nowy `console.*`, naruszenie reguł migracji i nieświeże typy mają wywalać CI, a mappery, 13 tras, reguły zdublowane w SQL i TS oraz granty mają być przypięte testami (L4-plan, „Desired End State”).

| Faza (OPP) | Co ma zmienić                                            | Automatycznie                                 | Ręcznie                                              |
| ---------- | -------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| 1 (OPP-2)  | `console.error` → `reportError`, `no-console` jako error | grep, lint, `npm test`, build                 | wstrzyknięta awaria wobec baseline; produkcja        |
| 2 (OPP-3)  | strażnik migracji, `types:check` w jobie `integration`   | `npm test`, `guard:migrations`, `types:check` | gałąź próbna; draft PR blokowany przez `integration` |
| 3 (OPP-1)  | testy charakteryzujące mapperów i 13 tras                | `npm test`, `src` bez zmian                   | 4 break-and-restore, strażnik pokrycia               |
| 4 (OPP-5)  | testy kontraktowe SQL↔TS, dryf NUL przypięty             | `npm test`, `src` bez zmian                   | break-and-restore TS i SQL                           |
| 5 (OPP-4)  | migracja z grantami, scenariusz RLS                      | `test:rls` (+7 asercji), lint, typy           | zapytanie o granty w hostowanej bazie, release       |

**Czego świadomie nie robię:** OPP-7, 6, 8 i 10 (szkielet tras, ślad zera wierszy, jeden klient na żądanie, fail-closed `/api/*`) czekają na warunki powrotu; OPP-9 przejmuje S-10, a 503 dla dashboardu S-11 (L4-plan, „What We're NOT Doing”).

**Zastrzeżenia:** neutralność to deklaracja planu (L4-plan, „Overview”), nie pomiar [I]: Faza 1 dodaje telemetrię, a Faza 5 jest neutralna tylko, jeśli hostowana baza ma te granty (L4-research OPP-2, OPP-4). Progress: 0 z 43 wierszy odhaczonych.

## 5. Domena wg DDD (L5)

**Język** (L5-01 §1, L5-gl): **odznaczenie** (kod: check-off) to zapis faktu „uczestnik wykonał task w okresie”; **okres** to dzień w Warszawie, dla `weekly` poniedziałek; **streak** to wartość per uczestnik i task liczona przy odczycie, a ich suma to wynik członka; **enrolment** (task + użytkownik z historią odznaczeń) to pojęcie tylko z kodu, a nowy kod ma je nazywać „participation”.

**Rozjazdy** (L5-01 §4): z 12 L5-01 proponuje 8 poprawić w dokumencie, 1 w kodzie, 3 skierować do właściciela. Za rankingiem #1 (L5-01 §5) stoją R-08 (PRD: odznaczenie „na dziś”, baza: każda data z okna 9 dni) i R-09 (`weekly` ma być poniedziałkiem, a `period` nie ma CHECK).

**Niezmiennik #1: INV-11** (L5-02 §1, §2): odznaczenie dotyczy wyłącznie bieżącego okresu pod kanonicznym kluczem (`daily`: dzień w Warszawie, `weekly`: poniedziałek, `once`: jeden fakt), każdy okres najwyżej raz. L5-02 wybiera go, bo fakt odznaczenia to jedyne wejście streaka i wyniku, a żadna z 5 warstw go w całości nie wymusza.

- **Fakt** (L5-02 §3.2, §3.5): klient wysyła tylko `task_id`, okres wyznacza zegar Workera, a baza wymusza tylko unikalność, uczestnictwo i okno dat; wyspa porównuje widziany okres ze zwróconym dopiero po zapisie (INV-14), więc kliknięcie po północy trafia pod nowy okres (scenariusz V4, §3.6).
- **Projekt L5-02 (niewdrożony):** agregat **`Participation`** (uczestnictwo z odznaczeniami, reguły P1–P8) ma żyć w funkcjach SQL `check_off` i `uncheck`, bo baza widzi każdą ścieżkę zapisu, a jedno wywołanie to jedna transakcja. To decyzja architektoniczna L5-02 (opcja C); agregat w TS (opcje A i B) odrzucono (§4.1). Żądanie ma nieść `expected_period`; gdy nie jest bieżący (P6), funkcja ma zgłosić błąd domenowy `SB409`, adapter ma go przetłumaczyć na `StalePeriodError`, a trasa zwrócić HTTP 409, bez zapisu (§4.4–§4.6).
- **Moja decyzja** (§6): tylko bieżący okres (02 D-2) i odrzucanie odznaczenia z nieaktualnego okresu (02 D-1), czyli zmiana widoczna dla użytkownika (L5-02 D-1), nie neutralny refaktor z L4.

**ACL** (L5-03 §1.2, §2): przecieka **Supabase**: zna go 5 warstw (middleware, HTTP, strony, biblioteka, raportowanie) i 36 plików `src/`. Najgroźniejszy jest ręczny kontrakt „odmowa RLS = zero wierszy, bez błędu” w tych samych 6 trasach co D4 w L3 (L5-03 §3.4).

## 6. Decyzje, które należą do mnie

Z L4 rozstrzygnąłem zakres, trzy guardy OPP-3, styl testów OPP-1, jednorazowy wyjątek od niezmienności migracji, kształt OPP-4 i 5 faz zamiast 7 (powody: L4-brief, „Key Decisions Made”); kolejność faz ustawił sam plan. Z L5 rozstrzygnąłem cztery sprawy zgodnie z tym, co L5 rekomenduje lub proponuje: zamykam okno dat, więc funkcje SQL mają zapisywać tylko bieżący okres (02 D-2; R-08 zniknie dopiero po Fazie 3 planu 02, czyli Migracji B, L5-02 §6); odznaczenie albo jego cofnięcie ma być odrzucane bez zapisu (HTTP 409), gdy widziany okres nie jest już bieżący (02 D-1); robię Fazy 1–3 i 6 ACL, a Fazy 4–5 czekają (03 D-1); spadek streaka „połowa, w dół” jest ostateczny, więc poprawić trzeba PRD, nie kod (Q-01). L5 podaje przy tych sprawach tylko rekomendacje i nadal pokazuje je jako otwarte, więc to moje rozstrzygnięcia, a nie fakty z artefaktów. Dlaczego rozstrzygnąłem te cztery sprawy tak, a nie inaczej: BRAK artefaktu, bo L5 zapisuje tylko powody swoich rekomendacji. Otwarte zostają 02 D-3 i D-4, 03 D-2…D-6, Q-02…Q-09 (w tym Q-04), Fix B z L4-review F3 oraz dwie kwestie dla właściciela produktu: reguła okresu, której PRD nie podaje, choć mają ją kod i L5 (N-19, B-07), i komunikat przy konflikcie 409 (L5-02 §4.6 przewiduje tylko przeładowanie).

## Luki

**BRAK artefaktu:** wyników implementacji L4 i L5, zapisu decyzji z §6 w L5, moich uzasadnień czterech decyzji z L5, danych produkcyjnych (hostowana baza, `max_rows`; L3 „Summary”, Q-07, Q-08) i wyników smoke oraz Playwrighta.
