<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Nick zamiast e-maila (S-14 `nickname`)

- **Plan**: context/changes/nickname/plan.md
- **Scope**: Phase 2 of 2
- **Reviewed phases**: 2
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

Reviewed: 11985cb (`feat(nickname): release 2, …(p2)`) and cca60a2 (epilogue) against origin/master 62204c7 (release 1, the `production` tag). All three planned changes MATCH and none is missing. The one extra, a comment in `group-isolation.test.ts`, keeps that comment true. Key questions checked and found fine:

- **Migration B against migration A's definition.** Only `u.email` and the `auth.users` join are gone. Unchanged: `security definer`, `search_path ''`, `stable`, the filter, the order and the revoke/grant pair. The live ACL is authenticated and service_role only. `pg_depend` shows nothing that depends on the function, so the drop cannot cascade.
- **Other paths to a member's e-mail address.** None remain. No public function or view reads `auth.users` or `email`, `preview_group` returns only the group name, and `authenticated` has no privilege on `auth.users`.
- **Remaining readers of the RPC's `email`.** None in `src/`, `tests/`, `scripts/`, `supabase/checks/` or `packages/`. `src/types.ts` matches `supabase gen types` exactly.
- **Accuracy of the release 1 record in deployment-plan Phase 18.** It matches the release run, the Cloudflare version and the tag move. Rows 1.19 and 1.20 are honestly left pending.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Success criteria, all re-run on HEAD cca60a2 on 2026-10-16:

- 2.1 guard: 1 migration change, 0 violations, 0 warnings
- 2.2 db reset applies 20261016175817; types:check PASS
- 2.3 lint + build: PASS
- 2.4 npm test: 44 files, 815/815
- 2.5 RLS: 325 assertions, including "S-14 list_group_members has no email column (= false)"
- 2.6 smoke on preview, with the Phase 1 script unchanged: 266 PASS, 0 FAIL

Break-check during the run: with `email` added back to migration B, both the new integration test and the new RLS assertion went red. Manual rows 2.7–2.11 are pending, and none is ticked.

## Findings

### F1 — Phase 1 rows 1.12 and 1.18 are done but still unticked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/nickname/plan.md:476,482
- **Detail**:
  - Row 1.12 ("`compat` na PR-ze fazy zielony") is done: `compat` passed on PR #150, run 38925547891.
  - Row 1.18 ("PR scalony, `release` zatwierdzony z migracją A") is done: merged as 62204c7, `release` approved in run 38926815420, and `db push` applied only `20261016162551_add_nicknames.sql`.
  - `deployment-plan.md` Phase 18 already records both as `[x]`, but the plan's Progress does not.
  - Rows that need the PR's own CI or release ride on the next branch, or they are stranded (S-11 1.12 was). This branch is the next one.
- **Fix**: Tick 1.12 and 1.18 in Progress with their evidence (`— 62204c7`), and leave 1.13–1.17, 1.19 and 1.20 open for the owner.
- **Decision**: FIXED (1.12 and 1.18 ticked `— 62204c7`; 1.13–1.17, 1.19 and 1.20 left for the owner)

### F2 — The RLS assertion catches only a column named exactly `email`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/rls-scenarios.sql:463
- **Detail**: `'email' = any(proargnames)` follows the plan and is correct for that name. A missing function gives NULL, which fails. But a future column named `mail`, `member_email` or anything else extra would pass. The integration test's exact-key assertion (nicknames.test.ts:160) catches such a column, so the contract is guarded, though only at the integration layer, not at the SQL layer.
- **Fix**: Keep the plan's assertion and add one that pins the whole result: `select pg_get_function_result('public.list_group_members(uuid)'::regprocedure)` expected `TABLE(user_id uuid, nickname text, joined_at timestamp with time zone, is_owner boolean)` ("S-14 list_group_members returns exactly user_id, nickname, joined_at, is_owner"; 326 assertions).
- **Decision**: FIXED (assertion added next to the plan's; RLS 326 assertions, Phase 18 count updated)

### F3 — Test wording left from the e-mail era

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/group-isolation.test.ts:111; tests/integration/nicknames.test.ts:161
- **Detail**:
  - The isolation test is titled "…; no emails leak", a column that no longer exists. What it asserts is that outsiders get `[]` while a member gets 2 rows.
  - The new test checks each value with `String(value)` for `@`. Once the keys are pinned, the values are a uuid, a timestamp, a boolean and a `vt-<hex>` nickname, so that loop cannot fail. The neighbouring test (line 171) states the same check as `JSON.stringify(...)`.
- **Fix**: Rename the isolation test to "…; no member rows leak", and replace the value loop with `expect(JSON.stringify(listed)).not.toContain("@")`, the file's idiom.
- **Decision**: FIXED (title "…; no member rows leak"; value loop replaced by `JSON.stringify(listed)`; 23/23 in both files)

### F4 — Small gaps in the Phase 18 release record

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/deployment/deployment-plan.md:339,358
- **Detail**:
  - The release 1 `compat` line gives no run number, while the release line does. The run is 38925547891.
  - The rollback line says pre-release-1 code "reads `email`, which no longer exists". In practice PostgREST returns the rows without the key, so old code would show every member as "Unknown member" rather than crash. The remedy (a migration that restores the column) is still right.
  - Not part of Phase 2: `context/domain/03-anti-corruption-layer.md:360` still shows `email: string | null`. It is a dated refactor snapshot from 2026-10-06, stale since Phase 1, and left as history.
- **Fix**: Add "CI run 38925547891" to the compat line, and reword the rollback sentence to say what old code would actually show.
- **Decision**: FIXED (compat run 38925547891 added; rollback sentence says old code shows "Unknown member" or no name)
