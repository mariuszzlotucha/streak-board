---
date: 2026-10-02T06:12:05+02:00
researcher: Claude (Sonnet 5.5) for Mariusz Złotucha
git_commit: beee6f794ec402d8ca8b47b59d1799511077cc2c
branch: s-08/observability-swallowed-errors/plan
repository: streak-board
topic: "observability-swallowed-errors (S-08, MS-05): where the check-off/uncheck and group-join flows swallow a failure or turn it into a benign outcome, what pins today's failure contract, what the platform gives optional error tracking, and what /10x-plan must still decide"
tags:
  [
    research,
    codebase,
    observability,
    error-handling,
    middleware,
    checkoff,
    group-join,
    supabase,
    postgrest,
    cloudflare-workers,
    astro,
    sentry,
  ]
status: complete
last_updated: 2026-10-02
last_updated_by: Claude (Sonnet 5.5)
last_updated_note: Pointer to the observability audit added after it ran; no research finding was changed.
---

# Research: observability-swallowed-errors

**Date**: 2026-10-02T06:12:05+02:00
**Researcher**: Claude (Sonnet 5.5) for Mariusz Złotucha
**Git Commit**: beee6f794ec402d8ca8b47b59d1799511077cc2c
**Branch**: s-08/observability-swallowed-errors/plan
**Repository**: streak-board

## Research Question

`change.md` has no stated question (its Notes are empty), so it is taken from roadmap item S-08 (`context/foundation/roadmap.md:116-129`, outcome MS-05 at `:33`) and `context/foundation/roadmap-input-next-slices.md:73-87`:

> In the two roadmap candidate flows, check-off/uncheck (`POST /api/tasks/checkoff|uncheck`) and joining a group (`GET /join/<code>` plus `POST /api/groups/join`), where is a failure swallowed or turned into a success-looking or benign outcome, so that it does not reach (a) the API response (status and body) or (b) monitoring? What pins today's failure contract (island, smoke, tests, docs)? What does the platform give optional part B (error tracking on Cloudflare Workers, DSN as a secret)? What must `/10x-plan` still decide?

How this was gathered: four read-only sub-agents (auth and group routes; non-check-off task routes and `dashboard.astro`; tests, smoke, CI and prior decisions; Astro/Workers/Sentry platform) reported file:line anchors. Three of them were cut off mid-run by an API rate limit and were resumed; all four delivered final reports. The researcher read the check-off flow (routes, lib, island, migration), `middleware.ts`, `supabase.ts`, `astro.config.mjs`, `dashboard.astro:1-165`, `tasks/{join,leave,delete}.ts`, `groups/join.ts`, `join/[code].ts`, `join-code.ts`, `signout.ts`, `groups.ts:14-40`, `group-errors.ts`, `task-errors.ts` and `callback.ts` directly, and re-checked in `node_modules` the postgrest-js error path, auth-js `getUser`, Astro's exception catch and the adapter entrypoint. The worktree has no `node_modules`, so those were read from the main checkout (`/home/mariusz/code/streak-board/node_modules`, same revision and lockfile); anchors below are written as `node_modules/...`.

Nothing was run, built or installed: there is no runtime proof in this document. The formal `/10x-observability-audit` was run afterwards and its report is `context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md` (static audit plus 97 runtime probes on a local production build with a fake Supabase). It confirms C1 to C3 below (as G1, G2, G3 in the report), proves C1 and the join part of C2 at runtime, and adds findings this note does not have; where the two differ, the audit is the later and more complete source.

## Summary

