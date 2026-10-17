-- unique-names: task titles are unique within a group, group names and nicknames across the whole app, all compared
-- without regard to letter case ("Running" and "running" are the same name).
--
-- What this changes:
--   - tasks_group_title_key: one task per (group, title), the title trimmed of space, tab, CR and LF like the CHECK
--     tasks_title_length and lower-cased. A rename to a title another task of the group has fails with 23505.
--   - groups_name_key: one group per name, trimmed like the CHECK groups_name_length and lower-cased. Creating or
--     renaming a group to a taken name fails with 23505; the app tells it from the one-group-per-user 23505 by this
--     index's name in the error message (src/lib/group-errors.ts).
--   - nicknames_nickname_key: the S-14 constraint compared nicknames exactly as typed ("Kasia" and "kasia" were two
--     nicknames); it becomes a unique index on lower(nickname) under the same name, so a nickname that differs from
--     another account's only in case is taken. The CHECK nicknames_nickname_trimmed keeps the stored value trimmed, so
--     no btrim is needed here.
--
-- lower() follows the database collation (en_US.UTF-8, libc), which lower-cases non-ASCII letters too ("Ł" -> "ł").
--
-- No backfill: creating an index fails on data that already breaks it, and the release then stops at `db push` before
-- the Worker deploys. Production has a single account at the time of writing, so no duplicates are expected.
--
-- compat: the deployed code keeps working; a duplicate nickname still fails with 23505, which it maps to nickname_taken; a duplicate group name or task title also fails with 23505, which the deployed code maps to already_in_group ("You are already in a group.") until the code of this change, which names the real cause, is released.

create unique index tasks_group_title_key on public.tasks (group_id, lower(btrim(title, E' \t\r\n')));

create unique index groups_name_key on public.groups (lower(btrim(name, E' \t\r\n')));

alter table public.nicknames drop constraint nicknames_nickname_key;

create unique index nicknames_nickname_key on public.nicknames (lower(nickname));
