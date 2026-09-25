<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Group create / join / manage (S-01)

- **Plan**: context/changes/group-create-join-manage/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical 2 warnings 2 observations (all triaged)

Note: Phase 1 was reviewed before its commit (8 files staged on `s-01/group-create-join-manage/phase-1`). Manual item 1.6 (migration SQL review) is still unticked in Progress; the review of the SQL below is evidence for it, not a substitute for the human confirmation.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run in this review: RLS scenarios pass (78 assertions), `list_group_members` / `preview_group` present in `src/types.ts`, `astro check` 0 errors, `npm run lint` clean, all three migrations listed as applied locally. `db reset` (1.1) was run earlier in the same session and the database has not been altered since. Live catalog checks: both functions `prosecdef = t`, `search_path = ''`, executable by `authenticated` only (anon and public false), same ACL as `join_group`.

## Findings

### F1 — "Owner is listed first" assertion can pass without the ordering

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/rls-scenarios.sql:437
- **Detail**: The whole file runs in one transaction, so `now()` gives the owner and the joined member the same `joined_at`. Without the `(is_owner) desc` term the order falls to `user_id` (random uuids), so removing the owner-first ordering still passes about half of the runs. The `limit 1` on an unordered outer query also relies on the function's row order surviving. The break-check in Phase 1 went red on this assertion only by chance.
- **Fix**: Make the setup deterministic (e.g. give the member an earlier `joined_at` as postgres before asserting) and assert the whole order with `string_agg(user_id::text, ',')` over the function output.
- **Decision**: FIXED — owner's `joined_at` is moved an hour later as postgres and the whole order is asserted with `string_agg`; verified red on 3/3 runs against a function without the owner-first term, green (78 assertions) on the real one. The change is unstaged: restage `supabase/checks/rls-scenarios.sql` before the Phase 1 commit.

### F2 — Generated type says `preview_group` returns `string`, but it returns NULL

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/types.ts:99 (also `email: string` in `list_group_members`, src/types.ts:93)
- **Detail**: The generator infers non-null returns, so the "invalid invite" path in Phase 2 (`null` → clear cookie, show `invalid_code`) is invisible to the type checker, and `auth.users.email` can be NULL for phone or anonymous users. `src/types.ts` is generated and must not be hand-edited, so the correction belongs in the app layer.
- **Fix A ⭐ Recommended**: In Phase 2, wrap the RPC calls in a small typed helper in `src/lib/groups.ts` (`previewGroup(): Promise<string | null>`, member `email: string | null`) and add that to the Phase 2 file list.
  - Strength: Keeps the generated file untouched and puts the NULL handling in one place the dashboard and join route share.
  - Tradeoff: Adds a small helper not listed in the Phase 2 plan.
  - Confidence: HIGH — Phase 2 already puts server-side group logic in `src/lib/groups.ts`.
  - Blind spot: Newer generator versions may infer nullable returns and make the wrapper redundant.
- **Fix B**: Override the types with `overrideTypes` at each call site.
  - Strength: No new module.
  - Tradeoff: Repeated per call site; easy to forget on the next caller.
  - Confidence: MEDIUM — depends on the installed supabase-js version supporting it.
  - Blind spot: Not checked against the version in package.json.
- **Decision**: FIXED via Fix A — queued for Phase 2 in `follow-ups/review-fixes.md` (typed `previewGroup` / member-list helpers in `src/lib/groups.ts`); no Phase 1 code change.

### F3 — `preview_group` makes short legacy join codes cheaply enumerable

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:36-45
- **Detail**: `preview_group` is a validity oracle with no side effect and no rate limit, cheaper than `join_group`. 12-hex codes (48 bits) are fine. Groups created before hardening keep 8-hex codes (32 bits), which become enumerable without joining. The migration comment already accepts the oracle; the legacy-code exposure is not stated. No groups exist locally, so it could not be measured.
- **Fix**: Before pushing the migration to production run `select length(join_code), count(*) from groups group by 1`, and note the result in the deployment step.
- **Decision**: FIXED — pre-push production check queued in `follow-ups/review-fixes.md`.

### F4 — Stale statements left in docs and the scenarios header

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md:24, supabase/checks/rls-scenarios.sql:1
- **Detail**: CLAUDE.md line 24 still says "No custom tables/migrations exist yet" (already false since F-01; the plan limited the edit to line 23). The scenarios header still reads "(F-01 + group-rls-hardening)" and does not mention S-01.
- **Fix**: Fix both in a later doc pass (or extend the Phase 1 one-liners now); not needed for Phase 1 to pass.
- **Decision**: FIXED — CLAUDE.md line 24 rewritten and the scenarios header now mentions S-01. Both files are unstaged: restage before the Phase 1 commit.
