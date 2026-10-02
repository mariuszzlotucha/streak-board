---
type: observability-audit
date: 2026-10-02 22:10
mode: verify
commit: 328ca00
branch: s-08/observability-swallowed-errors/close-out
dirty_tree: false
areas: [check-off-and-uncheck, join-group]
area_source: arguments
runtime_proof: partial # server-side probes on local workerd + stub Supabase; nothing sent to a real Sentry; client-side probe P11 not run
error_tracker: "@sentry/cloudflare via the middleware request wrapper (capture of error-level reports); Workers Logs"
previous_report: 2026-10-02_check-off-and-uncheck-join-group.md
---

# Observability audit, verify run (S-08 phases 1-3) — check-off and uncheck, join group

Re-ran the same probe suite (`probes/2026-10-02_check-off-and-uncheck-join-group/`, baseline `full2/`) against the merged S-08 code (`328ca00`: PR #67) in an isolated worktree. Production build previewed in workerd, stub Supabase, no real telemetry. Results: `probes/.../verify/results.md`, `results.json`, `before-after-table.txt`.

## Changes since the last audit

| Finding / probe                                                              | Before                             | After                                                                                              |
| ---------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| G1 Auth failure read as "signed out" (C1a-C1e, C2a, C2c, C2d, C2e, J8a, J8b) | 302 `/auth/signin`, zero log lines | 503, one `auth.unavailable` error line each — **fixed**                                            |
| Control C1f (401 `bad_jwt`)                                                  | silent 302                         | silent 302, no event — unchanged by design                                                         |
| C2b, C2h                                                                     | 200 / client timeout               | unchanged; C2h now logs `auth.unavailable` and a 503 once the hang is released                     |
| G2 returned Supabase errors dropped (J1, J2, J5)                             | 302 `?error=unknown                | forbidden`, no log                                                                                 | same redirects, `groups.join.failed` error line — **fixed** |
| A1 `forbidden` outcome silent (C6, C12c)                                     | 403, no log                        | 403 unchanged, `checkoff.forbidden` error line — **fixed**                                         |
| Stale outcomes (C7, C8, C8b, C9, C12d)                                       | no log                             | statuses unchanged, info events `not_enrolled`, `task_gone`, `nothing_removed` — **fixed**         |
| Unknown outcomes and exceptions (C3-C5, C10, C11, C12b/e, J9)                | partly logged as raw values        | structured `*.failed` / `*.exception` lines                                                        |
| Middleware/handler throws (P1, P1b, P1c)                                     | 500, Astro stack only              | 500, plus `request.unhandled` — **fixed**                                                          |
| P5a/P5b (throw in middleware gate)                                           | 500                                | 500, no `request.unhandled` (probe gate sits before the `try`; probe placement, not a product gap) |
| Dashboard read failures (C13a-f, J7a/b), P4, P7, P8, P10, P13d/f             | 200, silent                        | unchanged, still silent — **still open, out of S-08 scope** (G5, G6, G7, G14)                      |

Every HTTP result is identical to the baseline except the planned 503 changes. All README expectations (503 + `auth.unavailable` rows, silent control C1f, `groups.join.failed`, `checkoff.forbidden`, info events, unchanged responses) were MET. The only harness adaptation: the probe gate sits at the top of `handle` in `src/middleware.ts` (before `getUser()`); `compare.mjs` takes two file arguments.

Not observed: events at a real Sentry (verified separately by the forced production event recorded in `context/changes/deployment/deployment-plan.md`, Phase 11), client-side capture, production Workers Logs storage of object lines.
