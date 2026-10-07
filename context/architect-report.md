---
title: "Raport architektoniczny z modułu 4 (10xArchitect): StreakBoard"
created: 2026-10-06
type: architect-report
---

# Raport architektoniczny z modułu 4: StreakBoard

Fakty i rekomendacje mają odwołania do artefaktów (etykiety w §1), [I] oznacza wniosek, moje decyzje są w §6, a braki oznaczam „BRAK artefaktu”. Identyfikatory (V11, D12, OPP-2 itd.) pochodzą z artefaktów, a etykieta przed numerem wskazuje źródło: L5-02 D-2 to decyzja D-2 z L5-02.

## 1. Opisane projekty

Wszystkie wejścia powstały na jednym repozytorium, **StreakBoard** (`streak-board`):

- **L2** (`d03c673`): `context/map/repo-map.md` z raportami `artifact-1…3`.
- **L3** (`6814f69`): `context/changes/data-access/research.md`.
- **L4** (`c9f6451`): `context/changes/refactor-opportunities/`: `research.md` (L4-research), `plan-brief.md` (L4-brief), `plan.md` (L4-plan), `reviews/plan-review.md` (L4-review).
- **L5** (`dd2dee0`): `context/domain/`: `01-domain-distillation.md` (L5-01), `02-invariant-aggregate-refactor.md` (L5-02), `03-anti-corruption-layer.md` (L5-03), `glossary.md` (L5-gl).

**Stack:** Astro SSR z wyspami React na Cloudflare Workers, Supabase (Auth, Postgres z RLS) (L2 §1). **Skala:** 144 moduły w grafie importów i 16 endpointów API (`artifact-2`), 5 tabel (L3 „Summary”).

## 2. Mapa projektu (L2)

- **Strefy ryzyka** (L2 §4): (1) sesja: `middleware.ts` to jedyna brama dla `/dashboard`, `/api/groups` i `/api/tasks`, oparta na prefiksach napisów, więc jej błąd dotyka ich naraz [I]; (2) dostęp do danych: 4 z 11 commitów to poprawki po review, a uprawnienia nie mają grafu zależności, więc nie widać, co zależy od której polityki [I]; (3) odznaczenia i ranking serii: reguła zależy od strefy czasowej, a ten sam kod działa w kliencie i na serwerze; (4) `dashboard.astro`: 22 zależności, poza Vitest.
- **Lokalne centra** (`artifact-2` §3): najczęściej importowany jest `src/lib/supabase.ts` (importują go 24 pliki), ale wysoki fan-in „nie oznacza dużej logiki”: to 20-liniowa fabryka, a ryzyko leży w middleware (L2 §4a); najwięcej importuje `dashboard.astro` (strefa 4).
- **Entry pointy** (`artifact-2` §1): 16 endpointów API, 6 stron, 2 trasy `.ts` poza `api/` i `middleware.ts`.
- **Unknowns** (L2 §7): SQL poza analizą statyczną, kontrakty w napisach, 13 modułów `lib` bez bezpośredniego importu w testach.

## 3. Analiza ficzera (L3)

**Przepływ** „data-access” to strefa ryzyka (2), czyli obok sesji miejsce, gdzie według L2 najbardziej „boli”: tam „reguły dostępu żyją w SQL, którego żadne narzędzie nie widzi” (L2 §1, §4). L3 rozpisuje te reguły na trasy, operacje w bazie i mechanizmy autoryzacji (L3 „Research Question”, §1.3), a w §1.1a streszcza przepływ w czterech pytaniach. **Wejście** to 13 tras POST, głównie z formularzy HTML (V4, V20; V to wiersze weryfikacji z §4.1). **Autoryzacja:** aplikacja waliduje kształt danych i bierze grupę z członkostwa, nie z requestu (V6), a o tym, kto może zmienić który wiersz, decyduje baza. **Stan** zmieniają trasy, a niejawnie triggery i kaskady w bazie: wyjście z grupy kasuje uczestnictwa i odznaczenia. **Wraca** przekierowanie (przy odznaczeniu JSON) albo `?error=<kod>`, a 0 wierszy z UPDATE lub DELETE daje `?error=forbidden` bez logu.

**Dług** (L3 §2.1):

1. **Wydanie i blast radius (D12, pierwszy w rankingu L3):** `db push --yes` biegnie przed `wrangler deploy` (V26), a zgodności wstecznej pilnuje tylko proza, więc migracja może zawęzić politykę RLS albo odebrać uprawnienie działającemu jeszcze Workerowi [I]. Narażona jest każda ścieżka odczytu i zapisu [I], bo każdą autoryzuje polityka RLS albo uprawnienie (§1.3), a migracje zmieniają się osobno od kodu: żaden z 10 commitów z migracjami nie rusza `lib`, stron ani komponentów (V24).
2. **Ciche awarie (D4, D5):** 6 tras z pustym wynikiem bez raportu (V7), `dashboard.astro` tylko z `console.error` (V11); pierwszym sygnałem jest skarga użytkownika [I].
3. **Luka testowa (D8, D7):** 11 z 13 handlerów i 6 modułów `lib` bez importu w testach (V14, V15); zmiany odpowiedzi trasy nie zauważy żaden test [I].

