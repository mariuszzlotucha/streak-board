<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Utwardzenie RLS grup (group-rls-hardening)

- **Plan**: context/changes/group-rls-hardening/plan.md
- **Mode**: Deep (weryfikacja lokalna, bez sub-agenta)
- **Date**: 2026-09-25
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓ (istniejące), 5/5 symbols ✓ (`project_id`, kontener `supabase_db_10x-astro-starter`, `ignores` w eslint, numery linii migracji F-01, flaga `db reset --version`), brief↔plan ✓; mechanizm skryptu (DO + role + exit code 3) sprawdzony na lokalnej bazie

## Findings

### F1 — Asercje skryptu mogą przechodzić z niewłaściwej przyczyny

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Skrypt scenariuszy z asercjami (Contract)
- **Detail**: Contract mówi, że oczekiwane błędy są „łapane w blokach exception i traktowane jako PASS", ale nie wymaga dopasowania konkretnego SQLSTATE. Test mechanizmu na lokalnej bazie pokazał to wprost: bezpośredni INSERT do `group_members` został „odrzucony", ale przez `23505` (właściciel już był członkiem), a nie przez RLS — na starym schemacie polityka INSERT nadal go dopuszcza. Skrypt z `when others` dałby PASS dokładnie dla luki #1.
- **Fix**: W Contract dopisz: każdy blok oczekiwanego błędu dopasowuje konkretny SQLSTATE (`42501` dla RLS/uprawnień, `23514` dla `CHECK`, `23505` dla unikalności, `P0002` dla złego kodu), a inny błąd lub jego brak = FAIL; scenariusze wybierają użytkownika w stanie wyjściowym pozwalającym na czysty test (np. bezpośredni INSERT jako użytkownik bez grupy).
  - Strength: Zamyka klasę fałszywych PASS potwierdzoną eksperymentem; koszt to jeden warunek na blok.
  - Tradeoff: Skrypt jest nieco dłuższy; SQLSTATE trzeba dobrać per scenariusz.
  - Confidence: HIGH — mechanizm i `exit=3` przy `raise exception` potwierdzone lokalnie.
  - Blind spot: SQLSTATE dla odmowy uprawnień kolumnowych i RLS to oba `42501` — scenariusze nie odróżnią ich przyczyny (akceptowalne).
- **Decision**: FIX APPLIED (2026-09-25) — zastosowano w plan.md

### F2 — Kryterium 2.2 nie dowodzi, że asercje wykrywają regresje

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Success Criteria (Automated) i Progress 2.2
- **Detail**: Kryterium 2.2 uruchamia skrypt na schemacie po `db reset --version 20260925003350`. Skrypt padnie tam na pierwszym brakującym obiekcie (`join_group` nie istnieje), a nie na asercji o polityce — więc kryterium przejdzie nawet przy skrypcie, który nie wykrywa żadnej regresji RLS.
- **Fix**: Zastąp 2.2 celowaną mutacją na pełnym schemacie: utwórz z powrotem starą politykę INSERT na `group_members` (`with check (user_id = (select auth.uid()))`), uruchom skrypt (musi zakończyć się kodem ≠ 0 na asercji bezpośredniego INSERT), po czym `npx supabase db reset` przywraca schemat; zaktualizuj też opis w Success Criteria.
- **Decision**: FIX APPLIED (2026-09-25) — zastosowano w plan.md

### F3 — Przyszłe kolumny `groups` nie dostaną uprawnień INSERT/UPDATE

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes (kontrakt dla S-01)
- **Detail**: Po `revoke insert, update` i `grant` tylko na `(owner_id, name)` / `(name)` każda nowa kolumna dodana do `groups` przez późniejszą migrację będzie niezapisywalna dla `authenticated`, dopóki ktoś jawnie nie doda `grant`. Błąd objawia się dopiero jako „permission denied" w S-01+.
- **Fix**: Dopisz jedną linię do kontraktu dla S-01 w Migration Notes: nowa edytowalna kolumna `groups` wymaga jawnego `grant insert/update (kolumna)` w tej samej migracji.
- **Decision**: FIX APPLIED (2026-09-25) — zastosowano w plan.md
