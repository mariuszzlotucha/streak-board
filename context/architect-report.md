---
title: "Raport architektoniczny z modułu 4 (10xArchitect): StreakBoard"
created: 2026-10-06
type: architect-report
---

# Raport architektoniczny z modułu 4: StreakBoard

Raport opiera się wyłącznie na czterech artefaktach (etykiety L2–L5). Liczby pochodzą z nich, nie z pamięci o kodzie. Brak danych oznaczam „BRAK artefaktu”.

## 1. Opisane projekty

Wszystkie artefakty powstały na **jednym repozytorium: StreakBoard** (`streak-board`). Artefaktów z innego projektu nie ma.

| Lekcja | Artefakt                                                                                                       | Stan repo                               |
| ------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| L2     | `context/map/repo-map.md`                                                                                      | `d03c673`, 2026-10-05                   |
| L3     | `context/changes/data-access/research.md`                                                                      | `6814f69`, `feat/m4l3-feature-analysis` |
| L4     | `context/changes/refactor-opportunities/{research,plan-brief,plan}.md`, `reviews/plan-review.md`               | `c9f6451`, 2026-10-06                   |
| L5     | `context/domain/{01-domain-distillation,02-invariant-aggregate-refactor,03-anti-corruption-layer,glossary}.md` | `dd2dee0`, `m4l5-ddd`                   |

**Stack:** Astro SSR z wyspami React na Cloudflare Workers, Supabase (Auth, Postgres z RLS) (L2 §1). **Skala:** ~3 tygodnie historii, 263 commity (192 nie-merge), jeden autor, 144 moduły (L2), 5 tabel, 7 migracji, 13 tras mutujących (L3), baseline 385 testów Vitest i 293 asercje SQL (L4).

## 2. Mapa projektu (L2)

- **Strefy ryzyka** (każda ≥2 niezależne sygnały): logowanie i sesja; dostęp do danych na poziomie bazy; check-off i ranking serii; widok `dashboard.astro` (§4).
- **Lokalne centra:** `dashboard.astro` (455 linii, 22 zależności, 12 commitów), którego nie da się zaimportować w Vitest. Reguły czyste (`streak-rules`, `leaderboard-rules`) są głębokie i stabilne, a `supabase.ts` (fan-in 24, 20 linii) to fałszywy alarm (§2, §4a).
- **Entry pointy:** `middleware.ts` (54 linie) to jedyna brama dla `/dashboard`, `/api/groups` i `/api/tasks`, oparta na prefiksach napisów bez grafu (§3, §4).
- **Unknowns:** SQL (schemat, RLS, triggery) poza grafem, kontrakty w napisach (URL, prefiksy, cookie), 13 modułów `lib` bez bezpośredniego importu w testach, jeden autor czyli brak oceny bus factoru (§7).

## 3. Analiza ficzera (L3)

**Przepływ:** dostęp do danych grup i zadań, wymuszany w bazie, czyli strefa ryzyka nr 2 z mapy (numery V to wiersze weryfikacji w L3 §4). Powód wyboru to dwa sygnały: 4 z 11 commitów to poprawki po review (w tym dwie migracje „hardening”), a logika uprawnień nie ma grafu zależności (L2 §4; L3, Research Question).

**Feature overview.** Input to 13 tras POST wołanych natywnymi formularzami (`fetch` tylko dla check-offu) za bramką sesji. Trasa waliduje kształt wejścia i wyprowadza grupę z członkostwa, nigdy z requestu (V6, V20). Stan zmienia Postgres: wszystkie 21 wywołań DB (18 `.from`, 3 `.rpc`) idzie klientem z sesją cookie, `src/` nie używa service-role (V1, V3), a granty kolumnowe, polityki RLS, triggery i kaskady działają niewidocznie dla kodu tras. Wraca SQLSTATE zmapowany na kod przekierowania (`forbidden`, `already_in_group`, `invalid_code`), pusty wynik `UPDATE`/`DELETE` to zwykle `forbidden`, a check-off zwraca JSON (§1.1a).

