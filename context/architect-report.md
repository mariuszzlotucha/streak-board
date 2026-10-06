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
| L2     | `context/map/repo-map.md` (liczby z jego raportów `artifact-1…3` w tym samym katalogu)                         | `d03c673`, 2026-10-05                   |
| L3     | `context/changes/data-access/research.md`                                                                      | `6814f69`, `feat/m4l3-feature-analysis` |
| L4     | `context/changes/refactor-opportunities/{research,plan-brief,plan}.md`, `reviews/plan-review.md`               | `c9f6451`, 2026-10-06                   |
| L5     | `context/domain/{01-domain-distillation,02-invariant-aggregate-refactor,03-anti-corruption-layer,glossary}.md` | `dd2dee0`, `m4l5-ddd`                   |

**Stack:** Astro SSR z wyspami React na Cloudflare Workers, Supabase (Auth, Postgres z RLS) (L2). **Skala:** ~3 tygodnie historii, 263 commity (192 nie-merge), jeden autor, 144 moduły (L2), 5 tabel, 7 migracji, 13 tras mutujących (L3), baseline 385 testów Vitest i 293 asercje SQL (L4).

## 2. Mapa projektu (L2)

- **Strefy ryzyka** (każda ≥2 niezależne sygnały): logowanie i sesja; dostęp do danych na poziomie bazy; check-off i ranking serii; widok `dashboard.astro` (§4).
- **Lokalne centra:** `dashboard.astro` (455 linii, 22 zależności, nie da się go zaimportować w Vitest) i `middleware.ts` (54 linie), jedyna brama dla `/dashboard`, `/api/groups` i `/api/tasks`, oparta na prefiksach napisów. Reguły czyste (`streak-rules`, `leaderboard-rules`) są głębokie i stabilne, a `supabase.ts` (fan-in 24) to fałszywy alarm (§2–§4a).
- **Unknowns:** SQL poza grafem, kontrakty w napisach, 13 modułów `lib` bez bezpośredniego importu w testach, jeden autor czyli brak oceny bus factoru (§7).

## 3. Analiza ficzera (L3)

**Przepływ:** dostęp do danych grup i zadań, wymuszany w bazie (strefa ryzyka nr 2), bo 4 z 11 commitów to poprawki po review (w tym dwie migracje „hardening”), a uprawnienia nie mają grafu zależności (L2 §4). V to wiersze weryfikacji w L3 §4.

**Jak to działa.** 13 tras POST wołanych natywnymi formularzami (`fetch` tylko dla check-offu); grupa wynika z członkostwa, nigdy z requestu (V6, V20). Wszystkie 21 wywołań DB (18 `.from`, 3 `.rpc`) idzie klientem z sesją cookie, bez service-role (V1, V3), więc granty, RLS i triggery działają niewidocznie dla tras.

**Dług techniczny:**

1. **Wydanie (D12).** `db push --yes` biegnie przed `wrangler deploy` (V26), a zgodność wsteczna migracji to tylko proza (`lessons.md:81`). Żaden z 10 commitów z migracją nie zmienia `src/lib`, `pages` ani `components` (V24).
2. **Ciche awarie (D4+D5).** 6 tras ma gałąź pustego wyniku bez raportu (V7). `dashboard.astro` ma 0 importów `lib/log` i 5× `console.error` (V11).
3. **Luka testowa (D8+D7).** 11 z 13 handlerów nie jest importowane przez żaden test (V14); `group-rules`, `group-errors`, `task-errors`, `checkoff-response`, `join-code` i `lib/groups` mają 0 importerów (V15).

Weryfikacja objęła 28 wierszy (ast-grep, a bez gramatyki: grep, git, YAML): 1 obalony (V9, filtr w `uncheck`), 1 nowy fakt (V28), reszta potwierdzona lub doprecyzowana.

## 4. Plan refaktoryzacji (L4)

**Wybrana opcja:** 5 z 10 okazji z rankingu research: OPP-2, OPP-3, OPP-1, OPP-5 i OPP-4. **Docelowy kształt:** nowy `console.*` wywala lint, a wymagany job `integration` wywala edycję zmergowanej migracji, migrację destrukcyjną bez markera, migrację starszą od najnowszej i nieświeże `types.ts`. 13 tras i duplikaty reguł SQL↔TS są przypięte testami, granty leżą w migracji. Żadna faza nie zmienia zachowania widocznego dla użytkownika.

**Czego nie robimy:** odłożone z warunkami powrotu są OPP-7 (szkielet trasy), OPP-6 (ślad zerowych wierszy), OPP-8 (jeden klient na żądanie) i OPP-10 (fail-closed `/api/*`). Poza zakresem: bramka „stary kod, nowy schemat” i Playwright w CI (S-10), 503 dla dashboardu (S-11), dryf NUL, edycja `CLAUDE.md`.

| Faza | Jedna linijka                                                                          | Weryfikacja auto / ręcznie |
| ---- | -------------------------------------------------------------------------------------- | -------------------------- |
| 1    | 5× `console.error` → `reportError`, `no-console` jako error                            | 5 / 4                      |
| 2    | `migration-guard.mjs` (niezmienność, `-- compat:`, kolejność) + `types:check` w CI     | 5 / 5                      |
| 3    | Testy charakteryzujące mapperów i 13 tras z guardem pokrycia                           | 3 / 3                      |
| 4    | Testy kontraktowe SQL↔TS na prawdziwej bazie, dryf NUL przypięty                       | 4 / 2                      |
| 5    | Migracja z jawnymi grantami, scenariusz RLS (+7 asercji), zapytanie do hostowanej bazy | 4 / 8                      |

