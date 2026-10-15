-- grant-core-table-privileges (S-12 refactor-opportunities, OPP-4): make the table-level privileges the deployed code
-- already uses explicit.
--
-- SELECT and DELETE for authenticated on groups, group_members and tasks come from Supabase's default privileges so
-- far; 20261001120000_harden_table_privileges.sql only says they are "kept untouched". task_participants and
-- task_checkoffs grant theirs explicitly (they start from nothing). This migration states the three remaining tables
-- the same way, so the full privilege picture is in supabase/migrations/ and supabase/checks/rls-scenarios.sql can pin
-- it in both directions (a missing privilege and an extra one both fail).
--
-- Idempotent and backward compatible: where the privileges exist, GRANT is a no-op, so the deployed code and the hosted
-- database behave exactly as before. Nothing is dropped, altered or revoked, so no `-- compat:` marker is needed.
-- Row-level security still bounds every row these privileges reach; the column-level INSERT and UPDATE grants on
-- groups and tasks stay as they are.

grant select, delete on public.groups, public.group_members, public.tasks to authenticated;
