<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Nick zamiast e-maila (S-14 `nickname`)

- **Plan**: `context/changes/nickname/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-16
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 4 observations
- **Triage**: 2026-10-16, sesja bez nadzoru: każde ustalenie sprawdzone ponownie w kodzie i naprawione poprawką rekomendowaną; właściciel polecił scommitować plan z tymi poprawkami i otworzyć PR planistyczny (2026-10-16)
- **Verdict after fixes**: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

40/40 ścieżek, które plan edytuje, istnieje; 10 nowych ścieżek (`src/pages/account/`, `src/components/account/`, `src/lib/nickname-rules.ts`, `src/lib/nickname-errors.ts`, `src/lib/nicknames.ts`, `src/pages/api/account/`, `src/components/dashboard/AccountCard.astro`, `src/components/site/ClearErrorParam.astro`, `tests/integration/nicknames.test.ts`) jeszcze nie istnieje, zgodnie z planem; `docs/reference/contract-surfaces.md` nie istnieje (kontrola powierzchni kontraktowych pominięta). 20/20 symboli nazwanych w planie odnalezionych (`PROTECTED_ROUTES`, `resolveAuthState`, `unavailableResponse`, `UNKNOWN_MEMBER`, `rankStandings`, `buildBoard`, `StandingInput`, `BoardInput`, `GroupMember`, `listGroupMembers`, `TaskParticipant`, `participantsResolver`, `trimGroupName`, `normalizeGroupName`, `MAX_GROUP_NAME_LENGTH`, `reportMapped`, `reportError`, `requestFields`, `EMAIL_VISIBILITY`, regexy i asercje w `smoke.mjs`, `data-routes.test.ts`, `rls-scenarios.sql`). Brief↔plan zgodne (te same decyzje, fazy i zakres). Progress↔Phase zgodne: 12 + 8 wierszy fazy 1 i 7 + 4 fazy 2, 31 wierszy `- [ ]`, 0 `[x]`, jeden nagłówek `## Progress` na końcu.

Weryfikacja w kodzie (subagent, tylko odczyt): harness testów tras (`data-routes.test.ts`, `fake-supabase.ts`), promień rażenia zmiany pól (`src/`, `tests/`, `scripts/`, README, CLAUDE.md), niezmienniki `rls-scenarios.sql`, zapisy kluczem serwisowym, możliwości i kolejność kroków `smoke.mjs`, specyfikacje Playwright, struktura `deployment-plan.md`, ESLint i dependency-cruiser. Potwierdzone bez ustaleń: regexy smoke dla `/settings` nie liczą ani nie zakazują dodatkowych `<h2>`; `group-settings-*.spec.ts` nie kolidują z kartą Account; tokeny person mają najwyżej 15 znaków; `revoke all … from anon` na nowej tabeli jest konieczne dla globalnej asercji RLS (`rls-scenarios.sql:1256-1257`) i plan je zawiera; kontrola Origin w Astro 7.3.2 biegnie przed middleware, więc kroki z obcego Origin dają 403 niezależnie od bramy; `deployment-plan.md` kończy się na Phase 17; ESLint i dependency-cruiser nie mają reguł blokujących nowe katalogi.

## Findings

