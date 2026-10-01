<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Checkoff and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Scope**: Phase 5 of 6
- **Reviewed phases**: 5
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 6 observations

Triage (2026-10-01): all eight findings were fixed (F1 to F8) in the working tree, test-first where a unit test applies, and verified again (see "Success Criteria"). The fixes, this report and the `plan.md` edits ship in one follow-up commit on the phase branch.

Reviewed state: commit `b0eaadd` on branch `s-04/checkoff-and-leaderboard/phase-5` (on top of master `6a2d420`, which contains the merged Phase 4), 11 files: the three planned source files (`src/components/tasks/CheckoffControl.tsx`, `src/components/tasks/Leaderboard.tsx`, `src/pages/dashboard.astro`), the three planned new modules (`src/lib/checkoff-sync.ts`, `src/lib/checkoff-client.ts`, `src/components/hooks/useCheckoffDeltas.ts`), the three planned test files, `src/lib/leaderboard-rules.ts` (`applyDeltas`, not in the plan) and `plan.md`. The SHA write-back into the nine Progress rows of Phase 5 is the only uncommitted change.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Summary

Every planned item is implemented: the delta store, the form-encoded `fetch` protocol with its 15 s abort, the four result kinds, the optimistic control with rollback, the live Leaderboard, `client:load` on both islands, and the unit tests the plan lists. No planned item is missing and no "NOT doing" boundary is crossed. Both reviewers found no CSRF, XSS, cross-user or data-safety defect: the body is urlencoded, so Astro's Origin check applies; messages are constants; the store is only written from a client event handler, and the server snapshot is a constant, so nothing per-request can leak inside a Worker isolate. The hydration invariant holds (React uses the server snapshot while hydrating), `sendCheckoff` cannot reject, and the pending guard cannot be bypassed from the keyboard. The two warnings are both in the island's UI behaviour: a late rollback can pull focus back from wherever the user has moved on to (and a following Space re-ticks the task), and the failure message is mounted already filled, which many screen readers do not announce. The six observations are the justified `aria-disabled` deviation and the unlisted `applyDeltas` helper (both need a line in the plan), an expired session that ends in a "Try again" message that cannot succeed, three test weaknesses, a reload window after a `stale` answer, and two small duplications.

## Success Criteria

Re-run during this review (2026-10-01, on the committed tree `b0eaadd`):

- 5.1 `npm test`: PASS. 14 files, 232 tests (218 before, 14 new), with `TZ=America/Los_Angeles` as the Vitest setup requires.
- 5.2 `npm run lint`: PASS. Clean.
- 5.3 `npx astro check`: PASS. 103 files, 0 errors, 0 warnings, 0 hints.
- 5.4 `npm run build`: PASS.
- 5.5 `npm run smoke`: PASS. 188 steps, no failure (rebuild, `npm run preview` on :4321, local stack). The step count equals Phase 4's, as expected: the server markup is unchanged and `scripts/smoke.mjs` is untouched.
- 5.6, 5.7, 5.8, 5.9 manual (tap flips row, streak and board at once; offline rolls back with a message; no-JavaScript forms; focus and phone width): confirmed by the human in the implementing session on 2026-10-01. A diff cannot carry browser evidence, so this is taken from the confirmation and from the implementing session's scratch Playwright run (Chromium, 375 px, 19 checks passed; the script is not in the repo): a tap flipped the row in 54 ms against a response delayed by 1.5 s, the board re-ranked at once, focus landed on the new button, offline and a forged 403 rolled everything back, a confirmed answer for another period reloaded the page, the no-JavaScript forms posted natively, and no hydration problem was logged. Not verified by anyone: a real phone, and DevTools "Slow 3G" literally (the delayed response stands in for it).

Deliberate break-check from the implementing session (re-reported, not re-run here): 7 mutations of the new code, each turned a unit test red and was restored from a saved copy.

Re-run after the triage fixes (2026-10-01, working tree on top of `b0eaadd`):

