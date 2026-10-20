# Grid save reliability (S-22) Implementation Plan

## Overview

A check-off that fails in the browser today ends as a line of text in the task row and nothing else: no retry, no reconciliation with the server, no trace for the operator. This plan gives the island's `failed` branch the two things it lacks, one automatic retry when no server answer arrived (so a lost response converges through the idempotent routes) and a fixed error code sent through the existing `POST /api/client-errors` channel (so the operator learns that saves fail), and fixes the pending state left stuck after a back/forward-cache restore. The optimistic tick, the route contracts, the user-facing texts and the 15 s bound per attempt stay as they are (frame, 2026-10-20: the save stays optimistic).

## Current State Analysis

- **One-way reporting.** `src/lib/checkoff-client.ts:61-63` turns every thrown fetch and the 15 s abort (`:33-36`) into `{ kind: "failed" }`, a non-200 status into the same kind (`:56`) and an unusable 200 body too (`:59`), with no reporting import in the file. `src/components/tasks/CheckoffControl.tsx:93-104` rolls the row, the cell and the Leaderboard back and sets "Could not save. Try again." (`:17`) in a `<p role="alert">` (`:152-156`); it sends nothing anywhere. The browser has no Sentry SDK (`package.json`: only `@sentry/cloudflare`).
- **The sanctioned channel is PWA-only.** `src/lib/pwa/register.ts:7-16` holds the closed list `CLIENT_ERROR_CODES` (2 service-worker and 5 push codes) and `CLIENT_ERRORS_PATH` (`:19`); `src/lib/pwa/push.ts:56-57` is the beacon pattern (`env.sendBeacon(CLIENT_ERRORS_PATH, code)`); `src/pages/api/client-errors.ts:30-33` answers 400 to any other string and reports every accepted code as `client.sw.<code>` with `requestFields(context)`. Sentry groups by `[event, code]` (`src/lib/log.ts:81`; for `new Error(code)` the code field is `none`, so the event name carries the grouping). `tests/unit/client-errors.test.ts:22-31` pins the event per code, `scripts/smoke.mjs:845-858` pins accept/unknown/foreign-origin/JSON, and README `:183`, `:431` and CLAUDE.md describe the channel as service-worker-only.
- **Convergence is free but unused.** `src/lib/checkoffs.ts:65` treats 23505 as `ok` and `:96` a zero-row delete as `ok`; `checkoff-client.ts:22` says a retry after a false timeout is safe; the 15 s abort is client-side only, the Worker finishes the insert (frame, H4). Nothing re-reads the server after a failure.
- **A stuck button after a restore.** `src/components/hooks/useFormSubmitting.ts:24-30` resets the native forms' flag on a persisted `pageshow`; the island keeps its own `pending` (`CheckoffControl.tsx:50`) and has no such reset, so a page restored from the back/forward cache with a request in flight keeps the button dimmed and ignored (`:66`) for good.
- **What pins the behaviour.** `tests/unit/checkoff-client.test.ts` (fake timers, injectable fetch, `:110-134` the abort); `tests/e2e/checkoff-round-trip.spec.ts:155-188` (a 500 stub, rollback asserted, no alert text, no request count); `scripts/ui-screenshots.mjs:241-277` (`checkoff-pending` by holding the request, `checkoff-failed` by a 500 waiting for the alert text, both in the `controls` set); smoke's 200-body regex (`scripts/smoke.mjs:135-139`); no React component test infrastructure (the unit project renders to a string only, no DOM, no testing-library).
- **Decided upstream.** Frame (2026-10-20): the problem is the browser's silence and the missing reconciliation, not the save mode; the save stays optimistic; `stale`, `expired` and the no-JS `gone` are second-order; the owner reads the operator's trace in Sentry. Plan interview (2026-10-20): fixed codes through the existing channel; one automatic retry when no server answer arrived; the bfcache reset is in, the other silent branches are out; no new pending signal.

## Desired End State

