-- task-join-and-leave (S-03): who takes part in a task. Members join and leave tasks of their own group.
--
-- Additive table that nothing reads yet, so it is backward compatible with the deployed code.
--
-- Decisions:
--   - one row per (task, user); the composite primary key makes a duplicate join a 23505.
--   - both foreign keys cascade: deleting a task or an account removes its participation rows.
--   - a participant is always a member of the task's group: the creator is enrolled by a trigger on tasks, and leaving
--     a group (or being removed by the owner) clears the user's participation in that group's tasks. The creator can
--     leave their own task like anybody else.
--   - SELECT and INSERT are scoped by "the task is visible to the caller" (the tasks SELECT policy applies inside the
--     policy subquery, so visibility means current group membership). DELETE is limited to the caller's own rows.
--   - Client writes are limited by column grants: INSERT of task_id, user_id (joined_at defaults to now()); no UPDATE.

-- ---------------------------------------------------------------------------
-- table
-- ---------------------------------------------------------------------------

create table public.task_participants (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_participants_user_id_idx on public.task_participants (user_id);

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------

-- Supabase default privileges grant everything to anon and authenticated; start from nothing and add back only what the
-- client needs. anon never touches the table; RLS would block it anyway, this is defence in depth.
revoke all on public.task_participants from anon, authenticated;
grant select on public.task_participants to authenticated;
grant insert (task_id, user_id) on public.task_participants to authenticated;
grant delete on public.task_participants to authenticated;

-- ---------------------------------------------------------------------------
-- row level security (anon has no policy and therefore no access)
-- ---------------------------------------------------------------------------

alter table public.task_participants enable row level security;

create policy "task_participants_select_visible_task" on public.task_participants
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_participants.task_id));

create policy "task_participants_insert_self" on public.task_participants
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_participants.task_id)
  );

create policy "task_participants_delete_self" on public.task_participants
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

-- Enrol the creator in their own task.
create function public.add_creator_to_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_participants (task_id, user_id)
  values (new.id, new.created_by);
  return new;
end;
$$;

revoke execute on function public.add_creator_to_task () from public, anon, authenticated;

create trigger tasks_add_creator_to_task
  after insert on public.tasks
  for each row
  execute function public.add_creator_to_task();

-- A user who leaves (or is removed from) a group stops participating in that group's tasks. The trigger also fires when
-- a group is deleted (cascade to group_members); the tasks and their participants may already be gone then, in which
-- case the DELETE simply matches no rows.
create function public.remove_member_task_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.task_participants tp
  using public.tasks t
  where tp.task_id = t.id
    and t.group_id = old.group_id
    and tp.user_id = old.user_id;
  return old;
end;
$$;

revoke execute on function public.remove_member_task_participation () from public, anon, authenticated;

create trigger group_members_remove_task_participation
  after delete on public.group_members
  for each row
  execute function public.remove_member_task_participation();

-- ---------------------------------------------------------------------------
-- backfill (last): existing tasks get their creator as participant
-- ---------------------------------------------------------------------------

insert into public.task_participants (task_id, user_id)
select id, created_by
from public.tasks
on conflict do nothing;