### F1 — Wspólne wiersze testów tras są przypięte do `/dashboard`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 1, grupa 11 (`tests/integration/data-routes.test.ts`)
- **Detail**: Plan każe użyć „wierszy wspólnych” dla trasy `account/nickname` z celem `/account/nickname?error=…`, ale `common()`, `nonFormBody()`, `mutationFailures()` i `throwingClient()` budują cel ze stałych `DASHBOARD`/`FORBIDDEN`/`UNKNOWN`/`NOT_CONFIGURED` równych `/dashboard…` (`data-routes.test.ts:175-178,181-191,195-230`); `RouteEntry` (`:50-56`) nie ma pola „home”, a `Location` jest porównywane dokładnie (`:1072-1073`). `Locals` (`:58-60`) i domyślne `locals` (`:1063`) nie znają `nickname`, od którego zależy cel po sukcesie. Zapisany łańcuch `rpc` trzyma pełną listę argumentów (`tests/helpers/fake-supabase.ts:126-130`), więc trasa musi wołać `rpc("set_nickname", { p_nickname })` z dokładnie jednym argumentem parametrów.
- **Fix A ⭐ Recommended**: pole `home` w `RouteEntry` (domyślnie `"/dashboard"`); helpery budują `${home}?error=<kod>`; wpis `account/nickname` ma `home: "/account/nickname"`; `Locals` += `nickname: string | null` (domyślnie `null`); `rpc` z jednym argumentem.
  - Strength: Jeden mechanizm dla kolejnych rodzin tras; 13 istniejących tras zostaje na `/dashboard` bez zmian.
  - Tradeoff: Edycja helperów współdzielonych przez około 150 wierszy; literówka zaczerwieni wiele wierszy naraz, ale od razu w `npm test`.
  - Confidence: HIGH — helpery są krótkie i już parametryzowane po `route`; wiersze JSON check-offu i tak są ręczne.
  - Blind spot: None significant.
- **Fix B**: ręczne wiersze tylko dla `account/nickname` (anon, `not_configured`, `forbidden`, `unknown`, ciało niebędące formularzem) z celem `/account/nickname`; helpery bez zmian.
  - Strength: Zero ryzyka dla istniejących wierszy.
  - Tradeoff: Duplikuje logikę wspólnych wierszy; następna rodzina tras powtórzy to samo.
  - Confidence: HIGH — wzorzec ręcznych wierszy istnieje (JSON check-offu `:702-708`).
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (grupa 11: opcjonalne pole `home` w `RouteEntry`, cztery helpery budują `${home}?error=<kod>`, `nickname: null` w `ANON` i w domyślnych `locals`, `rpc` z jednym argumentem parametrów)

### F2 — Kontrakt smoke uszkodzony przez Prettiera

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, grupa 13 (`plan.md:285`)
- **Detail**: Formatowanie zamieniło `?error=__proto__` na `?error=**proto**` (krok niereflektowania obcej wartości) i posklejało kod inline przy stałych nicków, bo zdanie miało zagnieżdżone, escapowane backticki. Implementator dostaje błędny literał i nieczytelną listę stałych.
- **Fix**: Przepisać zdanie o stałych bez zagnieżdżonych backticków (np. `nickA` = "Smoke A " + `stamp`) i ująć `__proto__` w kod inline; po zapisie uruchomić Prettiera ponownie i sprawdzić, że tekst się nie zmienił.
- **Decision**: FIXED (zdanie o stałych bez zagnieżdżonych backticków, `?error=__proto__` w kodzie inline, spacje wokół kodu przywrócone w całym kontrakcie smoke; `npx prettier --check` nie zmienia pliku)

### F3 — Brak kroku „stan nietknięty po odrzuconym zapisie” (cookbook §6.4)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, grupa 13 (`scripts/smoke.mjs`)
- **Detail**: `context/foundation/test-plan.md` §6.4 wymaga dla każdej trasy mutującej kroku, który po odrzuconym zapisie czyta stan, nie tylko kod statusu. Kontrakt ma `POST "x"` → 302 `invalid_nickname`, `POST` z obcego Origin → 403 i `POST nickA` przez B → `nickname_taken`, ale żaden krok nie dowodzi potem, że nick nie został zapisany (brama nadal przekierowuje), zgodnie z lekcją „smoke asertuje wyniki, nie brak błędów”.
- **Fix**: Dodać trzy kroki: po odrzuconym `POST "x"` i po `POST` z obcego Origin `GET /dashboard` → 302 `/account/nickname` (A nadal bez nicka); po `nickname_taken` B `GET /dashboard` → 302 tamże z `setCookieExcludes: "join_code"`.
- **Decision**: FIXED (trzy kroki `GET /dashboard` → 302 `/account/nickname`: po `POST "x"`, po `POST` z obcego Origin i po `nickname_taken` B z `setCookieExcludes: "join_code"`; dopisane też w Testing Strategy)