Ryzyka 2 i 3 sprawdził ast-grep z kontrolą grepem (L3 §4.2; V11, V15 „confirmed”, V7, V14 „refined”).

## 4. Plan refaktoryzacji (L4)

**Co refaktoryzuję:** pięć pierwszych z 10 okazji wyprowadzonych z długu L3 i uszeregowanych według wartości do kosztu (L4-research §11), bo nie zmieniają niczego, co widzi użytkownik lub klient HTTP, są niezależne i cofają się osobno (L4-brief, „Key Decisions Made”). **Docelowy kształt:** nowy `console.*`, naruszenie reguł migracji i nieświeże typy mają wywalać CI, a mappery, 13 tras, reguły zdublowane w SQL i TS oraz granty mają być przypięte testami (L4-plan, „Desired End State”).

| Faza (OPP; dług L3)                | Co ma zmienić                                            | Automatycznie                                 | Ręcznie                                              |
| ---------------------------------- | -------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| 1 (OPP-2; D5)                      | `console.error` → `reportError`, `no-console` jako error | grep, lint, `npm test`, build                 | wstrzyknięta awaria wobec baseline; produkcja        |
| 2 (OPP-3; D11, D13, D12 częściowo) | strażnik migracji, `types:check` w jobie `integration`   | `npm test`, `guard:migrations`, `types:check` | gałąź próbna; draft PR blokowany przez `integration` |
| 3 (OPP-1; D7, D8, D10)             | testy charakteryzujące mapperów i 13 tras                | `npm test`, `src` bez zmian                   | 4 break-and-restore, strażnik pokrycia               |
| 4 (OPP-5; D14)                     | testy kontraktowe SQL↔TS, dryf NUL przypięty             | `npm test`, `src` bez zmian                   | break-and-restore TS i SQL                           |
| 5 (OPP-4; D1)                      | migracja z grantami, scenariusz RLS                      | `test:rls` (+7 asercji), lint, typy           | zapytanie o granty w hostowanej bazie, release       |

