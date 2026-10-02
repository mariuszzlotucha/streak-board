<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Observability: failures reach the response and monitoring

- **Plan**: context/changes/observability-swallowed-errors/plan.md
- **Mode**: Deep
- **Date**: 2026-10-02
- **Verdict**: REVISE → SOUND after triage (all 6 findings fixed in the plan)
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

35/35 paths ✓, 9/9 symbols ✓, brief↔plan ✓, Progress↔Phase 35/35 rows 1:1 ✓; `docs/reference/contract-surfaces.md` absent (check skipped). Verified by a read-only agent against Astro 7.3.2, auth-js/postgrest-js 2.116.0 and `@astrojs/cloudflare` 14.3.1: `await next()` rejects with the original error, `context.routePattern` exists, a 503 maps to `failed` in the island, smoke and e2e are unaffected, no client module imports `checkoffs`, `supabase` or the future `log.ts`, and `formData()` is inside the `try` in `checkoff.ts`.

## Findings

### F1 — `cloudflare:workers` has no types, so Phase 3 `astro check` fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3 (`src/lib/sentry.ts`), criterion 3.2
- **Detail**: Neither `@cloudflare/workers-types` nor `worker-configuration.d.ts` exists and `src/env.d.ts` declares only `App.Locals.user`. A scratch tsc run with the project's Astro types on a file importing `cloudflare:workers` gives TS2307. CI runs `astro check` (`ci.yml:24`), so the PR would be blocked.
- **Fix A ⭐ Recommended**: ambient `declare module "cloudflare:workers" { export const env: SentryEnv }` in `src/env.d.ts`
  - Strength: no dependency, types exactly what the code reads.
  - Tradeoff: hand-maintained; remove it if workers-types is added later.
  - Confidence: HIGH — the error was reproduced.
  - Blind spot: the `cfContext` cast to the SDK's `ExecutionContext` is unverified.
- **Fix B**: `npx wrangler types`, commit `worker-configuration.d.ts`
  - Strength: official, includes the bindings from `wrangler.jsonc`.
  - Tradeoff: large generated file; Workers `Request` types can clash with DOM types.
  - Confidence: MED — not tried.
  - Blind spot: effect on existing React and Astro typings.
- **Decision**: FIXED (Fix A)

### F2 — Phase 2 proof relies on an untracked harness and lists the wrong probes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2, criterion 2.8; References
- **Detail**: The probe suite (`probe/*.mjs`, about 72 KB, plus the `probe/out/full2` baseline) exists only in an untracked 1.1 GB agent worktree under `/home/mariusz/code/streak-board/.claude/worktrees/agent-aa29ab60279009f81`. It patches `src/middleware.ts` (the `x-probe` gate), which Phase 1 rewrites, so it cannot just be rerun on the phase branch. Criterion 2.8 says "C1a–C2e answer 503", but that range includes the control C1f (401 `bad_jwt`, must stay a silent 302), C2b (slow Auth, 200) and C2h (hang). The rows that should flip are C1a–C1e, C2a, C2c, C2d, C2e, J8a and J8b.
- **Fix A ⭐ Recommended**: commit the harness sources and the `full2` results under `context/audits/observability/probes/2026-10-02_check-off-and-uncheck-join-group/` with a short "apply to a phase worktree" note, and correct the 2.8 probe list.
  - Strength: the before/after proof survives worktree cleanup.
  - Tradeoff: about 350 KB of audit artifacts in the repo.
  - Confidence: HIGH — the files are small.
  - Blind spot: how to re-apply the middleware gate on the new middleware.
- **Fix B**: only correct the list and record the path as fragile.
  - Strength: no repo change.
  - Tradeoff: the proof is lost if the worktree is removed.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F3 — Helper contract: no "never throws", no size or e-mail bounds

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1–2 (`redact.ts`, `log.ts`)
- **Detail**: `reportError` runs inside `if (error)` branches and `catch` blocks; if it throws (PostgREST `details: null` is common) a handled redirect becomes a 500. Only `stack` is capped: postgrest-js puts a whole HTML gateway body into `message` (`index.cjs:526`) and network failures put a stack into `details` (`index.cjs:420-450`). `scrubSecrets` has no e-mail rule, and `email_address_not_authorized` is unmapped in `toSignUpErrorCode` (`auth-errors.ts:51-68`), so it reaches `unknown`. Whether GoTrue echoes the address is not verified; the Resend SMTP makes it unlikely.
- **Fix**: contract lines plus tests: the helper never throws (try/catch with a bare last-resort log); only non-empty strings are included; `message` and `details` are capped (about 500 characters); `scrubSecrets` also masks e-mail-like tokens.
- **Decision**: FIXED

### F4 — Local forced Sentry event merges with the production one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §4, criteria 3.10 and 3.11
- **Detail**: `vars.SENTRY_ENVIRONMENT = "production"` also applies to the local preview and the fingerprint `[event, code]` is identical, so the 3.10 local event and the 3.11 production event form one issue. A "new issue" alert then cannot fire at 3.11.
- **Fix**: 3.10 sets `SENTRY_ENVIRONMENT=local` in `.dev.vars` (dev vars override config vars) and forces `checkoff.exception`; 3.11 forces a different event (`/api/tasks/uncheck`, `uncheck.exception`); the alert rule is filtered to `environment:production`.
- **Decision**: FIXED

### F5 — The roadmap contradicts the widened scope

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: `context/foundation/roadmap.md:200` and the S-08 item
- **Detail**: The roadmap says structured logging is "not the goal" of S-08 and scopes part A to one finding; the plan, by the planning-interview decision, delivers a reporting helper across 16 files. A later impl-review would read that as scope creep.
- **Fix**: one line in the roadmap (unparked note and S-08 Unknowns) stating that the helper and all returned-error branches were included by decision.
- **Decision**: FIXED

### F6 — Phase 3 pulls the real SDK into the unmocked suites

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §5; Phase 1 §2
- **Detail**: `task-checkoff-flow.test.ts` → `checkoffs.ts` → `log.ts` would load the real `@sentry/cloudflare` under Node. The SDK's `cloudflare:workers` imports are type-only, so it should load, but this is unverified. `no-console` is "warn" for both methods, so `log.ts` needs disables for `console.error` and `console.info`.
- **Fix**: add to §5 "check first that the unmocked suites load the SDK, otherwise inject the capture function from `sentry.ts`", and to Phase 1 §2 "disables for both methods".
- **Decision**: FIXED
