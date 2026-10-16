-- nickname (S-14), release 1: a mandatory nickname replaces the e-mail address as a member's name in the group.
--
-- What this adds:
--   - public.nicknames: one nickname per account, 2 to 24 code points after trimming space, tab, CR and LF, unique
--     exactly as typed across the whole app ("Kasia" and "kasia" are two different nicknames).
--   - public.set_nickname(text): the only client write path. SECURITY DEFINER, it upserts the caller's own row, so the
--     table needs no INSERT/UPDATE/DELETE policy or grant and the database settles a race between two tabs. Violations
--     surface on their own: 23505 (taken), 23514 (length or untrimmed), 42501 (anon, no EXECUTE).
--   - list_group_members gains a nickname column (left join: a member without a row stays listed with NULL, which the
--     app shows as "Unknown member").
--
-- No backfill: an account created before this release has no row and gets its nickname the next time it signs in (the
-- app sends a signed-in user without a nickname to /account/nickname). Until then other members see it as
-- "Unknown member".
--
-- service_role keeps Supabase's default privileges on nicknames (no revoke below names it), so the test harnesses insert
-- rows with the service key without an extra grant.
--
-- compat: list_group_members keeps every column the deployed code reads (user_id, email, joined_at, is_owner) and adds nickname; drop and create run in one migration; the email column is removed in a later release once the production tag points at code that reads nickname only.

-- ---------------------------------------------------------------------------
-- table
-- ---------------------------------------------------------------------------

create table public.nicknames (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now(),
  constraint nicknames_nickname_key unique (nickname),
  constraint nicknames_nickname_trimmed check (nickname = btrim(nickname, E' \t\r\n')),
  constraint nicknames_nickname_length check (char_length(nickname) between 2 and 24)
);

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------

-- Supabase default privileges grant everything to anon and authenticated; start from nothing. authenticated reads its
-- own row (RLS below); every write goes through set_nickname, deletion only through the auth.users cascade.
revoke all on public.nicknames from anon, authenticated;
grant select on public.nicknames to authenticated;

-- ---------------------------------------------------------------------------
-- row level security (anon has no policy and therefore no access)
-- ---------------------------------------------------------------------------

alter table public.nicknames enable row level security;

create policy "nicknames_select_self" on public.nicknames
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- functions
-- ---------------------------------------------------------------------------

-- Sets or changes the caller's nickname. The value is stored as given: the app trims it first, and the CHECKs reject
-- anything that is not already trimmed or has the wrong length.
create function public.set_nickname(p_nickname text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.nicknames (user_id, nickname)
  values ((select auth.uid()), p_nickname)
  on conflict (user_id) do update set nickname = excluded.nickname;
$$;

revoke execute on function public.set_nickname (text) from public, anon;
grant execute on function public.set_nickname (text) to authenticated;

-- A new column in returns table needs drop + create (create or replace cannot change the result columns). Both run in
-- this one migration, which the CLI applies in one transaction, so the deployed code never sees the function missing.
drop function public.list_group_members (uuid);

-- Rows only for a member of p_group_id (is_group_member answers for the caller); otherwise an empty set.
create function public.list_group_members(p_group_id uuid)
returns table (user_id uuid, email text, nickname text, joined_at timestamptz, is_owner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gm.user_id,
    u.email::text,
    n.nickname,
    gm.joined_at,
    g.owner_id = gm.user_id
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join auth.users u on u.id = gm.user_id
  left join public.nicknames n on n.user_id = gm.user_id
  where gm.group_id = p_group_id
    and public.is_group_member(p_group_id)
  order by (g.owner_id = gm.user_id) desc, gm.joined_at, gm.user_id;
$$;

revoke execute on function public.list_group_members (uuid) from public, anon;
grant execute on function public.list_group_members (uuid) to authenticated;
