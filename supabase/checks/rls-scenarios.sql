-- RLS scenario checks for groups / group_members / tasks / task_participants (F-01 + group-rls-hardening + S-01 helper functions + S-02 tasks + S-03 participation).
--
-- Run against the LOCAL Supabase database only:
--   docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql
--
-- Every assertion prints a PASS line. A failed assertion raises an exception, psql stops (exit code 3) and the
-- transaction is never committed. A successful run ends with ROLLBACK, so the database is left untouched.
-- Expected errors must match a specific SQLSTATE: a different error, or no error at all, is a FAIL.
--
-- This file lives in supabase/checks/, not supabase/tests/, so `supabase test db` does not pick it up as pgTAP.

\set QUIET on
\set VERBOSITY terse

begin;

-- ---------------------------------------------------------------------------
-- helpers (throwaway schema, rolled back together with everything else)
-- ---------------------------------------------------------------------------

create schema rls_check;
grant usage on schema rls_check to public;

create table rls_check.results (label text not null);
grant all on rls_check.results to public;

-- Fresh user with no group; call as postgres. Every scenario builds its own users, so each one starts from a clean state.
create function rls_check.mk_user() returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_id, v_id::text || '@rls-check.invalid');
  return v_id;
end;
$$;

create function rls_check.as_user(p_uid uuid) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

create function rls_check.as_anon() returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end;
$$;

create function rls_check.as_postgres() returns void
language plpgsql
as $$
begin
  reset role;
end;
$$;

-- Runs in the caller's role. Creates a group owned by p_owner (the client contract: only name and owner_id).
create function rls_check.new_group(p_owner uuid) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.groups (owner_id, name) values (p_owner, 'rls-check group') returning id into v_id;
  return v_id;
end;
$$;

create function rls_check.code_of(p_group uuid) returns text
language plpgsql
as $$
declare
  v_code text;
begin
  select join_code into v_code from public.groups where id = p_group;
  return v_code;
end;
$$;

-- The statement must fail with exactly this SQLSTATE.
create function rls_check.expect_error(p_state text, p_sql text, p_label text) returns void
language plpgsql
as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> p_state then
        raise exception 'FAIL: % -- expected SQLSTATE %, got % (%)', p_label, p_state, v_state, sqlerrm;
      end if;
      insert into rls_check.results values (p_label);
      raise notice 'PASS: % (SQLSTATE %)', p_label, p_state;
      return;
  end;
  raise exception 'FAIL: % -- expected SQLSTATE %, but the statement succeeded', p_label, p_state;
end;
$$;

-- The statement (INSERT/UPDATE/DELETE) must affect exactly p_expected rows.
create function rls_check.expect_rows(p_sql text, p_expected bigint, p_label text) returns void
language plpgsql
as $$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows <> p_expected then
    raise exception 'FAIL: % -- expected % row(s), got %', p_label, p_expected, v_rows;
  end if;
  insert into rls_check.results values (p_label);
  raise notice 'PASS: % (% row(s))', p_label, v_rows;
end;
$$;

-- The query must return exactly one value, equal (as text) to p_expected.
create function rls_check.expect_value(p_sql text, p_expected text, p_label text) returns void
language plpgsql
as $$
declare
  v_value text;
begin
  execute p_sql into v_value;
  if v_value is distinct from p_expected then
    raise exception 'FAIL: % -- expected %, got %', p_label, p_expected, coalesce(v_value, 'NULL');
  end if;
  insert into rls_check.results values (p_label);
  raise notice 'PASS: % (= %)', p_label, p_expected;
end;
$$;

