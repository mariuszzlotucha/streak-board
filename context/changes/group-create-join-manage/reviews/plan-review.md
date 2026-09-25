<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Group create / join / manage (S-01)

- **Plan**: context/changes/group-create-join-manage/plan.md
- **Mode**: Deep
- **Date**: 2026-09-25
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

14/14 paths ✓ (new paths correctly absent), 7/7 symbols ✓ (rls_check helpers, PROTECTED_ROUTES, createServerClient generic, checkOrigin default), brief↔plan ✓, Progress↔Phase ✓ (4/4 phases, 31/31 criteria 1:1, 0 checkboxes outside Progress). Verified empirically on the local DB (rolled-back transaction): `DELETE/UPDATE … RETURNING` returns 1 row for permitted actions and 0 rows without error for denied ones.

## Findings

### F1 — remove-member with the caller's own user_id will not return forbidden

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — remove-member endpoint and smoke steps
- **Detail**: The smoke plan expects a non-owner posting remove-member with "own or A's user_id" to get `?error=forbidden`. The `group_members_delete_self` policy lets a non-owner delete their own row (verified: 1 row returned), so the "own id" step would succeed, B would leave the group and later steps would break. The endpoint contract does not cover target = caller.
- **Fix**: Endpoint rejects a `user_id` equal to the caller's id with `forbidden` (leaving is the separate `/leave` action); smoke has B try only the owner's `user_id`.
- **Decision**: FIXED (Fix in plan)

### F2 — The "anonymous" join-link smoke step is not anonymous

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Smoke test with two users
- **Detail**: The plan signs B up first, then requests `/join/<code>` "anonymously". With local `enable_confirmations = false`, signUp returns a session and the jar holds `sb-*` cookies (`scripts/smoke.mjs:20`), so the step would pass without testing link → no session → sign-in → preview card.
- **Fix**: Order the steps: (1) GET `/join/<code>` on B's empty jar, (2) B signs up, (3) B signs in, (4) B's dashboard shows the group name from the preview; `join_code` must survive steps 2–3.
- **Decision**: FIXED (Fix in plan)

### F3 — Email confirmation in production vs the 1 h join cookie

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Open Risks (brief) / Phase 2 item 3
- **Detail**: Signup ends on `/auth/confirm-email`. Locally confirmations are off, but production may require them; a new user may confirm after more than 1 h or in another browser and the cookie is gone.
- **Fix**: Add to Open Risks: the code is stable, so re-opening the link (or pasting it in the "join with code" field) recovers; behaviour is intended.
- **Decision**: FIXED (Fix in plan)

### F4 — Unit of the name length limit on the client

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 item 8 (CreateGroupForm) / Phase 3 item 4 (RenameGroupForm)
- **Detail**: The server counts code points (1–80) but the plan adds `maxLength` 80 to the input, which counts UTF-16 units; a 41–80 emoji name valid for the database would be blocked in the browser.
- **Fix**: Omit `maxLength`; validate in `onSubmit` with `[...name].length`.
- **Decision**: FIXED (Fix in plan)

### F5 — A failing dashboard query ends in a 500

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 item 4 (getMyGroup) / Phase 3 item 6
- **Detail**: `getMyGroup` throws on a Supabase error and the plan does not say what the user sees when `getMyGroup`, `list_group_members` or `preview_group` fails. Auth routes always show a fixed `unknown` message.
- **Fix**: Wrap the data loading in try/catch and render the destructive alert with the `unknown` message.
- **Decision**: FIXED (Fix in plan)

### F6 — Planning artifacts land in the phase 1 commit

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Docs / Implementation Approach
- **Detail**: `context/changes/group-create-join-manage/` is untracked and the roadmap status change is uncommitted. The hardening impl-review (F2) warned about unplanned files swept into a phase commit; the plan does not say these files are included on purpose.
- **Fix**: State in Implementation Approach that the phase 1 commit includes the planning artifacts and the roadmap status change, and that everything else is staged only from the plan's file lists.
- **Decision**: FIXED (Fix in plan; wording later aligned with the lesson to commit planning artifacts to `master` before phase 1)
