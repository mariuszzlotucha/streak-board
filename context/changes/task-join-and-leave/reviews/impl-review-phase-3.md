<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task join and leave

- **Plan**: context/changes/task-join-and-leave/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warnings 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria

- `npm run smoke` against the local stack: PASS ("All smoke steps passed")
- `npm test`: PASS (8 files, 75 tests)
- `npm run lint`: PASS (no output)
- `npm run build`: PASS
- Manual 3.5–3.7: ticked by the implementing agent after a headless-Chrome check at 375px (16/16 checks, keyboard-only Join/Leave), not by the human. No evidence for them lives in the diff.

## Findings

### F1 — A participants load failure hides the whole Tasks card

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:41-48 (with src/lib/tasks.ts:64-66)
- **Detail**: `listTaskParticipants` shares the `try` with `listGroupTasks`, as the plan prescribes ("a failure hides only the Tasks card"). Participants are secondary information, but any failure there sets `tasksFailed`, which hides create, edit and delete as well. `listTaskParticipants` also throws by design once the result reaches 1000 rows (`POSTGREST_MAX_ROWS`). A group of about 50 tasks with 20 participants each would permanently lose its Tasks card behind the generic "unknown" banner. The failure is also logged as "Loading the tasks failed", so the cause cannot be told apart.
- **Fix A ⭐ Recommended**: Load participants in their own try/catch with a `participantsFailed` flag and a separate log line. Render the tasks without the participant line and the Join/Leave controls when it is set.
  - Strength: The group can still manage its tasks. The cap becomes a degraded view, not a lockout.
  - Tradeoff: One more render branch, and a small deviation from the plan's "same `tasksFailed` path" clause.
  - Confidence: HIGH — the join and leave routes are independent of the page's participant data.
  - Blind spot: The copy of the degraded state is not designed. A short "Participants unavailable" note may be wanted.
- **Fix B**: Keep it as planned and accept the risk.
  - Strength: No code change, and it matches the plan.
  - Tradeoff: The failure mode stays reachable for large groups.
  - Confidence: MEDIUM — it depends on how large groups get; the MVP groups are small.
  - Blind spot: Nothing has measured the real group and task sizes.
- **Decision**: FIXED via Fix A (own try/catch, `participantsFailed`; rows render without participant line and Join/Leave, with a short note)

### F2 — Unused `userId` field in `participantsOf`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:88-92
- **Detail**: The helper returns `{ userId, email, isYou }`, but the markup reads only `email` and `isYou`.
- **Fix**: Drop `userId` from the returned object.
- **Decision**: FIXED (dropped the unused `userId` field)

### F3 — Participant line has no list semantics

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:206-223
- **Detail**: The participants are bare `<span>`s, so a screen reader reads "Participants: a@x.com b@y.com You" as run-on text. Real `<ul>/<li>` is not an option: the smoke row regexes stop at the first `</li>`, and the plan forbids a nested `<li>`.
- **Fix**: Give the wrapper `role="list"` with an `aria-label` and each entry `role="listitem"`. The smoke helpers are unaffected.
- **Decision**: FIXED (ARIA `list`/`listitem` roles on the participant line; no nested `<li>`)

### F4 — Smoke additions beyond the plan

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/smoke.mjs:118-145, 348-349, 907-916, 949-963, 964-981, 1007-1019
- **Detail**: Beyond the plan's single row-scoped helper, the phase adds the helpers `taskRowWithForm`, `taskRowWithConfirmedLeave` and `taskTargetInRow`. It also adds GET 404 steps for both routes, joining a nonexistent task, leaving a non-joined task, a creator-intact step and some pre-check steps. None of these touches "What We're NOT Doing". Every added step asserts an outcome, and none would pass with the feature broken. One step, "task participation of the creator is intact after the member left" (954-963), is largely redundant with 936-948.
- **Fix**: Keep them, and list them in the plan as a Phase 3 addendum so the plan stays the source of truth.
- **Decision**: FIXED (Phase 3 addendum added to plan.md)