-- ---------------------------------------------------------------------------
-- F-01: visibility isolation, owner auto-join, INSERT ... RETURNING, one group per user
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; b uuid; ga uuid; gb uuid;
begin
  a := rls_check.mk_user(); b := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);  -- INSERT ... RETURNING under RLS + column grants
  perform rls_check.expect_value(format('select count(*) from public.groups where id = %L', ga), '1', 'F-01 INSERT ... RETURNING on groups works for the owner');
  perform rls_check.expect_value(format('select count(*) from public.group_members where group_id = %L and user_id = %L', ga, a), '1', 'F-01 owner is auto-added to group_members');

  perform rls_check.as_user(b);
  gb := rls_check.new_group(b);
  perform rls_check.expect_value(format('select count(*) from public.groups where id = %L', ga), '0', 'F-01 user B cannot see group A');
  perform rls_check.expect_value(format('select count(*) from public.group_members where group_id = %L', ga), '0', 'F-01 user B cannot see members of group A');

  perform rls_check.as_user(a);
  perform rls_check.expect_value(format('select count(*) from public.groups where id = %L', gb), '0', 'F-01 user A cannot see group B');

  -- A already has a group: the only possible cause of the rejection is UNIQUE(group_members.user_id) via the trigger.
  perform rls_check.expect_error('23505', format('insert into public.groups (owner_id, name) values (%L, %L)', a, 'second'), 'F-01 a user cannot own a second group');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- #1 / #4: joining goes only through join_group(); no direct INSERT into group_members
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; b uuid; c uuid; d uuid; ga uuid; gb uuid; code_a text;
begin
  a := rls_check.mk_user(); b := rls_check.mk_user(); c := rls_check.mk_user(); d := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(b);
  gb := rls_check.new_group(b);

  -- C has no group, so a rejection can only come from RLS (no INSERT policy), not from UNIQUE(user_id).
  perform rls_check.as_user(c);
  perform rls_check.expect_error('42501', format('insert into public.group_members (group_id, user_id) values (%L, %L)', ga, c), '#1 direct INSERT into group_members is denied (knowing only the group id)');
  perform rls_check.expect_error('42501', format('insert into public.group_members (group_id, user_id) values (%L, %L) returning id', ga, c), '#4 direct INSERT ... RETURNING into group_members is denied by RLS');

  perform rls_check.expect_error('P0002', $q$select public.join_group('not-a-code')$q$, '#1 join_group with a wrong code -> P0002');
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, '#1 join_group with the right code returns the group id');
  perform rls_check.expect_value(format('select count(*) from public.groups where id = %L', ga), '1', '#1 after joining, the member sees the group');
  perform rls_check.expect_value(format('select count(*) from public.group_members where group_id = %L', ga), '2', '#1 after joining, the member sees both members');
  perform rls_check.expect_error('23505', format('select public.join_group(%L)', code_a), '#1 joining the same group again -> 23505');

  -- B already owns group B: joining another group violates one-group-per-user.
  perform rls_check.as_user(b);
  perform rls_check.expect_error('23505', format('select public.join_group(%L)', code_a), '#1 a user who already belongs to another group cannot join -> 23505');

  perform rls_check.as_user(d);
  perform rls_check.expect_error('P0002', $q$select public.join_group('')$q$, '#1 join_group with an empty code -> P0002');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- #2: the owner cannot delete their own membership; the owner can remove others
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; c uuid; ga uuid; code_a text;
begin
  a := rls_check.mk_user(); c := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(c);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, '#2 setup: C joined group A');

  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('delete from public.group_members where user_id = %L', a), 0, '#2 the owner cannot delete their own membership');
  perform rls_check.expect_value(format('select count(*) from public.group_members where group_id = %L and user_id = %L', ga, a), '1', '#2 the owner is still a member afterwards');
  perform rls_check.expect_rows(format('delete from public.group_members where user_id = %L', c), 1, '#2 the owner can remove another member');
  perform rls_check.expect_value(format('select count(*) from public.group_members where group_id = %L', ga), '1', '#2 only the owner remains in the group');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- #3: a regular member can leave; nobody else can remove other members' rows
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; b uuid; c uuid; e uuid; f uuid; ga uuid; gb uuid; code_a text; code_b text;
begin
  a := rls_check.mk_user(); b := rls_check.mk_user(); c := rls_check.mk_user(); e := rls_check.mk_user(); f := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(b);
  gb := rls_check.new_group(b);
  code_b := rls_check.code_of(gb);
  perform rls_check.as_user(c);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, '#3 setup: C joined group A');
  perform rls_check.as_user(e);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, '#3 setup: E joined group A');

  -- A member cannot touch other people's rows (owner's or a fellow member's).
  perform rls_check.as_user(c);
  perform rls_check.expect_rows(format('delete from public.group_members where user_id = %L', a), 0, '#3 a member cannot remove the owner');
  perform rls_check.expect_rows(format('delete from public.group_members where user_id = %L', e), 0, '#3 a member cannot remove another member');
  perform rls_check.expect_rows(format('delete from public.groups where id = %L', ga), 0, '#3 a member cannot delete the group');

  -- A non-member cannot remove anybody.
  perform rls_check.as_user(f);
  perform rls_check.expect_rows(format('delete from public.group_members where group_id = %L', ga), 0, '#3 a non-member cannot remove anybody');

  -- Members cannot move themselves between groups by UPDATE (no UPDATE policy on group_members).
  perform rls_check.as_user(c);
  perform rls_check.expect_rows(format('update public.group_members set group_id = %L where user_id = %L', gb, c), 0, '#3 group_members has no UPDATE path (default deny)');

  -- Self-leave, then the group is invisible and the user is free to join another group.
  perform rls_check.expect_rows(format('delete from public.group_members where user_id = %L', c), 1, '#3 a member can leave the group (delete own row)');
  perform rls_check.expect_value(format('select count(*) from public.groups where id = %L', ga), '0', '#3 after leaving, the group is no longer visible');
  perform rls_check.expect_value(format('select public.join_group(%L)', code_b), gb::text, '#3 after leaving, the user can join another group');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- #5: no membership oracle
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; d uuid; ga uuid;
begin
  a := rls_check.mk_user(); d := rls_check.mk_user();

  perform rls_check.expect_value($q$select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'is_group_member' and pronargs = 2$q$, '0', '#5 the two-argument is_group_member no longer exists');

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  perform rls_check.expect_value(format('select public.is_group_member(%L)', ga), 'true', '#5 is_group_member(group) is true for a member');

  perform rls_check.as_user(d);
  perform rls_check.expect_value(format('select public.is_group_member(%L)', ga), 'false', '#5 is_group_member(group) is false for a non-member');
  perform rls_check.expect_error('42883', format('select public.is_group_member(%L, %L)', ga, a), '#5 asking about another user''s membership is impossible (no such function)');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- #6: policies use (select auth.uid()) (initplan), never a bare auth.uid()
