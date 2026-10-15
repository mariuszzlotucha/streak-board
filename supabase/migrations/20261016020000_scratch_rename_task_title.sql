-- SCRATCH CHECK, NEVER MERGED (S-10 test-coverage, plan row 6.4): this migration is deliberately incompatible with
-- the deployed code, which inserts and reads `tasks.title`. The `compat` job must fail on the deployed commit's smoke.
-- compat: none on purpose; this PR exists to see the gate red and is closed unmerged.
alter table public.tasks rename column title to task_title;
