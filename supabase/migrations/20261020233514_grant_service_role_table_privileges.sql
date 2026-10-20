-- grant-service-role-table-privileges: make the table-level privileges service_role uses explicit.
--
-- From 2026-10-30 Supabase stops granting the Data API roles default privileges on tables created in public, including
-- tables created by migrations replayed on a fresh database (`supabase db reset`, a new project, a preview branch). The
-- app itself is unaffected: authenticated holds explicit grants on every table it uses and anon reaches no table. But
-- service_role, which only the test harnesses use (tests/helpers/supabase.ts, tests/e2e/local-supabase.ts,
-- scripts/e2e-user.mjs insert nicknames and read and delete groups and tasks with the service key), has relied on the
-- default privileges so far. This migration grants it the four DML privileges Supabase recommends on every data table, so
-- the harnesses keep working on a database rebuilt after that date. reminder_secret stays out: no API role needs it.
--
-- Idempotent and backward compatible: where the privileges exist, GRANT is a no-op, so the hosted database behaves
-- exactly as before. Nothing is dropped, altered or revoked, so no `-- compat:` marker is needed.

grant select, insert, update, delete
  on public.groups, public.group_members, public.tasks, public.task_participants, public.task_checkoffs,
     public.nicknames, public.push_subscriptions
  to service_role;
