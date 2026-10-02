# Observability: failures reach the response and monitoring Implementation Plan

## Overview

S-08 (`observability-swallowed-errors`, roadmap outcome MS-05): in the critical flows (check-off and undo, joining a group) a failure is not swallowed or turned into a success-looking outcome; it reaches the API response (status and body) and monitoring. Part A teaches the app to report every returned Supabase error and stops the auth middleware from reading an Auth service failure as "signed out" (503 instead of a silent 302). Part B puts Sentry on the Worker through the middleware (the adapter's entry point stays as it is), with a PII lockdown and a measured CPU gate. Three phases, each its own PR and release; Phase 3 can be reverted without touching Phases 1 and 2.

## Current State Analysis

- The Supabase clients return failures instead of throwing them: postgrest-js turns a network failure into `{ error: { code: "" }, status: 0 }` (`node_modules/@supabase/postgrest-js/dist/index.cjs:418-455`) and auth-js `getUser()` resolves `{ data: { user: null }, error }` (`@supabase/auth-js/dist/module/GoTrueClient.js:2713-2723`). The route handlers' `try/catch → console.error` is therefore unreachable for backend failures (`research.md` §2, audit root cause 1).
- 13 of 16 route handlers map a returned `{ error }` to a `?error=` redirect and log nothing (list in the audit under G2); `signout.ts:8` never reads the result. Runtime probes J1, J2, J5 reproduced it for the join RPC: 302 `?error=unknown|forbidden`, zero log lines.
- `src/middleware.ts:11-14` discards the `getUser()` error: an Auth outage, a rejected key or a failed refresh becomes `user = null` and a 302 to `/auth/signin` on `/dashboard`, `/api/groups/*`, `/api/tasks/*` (`:20-24`). Probes C1a–C2e: 302 and zero log lines, byte-identical to a real sign-out (control C1f). The check-off island reads the 302 as `expired` and reloads (`src/lib/checkoff-client.ts:52-54`).
- The check-off `forbidden` outcome (23503, 42501) carries no error and is never logged (`src/lib/checkoffs.ts:30-34`; the routes log only `unknown`, `checkoff.ts:35-38`, `uncheck.ts:37-40`); an undo that deletes zero rows answers ok (`checkoffs.ts:77-79`). Probes C6–C9.
- Logging is 24 `console.error(<constant label>, <raw value>)` calls in 17 files, with no user, route, task or status field; Workers Logs is the only pipeline and there is no tracker (`research.md` §1, audit §2).
- Contracts that bound the change: the island maps 3xx to `expired`, 403/404 to `rejected` and every other non-200 to `failed` (`checkoff-client.ts:52-62`), so a 503 needs no client change; 37 `toEqual` assertions pin the `ok` and `forbidden` outcome shapes (`tests/integration/task-checkoff-flow.test.ts`); smoke expects 302 for anonymous requests (`scripts/smoke.mjs:424-436,484-503`); `README.md:182` documents the redirect and JSON contract.
- Tests: the one handler test mocks `@/lib/supabase` and hand-builds the context (`tests/integration/auth-callback.test.ts:7-20`); the single Vitest project needs the local Supabase stack even for pure unit files (`vitest.config.ts:14`); `astro:middleware` and `astro:env/server` cannot be imported in tests.
- Astro catches exceptions escaping middleware, endpoints and pages, logs the stack and renders a 500 itself (`node_modules/astro/dist/core/routing/handler.js:59-108`), so a tracker wrapped around `fetch` sees nothing; capture has to be explicit. The SDK's per-request wrapper (`wrapRequestHandler`, exported from `@sentry/cloudflare/request` since v11) can run inside the middleware, so the adapter's entry point and CI stay as they are.
- Sentry 11.x collects cookies, request headers, query strings and POST bodies by default (`sendDefaultPii` no longer exists), and the default `HttpServer` integration reads POST bodies up to 10 kB, which would include sign-in passwords and the join `code`. The template Sentry generated for the Astro platform does not fit: its server init from `@sentry/astro` loses events on Workers, and `sentry({ project, org, authToken })` adds a source-map plugin to every `astro build` (`@sentry/astro` 11.2.0 `integration/index.ts:62-98`); the course article's `Sentry.wrapRequestHandler` import was moved to `@sentry/cloudflare/request` in v11 (`MIGRATION.md:1315-1323`).

## Desired End State

- **Auth outage:** when `getUser()` reports a service failure (status 0, 5xx, `AuthRetryableFetchError`), protected paths answer 503: `{"ok":false,"error":"unavailable"}` for `Accept: application/json`, a minimal HTML page for everything else, both with `Retry-After: 30`; the island shows "Could not save. Try again." A visitor without a session, or with a session Auth reports as gone, still gets the 302 and no log. An unexpected Auth error stays a 302 and is reported. Missing configuration stays a 302 and is reported once per isolate.
- **Returned Supabase errors:** every route that maps a returned `{ error }` to `unknown` or `forbidden` writes one structured error line (event, route, user id, `cf-ray`, SQLSTATE, status, scrubbed message); `rate_limited` is an info line; domain outcomes (`invalid_code`, `already_in_group`, validation) stay quiet. Responses are unchanged.
- **Check-off:** `42501` is an error line; `23503`, a task that is gone, an invalid id and an undo that removes nothing are info lines with ids. Outcome shapes and responses are unchanged.
- **Unhandled exceptions:** anything escaping the middleware or `next()` is reported with route pattern, user id and `cf-ray`, then rethrown to Astro.
- **Sentry (Phase 3):** error-level reports reach Sentry grouped by event and code, with user id, route and ray, and with no cookies, headers, bodies, query strings, e-mail, IP or invite code; with no DSN nothing is sent; CPU stays inside the gate.
- **Verification:** new unit and handler tests (below), lint, typecheck, build, smoke, a before/after rerun of the audit's probe suite, and production checks per phase.

### Key Discoveries:

- `@supabase/supabase-js` re-exports auth-js (`export * from "@supabase/auth-js"`, `dist/index.d.cts:7`), so `isAuthRetryableFetchError` and `isAuthSessionMissingError` need no new dependency; the "session gone" codes (`bad_jwt`, `session_not_found`, `session_expired`, `refresh_token_not_found`, `refresh_token_already_used`, `user_not_found`, `no_authorization`) are members of auth-js `ErrorCode` (`@supabase/auth-js/dist/main/lib/error-codes.d.ts:6`).
- `getUser()` runs on every request before the protected-path check (`src/middleware.ts:8-14`) and returns `AuthSessionMissingError` for every anonymous visitor; that result is normal and must stay silent.
- PostgREST error `details` embeds key values (`Key (join_code)=(abc123) already exists.`), and the join code is a bearer secret, so logs and Sentry need a scrubber, not only field selection.
- `42501` is overloaded (RLS denial, revoked grant, anon-key downgrade after a failed session refresh, `node_modules/@supabase/supabase-js/dist/index.cjs:293-299,825-831`); logging it with its code is what makes a regression visible.
- `context.routePattern` yields `/join/[code]` rather than the raw path, so it is safe as a `route` field; `cf-ray` is available as a correlation id on proxied requests.
- Check-off outcome shapes are pinned, so the `forbidden` signal is logged inside `checkoffs.ts`, where the error is still in scope, instead of widening the outcome.

## What We're NOT Doing

- Dashboard answering 503 for failed reads and its per-read labels (audit G5); a `code` field in 403/404 answers that separates app errors from the Astro Origin-check 403 (G4). Both are left for a later slice; S-11 can build on this contract.
- `500.astro`, errors during streamed rendering, client-side capture (hydration errors, `unhandledrejection`), source maps and `@sentry/astro` or the browser SDK (G6, G7, G14).
- The auth callback's conflation of failures and its dropped provider parameters (B5), the sign-up obfuscated-user case (B4), invite lifecycle events (B1, B2, B3, B7), silent GET retries and Auth timeouts (G15).
- Sharing one Supabase client per request (G11) and the CI canary and version marker (G10); the Sentry release uses the Worker version id only.
- Quiet idempotent redirects outside check-off (stale task or group submits, zero-row `forbidden` in update/delete/rename) stay quiet, as decided in earlier reviews.
- Missing configuration answering 503: it stays a 302 to the sign-in page, which shows the configuration banner; it only gains one error log per isolate.
- Migrating the 7 remaining `console.error` sites (`dashboard.astro` ×5, `callback.ts` ×2) to the helper.
- Changing the check-off outcome shapes or the response contract for any request other than "Auth service failure on a protected path"; tracing.
- Client-side Sentry and everything from the onboarding template: `@sentry/astro`, `sentry.client.config.js`, `sentry.server.config.js`, source-map upload (`SENTRY_AUTH_TOKEN`); also `captureConsoleIntegration` and a custom Worker entry (`main`).

## Implementation Approach

Phase 1 builds the reporting helper and uses it first where the blindness is largest: the middleware. Classification of the `getUser()` result lives in a pure library function so most of the logic is testable without Astro; the middleware stays thin. Phase 2 applies the helper mechanically to every returned-error branch and to the check-off outcomes, with the policy of "which codes are failures" kept in one function (`reportMapped`) so 13 call sites cannot drift apart. Phase 3 plugs Sentry into the one place that already sees every error-level report, and locks down what the SDK may collect. Each phase is code-only (no migration), shippable alone, and rolled back with `npx wrangler rollback`.

Decisions that came from the planning interview: scope is "helper, middleware and all returned-error branches plus check-off outcomes"; an Auth service failure answers 503 (JSON or HTML) and everything else keeps its response; part B is Sentry in Phase 3; unexpected outcomes (`42501`, `unknown`) are errors, stale outcomes are info.

## Critical Implementation Details

- **Noise guard in the middleware.** Every anonymous page view makes `getUser()` return `AuthSessionMissingError`. Classification must treat it and the "session gone" codes as silent, or logs and 503s will follow ordinary traffic.
- **SDK data collection (Phase 3).** The SDK's default collection includes cookies, headers, POST bodies and query strings, and its default integrations read request bodies; the request wrapper reads a body only when the HttpServer integration is present (`httpServer.ts:80-89` in 11.2.0). The options therefore set `defaultIntegrations: false`, turn every `dataCollection` flag off and add a `beforeSend` scrubber, and a unit test pins them so an SDK upgrade or a careless edit cannot widen them.
- **Testing the middleware.** `src/middleware.ts` imports the virtual `astro:middleware`. Mock it with `vi.mock("astro:middleware", () => ({ defineMiddleware: (fn) => fn }))`; if Vitest cannot resolve the specifier even with a factory, alias it to a stub in `vitest.config.ts`. Keep decisions in `src/lib` so most coverage does not depend on this.
- **Workers Logs and object logs.** One plain-object argument is the documented structured form, but how Workers Logs indexes it was not verifiable from the repo. Phase 2 checks it in production; the contingency is a single JSON string argument, a one-line change in `src/lib/log.ts`.
- **Capture scope.** Astro catches exceptions before the Worker's `fetch` sees them, so the SDK's request wrapper has to sit inside the middleware, around the whole `onRequest` body, to cover everything the middleware calls. The wrapper captures an exception escaping its handler and rethrows it; explicit reports go through `reportError`, and the same error object is sent once.
- **Import path and release id (v11).** `wrapRequestHandler` comes from `@sentry/cloudflare/request`, not the main entry (the course article's `Sentry.wrapRequestHandler` fails on 11.x), it does not install the async-context strategy (`setAsyncLocalStorageAsyncContextStrategy()` is called once at module load), and it does not detect the release id, so the options compute it from `SENTRY_RELEASE` or `CF_VERSION_METADATA.id`.

## Phase 1: Failure reporting helper and auth-failure handling in the middleware

### Overview

Introduce the shared reporting helper and make the middleware tell an Auth service failure from a signed-out visitor: 503 on protected paths, structured logs for failures, and a report for exceptions that escape `next()`.

### Changes Required:

#### 1. Secret scrubber

**File**: `src/lib/redact.ts` (new)

**Intent**: One place that removes values that must never reach a log line or an error tracker: the value in PostgREST `Key (column)=(value)` fragments and the code segment of `/join/<code>` URLs.

**Contract**: `scrubSecrets(text: string): string`, pure, no imports, also masks e-mail-like tokens (`name@host.tld` becomes `[email]`), since GoTrue messages such as `email_address_not_authorized` can echo an address. `Key (a, b)=(x, y)` becomes `Key (a, b)=(…)`; `/join/<segment>` (segment ends at `/`, `?`, `#`, whitespace or a quote) becomes `/join/[code]`; text without these patterns is returned unchanged; applying it twice gives the same result. Used by `log.ts` now and by the Sentry `beforeSend` in Phase 3.

#### 2. Reporting helper

**File**: `src/lib/log.ts` (new)

**Intent**: Structured server-side failure reporting that keeps cause, status and ids, replacing ad-hoc `console.error(label, raw)`.

**Contract**: no `astro:*` runtime imports (testable in Vitest); the file holds the only `eslint-disable no-console` pair, which covers both `console.error` and `console.info` (the rule is "warn" for both).

```ts
type ReportContext = { route?: string; userId?: string | null; ray?: string | null; status?: number | null } &
  Record<string, string | number | boolean | null | undefined>;

reportError(event: string, error: unknown, context?: ReportContext): void; // console.error(payload)
reportInfo(event: string, context?: ReportContext): void; // console.info(payload)
reportMapped(event: string, code: string, error: unknown, context?: ReportContext): void;
requestFields(context: { request: Request; routePattern: string; locals: { user?: { id: string } | null } }): ReportContext;
```

- Payload is one plain object: `{ level, event, ...context, error: { name?, message?, code?, status?, details?, hint?, stack? } }`. An `Error` instance contributes `name`, `message`, `stack` (cut to 2000 characters) and `code`/`status` when present (Auth errors carry both); a PostgREST-shaped object contributes `message`, `details`, `hint`, `code`; anything else contributes `message: String(value)`. `message`, `details`, `hint` and `stack` pass through `scrubSecrets`; `message`, `details` and `hint` are cut to 500 characters (postgrest-js puts a whole HTML gateway body into `message` and a stack into `details` on network failures), and only non-empty strings are included.
- The helpers never throw: each body runs in a try/catch whose last resort is one bare `console.error("report.failed", event)`, because they are called inside `if (error)` branches and `catch` blocks, where a throw would turn a handled redirect into a 500.
- `reportMapped` encodes the agreed policy in one place: mapped code `unknown` or `forbidden` → `reportError` with `outcome: code`; `rate_limited` → `reportInfo` with the error code; any other code is a domain outcome and writes nothing.
- `requestFields` returns `{ route: routePattern, userId, ray: request.headers.get("cf-ray") }`.
- Callers never pass an e-mail, a cookie, a body or an invite code; the join route passes `codeLength` instead.

#### 3. Shared "wants JSON" rule

**File**: `src/lib/http.ts` (new), `src/lib/checkoff-response.ts`

**Intent**: Reuse the rule that decides JSON versus redirect between the middleware's 503 and the check-off responses instead of duplicating it.

**Contract**: `wantsJson(headers: Headers): boolean` is true when the `Accept` header (case-insensitive) contains `application/json`, exactly the rule at `checkoff-response.ts:26`; `checkoffResponse` calls it; behaviour is unchanged.

#### 4. Auth state classification

**File**: `src/lib/auth-state.ts` (new)

**Intent**: Classify what `supabase.auth.getUser()` returned, so the middleware can tell a signed-in user, a visitor without a valid session, an Auth service failure and an unexpected error apart, and build the 503.

**Contract**:

```ts
type AuthState =
  | { kind: "signed_in"; user: User }
  | { kind: "anonymous" } // no session, or a session Auth reports as gone
  | { kind: "unavailable"; error: AuthError } // Auth service failure: status 0 or >= 500
  | { kind: "unexpected"; error: AuthError } // anything else: treated as anonymous, but reported
  | { kind: "not_configured" }; // createClient returned null
resolveAuthState(supabase: Supabase | null): Promise<AuthState>;
unavailableResponse(request: Request): Response;
```

Classification order (the tests pin it): no client → `not_configured`; a user in the result → `signed_in`; no error → `anonymous`; `isAuthSessionMissingError(error)` → `anonymous`; `isAuthRetryableFetchError(error)` or `(error.status ?? 0) >= 500` → `unavailable`; `error.code` in `{ bad_jwt, session_not_found, session_expired, refresh_token_not_found, refresh_token_already_used, user_not_found, no_authorization }` → `anonymous`; otherwise `unexpected`. A non-Auth error thrown by `getUser()` is not caught here and propagates. `unavailableResponse` answers 503 with `Retry-After: 30` and `Cache-Control: no-store`; JSON mode (`wantsJson`) body `{"ok":false,"error":"unavailable"}`, otherwise a minimal inline HTML page (English, title "Service unavailable", one sentence).

#### 5. Middleware

**File**: `src/middleware.ts`

**Intent**: Use the classification, report failures, answer 503 on protected paths when Auth is unavailable, and report exceptions escaping the request, without changing any other behaviour.

**Contract**:

- `locals.user` is the user only for `signed_in`, otherwise `null`.
- Reports use `requestFields(context)`: `unavailable` → `reportError("auth.unavailable", error, …)`; `unexpected` → `reportError("auth.unexpected", error, …)`; `not_configured` → `reportError("auth.not_configured", …)` at most once per isolate (module-level flag); `anonymous` writes nothing.
- On a path in `PROTECTED_ROUTES` (unchanged), `unavailable` returns `unavailableResponse(request)`; otherwise a missing user still redirects to `/auth/signin`. A signed-in user on `/auth/signin` or `/auth/signup` still redirects to `/dashboard`; on those public pages `unavailable` just renders the page with no user.
- The whole `onRequest` body is wrapped in try/catch: `reportError("request.unhandled", error, …)` then `throw error`, so Astro still renders its 500.

#### 6. Tests

**Files**: `tests/unit/redact.test.ts`, `tests/unit/log.test.ts`, `tests/unit/auth-state.test.ts`, `tests/integration/middleware.test.ts` (all new)

**Intent**: Prove the behaviour end to end, including the roadmap's required "a failure is not a success" test, and guard the noise rule.

**Contract**:

- `redact`: an e-mail address alone and inside a sentence, single and compound `Key (…)=(…)`, `/join/<code>` alone, with a query string, with a trailing slash and inside a longer string, idempotence, unchanged text.
- `log`: `reportError` writes through `console.error` and `reportInfo` through `console.info`; payload shape for an `Error` with name and stack, for a PostgREST-shaped object, for an `AuthRetryableFetchError` (status 0) and for a string; `details` redaction; a `null` `details` and an empty `hint` are left out; `message` and `details` longer than 500 characters are cut; a helper call whose payload makes serialisation throw still returns and logs the last-resort line; an e-mail in a message is masked; the `reportMapped` table (`unknown` → error, `forbidden` → error, `rate_limited` → info, `invalid_code` → nothing); `requestFields` reads `cf-ray` and the user id.
- `auth-state`: the classification order above, including `AuthSessionMissingError` → `anonymous`, 401 `bad_jwt` and `session_not_found` → `anonymous`, 401 without a code → `unexpected`, `AuthRetryableFetchError` status 0 and 503 → `unavailable`, `AuthApiError` status 500 → `unavailable`, no client → `not_configured`; `unavailableResponse` in JSON and HTML mode (status, headers, body).
- `middleware` (mock `@/lib/supabase` and `astro:middleware`; hand-built context with `routePattern`): protected path, JSON mode, `unavailable` → 503 JSON and one `auth.unavailable` error line; protected `/dashboard`, HTML mode → 503 HTML; no session → 302 `/auth/signin` and no console output at all; `unexpected` → 302 and `auth.unexpected`; `not_configured` → 302 and exactly one `auth.not_configured` across two requests; public path with `unavailable` → `next()` runs and `locals.user` is `null`; signed in → `next()` runs; `next()` throws → `request.unhandled` reported and the same error rethrown.

#### 7. Docs

**Files**: `README.md`, `CLAUDE.md`

**Intent**: Record the new contract where readers look for it.

**Contract**: `README.md` — in the paragraph after the Task routes table (`:182`) add that a protected request answers 503 (JSON for `Accept: application/json`, a plain page otherwise) when the Auth service is unreachable, while no session still redirects to `/auth/signin`. `CLAUDE.md` — the "Auth flow" paragraph gets one sentence saying the middleware distinguishes an Auth service failure (503) from a missing session (302) and reports it.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Unit and integration tests pass, including the new redact, log, auth-state and middleware tests (needs the local Supabase stack, one session at a time): `npm test`
- Project builds: `npm run build`
- Smoke test still passes, including the anonymous 302 steps for check-off and the task and group routes: `npm run smoke`
- The new libraries import nothing from `astro:*`, so Vitest can load them: `grep -n "astro:" src/lib/redact.ts src/lib/log.ts src/lib/auth-state.ts src/lib/http.ts` prints nothing

#### Manual Verification:

- With an Auth outage simulated on a signed-in session (the audit's probe harness, or briefly stopping the local Supabase auth container when no other session uses the stack), `/dashboard` answers a 503 page, a "Mark done" tap shows "Could not save. Try again." and rolls back, `npm run preview` prints one `auth.unavailable` object per request, and restoring Auth returns normal behaviour without a restart
- Normal use on the preview build (sign in, dashboard, check off and undo, sign out, anonymous `/dashboard` redirect to sign-in) prints no `auth.*` or `request.unhandled` lines
- After the PR is merged, the `release` run is approved in the GitHub `production` environment (this phase has no migration) and the production URL passes the same walk-through; `npx wrangler tail --format json` shows no `auth.*` events during it
- The date, release run and result are noted in `context/changes/deployment/deployment-plan.md` under a new S-08 entry (Phase 11; S-06 holds Phase 10, take the next free number if another slice landed first)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Report returned Supabase errors in routes and check-off outcomes

### Overview

Apply the helper to every returned-error branch of the route handlers, to `signout` and to the check-off outcomes, convert the touched `catch` logs, and leave every response unchanged.

### Changes Required:

#### 1. Returned-error branches in 13 route handlers

**Files**: `src/pages/api/groups/{create,delete,join,leave,remove-member,rename}.ts`, `src/pages/api/auth/{signin,signup}.ts`, `src/pages/api/tasks/{create,delete,join,leave,update}.ts`

**Intent**: After the existing mapping call, report the mapped failure through `reportMapped`, so unmapped SQLSTATEs, PostgREST and 5xx errors and network failures (all `unknown`) and `42501` (`forbidden`) become visible while domain outcomes stay quiet.

**Contract**: in each `if (error)` branch call `reportMapped(event, mappedCode, error, { ...requestFields(context), status })` before the redirect, with `status` taken from the Supabase result where the client returns it (destructure it next to `error`; Auth errors carry their own status). The redirect targets and cookie handling stay exactly as they are. In `tasks/join.ts` the 23505/23503 idempotent early return stays before the report. `groups/join.ts` adds `codeLength: code.length` and never logs the code. Events:

| File                      | Failed branch                 | Exception (catch)                |
| ------------------------- | ----------------------------- | -------------------------------- |
| `groups/create.ts`        | `groups.create.failed`        | `groups.create.exception`        |
| `groups/delete.ts`        | `groups.delete.failed`        | `groups.delete.exception`        |
| `groups/join.ts`          | `groups.join.failed`          | `groups.join.exception`          |
| `groups/leave.ts`         | `groups.leave.failed`         | `groups.leave.exception`         |
| `groups/remove-member.ts` | `groups.remove_member.failed` | `groups.remove_member.exception` |
| `groups/rename.ts`        | `groups.rename.failed`        | `groups.rename.exception`        |
| `auth/signin.ts`          | `auth.signin.failed`          | `auth.signin.exception`          |
| `auth/signup.ts`          | `auth.signup.failed`          | `auth.signup.exception`          |
| `tasks/create.ts`         | `tasks.create.failed`         | `tasks.create.exception`         |
| `tasks/delete.ts`         | `tasks.delete.failed`         | `tasks.delete.exception`         |
| `tasks/join.ts`           | `tasks.join.failed`           | `tasks.join.exception`           |
| `tasks/leave.ts`          | `tasks.leave.failed`          | `tasks.leave.exception`          |
| `tasks/update.ts`         | `tasks.update.failed`         | `tasks.update.exception`         |

#### 2. Catch blocks and sign-out

**Files**: the 13 files above, `src/pages/api/tasks/checkoff.ts`, `src/pages/api/tasks/uncheck.ts`, `src/pages/api/auth/signout.ts`

**Intent**: Give every logged exception the same shape and ids, and stop ignoring the `signOut()` result.

**Contract**: each `catch` replaces its `console.error(label, error)` and eslint-disable comment with `reportError("<event>.exception", error, requestFields(context))`; the response in the catch is unchanged. `signout.ts` reads `{ error }` from `signOut()` and calls `reportError("auth.signout.failed", error, …)`; it still clears the invite cookie and answers 302 `/`.

#### 3. Check-off outcomes

**Files**: `src/lib/checkoffs.ts`, `src/pages/api/tasks/checkoff.ts`, `src/pages/api/tasks/uncheck.ts`

**Intent**: Make each non-ok outcome visible according to the agreed policy without changing the outcome shapes pinned by tests.

**Contract**:

- In `checkOff` and `uncheck`, before returning `forbidden`: SQLSTATE `42501` → `reportError("checkoff.forbidden" | "uncheck.forbidden", error, { userId, taskId, status })`; `23503` → `reportInfo("checkoff.not_enrolled" | "uncheck.not_enrolled", { userId, taskId })`; `23505` (already ticked) stays silent.
- In `uncheck`, an undo whose delete returns zero rows → `reportInfo("uncheck.nothing_removed", { userId, taskId })` (read `data` from `.select("period")`); rows removed stays silent.
- The routes' `unknown` outcome is reported as `checkoff.failed` / `uncheck.failed` through `reportError` with `outcome.error` and the request fields; `getTask` returning null → `reportInfo("checkoff.task_gone" | "uncheck.task_gone", …)`; an invalid `task_id` → `reportInfo("checkoff.invalid_id" | "uncheck.invalid_id", …)`.
- `CheckoffOutcome`, `checkoffResponse` and every response body or status stay as they are.

#### 4. Tests

**Files**: `tests/unit/checkoffs-reporting.test.ts`, `tests/integration/groups-join-route.test.ts`, `tests/integration/tasks-create-route.test.ts`, `tests/integration/auth-signin-route.test.ts` (all new)

**Intent**: Prove that returned failures are reported and domain outcomes are not, on the two critical flows and one representative route of each other kind.

**Contract**:

- `checkoffs-reporting` (a small chainable fake Supabase client): `42501` → `forbidden` outcome plus one error line with code, status and ids; `23503` → `forbidden` plus an info line; `23505` → `ok` and no output; an unknown code → `unknown` outcome and no output from the library (the route reports it); undo with zero rows → `ok` plus `uncheck.nothing_removed`; undo with rows → `ok` and no output.
- `groups-join-route` (mock `@/lib/supabase`, hand-built context with a form body and a cookie stub): RPC error with status 500 → 302 `/dashboard?error=unknown`, one `groups.join.failed` error line with `code`, `status`, `userId`, `codeLength`, and no logged string contains the invite code; `P0002` → `invalid_code` and no output; `42501` → `forbidden` plus an error line; a non-form body → `groups.join.exception`.
- `tasks-create-route`: `{ error: XX000 }` → redirect `unknown` plus an error line; `23514` → `invalid_title` and no output.
- `auth-signin-route`: `AuthRetryableFetchError` → `?error=unknown` plus an error line; `invalid_credentials` → no output; `over_request_rate_limit` → `rate_limited` plus an info line.
- The existing `task-checkoff-flow` suite and the check-off client tests stay green unchanged.

#### 5. Docs and lesson

**Files**: `README.md`, `context/foundation/lessons.md`

**Intent**: Document what is logged and why, and keep the rule alive for later slices.

**Contract**: `README.md` gains an `## Observability` section between `## Deployment` and `## Smoke test`: the helper, event naming (`<area>.<action>.<outcome>`), levels (error for unexpected outcomes, info for stale ones), the fields and what is never logged (e-mail, cookies, bodies, invite code; use `codeLength`), how to read logs (`npx wrangler tail --format json`, Workers Logs query by `event`), the 503 contract, and "a new Supabase call reports its returned error". The lesson "Every returned Supabase `{ error }` in a route is reported; never map `error.code` and drop it" is added with `/10x-lesson`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Types check: `npx astro check`
- All tests pass, including the new check-off reporting and route tests and the unchanged `task-checkoff-flow` suite (needs the local Supabase stack, one session at a time): `npm test`
- Project builds: `npm run build`
- Smoke test still passes, because the responses of the touched routes are unchanged: `npm run smoke`
- Every returned-error branch reports through the helper: `grep -L "reportMapped(" src/pages/api/groups/{create,delete,join,leave,remove-member,rename}.ts src/pages/api/auth/{signin,signup}.ts src/pages/api/tasks/{create,delete,join,leave,update}.ts` prints nothing
- No route handler logs with a bare `console` call, and the only remaining ones are the helper's, `callback.ts` and `dashboard.astro`: `grep -rln "console\." src` lists only `src/lib/log.ts`, `src/pages/auth/callback.ts` and `src/pages/dashboard.astro`

#### Manual Verification:

- `/10x-observability-audit --verify context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md --runtime` on the phase branch shows: J1, J2 and J5 now log `groups.join.failed`; C6 logs `checkoff.forbidden`; C7, C8 and C9 log info events; the HTTP responses of the touched routes are unchanged; the Phase 1 rows (C1a–C1e, C2a, C2c, C2d, C2e, J8a, J8b) answer 503 with `auth.unavailable` while the control C1f stays a silent 302 and C2b and C2h are unchanged
- After the release, a signed-in browser-console `fetch` of `/api/tasks/checkoff` with a JSON body produces a `checkoff.exception` entry in Workers Logs whose fields (`event`, `code`, `userId`) are searchable; if the object arrives flattened into one string, `src/lib/log.ts` is switched to one JSON string argument and the change is noted
- Production check after the release: a member checks off and undoes a task and joins a group with a valid invite; nothing changes for the user
- The release result is added to the S-08 entry in `context/changes/deployment/deployment-plan.md`
- The rule "report every returned Supabase error" is recorded in `context/foundation/lessons.md` with `/10x-lesson`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Sentry on the Worker

### Overview

Connect error-level reports to Sentry through `@sentry/cloudflare`, run from the middleware around each request (the adapter's entry point stays), with a locked-down data collection, a release id and the DSN kept as a Worker secret, behind a measured CPU gate with explicit rollback.

### Changes Required:

#### 1. Dependency

**File**: `package.json` (and the lockfile)

**Intent**: Add the Cloudflare SDK only. `@sentry/astro` is not installed: its server half silently loses events on Workers and its Vite plugin touches every build, so the template Sentry generated for the Astro platform is not used.

**Contract**: `@sentry/cloudflare@^11.2.0` as a dependency (engines `>=22.12 <23` match `.nvmrc` 22.14.0; a Node 24 dev box only prints an npm warning). No `sentry.*.config.*` file and no change to `astro.config.mjs`. The repo has no types for the `cloudflare:workers` module (no `@cloudflare/workers-types`, no `worker-configuration.d.ts`; `astro check` fails with TS2307), so `src/env.d.ts` gains an ambient `declare module "cloudflare:workers" { export const env: import("./lib/sentry-options").SentryEnv; }`, which types only what `sentry.ts` reads; the `cfContext` handed to the SDK is cast to its `ExecutionContext` type there.

#### 2. SDK options and scrubber

**File**: `src/lib/sentry-options.ts` (new)

**Intent**: One testable place for the SDK options and the event scrubber, so the privacy settings are pinned by a test.

**Contract**: `sentryOptions(env: SentryEnv)` with `SentryEnv = { SENTRY_DSN?: string; SENTRY_ENVIRONMENT?: string; SENTRY_RELEASE?: string; CF_VERSION_METADATA?: { id?: string } }`, and `scrubEvent(event)` as the `beforeSend`; the integrations array is module-level.

```ts
{
  dsn: env.SENTRY_DSN,
  defaultIntegrations: false,                       // no Fetch, Console, HttpServer, RequestData, Dedupe
  integrations: [linkedErrorsIntegration()],        // keeps error.cause chains only
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
  beforeSend: scrubEvent,
}
```

`release` is `env.SENTRY_RELEASE ?? env.CF_VERSION_METADATA?.id` (the key is left out when both are missing); `environment` is `env.SENTRY_ENVIRONMENT` (left out when missing, the SDK then uses "production"); no `tracesSampleRate` or `tracesSampler`. `scrubEvent` keeps only `user.id`, deletes `contexts.culture` and `contexts.cloud_resource` (the request wrapper adds both), runs `scrubSecrets` over the serialised event and returns it.

#### 3. Request wrapper in the middleware

**Files**: `src/lib/sentry.ts` (new), `src/middleware.ts`

**Intent**: Run every request inside the SDK's request wrapper so reports made anywhere in the request have a client and a scope and events are flushed after the response, without touching the adapter's entry point.

**Contract**: `src/lib/sentry.ts` is the only module that imports `cloudflare:workers` (for `env`) and `@sentry/cloudflare/request`; at module load it calls `setAsyncLocalStorageAsyncContextStrategy()`; it exports `runWithSentry(context: { request: Request; locals: { cfContext?: unknown } }, handler: () => Promise<Response>): Promise<Response>`, which is `Sentry.withScope(() => wrapRequestHandler({ options: sentryOptions(env), request: context.request, context: context.locals.cfContext }, handler))`. `middleware.ts` becomes `onRequest = defineMiddleware((context, next) => runWithSentry(context, () => handle(context, next)))`, where `handle` is the Phase 1 body, so its reports, its 503 and its try/catch run inside the wrapper; behaviour is otherwise unchanged. With no DSN the SDK has no transport and sends nothing.

#### 4. Wrangler config

**File**: `wrangler.jsonc`

**Intent**: Give the SDK a release id and an environment name; `main`, the build and deploy commands and CI do not change.

**Contract**: add `"version_metadata": { "binding": "CF_VERSION_METADATA" }` and `"vars": { "SENTRY_ENVIRONMENT": "production" }`. The var also applies to the local preview, so a local preview with a DSN must override it in `.dev.vars` (`SENTRY_ENVIRONMENT=local`; dev vars win over config vars). `SENTRY_DSN` is a Worker secret set by the user (`npx wrangler secret put SENTRY_DSN`), not a build variable; `playwright.config.ts` and the build and preview scripts do not change. If the built `dist/server/wrangler.json` lacks the binding, the fallback is a `SENTRY_RELEASE` variable.

#### 5. Capture in the helper

**File**: `src/lib/log.ts`

**Intent**: Send every error-level report to Sentry, once, with a stable grouping, and nothing at info level.

**Contract**: first check that the unmocked suites (`task-checkoff-flow.test.ts` reaches `log.ts` through `checkoffs.ts`) still load with the real `@sentry/cloudflare` under Node; if they do not, `sentry.ts` registers a capture function with `log.ts` instead of `log.ts` importing the SDK. When `Sentry.isEnabled()` is true, `reportError` calls `Sentry.captureException(errorOrSynthetic, { level: "error", tags: { event }, user: userId ? { id: userId } : undefined, extra: <scrubbed payload fields>, fingerprint: [event, code ?? "none"] })`, where `errorOrSynthetic` is the original `Error` when there is one and otherwise a new `Error` with the scrubbed message and the name `SupabaseError` (plain PostgREST objects have no stack, and without the fingerprint every such event would group by the helper's own frames). A capture context and a hint cannot be mixed in one call. `reportInfo` never calls Sentry. With no DSN the call is skipped.

#### 6. Tests

**Files**: `tests/unit/sentry-options.test.ts` (new), `tests/unit/log.test.ts` (extended), `tests/integration/middleware.test.ts` (updated)

**Intent**: Pin the privacy settings and the capture rules, and keep the Phase 1 middleware tests green with the wrapper in place.

**Contract**: `sentry-options`: `defaultIntegrations` is `false`; the integrations are exactly the linked-errors integration; every `dataCollection` flag is off and `httpBodies` is empty; no `tracesSampleRate`, `tracesSampler` key; `release` comes from `SENTRY_RELEASE` before `CF_VERSION_METADATA.id` and the key is absent when both are missing; `scrubEvent` on a fixture event removes `Key (…)=(value)` values and `/join/<code>`, drops e-mail and IP from `user`, deletes the two contexts and returns the event. `log` (with `vi.mock("@sentry/cloudflare")`): an error report calls `captureException` once with the tag, user id, fingerprint and scrubbed extra; an info report does not; `isEnabled()` false does not. `middleware`: add `vi.mock("@/lib/sentry", () => ({ runWithSentry: (_context, handler) => handler() }))`, keep every Phase 1 case, and assert the handler runs through `runWithSentry`.

#### 7. Docs

**File**: `README.md`

**Intent**: Say how to set Sentry up without putting a secret anywhere it should not be, and which parts of the Sentry template to skip.

**Contract**: in the `## Observability` section add: create the Sentry project; run `npx wrangler secret put SENTRY_DSN` yourself (never put the DSN in the repo); optional `SENTRY_DSN` in `.dev.vars` for a local preview; do not run `npx astro add @sentry/astro` or create `sentry.server.config.js` (it loses events on Workers); set the key's rate limit and spike protection (Dedupe is off, so a burst counts every event against the free quota); an issue alert rule that mails you, filtered to `environment:production`; the free quota is second-hand (about 5k errors a month, verify on sentry.io); the optional Sentry MCP for Claude Code (`claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Types check, including the new Sentry modules: `npx astro check`
- All tests pass, including the Sentry options, scrubbing, capture and updated middleware tests (needs the local Supabase stack, one session at a time): `npm test`
- Project builds and the generated config carries the version binding and the variable: `npm run build && grep -E "version_metadata|SENTRY_ENVIRONMENT" dist/server/wrangler.json`
- Smoke test passes with the request wrapper active and no DSN set, so the SDK stays silent: `npm run smoke`
- The onboarding template is not in use: `@sentry/astro` is absent from `package.json` and no `sentry.*.config.*` file exists: `! grep -q "@sentry/astro" package.json && ! ls sentry.*.config.* 2>/dev/null`

#### Manual Verification:

- The Workers plan tier is read in the Cloudflare dashboard and noted in `context/changes/deployment/deployment-plan.md`, which resolves the open question behind the 10 ms CPU limit
- Baseline CPU time (P50, P95 and Max of `$workers.cpuTimeMs` for at least 30 invocations each of `GET /dashboard` and `POST /api/tasks/checkoff`) is read from Workers Logs before this phase's release and noted; a short manual session generates the samples if traffic is low
- The Sentry project exists and its DSN is set as a Worker secret by the user with `! npx wrangler secret put SENTRY_DSN`, never in the repo; if the DSN was ever shown in a chat, a new client key replaces it and the old one is disabled; the key's rate limit and spike protection are set and an issue alert rule that mails the user exists
- On the local preview build with the DSN and `SENTRY_ENVIRONMENT=local` in `.dev.vars`, a forced `checkoff.exception` (JSON body to `/api/tasks/checkoff`) appears in Sentry grouped by event and code, and its JSON has no `request` block, cookies, headers, body, query string, e-mail, IP or invite code, only `user.id`, the tags and the scrubbed message
- After the release, a different forced event (`uncheck.exception`, JSON body to `/api/tasks/uncheck`) arrives from production as a new issue with the Worker version id as release and `production` as environment, and the alert mail arrives (the local `checkoff.exception` has another environment and fingerprint, so it cannot merge with it or suppress the alert)
- The CPU gate passes on production with the same measurements: no `exceededCpu` outcome or Error 1102, Max under 10 ms on both routes, and P95 within 2 ms of the baseline; otherwise run `npx wrangler rollback`, revert this phase's PR, note the measurement in `deployment-plan.md` and close the slice with Phases 1 and 2 in place
- `context/changes/deployment/deployment-plan.md` holds the final S-08 entry: versions released, secrets set, CPU readings and plan tier

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `redact`, `log` (payload shapes, redaction, the `reportMapped` policy, Sentry capture rules), `auth-state` (the classification order and both 503 bodies), `checkoffs-reporting` (which outcomes log and at which level), `sentry-options` (privacy settings and the scrubber).
- Key edge cases: `AuthSessionMissingError` and the "session gone" codes stay silent; a plain PostgREST object and an `Error` both produce a usable payload; `Key (join_code)=(…)` never leaves the process; domain codes write nothing.

### Integration Tests:

- `middleware` (the roadmap's "failure is not a success" test: Auth outage → 503 and a log, no session → 302 and silence), `groups-join-route`, `tasks-create-route`, `auth-signin-route`, with `@/lib/supabase` mocked as in `auth-callback.test.ts`.
- Existing suites that must stay unchanged and green: `task-checkoff-flow` (37 outcome assertions), `checkoff-client`, `auth-callback`, and `npm run smoke` (anonymous 302 steps).

### Manual Testing Steps:

1. Phase 1: simulate an Auth outage on a signed-in session; check the 503 page, the "Could not save" tap and the `auth.unavailable` log; check that normal use is silent.
2. Phase 2: rerun the audit's probe suite in verify mode and compare with the baseline; after the release, force one exception from the browser console and confirm the fields in Workers Logs.
3. Phase 3: force one event locally and in production and inspect the Sentry payload for the absence of cookies, headers, bodies, queries, e-mail, IP and invite code; take the CPU readings before and after.
4. Production walk-through after each release: sign in, dashboard, check off and undo, join with an invite, sign out, anonymous `/dashboard`.

## Performance Considerations

- Phases 1 and 2 add no network call: classification reuses the existing `getUser()` result and a report is one `console` call on a failure path. The 503 body is an inline string.
- Phase 3 adds the SDK's per-request wrapper cost even without events; it is unmeasured and unpublished, hence the CPU gate. Free-plan CPU is 10 ms per invocation, waiting on `fetch` does not count, and the plan tier is not recorded in the repo. With Dedupe off, an Auth outage can produce one Sentry event per request; the key rate limit bounds it.
- When Auth is down and the access token is expired, auth-js retries the refresh for about 25 seconds before returning (probe P13c), so the 503 can arrive late; this plan does not change that.

## Migration Notes

No migrations. Each phase is code-only and backward compatible; the recovery path is `npx wrangler rollback` (code only). Phase 3 adds a Worker secret and two config entries; reverting the PR leaves them harmless. Phase 1 changes what a protected request returns during an Auth outage; nothing else a client relies on changes.

## References

- Related research: `context/changes/observability-swallowed-errors/research.md`
- Audit: `context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md` (findings G1–G3 and A1 drive this plan; the probe harness, its probe-only app code and the baseline `full2` are committed under `context/audits/observability/probes/2026-10-02_check-off-and-uncheck-join-group/` with an apply note in its `README.md`)
- Roadmap: `context/foundation/roadmap.md` (S-08), `context/foundation/roadmap-input-next-slices.md` §5
- Handler test precedent: `tests/integration/auth-callback.test.ts:7-20`
- Check-off contract: `src/lib/checkoff-client.ts:52-62`, `src/lib/checkoffs.ts:30-34,62-80`, `src/lib/checkoff-response.ts:9-34`
- Middleware today: `src/middleware.ts:7-32`; Astro's exception catch: `node_modules/astro/dist/core/routing/handler.js:59-108`
- Sentry for Cloudflare 11.x: the request wrapper `@sentry/cloudflare/request` (`MIGRATION.md:1315-1323`), body capture only with the HttpServer integration (`httpServer.ts:80-89`), release detection only in `withSentry` (`options.ts:41-51`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Failure reporting helper and auth-failure handling in the middleware

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — c01d4b7
- [x] 1.2 Types check: `npx astro check` — c01d4b7
- [x] 1.3 Unit and integration tests pass, including the new redact, log, auth-state and middleware tests (needs the local Supabase stack, one session at a time): `npm test` — c01d4b7
- [x] 1.4 Project builds: `npm run build` — c01d4b7
- [x] 1.5 Smoke test still passes, including the anonymous 302 steps for check-off and the task and group routes: `npm run smoke` — c01d4b7
- [x] 1.6 The new libraries import nothing from `astro:*`, so Vitest can load them: `grep -n "astro:" src/lib/redact.ts src/lib/log.ts src/lib/auth-state.ts src/lib/http.ts` prints nothing — c01d4b7

#### Manual

- [ ] 1.7 With an Auth outage simulated on a signed-in session (the audit's probe harness, or briefly stopping the local Supabase auth container when no other session uses the stack), `/dashboard` answers a 503 page, a "Mark done" tap shows "Could not save. Try again." and rolls back, `npm run preview` prints one `auth.unavailable` object per request, and restoring Auth returns normal behaviour without a restart
- [ ] 1.8 Normal use on the preview build (sign in, dashboard, check off and undo, sign out, anonymous `/dashboard` redirect to sign-in) prints no `auth.*` or `request.unhandled` lines
- [ ] 1.9 After the PR is merged, the `release` run is approved in the GitHub `production` environment (this phase has no migration) and the production URL passes the same walk-through; `npx wrangler tail --format json` shows no `auth.*` events during it
- [ ] 1.10 The date, release run and result are noted in `context/changes/deployment/deployment-plan.md` under a new S-08 entry (Phase 11; S-06 holds Phase 10, take the next free number if another slice landed first)

### Phase 2: Report returned Supabase errors in routes and check-off outcomes

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 5cf7a3c
- [x] 2.2 Types check: `npx astro check` — 5cf7a3c
- [x] 2.3 All tests pass, including the new check-off reporting and route tests and the unchanged `task-checkoff-flow` suite (needs the local Supabase stack, one session at a time): `npm test` — 5cf7a3c
- [x] 2.4 Project builds: `npm run build` — 5cf7a3c
- [x] 2.5 Smoke test still passes, because the responses of the touched routes are unchanged: `npm run smoke` — 5cf7a3c
- [x] 2.6 Every returned-error branch reports through the helper: `grep -L "reportMapped(" src/pages/api/groups/{create,delete,join,leave,remove-member,rename}.ts src/pages/api/auth/{signin,signup}.ts src/pages/api/tasks/{create,delete,join,leave,update}.ts` prints nothing — 5cf7a3c
- [x] 2.7 No route handler logs with a bare `console` call, and the only remaining ones are the helper's, `callback.ts` and `dashboard.astro`: `grep -rln "console\." src` lists only `src/lib/log.ts`, `src/pages/auth/callback.ts` and `src/pages/dashboard.astro` — 5cf7a3c

#### Manual

- [ ] 2.8 `/10x-observability-audit --verify context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md --runtime` on the phase branch shows: J1, J2 and J5 now log `groups.join.failed`; C6 logs `checkoff.forbidden`; C7, C8 and C9 log info events; the HTTP responses of the touched routes are unchanged; the Phase 1 rows (C1a–C1e, C2a, C2c, C2d, C2e, J8a, J8b) answer 503 with `auth.unavailable` while the control C1f stays a silent 302 and C2b and C2h are unchanged
- [ ] 2.9 After the release, a signed-in browser-console `fetch` of `/api/tasks/checkoff` with a JSON body produces a `checkoff.exception` entry in Workers Logs whose fields (`event`, `code`, `userId`) are searchable; if the object arrives flattened into one string, `src/lib/log.ts` is switched to one JSON string argument and the change is noted
- [ ] 2.10 Production check after the release: a member checks off and undoes a task and joins a group with a valid invite; nothing changes for the user
- [ ] 2.11 The release result is added to the S-08 entry in `context/changes/deployment/deployment-plan.md`
- [ ] 2.12 The rule "report every returned Supabase error" is recorded in `context/foundation/lessons.md` with `/10x-lesson`

### Phase 3: Sentry on the Worker

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 280b11e
- [x] 3.2 Types check, including the new Sentry modules: `npx astro check` — 280b11e
- [x] 3.3 All tests pass, including the Sentry options, scrubbing, capture and updated middleware tests (needs the local Supabase stack, one session at a time): `npm test` — 280b11e
- [x] 3.4 Project builds and the generated config carries the version binding and the variable: `npm run build && grep -E "version_metadata|SENTRY_ENVIRONMENT" dist/server/wrangler.json` — 280b11e
- [x] 3.5 Smoke test passes with the request wrapper active and no DSN set, so the SDK stays silent: `npm run smoke` — 280b11e
- [x] 3.6 The onboarding template is not in use: `@sentry/astro` is absent from `package.json` and no `sentry.*.config.*` file exists: `! grep -q "@sentry/astro" package.json && ! ls sentry.*.config.* 2>/dev/null` — 280b11e

#### Manual

- [ ] 3.7 The Workers plan tier is read in the Cloudflare dashboard and noted in `context/changes/deployment/deployment-plan.md`, which resolves the open question behind the 10 ms CPU limit
- [ ] 3.8 Baseline CPU time (P50, P95 and Max of `$workers.cpuTimeMs` for at least 30 invocations each of `GET /dashboard` and `POST /api/tasks/checkoff`) is read from Workers Logs before this phase's release and noted; a short manual session generates the samples if traffic is low
- [ ] 3.9 The Sentry project exists and its DSN is set as a Worker secret by the user with `! npx wrangler secret put SENTRY_DSN`, never in the repo; if the DSN was ever shown in a chat, a new client key replaces it and the old one is disabled; the key's rate limit and spike protection are set and an issue alert rule that mails the user exists
- [ ] 3.10 On the local preview build with the DSN and `SENTRY_ENVIRONMENT=local` in `.dev.vars`, a forced `checkoff.exception` (JSON body to `/api/tasks/checkoff`) appears in Sentry grouped by event and code, and its JSON has no `request` block, cookies, headers, body, query string, e-mail, IP or invite code, only `user.id`, the tags and the scrubbed message
- [ ] 3.11 After the release, a different forced event (`uncheck.exception`, JSON body to `/api/tasks/uncheck`) arrives from production as a new issue with the Worker version id as release and `production` as environment, and the alert mail arrives (the local `checkoff.exception` has another environment and fingerprint, so it cannot merge with it or suppress the alert)
- [ ] 3.12 The CPU gate passes on production with the same measurements: no `exceededCpu` outcome or Error 1102, Max under 10 ms on both routes, and P95 within 2 ms of the baseline; otherwise run `npx wrangler rollback`, revert this phase's PR, note the measurement in `deployment-plan.md` and close the slice with Phases 1 and 2 in place
- [ ] 3.13 `context/changes/deployment/deployment-plan.md` holds the final S-08 entry: versions released, secrets set, CPU readings and plan tier