-- ---------------------------------------------------------------------------

do $$
begin
  perform rls_check.expect_value(
    $q$select count(*) from pg_policies
       where schemaname = 'public' and tablename in ('groups', 'group_members', 'tasks', 'task_participants')
         and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)'$q$,
    '0', '#6 no policy uses a bare auth.uid()');
  perform rls_check.expect_value(
    $q$select (count(*) > 0)::text from pg_policies
       where schemaname = 'public' and tablename in ('groups', 'group_members', 'tasks', 'task_participants')
         and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '\( SELECT auth\.uid\(\) AS uid\)'$q$,
    'true', '#6 policies do use (select auth.uid())');
end;
$$;

-- ---------------------------------------------------------------------------
-- #7: name validation, 12-character join code
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; b uuid; ga uuid;
begin
  a := rls_check.mk_user(); b := rls_check.mk_user();

  -- A has no group yet, so a rejection can only come from the CHECK constraint.
  perform rls_check.as_user(a);
  perform rls_check.expect_error('23514', format('insert into public.groups (owner_id, name) values (%L, %L)', a, ''), '#7 an empty name is rejected');
  perform rls_check.expect_error('23514', format('insert into public.groups (owner_id, name) values (%L, %L)', a, '   '), '#7 a name of spaces is rejected');
  perform rls_check.expect_error('23514', format('insert into public.groups (owner_id, name) values (%L, %L)', a, E'\t\n'), '#7 a name of tabs/newlines is rejected');
  perform rls_check.expect_error('23514', format('insert into public.groups (owner_id, name) values (%L, %L)', a, repeat('x', 81)), '#7 a name longer than 80 characters is rejected');
  perform rls_check.expect_rows(format('insert into public.groups (owner_id, name) values (%L, %L)', a, repeat('x', 80)), 1, '#7 a name of exactly 80 characters is accepted');

  perform rls_check.as_user(b);
  ga := rls_check.new_group(b);
  perform rls_check.expect_value(format('select length(join_code)::text from public.groups where id = %L', ga), '12', '#7 a new group gets a 12-character join_code');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- #8: column-level privileges on groups; only the owner edits the name
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; b uuid; c uuid; ga uuid;
begin
  a := rls_check.mk_user(); b := rls_check.mk_user(); c := rls_check.mk_user();

  -- Clean user (no group) for the INSERT column checks: the rejection can only come from the column grants.
  perform rls_check.as_user(c);
  perform rls_check.expect_error('42501', format('insert into public.groups (owner_id, name, join_code) values (%L, %L, %L)', c, 'x', 'aaaaaaaaaaaa'), '#8 INSERT with a custom join_code is denied');
  perform rls_check.expect_error('42501', format('insert into public.groups (id, owner_id, name) values (gen_random_uuid(), %L, %L)', c, 'x'), '#8 INSERT with an explicit id is denied');

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  perform rls_check.expect_error('42501', format('update public.groups set join_code = %L where id = %L', 'aaaaaaaaaaaa', ga), '#8 UPDATE of join_code is denied');
  perform rls_check.expect_error('42501', format('update public.groups set id = gen_random_uuid() where id = %L', ga), '#8 UPDATE of id is denied');
  perform rls_check.expect_error('42501', format('update public.groups set owner_id = %L where id = %L', b, ga), '#8 UPDATE of owner_id is denied (no ownership transfer)');
  perform rls_check.expect_error('23514', format('update public.groups set name = %L where id = %L', '', ga), '#8 UPDATE name to empty is rejected by the CHECK');
  perform rls_check.expect_rows(format('update public.groups set name = %L where id = %L', 'renamed', ga), 1, '#8 the owner can update name');

  perform rls_check.as_user(b);
  perform rls_check.expect_rows(format('update public.groups set name = %L where id = %L', 'hijacked', ga), 0, '#8 a non-owner cannot update name');
  perform rls_check.expect_rows(format('delete from public.groups where id = %L', ga), 0, '#8 a non-owner cannot delete the group');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- anon, and deleting a group (cascade bypasses RLS)
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; c uuid; ga uuid; code_a text;
begin
  a := rls_check.mk_user(); c := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(c);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, 'cascade setup: C joined group A');

  perform rls_check.as_anon();
  perform rls_check.expect_error('42501', format('select public.join_group(%L)', code_a), 'anon cannot call join_group');
  perform rls_check.expect_error('42501', format('select public.is_group_member(%L)', ga), 'anon cannot call is_group_member');
  perform rls_check.expect_value('select count(*) from public.groups', '0', 'anon sees no groups');
  perform rls_check.expect_error('42501', format('insert into public.groups (owner_id, name) values (%L, %L)', a, 'x'), 'anon cannot insert groups');

  -- The owner deletes the group; the cascade removes every membership even though the owner's own row has no DELETE policy.
  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('delete from public.groups where id = %L', ga), 1, 'the owner can delete the group');
  perform rls_check.as_postgres();
  perform rls_check.expect_value(format('select count(*) from public.group_members where group_id = %L', ga), '0', 'deleting the group cascades to all memberships');

  perform rls_check.as_user(a);
  perform rls_check.new_group(a);
  perform rls_check.expect_value(format('select count(*) from public.group_members where user_id = %L', a), '1', 'after deleting the group, the owner can create a new one');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- S-01: list_group_members (member-only, emails, owner flag)
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; c uuid; ga uuid; code_a text;
begin
  a := rls_check.mk_user(); c := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(c);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, 'S-01 members setup: C joined group A');

  -- Everything in this file shares one transaction, so both joined_at values are equal. Move the owner's an hour later so
  -- the owner-first ordering is the only thing that can put the owner ahead of C.
  perform rls_check.as_postgres();
  update public.group_members set joined_at = joined_at + interval '1 hour' where user_id = a;

  -- The owner sees both members: owner first, correct is_owner flags, emails present.
  perform rls_check.as_user(a);
  perform rls_check.expect_value(format('select count(*) from public.list_group_members(%L)', ga), '2', 'S-01 the owner sees both members');
  perform rls_check.expect_value(format('select string_agg(user_id::text, %L) from public.list_group_members(%L)', ',', ga), a::text || ',' || c::text, 'S-01 the owner is listed first, then members by joined_at');
  perform rls_check.expect_value(format('select is_owner::text from public.list_group_members(%L) where user_id = %L', ga, a), 'true', 'S-01 is_owner is true for the owner');
  perform rls_check.expect_value(format('select is_owner::text from public.list_group_members(%L) where user_id = %L', ga, c), 'false', 'S-01 is_owner is false for a member');
  perform rls_check.expect_value(format('select count(*) from public.list_group_members(%L) where email is not null', ga), '2', 'S-01 every listed member has an email');
  perform rls_check.expect_value(format('select email from public.list_group_members(%L) where user_id = %L', ga, c), c::text || '@rls-check.invalid', 'S-01 the email comes from auth.users');

  -- A regular member sees the same list.
  perform rls_check.as_user(c);
  perform rls_check.expect_value(format('select count(*) from public.list_group_members(%L)', ga), '2', 'S-01 a member sees both members');

  perform rls_check.as_postgres();
