---
change_id: group-rls-hardening
title: Group rls hardening
status: implemented
created: 2026-09-25
updated: 2026-09-25
archived_at: null
---

## Notes

Źródło: `/code-review` commita 9efb772 (migracja `supabase/migrations/20260925003350_create_groups_and_group_members.sql`, zarchiwizowana zmiana group-schema-and-rls). Ustalenia niezweryfikowane — potwierdzić w planie. Poprawki idą w nowej migracji (bez edycji starej).

1. INSERT na `group_members` sprawdza tylko `user_id = auth.uid()` — `join_code` nie chroni przed dołączeniem znając UUID grupy (l. 106).
2. DELETE na `group_members` pozwala właścicielowi usunąć własne członkostwo → łamie inwarianty (twórca zawsze członkiem, jedna grupa na użytkownika) (l. 112).
3. Brak DELETE dla własnego wiersza członka — nie można wyjść z grupy (l. 112).
4. SELECT na `group_members` przez `is_group_member()` nie widzi wiersza z tego samego zapytania → `INSERT ... RETURNING` failuje; brak gałęzi `user_id = auth.uid()` (l. 103).
5. `is_group_member(p_group_id, p_user_id)` SECURITY DEFINER dostępne przez RPC dla każdego zalogowanego → wyrocznia członkostwa; usunąć `p_user_id` lub cofnąć EXECUTE (l. 55).
6. Gołe `auth.uid()` w politykach zamiast `(select auth.uid())` (auth_rls_initplan) (l. 81).
7. `groups.name` bez CHECK; `join_code` 8 hex (32 bity), bez rate limitu, brak retry przy kolizji UNIQUE (l. 17).
8. UPDATE na `groups` pozwala zmienić dowolną kolumnę (`join_code`, `id`); ograniczyć do `name`, rotacja kodu przez funkcję (l. 95).
