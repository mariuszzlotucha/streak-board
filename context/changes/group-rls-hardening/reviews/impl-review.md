<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Utwardzenie RLS grup (group-rls-hardening)

- **Plan**: context/changes/group-rls-hardening/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification

Zakres git: commity `0bcef72` (p1), `a548bdb` (fix F1 z przeglądu fazy 1), `a2d9553` (p2), `59b7a3b` (epilog). Pliki z planu — migracja, `src/types.ts`, `supabase/checks/rls-scenarios.sql`, `README.md` — wszystkie obecne w diffie; brak brakujących elementów.

Kryteria automatyczne (uruchomione ponownie na HEAD `59b7a3b`):

- 1.1 `npx supabase db reset` — PASS
- 1.2 generowanie typów + `grep join_group` — PASS; wynik identyczny z zacommitowanym `src/types.ts`
- 1.3 `npm run lint` — PASS
- 1.4 `npm run build` — PASS
- 2.1 skrypt scenariuszy na pełnym schemacie — PASS, exit 0, `ALL RLS SCENARIOS PASSED (59 assertions)`
- 2.2 celowana mutacja (stara polityka INSERT na `group_members`) — PASS: exit 3, `FAIL: #1 direct INSERT into group_members is denied ... expected SQLSTATE 42501, but the statement succeeded`; po `db reset` skrypt znów przechodzi (exit 0)
- 2.3 `npx prettier --check README.md` — PASS

Kryteria ręczne 1.5 i 2.4 odhaczone po potwierdzeniu użytkownika; w diffie jest dowód (skrypt wypisuje linie PASS pokrywające #1–#8, w tym #6 przez katalog `pg_policies`). Dodatkowe mutacje z fazy 2 (usunięcie osłony właściciela w polityce DELETE, przywrócenie UPDATE na całej tabeli `groups`) także dawały czerwony wynik.

Wcześniej przetriażowane (nie powtarzane): F1 z przeglądu fazy 1 (CHECK na `name`) — FIXED w `a548bdb`; F2 (niezwiązane `CLAUDE.md` i `.claude/.10x-cli-manifest.json` w `0bcef72`) — SKIPPED. Raport: `reviews/impl-review-phase-1.md`. To wciąż jedyne wystąpienie Scope Discipline, stąd WARNING w tabeli.

## Findings

### F1 — Plan opisuje CHECK na `groups.name` jako `btrim(name)`, a migracja używa `btrim(name, E' \t\r\n')`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/group-rls-hardening/plan.md:83 (oraz :35) vs supabase/migrations/20260925011727_harden_group_rls.sql:89
- **Detail**: Poprawka F1 z przeglądu fazy 1 celowo odeszła od kontraktu w planie (`char_length(btrim(name)) between 1 and 80`), bo domyślny `btrim` nie obcina tabulatorów i nowych linii. Odchylenie jest udokumentowane tylko w `reviews/impl-review-phase-1.md`; sam plan nadal opisuje starą wersję, więc czytelnik planu (S-01, archiwum) zobaczy nieaktualny kontrakt. Kod, skrypt (`#7 a name of tabs/newlines is rejected`) i zachowanie są spójne — rozbieżny jest tylko tekst planu.
- **Fix**: Dopisz do planu krótki dopisek (addendum) przy kontrakcie migracji: warunek to `char_length(btrim(name, E' \t\r\n')) between 1 and 80`, z odesłaniem do `reviews/impl-review-phase-1.md` (F1); nie zmieniaj bloków faz wstecznie poza tym dopiskiem.
- **Decision**: FIXED via Fix now (2026-09-25) — addendum w plan.md przy kontrakcie migracji (bez zmian wstecznych w blokach faz)