Review planu dało REVISE (0 krytycznych, 2 ostrzeżenia, 4 obserwacje), po naprawie 6 uwag SOUND (119/119 sprawdzeń). **Status: 0 z 43 wierszy Progress odhaczonych, implementacja nie ruszyła.**

## 5. Domena wg DDD (L5)

**Ubiquitous language** (L5-01 §1): **okres** (dzień w Warszawie, dla `weekly` poniedziałek); **odznaczenie** (fakt „uczestnik wykonał task w okresie”, powtórka to no-op); **enrolment** (para task + użytkownik z historią odznaczeń, w nowym kodzie „participation”; pojęcie tylko kodowe, zero trafień w `prd.md`, `shape-notes.md` i `roadmap.md`); **streak i spadek** (każdy pominięty zamknięty okres połowi wartość w dół).

**Rozjazdy model-vs-kod** (12, R-01…R-12; §4): R-01, PRD mówi „nie zeruje się całkowicie”, a kod połowi streak i 1 spada do 0; R-08/R-09, PRD mówi „na dziś”, a baza przyjmuje okno UTC−7…UTC+1 (9 dni) i nie zna poniedziałku (`period date` bez CHECK); R-06, wypisanie z tasku kasuje historię, a PRD milczy.

**Niezmiennik #1: INV-11.** Odznaczenie dotyczy tylko bieżącego okresu, pod kanonicznym kluczem (`weekly` = poniedziałek), najwyżej raz. Żyje w 5 warstwach i 8 plikach, a pilnuje go tylko aplikacja: baza zna unikalność klucza i okno dat, nie kanoniczność okresu (L5-02 §2, §3.2). Ma go pilnować agregat **`Participation`** jako polecenia SQL `check_off` i `uncheck` (precedens: `join_group`), bo PostgREST nie daje wspólnej transakcji dla `load → zmień → save`.

**Anti-Corruption Layer: przecieka Supabase.** Zna go 5 warstw i 36 plików `src/` (28 wywołań API: 21 danych + 7 auth; 25 plików z fabryką klienta). Dokumenty nie deklarują wymienialności, więc plan uzasadnia ACL spójnością błędów i testowalnością (L5-03 §0, §2). Groźny przeciek to ręczny kontrakt „odmowa RLS = 0 wierszy” w 6 trasach, tych samych co D4 w L3 (§3.4). Projekt: 2 value objecty, 4 porty (27 operacji), adapter w `src/lib/acl/supabase/`, 6 faz bez migracji, ok. 2,5–3 dni [I] za całość, po sieci charakteryzującej z L4 Fazy 3 (szacunku per faza brak).

## 6. Decyzje, które należą do mnie

**Z L4** (kolumna _Source_ w `plan-brief.md` i `plan-review.md`). Rozstrzygnąłem zakres (5 zachowawczych OPP), trzy guardy OPP-3, styl OPP-1 (jedna tabelaryczna suita z guardem pokrycia), jednorazowy wyjątek od niezmienności migracji, kształt OPP-4 i 5 grubszych faz zamiast 7. Plan sam ustawił guardy przed testami (tną ryzyko produkcyjne), a w review ograniczenie reguły kolejności migracji zamknięto rekomendowanym wariantem A (dokumentacja i recovery). Wariant B, czyli zmiana polityki merge (`strict_required_status_checks_policy`), to decyzja właściciela repozytorium i pozostaje otwarta.

**Z L5, rozstrzygnięte przy tym raporcie** (artefakty L5 nadal pokazują je jako otwarte):

- **Okno dat (02 D-2): zamykam lukę.** Funkcje SQL zapisują tylko bieżący okres. Decyzja jest wbudowana w SQL już w Fazie 1 planu 02, więc musi zapaść przed nią, a R-08 znika dopiero po Fazie 3 (Migracja B odbiera bezpośredni zapis).
- **Strona po północy (02 D-1): odrzucam kliknięcie (409).** Zmiana widoczna dla użytkownika, więc Faza 2 planu 02, nie L4.
- **ACL (03 D-1): robię Fazy 1–3 i 6.** Fazy 4–5 (auth, uczestnictwo) czekają na osobną decyzję.
- **Spadek streaka (Q-01): „połowa, w dół” jest ostateczne.** Do poprawy jest PRD (R-01), nie kod.

**Nadal otwarte:** 02 D-3 i D-4, 03 D-2…D-6, część 03 D-1 o Fazach 4–5, Q-02…Q-09 (w tym Q-04) i wariant B z L4 review F3 (polityka merge).

## Luki i zależności

- **BRAK artefaktu:** wyników implementacji L4, zapisu decyzji z §6 w artefaktach L5, danych produkcyjnych (stanu hostowanej bazy, domyślnych uprawnień Supabase i produkcyjnego `max_rows` z L3; Q-07 i Q-08 z L5), uruchomionych smoke i Playwrighta.
- **Korekty między warstwami:** L3 sprostował L2 (formularze, nie `fetch`; V20), L4 poprawił L3 (pre-read w 9, nie 10 z 13 tras; L3 V5, L4 V11).
- **Kolejność wg L5-03 §6.3:** sieć testowa L4 (Faza 3), ACL (Fazy 1–3), potem Faza 2 planu 02; bez siatki migracja tras byłaby ślepa.