**Czego świadomie nie robię** (L4-plan, „What We're NOT Doing”): OPP-7, 6, 8 i 10 (szkielet tras, ślad zera wierszy z D4, jeden klient na żądanie, fail-closed `/api/*`) czekają na warunki powrotu, bo kosztują więcej albo zmieniają zachowanie (L4-brief, „Key Decisions Made”). Najwyżej oceniony dług, D12, dostaje tu tylko lekki strażnik z Fazy 2, bo pełną bramkę wydania (OPP-9) ma już w planach S-10 (L4-research §11); 503 dla dashboardu przejmuje S-11.

**Zastrzeżenie:** neutralność to deklaracja planu (L4-plan, „Overview”), nie pomiar [I]: Faza 1 dodaje telemetrię, a Faza 5 jest neutralna tylko, jeśli hostowana baza ma te granty (L4-research OPP-2, OPP-4).

## 5. Domena wg DDD (L5)

**Język i rozjazdy** (L5-gl; L5-01 §1, §4):

| Termin       | Co znaczy                                                                     | W kodzie                                             | Rozjazd                                                                                   |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| odznaczenie  | fakt „uczestnik wykonał task w okresie”                                       | `task_checkoffs`, `checkOff`                         | R-08: PRD mówi „na dziś”, a baza przyjmuje każdą datę z okna 9 dni                        |
| okres        | dzień w Warszawie, dla `weekly` poniedziałek                                  | `PeriodKey`, `period`                                | R-09: poniedziałek wymusza tylko trasa, bo `period` nie ma CHECK                          |
| streak       | wartość per uczestnik i task liczona przy odczycie; ich suma to wynik członka | `streakValue`                                        | R-01: według PRD streak „nie zeruje się całkowicie”, a kod połowi go w dół i 1 spada do 0 |
| uczestnictwo | zapis członka do tasku                                                        | `task_participants`; z historią odznaczeń: enrolment | enrolment zna tylko kod (W-02); nowy kod ma mówić „participation”                         |

**Niezmiennik #1: INV-11** (L5-02 §1, §2): odznaczenie dotyczy wyłącznie bieżącego okresu pod kanonicznym kluczem (`daily`: dzień w Warszawie, `weekly`: poniedziałek, `once`: jeden fakt), każdy okres najwyżej raz. L5-02 wyprowadza wybór od nowa (§0) i dochodzi do tej samej reguły co ranking #1 L5-01 (§5, R-08 i R-09), z tego samego powodu: fakt odznaczenia to jedyne wejście streaka i wyniku, a reguła żyje w 8 plikach w 5 warstwach i żadna nie wymusza całości. To obszar strefy ryzyka (3) z mapy (L2 §4).

- **Fakt** (L5-02 §3.2, §3.5): klient wysyła tylko `task_id`, okres wyznacza zegar Workera, a baza wymusza tylko unikalność, uczestnictwo i okno dat; wyspa porównuje widziany okres ze zwróconym dopiero po zapisie (INV-14), więc kliknięcie po północy zapisuje następny dzień (scenariusz L5-02 V4 wyprowadzony z kodu, §3.6).
- **Projekt L5-02 (niewdrożony):** agregat **`Participation`** (uczestnictwo z odznaczeniami, reguły P1–P8) ma żyć w funkcjach SQL `check_off` i `uncheck`, bo baza widzi każdą ścieżkę zapisu, a jedno wywołanie to jedna transakcja. To decyzja architektoniczna L5-02 (opcja C); agregat w TS (opcje A i B) odrzucono (§4.1). Żądanie ma nieść `expected_period`; gdy nie jest bieżący (P6), funkcja ma zgłosić błąd domenowy `SB409`, adapter ma go przetłumaczyć na `StalePeriodError`, a trasa zwrócić HTTP 409, bez zapisu (§4.4–§4.6).
- **Moja decyzja** (§6): tylko bieżący okres (L5-02 D-2) i odrzucanie odznaczenia z nieaktualnego okresu (L5-02 D-1), czyli zmiana widoczna dla użytkownika, nie neutralny refaktor z L4.

**ACL** (L5-03 §1.2, §2): przecieka **Supabase**: zna go 5 warstw (middleware, HTTP, strony, biblioteka, raportowanie) i 36 plików `src/`. L5-03 wybiera go, bo przecieka najszerzej i jako jedyny wnosi swój typ do kontraktu domeny, a Sentry ma już fasadę (`log.ts`), lock-in Astro zaś jest zaakceptowany. Za najgroźniejszy L5-03 (§2, §3.4) uznaje ręczny kontrakt „odmowa RLS = zero wierszy, bez błędu” w tych samych 6 trasach co D4 w L3. L5-03 rekomenduje Fazy 1–3 i 6 m.in. dlatego, że zamykają ten kontrakt w jednym miejscu (L5-03 D-1), a trasy mają w nich przechodzić na ACL dopiero z siecią testów z Fazy 3 L4 (L5-03 §6.3).

## 6. Decyzje, które należą do mnie

Z L4: research tylko uszeregował 10 okazji (L4-research §11), a ja wziąłem pięć pierwszych, bo z założenia nie zmieniają zachowania i cofają się osobno; z 7 zaproponowanych faz zostawiłem 5, bo chciałem grubszych jednostek, i rozstrzygnąłem trzy guardy OPP-3, styl testów OPP-1, jednorazowy wyjątek od niezmienności migracji oraz kształt OPP-4 (powody: L4-brief, „Key Decisions Made”); kolejność faz ustawił sam plan. Z L5 rozstrzygnąłem cztery sprawy zgodnie z tym, co L5 rekomenduje lub proponuje: zamykam okno dat, więc funkcje SQL mają zapisywać tylko bieżący okres (L5-02 D-2; R-08 zniknie dopiero po Fazie 3 tego planu, czyli Migracji B, L5-02 §6); odznaczenie albo jego cofnięcie ma być odrzucane bez zapisu (HTTP 409), gdy widziany okres nie jest już bieżący (L5-02 D-1); robię Fazy 1–3 i 6 ACL, a Fazy 4–5 czekają (L5-03 D-1); spadek streaka „połowa, w dół” jest ostateczny, więc poprawić trzeba PRD, nie kod (L5-01 Q-01). L5 podaje przy tych sprawach tylko rekomendacje i nadal pokazuje je jako otwarte, więc to moje rozstrzygnięcia, a nie fakty z artefaktów. Dlaczego rozstrzygnąłem te cztery sprawy tak, a nie inaczej: BRAK artefaktu, bo L5 zapisuje tylko powody swoich rekomendacji. Otwarte zostają L5-02 D-3 i D-4, L5-03 D-2…D-6, L5-01 Q-02…Q-09 (w tym Q-04), Fix B z L4-review F3 oraz dwie kwestie dla właściciela produktu: reguła okresu, której PRD nie podaje, choć mają ją kod i L5 (L5-01 N-19, B-07), i komunikat przy konflikcie 409 (L5-02 §4.6 przewiduje tylko przeładowanie).

## Luki

**BRAK artefaktu:** wyników implementacji L4 i L5, zapisu decyzji z §6 w L5, moich uzasadnień czterech decyzji z L5, danych produkcyjnych (hostowana baza, `max_rows`; L3 „Summary”, Q-07, Q-08) i wyników smoke oraz Playwrighta.