- **Monitoring today is `console.error` into Workers Logs and nothing else.** In `src/` the only logging calls are 24 `console.error` calls in 17 files (own grep of `console\.`: 24 hits, all `console.error`). Each logs a constant label plus the caught value; none of the 24 adds a user, group, task or route field (sub-agent reads of all sites). `wrangler.jsonc:12-14` enables Workers Logs. `package.json` has no error-tracker dependency, and `src/` has no `onerror`, `unhandledrejection` or ErrorBoundary (sub-agent greps).
- **A failed Supabase call is returned, not thrown (verified in the locked 2.116.0 packages).** Unless `throwOnError()` is used (zero hits in `src/` and `tests/`), postgrest-js turns a rejected `fetch` into `{ error: { message, details, hint, code: "" }, data: null, status: 0 }` (`node_modules/@supabase/postgrest-js/dist/index.cjs:418-455`). auth-js `getUser()` resolves `{ data: { user: null }, error }` for any `AuthError` (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2713-2723`); a sub-agent's executed probe (installed build, fake `fetch`) saw 7 cases (fetch rejects, 500, 502, 503, 401, no cookie, expired token with unreachable `/token`) return and none throw. So the `catch` blocks, and their comments such as "a thrown Supabase/network error" (`src/pages/api/groups/join.ts:40`), are not where these failures end up. What each `if (error)` branch does is what matters.
- **13 of the 16 route files in `src/pages/api/` map a returned `{ error }` to a redirect and log nothing.** Set: group `create`, `delete`, `join`, `leave`, `remove-member`, `rename` (6); auth `signin`, `signup` (2); task `create`, `delete`, `join`, `leave`, `update` (5). In each of the 13 the only `console.error` sits in the `catch`, after the `if (error)` branch (own grep, file:line list in Detailed Findings §5). Unmapped SQLSTATEs, PostgREST and 5xx errors, and network failures (`code: ""`) all collapse to `?error=unknown` (`group-errors.ts:14-27`, `task-errors.ts:11-15`). The other 3 routes: `checkoff.ts` and `uncheck.ts` log the `unknown` outcome; `signout.ts` has no error handling at all.
- **Middleware drops the auth error.** `src/middleware.ts:11-14` reads only `data.user`; any `getUser()` error (no session, expired or invalid token, Auth outage, 5xx) becomes `user = null`. On `/dashboard`, `/api/groups/*` and `/api/tasks/*` that is a 302 to `/auth/signin` (`:20-24`) with no log. The check-off island maps a 3xx to `expired` and reloads (`checkoff-client.ts:52-54`, `CheckoffControl.tsx:95-99`). For the inspected path, an Auth-service outage looks to the user like a silent sign-out and leaves nothing in the logs.
- **Check-off/uncheck is the best-instrumented flow.** A database failure becomes the `unknown` outcome, is logged (`checkoff.ts:35-38`, `uncheck.ts:37-40`) and answered `500 {"ok":false,"error":"unknown"}` (`checkoff-response.ts:14,30-33`); the route's status vocabulary is 400/403/404/500/503. Its remaining gaps: `forbidden` (403) and `gone` (404) are not logged although `42501` is overloaded; an undo that deletes 0 rows answers ok; the island's `catch {}` reports nothing (Detailed Findings §3).
- **Every outcome that reaches the group-join handler answers 302, by the documented contract (`README.md:182`); only Astro's Origin check (403) and an unhandled exception differ.** The user-visible failure channel is `?error=<code>`; the gap is monitoring, not the response. The unmapped-RPC-error branch (`join.ts:27-35`) is unlogged, keeps the invite cookie for retries up to 3600 s, and a malformed `/join/<code>` link is dropped with the same 302 as a good one (`join-code.ts:12`).
- **Every handled `/dashboard` load failure answers HTTP 200** (5 logged sites: `dashboard.astro:68,77,82,101,126`; the file never sets `Astro.response.status`, sub-agent grep), so a status-based signal cannot see them; only the `console.error` lines can.
- **Platform fact for part B: Astro catches exceptions from middleware, endpoints and pages itself, logs the stack and renders a 500** (`node_modules/astro/dist/core/routing/handler.js:59-108`). The adapter's `fetch` therefore sees a returned `Response`, and an outer wrapper such as Sentry's `withSentry` captures only exceptions that escape `fetch`. Capture has to be attached inside Astro (a middleware around `next()`) or at the swallow sites. `context.locals.cfContext.waitUntil` is available in middleware and routes (`node_modules/@astrojs/cloudflare/dist/utils/cf-helpers.js:23-26`).
- **Pins on the failure contract** (what a fix may break): the island's status mapping (403/404 → `rejected`, 3xx → `expired`, every other non-200 → `failed`), 37 `toEqual` assertions on the `ok`/`forbidden` outcome shape, smoke steps on 400/403/404 and `?error=` redirects, and `README.md:182`. No test, smoke step or e2e spec reaches any handler's catch/500 branch for check-off, uncheck or join (negative greps in §7).
- **Unmeasured:** Sentry's CPU cost on this app (the Free-plan limit is 10 ms CPU), the production plan tier, and how Workers Logs stores a logged `Error` (Open Questions).

## Detailed Findings

### 1. Observability baseline (what exists)

- Logging: 24 `console.error` calls in 17 files, no other `console.*` method in `src/` (own greps). Shape at every one: `console.error("<constant label>", <caught value>)` preceded by an eslint-disable comment. Labels do not say which flow or which read failed where one label serves several reads (`dashboard.astro:126` covers `getMyGroup`, `listGroupMembers` and `previewGroup`).
- Platform: `wrangler.jsonc:12-14` `observability.enabled: true` (Workers Logs). Workers Logs on the Free plan: 200,000 events per day and 3-day retention (Cloudflare docs, https://developers.cloudflare.com/workers/observability/logs/workers-logs/, page updated 2026-09-30, read by a sub-agent).
- No tracker, no source-map upload, no release tagging, no request or correlation id anywhere in `src/` (sub-agent greps; the pre-mortem scenario at `context/foundation/infrastructure.md:67` already names `wrangler tail` logs "with no request-correlation ID" as a failure cause).
- The only post-deploy probe in `.github/workflows/ci.yml` is the step at `:127-150`: `/` must answer 200, `/dashboard` 302 to `/auth/signin`, `/auth/callback` 302 to `/auth/signin?error=link_expired`. The probe sends no session cookie, so `/dashboard` gets the same 302 whether or not the Auth server is reachable: it cannot see the middleware failure state of §2.
- Client side: no reporting. `checkoff-client.ts:61-62` is `catch { return { kind: "failed" } }`; `CopyInviteLink.tsx:40-45` has a bare `catch {}`; `useFormSubmitting.ts:15-17` re-enables a stuck form after 15 s with no message.

### 2. How a failure travels (mechanism)

- **Returned, not thrown.** postgrest-js 2.116.0 (`package-lock.json`, same as installed) wraps the request in `.catch` and returns the error object when `shouldThrowOnError` is false (`node_modules/@supabase/postgrest-js/dist/index.cjs:418-455`). No call in `src/` or `tests/` sets `throwOnError`, so for the inspected code every network-level failure to PostgREST reaches the caller as `{ error }` with `status: 0`. The same `.then` implementation serves `.from()` queries and `.rpc()` (`join_group`, `preview_group`, `list_group_members`).
- **Auth.** `getUser()` has no network-error throw path for an `AuthError`: the catch at `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2713-2723` returns `{ data: { user: null }, error }` and rethrows only non-`AuthError`s. Sub-agent probe on the installed CJS build (node 24, fake `fetch`, no network): `fetch` rejection → `AuthRetryableFetchError` status 0; 500/502/503 → `AuthRetryableFetchError`; 401 `bad_jwt` → `AuthApiError`; no cookie → `AuthSessionMissingError` (no network call); expired token with unreachable `/token` → `AuthRetryableFetchError` after about 25.4 s (retry with backoff: wall time, not CPU). `@supabase/ssr` 0.12.7 does not set `throwOnError`.
- **`getUser()` runs on every request.** `middleware.ts:8-14` creates the client and calls `getUser()` before the `PROTECTED_ROUTES` test, so it also runs on anonymous page views, where `AuthSessionMissingError` is the normal result. Any log added there has to tell that class apart from service failures.
- **Thrown exceptions.** A throw inside a route's own `try` reaches that route's `catch`, which logs and redirects (or answers `unknown`). A throw outside any `try` (middleware at `middleware.ts:7-32`, `signout.ts:6-11`, `callback.ts:10-19`) reaches Astro's catch at `node_modules/astro/dist/core/routing/handler.js:59-108`: `state.logger.error(null, err.stack …)` and `renderErrorFromState(... status 500, error: err)`. Endpoints are called with a bare `await handler.call(...)` at `node_modules/astro/dist/runtime/server/endpoint.js:37`. A second failure while rendering the error page ends in an empty `catch {}` and `new Response(null, { status })` (`node_modules/astro/dist/core/errors/default-handler.js:90-107`, sub-agent read). `src/pages` has no `500.astro` or `404.astro`, so the body of that 500 is probably empty (inference).
- **Adapter.** `node_modules/@astrojs/cloudflare/dist/entrypoints/server.js:2-4` is `export default { fetch: handle }`; `handle` (`dist/utils/handler.js:36-88`) has no `try/catch` and calls `app.render(...)` at `:79-85`. `wrangler.jsonc` sets `main` to that entrypoint; the adapter honours a custom `main` (`dist/wrangler.js:36`, sub-agent read). There is no `onError` hook in Astro 7's app/entrypoint API (case-sensitive grep over `astro/dist/core`: 0 hits, sub-agent).

### 3. Flow A: check-off and uncheck

Path: `CheckoffControl.tsx:63-102` → `sendCheckoff` (`checkoff-client.ts:26-66`, `fetch` with `Accept: application/json`, `redirect: "manual"`, 15 s abort) → middleware → `checkoff.ts` / `uncheck.ts` → `getTask` (`tasks.ts:14-26`) → `checkOff` / `uncheck` (`checkoffs.ts:40-80`) → `checkoffResponse` (`checkoff-response.ts:25-34`). Table for the JSON mode; the plain form POST gets the redirect column of `checkoff-response.ts:9-15` instead.

| #   | Condition                                                                                                         | Response                                       | Logged                                                    | Island                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A1  | any `getUser()` error: no session, expired token, Auth outage or 5xx (`middleware.ts:11-14,20-24`)                | 302 `/auth/signin`, no body                    | no                                                        | `expired`: roll back, `window.location.reload()` (`CheckoffControl.tsx:95-99`) |
| A2  | `task_id` not a canonical UUID (`checkoff.ts:17-21`)                                                              | 400 `{"ok":false,"error":"invalid"}`           | no                                                        | `failed`: "Could not save. Try again."                                         |
| A3  | Supabase env missing (`checkoff.ts:23-26`)                                                                        | 503 `not_configured`                           | no                                                        | `failed`; dead path behind the middleware, which redirects first (sub-agent)   |
| A4  | `getTask` finds nothing: RLS hides it, deleted, other group (`checkoff.ts:29-32`)                                 | 404 `gone`                                     | no                                                        | `rejected`: "This task is no longer available. Reload the page."               |
| A5  | `getTask` gets `{ error }` and throws it (`tasks.ts:20`), including network `code: ""`                            | 500 `unknown` (catch, `checkoff.ts:40-44`)     | yes: `"Check off task request failed"` (`checkoff.ts:42`) | `failed`                                                                       |
| A6  | insert `{ error }` code 23505 (`checkoffs.ts:48`)                                                                 | 200 `{"ok":true,"period":…}` (idempotent)      | no                                                        | `saved`                                                                        |
| A7  | insert `{ error }` 23503 (not enrolled) or 42501 (`checkoffs.ts:31-34`)                                           | 403 `forbidden`                                | no                                                        | `rejected`: "no longer available" message                                      |
| A8  | insert `{ error }` with any other code, including network `code: ""`                                              | 500 `unknown`                                  | yes (`checkoff.ts:37`)                                    | `failed`                                                                       |
| A9  | undo deletes 0 rows: nothing ticked, not enrolled, or a policy/grant change hiding the row (`checkoffs.ts:77-79`) | 200 ok (comment "a quiet ok", `uncheck.ts:35`) | no                                                        | `saved`                                                                        |
| A10 | `formData()` throws on a non-form body (`checkoff.ts:17`)                                                         | 500 `unknown`                                  | yes (catch)                                               | `failed`                                                                       |
| A11 | `fetch` rejects, 15 s timeout, 200 with a body that is not `{ ok: true, period }` (`checkoff-client.ts:56-62`)    | n/a                                            | no client-side reporting                                  | `failed`                                                                       |

Bounded reading of the table: of the 11 conditions, 3 are logged on the server (A5, A8, A10); A1-A4, A7 and A9 write no server log line, A11 has no client-side report either, and A6 is the legitimate idempotent success. A1 and A9 are the two failure conditions that end in a success-looking or benign outcome (a redirect, a 200).

- `42501` is overloaded. The migration's insert policy (`supabase/migrations/20261002090000_create_task_checkoffs.sql:58-64`) refuses on `user_id`, on task visibility and on a period outside UTC today minus 7 days to UTC today plus 1 day; a missing column grant also answers 42501 (`tests/integration/task-checkoffs.test.ts:165-191`, sub-agent read). All of them surface as `forbidden` with the "no longer available" message and no log. The archived review already recorded this ("42501 can also mean a missing grant and would then surface silently as `forbidden`", `context/archive/2026-10-01-checkoff-and-leaderboard/reviews/impl-review-phase-3.md:56`).
- The app computes the period in the Warsaw calendar (`streak-rules.ts` `periodKeyFor`) while the policy window is UTC-based; a clock or time-zone defect would present as A7.
- Idempotent undo is a documented behaviour (`README.md:180` "undoing twice does nothing"), so A9 is a deliberate design choice. The route chains `.select("period")` (`checkoffs.ts:77`) but never reads the returned rows, so "nothing to undo" and "undo hidden by a policy change" are not distinguishable.

### 4. Flow B: group join

Entry points: `GET /join/<code>` (`src/pages/join/[code].ts:8-11`, public route), pending card on the dashboard (plain Astro `<form method="POST" action="/api/groups/join">`, `dashboard.astro:403`), manual form `JoinGroupForm.tsx` (native POST, `:34`, no `fetch`). Cookie `join_code`: hex, `Path=/`, HttpOnly, SameSite=Lax, `Max-Age=3600` (`join-code.ts:14-20`).

| #   | Condition                                                                                                        | Cookie after      | Response                                       | Logged                                                   | User sees                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| B1  | `/join/<code>` well-formed                                                                                       | set               | 302 `/dashboard`                               | no                                                       | dashboard (or sign-in via the middleware)                                               |
| B2  | `/join/<code>` malformed (not 1-64 hex after trim/lowercase)                                                     | not set           | the same 302 `/dashboard`                      | no                                                       | no hint that the link was bad                                                           |
| B3  | anonymous or any `getUser()` error → sign-in (`middleware.ts:20-24`)                                             | kept up to 3600 s | 302 `/auth/signin`, no `error`, no `next`      | no                                                       | sign-in page; after expiry the invite disappears silently                               |
| B4  | dashboard cannot resolve: `getMyGroup`, `listGroupMembers` or `previewGroup` fails (`dashboard.astro:52,62,113`) | kept              | 200                                            | yes: one label `"Loading the dashboard failed"` (`:126`) | alert "Something went wrong. Please try again."; forms and pending card hidden (`:134`) |
| B5  | RPC `{ error }` P0002 / 23505 (`join.ts:28-35`)                                                                  | cleared           | 302 `?error=invalid_code` / `already_in_group` | no                                                       | alert                                                                                   |
| B6  | RPC `{ error }` 42501                                                                                            | kept              | 302 `?error=forbidden`                         | no                                                       | pending card plus "You are not allowed to do that."                                     |
| B7  | RPC `{ error }` with any other code: unmapped SQLSTATE, PGRST, 5xx, network `code: ""`                           | kept              | 302 `?error=unknown`                           | **no**                                                   | pending card plus "Something went wrong."; retry possible for up to 1 h                 |
| B8  | `formData()` or another throw (`join.ts:39-44`)                                                                  | kept              | 302 `?error=unknown`                           | yes: `"Join group request failed"` (`:42`)               | as B7                                                                                   |
| B9  | success (`join.ts:37-38`)                                                                                        | cleared           | 302 `/dashboard`                               | no                                                       | group view                                                                              |

- For this flow the API "response" is a 302 plus `?error=<code>` by the project's own contract (`README.md:182`); the browser form cannot read a status or JSON. A user-visible error exists for B4-B8. The gap is (b) monitoring: B5-B7 and B1-B3 write nothing, and a dashboard failure after a failed join logs only the dashboard label with nothing that ties it to the join.
- B2 is the one success-looking outcome in the flow (a bad link behaves exactly like a good one). The route comment (`[code].ts:6-7`) states "An invalid code is ignored" on purpose.
- Giving the join POST a real status code or JSON would mean changing the documented form-post-redirect contract and the 9 smoke references to `/api/groups/join` (`scripts/smoke.mjs`, own grep), none of which cover anonymous, foreign-Origin, GET, unknown-error or `not_configured` cases (sub-agent).

### 5. Cross-cutting sites (shared by both flows or outside them)

- **Middleware** (`middleware.ts:7-32`): no `try/catch`; `error` from `getUser()` discarded (`:11-14`); `createClient` returning `null` (missing secrets) silently makes every request anonymous (`supabase.ts:7-9`, `middleware.ts:15-17`), with no log anywhere. A throw from `createClient` or a non-`AuthError` thrown by `getUser()` is not caught in the middleware, so it would reach Astro's catch (§2) and answer a 500 on any route, because the middleware runs on all of them (inference: no such throw was reproduced).
- **`signout.ts:6-12`**: `await supabase.auth.signOut()` result unread, no `try/catch`, then `clearJoinCode` and 302 `/` (unless `signOut()` throws, which would reach Astro's catch). If `signOut()` returns an error the session cookies may survive while the user lands on `/` (inference; the auth-js cookie handling was not read). Smoke covers only the happy path (`smoke.mjs:1614-1615`, sub-agent).
- **The 13 unlogged `{ error }` branches** (own grep; line of the `if (error)` branch, then the only `console.error` in the file, inside the `catch`):

  | Route                         | `if (error)` | `console.error` (catch) |
  | ----------------------------- | ------------ | ----------------------- |
  | `api/groups/create.ts`        | 29           | 38                      |
  | `api/groups/delete.ts`        | 30           | 41                      |
  | `api/groups/join.ts`          | 28           | 42                      |
  | `api/groups/leave.ts`         | 23           | 37                      |
  | `api/groups/remove-member.ts` | 47           | 60                      |
  | `api/groups/rename.ts`        | 34           | 45                      |
  | `api/auth/signin.ts`          | 19           | 28                      |
  | `api/auth/signup.ts`          | 21           | 30                      |
  | `api/tasks/create.ts`         | 40           | 48                      |
  | `api/tasks/delete.ts`         | 33           | 43                      |
  | `api/tasks/join.ts`           | 34           | 45                      |
  | `api/tasks/leave.ts`          | 33           | 40                      |
  | `api/tasks/update.ts`         | 38           | 48                      |

  The mappers read only `error.code` (`group-errors.ts:14-27`, `task-errors.ts:11-15`, `auth-errors.ts:15-25,51-68`); `message`, `details`, `hint` and `status` are dropped. Among the 14 auth, group and task route files with an `if (error)` branch, `callback.ts:23-27` is the one that logs inside it (`:25`), and it logs the thrown path separately (`:30`), but it shows every failure after the client exists as the "expired or already used" message (`auth-errors.ts:9`), including infrastructure failures, and drops provider `error`/`error_code` parameters unlogged (`:17-19`).

- **Quiet-success sites (deliberate).** `tasks/update.ts:32-34`, `tasks/delete.ts:27-29`, `tasks/join.ts:29-31,36-37`, `tasks/leave.ts:26-37` (0 rows), `groups/leave.ts:26-31`, `groups/remove-member.ts:31-35,50-54`, `groups/delete.ts:21-25` answer a plain 302 `/dashboard` for a stale or empty case. The route comments give the rationale ("a stale submit ends quietly"), and the group `leave` case was changed to this on purpose in review (`context/archive/2026-09-25-group-create-join-manage/reviews/impl-review-phase-3.md:57-61`). They are product decisions rather than defects unless the plan decides otherwise; they also cannot be told apart from a policy regression that hides the row.
- **Dashboard** (`dashboard.astro:49-129`): `Promise.allSettled` over four reads; members failing throws into the outer catch (`:62`) and the other three results are then never inspected or logged; tasks, participants, check-offs and the board computation each log and set a flag (`:64-83,99-103`). Failed sections are absent, not blank. Two places where a failure can pass as data: `listGroupMembers` returns `[]` for non-array `data` without any flag (`groups.ts:39`); `listGroupTasks` and `listGroupMembers` have no row-cap guard while `listTaskParticipants` and `listCheckoffPeriods` do (`tasks.ts:64-66`, `checkoffs.ts:16-18`). `:139` hides the tasks-failure alert when `error` is already set (`?error=`, join-cookie branch), so the user then sees an unrelated message.
- **Logging of an `Error`** (workerd `main` source read by a sub-agent, not necessarily the production runtime): `console.error("msg", err)` maps to log level `error` (`src/workerd/io/worker.c++:1126-1130`); an `Error` instance argument becomes `String(err)` ("Name: message", no stack) in the `message` array, while a plain object such as a PostgREST error keeps its fields as JSON (`worker.c++:1832-1901`); native `Error`s are also captured as `errorInfo { name, message, stack }` (`worker.c++:1908-1959`), whose Workers Logs indexing is not documented. `throw error` of the raw PostgREST object (e.g. `tasks.ts:20`, `groups.ts:22`) means thrown values here are plain objects, not `Error` instances, so they carry no stack.

### 6. Contracts a fix would touch

- **Island** (`checkoff-client.ts:52-62`, `CheckoffControl.tsx:14-17,81-101,145-149`): 3xx or opaque redirect → `expired` (reload); 403/404 → `rejected` ("This task is no longer available. Reload the page."); any other non-200, or a 200 without `{ ok: true, period: string }` → `failed` ("Could not save. Try again.", `role="alert"`). A new 5xx or 503 therefore already maps to `failed` with no client change.
- **Unit tests** (`tests/unit/checkoff-client.test.ts`): `:79-82` 403/404 → `rejected` (status only); `:93-108` nine cases → `failed` (network error, 500, 503, 400, 500 with ok body, 200 HTML, 200 `{ok:false}`, 200 without period, 200 `{}`); `:84-91` 302 and opaque redirect → `expired`.
- **Integration** (`tests/integration/task-checkoff-flow.test.ts`): 31 `toEqual({ kind: "ok", … })` and 6 `toEqual({ kind: "forbidden" })` assertions (own grep). Adding a defined field to `ok` or `forbidden` breaks those 37; `unknown` is asserted by `.kind` only (`:179-180`), so it may gain fields. `listCheckoffPeriods(anon)` is asserted to reject with `{ code: "42501" }` (`:289`), so wrapping the thrown Supabase error without `code` would break it (sub-agent).
- **Smoke** (`scripts/smoke.mjs`): anonymous POST → 302 `/auth/signin`, foreign Origin → 403 (`:424-436`, JSON mode `:484-503`); malformed id → 302 `/dashboard?error=forbidden` (`:467-476`); JSON 404 `gone`, 400 `invalid`, 403 `forbidden`, 200 body regex `^\{"ok":true,"period":"<Warsaw day>"\}$` (`:1071-1138`, any extra field in the 200 body breaks 4 steps); `NO_ERROR_ALERT` (`role="alert"` must be absent from server HTML) appears on 42 lines including its definition (own grep), so a server-rendered alert in those dashboard states breaks them. No smoke step covers `unknown` (500 or `?error=unknown`), `not_configured` (503) or the dashboard's "unavailable" notes (negative greps, sub-agent; the comment at `:486` about the island mapping an anonymous call to `failed` is stale).
- **Docs**: `README.md:162-182` states 302 `?error=<code>` and the JSON shapes; `roadmap.md:128` and `roadmap-input-next-slices.md:87` describe the island mapping as "403/404 → rejected, other errors → not saved" (partial: 3xx is `expired`).
- **S-11 ordering**: `dashboard-ui` waits for S-08 so that error states in the new view follow a settled error contract (`roadmap.md:128,171`).

### 7. Test seams

- In the inspected `tests/`, no Vitest test makes HTTP calls. Integration tests use real Supabase clients as real users (`tests/helpers/supabase.ts`) or call library functions directly (`task-checkoff-flow.test.ts:3,6`). The only test that imports a route handler is `tests/integration/auth-callback.test.ts`: `vi.mock("@/lib/supabase")` (`:7`), a hand-built partial `APIContext` (`:11-20`), `mockRejectedValue(new Error("network down"))` (`:66-70`), `vi.spyOn(console, "error")` that only silences (`:35`, never asserted).
- Negative searches behind "no test reaches a handler's catch/500 branch for check-off, uncheck or join" (sub-agent greps under `tests/` unless noted): `@/pages|src/pages` → only `auth-callback.test.ts:4`; `POST(|APIRoute|APIContext` → only `auth-callback.test.ts:1,18`; `console.error` → none; `toHaveBeenCalled` → only listener and exchange spies; `500` → only `checkoff-client.test.ts:95,98`; `grep -n "500\|503\|unknown\|not_configured" scripts/smoke.mjs` → only a comment at `:777`; `tests/e2e` for `checkoff|uncheck|join|alert|Mark done|Undo|500` → none.
- `npm test` needs the local Supabase stack even for pure unit files, because the single Vitest project has a `globalSetup` that requires the stack (`vitest.config.ts:4-17`, `tests/setup/global-setup.ts:22-71`). There is no stub for `astro:env/server` (it enters through `src/lib/supabase.ts:3` only), so a route or middleware test needs `vi.mock("@/lib/supabase")`; middleware also imports `astro:middleware`, which no test mocks (inference: a mock or alias would be needed). `checkoff.ts`, `uncheck.ts` and `groups/join.ts` import nothing else from an Astro virtual module (static import check by a sub-agent, not executed).
- CI (`.github/workflows/ci.yml`): `ci` (lint, `astro check`, build), `smoke` (local Supabase, preview on `:4321`, `npm run smoke`), `integration` (`npm test`, then `supabase/checks/rls-scenarios.sql`), `release` (needs all three, `production` environment approval). Playwright and Stryker do not run in CI.
- `context/foundation/test-plan.md:42-49` has six risks and none is about error paths or observability; `:99` says smoke is the only behaviour test (partial: Vitest also tests behaviour); `:102` says e2e is "none, not planned" while `playwright.config.ts` and two specs exist (this is also S-10's open unknown, `roadmap.md:156`). `:69` expects "invalid data gets 4xx" while the group and task routes answer 302 (`README.md:182` is the documented contract).

### 8. Platform and part B (error tracking on Workers)

All entries in this section come from the sub-agent that read `node_modules` (anchors above) and external sources (URLs given); the doc pages were read as of 2026-10-02 and some were model-summarised fetches. Nothing was installed or measured.

- **Where capture can attach.** (a) A custom `main` wrapping `@astrojs/cloudflare/entrypoints/server` with `withSentry`: it captures only exceptions that escape `fetch` (`sentry-javascript` 11.2.0 `packages/cloudflare/src/wrapRequestHandlerWithInit.ts:167-181`); for a returned 500 it only sets span status. Given Astro's catch (§2), that alone sees none of the route/middleware/page exceptions. (b) A middleware around `next()` (`try { return await next() } catch (e) { capture; throw e }`): route, page and action errors arrive as a rejected `next()` before Astro's catch (`node_modules/astro/dist/core/middleware/callMiddleware.js:5-10`); this is how `@sentry/astro/middleware` works (`packages/astro/src/server/middleware.ts:61-74`). `middleware.ts:31` is a bare `return next()` today. (c) Explicit capture at the swallow sites themselves (the middleware's discarded `getUser()` error, the `forbidden` outcome in `checkoffs.ts`, `join.ts:27-35` and the other 12 branches of §5), because a returned error is never thrown, so (a) and (b) cannot see it.
- **`@sentry/cloudflare` 11.2.0** (npm, published 2026-10-01): needs `nodejs_compat` and `compatibility_date >= 2024-09-23` (docs, `getsentry/sentry-docs` `platform-includes/getting-started-config/javascript.cloudflare.mdx`); the repo has both (`wrangler.jsonc:5-6`). DSN comes from an env binding (`withSentry((env) => ({ dsn: env.SENTRY_DSN }), handler)`) or the `SENTRY_DSN` variable; the repo already keeps runtime secrets as Worker secrets set once with `npx wrangler secret put` (`README.md:220-224`) and declares them in `astro.config.mjs:20-24`, so a DSN would follow that pattern (set by the user with `!`, never pasted). It flushes through `waitUntil` with a 2 s timeout after each request (`wrapRequestHandlerWithInit.ts:232`, `flush.ts:134`). `cacheClient` defaults to true in 11.x (a maintainer measured up to about 14-21% less per-request cost from client reuse, PR #23151); no published ms-per-request figure exists, and issue #24778 (2026-09-28) says the per-call cost was "not checked in a structured way".
- **`@sentry/astro` 11.2.0 + `@sentry/cloudflare`**: documented for Astro >= 6 with `@astrojs/cloudflare` >= 13 (docs `frameworks/astro.mdx`); adds the pre-order middleware of option (b) automatically (`packages/astro/src/integration/index.ts:219-226`); its dependencies include `@sentry/node` and `@sentry/browser`, so it is probably heavier (inference, no size or CPU figure published).
- **toucan-js 4.1.1**: last release 2025-02-28; the GitHub repository is archived. **Plain `fetch` to the envelope endpoint** (https://develop.sentry.dev/sdk/foundations/transport/envelopes/) needs no compat flags but means building events and stack frames by hand.
- **Cloudflare Workers Issues** (open beta, free; https://developers.cloudflare.com/workers/observability/issues/, updated 2026-09-30): `observability.issues.enabled: true`, needs Wrangler >= 4.134.0. The installed Wrangler is 4.131.1, and its `config-schema.json` has no `issues` key (own grep: 0 hits) under `"additionalProperties": false` in `Observability` (sub-agent), so a bump is a prerequisite. It detects uncaught exceptions, failed invocations, HTTP 5xx responses returned by the Worker, and error-level `console` output; automations can call a webhook or an agent. By inference, Astro's rendered 500 counts as a 5xx, while a swallowed error answered 200 or 302 appears only if it calls `console.error`.
- **Workers Logs alerting**: not documented; the Notifications catalog has no Workers category (inference from absence, sub-agent). `wrangler tail` and the dashboard Live view are real-time only and not alertable. Tail Workers and Logpush need a paid plan; OpenTelemetry export shows "Not available" on Workers Free.
- **CPU**: Free is 10 ms CPU per invocation; time waiting on `fetch()` does not count, so a Sentry network call is wall time, while building and serialising the envelope is CPU (https://developers.cloudflare.com/workers/platform/limits/, updated 2026-09-05). At the limit the client gets Error 1102. CPU is visible per invocation as `$workers.cpuTimeMs`. Not found in the docs read: whether CPU spent inside `waitUntil` counts toward the same invocation. The production plan tier is not recorded in the repo (`context/archive/2026-10-01-checkoff-and-leaderboard/research.md:82`; the `/dashboard` CPU reading was never recorded, `context/changes/deployment/deployment-plan.md:181`).
- **Sentry MCP** (the course material's "Sentry MCP"): a remote OAuth server at `https://mcp.sentry.dev/mcp`, outside the Worker runtime path (https://mcp.sentry.dev/, model-summarised fetch).

### 9. Candidate findings for the plan (evidence, not a decision)

The roadmap leaves the choice to the user after the audit report (`roadmap.md:125`). Evidence per candidate:

- **C1: auth failure looks like a signed-out session** (§2, §3 A1, §4 B3, §5 middleware). Class: error turned into a benign redirect, no log. Both (a) and (b) are missing, in the shared entry point of both candidate flows. The return path is verified in the installed `getUser()` (§2). A fix has to keep `AuthSessionMissingError` (normal anonymous visitor) quiet and treat retryable/5xx or status-0 errors as service failures. It would change what a protected `/api/*` call returns during an outage; the island already maps a non-200/403/404 answer to `failed`, while smoke's anonymous steps (302 for a missing session) must still hold. Open design points: status and body for protected `/api/tasks/*` and `/api/groups/*`, and for `/dashboard`.
- **C2: unlogged `{ error }` branches** (§5, 13 handlers; in the join flow `join.ts:27-35`). Class: swallowed, not turned into success (the user sees "Something went wrong"). Covers (b) only. Uniform and low-risk for contracts (responses stay as they are); one helper or 13 edits.
- **C3: check-off `forbidden` and `gone` not logged, `42501` overloaded** (§3 A4, A7). Covers (b); a distinct code for RLS refusal versus missing grant or period window would change the `forbidden` vocabulary pinned by 37 integration assertions and smoke.
- **C4: undo of 0 rows answers ok** (§3 A9). By design today; changing it touches the idempotency promise in `README.md:180`.
- Evidence-weighted view: C1 is the only candidate where a roadmap flow shows both a missing API signal and a missing monitoring signal, and a unit-level test that forces `getUser` to return a service error can prove it (the island contract already supports a 503; a middleware test needs `astro:middleware` handled, §7). C2 is the broadest monitoring win. They can be combined, but part A of the roadmap asks for one finding plus a test (`roadmap-input-next-slices.md:79-82`).

## Code References

- `src/middleware.ts:7-32` - runs `getUser()` on every request, discards `error` (`:11-14`), redirects protected paths (`:20-24`), no `try/catch`
- `src/lib/supabase.ts:6-22` - `createClient` returns `null` when `SUPABASE_URL` or `SUPABASE_KEY` is unset
- `src/pages/api/tasks/checkoff.ts:10-45`, `uncheck.ts:10-47` - check-off routes; log the `unknown` outcome and the catch only
- `src/lib/checkoffs.ts:31-34,48,77-79` - `failureOutcome` (23503/42501 → forbidden), 23505 idempotent, undo returns ok on 0 rows
- `src/lib/checkoff-response.ts:9-34` - failure table (400/403/404/500/503) and JSON-versus-redirect switch
- `src/lib/checkoff-client.ts:26-66` - island protocol: 3xx → expired, 403/404 → rejected, other → failed, `catch {}` at `:61`
- `src/components/tasks/CheckoffControl.tsx:14-17,63-102,145-149` - failure messages, rollback, `role="alert"`
- `supabase/migrations/20261002090000_create_task_checkoffs.sql:58-66` - insert and delete RLS policies (period window UTC today -7..+1)
- `src/pages/api/groups/join.ts:27-44` - RPC `{ error }` mapped by code, unlogged; catch logs
- `src/pages/join/[code].ts:8-11`, `src/lib/join-code.ts:10-30` - invite cookie, malformed code ignored
- `src/lib/group-errors.ts:14-27`, `src/lib/task-errors.ts:11-15` - SQLSTATE → code mappers (`error.code` only)
- `src/pages/dashboard.astro:49-129,139` - `Promise.allSettled`, five logged degradations, HTTP 200 on every handled failure
- `src/pages/api/auth/signout.ts:5-13` - `signOut()` result ignored, no `try/catch`
- `src/pages/auth/callback.ts:15-34` - logs exchange error and throw; each failure after the client exists is shown as an expired link
- `wrangler.jsonc:5-6,12-14` - `compatibility_date`, `nodejs_compat`, `observability.enabled`
- `node_modules/@supabase/postgrest-js/dist/index.cjs:418-455` - fetch failure returned as `{ error }`
- `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2690-2727` - `_getUser` returns `{ user: null, error }`
- `node_modules/astro/dist/core/routing/handler.js:59-108` - Astro's catch logs the stack and renders a 500
- `node_modules/@astrojs/cloudflare/dist/utils/cf-helpers.js:23-26`, `dist/utils/handler.js:77-85` - `locals.cfContext`, `app.render`
- `tests/integration/auth-callback.test.ts:7-20,35,60-75` - the one handler test (mocked client, hand-built context)
- `tests/unit/checkoff-client.test.ts:70-108`, `tests/integration/task-checkoff-flow.test.ts` - pinned outcome and status mapping
- `scripts/smoke.mjs:424-503,1071-1138` - pinned statuses and bodies for check-off

## Architecture Insights

- Two error styles coexist. Check-off uses a typed outcome (`ok | forbidden | unknown`) mapped by one function to JSON or a redirect (`checkoff-response.ts`); every other route inlines `context.redirect("/dashboard?error=<code>")` per branch, and the `unknown` default of the code mappers is where unlogged failures land.
- The `catch` blocks are written for thrown errors, but the Supabase clients return errors. Comments and structure assume the opposite (e.g. `join.ts:40`), so the logging in the `catch` does not cover the returned-error path.
- `error` vocabularies are closed sets resolved from `?error=` (`group-errors.ts`, `task-errors.ts`, `auth-errors.ts`); a new code must be added to the whitelist or the dashboard shows nothing for it (`dashboard.astro:34-35`).
- Among the 16 route files, only `checkoff.ts` and `uncheck.ts` return non-3xx statuses from their own code (JSON mode); the rest of the app is form-post-redirect by design, and the documented contract (`README.md:182`) follows. A "status code in the API response" outcome is therefore a decision per route family, not a global switch.
- Quiet idempotent outcomes (stale submit, 0-row delete, 23505) are an intentional pattern of the task and group routes and the check-off undo; they trade observability for a calm UX and are indistinguishable from the same outcome caused by a policy regression.

## Historical Context (from prior changes)

Each claim scored separately against the current code (S = supported, P = partial, C = contradicted):

- `context/foundation/roadmap-input-next-slices.md:85` "routes have try/catch that logs `console.error` and answers a fixed message; some dashboard reads degrade silently to 'unavailable'": **P**. The `catch` blocks do (13 files log only there), but returned `{ error }` branches log nothing (§5), and each dashboard degradation is logged (`dashboard.astro:67-69,76-78,80-83,99-103`), so none is silent.
- `roadmap.md:73` "24 `console.error` calls in routes, callback and dashboard": **S** (24 in 17 files, own grep).
- `roadmap.md:77`, `roadmap-input-next-slices.md:85` "Workers Logs on, no error tracker": **S** (`wrangler.jsonc:12-14`, `package.json`).
- `roadmap.md:128`, `roadmap-input-next-slices.md:87` island maps 403/404 to rejected and other errors to not saved: **P** (3xx or opaque redirect is `expired`, `checkoff-client.ts:52-54`).
- `roadmap-input-next-slices.md:87` "Sentry in a Worker raises CPU use (10 ms on the Free plan)": **P** (the limit is documented; the overhead is unmeasured and the production tier is not recorded in the repo).
- `context/archive/2026-10-01-checkoff-and-leaderboard/reviews/impl-review-phase-3.md:52` "Phase 5 maps the opaque redirect to `failed`": **C** (superseded by `expired`, `checkoff-client.ts:52-54`; `scripts/smoke.mjs:486` repeats the stale wording).
- Same file `:53` non-form body makes `formData()` throw, answered 500 `unknown`, costing a log line: **S**, untested.
- Same file `:56` 42501 may mean a missing grant and surface silently as `forbidden`: **S** (`checkoffs.ts:32`; `checkoff.ts` and `uncheck.ts` log only the `unknown` outcome, never `forbidden`).
- `context/archive/2026-09-25-group-create-join-manage/plan.md:195`, `reviews/impl-review-phase-2.md`: dashboard load wrapped in `try/catch` giving an `unknown` alert, `loadFailed` hides forms and the Members card: **S** (`dashboard.astro:134,136`).
- `context/foundation/test-plan.md:102` "e2e: none, not planned": **C** (`playwright.config.ts`, two specs under `tests/e2e`).
- `context/foundation/lessons.md:26-31` smoke steps assert outcomes: **S** (`smoke.mjs:112-116`); applies to any new smoke step in this change.
- `context/foundation/lessons.md:122` the Vitest global setup sweeps test users "at the start of a run": **P/C on timing** (the sweep is the returned teardown, `tests/setup/global-setup.ts:112-114`); the rule that only one session runs DB-backed tests still stands.
- `context/foundation/infrastructure.md:31` (`wrangler tail` as the observe step) and `:67` (pre-mortem: `wrangler tail` logs "with no request-correlation ID"): **S**; no request id exists in `src/`.
- `context/changes/deployment/deployment-plan.md:95` a null `createClient` makes sign-in "silently no-op": **P** (now a visible `not_configured` message, `signin.ts:13-16`; the null itself is still never logged).

## Related Research

- `context/archive/2026-10-01-checkoff-and-leaderboard/research.md` - the check-off/leaderboard design, Origin check behaviour and time model
- `context/archive/2026-09-30-testing-runner-data-isolation-and-permissions/research.md:69-73` - why endpoints are not imported in plain Vitest
- `context/archive/2026-09-25-group-create-join-manage/research.md` - group routes and the SQLSTATE mapping
- `context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md` - the observability audit of these two flows (written after this note)

## Open Questions

1. **Which finding does part A fix, and in which flow?** (`roadmap.md:125`, Owner: user, not blocking research.) Candidates C1-C4 in §9; the roadmap expects the choice after `/10x-observability-audit`. This research lists the evidence, and the audit (with optional runtime probes) would confirm or rank it.
2. **Is part B in scope, with which tool, and does the user have the account?** (`roadmap.md:126`, Owner: user.) Options and prerequisites in §8: `@sentry/cloudflare` plus an Astro middleware and explicit captures, `@sentry/astro`, or Cloudflare Workers Issues (needs Wrangler >= 4.134.0, installed 4.131.1, open beta). A DSN would be a Worker secret set by the user, never in the repo or chat.
3. **What is the production plan tier?** Not recorded in the repo; the roadmap assumes Free (10 ms CPU). It decides how much the unmeasured SDK overhead matters. Measuring needs a deployed build and `$workers.cpuTimeMs`; the plan should schedule that, not this research.
4. **For the join flow, is "API response" the documented 302 plus `?error=` or a real status?** Changing it means changing `README.md:182`, the native forms and smoke. The evidence here suggests only monitoring is missing for join.
5. **Are the quiet idempotent outcomes (stale submit, 0-row undo or delete, 23505) acceptable as they are?** They are deliberate (§5) but cannot be told apart from a policy regression; the plan should state them as out of scope or give them a log line.
6. **What should a protected `/api/*` or `/dashboard` request return when `getUser()` reports a service failure?** (C1.) Status and body, whether JSON mode differs from the redirect mode, and how `AuthSessionMissingError` is excluded.
7. **How does Workers Logs store a logged `Error` and a multi-argument `console.error`?** Not documented; the workerd source suggests `String(err)` without a stack in `message` plus `errorInfo`. Worth one deliberate check on a deployed build before relying on the logs for diagnosis.
8. **Which test seam proves "the failure is no longer a success"?** Existing precedent is `auth-callback.test.ts` (mocked `@/lib/supabase`, hand-built context, `console.error` spy). A middleware test also needs `astro:middleware` handled (inference), and `npm test` needs the local Supabase stack even for such a test, so only one session at a time can run it (`lessons.md` worktree rule).
