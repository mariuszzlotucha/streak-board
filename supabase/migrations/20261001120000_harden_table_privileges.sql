-- harden-table-privileges (S-03 impl review F4): least privilege on groups, group_members and tasks.
--
-- Supabase default privileges grant anon and authenticated every table privilege. Row-level security gates rows, but not
-- TRUNCATE, REFERENCES and TRIGGER, and anon never gets a policy. tasks already revoked everything from anon, and
-- task_participants starts from nothing; this brings groups and group_members in line.
--
-- Removes only privileges that no code path uses, so it is backward compatible with the deployed code:
--   - anon: everything on groups and group_members. It has no policy there, so it could never touch a row; it now fails
--     with 42501 (like tasks and task_participants) instead of seeing zero rows. Signed-out requests are redirected by
--     the middleware before any query, and the invite preview is the authenticated function preview_group.
--   - authenticated: TRUNCATE, REFERENCES and TRIGGER on groups, group_members and tasks (PostgREST exposes none of them).
--   - authenticated: INSERT and UPDATE on group_members. No INSERT or UPDATE policy exists (the insert policy was dropped
--     by 20260925011727_harden_group_rls.sql); memberships are created by the SECURITY DEFINER functions join_group and
--     add_owner_to_group, which run with the owner's privileges, and are never updated.
--
-- Kept untouched: SELECT and DELETE on group_members, the column-level INSERT/UPDATE grants on groups and tasks, and
-- DELETE on groups and tasks, all still bounded by their policies.

revoke all on public.groups from anon;
revoke all on public.group_members from anon;

revoke truncate, references, trigger on public.groups from authenticated;
revoke truncate, references, trigger on public.group_members from authenticated;
revoke truncate, references, trigger on public.tasks from authenticated;

revoke insert, update on public.group_members from authenticated;
