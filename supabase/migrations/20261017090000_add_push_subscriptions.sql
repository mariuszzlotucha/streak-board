-- task-reminders (S-16): per-device Web Push subscriptions and the two secret-guarded functions the 20:00 cron calls.
--
-- What this adds:
--   - public.push_subscriptions: one row per browser/device that opted in (endpoint and its two keys), owned by the
--     user. The caller reads only their own rows; every write goes through the definer functions below.
--   - subscribe_push / unsubscribe_push / unsubscribe_all_push: client functions on auth.uid() for authenticated. A
--     re-subscribe of an endpoint another account registered on the same device moves the row to the caller.
--   - public.reminder_secret: a one-row config table holding sha256 of the cron's shared secret (the owner generates it
--     with `openssl rand -base64 32` and inserts the digest in the SQL Editor). No API role holds any privilege on it.
--   - due_reminders(p_secret, p_today, p_week) and prune_push_subscriptions(p_secret, p_endpoints): definer functions
--     executable by anon only (the cron calls them with the anon key), each refusing a wrong or short secret with 42501.
--     SQL never computes Warsaw dates: the cron passes the daily period as p_today and the weekly period (the Monday)
--     as p_week, which is null except on Sunday.
--
-- Account deletion: push_subscriptions.user_id cascades with auth.users, so delete_own_account / delete_account
-- (20261016180000_account_deletion_and_ownership_transfer.sql) remove a deleted account's subscriptions together with
-- the nickname, membership, participation and check-offs named in that migration's cascade list.
--
-- Additive only: new tables and functions, nothing the deployed code reads changes.

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%')
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- Start from nothing (Supabase default privileges grant everything to anon and authenticated); authenticated reads its
-- own rows (RLS below). service_role keeps its defaults, so the test harness can read and seed rows.
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_self" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reminder_secret (one row, no API access)
-- ---------------------------------------------------------------------------

create table public.reminder_secret (
  id boolean primary key default true check (id),
  hash bytea not null
);

revoke all on public.reminder_secret from public, anon, authenticated;

-- RLS on with no policy: even a future grant to an API role would read nothing.
alter table public.reminder_secret enable row level security;

-- ---------------------------------------------------------------------------
-- client functions (authenticated, on auth.uid())
-- ---------------------------------------------------------------------------

create function public.subscribe_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;

revoke execute on function public.subscribe_push (text, text, text) from public, anon;
grant execute on function public.subscribe_push (text, text, text) to authenticated;

create function public.unsubscribe_push(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke execute on function public.unsubscribe_push (text) from public, anon;
grant execute on function public.unsubscribe_push (text) to authenticated;

create function public.unsubscribe_all_push()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where user_id = (select auth.uid());
$$;

revoke execute on function public.unsubscribe_all_push () from public, anon;
grant execute on function public.unsubscribe_all_push () to authenticated;

-- ---------------------------------------------------------------------------
-- cron functions (anon, guarded by the shared secret)
-- ---------------------------------------------------------------------------

-- Raises 42501 unless p_secret is at least 32 characters and its sha256 matches the stored digest (no row: no match).
create function public.check_reminder_secret(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_secret is null or char_length(p_secret) < 32 or not exists (
    select 1 from public.reminder_secret s where s.hash = pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8'))
  ) then
    raise exception 'invalid reminder secret' using errcode = '42501';
  end if;
end;
$$;

-- Internal: only the two definer functions below call it.
revoke execute on function public.check_reminder_secret (text) from public, anon, authenticated;

-- One row per subscription of a user with at least one joined task whose current period has no check-off of theirs:
-- daily against p_today, weekly against p_week when it is not null. once tasks never remind.
create function public.due_reminders(p_secret text, p_today date, p_week date)
returns table (endpoint text, p256dh text, auth text, task_names text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.check_reminder_secret(p_secret);
  return query
    with due as (
      select tp.user_id, array_agg(t.title order by t.title, t.id) as names
      from public.task_participants tp
      join public.tasks t on t.id = tp.task_id
      where (t.recurrence = 'daily' and not exists (
               select 1 from public.task_checkoffs c
               where c.task_id = tp.task_id and c.user_id = tp.user_id and c.period = p_today))
         or (t.recurrence = 'weekly' and p_week is not null and not exists (
               select 1 from public.task_checkoffs c
               where c.task_id = tp.task_id and c.user_id = tp.user_id and c.period = p_week))
      group by tp.user_id
    )
    select s.endpoint, s.p256dh, s.auth, due.names
    from public.push_subscriptions s
    join due on due.user_id = s.user_id
    order by s.created_at, s.endpoint;
end;
$$;

revoke execute on function public.due_reminders (text, date, date) from public, authenticated;
grant execute on function public.due_reminders (text, date, date) to anon;

-- Deletes the subscriptions the push service reported as gone (404/410).
create function public.prune_push_subscriptions(p_secret text, p_endpoints text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_reminder_secret(p_secret);
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;

revoke execute on function public.prune_push_subscriptions (text, text[]) from public, authenticated;
grant execute on function public.prune_push_subscriptions (text, text[]) to anon;
