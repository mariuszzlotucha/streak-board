<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Usunięcie konta i przekazanie własności grupy (S-15 `account-deletion`)

- **Plan**: `context/changes/account-deletion/plan.md`
- **Scope**: Full plan (Phases 1–4; Phase 5 is the owner's release and has not started)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations (all fixed in triage, 2026-10-16)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria (re-run 2026-10-16 on 1e68fe3)

- `npm run guard:migrations`: PASS (1 migration change, 0 violations)
- `npx supabase db reset`: PASS
- `npm run types:check`: PASS
- `npm test`: PASS (45 files, 870 tests)
- `npm run test:rls`: PASS (373 assertions)
- `npm run lint`, `npx astro check` (0 errors), `npx prettier --check …`, `npm run build`: PASS
- `npm run smoke` on the local preview: PASS
- `npx playwright test` (whole suite, throwaway seed account): PASS (21)
- Manual: 1.7 ticked with the owner's production result; 2.5, 2.6, 3.5, 3.6, 4.4, 4.5 and Phase 5 are pending, none ticked without evidence.

## Findings

### F1 — A second delete request ends on the invite-code error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/account/delete.ts:46-49, src/lib/group-errors.ts:27-28
- **Detail**: `delete_own_account` raises P0002 when the account is already gone: two tabs or a double submit that both pass the middleware before the first request commits. The route maps it through `toGroupErrorCode` to `invalid_code`, logs `account.delete.failed code=invalid_code` (a misleading error line) and redirects to `/dashboard?error=invalid_code` without `endSession` or `clearJoinCode`, so the second tab loses the "Your account has been deleted." confirmation and keeps the dead session cookies until the middleware drops them.
- **Fix**: In the delete route, treat P0002 as "already deleted": `endSession`, `clearJoinCode`, redirect to `/?account=deleted`, report at info level; add a `data-routes.test.ts` row for it.
- **Decision**: FIXED — the route treats P0002 as already deleted (`account.delete.already_deleted` info line, sign-out, `join_code` cleared, `/?account=deleted`); new `data-routes.test.ts` row, break-checked red

### F2 — Roadmap S-15 still says the PRD has no requirement

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:63 (At-a-glance PRD cell), context/foundation/roadmap.md:240 (PRD refs)
- **Detail**: Phase 4 §2 added FR-011 and FR-012 (and rewrote FR-003), but S-15's PRD refs still read "— (nowa funkcja; MS-10). PRD nie ma FR o usunięciu konta; nowy FR dopisuje zmiana tego wycinka…", and the At-a-glance cell still reads "— (nowa funkcja; MS-10)".
- **Fix**: Set both to "FR-003, FR-011, FR-012 (nowa funkcja; MS-10)", the way S-14 names FR-010.
- **Decision**: FIXED — At-a-glance cell "FR-003, FR-011, FR-012 (MS-10)" and PRD refs naming FR-011, FR-012 and FR-003

### F3 — Inner functions stay callable with the service_role key

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261016180000_account_deletion_and_ownership_transfer.sql:102, :186
- **Detail**: The revokes name `public, anon, authenticated`; Supabase's default privileges still give `service_role` EXECUTE on `delete_account` and `transfer_group_ownership_for` (checked locally with `has_function_privilege`), so they are callable over PostgREST RPC with the service key, while the comments say "for the operator in the SQL Editor". No code in `src/`, `tests/` or `scripts/` calls either with the service key, and that key can already delete users.
- **Fix**: Add `service_role` to both revokes (the migration is not released yet), so the comment holds.
- **Decision**: FIXED — `service_role` added to both revokes; two RLS assertions (`has_function_privilege` = false)

### F4 — The audit log delete scans the whole table under the group lock

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261016180000_account_deletion_and_ownership_transfer.sql:171-174
- **Detail**: The `jsonb` filter on `auth.audit_log_entries` has no index and runs after the owned group is locked `for update`, so a join to that group waits for the scan. The plan accepts the scan at today's size (Performance Considerations; 279 rows locally), but Supabase never prunes the table, and the client RPC runs under `authenticated`'s statement timeout, so at a very large size the deletion would fail with 57014 → "unknown".
- **Fix**: Move step 3 before the group lock (it rolls back with the rest on any error) and note the unindexed scan and the timeout limit in the function comment.
- **Decision**: FIXED — the log delete is now step 1, before the group lock; the comment names the unindexed scan, the 57014 limit and the remedy

### F5 — The race note misses the owner who can open a second group

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261016180000_account_deletion_and_ownership_transfer.sql:56-63
- **Detail**: In the accepted race (the successor leaves during the transfer) the owner ends up outside the group, can then create a second group, and `delete_account`'s `select … into` handles only one owned group, so the deletion fails with 23503 ("unknown") until the operator repairs the row. The comment describes the race but not this consequence.
- **Fix**: Add one sentence on this consequence and its repair to the race comment.
- **Decision**: FIXED — the race comment names the second-group consequence and its repair

### F6 — The privacy policy's "ways you sign in" leaves `auth.flow_state` out

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/privacy/AccountDeletion.astro:13-16; migration step 3
- **Detail**: `auth.flow_state` has `user_id` and `provider_access_token` but no foreign key to `auth.users` (local `pg_constraint`), so a leftover PKCE row of a Google sign-in survives the deletion, while the policy says "the ways you sign in (password or Google)" are deleted. GoTrue deletes the flow state on a successful code exchange, so only abandoned attempts remain.
- **Fix A ⭐ Recommended**: The owner checks `select has_table_privilege('postgres','auth.flow_state','DELETE');` on production; if `true`, `delete_account` also deletes `auth.flow_state where user_id = p_user_id`
  - Strength: The policy becomes literally true, with one statement in the same transaction.
  - Tradeoff: Needs one more production check before merge; a missing privilege would make every deletion fail with 42501.
  - Confidence: MED — local `postgres` owns the auth tables; production was confirmed only for `auth.users` and `auth.audit_log_entries`.
  - Blind spot: Whether GoTrue's own cleanup already removes old flow states.
- **Fix B**: Leave the code and accept it (abandoned PKCE rows are short-lived and hold no data the user typed)
  - Strength: No new dependency on production privileges.
  - Tradeoff: The policy is slightly broader than the code.
  - Confidence: MED — depends on GoTrue's cleanup, not verified.
  - Blind spot: How long abandoned flow states live on the hosted project.
- **Decision**: FIXED (Fix A) — `delete_account` step 1 also deletes `auth.flow_state` rows of the user; RLS assertions (A's row gone, M's stays, kept on refusal); README operator steps updated; plan row 1.8 added: the owner confirms `has_table_privilege('postgres','auth.flow_state','DELETE')` = `true` on production before merge

### F7 — The run skipped the per-phase reviews and pushed before this review

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: N/A (process; PR #156)
- **Detail**: The lessons "Run a whole implementation in one goal run and ship it as one PR" and "Push the phase branch and open its PR only after the phase impl review is triaged" ask for `/10x-impl-review <change-id> phase N` before each next phase and the full-plan review before the push. The `/10x-goal-implement` run made no phase reviews and opened PR #156 (as a draft) before this review, because the goal asked for an opened PR.
- **Fix**: Keep PR #156 a draft until this review's fixes and report are pushed; then decide whether the lesson should say that a `/10x-goal-implement` run replaces the per-phase reviews with this single full-plan review.
- **Decision**: FIXED — PR #156 stays a draft until the review commit is pushed; lesson unchanged

## Triage (2026-10-16)

Fixed: F1, F2, F3, F4, F5, F6 (Fix A), F7. After the fixes: `db reset`, `guard:migrations` (0 violations), `types:check`, `test:rls` (378 assertions), `npm test` (871), lint, `astro check` (0 errors), build, smoke and `npx playwright test` (21) all pass.