After a tap, the island flips at once as today. If the request throws or hits the 15 s abort, the island sends it once more without any visible change; if that attempt is answered, the row ends in the server's state. Only when the second attempt fails too does the row roll back, show "Could not save. Try again." and send a fixed code (`checkoff_failed`, `checkoff_timeout`, `uncheck_failed` or `uncheck_timeout`) to `POST /api/client-errors`, which reports it as `client.checkoff.<code>` to Workers Logs and Sentry. A non-200 answer (the server has logged it) is shown without a retry or a beacon, as today. A page restored from the back/forward cache has a live button. The seven PWA codes keep their `client.sw.<code>` events.

Verify: `npm run test:unit`, the narrowed mutation run on `checkoff-client.ts`, `npm run smoke`, `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`, the `controls` screenshot run, and on production a posted code visible in Sentry plus the owner's airplane-mode tap on Android.

### Key Discoveries:

- The retry belongs in `sendCheckoff`: it already takes an injectable `fetch` and is driven by fake timers, so "two attempts, each with its own abort" is a unit-testable contract and the island stays a consumer of one result.
- The beacon decision needs the failure's cause: a reason on the `failed` result (`network`, `timeout`, `body`, `status`) decides both the retry (`network`, `timeout`) and the beacon (`network`, `timeout`, `body`), and keeps "the server answered and logged it" (`status`) silent on the client.
- The e2e 500 stub is a `status` failure, so under the new rule it still produces exactly one request; asserting that count turns the existing test into a guard against retrying on a server answer.
- Moving the code list out of `src/lib/pwa/register.ts` into a module that also owns the code-to-event map keeps the route, the push helper and the island importing one source; `register.ts` and `push.ts` only change their import.
- `sendBeacon` cannot leave a device that is offline, so an airplane-mode tap ends in the alert and the rollback but not in a Sentry event; the event reaches the operator for an unreachable Worker, a dropped connection with the network back, and a timeout (frame, Key Discoveries of this plan: a limit to record, not to fix).

## What We're NOT Doing

- No change to the optimistic tick, the two routes, their outcome kinds, statuses, redirects or the 200 body (`scripts/smoke.mjs:135-139` pins it byte for byte), and no new user-facing text: "Could not save. Try again." and "This task is no longer available. Reload the page." stay.
- No new pending element (spinner, "Saving…" line) and no change of `CHECKOFF_TIMEOUT_MS`; the dimmed button stays the only sign of a wait, now for up to two attempts.
- No beacon for `rejected` (the server logs `checkoff.task_gone`, `*.forbidden`, `*.not_enrolled`), for `expired` or `stale` (not save failures; frame: second-order) and no toast for the no-JS `gone` redirect.
- No "recovered" code when the retry succeeds, and no context payload (status, elapsed time) in the beacon: the body stays a bare code from a closed list.
- No offline detection, no queue, no retry after the second attempt, no service-worker `fetch` handler (PRD non-goal `context/foundation/prd.md:155`); a tap with no network at all leaves no operator trace.
- No browser Sentry SDK, no rate limit on `/api/client-errors` (README `:431` known risk unchanged), no change to the privacy policy unless the check in Phase 1 finds its "error reports" wording wrong.
- No latency measurement (owner, `roadmap.md:26`) and no edit of `src/lib/checkoff-sync.ts`, `src/components/tasks/ViewerGridCell.tsx` or `src/components/hooks/useFormSubmitting.ts`.
- No React component unit test for the island: the repo has no DOM test runner, and the e2e spec covers the island's behaviour.

## Implementation Approach

Three small contracts, each in the file that already owns the concern. (1) `sendCheckoff` gains a second attempt for a failure with no server answer and returns the failure's reason. (2) A new `src/lib/client-error-codes.ts` owns the code list, the path and the code-to-event map; the route reports through the map; the PWA helpers import from the new module. (3) The island reacts to the final result: beacon on `network`, `timeout` and `body`, rollback and alert as today, and a `pageshow` reset mirrored from `useFormSubmitting`. The gates grow in place: the unit oracle of the protocol, the route's unit test, two smoke steps, three e2e cases, the existing screenshots re-run, and the docs that describe the channel.

