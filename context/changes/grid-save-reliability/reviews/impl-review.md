<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Grid save reliability (S-22)

- **Plan**: context/changes/grid-save-reliability/plan.md
- **Scope**: Full plan (Phase 2 has only Manual rows, nothing to review in code)
- **Reviewed phases**: 1
- **Date**: 2026-10-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations (F6 added from the PR review comment)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria: the cheap Automated commands were re-run on HEAD 062fc93 (unit 754 passed, lint, `astro check` 0 errors, prettier on the change files, build); smoke, e2e, mutation, screenshots and the red proof ran in the implementation run on the same code (d285949). Manual rows 1.9-1.11 and 2.1-2.4 are unticked, none ticked without evidence.

## Findings

### F1 — A late result of the old request is not harmless after a bfcache restore

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/tasks/CheckoffControl.tsx:64-66, 78-121
- **Detail**: The `pageshow` reset clears `pending` while the old `handleSubmit` is still awaiting with its own `next` and `delta`. If the user taps again after the restore (an undo), the old request's late result still runs the tail: on `saved` it calls `setPending(false)` while the new request is in flight (double submit possible); on `failed` it publishes `-delta` a second time (Leaderboard decremented twice), sets "Could not save" and sends a second beacon even if the new request succeeded. The comment calls this "harmless"; it is only harmless when the user does nothing after the restore.
- **Fix**: Keep a per-tap token (`const tapId = useRef(0)`); increment it in `handleSubmit` and in the `pageshow` handler, and after `await sendCheckoff` return early when the captured id differs from `tapId.current`.
  - Strength: Removes the whole class with a few lines; the e2e and unit gates are unaffected.
  - Tradeoff: A superseded request's rollback is dropped, so a dead old request leaves the optimistic state until the next reload (the same as before this change).
  - Confidence: HIGH — the interleaving is read from the code; Playwright cannot force a bfcache restore, so it is not reproduced in a test.
  - Blind spot: No island test exists to pin it (the repo has no DOM runner).
- **Decision**: FIXED via Fix now. A per-tap token (`tapId`) in `CheckoffControl.tsx`: the answer to a tap that a newer tap has superseded no longer un-pends the button or rolls back, shows the message or beacons (`expired` still reloads). The token is bumped on taps only, not on `pageshow`, so a late failure with no newer tap still rolls back and reports.

### F2 — A `status` failure is silent even when the Worker never ran the route

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/checkoff-client.ts:36-39, src/components/tasks/CheckoffControl.tsx:116-119
- **Detail**: `checkoffFailureCode` returns null for `status` because "the route has logged it". That holds for the app's own 5xx and the middleware 503, not for Cloudflare edge or Worker-level answers that never reach app code (1101/1102, 429, a proxy 502). Those reach the client as `status`, so the operator learns nothing, the failure this slice is meant to surface. The plan chose this on purpose (no beacon for a server answer, to avoid doubling server lines).
- **Fix**: Accept the blind spot and say so: reword the two comments and note it in the PR and in the plan's "NOT doing" list as a known limit.
  - Strength: Keeps the plan's decision, no new Sentry noise.
  - Tradeoff: Edge-level failures stay invisible.
  - Confidence: HIGH — nothing in the diff reports a `status` failure.
  - Blind spot: How often the edge answers a non-app 5xx on these routes is unmeasured.
- **Decision**: FIXED via Fix now (comments only). The `status` doc in `checkoff-client.ts` and the island comment now name the blind spot (an edge answer that never reached the route leaves no trace); to be stated as a known limit in the PR.

### F3 — Two comments are stale or garbled

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/checkoff-client.ts:6, src/components/tasks/CheckoffControl.tsx:117
- **Detail**: `CHECKOFF_TIMEOUT_MS`'s doc still says a tap waits "the bound of `PENDING_TIMEOUT_MS`", but a tap now waits up to two attempts (about 30 s). The island comment "`status` is null because the route has logged it" says the wrong thing is null (the code is null for reason `status`).
- **Fix**: State "per attempt, at most two attempts" in the first and "no code for `status`: the route has logged it" in the second.
- **Decision**: FIXED via Fix now. The `CHECKOFF_TIMEOUT_MS` doc says one attempt, at most two per tap; the island comment was reworded under F2.