end;
$$;

do $$
declare
  a uuid; d uuid; ga uuid;
begin
  a := rls_check.mk_user(); d := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);

  -- D belongs to no group at all, so the only possible cause of an empty list is that D is not a member of A's group.
  perform rls_check.as_user(d);
  perform rls_check.expect_value(format('select count(*) from public.list_group_members(%L)', ga), '0', 'S-01 a non-member gets no members');

  perform rls_check.as_postgres();
end;
$$;

do $$
declare
  a uuid; b uuid; ga uuid; gb uuid;
begin
  a := rls_check.mk_user(); b := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  perform rls_check.as_user(b);
  gb := rls_check.new_group(b);

  -- B is a member of another group: still nothing for group A, and B's own group is listed normally.
  perform rls_check.expect_value(format('select count(*) from public.list_group_members(%L)', ga), '0', 'S-01 a member of another group gets no members of this group');
  perform rls_check.expect_value(format('select count(*) from public.list_group_members(%L)', gb), '1', 'S-01 a member still sees their own group');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- S-01: preview_group (name by exact code, NULL otherwise) and anon denial on both functions
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; d uuid; ga uuid; code_a text;
begin
  a := rls_check.mk_user(); d := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);

  -- D is not in the group and cannot read it directly; the preview is the only path to the name.
  perform rls_check.as_user(d);
  perform rls_check.expect_value(format('select count(*) from public.groups where id = %L', ga), '0', 'S-01 setup: a non-member cannot read the group directly');
  perform rls_check.expect_value(format('select public.preview_group(%L)', code_a), 'rls-check group', 'S-01 preview_group returns the name for the right code');
  perform rls_check.expect_value($q$select public.preview_group('ffffffffffff')$q$, null, 'S-01 preview_group returns NULL for an unknown code');
  perform rls_check.expect_value($q$select public.preview_group('')$q$, null, 'S-01 preview_group returns NULL for an empty code');

  perform rls_check.as_anon();
  perform rls_check.expect_error('42501', format('select public.preview_group(%L)', code_a), 'S-01 anon cannot call preview_group');
  perform rls_check.expect_error('42501', format('select * from public.list_group_members(%L)', ga), 'S-01 anon cannot call list_group_members');

  -- After the group is deleted its code previews as NULL.
  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('delete from public.groups where id = %L', ga), 1, 'S-01 setup: the owner deleted the group');
  perform rls_check.as_user(d);
  perform rls_check.expect_value(format('select public.preview_group(%L)', code_a), null, 'S-01 preview_group returns NULL after the group is deleted');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- S-02: tasks (member read, creator-only manage, grants, CHECKs, cascades)
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; m uuid; x uuid; b uuid; ga uuid; gb uuid; code_a text; t uuid; tb uuid;
begin
  a := rls_check.mk_user(); m := rls_check.mk_user(); x := rls_check.mk_user(); b := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(m);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, 'S-02 setup: M joined group A');
  perform rls_check.as_user(b);
  gb := rls_check.new_group(b);

  -- A member creates a task; the client only sends group_id, created_by, title, recurrence.
  perform rls_check.as_user(m);
  perform rls_check.expect_rows(format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, m, 'Water the plants', 'daily'), 1, 'S-02 a member can create a task in their group');
  select id into t from public.tasks where group_id = ga;

  -- Reads: members yes, outsiders and anon no.
  perform rls_check.as_user(a);
  perform rls_check.expect_value(format('select count(*) from public.tasks where group_id = %L', ga), '1', 'S-02 another member reads the group''s task');
  perform rls_check.as_user(b);
  perform rls_check.expect_value(format('select count(*) from public.tasks where group_id = %L', ga), '0', 'S-02 a member of another group sees no task of this group');
  perform rls_check.as_user(x);
  perform rls_check.expect_value(format('select count(*) from public.tasks where group_id = %L', ga), '0', 'S-02 a user without a group sees no task');
  perform rls_check.as_anon();
  perform rls_check.expect_error('42501', 'select count(*) from public.tasks', 'S-02 anon has no privileges on tasks');

  -- Inserts: non-member and foreign created_by are denied, anon too.
  perform rls_check.as_user(b);
  perform rls_check.expect_error('42501', format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, b, 'Intruder', 'once'), 'S-02 a non-member cannot create a task in the group');
  perform rls_check.as_user(x);
  perform rls_check.expect_error('42501', format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, x, 'Intruder', 'once'), 'S-02 a user without a group cannot create a task');
  perform rls_check.as_user(a);
  perform rls_check.expect_error('42501', format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, m, 'Forged', 'once'), 'S-02 a task cannot be created in another user''s name');
  perform rls_check.as_anon();
  perform rls_check.expect_error('42501', format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, a, 'Anon', 'once'), 'S-02 anon cannot create a task');

  -- Update / delete: only the creator; everyone else affects 0 rows.
  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('update public.tasks set title = %L where id = %L', 'Hijacked', t), 0, 'S-02 a non-creator member (even the group owner) cannot retitle');
  perform rls_check.expect_rows(format('delete from public.tasks where id = %L', t), 0, 'S-02 a non-creator member (even the group owner) cannot delete');
  perform rls_check.as_user(x);
  perform rls_check.expect_rows(format('update public.tasks set title = %L where id = %L', 'Hijacked', t), 0, 'S-02 an outsider cannot retitle');
  perform rls_check.expect_rows(format('delete from public.tasks where id = %L', t), 0, 'S-02 an outsider cannot delete');

  -- Grants: only title is updatable; CHECKs hold.
  perform rls_check.as_user(m);
  perform rls_check.expect_error('42501', format('update public.tasks set recurrence = %L where id = %L', 'weekly', t), 'S-02 UPDATE of recurrence is denied');
  perform rls_check.expect_error('42501', format('update public.tasks set group_id = %L where id = %L', gb, t), 'S-02 UPDATE of group_id is denied');
  perform rls_check.expect_error('42501', format('update public.tasks set created_by = %L where id = %L', a, t), 'S-02 UPDATE of created_by is denied');
  perform rls_check.expect_error('42501', format('update public.tasks set id = gen_random_uuid() where id = %L', t), 'S-02 UPDATE of id is denied');
  perform rls_check.expect_error('23514', format('update public.tasks set title = %L where id = %L', '', t), 'S-02 UPDATE title to empty is rejected by the CHECK');
  perform rls_check.expect_error('23514', format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, m, repeat('x', 81), 'once'), 'S-02 a title longer than 80 characters is rejected');
  perform rls_check.expect_error('23514', format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, m, E'\t\n ', 'once'), 'S-02 a whitespace-only title is rejected');
  perform rls_check.expect_error('23514', format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, m, 'Ok', 'monthly'), 'S-02 a recurrence outside once/daily/weekly is rejected');
  perform rls_check.expect_rows(format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, m, repeat('x', 80), 'weekly'), 1, 'S-02 an 80-character title with recurrence weekly is accepted');

  -- The creator retitles and deletes.
  perform rls_check.expect_rows(format('update public.tasks set title = %L where id = %L', 'Renamed', t), 1, 'S-02 the creator can retitle');
  perform rls_check.expect_rows(format('delete from public.tasks where id = %L', t), 1, 'S-02 the creator can delete');

  -- A creator who is no longer a member manages nothing (policies check current membership).
  perform rls_check.expect_rows(format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, m, 'Left behind', 'once'), 1, 'S-02 setup: M created another task');
  perform rls_check.as_postgres();
  select id into t from public.tasks where group_id = ga and title = 'Left behind';
  delete from public.group_members where user_id = m;
  perform rls_check.as_user(m);
  perform rls_check.expect_rows(format('update public.tasks set title = %L where id = %L', 'Sneaky', t), 0, 'S-02 a creator who left the group cannot retitle');
  perform rls_check.expect_rows(format('delete from public.tasks where id = %L', t), 0, 'S-02 a creator who left the group cannot delete');
  perform rls_check.as_user(a);
  perform rls_check.expect_value(format('select count(*) from public.tasks where id = %L', t), '1', 'S-02 the task stays visible to the group after its creator left');

  -- Cascade on user delete (M is not a group owner, so the owner_id restrict does not apply).
  perform rls_check.as_user(b);
  perform rls_check.expect_rows(format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', gb, b, 'B task', 'once'), 1, 'S-02 setup: B created a task in group B');
  perform rls_check.as_postgres();
  select id into tb from public.tasks where group_id = gb;
  delete from public.groups where id = gb;
  perform rls_check.expect_value(format('select count(*) from public.tasks where id = %L', tb), '0', 'S-02 deleting the group cascades to its tasks');
  perform rls_check.expect_value(format('select count(*) from public.tasks where id = %L', t), '1', 'S-02 setup: the orphaned task still exists before its creator is deleted');
  delete from auth.users where id = m;
  perform rls_check.expect_value(format('select count(*) from public.tasks where id = %L', t), '0', 'S-02 deleting the creator''s account cascades to their tasks');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- S-03: task_participants (creator auto-enrolment, join / leave, visibility, grants)
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid; c uuid; m uuid; b uuid; x uuid; ga uuid; gb uuid; code_a text; t uuid; tb uuid;
begin
  a := rls_check.mk_user(); c := rls_check.mk_user(); m := rls_check.mk_user(); b := rls_check.mk_user(); x := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(c);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, 'S-03 setup: C joined group A');
  perform rls_check.as_user(m);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, 'S-03 setup: M joined group A');
  perform rls_check.as_user(b);
  gb := rls_check.new_group(b);

  -- The creator is enrolled by the trigger on the plain client insert (no participant row is sent).
  perform rls_check.as_user(c);
  perform rls_check.expect_rows(format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, c, 'Water the plants', 'daily'), 1, 'S-03 setup: C created a task');
  select id into t from public.tasks where group_id = ga;
  perform rls_check.expect_value(format('select string_agg(user_id::text, %L) from public.task_participants where task_id = %L', ',', t), c::text, 'S-03 the creator is auto-enrolled on task insert');

  -- A member joins another member's task; duplicates and forged user_id are rejected.
  perform rls_check.as_user(m);
  perform rls_check.expect_rows(format('insert into public.task_participants (task_id, user_id) values (%L, %L)', t, m), 1, 'S-03 a member joins another member''s task');
  perform rls_check.expect_error('23505', format('insert into public.task_participants (task_id, user_id) values (%L, %L)', t, m), 'S-03 joining the same task twice -> 23505');
  perform rls_check.expect_error('42501', format('insert into public.task_participants (task_id, user_id) values (%L, %L)', t, a), 'S-03 a member cannot enrol another user');
  perform rls_check.expect_error('42501', format('insert into public.task_participants (task_id, user_id, joined_at) values (%L, %L, now())', t, a), 'S-03 joined_at cannot be sent (column grant)');

  -- Reads: every member sees all participants of the group's tasks; outsiders and anon see nothing.
  perform rls_check.expect_value(format('select count(*) from public.task_participants where task_id = %L', t), '2', 'S-03 a member reads all participants of the task');
  perform rls_check.as_user(a);
  perform rls_check.expect_value(format('select count(*) from public.task_participants where task_id = %L', t), '2', 'S-03 the group owner reads all participants of the task');
  perform rls_check.as_user(b);
  perform rls_check.expect_value(format('select count(*) from public.task_participants where task_id = %L', t), '0', 'S-03 a member of another group sees no participants');
  perform rls_check.expect_error('42501', format('insert into public.task_participants (task_id, user_id) values (%L, %L)', t, b), 'S-03 a member of another group cannot join the task');
  perform rls_check.as_user(x);
  perform rls_check.expect_value(format('select count(*) from public.task_participants where task_id = %L', t), '0', 'S-03 a user without a group sees no participants');
  perform rls_check.expect_error('42501', format('insert into public.task_participants (task_id, user_id) values (%L, %L)', t, x), 'S-03 a user without a group cannot join the task');
  perform rls_check.as_anon();
  perform rls_check.expect_error('42501', 'select count(*) from public.task_participants', 'S-03 anon cannot read participants');
  perform rls_check.expect_error('42501', format('insert into public.task_participants (task_id, user_id) values (%L, %L)', t, a), 'S-03 anon cannot join a task');

  -- Leave: only the caller's own row; someone else's row is untouched (0 rows).
  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('delete from public.task_participants where task_id = %L and user_id = %L', t, m), 0, 'S-03 a member cannot remove another user''s participation (even the group owner)');
  perform rls_check.as_user(b);
  perform rls_check.expect_rows(format('delete from public.task_participants where task_id = %L', t), 0, 'S-03 an outsider cannot remove participants');
  perform rls_check.as_user(m);
  perform rls_check.expect_rows(format('delete from public.task_participants where task_id = %L and user_id = %L', t, c), 0, 'S-03 M cannot remove the creator''s participation');
  perform rls_check.expect_rows(format('delete from public.task_participants where task_id = %L', t), 1, 'S-03 a member leaves the task (deletes only the own row)');
  perform rls_check.expect_value(format('select string_agg(user_id::text, %L) from public.task_participants where task_id = %L', ',', t), c::text, 'S-03 the creator is still enrolled after M left');
  perform rls_check.as_user(c);
  perform rls_check.expect_rows(format('delete from public.task_participants where task_id = %L and user_id = %L', t, c), 1, 'S-03 the creator can leave their own task');
  perform rls_check.expect_value(format('select count(*) from public.tasks where id = %L', t), '1', 'S-03 the task remains after the creator left it');

  -- Grants: no UPDATE, no TRUNCATE.
  perform rls_check.as_user(m);
  perform rls_check.expect_rows(format('insert into public.task_participants (task_id, user_id) values (%L, %L)', t, m), 1, 'S-03 setup: M joined again');
  perform rls_check.expect_error('42501', format('update public.task_participants set user_id = %L where task_id = %L', a, t), 'S-03 UPDATE of user_id is denied');
  perform rls_check.expect_error('42501', format('update public.task_participants set joined_at = now() where task_id = %L', t), 'S-03 UPDATE of joined_at is denied');
  perform rls_check.expect_error('42501', 'truncate public.task_participants', 'S-03 TRUNCATE is denied');

  -- Deleting a task cascades to its participants.
  perform rls_check.as_user(c);
  perform rls_check.expect_rows(format('delete from public.tasks where id = %L', t), 1, 'S-03 the creator deletes the task');
  perform rls_check.as_postgres();
  perform rls_check.expect_value(format('select count(*) from public.task_participants where task_id = %L', t), '0', 'S-03 deleting a task cascades to its participants');

  perform rls_check.as_postgres();
