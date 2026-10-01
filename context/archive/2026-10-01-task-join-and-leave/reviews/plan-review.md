<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Task join and leave

- **Plan**: context/changes/task-join-and-leave/plan.md
- **Mode**: Deep
- **Date**: 2026-10-01
- **Verdict**: REVISE → SOUND after fixes (all findings resolved in the plan)
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

10/10 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress↔Phase 20/20 ✓. `docs/reference/contract-surfaces.md` is absent, so the contract-surface check was skipped.

## Findings

### F1 — Smoke step "user of another group cannot join" has no actor

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Smoke steps
- **Detail**: smoke.mjs has users A, B, C, all in group A when tasks are exercised (:680-783); a second group cannot be created by an existing user (:319).
- **Fix A ⭐ Recommended**: Drop the step from smoke; keep it in SQL and Vitest.
  - Strength: No fourth smoke user needed.
  - Tradeoff: No HTTP-level proof of the cross-group case.
  - Confidence: HIGH — the route's only guard is getTask + RLS, both tested in Phase 1.
  - Blind spot: None significant.
- **Fix B**: Add user D with their own group.
  - Strength: Proves the quiet redirect through the real route.
  - Tradeoff: More setup and cleanup in smoke.
  - Confidence: MEDIUM — signup flow in smoke not checked.
  - Blind spot: Cleanup of the extra user and group.
- **Decision**: FIXED (Fix A)

### F2 — Privilege contract relies on defaults the repo never tightened

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migration (privileges)
- **Detail**: Existing migrations revoke only INSERT/UPDATE from authenticated (create_tasks.sql:37-40); TRUNCATE, REFERENCES and TRIGGER stay at Supabase defaults.
- **Fix**: `revoke all … from anon, authenticated`, then grant select, insert (task_id, user_id), delete; scenario asserting UPDATE and TRUNCATE are denied.
- **Decision**: FIXED

### F3 — Participant assertions in smoke need a row-scoped match

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Dashboard task list and smoke steps
- **Detail**: Emails also appear in the Members card (smoke.mjs:381) and task-row regexes stop at the first `</li>` (:128-151).
- **Fix**: Render participants inside the task's own `<li>` without nested `<li>`; add a row-scoped smoke helper for presence and absence.
- **Decision**: FIXED

### F4 — Cleanup trigger is covered only by a manual step

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Smoke steps (manual 3.6)
- **Detail**: Existing smoke leave/remove steps (:444-462, :624-665) run before any task exists (:680+), so no automated check drives the routes with a participant present.
- **Fix**: Late smoke sequence before the task delete (:780): B joins a task, leaves the group, rejoins by invite, task row shows no B.
- **Decision**: FIXED

### F5 — Step 1.2 cannot fail on stale types

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria 1.2
- **Detail**: `npm run build` passes whether or not src/types.ts was regenerated.
- **Fix**: Add `grep -q task_participants src/types.ts` to the criterion.
- **Decision**: FIXED