## Critical Implementation Details

- **Timing.** The retry starts at once and carries its own 15 s `AbortController`; the worst case before the alert is about 30 s. Tell an abort from a thrown fetch by the signal's `aborted` flag inside the `catch`, not by the error's name (the fake-timer test rejects with a `DOMException`, a browser may throw a `TypeError`); a throw after the response arrived (`response.json()` on a non-JSON 200) is `body` and is not retried. `pending` (`CheckoffControl.tsx:66`) guards double taps across both attempts without change.
- **Retry only without a server answer.** `status` (any non-200, non-3xx, non-403/404) means the Worker ran the route and logged the failure; retrying would double the server lines and, on a 503 `unavailable` with `Retry-After: 30`, hammer an outage. The e2e 500 test asserts one request for that reason.
- **Event names are a Sentry contract.** The seven existing codes must keep `client.sw.<code>` byte for byte (open issues group by it; README `:431`). New codes map to `client.checkoff.<code>`; the route's unit test asserts both prefixes.
- **Beacons in Playwright.** A `sendBeacon` request shows in Chromium's request log (resource type `ping`); start `page.waitForRequest` on the `/api/client-errors` path before the click. The local route accepts the code (it is on the list) and answers 204, so no stub is needed for the beacon itself; stub only `**/api/tasks/checkoff`. No spec in the repo observes a beacon yet (Playwright 1.63.0): if `waitForRequest` never sees the `ping`, the fallback is a `page.addInitScript` that replaces `navigator.sendBeacon` with a recorder (`window.__beacons.push([url, data])`, returning `true`) read back with `page.evaluate`, not a `page.route` on the path, which would miss the beacon for the same reason.
- **bfcache in a test.** Playwright cannot force a back/forward-cache restore reliably, so the `pageshow` reset is pinned by the pattern (same as `useFormSubmitting`) and a manual row, not by e2e.

## Phase 1: Reliable save path and gates

### Overview

Retry and reasons in the client protocol, the check-off codes and the event map in the client-error channel, the island's beacon and `pageshow` reset, every automated gate and the docs, in one commit on `s-22/grid-save-reliability/implementation`.

### Changes Required:

#### 1. Client protocol: a second attempt and a reason

**File**: `src/lib/checkoff-client.ts`

**Intent**: Make a failure with no server answer try once more before it is reported, and tell the island why the request failed so it can pick the code and skip the beacon when the server already logged the failure.

**Contract**: `CheckoffSendResult`'s `failed` variant becomes `{ kind: "failed"; reason: CheckoffFailureReason }` with `type CheckoffFailureReason = "network" | "timeout" | "status" | "body"`: `network` for a fetch that throws before a response arrived, `timeout` for the abort (before or while the body is read), `status` for a non-200 answer that is not a redirect, 403 or 404, `body` for a 200 whose body is not `{ ok: true, period: string }`, including a body that `response.json()` cannot parse (an HTML 200 throws there today: read the body in its own `try`, or set a flag once the response arrived, so that throw is `body`, not `network`). `sendCheckoff(action, taskId, expectedPeriod, fetchImpl = fetch, attempts = 2)` makes up to `attempts` attempts, each with its own 15 s abort, and goes on to the next attempt only after `network` or `timeout`; the result is the last attempt's. Export `checkoffFailureCode(action: CheckoffAction, reason: CheckoffFailureReason): ClientErrorCode | null` (`network` and `body` → `<action>_failed`, `timeout` → `<action>_timeout`, `status` → `null`) and `reportCheckoffFailure(code: ClientErrorCode, beacon = defaultBeacon): void`, where `defaultBeacon` calls `navigator.sendBeacon(CLIENT_ERRORS_PATH, code)` only when `navigator` and `sendBeacon` exist (the module must stay importable without a DOM). Update the doc comment at `:10-24`.

