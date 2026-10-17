<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Task reminders (S-16)

- **Plan**: context/changes/task-reminders/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-17
- **Verdict**: NEEDS ATTENTION → APPROVED after triage
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated checks re-run: migration guard (1 change, 0 violations), types:check, test:rls, lint, token contrast, npm test 57 files / 1050 tests: all pass. Manual rows 1.4, 2.5, 3.5, 4.5, 4.6, 5.2–5.5 are pending, and none is falsely ticked.

## Findings

### F1 — Redirected 200 counts as a saved subscription

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pwa/push.ts:71
- **Detail**: For /api/reminders/*, the middleware sends a user who is signed out or has no nickname a 302. fetch follows it to a 200 HTML page, so enable() reports "on" although nothing was stored.
- **Fix**: Treat `!response.ok || response.redirected` as a failure (the push_save_failed path), with a unit case.
- **Decision**: FIXED — push.ts treats a redirected response as a failed save; unit case added

### F2 — Notification text has no length cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/reminders/run.ts:52-58
- **Detail**: All due titles (up to 80 chars each) go into one record, and push services cap payloads at about 4 KB. Many or long non-ASCII titles get a 413 every night, counted only as failed.
- **Fix**: List at most 5 titles plus "and K more", with a boundary unit test.
- **Decision**: FIXED — at most 5 titles plus "and K more"; boundary and size tests

### F3 — Worker CPU per send is unmeasured

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/reminders/web-push.ts:121-170, src/lib/reminders/run.ts:150-155
- **Detail**: An estimated 1–2 ms of CPU per push (ECDH, HKDF/HMAC, AES-GCM) against the Free plan's 10 ms limit, so roughly 5–10 subscriptions could get a run killed mid-send. The concurrency bound limits network calls, not CPU.
- **Fix**: Measure one triggered run with `wrangler tail` before release; record the per-push CPU and the resulting ceiling in the README; plan batching or the paid plan if the ceiling is under ~20.
  - Strength: Turns an estimate into a number before real users depend on it.
  - Tradeoff: One owner step with a real device subscription.
  - Confidence: MED — the cost is an estimate.
  - Blind spot: Free-plan CPU accounting for crons not verified.
- **Decision**: FIXED — measurement step added (plan manual row 5.6, README "CPU ceiling" note)

### F4 — Re-subscribe moves an endpoint to the caller

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261017090000_add_push_subscriptions.sql:76-82
- **Detail**: Chosen by the plan for shared devices; a user who knew another user's endpoint URL could take the row. The URL is never shown, so the risk is low, but the trade-off is not written down.
- **Fix**: Add one comment line to the migration's header recording the accepted trade-off.
- **Decision**: FIXED — trade-off recorded in the migration header

### F5 — Failed reminder count turns Settings into a 503

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/settings-data.ts
- **Detail**: Consistent with the all-or-nothing loadSettings pattern, but one more read can take down Settings for a non-essential card.
- **Fix**: Keep it; revisit only if Settings 503s show up in the logs.
- **Decision**: ACCEPTED — consistent with loadSettings; revisit on Settings 503s

### F6 — `week as unknown as string` cast

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/reminders/run.ts:132
- **Detail**: The generated type marks p_week as never null; the cast is commented.
- **Fix**: Leave it; `default null` would need a new migration to replace the function.
- **Decision**: ACCEPTED — cast kept
