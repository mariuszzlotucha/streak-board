<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Frontend toast notifications

- **Plan**: context/changes/frontend-notifications/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria on `dce74fd`: lint, test:unit (40 files), npm test (62 files, 1111 tests), build, smoke (all steps) and Playwright (29 passed) green. Manual rows 1.6–1.8 and 2.6–2.8 pending.

## Findings

### F1 — Success toast hides on a fixed timer with no pause

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/site/Toast.astro:62-70
- **Detail**: The success toast hides after 5 s regardless of hover or focus and cannot be recalled. A `role="status"` region whose text is present at page load is usually not announced, so screen-reader and slow readers may miss it (close to WCAG 2.2.1 Timing Adjustable).
- **Fix**: Pause the timer on `mouseenter`/`focusin`, restart on `mouseleave`/`focusout`.
  - Strength: Standard toast behaviour; a few lines in the existing script.
  - Tradeoff: Slightly more script; the timer no longer guarantees 5 s.
  - Confidence: HIGH — common, well-understood pattern.
  - Blind spot: Announcement on load stays unreliable; only the manual check shows real screen-reader behaviour.
- **Decision**: FIXED — timer pauses on hover/focus, restarts on leave

### F2 — Hiding the toast drops keyboard focus to body

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/site/Toast.astro:64-66
- **Detail**: Closing a toast (or the auto-hide while its close button has focus) sets `hidden` on the focused element; focus falls back to `<body>`. No Escape key to close.
- **Fix**: In `hide()`, when the toast contains `document.activeElement`, move focus to `<main>` (`tabindex="-1"`); close on Escape.
- **Decision**: FIXED — focus moves to <main> on hide; Escape closes

### F3 — Toast position off by the space-y margin; error toast can cover controls

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/site/Toast.astro:17, src/components/dashboard/DashboardView.astro:63-67
- **Detail**: As a child of `space-y-6` the fixed toast also gets `margin-block-end`, so it sits ~8.5rem from the bottom, not the 7rem the comment says. The persistent error toast floats over content until closed (WCAG 2.4.11 Focus Not Obscured), where the old inline alert did not.
- **Fix**: Render the toast outside the `space-y` container (still inside `<main>` before the `<h1>`) and correct the comment; accept the overlap of a closable toast.
- **Decision**: FIXED — toast rendered outside the space-y stack in both views

### F4 — Without JS the success toast never hides

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/site/Toast.astro
- **Detail**: No script → no timer and a dead close button; the toast stays until navigation. The app needs JS for its islands anyway.
- **Fix**: Accept, or add a CSS-only fade-out fallback.
- **Decision**: ACCEPTED — the app needs JS for its islands

### F5 — Three stale paths confirm something that did not happen

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/tasks/update.ts:34, src/pages/api/tasks/join.ts:31,38, src/pages/api/groups/remove-member.ts:36
- **Detail**: Per the owner's decision (dce74fd) stale actions confirm like real ones. Stale delete and leave are truthful, but updating a gone task says "Task updated.", joining a deleted task says "You joined the task.", and removing a member after the group was deleted says "Member removed." on a dashboard without a group.
- **Fix A ⭐ Recommended**: Keep the owner's decision as is
  - Strength: Matches the explicit decision; rare races only.
  - Tradeoff: A rare misleading confirmation.
  - Confidence: HIGH — the paths need a concurrent delete.
  - Blind spot: None significant.
- **Fix B**: Plain `/dashboard` (no toast) on those three paths only
  - Strength: Every toast is truthful.
  - Tradeoff: Partly reverses the owner's decision; smoke and data-routes rows change back.
  - Confidence: HIGH — small edit.
  - Blind spot: None significant.
- **Decision**: ACCEPTED — Fix A, owner decision kept

### F6 — Stale comment on noticeTarget

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/data-routes.test.ts:211
- **Detail**: Still says "A quiet no-op (a stale submit) keeps the plain dashboard."
- **Fix**: Reword to say stale submits get the action's notice.
- **Decision**: FIXED

### F7 — Smoke does not prove `notice` is stripped from the address

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:559-560
- **Detail**: `ERROR_PARAM_SCRIPT` matches only `delete("error")`; nothing asserts the script also removes `notice`.
- **Fix**: Make `ERROR_PARAM_SCRIPT` also require `searchParams.delete("notice")`.
- **Decision**: FIXED — ERROR_PARAM_SCRIPT also requires delete("notice")
