-- account-deletion (S-15): the owner hands the group over to a member, and an account can be deleted without taking
-- along the data other people use.
--
-- What this changes:
--   - The rule "one permanent owner" becomes "the owner hands the group over to another member, and must do so when
--     deleting their account". transfer_group_ownership(uuid) is the client path; the former owner stays in the group
--     as a regular member and can then leave it (group_members_delete_self no longer matches them).
--   - groups.owner_notice_pending: set by every transfer, so the new owner sees a one-time notice on the dashboard; the
--     owner clears it with a plain UPDATE (column grant below, bounded by the policy groups_update_by_owner).
--   - tasks.created_by no longer cascades with the account (on delete restrict). The tasks a deleted account created
--     stay in their groups with everyone's participation and check-offs, and pass to the group's owner. Deleting a task
--     creator any other way (Supabase dashboard, auth.admin.deleteUser) now fails with a foreign key error instead of
--     silently erasing the tasks; the operator deletes such an account with public.delete_account(...) in the SQL
--     Editor.
--   - delete_own_account(uuid) deletes the caller's account in one transaction: the group first (handed over to the
--     chosen successor, or deleted when the caller is its only member), then the caller's tasks pass to the owner of
--     their group, then the caller's security log entries go, and last the auth.users row, whose cascades remove the
--     nickname, the membership, the caller's own participation and check-offs, identities and sessions.
--
-- Each operation has two layers: an inner function with an explicit user id (no EXECUTE for anon or authenticated; for
-- the operator in the SQL Editor) and a client function on auth.uid(). Domain errors use their own SQLSTATE:
-- 42501 (the caller is not the group owner, or not signed in), P0003 (the successor is missing, the caller, or not a
-- member of the group), P0002 (the account to delete does not exist).
--
-- Backward compatible with the deployed code: the new column has a default, the grant and the functions are additive,
-- and restrict only changes deleting a user, which the deployed code never does.
--
-- compat: the deployed code never deletes users; restrict only changes deleting a task creator, which now goes through delete_account

-- ---------------------------------------------------------------------------
-- groups: the new owner's notice
-- ---------------------------------------------------------------------------

alter table public.groups
  add column owner_notice_pending boolean not null default false;

-- A new editable column needs its own grant (20260925011727_harden_group_rls.sql). The policy groups_update_by_owner
-- limits the UPDATE to the owner; owner_id itself stays outside the client's grants.
grant update (owner_notice_pending) on public.groups to authenticated;

-- ---------------------------------------------------------------------------
-- tasks: the creator's account no longer takes the tasks along
-- ---------------------------------------------------------------------------

-- Drop and add in one migration, which the CLI applies in one transaction; created_by stays not null.
alter table public.tasks
  drop constraint tasks_created_by_fkey;

alter table public.tasks
  add constraint tasks_created_by_fkey foreign key (created_by) references auth.users (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- functions: ownership transfer
-- ---------------------------------------------------------------------------

-- Hands p_owner's group over to p_new_owner. The group row is locked FOR UPDATE before the successor is checked, which
-- serialises two transfers or deletions by the same owner (two tabs) and holds off a join (join_group's foreign key
-- check waits for the lock). It does not stop the successor leaving the group at the same moment: leaving deletes the
-- group_members row under RLS and never touches groups, so a leave that commits in the same milliseconds can leave an
-- owner who is no longer a member. Known, accepted race, like the join / leave-group race in
-- 20261001090000_create_task_participants.sql: the window is milliseconds in small groups. Repair: the operator fixes
-- the row in the SQL Editor; if it ever matters, add a BEFORE DELETE trigger on group_members that locks the group row
-- FOR SHARE.
-- 42501 when p_owner owns no group; P0003 when p_new_owner is NULL, p_owner, or not a member of the group.
create function public.transfer_group_ownership_for(p_owner uuid, p_new_owner uuid)
returns void
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
  where owner_id = p_owner
  for update;

  if v_group_id is null then
    raise exception 'not the group owner' using errcode = '42501';
  end if;

  if p_new_owner is null
    or p_new_owner = p_owner
    or not exists (
      select 1
      from public.group_members
      where group_id = v_group_id
        and user_id = p_new_owner
    ) then
    raise exception 'invalid successor' using errcode = 'P0003';
  end if;

  update public.groups
  set owner_id = p_new_owner,
      owner_notice_pending = true
  where id = v_group_id;
end;
$$;

revoke execute on function public.transfer_group_ownership_for (uuid, uuid) from public, anon, authenticated;

-- The client path: the caller hands their own group over to another member.
create function public.transfer_group_ownership(p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.transfer_group_ownership_for((select auth.uid()), p_new_owner);
end;
$$;

revoke execute on function public.transfer_group_ownership (uuid) from public, anon;
grant execute on function public.transfer_group_ownership (uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- functions: account deletion
-- ---------------------------------------------------------------------------

-- Deletes p_user_id's account, keeping what other people use. The order matters: groups.owner_id and tasks.created_by
-- are ON DELETE RESTRICT, and the tasks must pass to the owner after the transfer, never to the deleted account.
--   1. The group p_user_id owns: with other members it goes to p_successor (transfer_group_ownership_for, P0003 for a
--      missing or invalid successor); as its only member it is deleted with its tasks, participation and check-offs.
--      p_successor is ignored for an account that owns no group.
--   2. The tasks p_user_id created pass to the owner of their group, including groups p_user_id has left.
--   3. The security log entries that name p_user_id (as the actor or in the traits) are deleted: auth.audit_log_entries
--      has no foreign key to auth.users, and deleting from SQL writes no user_deleted entry.
--   4. The auth.users row; its cascades remove the nickname, the membership, p_user_id's own participation and
--      check-offs, identities and sessions. P0002 when there is no such account.
-- For the operator in the SQL Editor: select public.delete_account('<user id>', '<successor id or null>');
create function public.delete_account(p_user_id uuid, p_successor uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  -- 1. The owned group, locked before its members are counted (see transfer_group_ownership_for).
  select id
  into v_group_id
  from public.groups
  where owner_id = p_user_id
  for update;

  if v_group_id is not null then
    if exists (
      select 1
      from public.group_members
      where group_id = v_group_id
        and user_id <> p_user_id
    ) then
      perform public.transfer_group_ownership_for(p_user_id, p_successor);
    else
      delete from public.groups
      where id = v_group_id;
    end if;
  end if;

  -- 2. The created tasks pass to the current owner of their group (after the transfer above).
  update public.tasks t
  set created_by = g.owner_id
  from public.groups g
  where g.id = t.group_id
    and t.created_by = p_user_id;

  -- 3. The security log entries that name the account.
  delete from auth.audit_log_entries
  where payload ->> 'actor_id' = p_user_id::text
    or payload -> 'traits' ->> 'user_id' = p_user_id::text;

  -- 4. The account itself.
  delete from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_account (uuid, uuid) from public, anon, authenticated;

-- The client path: the caller deletes their own account. 42501 without a signed-in user.
create function public.delete_own_account(p_successor uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  perform public.delete_account(v_user_id, p_successor);
end;
$$;

revoke execute on function public.delete_own_account (uuid) from public, anon;
grant execute on function public.delete_own_account (uuid) to authenticated;