- `npm test`: PASS. 14 files, 241 tests (232 before: one new `expired` test, and the failure table became nine named `it.each` cases instead of one loop).
- `npm run lint`: PASS. `npx astro check`: PASS, 103 files, 0 errors, 0 warnings, 0 hints. `npm run build`: PASS.
- `npm run smoke`: PASS. 188 steps, no failure, on the rebuilt preview.
- Real-browser check (the same scratch Playwright script outside the repo, Chromium, 375 px): 21 of 21 checks pass. Three steps were added for this triage: a late failure rolls the row back and leaves focus in the field the user moved to (F1), the failure message is `role="alert"` (F2), and a tap after the session cookies are cleared ends on `/auth/signin` instead of "Could not save" (F3, F7; this is a real expired session answered by the real middleware, not a stubbed response). Break-check of the F1 step: putting the old unconditional focus back on rollback turned it red (`stayed=false`, focus on "Mark done"), and the fix turns it green; restored from a saved copy.
- Still not verified by anyone: a screen reader announcing the alert (F2 is reasoned from live-region behaviour), a real phone, and DevTools "Slow 3G" literally.

## How this was reviewed

Two independent, read-only reviewers worked on the commit (neither ran a gate or touched the database); the main session ran the gates above and re-read the code behind F1, F8 and the test findings (the focus effect, the two `CheckoffResult` declarations, the two empty maps, the request-shape test and the `applyDeltas` input test).

- Plan adherence: every contract bullet of the three "Changes Required" blocks checked against the files (all MATCH except the pending-button wording), extras listed, "NOT doing" boundaries and the Phase 4 markup assumptions checked (one `<li>` per row, `role="alert"` reserved, numbers in their own elements, smoke untouched), Progress rows compared with the diff.
- Safety, quality and patterns: CSRF and body format, XSS, module-level state inside a Worker isolate, double submit and rapid toggling, rollback correctness (including a lost response and a rollback while another control is pending), the `stale` path, timers and unhandled rejections, `keepalive`, the opaque redirect, hydration with `useSyncExternalStore` (read against react-dom 19.2), focus management, `aria-disabled`, live-region semantics, test quality, and pattern fit against `EditTaskForm`, `useFormSubmitting`, `CopyInviteLink` and `FormField`. Reasoning about React and browser behaviour is reasoned, not observed.

Checked and dismissed:

- **CSRF, XSS, per-request state in the shared module.** Clean (see Summary).
- **Guard bypass with Enter or Space on the `aria-disabled` button.** `preventDefault()` runs before `if (pending) return`, so there is no native double POST; `pointer-events-none` stops a second click.
- **Unhandled rejections.** `fetch`, `.json()` and the abort all sit inside the `try`; `sendCheckoff` cannot reject.
- **A response lost after the server committed.** The UI rolls back while the database keeps the change and the message says "Could not save". By design (the plan states a retry is safe): both routes are idempotent, so one more tap converges, and no data is corrupted.
- **A rollback while another control is pending.** Deltas are additive per user and each rollback publishes only its own ±1, so the net stays right.
- **`CheckoffAction` and `CheckoffResult` exported but imported nowhere; `CHECKOFF_TIMEOUT_MS` duplicating the private `PENDING_TIMEOUT_MS`.** The types appear in the module's own signatures, and the plan names the constant and says it equals the other bound (the comment repeats it).
- **`checkoff-client.ts:55` requires a string `period` even for a `once` task.** Stricter than the plan, but the routes always send it.
- **`handleSubmit` has no automated test (pending guard, rollback order, stale reload, focus).** The plan excludes DOM and e2e tests of the island (test-plan §7); it was exercised by the scratch Playwright run above.
- **The `applyDeltas` oracle sits above its `describe` instead of at the top of the file.** The file's top-of-file oracle belongs to the older tests; the new block's world is derived by hand in the comment directly above it.

## Findings

