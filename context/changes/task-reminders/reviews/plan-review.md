<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Task reminders (S-16)

- **Plan**: context/changes/task-reminders/plan.md
- **Mode**: Deep
- **Date**: 2026-10-17
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 5 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
7/8 paths found (`.dev.vars.example` is absent; the plan said "if present"), 3/3 symbols, brief↔plan ✓, Progress↔Phase 25/25 ✓

## Findings

### F1 — withSentry around fetch would initialise Sentry twice per request

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §1, Critical Implementation Details
- **Detail**: Middleware already wraps each request (`src/middleware.ts:75` → `runWithSentry`, `src/lib/sentry.ts:16-28`). Wrapping the whole exported handler would set up a second client per request.
- **Fix**: `fetch` stays the plain `handle`. Only `scheduled` is wrapped, by `runScheduledWithSentry` in `src/lib/sentry.ts`, reusing `sentryOptions(env)`.
- **Decision**: FIXED

### F2 — Secret-guarded RPC open to anon; secret strength and RLS pinning not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1–2
- **Detail**: This is the first anon-executable function, and the anon key is public. The plan did not set the secret's length or say which grants the RLS checks pin.
- **Fix**: A secret of at least 32 random bytes, with a length check. The digest is compared inside the function. `has_function_privilege` rows pin which role may execute which function. No grants on `reminder_secret`. `push_subscriptions` goes into the S-12 grants block.
- **Decision**: FIXED

### F3 — No cookieless Supabase client for the cron

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2
- **Detail**: `createClient(requestHeaders, cookies)` (`src/lib/supabase.ts:6`) needs a request.
- **Fix**: Add `createAnonClient(url, key)` with session persistence off.
- **Decision**: FIXED

### F4 — Secret-hash setup undefined for local, test and production

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2, Phase 3 §3
- **Detail**: There was no SQL for the owner and no test seeding, and `.dev.vars.example` does not exist.
- **Fix**: The exact SQL Editor upsert goes in the README. Tests seed through `adminClient()`. The `.dev.vars` lines go in the README.
- **Decision**: FIXED

### F5 — How the VAPID public key reaches the browser is ambiguous

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3, Phase 4 §2
- **Detail**: A Worker secret exists only at runtime, but a public client env value is inlined at build time, so the plan's "public env value" can't work as written.
- **Fix**: Keep it a server secret. `loadSettings` passes it to the card as a prop; a missing key renders `unsupported`.
- **Decision**: FIXED
