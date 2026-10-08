<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Landing page Implementation Plan

- **Plan**: `context/changes/landing-page/plan.md`
- **Mode**: Deep (the codebase checks were run directly; the verification agent stopped on a session limit)
- **Date**: 2026-10-08
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

28/28 paths ✓ (the 5 new files do not exist yet, as planned), 14/14 symbols ✓, brief↔plan ✓.

Verified against the code and confirmed: the landing copy matches the rules (a miss halves the streak, `src/lib/streak-rules.ts:69-74`; a member's total is the sum of their streaks, `src/lib/leaderboard-rules.ts:102-138`; recurrences `once`, `daily`, `weekly`; any member creates tasks; one group per user); the deletion statements match the foreign keys, and no trigger blocks deleting a group; the `postgres` role (not a superuser on the local stack) has DELETE on `auth.audit_log_entries`, whose `payload` is `json`; `cookieOptions` is spread over the library defaults (`node_modules/@supabase/ssr/dist/main/cookies.js:223-230,463-470`) and sign-out goes through `signOut()`; the CI `smoke` job runs against a production preview (`.github/workflows/ci.yml:80-85`), so the `Secure` check runs in CI too; the smoke jar ignores `Secure`; no e2e locator conflicts with the new header and footer; no Vitest test pins cookie options; `master` holds no code change since the last release (`bdab931`).

## Findings

### F1 — Three privacy statements are not true as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 — §4 Privacy policy (sections 2 and 6), §6 sign-up notice
- **Detail**: The end state promises a policy that is true for the current code. (1) "e-mail addresses and invite codes are masked in logs" and "request logs (route, user id, request id, time)": `wrangler.jsonc:12-14` enables observability without `invocation_logs: false`, so Cloudflare writes one invocation log per request with the method and URL (developers.cloudflare.com/workers/observability/logs/workers-logs/); `/join/<code>` reaches those logs unmasked, while `src/lib/redact.ts` covers only the app's own lines (`src/lib/log.ts`) and Sentry events (`src/lib/sentry-options.ts:16-26`). (2) "error reports: 30 days": `research.md:180` gives 90 days while a Sentry organization trial runs, not checked; Sentry was set up on 2026-10-02 (`deployment-plan.md:206`). (3) "Members of the group you join will see your e-mail address": a group's creator is shown to everyone who joins it as well (`list_group_members`, `supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:10-28`; one group per user).
- **Fix**: (1) "Our own log entries and error reports mask e-mail addresses and invite codes; Cloudflare's request logs record each requested address (an invite link contains its code) and request details such as the IP address, for up to 7 days"; (2) "error reports: up to 90 days"; (3) "Members of your group will see your e-mail address." The smoke check "will see your e-mail address" still matches.
- **Decision**: FIXED (Fix in plan: §4 sections 2 and 6 reworded, Current State Analysis records the invocation logs and the Sentry trial retention, §6 sign-up notice now says "Members of your group")

### F2 — Phase 2 mixes same-day steps with rows that wait for Google

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — §6 Records and review outcome, §7 Archive gate, Success Criteria 2.4, 2.8, 2.9
- **Detail**: Rows 2.1–2.3 and 2.5–2.7 finish in one session; 2.4 (Transparency Report status 1), 2.8 and 2.9 can pass only after Google's review, which takes "a few days to a few weeks" (`research.md:95`). §6 says the records "go in a small closing docs PR" without saying whether that PR waits for the verdict, so `/10x-implement landing-page phase 2` cannot finish, the release and submission records may sit unmerged for weeks, and neither the phase review nor the full-plan `/10x-impl-review` has a defined moment.
- **Fix A ⭐ Recommended**: Move 2.4, 2.8 and 2.9 (with the "later" part of §6 and §7) into "Phase 3: Google review outcome"
  - Strength: Phase 2 finishes in one sitting with its own docs PR; after the verdict a named command (`/10x-implement landing-page phase 3`) leads to the full-plan review and the archive.
  - Tradeoff: A third, records-only phase, though the owner asked for fewer phases; Progress rows renumber (2.4→3.1, 2.8→3.2, 2.9→3.3).
  - Confidence: HIGH — `/10x-implement` works one phase at a time and resumes from the first unchecked row.
  - Blind spot: None significant.
- **Fix B**: Keep two phases and split §6 into two docs PRs
  - Strength: Keeps the two-phase structure the owner chose.
  - Tradeoff: Phase 2 stays open for weeks; `/10x-implement landing-page phase 2` runs twice and its phase review sees a half-done phase.
  - Confidence: MEDIUM — workable, but the tools assume a phase ends in one run.
  - Blind spot: How `/10x-impl-review` treats a phase with open rows is not checked.
- **Decision**: FIXED (Fix A: a records-only Phase 3, "Google review outcome", holds the Transparency Report check, the review result and the archive gate; Progress 2.4, 2.8, 2.9 became 3.1, 3.2, 3.3 and the remaining Phase 2 rows were renumbered 2.4–2.6)

### F3 — New live checks run once, possibly before the new Worker serves

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — §10 Release check
- **Detail**: The `/` loop (`.github/workflows/ci.yml:163-169`) stops at the first 200, which the previous Worker version also returns, so it does not wait for the deploy to propagate. `/privacy` 200 and `href="/privacy"` on `/` are the first live checks that only the new version passes; run once, they can fail a good release, the very release Phase 2 depends on. The Google hops already retry 3 × 3 s (`.github/workflows/ci.yml:182-185`).
- **Fix**: Retry both new checks together, up to 10 times 3 s apart like the `/` loop, and print the last status or the missing link after the final try.
- **Decision**: FIXED (Fix in plan: §10 retries both new checks together, up to 10 tries 3 s apart)

### F4 — The session cookie's grey zone from research is not in the plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing (cookie banner line); `plan-brief.md` Open Risks
- **Detail**: `research.md:89` rates `join_code`, `auth_email` and the PKCE verifier as exempt but the 400-day `sb-*` session cookie as a grey zone (WP29 opinion WP194: persistent login cookies are not exempt). The plan says "Every cookie is strictly necessary" and the brief's Open Risks does not mention it, so the owner's confirmation of the policy (1.9) would not cover it knowingly.
- **Fix**: State it in the NOT-doing line and in the brief's Open Risks as an interpretation the owner accepts; no code or policy text change.
- **Decision**: FIXED (Fix in plan: the grey zone is stated in What We're NOT Doing and in the brief's Open Risks and Key Decisions as an interpretation the owner accepts)

## Triage

- **Date**: 2026-10-08
- **Fixed**: F1, F2 (Fix A), F3, F4 (4)
- **Skipped / Accepted / Dismissed**: none
- **Verdict after fixes**: REVISE → SOUND