**Dług techniczny:**

1. **Wydanie i blast radius (D12).** `db push --yes` biegnie przed `wrangler deploy` (V26, parsowanie YAML), a zgodność wsteczna migracji to tylko proza (`lessons.md:81`). Żaden z 10 commitów z migracją nie zmienia `src/lib`, `src/pages` ani `src/components`, 6 dotyka `types.ts`, 7 `rls-scenarios.sql` (V24, git).
2. **Ciche awarie (D4+D5), potwierdzone ast-grepem.** 6 tras ma gałąź pustego wyniku bez raportu (4 zawsze `forbidden`, 2 warunkowo; V7). `dashboard.astro` ma 0 importów `lib/log` i 5× `console.error` (V11).
3. **Luka testowa (D8+D7), potwierdzona ast-grepem.** 11 z 13 handlerów nie jest importowane przez żaden test, a `group-rules`, `group-errors`, `task-errors`, `checkoff-response`, `join-code` i `lib/groups` mają 0 importerów. Zera potwierdził grep (V14, V15).

Weryfikacja objęła 28 twierdzeń (ast-grep, a bez gramatyki: grep, git, YAML): 1 obalone (V9, filtr w `uncheck`), reszta potwierdzona lub doprecyzowana (§4).

## 4. Plan refaktoryzacji (L4)

**Wybrana opcja:** 5 z 10 okazji z rankingu research: OPP-2, OPP-3, OPP-1, OPP-5 i OPP-4. **Docelowy kształt:** nowy `console.*` wywala lint, a wymagany job `integration` wywala edycję zmergowanej migracji, migrację destrukcyjną bez markera, migrację starszą od najnowszej i nieświeże `types.ts`. 13 tras, mappery i duplikaty reguł SQL↔TS są przypięte testami (nowa trasa bez wiersza daje czerwony CI), a granty leżą w migracji. Żadna faza nie zmienia zachowania widocznego dla użytkownika.

**Czego nie robimy:** szkieletu trasy (OPP-7), śladu zerowych wierszy (OPP-6) i jednego klienta na żądanie (OPP-8), czyli łańcucha odłożonego z warunkami powrotu. Poza zakresem są też fail-closed `/api/*` (OPP-10), bramka „stary kod, nowy schemat” i Playwright w CI (należą do S-10), 503 dla awarii dashboardu (S-11), naprawa dryfu NUL i edycja `CLAUDE.md`.

| Faza | Jedna linijka                                                                          | Weryfikacja auto / ręcznie                        |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | 5× `console.error` w dashboardzie → `reportError`, `no-console` jako error             | 5 / 4: baseline HTML, wstrzykiwanie awarii        |
| 2    | `migration-guard.mjs` (niezmienność, `-- compat:`, kolejność) + `types:check` w CI     | 5 / 5: scratch-branch, draft PR celowo czerwony   |
| 3    | Testy charakteryzujące mapperów i 13 tras z guardem pokrycia; `src/` bez zmian         | 3 / 3: break-and-restore, pusta trasa-sonda       |
| 4    | Testy kontraktowe SQL↔TS na prawdziwej bazie; dryf NUL przypięty, nienaprawiany        | 4 / 2: break-and-restore po stronie TS i SQL      |
| 5    | Migracja z jawnymi grantami, scenariusz RLS (+7 asercji), zapytanie do hostowanej bazy | 4 / 8: zapytanie właściciela, release, test prod. |

Review planu dało REVISE (0 krytycznych, 2 ostrzeżenia, 4 obserwacje), po naprawie wszystkich 6 uwag SOUND (119/119 sprawdzeń). **Status: 0 z 43 wierszy Progress odhaczonych, implementacja nie ruszyła.**

## 5. Domena wg DDD (L5)

