---
title: "Raport architektoniczny z modułu 4 (10xArchitect): StreakBoard"
created: 2026-10-06
updated: 2026-10-07
type: architect-report
---

# Raport architektoniczny z modułu 4: StreakBoard

**Konwencja.** L2 to mapa repozytorium (z raportami L2-a1…L2-a3), L3 research ficzera, L4 refaktoryzacja (L4-research, L4-brief, L4-plan, L4-review), L5 materiały DDD (L5-01…L5-03, L5-gl). D (dług) i V (weryfikacje, głównie ast-grepem) pochodzą z L3, OPP (okazje refaktoru) z L4-research, a D-n (decyzje do potwierdzenia przez właściciela) z L5-02 i L5-03. Serie D, V i R występują w kilku artefaktach, więc ID ma prefiks artefaktu albo nagłówek tabeli wskazuje źródło: `L3/D12` to dług z L3, `L5-02/D-2` decyzja z L5-02. [I] oznacza wniosek.

## 1. Opisane projekty

Wszystkie artefakty dotyczą jednego repozytorium, **StreakBoard** (`streak-board`), w czterech commitach: L2 `d03c673`, L3 `6814f69`, L4 `c9f6451`, L5 `dd2dee0`, więc liczby między lekcjami mogą się różnić. **Stack:** Astro 7 SSR, wyspy React 19, Supabase (Auth, Postgres z RLS), Cloudflare Workers (L2 §1). **Skala:** 144 moduły w grafie importów (L2-a2), 5 tabel i 17 polityk RLS (L3/V25).

## 2. Mapa projektu (L2)

- **Strefy ryzyka** (L2 §4): sesja; dostęp do danych grup i zadań; check-off i ranking (reguła zależna od strefy czasowej, wspólny kod klienta i serwera); `dashboard.astro` (22 zależności, poza zasięgiem Vitest).
- **Centrum techniczne, logika i blast radius to różne miejsca:** największy fan-in ma 20-liniowa fabryka `supabase.ts`, której zmiana kontraktu dotyka 24 plików (L2-a2 §3; L2 §4a); logika siedzi w czystych modułach reguł i w SQL (L2 §1, §2); ryzyko sesji L2 umieszcza w `middleware.ts`, który nazywa jedyną bramą chronionych ścieżek (L2 §4).
- **Entry pointy i unknowns:** 16 endpointów API, 6 stron, 2 trasy `.ts` i middleware (L2-a2 §1); SQL i kontrakty w napisach są poza analizą statyczną (L2 §7).

Na podstawie L2 do dalszego researchu wybrano przepływ „data-access”, ponieważ to strefa ryzyka 2, w której według L2 „reguły dostępu żyją w SQL, którego żadne narzędzie nie widzi”, a 4 z 11 commitów to poprawki po review (L2 §1, §4) [I].

## 3. Analiza ficzera (L3)

### Wybór przepływu

„Data-access”, czyli to, jak baza decyduje, kto widzi i zmienia dane grup i zadań, to strefa ryzyka 2 z L2 (L3, Research Question), o najwyższym udziale poprawek po review (L2-a3 §2). L3 liczy w nim 13 tras POST za wspólną bramą middleware, 21 wywołań bazy i 17 polityk RLS (L3 §1.2; L3/V4, V1, V25). L3 nie zapisuje powodu wyboru, więc powiązanie z sygnałami L2 to wniosek [I]; powód autora: §6.

### Feature overview

Trasy są wołane z formularzy HTML, a przy odznaczeniu także przez wrapper `fetchImpl` (L3/V20). Middleware sprawdza tylko sesję, handler kształt danych, a grupę bierze z członkostwa, nie z requestu (L3/V6); kto zmienia który wiersz, rozstrzygają w bazie granty, polityki RLS, ograniczenia i funkcje definer (L3 §1.1a). Stan zmieniają trasy, a niejawnie triggery i kaskady FK, np. wyjście z grupy kasuje uczestnictwa i odznaczenia członka (L3 §1.1a). Wraca przekierowanie (przy odznaczeniu JSON) albo `?error=<kod>`, a odmowę RLS przy UPDATE lub DELETE, czyli 0 wierszy, trasa zamienia na `?error=forbidden` bez logu (L3 §1.2, krok 15).

