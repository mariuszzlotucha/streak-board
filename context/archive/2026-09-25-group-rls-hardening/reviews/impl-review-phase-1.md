<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Utwardzenie RLS grup (group-rls-hardening)

- **Plan**: context/changes/group-rls-hardening/plan.md
- **Scope**: Phase 1 of 2
- **Reviewed phases**: 1
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification

- `npx supabase db reset` — PASS (obie migracje od zera)
- `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts && grep -q join_group src/types.ts` — PASS; wynik identyczny z zacommitowanym `src/types.ts`
- `npm run lint` — PASS
- `npm run build` — PASS
- Manual 1.5 — odhaczone po potwierdzeniu użytkownika; dowód: `DELETE 0` dla właściciela, `42501` dla bezpośredniego INSERT, `P0002` dla złego kodu, poprawne dołączenie z dobrym kodem
- Dodatkowe sondy na lokalnej bazie: INSERT z cudzym `owner_id` → `42501`; nazwa 81 znaków → naruszenie `groups_name_length`; w `pg_proc` istnieje wyłącznie jednoargumentowe `is_group_member`; `anon` bez EXECUTE na `join_group`/`is_group_member`; uprawnienia kolumnowe `authenticated` na `groups`: INSERT `(name, owner_id)`, UPDATE `(name)`; zestaw polityk zgodny z planem (7)

## Findings

### F1 — CHECK na `groups.name` przepuszcza nazwę złożoną z tabulatorów/nowych linii

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260925011727_harden_group_rls.sql:82
- **Detail**: `btrim(name)` domyślnie obcina tylko spacje. INSERT z `name = E'\t\n'` przechodzi (potwierdzone sondą: `INSERT 0 1`, długość 2), więc „pusta" nazwa nadal możliwa; plan zakładał, że CHECK blokuje puste nazwy. Nie jest to luka bezpieczeństwa, tylko niepełna walidacja.
- **Fix**: Zmień warunek na `char_length(btrim(name, E' \t\r\n')) between 1 and 80` (migracja jest lokalna i niewypchnięta, więc można ją edytować i powtórzyć `db reset`); scenariusz w fazie 2 dopisze asercję `23514` dla nazwy `E'\t\n'`.
- **Decision**: FIXED via Fix now (2026-09-25) — `btrim(name, E' \t\r\n')`; re-run db reset/types/lint/build PASS, `E'\t\n'` → `23514`

### F2 — Commit fazy zawiera niezwiązane zmiany `CLAUDE.md` i `.claude/.10x-cli-manifest.json`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit 0bcef72
- **Detail**: Do commita `feat(group-rls-hardening) ... (p1)` trafiły dwa pliki spoza planu (178 + 72 zmienionych linii), bo przy pytaniu o brudne ścieżki wybrano „Stage all". Treść commita to odnotowuje, ale historii tej fazy nie da się już odwrócić bez cofania tych plików.
- **Fix**: Nic nie rób (commit już istnieje, `--amend` jest zabroniony); na przyszłość przy fazie 2 wybierz „Continue — stage only the planned set".
- **Decision**: SKIPPED — commit istnieje, lekcja nie zapisana (użytkownik anulował wpis)
