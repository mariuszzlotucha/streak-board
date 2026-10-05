<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Google login Implementation Plan

- **Plan**: `context/changes/google-login/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-05
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 3 observations
- **Verdict after triage**: SOUND (all six findings fixed in the plan)

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 17/17 paths ✓, symbols ✓, 10/12 line anchors ✓ (2 stale: README `:292`, `:327`), brief↔plan ✓.

Deep check (1 subagent), confirmed: `error_code=bad_oauth_state` reaches the server in the query string; `/` is server-rendered, so `Astro.redirect` works there; no test asserts the old message texts and no Playwright locator collides with "Continue with Google"; no route registry needs the two new routes; `$base` in `release` is the custom domain.

## Findings

### F1 — Provider-side failures are info-only; row 2.16 cannot see them

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 change 3 (return route); Progress 2.16
- **Detail**: A failed code exchange (wrong client secret, revoked client, `redirect_uri_mismatch` at exchange) comes back to `redirectTo` as `error=server_error&error_code=unexpected_failure` (auth `internal/api/external_oauth.go:121`, `external.go:839-860`). The plan maps it to `?error=unknown` and reports every parameter-driven outcome with `reportInfo`, which is `console.info` only: no Sentry (`src/lib/log.ts:97-101`, `src/lib/sentry-options.ts:35`, README:287) and no alert on Workers Logs. The likeliest real failure therefore shows the user "Something went wrong" and leaves no error line. Row 2.16 ("no error-level `auth.google.*` line, no new Sentry issue") passes vacuously for exactly that failure. Nothing automated catches it later: the release check never exchanges a code, and Google deletes inactive clients after 6 months (research).
- **Fix A ⭐ Recommended**: Keep info; make 2.16 search Workers Logs for the provider error
  - Strength: Keeps the plan's deliberate rule that a public GET cannot create Sentry events (`redact.ts` does not mask `code` or `state`; quota is about 5k a month).
  - Tradeoff: No push alert; a break after launch is found by a user or a log search.
  - Confidence: HIGH — follows `log.ts` as it is.
  - Blind spot: Whether the owner will actually read Workers Logs.
  - Edit: reword 2.16 to also search Workers Logs for `auth.google.callback.returned` lines with `providerError=server_error` after the production flows; note in the README "Production auth settings" that this is where a rotated or deleted client shows.
- **Fix B**: `reportError` for the exact pair `server_error` + `unexpected_failure`
  - Strength: A Sentry issue on misconfiguration; matches `lessons.md:133-138` (unexpected outcome is an error line).
  - Tradeoff: Anyone can forge the pair with a GET and spend the Sentry quota.
  - Confidence: MEDIUM — forgeability is real, abuse likelihood for a friends app is unknown.
  - Blind spot: Sentry spike protection and rate limits not checked.
- **Decision**: FIXED via Fix A

### F2 — `/` redirect covers one code; "consumed" attempts land on `/` with others

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 change 5; Desired End State, 2nd bullet
- **Detail**: The end state promises that "a stale or consumed attempt ends on `/auth/signin` with the failure message". GoTrue sends every state-loading failure to the Site URL root with the error in the query (`external_oauth.go:44-55`) and distinct codes: `bad_oauth_state` (`external.go:539,551,558`), `bad_oauth_callback` for a missing state (`:534`) and `flow_state_already_used` (`:563`, for example reopening Supabase's callback URL). The plan redirects only the first. The other two land on a landing page with no message (a signed-in user is bounced to `/dashboard` by the middleware, so it affects the signed-out case).
- **Fix**: Match an exact set of three fixed values in `src/pages/index.astro` (`bad_oauth_state`, `bad_oauth_callback`, `flow_state_already_used`) and add the two extra codes to the smoke `/` steps.
- **Decision**: FIXED via Fix in plan

### F3 — Hint assertions are vacuous; e-mail-taken lives in another map

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 changes 1, 7, 8
- **Detail**: (a) Smoke asserts that `/auth/signin?error=invalid_credentials` "includes Continue with Google". The always-rendered button contains that string, so the step passes without the hint (`lessons.md:26-31`). The existing "already exists" check on `email_taken` also passes with the old text. (b) `email_taken` is not in `SIGN_IN_ERROR_MESSAGES` but in `SIGN_UP_ERRORS` (`src/lib/auth-errors.ts:43`), rendered by `resolveSignUpError` as a field error under the e-mail input; the contract names it in the same sentence as the sign-in map. (c) `src/components/dev/SignInStates.tsx:138` hard-codes the old `invalid_credentials` text (dev-only, 404 in production; goes stale, nothing fails).
- **Fix**: Assert hint-only substrings: "If you signed up with Google" on `?error=invalid_credentials` and "if you signed up with it" on `/auth/signup?error=email_taken`; name `SIGN_UP_ERRORS` for the second message; update the kitchen-sink string.
- **Decision**: FIXED via Fix in plan

### F4 — Two manual rows have unmet preconditions

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress 1.8; 1.4; 2.12 and 2.13
- **Detail**: Row 1.8 ("Phase 12 section is merged to `master`") cannot be ticked by the PR that merges it, the same limit the plan applies to 2.10-2.18, and "Phase 2 is not merged before every Phase 1 row is ticked" then hinges on it. Rows 2.12-2.13 need a Google account with no StreakBoard account, but 1.4 lists only "owner and friends" as test users and the owner's own Gmail is the existing account (2.11). The plan also does not say what happens to the new production user afterwards.
- **Fix**: Reword 1.8 to "committed on the Phase 1 branch; merge verified when the Phase 2 branch is cut from `master`"; add to 1.4 that a second Google account for 2.12-2.13 is a test user; add one Phase 12 line on keeping or deleting that user.
- **Decision**: FIXED via Fix in plan

### F5 — Release check is single-shot against two moving parts

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 change 9
- **Detail**: The two new curls are the last step, after the deploy. Hop 1 hits a Worker deployed seconds earlier (the existing retry loop, `ci.yml:137-141`, only proves `/` answers 200, which the previous version also did); hop 2 depends on GoTrue's Google discovery. A transient failure leaves a red release with the code live and needs a re-run and a new approval. Existing curls have no `--max-time`, and `read -r < <(curl ...)` turns a failed fetch into code `000`.
- **Fix**: Wrap the two hops in the same 3-try, 3 s loop style; keep `--max-time 20`; print the last status and `Location` on failure.
- **Decision**: FIXED via Fix in plan

### F6 — Two stale README anchors

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 change 10
- **Detail**: The smoke paragraph is at `README.md:297` (plan: `:292`, now a Sentry bullet); the `release` bullet is at `:328` (plan: `:327`, the `integration` bullet).
- **Fix**: Refer to them by text ("## Smoke test" section, the "**release** —" bullet) instead of by line number.
- **Decision**: FIXED via Fix in plan