### F4 — Nawigacja Main na stronie pierwszego wyboru prowadzi z powrotem do bramy

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, grupa 6 (`AppLayout.astro`) i grupa 13 (smoke)
- **Detail**: `AppLayout` bez `current` nadal renderuje linki Dashboard i Settings; użytkownik bez nicka, który je kliknie, wraca na `/account/nickname`. Nieszkodliwe, ale mylące na pierwszym ekranie.
- **Fix**: Renderować nav Main tylko, gdy `current` jest podane (strona nicka zachowuje Sign out; tryb zmiany ma „Back to settings”); w smoke zamiast „bez `aria-current`” asertować brak `<nav aria-label="Main"` na stronie nicka.
- **Decision**: FIXED (kontrakt `AppLayout`: nav Main tylko z `current`; smoke strony nicka: `bodyExcludes: 'aria-label="Main"'`; zdanie o `AppLayout` w CLAUDE.md w grupie 15)

### F5 — Pięć drobnych nieścisłości w kontraktach

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, grupy 4, 9, 13, 14
- **Detail**: (1) grupa 4 mówi „tym samym klientem, którego użył `resolveAuthState`”, a `src/middleware.ts:16` tworzy klienta inline i go nie zachowuje; (2) grupa 9 nie nazywa dwóch wywołań `<AppLayout email=…>` w `src/pages/dev/dashboard-kitchen-sink.astro:37,44`; (3) grupa 14 mówi „`group-data-isolation.spec.ts` bez zmian”, a komentarz `:54` („owner email”) stanie się fałszywy; (4) grupa 13 nie precyzuje, że kroki bramy B idą między „user B signs in” (`smoke.mjs:963-967`) a „join from a foreign origin is rejected” (`:970-974`), który pozostaje 403, bo kontrola Origin Astro 7.3.2 biegnie przed middleware; (5) wywołanie `rpc` musi mieć dokładnie jeden argument parametrów (patrz F1).
- **Fix**: Po jednym zdaniu w każdej z czterech grup.
- **Decision**: FIXED (zdania w grupach 4, 9, 13 i 14; punkt 5 domknięty w grupie 11 razem z F1)

### F6 — Zapis kluczem serwisowym do nowej tabeli nie ma precedensu w repo

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, grupy 1 i 14
- **Detail**: Harnessy mają wstawiać wiersze `nicknames` klientem service-role. W repo istnieją tylko odczyty admina na tabelach po `revoke all … from anon, authenticated` (`tests/helpers/supabase.ts:111,122`) i zapisy admina na `groups`. Żadne `revoke` nie wymienia `service_role`, więc domyślne uprawnienia Supabase zostają, ale pierwszy przebieg `npm test` / Playwright jest dowodem.
- **Fix**: Zdanie w komentarzu nagłówkowym migracji A: `service_role` zachowuje domyślne uprawnienia (wstawki harnessów), bez dodatkowego grantu; w fazie uruchomić `npm test` przed smoke.
- **Decision**: FIXED (zdanie w komentarzu nagłówkowym migracji A w grupie 1; pierwszym dowodem jest `npm test`, wiersz 1.5, który biegnie przed smoke i e2e)

### F7 — Jeden PR fazy 1 najpewniej przekroczy próg narzędzi `ai-review`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, Overview
- **Detail**: Diff kodu (smoke, scenariusze RLS, testy tras, nowe pliki) z dużym prawdopodobieństwem przekroczy 50 000 znaków, więc wymagany check `ai-review` przejrzy go bez narzędzi repo (`tools: skipped`), a duże diffy już raz dobiły do limitu wyjścia recenzenta (PR #103, lekcja w `lessons.md`). To skutek decyzji właściciela o jednej fazie, nie błąd planu.
- **Fix**: Jedno zdanie w Overview fazy 1: spodziewany przegląd bez narzędzi; przy `length` albo timeout re-run uruchamia właściciel zgodnie z README, agent nie rusza bramki.
- **Decision**: FIXED (zdanie w Overview fazy 1, poprawione względem README: `ai-cr:review` ponawia wynik `error`, nigdy `fail`; dopisane polecenie pomiaru diffu i próg 200 000 znaków `too-large`, o którym decyduje wyłącznie właściciel; największy dotąd PR #125 miał 142 055 znaków)
