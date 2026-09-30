# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-30 (Phase 1 change opened)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`
(excluded: `context/`, `dist/`, `node_modules/`, `scripts/`, `.claude/`;
22 commits in the last 30 days).

## 2. Risk Map

Najważniejsze scenariusze awarii, które projekt musi chronić, uporządkowane
według ryzyka = wpływ × prawdopodobieństwo. Ryzyka opisują scenariusze w
języku użytkownika i biznesu, a nie nazwy testów. Kolumna Source cytuje
*dowody, które podniosły ryzyko*, nigdy plik jako „miejsce awarii" (to zadanie
`/10x-research`, patrz §1 zasada #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Kod wymagający nowego schematu trafia na produkcję przed migracją, a zalogowani użytkownicy dostają błąd zamiast funkcji | High | High | interview Q2; roadmap S-05 problem 1 (Workers Builds wdraża `master`); `lessons.md` reguły wydania produkcyjnego |
| 2 | Członek jednej grupy widzi grupy, członków lub (później) taski i wyniki innej grupy | High | Medium | PRD Guardrails; interview Q1, Q3; archive `group-schema-and-rls`, `group-rls-hardening`; hot-spot dir `supabase/` |
| 3 | Nie-twórca usuwa grupę, zmienia jej nazwę lub usuwa członka (brak kontroli własności, nie tylko zalogowania) | High | Medium | PRD Access Control, FR-003; archive `group-create-join-manage`; hot-spot dir `src/pages/api/groups` (10 commits/30d) |
| 4 | Streak liczony źle na granicy dnia lub tygodnia: zły spadek, okres policzony dwa razy lub strefa czasowa dzieli użytkowników | High | Medium | interview Q1; PRD Business Logic i Guardrails; roadmap S-04 (niewiadoma wartości spadku); tech-stack („streak liczony przy odczycie") |
| 5 | Rejestracja i logowanie na produkcji przestają działać (potwierdzenie na `localhost`, link jednorazowy, limit e-maili), a zalew rejestracji blokuje prawdziwych użytkowników | Medium | High | roadmap S-05 problemy 2–4; hot-spot dirs `src/components/auth` (18 commits/30d), `src/pages/api/auth` (9 commits/30d); archive `signup-error-codes` |
| 6 | API akceptuje żądanie z obcego Origin lub niepoprawne dane (kod zaproszenia, nazwa grupy), bo walidacja jest tylko po stronie klienta | Medium | Medium | `lessons.md` reguła smoke (granica 403 na obcy Origin); PRD Access Control; hot-spot dir `src/lib` (17 commits/30d) |

Ryzyka 2–4 i 6 pokrywają perspektywę nadużyć (autoryzacja/IDOR, niezaufane
dane wejściowe). Ryzyko 5 obejmuje nadużycie zasobów (zalew e-maili). Wyciek
sekretów/PII nie jest osobnym wierszem: sekrety są tylko po stronie serwera
(`tech-stack.md`, CLAUDE.md), więc tę klasę należy zweryfikować w badaniu
etapu 3, a nie zakładać wiersz bez dowodu.

Natychmiastowość odznaczenia (guardrail PRD) to wymaganie wydajnościowe. Ocenia
się je ręcznie lub obserwowalnością, nie testem, i nie ma wiersza w mapie.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Niezgodność schematu i kodu jest wykrywana przez bramkę przed produkcją, a nie przez użytkownika | „Migracja działa lokalnie, więc produkcja też" | Jak Workers Builds i CI wyzwalają deploy, kolejność `db push` i deployu, zgodność schematu z generowanymi typami | Bramka CI lub hook (spójność migracji i typów) plus smoke po wydaniu | Bramka sprawdzająca tylko obecność plików migracji; e2e tam, gdzie tani check wystarczy |
| #2 | Użytkownik spoza grupy A nie odczyta ani nie zmieni danych grupy A przy bezpośrednim zapytaniu do bazy, nie tylko przez UI | „Dashboard pokazuje tylko moją grupę, więc RLS działa" | Polityki per operacja i rola, tabele objęte RLS, klient użytkownika kontra klucz serwisowy | Integracja na lokalnym Supabase z dwoma użytkownikami z różnych grup | Mockowanie Supabase, które wyklucza działanie RLS; oczekiwania spisane z polityk (problem wyroczni) |
| #3 | Tylko twórca grupy może ją usunąć, zmienić nazwę i usunąć członka; każda inna rola dostaje odmowę w API i w bazie | „Zalogowany oznacza uprawniony" | Kontrola uprawnień w endpointach i w RLS, co egzekwuje klient, a co serwer | Integracja na endpoincie i bazie z rolami twórca/członek/obcy | Tylko ścieżka pozytywna; asercja kodu statusu bez sprawdzenia, że dane się nie zmieniły |
| #4 | Streak rośnie o 1 za wykonany okres, spada o część stanu za pominięty (nie zeruje), suma wyznacza ranking; wynik jest poprawny na granicy północy i tygodnia | „Test z dzisiejszą datą wystarczy" | Reguła spadku z PRD i decyzja o wartości, źródło „dnia" (strefa czasowa), model cykliczności z S-02 | Unit na czystej funkcji reguły z wyrocznią z PRD | Oczekiwana wartość skopiowana z kodu; zależność od zegara systemowego zamiast wstrzykniętej daty |
| #5 | Nowy użytkownik rejestruje się, potwierdza e-mail i trafia zalogowany na `/dashboard` na produkcji; powtórne kliknięcie i limit nie blokują innych | „Status 200 z rejestracji oznacza udaną rejestrację" | Konfiguracja Site URL i Redirect URLs, trasa callback (S-05), mapowanie kodów błędów | Integracja na mapowaniu błędów plus ręczny smoke produkcyjny | E2E przeciw prawdziwej poczcie; testy zakładające trasę callback, zanim istnieje |
| #6 | Żądanie z obcego Origin jest odrzucane (403); niepoprawne dane dostają 4xx i nic nie zapisują | „Formularz waliduje, więc serwer nie musi" | Kto egzekwuje Origin, walidacja po stronie serwera, obsługa kodu zaproszenia w cookie | Rozszerzony `npm run smoke` plus unit na regułach walidacji | Asercja „brak błędu" zamiast zmierzonego skutku; snapshot odpowiedzi |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Runner + data isolation and permissions | Zainicjować runner i lokalną bazę; udowodnić, że obca grupa nie czyta ani nie zmienia danych, a nie-twórca nie zarządza grupą | #2, #3 | integration (RLS + API) | change opened | context/changes/testing-runner-data-isolation-and-permissions/ |
| 2 | Release ordering gate | Udowodnić, że niezgodny schemat i kod są wykrywane przed produkcją | #1 | CI check, extended smoke | not started | — |
| 3 | Auth boundaries and input validation | Rejestracja i błędy zachowują się poprawnie; API odrzuca obcy Origin i złe dane | #5, #6 | integration, smoke, unit (validation) | not started | — |
| 4 | Streak rule | Udowodnić poprawność reguły streaka na granicach dnia i tygodnia (po S-04 i decyzji o wartości spadku) | #4 | unit (pure function) | not started | — |

Kolejność: etap 2 ma ryzyko High × High, ale etap 1 dostarcza runner i lokalną
bazę, z których korzystają kolejne etapy, oraz chroni najbardziej obawiany
obszar (interview Q3). Etap 3 zależy częściowo od S-05 (`/auth/callback`).
Etap 4 jest zablokowany do czasu wdrożenia S-04 i ustalenia wartości spadku
streaka. Nie planuję warstwy AI-native ani e2e: tańsze testy deterministyczne
dają ten sam sygnał (zasada #1).

## 4. Stack

Klasyczna baza testów projektu. Rekomendacje opierają się na lokalnych
manifestach i konfiguracji oraz narzędziach dostępnych w bieżącej sesji.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| lint + build | ESLint + `astro build` | per `package.json` | Działa lokalnie i w CI; pre-commit: husky + lint-staged |
| HTTP smoke | `npm run smoke` (`scripts/smoke.mjs`) | n/a | Jedyny test zachowania; reguła z `lessons.md`: asercje skutków, nie braku błędów |
| unit + integration | none yet — see Phase 1 | — | Wybór runnera należy do badania etapu 1 (Astro + Vite, TypeScript) |
| integration DB | lokalny stos Supabase (`supabase/`) | per CLI | Do testów RLS i uprawnień; do potwierdzenia w badaniu etapu 1 |
| e2e | none — not planned | — | Nie uzasadnione przez koszt × sygnał; wróć do tematu po etapach 1–3 |

**Stack grounding tools (current session):**
- Docs: Context7 — not available in current session; checked: 2026-09-30
- Search: Exa.ai — not available in current session (dostępny tylko wbudowany `WebSearch`/`WebFetch`); checked: 2026-09-30
- Runtime/browser: Playwright MCP — not available in current session; not used; checked: 2026-09-30
- Provider/platform: brak MCP dla GitHub, Cloudflare i Supabase; dostępne CLI `gh`, `supabase`, `wrangler` (istotne dla bramek CI etapu 2); checked: 2026-09-30

Baza testów: **none** (brak konfiguracji runnera; jedyne pliki `*.test.*`
należą do narzędzi skilli w `.claude/`, nie do aplikacji).

## 5. Quality Gates

Gate'y, które muszą przejść przed wejściem zmiany na produkcję.
„Required after §3 Phase N" oznacza, że gate jest egzekwowany po wdrożeniu
danego etapu; wcześniej ma status `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + build | local + CI | required (wired) | dryf składni i typów |
| smoke | local + CI | required (wired) | zepsute podstawowe przepływy HTTP |
| unit + integration (RLS, uprawnienia) | local + CI | required after §3 Phase 1 | wyciek między grupami, brak kontroli własności |
| migration/code consistency check | CI on PR | required after §3 Phase 2 | kod wymagający schematu, którego produkcja nie ma |
| extended smoke (Origin, walidacja, auth) | local + CI | required after §3 Phase 3 | przyjęcie obcego Origin i złych danych, regresje auth |
| unit (streak rule) | local + CI | required after §3 Phase 4 | błędna reguła streaka na granicach okresów |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja zostaje wypełniona po
wdrożeniu odpowiedniego etapu; wcześniej brzmi „TBD — see §3 Phase N."

### 6.1 Adding a unit test

- TBD — see §3 Phase 3 (reguły walidacji) i §3 Phase 4 (reguła streaka z wyrocznią z PRD).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 (wzorzec: dwóch użytkowników z różnych grup, odmowa dostępu do cudzych danych i brak zmiany stanu).

### 6.3 Adding an e2e test

- Not planned — see §3 (nie uzasadnione przez koszt × sygnał).

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1 (odmowa dla roli nie-twórca i nie-członek) i Phase 3 (obcy Origin, złe dane).

### 6.5 Adding a test for a schema or migration change

- TBD — see §3 Phase 2 (wykrywanie niezgodności schematu z kodem przed wydaniem).

### 6.6 Per-rollout-phase notes

(Opcjonalnie. Po każdym etapie `/10x-implement` dopisuje 2–3 linie o tym, co
zaskoczyło.)

## 7. What We Deliberately Don't Test

Wyłączenia uzgodnione podczas wywiadu (Q5). Przyszli współtwórcy powinni je
respektować, dopóki nie zmieni się założenie.

- **Wygląd UI i snapshoty komponentów** — ciągle się zmieniają i dają mały sygnał. Re-evaluate, jeśli pojawi się stabilny design system z kontraktem tokenów. (Source: Phase 2 interview Q5.)
- **Anti-cheat odznaczania tasków** — poza zakresem PRD (Non-Goals), system opiera się na zaufaniu w gronie znajomych. Re-evaluate, jeśli grupy przestaną być zaufanym gronem. (Source: PRD Non-Goals.)
- **Natychmiastowość odznaczenia** — wymaganie wydajnościowe, oceniane ręcznie lub obserwowalnością, nie testem. Re-evaluate, jeśli pojawi się skarga na opóźnienie. (Source: brief Phase 3, challenger findings.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-30
- Stack versions last verified: 2026-09-30
- AI-native tool references last verified: 2026-09-30 (brak narzędzi AI-native w planie)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
