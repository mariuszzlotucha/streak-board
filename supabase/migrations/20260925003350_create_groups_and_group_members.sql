-- F-01 group-schema-and-rls: groups + group_members with per-group visibility RLS.
--
-- Model (PRD Access Control): one permanent creator per group, all other members are equal.
-- A user belongs to at most one group (PRD Non-Goals) -- enforced by UNIQUE(group_members.user_id),
-- which also covers creators through the auto-join trigger below.

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  -- restrict, not cascade: deleting an owner's account must not silently destroy the group for every other member.
  -- Any future account-deletion flow has to explicitly delete or hand over the group first.
  owner_id uuid not null references auth.users (id) on delete restrict,
  name text not null,
  join_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index group_members_group_id_idx on public.group_members (group_id);

-- ---------------------------------------------------------------------------
-- helper functions
-- ---------------------------------------------------------------------------

-- Membership check used by the SELECT policies. SECURITY DEFINER bypasses RLS on group_members, which avoids the
-- "infinite recursion detected in policy" error a self-referencing policy on group_members would raise.
create function public.is_group_member(p_group_id uuid, p_user_id uuid)
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
      and user_id = p_user_id
  );
$$;

revoke execute on function public.is_group_member (uuid, uuid) from public, anon;
grant execute on function public.is_group_member (uuid, uuid) to authenticated;

-- Auto-join the creator. If the owner already belongs to a group, UNIQUE(group_members.user_id) fails here and the
-- whole INSERT on groups rolls back -- this is what enforces "one group per user" for creators.
create function public.add_owner_to_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id)
  values (new.id, new.owner_id);
  return new;
end;
$$;

revoke execute on function public.add_owner_to_group () from public, anon, authenticated;

create trigger groups_add_owner_to_group
  after insert on public.groups
  for each row
  execute function public.add_owner_to_group();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- groups
-- owner_id is checked directly because INSERT ... RETURNING evaluates this policy before the AFTER INSERT trigger has
-- added the owner to group_members; is_group_member() alone would reject `.insert().select()`.
create policy "groups_select_own_group" on public.groups
  for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id, auth.uid()));

create policy "groups_insert_as_owner" on public.groups
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "groups_update_by_owner" on public.groups
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "groups_delete_by_owner" on public.groups
  for delete to authenticated
  using (owner_id = auth.uid());

-- group_members (no UPDATE policy: there are no editable fields, so default-deny is intended)
create policy "group_members_select_own_group" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy "group_members_insert_self" on public.group_members
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "group_members_delete_by_group_owner" on public.group_members
  for delete to authenticated
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = auth.uid()
    )
  );