### F1 — A late rollback pulls focus back to the row's button

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/tasks/CheckoffControl.tsx:57-59 (with :79-88)
- **Detail**: The focus effect `useEffect(() => { if (hasToggled.current) buttonRef.current?.focus(); }, [checked])` runs on every change of `checked` once `hasToggled` is true, and `hasToggled` is never reset. That includes the rollback `setChecked(!next)` at :86, which runs after the `await`, up to 15 s after the tap. Scenario: the user taps "Mark done" on a flaky connection, the row flips and focus moves to Undo; they move on, for example into the "Task title" field, and start typing; the request fails, `setChecked(!next)` fires the effect and `focus()` pulls focus back to this row; the next Space keystroke (typing "Read book") activates the button and ticks the task again. The mechanism is in the file; how often it bites depends on slow failures plus a user who has moved on (reasoned, not observed in a browser).
- **Fix**: Replace the never-reset `hasToggled` with a `focusAfterRender` ref that the tap path sets to true and the rollback path sets only when focus has not moved: before `setChecked(!next)`, `focusAfterRender.current = document.activeElement === buttonRef.current || document.activeElement === document.body`; the effect focuses only when the flag is set and clears it.
  - Strength: Keeps both behaviours the manual row 5.9 relies on (focus lands on the new button after each toggle, and returns to the restored button after a rollback when the user stayed put) and stops the focus theft; it also removes a flag that is never reset.
  - Tradeoff: A few more lines in the component, and the logic stays manual-only (the plan excludes DOM tests).
  - Confidence: HIGH on the mechanism (the effect dependencies and the ref are in the file); MED on the frequency.
  - Blind spot: Not reproduced in a browser; after the focused button unmounts the active element is `body`, which the check accepts.
- **Decision**: FIXED. In `CheckoffControl.tsx` the never-reset `hasToggled` ref became `focusAfterRender`: the tap path sets it, the effect focuses the button once and clears it, and the rollback sets it only when `document.activeElement` is still the button or `body`, evaluated before `setChecked(!next)`.

### F2 — The failure message is mounted already filled, so a screen reader may not announce it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/tasks/CheckoffControl.tsx:132-136
- **Detail**: `{message && <p role="status" ...>{message}</p>}` inserts the live region together with its text. Many screen readers (NVDA and JAWS in particular) do not announce a polite live region that arrives already populated, so for a screen-reader user a failed save is silent: the row and the button label simply revert and they believe the save worked (reasoned, medium confidence). The neighbours do it differently: `src/components/groups/CopyInviteLink.tsx:66` keeps an always-mounted `<p role="status">` and fills it, and `src/components/auth/FormField.tsx:61` uses `role="alert"` on insertion. The plan prescribes `role="status"` and says "never `role="alert"`" for this message (Critical Implementation Details), so either fix changes plan text.
- **Fix A ⭐ Recommended**: Use `role="alert"` for the message.
  - Strength: Announced on insertion by every screen reader; it is the pattern `FormField` already uses for a rejected action; smoke reads only server HTML, where this message never exists, so `NO_ERROR_ALERT` is unaffected.
  - Tradeoff: Contradicts the plan sentence "never `role="alert"`" (which then needs an update), and an assertive announcement interrupts the user, which for a failed save is appropriate.
  - Confidence: HIGH — the same pattern is in the repo and the live-region behaviour is well known.
  - Blind spot: No screen reader was run here.
- **Fix B**: Keep `role="status"` but mount a visually hidden live region (`sr-only`) in every control from the start and fill it, keeping the visible text separate.
  - Strength: Stays with the plan wording and is polite.
  - Tradeoff: One more element in every task row of the server HTML, a hidden duplicate of the visible message, and `empty:hidden` cannot be used on it.
  - Confidence: MED — it follows `CopyInviteLink`, but the extra element in the markup the smoke regexes scan was not checked.
  - Blind spot: Whether an empty `sr-only` paragraph changes the row layout or any smoke regex.
- **Decision**: FIXED via Fix A. The failure message in `CheckoffControl.tsx` is now `role="alert"`. Checked first: `role="alert"` appears in `src` only in `ui/alert.tsx` and `auth/FormField.tsx`, and `scripts/smoke.mjs` matches it in server HTML only, where this client-only message never exists. `plan.md` follows: the Critical Implementation Details line on smoke-visible markup and the Phase 5 §2 contract now say `role="alert"`, with the reason.

