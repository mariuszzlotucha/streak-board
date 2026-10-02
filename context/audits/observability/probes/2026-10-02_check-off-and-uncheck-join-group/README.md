# Runtime-probe harness (S-08 audit, 2026-10-02)

Zero-dependency harness behind `context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md`. Copied here from an untracked agent worktree so the before/after proof survives cleanup.

- `suite.mjs`, `fixtures.mjs`, `fake-supabase.mjs`, `compare.mjs`, `summarize.mjs`: the harness (originally in `probe/`).
- `full2/`: the baseline results of the audit run (`results.json`, `results.md`, logs, stub requests). Compare a new run against it.
- `patch/`: probe-only code the suite needs in the app tree: `probe.ts` -> `src/pages/api/probe.ts`, `probe-stream.astro` -> `src/pages/probe-stream.astro`, and `middleware-x-probe.diff`, a header-gated throw (`x-probe: throw-mw`) at the top of `src/middleware.ts`.

## Apply to a phase worktree (never commit the result)

1. Copy the five `.mjs` files to `probe/` and `full2/` to `probe/out/full2/` in the phase worktree.
2. Copy the two `patch/` app files to the paths above.
3. The Phase 1 middleware is rewritten, so `git apply` will not match: re-add the three-line gate by hand at the top of the (wrapped) `onRequest` body; it must run before `getUser()`.
4. `node probe/suite.mjs --run verify`, then `node probe/compare.mjs` against `full2`.
5. Remove the probe files and the gate before committing.

Expected after Phases 1 and 2: C1a-C1e, C2a, C2c, C2d, C2e, J8a and J8b answer 503 with an `auth.unavailable` line; control C1f (401 `bad_jwt`) stays a silent 302; C2b and C2h are unchanged; J1, J2, J5 log `groups.join.failed`; C6 logs `checkoff.forbidden`; C7-C9 log info events.
