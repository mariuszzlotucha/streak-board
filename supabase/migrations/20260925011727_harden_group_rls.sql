-- group-rls-hardening: closes the gaps found by the /code-review of the F-01 migration (commit 9efb772).
--
-- Closed here (numbering follows that review):
--   #1/#4  joining a group required no join_code and a direct INSERT ... RETURNING on group_members failed.
--          Joining now goes exclusively through join_group(p_join_code); there is no INSERT policy on group_members.
--   #2     an owner could delete their own membership and then join a second group. The owner row is now protected.
--   #3     a regular member could not leave a group. A member can now delete their own row.
--   #5     is_group_member(uuid, uuid) was a public membership oracle. Replaced by is_group_member(uuid), which only
--          answers for the caller.
--   #6     bare auth.uid() in policies is re-evaluated per row; now (select auth.uid()).
--   #7     no CHECK on groups.name and a short join_code. The code is now the only gate into a group (join_group can be
--          called without a rate limit), so its default grows from 8 to 12 hex characters (48 bits).
--   #8     an owner could set groups.join_code and groups.id. Client writes are limited to columns via grants.
--
-- The F-01 migration is immutable and stays untouched; everything is done here.

-- ---------------------------------------------------------------------------
-- drop what depends on the old two-argument is_group_member
-- ---------------------------------------------------------------------------

-- Dropped policies are recreated below; group_members_insert_self is not (see join_group).
drop policy "groups_select_own_group" on public.groups;
drop policy "group_members_select_own_group" on public.group_members;
drop policy "group_members_insert_self" on public.group_members;
drop policy "group_members_delete_by_group_owner" on public.group_members;

drop function public.is_group_member (uuid, uuid);

-- ---------------------------------------------------------------------------
-- functions
-- ---------------------------------------------------------------------------

-- Membership of the caller only. The user id is read inside the function on purpose: REVOKE EXECUTE would not close the
-- oracle, because RLS policies call this function with the privileges of the querying user.
create function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_group_member (uuid) from public, anon;
grant execute on function public.is_group_member (uuid) to authenticated;

-- The only way to join a group. SECURITY DEFINER bypasses RLS to look the group up by code and to insert the membership.
-- An unknown code raises P0002; a user who already belongs to a group hits UNIQUE(group_members.user_id) -> 23505.
-- Telling those two apart lets a caller probe whether a code is valid; accepted, the code entropy is the only defence.
create function public.join_group(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select id
  into v_group_id
  from public.groups
  where join_code = p_join_code;

  if v_group_id is null then
    raise exception 'invalid join code' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, (select auth.uid()));

  return v_group_id;
end;
$$;

revoke execute on function public.join_group (text) from public, anon;
grant execute on function public.join_group (text) to authenticated;

-- ---------------------------------------------------------------------------
-- groups: validation, join_code length, column-level privileges
-- ---------------------------------------------------------------------------

alter table public.groups
  add constraint groups_name_length check (char_length(btrim(name, E' \t\r\n')) between 1 and 80);

-- Only new groups get 12 characters; existing codes stay valid.
alter table public.groups
  alter column join_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- The client may only send name and owner_id on INSERT and only change name on UPDATE. id, join_code and created_at
-- come from column defaults. A new editable column needs its own explicit grant in the migration that adds it.
revoke insert, update on public.groups from authenticated;
grant insert (owner_id, name) on public.groups to authenticated;
grant update (name) on public.groups to authenticated;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

-- groups
-- owner_id is checked directly because INSERT ... RETURNING evaluates this policy before the AFTER INSERT trigger has
-- added the owner to group_members; is_group_member() alone would reject `.insert().select()`.
create policy "groups_select_own_group" on public.groups
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id));

alter policy "groups_insert_as_owner" on public.groups
  with check (owner_id = (select auth.uid()));

alter policy "groups_update_by_owner" on public.groups
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "groups_delete_by_owner" on public.groups
  using (owner_id = (select auth.uid()));

-- group_members (no INSERT policy: joining goes through join_group; no UPDATE policy: no editable fields)
create policy "group_members_select_own_group" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

-- The owner removes other members but never their own row: the owner always stays in the group and leaves it only by
-- deleting it (the cascade bypasses RLS).
create policy "group_members_delete_by_group_owner" on public.group_members
  for delete to authenticated
  using (
    user_id <> (select auth.uid())
    and exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = (select auth.uid())
    )
  );

-- A regular member leaves the group by deleting their own row; the owner cannot.
create policy "group_members_delete_self" on public.group_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and not exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = group_members.user_id
    )
  );
