-- task-create-and-manage (S-02): tasks of a group. Every member reads them; only the creator retitles or deletes.
--
-- Additive table that nothing reads yet, so it is backward compatible with the deployed code.
--
-- Decisions:
--   - recurrence is one of once/daily/weekly and is immutable after creation (no UPDATE grant); streaks are computed on
--     read from timestamps, so the row needs no period or timezone data.
--   - tasks.group_id cascades with the group; tasks.created_by cascades with the account (unlike groups.owner_id there
--     is nothing to protect: a task of a deleted account has no one left to manage it).
--   - UPDATE and DELETE check current membership as well as authorship: a creator who left the group keeps the task
--     visible to the group but cannot manage it until they are back in the group.
--   - Client writes are limited by column grants: INSERT of group_id, created_by, title, recurrence; UPDATE of title.

-- ---------------------------------------------------------------------------
-- table
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  recurrence text not null,
  created_at timestamptz not null default now(),
  constraint tasks_title_length check (char_length(btrim(title, E' \t\r\n')) between 1 and 80),
  constraint tasks_recurrence_allowed check (recurrence in ('once', 'daily', 'weekly'))
);

create index tasks_group_id_idx on public.tasks (group_id);
create index tasks_created_by_idx on public.tasks (created_by);

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------

-- anon never touches tasks; RLS would block it anyway, this is defence in depth.
revoke all on public.tasks from anon;
revoke insert, update on public.tasks from authenticated;
grant insert (group_id, created_by, title, recurrence) on public.tasks to authenticated;
grant update (title) on public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- row level security (anon has no policy and therefore no access)
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;

create policy "tasks_select_own_group" on public.tasks
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "tasks_insert_as_member" on public.tasks
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));

create policy "tasks_update_by_creator" on public.tasks
  for update to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(group_id))
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));

create policy "tasks_delete_by_creator" on public.tasks
  for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(group_id));
