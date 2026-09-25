-- group-create-join-manage (S-01): two read helpers for the app layer.
--
-- Clients cannot read auth.users, and a non-member cannot read groups, so:
--   list_group_members(group)  lets a member see the emails / owner flag of their own group's members;
--   preview_group(join_code)   lets a signed-in user see the group name before joining.
-- Both are SECURITY DEFINER with an empty search_path and executable by `authenticated` only (same conventions as
-- join_group). No table, policy or grant changes.

-- Rows only for a member of p_group_id (is_group_member answers for the caller); otherwise an empty set.
create function public.list_group_members(p_group_id uuid)
returns table (user_id uuid, email text, joined_at timestamptz, is_owner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gm.user_id,
    u.email::text,
    gm.joined_at,
    g.owner_id = gm.user_id
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join auth.users u on u.id = gm.user_id
  where gm.group_id = p_group_id
    and public.is_group_member(p_group_id)
  order by (g.owner_id = gm.user_id) desc, gm.joined_at, gm.user_id;
$$;

revoke execute on function public.list_group_members (uuid) from public, anon;
grant execute on function public.list_group_members (uuid) to authenticated;

-- The group name for an exact join_code match, NULL otherwise (no exception, so the UI can render "invalid invite").
-- Like join_group, this tells a caller whether a code is valid; accepted, the code entropy is the only defence.
create function public.preview_group(p_join_code text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.name
  from public.groups g
  where g.join_code = p_join_code;
$$;

revoke execute on function public.preview_group (text) from public, anon;
grant execute on function public.preview_group (text) to authenticated;