#### 2. Client-error channel: one module for codes, path and events

**File**: `src/lib/client-error-codes.ts` (new), `src/lib/pwa/register.ts`, `src/lib/pwa/push.ts`, `src/pages/api/client-errors.ts`, `tests/unit/push.test.ts`, `tests/unit/pwa-register.test.ts`

**Intent**: Let a non-PWA code enter the channel with its own event family without touching the seven existing events.

**Contract**: `src/lib/client-error-codes.ts` exports `CLIENT_ERROR_CODES` (the seven codes plus `checkoff_failed`, `checkoff_timeout`, `uncheck_failed`, `uncheck_timeout`), `ClientErrorCode`, `CLIENT_ERRORS_PATH` and `clientErrorEvent(code: ClientErrorCode): string`, which returns `client.sw.<code>` for the `sw_*` and `push_*` codes and `client.checkoff.<code>` for the four new ones. `register.ts` and `push.ts` import the constants from the new module (`register.ts` keeps nothing of the list), and so do the two tests that reach them today: `tests/unit/push.test.ts:12` (`CLIENT_ERRORS_PATH`, `CLIENT_ERROR_CODES`) and `tests/unit/pwa-register.test.ts:3` (`CLIENT_ERRORS_PATH`) change their import source to `@/lib/client-error-codes`; their assertions do not change. The route keeps its media type, length and list checks and reports `reportError(clientErrorEvent(code), new Error(code), requestFields(context))`; its answers (204/400/413/415) and `Cache-Control: no-store` do not change.

#### 3. Island: beacon on the final failure, live button after a restore

**File**: `src/components/tasks/CheckoffControl.tsx`

**Intent**: Report a browser-side save failure to the operator after the rollback, and never leave the button dimmed on a page restored from the back/forward cache.

