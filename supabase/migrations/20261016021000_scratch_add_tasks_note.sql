-- SCRATCH CHECK, NEVER MERGED (S-10 test-coverage, plan row 6.5): an additive, backward-compatible migration. The
-- deployed code ignores the new nullable column, so the `compat` job must pass on the deployed commit's smoke.
alter table public.tasks add column scratch_note text;
