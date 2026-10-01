<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task join and leave

- **Plan**: context/changes/task-join-and-leave/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria

Reviewed on a fresh `master` (`2358884`, all four phase PRs #36-#39 merged, no open PRs).

- `npx supabase db reset`: PASS (all migrations apply on a fresh local stack, including `20261001090000`)
- `npm run test:rls`: PASS ("ALL RLS SCENARIOS PASSED (157 assertions)")
- `npm test`: PASS (8 files, 75 tests)
- `npm run lint`: PASS (no output)
- `npm run build`: PASS
- `npm run smoke` against the local stack: PASS ("All smoke steps passed", 132 PASS lines)
- Production release: run 36796008409 finished `completed/success`; its log shows `db push` applying only `20261001090000_create_task_participants.sql`, then the Worker deploy and the live check.
- Manual 3.5-3.7 were ticked by the implementing agent after a headless-Chrome run, not by the human (see impl-review-phase-3.md). Manual 4.2 and 4.3 rest on the user's confirmation; 4.3 (production join/leave) is not observable in CI or the diff.
- Plan drift review: every planned item matches. The deviations (backfill joins `group_members`, `taskExists` pre-check, 1000-row cap, own try/catch for participants, ARIA list roles, extra smoke steps) were triaged in the phase reviews and are recorded in the plan's addenda. Nothing in "What We're NOT Doing" was violated.
- Security scan: no injection, authn/authz, privilege or data-loss problem found. Task titles and emails are escaped text nodes and attribute values, error codes go through a fixed table, and every error path ends in a fixed redirect. Both trigger functions are SECURITY DEFINER with `search_path ''`, schema-qualified names and EXECUTE revoked, and neither can raise in a way that blocks a group delete or leave.
- `context/foundation/roadmap.md` still shows S-03 as `in-progress`: expected until `/10x-archive`.

## Findings

### F1 — CLAUDE.md and README do not mention the new endpoints and table

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md:11, CLAUDE.md:25, README.md:170-176, README.md:182, README.md:258, README.md:265
- **Detail**: CLAUDE.md is the agent-facing map of the repo. Line 11 lists `src/pages/api/tasks/{create,update,delete}.ts` without `join` and `leave`; line 25 says "The schema currently consists of `groups`, `group_members` and `tasks`" without `task_participants`. README's "Task routes" table (170-176) lists only create, update and delete, and line 182 says the RLS scenarios cover `groups`, `group_members` and `tasks`. README 258/265 describe the smoke script as the auth and group flows needing "the group migrations"; that was already stale after S-02 and is now further out of date. `PROTECTED_ROUTES` statements remain true (`/api/tasks` covers both routes by prefix).
- **Fix**: Add `join,leave` to the endpoint list and `task_participants` to the schema sentence in CLAUDE.md; add the two route rows and `task_participants` to the RLS sentence in README; update the smoke description (flows and migrations it needs).
- **Decision**: FIXED (CLAUDE.md endpoint list and schema sentence; README task routes table, RLS sentence, schema line and smoke description)

### F2 — The ghost-row claim in the migration header is untested, and one test does not prove its title

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/integration/task-participation.test.ts:216-226, supabase/migrations/20261001090000_create_task_participants.sql:14-18
- **Detail**: The migration header states that after the accepted join-versus-leave race "the ex-member cannot delete" the ghost row "(the select policy hides it)". No test plants a ghost row, so this is asserted nowhere. The test "a removed member cannot delete rows and is not re-enrolled when they return" does not prove its title either: the cleanup trigger has already deleted the member's row, so the ex-member's filtered delete returns `[]` whatever the policies are (the delete policy is `user_id = auth.uid()` and the ex-member owns no row). The claim is plausible for the filtered delete the app uses (Postgres applies SELECT policies to a DELETE with a WHERE or RETURNING), but an ex-member removing their own ghost row would be harmless, so the header wording may also be stronger than the behaviour. The dashboard's "Unknown member" branch (`dashboard.astro:101`) has no fixture either.
- **Fix A ⭐ Recommended**: Add an integration test and an `rls-scenarios.sql` case that plant a ghost row for an ex-member through the service role, then assert that the group's members see it, the ex-member reads 0 rows and the ex-member's filtered delete removes 0 rows; rename the existing test to what it proves; reword the header to the verified behaviour.
  - Strength: Turns an untested privilege claim into an assertion at both levels, in the style of the existing S-03 tests (`adminParticipants`, `as_user`, `expect_*`).
  - Tradeoff: Two small test additions plus a comment-only edit to an applied migration (migration history is keyed by version, so the production state is unaffected).
  - Confidence: MED — the expected result follows from Postgres RLS semantics but I have not run the scenario.
  - Blind spot: The test may show that the ex-member can delete their own ghost row, in which case the header sentence is simply wrong and should be rewritten rather than defended.
- **Fix B**: Only rename the vacuous test and soften the header to "the app's leave route cannot remove it; clean up with the service role", without adding a ghost-row test.
  - Strength: No new test code and nothing behavioural to maintain.
  - Tradeoff: The privilege behaviour around ghost rows stays unasserted.
  - Confidence: HIGH — wording only.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (ghost-row integration test and SQL scenario added, both pass: the group sees the row, the ex-member reads 0 rows and a filtered delete removes 0; vacuous test renamed and its delete assertions dropped; migration header reworded to the asserted behaviour)

### F3 — Migration header understates the triggers' effect on the deployed code

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001090000_create_task_participants.sql:3
- **Detail**: The header says "Additive table that nothing reads yet, so it is backward compatible with the deployed code". The migration also adds two SECURITY DEFINER triggers on existing tables (`tasks` insert, `group_members` delete), which do change what the old code's inserts and deletes do. I read both functions and they are compatible (schema-qualified, `search_path ''`, no raise, and the cascade of a whole group matches no rows once tasks are gone), and the production release confirmed the old flows still work. One path has no test with live participation: deleting an auth user who has participation rows (it runs the `group_members`, `tasks.created_by` and `task_participants.user_id` cascades together).
- **Fix**: Reword the header to say the table is additive and that the two triggers keep the old code's inserts and deletes working; optionally add a test that deletes an auth user with live participation.
- **Decision**: FIXED (header reworded; integration test added that deletes an account which created a task and participates in another, with a `deleteTestUser` helper; passes)

### F4 — Older tables keep the broad default grants that the new table avoids

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260925003350_create_groups_and_group_members.sql, supabase/migrations/20260930120000_create_tasks.sql:37-38 (pre-existing, outside S-03)
- **Detail**: Queried on the local stack after `db reset`: `group_members` and `groups` grant `anon` ALL privileges (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE), and `authenticated` keeps TRUNCATE, REFERENCES and TRIGGER on `groups`, `group_members` and `tasks`; `task_participants` grants `authenticated` only SELECT and DELETE after the new migration's `revoke all` (the INSERT column grant is not listed by `role_table_grants`). Row-level security gates rows, not TRUNCATE, but PostgREST does not expose TRUNCATE, so this is not reachable through the API today; it is a hardening gap and the new table is the only one done the strict way. S-03 did not introduce it.
- **Fix**: Outside this change: queue a follow-up hardening migration that does `revoke all` on the three older tables and re-grants the minimal privileges (with a scenario asserting TRUNCATE is denied), released through the gated workflow.
- **Decision**: FIXED (migration `20261001120000_harden_table_privileges.sql`: anon loses everything on groups and group_members; authenticated loses TRUNCATE, REFERENCES and TRIGGER on groups, group_members and tasks, and INSERT/UPDATE on group_members. Every app query runs in a protected route or dashboard helper with the user's session, so nothing the app does is affected. Two scenarios that asserted the old behaviour (anon reading 0 groups; group_members UPDATE returning 0 rows) now expect 42501; new `hardening:` scenarios added. test:rls 172 assertions, npm test 77/77, smoke 132 PASS, lint and build clean. Needs the gated production release after merge.)
