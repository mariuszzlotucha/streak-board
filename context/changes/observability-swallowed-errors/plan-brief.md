# Observability: failures reach the response and monitoring — Plan Brief

> Full plan: `context/changes/observability-swallowed-errors/plan.md`
> Research: `context/changes/observability-swallowed-errors/research.md`
> Audit: `context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md`

## What & Why

S-08 (roadmap MS-05): in the critical flows (check-off and undo, joining a group) a failure must not be swallowed or turned into a success-looking outcome; it has to reach the API response (status and body) and monitoring. The audit found that the Supabase clients return errors instead of throwing them, so most routes log nothing on a backend failure, and that the auth middleware reads an Auth outage as "signed out" (a silent 302, reproduced at runtime).

## Starting Point

13 of 16 route handlers map a returned `{ error }` to a redirect and log nothing; `src/middleware.ts` discards the `getUser()` error; the check-off `forbidden` outcome and a zero-row undo leave no trace. Logging is 24 `console.error(label, raw)` calls into Workers Logs with no user, route or status, and there is no tracker. Responses are pinned by the island's status mapping, 37 outcome assertions and the smoke suite, so the plan changes logging, not responses, with one exception.

## Desired End State

An Auth service failure on a protected path answers 503 (JSON for the island, a plain page otherwise) and writes one structured error line; a missing session still redirects quietly. Every returned Supabase error that maps to `unknown` or `forbidden` writes one error line with SQLSTATE, status, user id and `cf-ray`; stale outcomes write info lines; domain outcomes stay quiet; responses are unchanged. Phase 3 sends the error-level reports to Sentry with no cookies, bodies, queries, e-mail, IP or invite code, inside a measured CPU gate.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope of part A | Helper, middleware, all returned-error branches and check-off outcomes | Closes both root causes in the audit's recommended order; responses stay as they are | Plan (user) |
| Response on Auth outage | 503: JSON for `Accept: application/json`, HTML page otherwise; no session or 401 stays 302; missing config stays 302 plus one log | The failure reaches the API response and the island already maps a 5xx to "Could not save" | Plan (user) |
| What counts as a failure | `unknown` and `42501` are errors; `23503`, task gone, zero-row undo, invalid id and `rate_limited` are info; domain codes are quiet | A spike of stale events exposes a regression without noise in alerts | Plan (user) |
| Part B | Sentry in Phase 3 via `@sentry/cloudflare` only, the request wrapper inside the middleware (no custom `main`, no `@sentry/astro`), explicit capture, DSN as a Worker secret | Smallest surface: no build or bundle change and the DSN stays out of the repo, as the roadmap asks | Plan (user), Research |
| Sentry template and course snippet | Neither is used as generated: no `sentry.server.config.js`, no `sentry({ project, org, authToken })`, import `wrapRequestHandler` from `@sentry/cloudflare/request` | The template's server init loses events on Workers and adds a source-map plugin to every build; the article's import was moved in v11 | Research |
| Auth classification | Service failure = `isAuthRetryableFetchError` or status ≥ 500; `AuthSessionMissingError` and the "session gone" codes are silent; other errors stay 302 and are reported | `getUser()` runs on every request, so ordinary visitors must not log or 503 | Plan, Research |
| Where the policy lives | `reportMapped` decides per mapped code, `scrubSecrets` removes key values and `/join/<code>` | 13 call sites cannot drift, and the bearer invite code never reaches logs or Sentry | Plan |
| Check-off signal | Logged inside `checkoffs.ts`, outcome shapes untouched | 37 `toEqual` assertions pin the shapes | Plan, Research |
| SDK data collection | `defaultIntegrations: false`, every `dataCollection` flag off, `beforeSend` scrubber, pinned by a test | Sentry 11 collects cookies, headers and POST bodies (passwords) by default | Research |
| CPU gate | Compare `$workers.cpuTimeMs` before and after; fail on `exceededCpu`, Max ≥ 10 ms or P95 +2 ms; then roll back Phase 3 only | SDK overhead is unmeasured and the plan tier is unknown | Plan |

## Scope

**In scope:** reporting helper and scrubber; Auth classification, 503 contract and `request.unhandled` in the middleware; `reportMapped` in 13 routes plus `signout`; check-off outcome logging; tests; README, CLAUDE.md and a lesson; Sentry wiring, release metadata and the CPU gate.

**Out of scope:** dashboard 503 and its labels, `code` in 403/404 answers, `500.astro`, stream and client-side capture (so no `@sentry/astro`), source-map upload, callback and sign-up findings, invite funnel, one client per request, CI canary, missing-config 503, quiet redirects outside check-off, the 7 other `console.error` sites.

## Architecture / Approach

Pure libraries do the work (`redact`, `log`, `auth-state`, `http`) and stay free of `astro:*` imports so Vitest can load them; the middleware and routes stay thin. The helper is the single place that sees every error-level report, so Phase 3 adds Sentry there and runs the middleware body inside the SDK's request wrapper (Astro's entry point stays), because Astro catches exceptions itself and a wrapper around `fetch` would see none.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Helper and middleware | `redact`, `log`, `auth-state`; 503 contract; `auth.*` and `request.unhandled` events; tests; docs | Spurious 503s for ordinary visitors; mocking the virtual `astro:middleware` |
| 2. Routes and check-off | `reportMapped` in 13 routes, `signout`, catch blocks, check-off outcomes; tests; README Observability; lesson | Leaking key values or the invite code; touching about 16 files without changing responses |
| 3. Sentry | `@sentry/cloudflare`, request wrapper in the middleware, locked-down options, capture in `reportError`, release id and DSN secret, CPU gate | CPU on the Free plan; permissive SDK defaults |

**Prerequisites:** the local Supabase stack for `npm test` (one session at a time; the S-06 worktree is active); for Phase 3 your Sentry project and its DSN, set by you with `! npx wrangler secret put SENTRY_DSN`.
**Estimated effort:** about 3–4 sessions across 3 phases, each its own PR and release (no migrations); Phase 3 also needs account set-up and the CPU readings.

## Open Risks & Assumptions

- Workers Logs may flatten an object argument; Phase 2 checks it in production, with a one-line switch to a JSON string.
- Vitest may need an alias for `astro:middleware` even with a mock factory.
- The Workers plan tier is not recorded; the gate thresholds (Max under 10 ms, P95 within 2 ms) are proposals.
- The request-wrapper pattern was verified by reading the SDK source, not by running it against this adapter, so Phase 3 proves it with a forced event locally and in production. The free quota (about 5k errors a month) is second-hand, and Dedupe is off, so a burst counts every event until the key rate limit applies.
- When Auth is down and the token is expired, auth-js retries about 25 seconds before the 503 can be sent; unchanged here.

## Success Criteria (Summary)

- During an Auth outage a signed-in user gets a 503 and "Could not save", and one `auth.unavailable` line appears; a signed-out visitor still gets the quiet 302.
- Re-running the audit's probes shows a log line for the join RPC failures and for `42501`, stale events as info, and unchanged responses.
- A forced error reaches Sentry from production with release and environment set and no cookies, bodies, queries, e-mail, IP or invite code, and the CPU gate passes or Phase 3 is rolled back with Phases 1 and 2 in place.
