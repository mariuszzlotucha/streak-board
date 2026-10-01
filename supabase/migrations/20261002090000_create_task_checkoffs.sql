-- checkoff-and-leaderboard (S-04): one row per task, member and checked period. The streak itself is computed on read
-- (src/lib/streak-rules.ts) from these facts, so the table stores no counters.
--
-- Additive table and view that the deployed code does not read, so it is backward compatible and the release may apply
-- it before the code that uses it is live.
--
-- Decisions:
--   - a period is a date: the Warsaw calendar day for daily tasks and the Monday of the Warsaw week for weekly ones
--     (once-tasks use the day of the tick, informationally). The app computes it at request time; the database only
--     bounds it (below). Trust-based by design (PRD Non-Goals): a user calling the API directly can claim any day
--     inside the window.
--   - the primary key (task_id, user_id, period) makes a repeated tick a 23505, which the app treats as already done.
--   - a check-off belongs to an enrolment: the composite foreign key to task_participants (task_id, user_id) cascades,
--     so leaving a task, leaving or being removed from the group (the S-03 trigger deletes the participation), and
--     deleting the task, the group or the account all erase the history. Referential checks bypass RLS, so enrolment
--     is enforced even though the policies never read the participation table.
--   - SELECT is scoped by "the task is visible to the caller" (the tasks SELECT policy applies inside the policy
--     subquery, so visibility means current group membership). INSERT also requires user_id to be the caller and the
--     period to lie between UTC today - 7 days and UTC today + 1 day (Warsaw can be a day ahead of UTC, and the Monday
--     of the current week is at most six days back). DELETE is limited to the caller's own rows (undo).
--   - Client writes are limited by column grants: INSERT of task_id, user_id, period (checked_at defaults to now());
--     no UPDATE.

-- ---------------------------------------------------------------------------
-- table
-- ---------------------------------------------------------------------------

create table public.task_checkoffs (
  task_id uuid not null,
  user_id uuid not null,
  period date not null,
  checked_at timestamptz not null default now(),
  primary key (task_id, user_id, period),
  foreign key (task_id, user_id) references public.task_participants (task_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------

-- Supabase default privileges grant everything to anon and authenticated; start from nothing and add back only what the
-- client needs. anon never touches the table; RLS would block it anyway, this is defence in depth.
revoke all on public.task_checkoffs from anon, authenticated;
grant select on public.task_checkoffs to authenticated;
grant insert (task_id, user_id, period) on public.task_checkoffs to authenticated;
grant delete on public.task_checkoffs to authenticated;

-- ---------------------------------------------------------------------------
-- row level security (anon has no policy and therefore no access)
-- ---------------------------------------------------------------------------

alter table public.task_checkoffs enable row level security;

create policy "task_checkoffs_select_visible_task" on public.task_checkoffs
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_checkoffs.task_id));

create policy "task_checkoffs_insert_self" on public.task_checkoffs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_checkoffs.task_id)
    and period between (now() at time zone 'utc')::date - 7 and (now() at time zone 'utc')::date + 1
  );

create policy "task_checkoffs_delete_self" on public.task_checkoffs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- aggregate read view
-- ---------------------------------------------------------------------------

-- One row per enrolment with its periods in ascending order, so the dashboard reads far below the PostgREST row cap
-- however long the log grows. security_invoker applies the caller's RLS to task_checkoffs: with the default (owner
-- rights) the view would show the check-offs of every group.
create view public.task_checkoff_periods
with (security_invoker = true) as
select task_id, user_id, array_agg(period order by period) as periods
from public.task_checkoffs
group by task_id, user_id;

revoke all on public.task_checkoff_periods from anon, authenticated;
grant select on public.task_checkoff_periods to authenticated;