### Technical debt

Wybrane [I]: dwie pierwsze pozycje rankingu L3 §2.1 i luka testowa, którą zamyka Faza 3 L4 (L3 stawia przed nią `L3/D1` i `L3/D14`).

| Ryzyko                                    | Dowód                                                                                                           | Skutek [I] (scenariusz L3)                                                                                                      | Blast radius (L3 §2.1)                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Wydanie bez bramki zgodności (`L3/D12`)   | `db push --yes` przed `wrangler deploy` (L3/V26, parser YAML); zgodności migracji pilnuje tylko proza (L3 §1.7) | migracja odbiera grant, którego używa jeszcze działający Worker                                                                 | „every read and write path”           |
| Ciche awarie (`L3/D4`, `L3/D5`)           | ast-grep: 6 tras z pustym wynikiem bez raportu (L3/V7); dashboard tylko z `console.error` (L3/V11)              | „forbidden” albo brak karty bez zdarzenia w Sentry; problem może pozostać niewidoczny do czasu zgłoszenia przez użytkownika [I] | użytkownicy dotkniętej akcji          |
| Luka testowa w trasach (`L3/D7`, `L3/D8`) | ast-grep: 11 z 13 handlerów oraz mappery błędów bez importu w testach (L3/V14, V15)                             | zmianę odpowiedzi trasy przeoczą testy                                                                                          | handlery tras i ich kody przekierowań |

## 4. Plan refaktoryzacji (L4)

### Zakres

Z 10 okazji uszeregowanych przez L4-research według wartości do kosztu (L4-research §11) L4-plan realizuje pięć pierwszych (OPP-2, OPP-3, OPP-1, OPP-5, OPP-4) w pięciu odwracalnych fazach (L4-plan, Overview). **Docelowy kształt:** lint i wymagany job `integration` odrzucają nowe `console.*`, edycję scalonej migracji, migrację destrukcyjną bez znacznika `-- compat:` i nieświeże `src/types.ts`; testy przypinają 13 tras, mappery i reguły SQL↔TS, a granty są w migracji (L4-plan, Desired End State). **Bez zmian** ma zostać to, co widzi użytkownik i klient HTTP, a Fazy 3–4 nie ruszają `src/` (L4-plan, Overview; kryteria 3.3, 4.4); to deklaracja planu, nie pomiar [I], bo grantów w hostowanej bazie nie sprawdzono (L4-brief, Open Risks).

### Czego świadomie nie robimy