**Contract**: In `handleSubmit`, after the rollback and `setMessage(FAILURE_MESSAGES[result.kind])` for `failed`, call `reportCheckoffFailure(code)` when `checkoffFailureCode(action, result.reason)` is not `null`; `rejected`, `expired` and `stale` send nothing. Add a `useEffect` that listens to `pageshow` and, when `event.persisted`, sets `pending` to `false` (the message stays; a late result of the old request still runs `handleSubmit`'s tail and is harmless). The markup (`:107-157`), the texts (`:15-18`), `PENDING_STYLE` (`:22`) and the focus rules (`:57-62`, `:94`) do not change, so smoke's row matchers and the screenshot states keep their look.

#### 4. Unit tests

**File**: `tests/unit/checkoff-client.test.ts`, `tests/unit/client-errors.test.ts`

**Intent**: Pin the two-attempt rule, the reasons, the code mapping and the event map.

**Contract**: In `checkoff-client.test.ts` update the oracle comment (`:1-16`) and the `failed` expectations to carry `reason`; add cases: a thrown fetch then a 200 → `saved` with two recorded requests; an abort then a 200 → `saved`, the second attempt starting right after 15 000 ms; two thrown fetches → `{ kind: "failed", reason: "network" }` with two requests; two aborts → `reason: "timeout"` resolving at 30 000 ms with both signals aborted; a 500 → `reason: "status"` with exactly one request; a 200 with `{}` → `reason: "body"` with one request; an HTML page with status 200 (the existing oracle row) → `reason: "body"` with one request, no retry; `attempts = 1` restores the single-attempt behaviour; `checkoffFailureCode` for the eight (action, reason) pairs; `reportCheckoffFailure` calls the injected beacon with `CLIENT_ERRORS_PATH` and the code. In `client-errors.test.ts` extend the `it.each` to the four new codes with the `client.checkoff.` prefix, keep the two `sw_` codes on `client.sw.`, and add `push_subscribe_failed` → `client.sw.push_subscribe_failed` so the map is pinned for all three families.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Prove on a built server that the channel accepts a check-off code and still refuses the rest.

**Contract**: Two steps next to `:845-858`: "client error endpoint accepts a check-off code" (`clientError("checkoff_failed")` → 204 with `no-store`) and "client error endpoint accepts an undo timeout code" (`clientError("uncheck_timeout")` → 204). The unknown-code, foreign-origin and JSON steps stay. No dashboard step changes: the island's alert and the beacon exist only after a tap in a browser.

#### 6. E2E

**File**: `tests/e2e/checkoff-round-trip.spec.ts`

**Intent**: Pin the island's behaviour under the three failure shapes the unit test cannot drive through React.

**Contract**: (a) Extend the existing 500 test (`:155-188`): count the `**/api/tasks/checkoff` requests and assert exactly one, and assert `row.getByRole("alert")` has text "Could not save. Try again.". (b) New test "an aborted request is retried and the tick converges": `page.route("**/api/tasks/checkoff")` aborts the first call (`route.abort("connectionfailed")`) and lets the second through (`route.fallback()` or `route.continue()`); after the click the row stays "Done today", the cell stays `done`, no alert appears, and after `page.reload()` the row is still ticked (the server has the row). (c) New test "two aborted attempts roll back and send the code": both calls aborted; `page.waitForRequest` on `/api/client-errors` started before the click resolves with `postData() === "checkoff_failed"` and the request's method POST; the row, the cell and the board roll back; the alert shows the text. Both projects (`chromium`, `mobile-chromium`) run all three.

#### 7. Screenshot gate

**File**: none (run only)

**Intent**: Show that the pending and failed states look as they did after S-21.

**Contract**: `OUT_DIR=<scratch> BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs phase-1 controls` against a running `astro dev` ends with "All screenshots taken"; `checkoff-pending`, `leaderboard-pending` and `checkoff-failed` are compared by the owner with the S-21 run (manual row). No PNG is committed: nothing visible changes.

#### 8. Docs and the privacy check

**File**: `README.md`, `CLAUDE.md`, `src/components/privacy/WhatWeCollect.astro` (check only)

**Intent**: Keep the written contract of the channel true.

**Contract**: README `:183`: the route takes a fixed client error code (service worker, reminders or check-off) and reports it as `client.sw.<code>` or `client.checkoff.<code>`; README `:431`: the known-risk sentence names both prefixes. CLAUDE.md, the "Installable app" bullet: the route description names the three code families and `src/lib/client-error-codes.ts`; add one sentence to the Architecture list about the island's retry and beacon. Read `WhatWeCollect.astro:37-42` once: "error reports, which identify you only by your user id and never contain cookies, headers, request bodies or query strings" covers a bare code with `requestFields`; change nothing unless that reading fails, and say so in the PR.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the two-attempt, reason, code-mapping and event-map cases: `npm run test:unit`
- Lint, format and types pass: `npm run lint`, `npx prettier --check context/changes/grid-save-reliability README.md CLAUDE.md`, `npx astro check`
- Build passes: `npm run build`
- Narrowed mutation run on the protocol: `npm run test:mutation -- --mutate src/lib/checkoff-client.ts --logLevel info` finishes with every runtime mutant that is not `Timeout` at `testsCompleted >= 1` (a `Timeout` mutant, such as the one removing `controller.abort()`, is detected, not survived: `context/foundation/mutation-baseline.md:39`), and each survivor is listed in the PR with a one-line verdict
- Smoke passes with the two new client-error steps: `npm run smoke`
- E2E round trip passes in both projects with the extended 500 test, the retry test and the beacon test: `npx playwright test tests/e2e/checkoff-round-trip.spec.ts`
- Screenshot gate ends with "All screenshots taken" for the `controls` set at 360, 375 and 1280 px: `OUT_DIR=<scratch> BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs phase-1 controls`
- Red proof: with `git stash push -- src/lib/checkoff-client.ts src/pages/api/client-errors.ts src/components/tasks/CheckoffControl.tsx`, `npm run test:unit` fails in `checkoff-client.test.ts` and `client-errors.test.ts`, and the retry and beacon e2e tests fail against a rebuilt preview (stop the running preview daemon first with `npx astro preview stop`, so Playwright's `webServer` rebuilds `dist` from the stashed sources instead of reusing the green build: `reuseExistingServer` is on outside CI); after `git stash pop`, stop the preview again and all pass against the rebuilt code

#### Manual Verification:

- Owner compares `checkoff-pending`, `leaderboard-pending` and `checkoff-failed` from the `controls` run with the S-21 run at 360, 375 and 1280 px: the dimmed button and "Could not save. Try again." look the same
- In a browser against `astro preview` with DevTools blocking the request URL `/api/tasks/checkoff`: a tap flips the row, two blocked attempts follow at once, the row rolls back with the alert, and the Network panel shows one `POST /api/client-errors` with body `checkoff_failed` answered 204; with the block lifted a tap saves and no beacon is sent
- Back/forward cache: tap "Mark done" while the request is throttled, open Settings from the nav before it answers, press Back: the dashboard's button is not dimmed and a tap works (DevTools Application → Back/forward cache tells whether the page was restored or reloaded; both outcomes pass)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Release and production check

### Overview

Close the slice as the lessons say: merge, approve the `release` run, check production, and prove the channel end to end from the owner's device and from Sentry.

### Changes Required:

#### 1. Release record

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the release and the owner's checks where every slice records them.

**Contract**: A "Phase 30 — Save reliability (change `grid-save-reliability`, S-22)" entry in the Phase 29 format: PR, merge commit, master run, `release` job and approver, "no migrations", the live check, the posted-code check and the Android rows below, with open rows kept as `[ ]` until the owner reports. The roadmap status of S-22 is moved by `/10x-archive`; the Unknowns note is already in place from the frame.

### Success Criteria:

#### Manual Verification:

- PR merged to `master` and the `release` run approved by the owner (no migrations); the live check passes: `/` 200, `/privacy` 200, `/dashboard` 302, and `git ls-remote --tags origin production` shows the merge commit
- Channel on production: `curl -i -X POST https://streakboard.app/api/client-errors -H 'Content-Type: text/plain' --data checkoff_timeout` answers 204, and Sentry (`environment:production`) shows one new event `client.checkoff.checkoff_timeout`; the same call with `--data checkoff_exploded` answers 400 with no event
- Android (owner, production, installed app, signed in): with airplane mode on, "Mark done" flips the row, then within a few seconds the row returns to "Mark done" with "Could not save. Try again." under it; with airplane mode off, "Mark done" ends in "Done today" and stays after a reload
- Deployment-plan Phase 30 written with the release data and these rows, in the closing docs PR together with the archive

---

## Testing Strategy

### Unit Tests:

- `sendCheckoff`: two attempts on `network` and `timeout`, one on `status` and `body`; each attempt's own abort at 15 000 ms; the last attempt's reason; `attempts = 1`.
- `checkoffFailureCode` for the eight (action, reason) pairs; `reportCheckoffFailure` with an injected beacon.
- `POST /api/client-errors`: the event per code for all three families; the rejections unchanged.
- Mutation: the narrowed Stryker run on `checkoff-client.ts`; a mutant that removes the second attempt or the abort must die or time out (test-plan `:196`), survivors reviewed one by one, no chase of 100 %.

### Integration Tests:

- Smoke: the two new codes are accepted; the unknown code, the foreign origin and the JSON body are still refused; the dashboard steps are untouched.
- E2E (both projects): one request on a 500 and the alert text; an aborted first attempt converges and survives a reload; two aborted attempts roll back and send `checkoff_failed`.
- Visual: the `controls` set ends with "All screenshots taken" and the three check-off states look as after S-21.

### Manual Testing Steps:

1. Blocked request URL in DevTools: two attempts, rollback, alert, one beacon with `checkoff_failed`.
2. Back from Settings during a throttled save: the button is live.
3. Production: a posted code reaches Sentry; an unknown code is refused.
4. Android airplane mode: alert and rollback; network back: the save lands and stays.

## Performance Considerations

The retry doubles the worst-case wait before the alert (about 30 s) but never the happy path; the beacon is one small request after a failure. The Worker side is unchanged (four sequential upstream calls per save, as before).

## Migration Notes

None. No schema, no data, no new secret. Rollback is a code rollback (`npx wrangler rollback`).

## References

- Frame brief: `context/changes/grid-save-reliability/frame.md`
- Related research: `context/changes/grid-save-reliability/research.md`
- Island and protocol: `src/components/tasks/CheckoffControl.tsx:15-22`, `:50`, `:64-105`, `:152-156`; `src/lib/checkoff-client.ts:6`, `:18-24`, `:33-36`, `:47`, `:52-65`
- Channel: `src/pages/api/client-errors.ts:14-35`; `src/lib/pwa/register.ts:6-19`; `src/lib/pwa/push.ts:56-57`; `src/lib/log.ts:68`, `:81`, `:88-94`
- Pattern for the restore reset: `src/components/hooks/useFormSubmitting.ts:7`, `:24-30`
- Gates: `tests/unit/checkoff-client.test.ts:1-40`, `:110-134`; `tests/unit/client-errors.test.ts:1-31`; `scripts/smoke.mjs:135-139`, `:428-437`, `:845-858`; `tests/e2e/checkoff-round-trip.spec.ts:155-188`; `scripts/ui-screenshots.mjs:241-277`, `:453`
- Docs: `README.md:183`, `:431`; `CLAUDE.md` (Installable app bullet); `src/components/privacy/WhatWeCollect.astro:37-50`
- Decisions: `context/foundation/roadmap.md:26`, `:31`, `:101-112`; `context/foundation/prd.md:40`, `:123`, `:155`; `context/archive/2026-10-01-checkoff-and-leaderboard/reviews/impl-review-phase-5.md:63`; `context/archive/2026-10-02-observability-swallowed-errors/plan.md:41`; `context/archive/2026-10-17-installable-pwa/plan.md:138`, `:149`
- Prior plan in the same format: `context/archive/2026-10-19-grid-state-feedback/plan.md`
- Release record format: `context/changes/deployment/deployment-plan.md` (Phase 29)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reliable save path and gates

#### Automated

- [x] 1.1 Unit tests pass, including the two-attempt, reason, code-mapping and event-map cases — d285949
- [x] 1.2 Lint, format and types pass — d285949
- [x] 1.3 Build passes — d285949
- [x] 1.4 Narrowed mutation run on `checkoff-client.ts` finishes with every runtime mutant tested and survivors listed in the PR — d285949
- [x] 1.5 Smoke passes with the two new client-error steps — d285949
- [x] 1.6 E2E round trip passes in both projects with the extended 500 test, the retry test and the beacon test — d285949
- [x] 1.7 Screenshot gate ends with "All screenshots taken" for the `controls` set — d285949
- [x] 1.8 Red proof: stash the three files, unit and e2e fail, pop and pass — d285949

#### Manual

- [ ] 1.9 Owner compares the three check-off screenshots with the S-21 run
- [ ] 1.10 Blocked request URL in DevTools: two attempts, rollback, alert, one beacon with `checkoff_failed`
- [ ] 1.11 Back/forward cache: the button is live after Back

### Phase 2: Release and production check

#### Manual

- [x] 2.1 PR merged, `release` approved, live check and the `production` tag at the merge commit — fe46c37
- [ ] 2.2 Channel on production: a posted `checkoff_timeout` answers 204 and reaches Sentry, an unknown code answers 400
- [ ] 2.3 Android airplane mode: alert and rollback; network back: the save lands and stays
- [ ] 2.4 Deployment-plan Phase 30 written in the closing docs PR