**Ubiquitous language** (L5-01 §1): **okres** (dzień w Warszawie, dla `weekly` poniedziałek), **odznaczenie** (fakt „uczestnik wykonał task w okresie”, powtórka to no-op), **uczestnictwo** (task + użytkownik z historią; pojęcie tylko kodowe, zero trafień w PRD i roadmapie), **streak i spadek** (każdy pominięty zamknięty okres połowi wartość w dół).

**Rozjazdy model-vs-kod** (12, R-01…R-12; §4):

- R-01: PRD mówi „nie zeruje się całkowicie”, kod połowi streak i 1 spada do 0 (decyzja planu S-04).
- R-08/R-09: PRD mówi „na dziś”, a baza przyjmuje okno UTC−7…UTC+1 (9 dni) i nie zna poniedziałku (`period date` bez CHECK).
- R-06: wypisanie z tasku kasuje historię, a PRD milczy.

**Niezmiennik #1: INV-11.** Odznaczenie dotyczy wyłącznie bieżącego okresu, pod kanonicznym kluczem (`weekly` = poniedziałek), najwyżej raz. Żyje w 5 warstwach i 8 plikach, a pilnuje go tylko aplikacja: baza zna unikalność klucza i okno dat, nie kanoniczność okresu (L5-02 §2, §3.2). Należy do agregatu **`Participation`** (task + użytkownik), realizowanego jako polecenia SQL `check_off` i `uncheck` (precedens: `join_group`), bo PostgREST nie daje wspólnej transakcji dla `load → zmień → save`.

**Anti-Corruption Layer: przecieka Supabase.** Zna go 5 warstw (middleware, HTTP, strony, biblioteka, raportowanie) i 36 plików `src/`: 28 wywołań API (21 danych + 7 auth), 25 plików z fabryką klienta. Dokumenty nigdzie nie deklarują wymienialności, więc plan uzasadnia ACL spójnością błędów i testowalnością (L5-03 §0, §2). Groźny przeciek to ręczny kontrakt „odmowa RLS = 0 wierszy” w 6 trasach, tych samych co D4 w L3 (§3.4). Projekt: 2 value objecty, 4 porty (27 operacji), jeden adapter w `src/lib/acl/supabase/`, 6 faz bez migracji, ok. 2,5–3 dni [I].

## 6. Decyzje, które należą do mnie

Źródło: kolumna _Source_ w `plan-brief.md` i `plan-review.md`; research tylko uszeregował okazje i zostawił wybór planowaniu. Właściciel rozstrzygnął zakres (5 zachowawczych OPP), trzy guardy OPP-3 (niezmienność, świeżość typów, marker `-- compat:`), styl OPP-1 (jedna tabelaryczna suita z guardem pokrycia), wyjątek od niezmienności migracji (wpis jednorazowy, powiązany z hashem), kształt OPP-4 (migracja, scenariusz RLS, zapytanie do hostowanej bazy) i 5 grubszych faz zamiast 7. Plan sam ustawił guardy przed testami, inaczej niż ranking research, bo tną ryzyko produkcyjne i sprawdzają kolejne PR-y, a w review ograniczenie reguły kolejności migracji zamknięto rekomendowanym wariantem A (dokumentacja i recovery) zamiast zmiany polityki merge (B). W L5 **żadna decyzja nie jest zapisana**: D-1…D-4 (plan 02), D-1…D-6 (plan 03) i Q-01…Q-09 czekają na rozstrzygnięcie.

## Luki i zależności

- **BRAK artefaktu:** wyników implementacji L4, rozstrzygnięć L5, danych produkcyjnych (hostowane ACL i `max_rows` z L3; Q-07/Q-08 z L5), uruchomionych smoke i Playwrighta.
- **Korekty między warstwami:** L3 sprostował L2 (formularze, nie `fetch`; V20), L4 poprawił L3 (pre-read w 9, nie 10 z 13 tras; L3 V5, L4 V11).
- **Kolejność wg L5-03 §6.3:** sieć testowa L4 (Faza 3), potem ACL (Fazy 1–3), potem Faza 2 planu 02. Powód: 11 z 13 handlerów nie ma testu, więc migracja tras bez siatki byłaby ślepa.