### F3 — An expired session ends in a "Try again" message that cannot succeed

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/checkoff-client.ts:52 (with src/components/tasks/CheckoffControl.tsx:86-88)
- **Detail**: In a browser `redirect: "manual"` answers an opaque redirect (`type: "opaqueredirect"`, `status: 0`), which hits `status !== 200` and becomes `failed`. A user whose session expired, or who signed out in another tab, then sees "Could not save. Try again." after every tap and is never pointed at sign-in. The plan chose this mapping on purpose (Phase 5 §1: "opaque redirect from an expired session" is `failed`; Phase 3's smoke step asserts the 302 that "Phase 5 maps to `failed`"), so this is a plan-level UX choice, not drift. It may be rare: `@supabase/ssr` in the middleware can refresh an expiring token before the route runs.
- **Fix**: Add a result kind `expired` for an opaque redirect (and any 3xx status in non-browser fetches); the control rolls back as for `failed` and then calls `window.location.reload()`, which the middleware turns into the sign-in page.
  - Strength: The user lands on the sign-in page instead of retrying a request that cannot succeed; one more row in the client unit table covers it.
  - Tradeoff: The plan's mapping changes (one more kind, one more control branch), and a reload discards the page state.
  - Confidence: MED — the middleware redirect for `/dashboard` is existing behaviour, but it was not exercised against a truly expired session here.
  - Blind spot: Whether the middleware refreshes an expiring token silently, which would make the case rarer than assumed.
- **Decision**: FIXED. Test-first: `tests/unit/checkoff-client.test.ts` got an `expired` oracle line and a test (a real 302 and an opaque-redirect stand-in), the two redirect answers left the `failed` table, and the new test failed red (`failed` instead of `expired`). Then `sendCheckoff` returns `{ kind: "expired" }` for `type === "opaqueredirect"` or any 3xx status, and `CheckoffControl.tsx` rolls the row and the board back and calls `window.location.reload()` for it (no message, since the page is leaving). The client test file is green (8 tests), lint and `astro check` are clean. `plan.md` follows in four places: Phase 3 smoke note ("maps to `expired`"), Phase 5 §1 result kinds, §2 outcomes, §3 unit-test contract. Not verified against a truly expired session in a browser (the rollback-then-reload path is covered by the browser check at the end of the triage).

### F4 — The plan says the pending button is "disabled"; the code uses `aria-disabled` and a guard

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/tasks/CheckoffControl.tsx:19-21, :63, :104, :119
- **Detail**: Plan Phase 5 §2 says "While a request is pending the button is disabled." The code uses `aria-disabled`, `pointer-events-none opacity-50` and `if (pending) return`. The reason is in the component comment and the commit message: a `disabled` button cannot take `.focus()`, and the replacement button is rendered while `pending` is still true, so the plan's own focus requirement collides with its pending requirement. The deviation is justified and the guard holds (see "Checked and dismissed"). A side effect: for the length of the request, focus sits on a button that assistive technology reads as unavailable. The plan text should say what was built, otherwise the full-plan review will read it as drift.
- **Fix**: Update the Phase 5 §2 sentence in `plan.md` to describe `aria-disabled` plus the pending guard and the focus reason.
- **Decision**: FIXED. Phase 5 §2 of `plan.md` now says the pending button is `aria-disabled` (dimmed, no pointer events) with a pending guard that ignores a second submit, and why it is not `disabled` (a disabled button cannot take the focus that has to move to it right after the tap).

### F5 — `applyDeltas` is not in the plan's file list

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/leaderboard-rules.ts:65-73
- **Detail**: The plan lists no change to `leaderboard-rules.ts` for Phase 5, only the extended unit test "base totals plus a viewer delta re-rank to the same result as recomputing the totals from scratch", which needs a pure function to call. `applyDeltas` is that function, and `Leaderboard.tsx` uses it. Nine lines, pure, browser-safe, covered by three tests; harmless.
- **Fix**: Add `src/lib/leaderboard-rules.ts` (`applyDeltas`) to the Phase 5 §2 and §3 text in `plan.md`, in the same edit as F4.
- **Decision**: FIXED. Phase 5 §2 of `plan.md` lists `src/lib/leaderboard-rules.ts` among its files and says the Leaderboard totals come from the pure `applyDeltas(rows, deltas)`. The extended `leaderboard-rules.test.ts` was already named in §3.

### F6 — Three test weaknesses in the new unit tests

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/checkoff-client.test.ts:56-57 and :95-99; tests/unit/leaderboard-rules.test.ts:399-407
- **Detail**: (a) The CSRF-critical rule "form-encoded, never JSON" is pinned only by `expect(init.body).toBeInstanceOf(URLSearchParams)`; a later explicit `Content-Type: application/json` header would still pass. (b) The failure table runs 11 answers in one `it` with a `for` loop, so a red run does not say which answer broke. (c) "does not change its input" applies only a delta for `nobody`, so no row is touched and `base` could not change; an in-place update of a listed row would be caught only incidentally by the first `applyDeltas` test, because it reuses `base`.
- **Fix**: (a) add `expect(new Headers(init.headers).has("Content-Type")).toBe(false)` (the browser derives urlencoded from the `URLSearchParams` body); (b) turn the loop into `it.each` with a name per answer; (c) apply a delta for a listed user too (for example `user-b: 1`) and keep the `copy` comparison.
- **Decision**: FIXED. (a) The request-shape test now also asserts that no `Content-Type` header is set. (b) The failure table is an `it.each` with a name per answer (nine rows). (c) The `applyDeltas` input test applies `user-b: +1` next to `nobody: +5`, expects `{ user-a: 2, user-b: 2, user-c: 0 }` (A 2, B 1+1, C 0 from the oracle in the comment above it) and keeps the `base` equals `copy` check. Break-checks, each restored from a saved copy: adding `"Content-Type": "application/json"` to the request turns the request-shape test red; making `applyDeltas` update its rows in place turns the new input test red (before, only the first `applyDeltas` test caught it, by accident).

### F7 — After a `stale` answer the row is tappable again until the reload lands

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/tasks/CheckoffControl.tsx:79-84
- **Detail**: `setPending(false)` runs before the `stale` branch, so between the answer and the moment the new document commits the optimistic row is tappable, and a tap would send the opposite action for the new period. It needs a page left open across Warsaw midnight plus a tap inside the reload window; no corruption is possible, because the server is the source of truth after the reload.
- **Fix**: On `stale`, call `window.location.reload()` and return before `setPending(false)`, so the button stays `aria-disabled` until the reload.
- **Decision**: FIXED. In `CheckoffControl.tsx` `setPending(false)` now runs only on the paths that stay on the page: after `saved`, and after a `rejected` or `failed` rollback. `stale` and (from F3) `expired` call `window.location.reload()` and return with the button still pending, so it stays `aria-disabled` until the new page replaces this one.

### F8 — Two small duplications in the new modules

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/checkoff-client.ts:16 (with src/lib/checkoff-response.ts:5); src/lib/checkoff-sync.ts:8 (with src/components/hooks/useCheckoffDeltas.ts:4)
- **Detail**: (a) Two exported types are named `CheckoffResult`: the client's (`saved`, `stale`, `rejected`, `failed`) and the response helper's (`ok`, `forbidden`, `unknown`, `invalid`, `not_configured`, `gone`); a wrong auto-import compiles only until a `kind` is compared. (b) The store starts from its own `new Map()` while the hook's server snapshot is a different `NO_DELTAS` map. React hydrates with the server snapshot and then sees a different identity from `getSnapshot()`, so every Leaderboard hydration does one extra, identical render (reasoned from react-dom 19.2; harmless).
- **Fix**: Rename the client's type to `CheckoffSendResult`; export one `NO_DELTAS` from `checkoff-sync.ts` and use it both as the store's initial snapshot and as the hook's server snapshot.
- **Decision**: FIXED. `checkoff-client.ts` exports `CheckoffSendResult` (nothing imported the old name). `checkoff-sync.ts` exports `NO_DELTAS` and starts from it; `useCheckoffDeltas.ts` imports it as the server snapshot instead of its own map, so an island that hydrates before any tap sees the same snapshot from `getSnapshot()` and `getServerSnapshot()` and needs no extra render. The private `CHECKOFF_TIMEOUT_MS` copy of `PENDING_TIMEOUT_MS` stays, as the plan names it.
