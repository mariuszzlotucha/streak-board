# Grid save reliability (S-22) — Plan Brief

> Full plan: `context/changes/grid-save-reliability/plan.md`
> Frame brief: `context/changes/grid-save-reliability/frame.md`
> Research: `context/changes/grid-save-reliability/research.md`

## What & Why

The real problem, from the frame: reporting of save failures is one-way. The server reports what reaches it, while the browser, the only witness of the failures most likely in an installed PWA (no network, a dropped connection, the 15 s abort, a page killed mid-request, a timeout after the row was committed), reports nothing and never reconciles its state with the server after `failed`. This plan adds the retry and the operator trace to the island's `failed` branch and fixes a stuck pending state; it does not change the optimistic tick (resolved in the frame) or any route.

## Starting Point

The tick is an optimistic React island over two native forms (S-04, S-13): the row, the viewer's cell and the Leaderboard flip at the tap; `sendCheckoff` classifies the answer; every non-`saved` kind reloads or rolls back with "Could not save. Try again." or "This task is no longer available. Reload the page.". The server side of the S-08 contract holds. Browser errors have one channel, `POST /api/client-errors`, with a closed list of seven PWA codes reported as `client.sw.<code>`, which the owner reads in Sentry.

## Desired End State

A failure with no server answer is retried once, invisibly; a lost response converges through the idempotent routes. Only a second failure rolls the row back, shows the same alert as today, and sends `checkoff_failed`, `checkoff_timeout`, `uncheck_failed` or `uncheck_timeout` to the channel, which reports `client.checkoff.<code>`. A non-200 answer is shown without retry or beacon (the server logged it). A page restored from the back/forward cache has a live button. The seven PWA codes keep their events.

## Key Decisions Made

| Decision                    | Choice                                                                                  | Why (1 sentence)                                                                                                  | Source |
| --------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Save mode                   | Stays optimistic                                                                        | Server-wait ends in the same `failed` branch and the same silence, and costs the PRD's immediacy.                 | Frame  |
| What the slice is about     | The browser's silence and the missing reconciliation, not the S-08 contract             | No route branch swallows an error; the client reports nothing.                                                    | Frame  |
| Operator trace              | Fixed codes through `/api/client-errors`, `client.checkoff.<code>`, PWA codes unchanged | The sanctioned channel, the privacy policy's "error reports" wording and per-code Sentry grouping already exist.  | Plan   |
| Convergence after `failed`  | One automatic retry when no server answer arrived, then rollback and alert              | Both routes are idempotent (`checkoff-client.ts:22`); the retry hides under the optimistic flip.                  | Plan   |
| When not to retry or beacon | A non-200 answer (`status`) retries nothing and sends nothing                           | The Worker has logged it; a retry on a 503 would hammer an outage.                                                | Plan   |
| Secondary silent branches   | Fix the bfcache stuck `pending`; leave `stale`, `expired`, no-JS `gone` as non-goals    | The reset is a real dead-button bug with a known pattern; the others are not save failures (frame: second-order). | Plan   |
| Pending signal              | The dimmed button only                                                                  | S-04 and S-21 convention; the flip already shows the result; no new device rows.                                  | Plan   |
| Texts and 15 s per attempt  | Unchanged                                                                               | Screenshot gate waits for the text; the bound is pinned by a unit test and documented in `useFormSubmitting`.     | Plan   |

## Scope

**In scope:** `sendCheckoff` with a second attempt and a `reason`; `src/lib/client-error-codes.ts` owning the code list, the path and the code-to-event map; the route reporting through the map; the island's beacon and `pageshow` reset; unit, mutation, smoke, e2e and screenshot gates; README, CLAUDE.md, a read of the privacy wording; release, Sentry and Android checks; deployment-plan Phase 30.

**Out of scope:** any change to the routes, outcome kinds, statuses or the 200 body; a spinner or "Saving…" line; beacons for `rejected`, `expired`, `stale`; a "recovered" code; a context payload in the beacon; offline detection, a queue, a service-worker `fetch` handler; a browser Sentry SDK; a rate limit on the channel; latency measurement; edits to `checkoff-sync.ts`, `ViewerGridCell.tsx`, `useFormSubmitting.ts`.

## Architecture / Approach

`checkoff-client.ts` owns attempts and reasons (`network`, `timeout`, `status`, `body`), the code mapping and the beacon helper; `src/lib/client-error-codes.ts` owns the closed list and `clientErrorEvent(code)`; the route `src/pages/api/client-errors.ts` validates as today and reports the mapped event; `CheckoffControl.tsx` consumes the final result, beacons on `network`/`timeout`/`body`, and resets `pending` on a persisted `pageshow`. Sentry keeps grouping by event name, so the new events form their own issues next to the PWA ones.

## Phases at a Glance

| Phase                           | What it delivers                                                                                           | Key risk                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1. Reliable save path and gates | Retry, reasons, codes, event map, island beacon and reset, all gates and docs in one commit                | Retrying on a server answer by mistake (pinned by the one-request assertion); a beacon invisible to Playwright |
| 2. Release and production check | Merge, `release` approval, live check, posted code in Sentry, Android airplane-mode check, Phase 30 record | An airplane-mode tap cannot deliver a beacon, so the Sentry proof uses a posted code                           |

**Prerequisites:** planning PR merged; `s-22/grid-save-reliability/implementation` cut from fresh `origin/master`; local Supabase stack for smoke and e2e; `astro dev` for the screenshot run; the owner's Sentry access and Android device for Phase 2.
**Estimated effort:** one goal run for Phase 1 (about 10 files, mostly tests), one review, one release; Phase 2 is the owner's checks and a docs PR.

## Open Risks & Assumptions

- A fully offline tap leaves no operator trace: `sendBeacon` cannot leave the device. Accepted; the alert and the rollback still show, and unreachable-Worker, dropped-connection and timeout cases do report.
- Playwright sees `sendBeacon` as a `ping` request in Chromium, but no spec in the repo observes one yet; if `waitForRequest` never sees it, the test replaces `navigator.sendBeacon` with a recorder through `page.addInitScript` and reads it back with `page.evaluate` (plan, Critical Implementation Details).
- The frame's confidence is HIGH on the code but no first-hand failure exists; the plan makes failures visible rather than fixing a known one.
- Worst case before the alert grows to about 30 s; the owner accepted the dimmed button as the only pending signal.

## Success Criteria (Summary)

- A dropped first attempt converges without the user noticing, and a reload shows the saved row.
- After two failed attempts the user sees the alert and the operator sees `client.checkoff.<code>` in Workers Logs and Sentry; a 500 produces one request and no beacon.
- The seven PWA codes, every route answer, the texts and the screenshots are unchanged, and the owner's Android check passes.