end;
$$;

-- Leaving the group and being removed by the owner both clear the user's participation in that group's tasks only.
do $$
declare
  a uuid; c uuid; m uuid; ga uuid; code_a text; t uuid; t2 uuid;
begin
  a := rls_check.mk_user(); c := rls_check.mk_user(); m := rls_check.mk_user();

  perform rls_check.as_user(a);
  ga := rls_check.new_group(a);
  code_a := rls_check.code_of(ga);
  perform rls_check.as_user(c);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, 'S-03 cleanup setup: C joined group A');
  perform rls_check.as_user(m);
  perform rls_check.expect_value(format('select public.join_group(%L)', code_a), ga::text, 'S-03 cleanup setup: M joined group A');

  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, a, 'Task one', 'once'), 1, 'S-03 cleanup setup: A created task one');
  select id into t from public.tasks where group_id = ga and title = 'Task one';
  perform rls_check.expect_rows(format('insert into public.tasks (group_id, created_by, title, recurrence) values (%L, %L, %L, %L)', ga, a, 'Task two', 'once'), 1, 'S-03 cleanup setup: A created task two');
  select id into t2 from public.tasks where group_id = ga and title = 'Task two';

  perform rls_check.as_user(c);
  perform rls_check.expect_rows(format('insert into public.task_participants (task_id, user_id) select id, %L from public.tasks where group_id = %L', c, ga), 2, 'S-03 cleanup setup: C joined both tasks');
  perform rls_check.as_user(m);
  perform rls_check.expect_rows(format('insert into public.task_participants (task_id, user_id) select id, %L from public.tasks where group_id = %L', m, ga), 2, 'S-03 cleanup setup: M joined both tasks');

  -- C leaves the group on their own.
  perform rls_check.as_user(c);
  perform rls_check.expect_rows(format('delete from public.group_members where user_id = %L', c), 1, 'S-03 C leaves the group');
  perform rls_check.as_postgres();
  perform rls_check.expect_value(format('select count(*) from public.task_participants where user_id = %L', c), '0', 'S-03 leaving the group clears the user''s task participation');
  perform rls_check.expect_value(format('select count(*) from public.task_participants where user_id = %L', m), '2', 'S-03 other members'' participation is untouched by C leaving');
  perform rls_check.expect_value(format('select count(*) from public.task_participants where user_id = %L', a), '2', 'S-03 the creator''s participation is untouched by C leaving');

  -- The owner removes M.
  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('delete from public.group_members where user_id = %L', m), 1, 'S-03 the owner removes M');
  perform rls_check.as_postgres();
  perform rls_check.expect_value(format('select count(*) from public.task_participants where user_id = %L', m), '0', 'S-03 being removed by the owner clears the user''s task participation');

  -- Deleting the group cascades tasks and participants; the group_members cleanup trigger tolerates it.
  perform rls_check.as_user(a);
  perform rls_check.expect_rows(format('delete from public.groups where id = %L', ga), 1, 'S-03 the owner deletes the group');
  perform rls_check.as_postgres();
  perform rls_check.expect_value(format('select count(*) from public.task_participants where task_id in (%L, %L)', t, t2), '0', 'S-03 deleting the group cascades to participants');

  perform rls_check.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------
-- summary
-- ---------------------------------------------------------------------------

select 'ALL RLS SCENARIOS PASSED (' || count(*) || ' assertions)' as result from rls_check.results;

rollback;