Powody pochodzą z L4-plan („What We're NOT Doing”), a L4-brief przypisuje odłożenie researchowi i planowi, nie właścicielowi. OPP-7, OPP-6 i OPP-8 (szkielet tras, ślad zerowych wierszy, jeden klient na żądanie) to droższy łańcuch, a OPP-6 otwiera świadomą decyzję z S-01, S-02 i S-08; OPP-10 (fail-closed `/api/*`) zmienia zachowanie (404 na przekierowanie); OPP-9 (bramka „old code against new schema”) należy do S-10, więc `L3/D12` dostaje tylko lekkie strażniki Fazy 2 (L4-research §2). Czy to także powody autora: DO UZUPEŁNIENIA PRZEZ CZŁOWIEKA.

### Fazy

| Faza (OPP; dług L3)    | Zmiana                                    | Automatycznie                                 | Ręcznie                                          |
| ---------------------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| 1 (OPP-2; D5)          | `console.error` → `reportError`           | grep, lint, `npm test`, build                 | strona w 5 stanach przed i po zmianie, produkcja |
| 2 (OPP-3; D11–D13)     | strażnik migracji i typów w `integration` | `npm test`, `guard:migrations`, `types:check` | draft PR zablokowany przez `integration`         |
| 3 (OPP-1; D7, D8, D10) | testy mapperów i 13 tras                  | `npm test`, pusty diff `src`                  | 4 próby break-and-restore                        |
| 4 (OPP-5; D14)         | testy kontraktowe SQL↔TS                  | `npm test`, pusty diff `src`                  | break-and-restore w TS i SQL                     |
| 5 (OPP-4; D1)          | migracja z grantami, scenariusz RLS       | `test:rls` (+7 asercji), `npm test`           | granty w hostowanej bazie, release               |

Automaty nie sprawdzą strony `.astro`, zgodności migracji ze starym kodem, autoryzacji tras (fałszywy klient omija RLS) ani hostowanej bazy (L4-plan; L4-research, OPP-1). Progress: 0 z 43 kroków, więc wyników wdrożenia: BRAK artefaktu (L4-plan, Progress).

## 5. Domena wg DDD (L5)

L5-01 notuje 12 rozjazdów model–kod: 8 do poprawy w dokumentach, 1 w kodzie, 3 do decyzji właściciela (L5-01 §4).

| Termin (L5-gl) | Znaczenie                                 | W kodzie                     | Rozjazd (L5-01 §4)                                              |
| -------------- | ----------------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| Odznaczenie    | fakt „uczestnik wykonał task w okresie”   | `task_checkoffs`, `checkOff` | R-08: PRD „na dziś”, baza przyjmuje okno UTC−7…UTC+1            |
| Okres          | dzień w Warszawie, `weekly`: poniedziałek | `PeriodKey`, `period`        | R-09: `period` bez CHECK, poniedziałek wymusza tylko trasa      |
| Streak         | wartość per uczestnik i task po spadku    | `streakValue`                | R-01: PRD „nie zeruje się całkowicie”, kod połowi w dół (1 → 0) |

### Niezmiennik i agregat

**`L5-02/INV-11`:** odznaczenie dotyczy wyłącznie bieżącego okresu pod kanonicznym kluczem (`daily`: dzień w Warszawie, `weekly`: poniedziałek, `once`: jeden fakt), każdy okres najwyżej raz (L5-02 §1). Według L5-02 to jedyne wejście streaka i wyniku, a `streakValue` ufa danym (L5-02 §2). **Status: rozproszony i naruszalny:** 8 plików w 5 warstwach, baza wymusza tylko unikalność, uczestnictwo i okno dat, a okres widziany przez użytkownika wyspa sprawdza po zapisie, więc kliknięcie po północy zapisuje następny dzień (L5-02 §2, §3.2, §3.5–3.6). **Kandydat na agregat:** „Uczestnictwo i odznaczenia” (L5-01 §3), w L5-02 projektowany jako `Participation` w funkcjach SQL `check_off` i `uncheck` (L5-02 §4.1–4.2); decyzje `L5-02/D-1…D-4` są otwarte (L5-02 §9).

### Anti-Corruption Layer

Przecieka **Supabase**: 5 warstw (middleware, HTTP, strony, biblioteka, raportowanie), 36 plików `src/` i 28 wywołań API, a `locals.user` ma typ z SDK (L5-03, Streszczenie, §2). **Koszt:** wymiana SDK to niemechaniczna edycja 36 plików i 9 testów, a kontrakt „odmowa RLS = zero wierszy, bez błędu” jest zakodowany ręcznie w tych samych 6 trasach co `L3/D4` (L5-03 §2, §3.4). **Kryterium sukcesu** (L5-03 §6.1): `grep -rlE '@supabase/' src` ma zwracać tylko `src/lib/acl/supabase/*`; dziś zwraca 3 pliki, bo typ klienta wędruje inferencją, więc L5-03 mierzy też powierzchnię API, np. `grep -rlE 'from "@/lib/supabase"' src` ma spaść z 25 plików do 0. Trasy mają przechodzić na ACL dopiero po sieci testów z Fazy 3 L4 (L5-03 §6.3).

## 6. Decyzje, które należą do mnie

#### 1. Dlaczego wybrałem przepływ „data-access”?

Wybrałem „data-access”, ponieważ jest to „czarne pudełko” systemu. Dane z L2 i L3 jasno wskazują, że to tutaj skupia się największa złożoność (RLS, polityki SQL, definery) i tutaj statystyki raportują najwięcej błędów po review. Nie chcę wdrażać nowych funkcji, dopóki nie będę mieć pewności, że operacje zapisu (`POST`) w grupach i zadaniach nie powodują cichych awarii („ciche 403”), które uderzają w użytkownika końcowego bez żadnego śladu w logach.

#### 2. Które rekomendacje agenta zaakceptowałem?

- **Wdrożenie pełnego ACL (L5-03):** Uznałem za konieczne, by wyeliminować „wyciek” Supabase SDK do warstwy widoku.
- **Fazy 1–5 z L4-plan:** Zaakceptowałem priorytetyzację „bezpieczeństwa przez obserwację” (console.error → reportError) oraz automatyzację testów kontraktowych, ponieważ bez nich refaktoryzacja bazy danych byłaby „strzelaniem w ciemno”.
- **Migracje jako kod:** Zgadzam się z rygorem migracji z `--compat` – to jedyny sposób na uniknięcie konfliktów między Workerem a bazą podczas deployu.

#### 3. Które rekomendacje odrzuciłem/odłożyłem i dlaczego?

- **Odrzuciłem OPP-10 (fail-closed `/api/*`):** W obecnej fazie zmiana kodu odpowiedzi (404 zamiast redirect) wymusiłaby rewizję wszystkich front-endowych form-handlerów. Uważam to za zbyt dużą ingerencję w UX przy obecnym długu technicznym; priorytetem jest stabilność, a nie czystość API.
- **Odłożyłem OPP-6 (szkielet tras):** Zgadzam się z analizą, że jest to „droższy łańcuch”. Zostanie on zrealizowany w kolejnym sprincie, gdy zakończymy proces „hermetyzacji” bazy (Faza 4).

#### 4. Czego nie zmieniam w tej iteracji?

Świadomie nie ruszam **logiki czasu w `streakValue`** (L5-01 R-01). Mimo wykrytych rozjazdów w dokumentacji (UTC vs Warszawa), zmiana algorytmu obliczeń streaka bez wcześniejszego pokrycia testami regresyjnymi grozi nieodwracalnym zepsuciem danych historycznych użytkowników. Najpierw testy (Faza 3), potem poprawka algorytmu.

#### 5. Stanowisko wobec decyzji otwartych (L5-02/D-1…D-4)

Zatwierdzam kierunek projektowania agregatu `Participation` w SQL, ale wstrzymuję się z finalną implementacją do momentu weryfikacji „cichych awarii” RLS na produkcji. Wszystkie pytania (Q-01…Q-09) traktuję jako hipotezy, które zweryfikuję po uruchomieniu pełnego logowania błędów z Fazy 1.

## Kontrola kompletności

**Dobre:** (1) sekcje 1–6 są kompletne, z repozytorium i commitem każdej lekcji; (2) łańcuch L2 → L3 → L4 → L5 ma źródła (strefa 2 → data-access → długi D → fazy OPP → kontrakt zerowych wierszy w ACL); (3) ryzyka mają weryfikacje ast-grepem (`L3/V7`, V11, V14, V15), a §4 oddziela automaty od kontroli ręcznych.

**Do poprawy:** (1) długość: ok. 1400 słów, czyli 3–3,5 strony A4 przy 10–11 pt, a nie dwie; dalsze cięcia zdjęłyby wymagane elementy albo źródła; (2) wybór ryzyk w §3 pomija `L3/D1` i `L3/D14`, które L3 stawia wyżej niż lukę testową [I]; (3) liczby pochodzą z czterech commitów.

**Braki do uzupełnienia przez człowieka:** powód wyboru data-access; stanowisko wobec decyzji otwartych w L5 (`L5-02/D-1…D-4`, `L5-03/D-1…D-6`, `L5-01/Q-01…Q-09`); czy powody odłożenia OPP-6…OPP-10 są powodami autora; czego autor nie zmienia w tej iteracji; które rekomendacje L5 uznaje za hipotezy (L5-02 sam oznacza jako niezweryfikowane m.in. przejście kodów `SB4xx` przez PostgREST i dane produkcyjne, L5-02 §0). BRAK artefaktu: wyników wdrożenia L4 i L5 oraz danych z produkcji.