### F4 — A 200 whose body is cut mid-read is final, though a retry would converge

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/checkoff-client.ts:93-99
- **Detail**: When `response.json()` rejects with a `TypeError` (connection dropped mid-body, our abort not fired), the reason is `body`: no retry, rollback, beacon. The server has saved the tick. Same outcome as before this change; the plan defines a non-parsable body as `body`.
- **Fix**: Leave as planned; optionally treat a non-`SyntaxError` rejection as `network` in a later slice.
- **Decision**: FIXED via Fix now, a deliberate deviation from the plan's `body` definition: a `response.json()` rejection that is not a `SyntaxError` (and not our abort) is now `network`, so it is retried and reported as `*_failed`; a non-JSON 200 stays `body`. A unit test covers both outcomes.

### F5 — `clientErrorEvent` falls back to `client.checkoff.` for any new prefix

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/client-error-codes.ts:30-32
- **Detail**: The event is chosen by `sw_`/`push_` prefix, so a future code with another prefix silently lands under `client.checkoff.`. A `Record<ClientErrorCode, string>` would make the compiler enforce each code's event.
- **Fix**: Replace the prefix test with an explicit map keyed by code; the event names stay byte for byte.
- **Decision**: FIXED via Fix now. `clientErrorEvent` reads an explicit `Record<ClientErrorCode, string>`; the eleven event names are unchanged and `client-errors.test.ts` pins all of them.

### F6 — A superseded tap's retry is still sent and can overwrite a newer tap on the server

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/checkoff-client.ts:128 (source: inline comment of `ai-review` on PR #222, repeated in the `claude-review` summary)
- **Detail**: `tapId` drops the result of a superseded tap but cannot cancel that tap's second attempt. After a bfcache restore with tap A in flight, the user taps Undo (B); A's first attempt then fails with `network` or `timeout` and the loop resends A's `checkoff` after B's `uncheck`: the server ends checked, the row shows unchecked. Reached only after a restore with a pending request plus a new tap inside the retry window, but it is the silent divergence this slice exists to remove, and the retry is new in this slice.
- **Fix**: `sendCheckoff` takes an optional `shouldRetry` predicate, asked before every further attempt; the island passes `() => tapId.current === tap`.
  - Strength: A few lines, no contract change on the routes, testable with an injected predicate.
  - Tradeoff: A first attempt that already reached the server can still land after the newer tap (as before this slice); no client-side fix exists for it.
  - Confidence: HIGH — the interleaving is read from the code.
  - Blind spot: The island's wiring of the predicate has no test (no DOM runner); whether browsers keep a page with an in-flight fetch in the bfcache is unverified (manual row 1.11).
- **Decision**: FIXED via Fix now. `shouldRetry` added (default: always retry); unit tests cover a veto after `network`, a veto after `timeout`, an allowed retry and that the predicate is not asked when there is nothing to retry.

## Triage summary

- Fixed: F1, F2, F3, F4, F5, F6 (6)
- Skipped / accepted / lessons: none

Re-verified after the fixes: unit 759 passed, lint, `astro check` 0 errors, prettier on the changed files, narrowed mutation run on `checkoff-client.ts` (96.21 %, 126 killed, 1 timeout, 5 survivors that are the same equivalent mutants as before, no runtime mutant without a test), e2e round trip 9/9 in both projects, smoke clean in 3 consecutive runs after one run with `client error endpoint rejects a JSON body -> 500` (not reproduced; an earlier smoke run right after a cold preview start also reported one failed step that was not identified).

After F6: unit 762 passed, lint clean, `astro check` 0 errors, narrowed mutation 96.35 % (129 killed, 3 timeouts, the same 5 equivalent survivors, no mutant without a test), e2e round trip 9/9.
