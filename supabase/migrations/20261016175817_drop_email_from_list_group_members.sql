-- nickname (S-14), release 2: list_group_members stops returning the e-mail address of the members.
--
-- Release 1 (20261016162551_add_nicknames.sql) added the nickname column next to email and switched the app to it, so
-- no member's e-mail address reached the dashboard. The RPC itself still returned it to any member who called it
-- directly through PostgREST. This migration removes the column: no member gets another member's e-mail address by any
-- path. The join of auth.users goes with it, because nothing else is read from it; the is_group_member filter, the left
-- join of nicknames and the order are unchanged.
--
-- It may reach production only once the production tag points at the release 1 code: earlier code reads email. A code
-- rollback below release 1 after this migration needs a separate migration that restores the column.
--
-- compat: list_group_members loses the email column; the deployed code (production tag at or after the S-14 phase 1 merge) reads user_id, nickname, joined_at and is_owner only, and its smoke matches nicknames, never addresses.

-- Removing a column from returns table needs drop + create (create or replace cannot change the result columns). Both
-- run in this one migration, which the CLI applies in one transaction, so the deployed code never sees the function
-- missing.
drop function public.list_group_members (uuid);

-- Rows only for a member of p_group_id (is_group_member answers for the caller); otherwise an empty set.
create function public.list_group_members(p_group_id uuid)
returns table (user_id uuid, nickname text, joined_at timestamptz, is_owner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gm.user_id,
    n.nickname,
    gm.joined_at,
    g.owner_id = gm.user_id
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  left join public.nicknames n on n.user_id = gm.user_id
  where gm.group_id = p_group_id
    and public.is_group_member(p_group_id)
  order by (g.owner_id = gm.user_id) desc, gm.joined_at, gm.user_id;
$$;

revoke execute on function public.list_group_members (uuid) from public, anon;
grant execute on function public.list_group_members (uuid) to authenticated;
