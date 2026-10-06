<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Google login

- **Plan**: context/changes/google-login/plan.md
- **Scope**: Full plan (Phase 1 of 2 and Phase 2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 8 observations

Reviewed on branch `s-07/google-login/archive`, cut from the fresh `master` (`62e010e`, PR #78 merged); the code equals `master`. The per-phase reports (`impl-review-phase-1.md`, `impl-review-phase-2.md`) were read first; their decided findings (F1-F10 of Phase 2) are not repeated, and every claimed fix was found in the current files.

## Success criteria (re-run on 2026-10-06)

| Check                                                                                          | Result                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 `curl` of the hosted `/authorize` URL                                                      | `302` to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id=` and `redirect_uri` equal to the Supabase callback                                            |
| 1.2 `npx prettier --check context/changes/deployment/deployment-plan.md`                       | pass                                                                                                                                                                   |
| 2.1 `npm run lint`                                                                             | pass                                                                                                                                                                   |
| 2.2 `npx astro check`                                                                          | 0 errors, 0 warnings, 4 hints                                                                                                                                          |
| 2.3 `npm run build`                                                                            | pass                                                                                                                                                                   |
| 2.4 `npm test` (local stack)                                                                   | 26 files, 382 tests pass                                                                                                                                               |
| 2.5 `BASE_URL=http://localhost:4321 npm run smoke` against the production preview              | all steps passed                                                                                                                                                       |
| 2.6 narrowed Stryker run on `src/lib/auth-errors.ts:45-69` (command runner, scratchpad config) | 97.67% (42 killed, 1 survived); the survivor is `error.code !== undefined &&` in `isStaleExchangeError`, an equivalent mutant (`includes(undefined)` is already false) |
| Manual rows 1.3-1.8 and 2.7-2.18                                                               | all `[x]` with a SHA; the evidence is in `deployment-plan.md` Phase 12 (run `37389961933`, active version `8649f530`, owner-reported flows tagged)                     |

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Nothing automated proves the return route finds the verifier the start route wrote

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:418-430, src/pages/auth/google/callback.ts:40
- **Detail**: The smoke step "google return with the verifier cookie and an unknown code" cannot tell "verifier found, GoTrue answers `flow_state_not_found`" from "verifier not found, the SDK answers `pkce_code_verifier_not_found`". Both are in the stale list and both end on exactly `/auth/signin?error=oauth_failed`; its guard `cookie.includes("-code-verifier=")` is also satisfied by a per-flow slot cookie. The route works today only because auth-js 2.116.0 still writes a fixed `-code-verifier` key (`node_modules/@supabase/auth-js/dist/main/lib/helpers.js:338`, commented "Deprecation-window dual write"). The SDK's own mechanism (`experimental.appendPkceFlowIdToRedirects`, `exchangeCodeForSession(code, { flowId })`) is opt-in and not used. A dependency bump that drops the legacy key would leave the unit tests (stubbed client), the smoke step and the release check (no exchange) green, while every real Google return ends on "could not be completed" with an info line only. The production rows 2.11-2.13 prove it works with the lockfile versions today; `npm ci` pins them, but `package.json` uses `^` ranges.
- **Fix A ⭐ Recommended**: Add one Vitest integration test against the local stack with the real `createServerClient` and the `src/lib/supabase.ts` cookie adapter: call `signInWithOAuth`, replay the `Set-Cookie` values into a second client, exchange `UNKNOWN_FLOW_CODE`, assert `error.code === "flow_state_not_found"` and not `pkce_code_verifier_not_found`.
  - Strength: Pins by machine the one fact that production proved only by hand, and fails on the dependency bump that would break it.
  - Tradeoff: About 40 lines and a dependency on the local GoTrue answering a well-formed unknown code, which the smoke step already relies on.
  - Confidence: MED — not yet run: whether the local GoTrue answers `flow_state_not_found` for this code, and how the second client reads the replayed cookies in the Vitest environment.
  - Blind spot: A bump that changes the cookie names but keeps the fixed key would still be caught only by the production rows.
- **Fix B**: Accept the gap and rely on the lockfile and the manual production rows.
  - Strength: No code, no new test to maintain.
  - Tradeoff: A bump that breaks the lookup stays silent until a user complains.
  - Confidence: MED — depends on how often dependencies are bumped here.
  - Blind spot: Whether the next `@supabase/ssr` release turns the flow id on by default.
- **Decision**: FIXED via Fix A — `tests/integration/auth-google-roundtrip.test.ts` runs the real start and return routes with the real SDK and cookie adapter against the local stack and asserts the logged code `flow_state_not_found`; a control test asserts `pkce_code_verifier_not_found` without the cookies

### F2 — Row 1.4 is ticked against text that the record contradicts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/google-login/plan.md:294 (and :114), context/changes/deployment/deployment-plan.md (Phase 12, test-users row)
- **Detail**: Row 1.4 says "owner, friends and one extra account ... listed as test users" and is ticked. The owner-reported record says 2 test users (the owner and one extra account) and "Friends are not listed yet". The Phase 1 review did not flag it. In Testing only listed addresses can sign in, so friends cannot use Google login until the owner adds them (README documents the limit).
- **Fix**: Accept as is (the record is honest and dated); the owner adds each friend in the Google Cloud Console before they try. Nothing to change in the repository.
- **Decision**: ACCEPTED — the Phase 12 record is honest and dated; the owner adds each friend as a test user in the Google Cloud Console before they try; no repository change

### F3 — Two documents lag behind the final state

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:302, context/foundation/roadmap.md:73-75
- **Detail**: The README smoke paragraph lists "the three outcomes of the return route that need no exchange" and omits the two steps that reach the real exchange (smoke.mjs:414 and :422, added by the Phase 2 review). The roadmap's "Auth" line still says "żaden dostawca OAuth nie jest włączony" and names only `/auth/callback` as a return route, which is no longer true on production.
- **Fix**: One sentence in each: the README names the two exchange steps (code without a verifier cookie, and a real verifier with an unknown code); the roadmap line says Google is enabled in Supabase (status Testing) and names both return routes.
- **Decision**: FIXED — README smoke sentence names the five return-route outcomes; roadmap Foundations lines (API routes and Auth) describe the state after S-07

### F4 — The S-09 constraint lives only in the plan and a code comment

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/google-login/plan.md:41, context/foundation/roadmap.md (S-09 block), src/pages/index.astro:5-7
- **Detail**: The plan says S-09 must keep the `/` redirect for `bad_oauth_state`, `bad_oauth_callback` and `flow_state_already_used`. The S-09 section of the roadmap does not say so, and S-09 is already being planned on `s-09/landing-page/plan` in another worktree. The smoke steps for `/?error_code=…` do pin it (CI fails the S-09 PR if the redirect is lost), so the risk is a late failure, not a silent one.
- **Fix**: Add one sentence to the S-09 `Risk` line in `roadmap.md` (the S-09 session may edit the same block; the PR that merges second resolves it).
- **Decision**: FIXED — one sentence added to the S-09 Risk line of `roadmap.md`

### F5 — The e-mail callback reports a 429 as an error-level event

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/callback.ts:27-33
- **Detail**: Only the four stale codes are an info line; everything else, including `over_request_rate_limit`, goes to `reportError` and so to Sentry. `/auth/callback` is a public GET, so a flood of requests with a self-set verifier cookie costs one GoTrue call each and, under rate limiting, one Sentry event each. The Google callback treats the rate limit as an info line (`reportMapped`, `lessons.md` rule on returned errors). The e-mail callback follows the plan (item 4) and before this change logged everything with `console.error`, so it is not a regression.
- **Fix**: Treat `over_request_rate_limit` as an info line in the e-mail callback too (a third branch, event `auth.callback.rate_limited`), with a test next to the stale one.
- **Decision**: FIXED — `auth.callback.rate_limited` info branch for `over_request_rate_limit` in `src/pages/auth/callback.ts`, with a test

### F6 — The duplicate-e-mail Google hint is probably unreachable on production

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth-errors.ts:80-84, scripts/smoke.mjs:476-480, context/changes/google-login/research.md:148
- **Detail**: GoTrue returns `user_already_exists` for a sign-up with a taken e-mail only when autoconfirm is on (the local stack). With the hosted "Confirm email" on (recorded in Phase 12), the answer is an obfuscated HTTP 200 with no identities and no e-mail, and `signup.ts` sends it to `/auth/confirm-email`. A Google-only user who signs up with a password on production therefore waits for a mail that never comes and never sees the hint. The sign-in hint (`invalid_credentials`) does work. The plan excludes this path (`plan.md:45`, audit B4), but the new `email_taken` copy suggests it is handled. Not tested live.
- **Fix A ⭐ Recommended**: Write the limit down (README "Production auth settings": the sign-up hint shows only when GoTrue returns `user_already_exists`, which the hosted project does not) and leave B4 to a later slice.
  - Strength: Keeps S-07's scope as planned and stops the copy from over-promising.
  - Tradeoff: The Google-only user still gets no guidance on sign-up.
  - Confidence: MED — based on the GoTrue source reading in the research, not a live test.
  - Blind spot: The hosted "Confirm phone" value is unknown.
- **Fix B**: Handle the obfuscated answer (empty `identities`) in `signup.ts` with a neutral message that mentions Google.
  - Strength: Closes the gap for the user it affects.
  - Tradeoff: Reopens the excluded e-mail-path gaps (B4); a message that hints at existing accounts weakens the enumeration protection the obfuscation exists for.
  - Confidence: LOW — the design is not settled.
  - Blind spot: Whether a neutral message can avoid revealing that the address is registered.
- **Decision**: FIXED via Fix A — README (Production auth settings, Google provider bullet) states that the sign-up hint shows only when GoTrue answers `user_already_exists`; B4 stays a known gap

### F7 — Two smoke hint steps still pass on the island props alone

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:471-479
- **Detail**: Both hint steps use `bodyIncludes`. The text also sits in the serialized props of the `client:load` island, the weakness that Phase 2 review F5 fixed for the two message steps with `alertMessage`. The note that the hint steps are fine holds only for the button text.
- **Fix**: Use `alertMessage("Invalid email or password. If you signed up with Google")` for the sign-in step, and a regex on the rendered field-error element for the sign-up step.
- **Decision**: FIXED — both hint steps now match the rendered alert and the rendered field error (`fieldError` helper); smoke 209 of 209

### F8 — A broken Google sign-in raises no alert

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/google/callback.ts:29-35, README.md:263
- **Detail**: Every provider-driven outcome is an info line by design. If the Google client secret is rotated or revoked, every return carries `error=server_error`, users see "Something went wrong", Sentry stays empty, and the release check cannot catch it (hop 2 only proves that Supabase redirects to Google). It surfaces when a user complains. The README already documents where it shows.
- **Fix**: Owner action outside the repository: save a Workers Logs query for `auth.google.callback.returned` with `providerError=server_error` and open it after any change to the Google client or the Supabase provider.
- **Decision**: ACCEPTED as an owner action — save a Workers Logs query for `auth.google.callback.returned` with `providerError=server_error` and open it after any change to the Google client or the Supabase provider; no repository change

### F9 — Cloudflare's own invocation log may keep the OAuth `code`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: wrangler.jsonc:12-14
- **Detail**: Unverified. `observability.enabled` keeps the platform's invocation log, which probably records the request URL, so `?code=…` (and `/join/<code>` invite codes) could sit in Workers Logs even though the app's own reports and Sentry never carry them. The OAuth code is single-use, lives about five minutes and is bound to the verifier; the e-mail callback has the same property. The README line "Never logged: … the invite code" covers the app's reports only.
- **Fix**: The owner opens one invocation record in Workers Logs; if the URL with its query is visible, either accept it and say so in the README, or set `observability.logs.invocation_logs: false` (check the key against the Wrangler docs first).
- **Decision**: ACCEPTED as an owner check — the owner opens one invocation record in Workers Logs and reports whether the URL with its query is visible; if it is, the README line or `observability.logs.invocation_logs` is changed in a follow-up

### F10 — No account chooser on a shared device

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/google.ts:18
- **Detail**: App sign-out does not end the Google session. On a shared browser with one Google account and earlier consent, "Continue with Google" signs the next person in as the previous one without a prompt. `prompt=select_account` is excluded by `plan.md:46`, but the consequence is not written down anywhere.
- **Fix**: One sentence in the README (Auth routes): signing out of StreakBoard does not sign out of Google, so a shared device needs a Google sign-out too.
- **Decision**: FIXED — README sentence under Auth routes about signing out of Google on a shared device

## Not raised as findings

- `src/lib/supabase.ts:15-19` ignores the cache headers that `@supabase/ssr` hands to `setAll` and forces no cookie flags: pre-existing and excluded by `plan.md:48` (`setAll` cache headers).
- `src/components/dev/SignInStates.tsx:138` repeats the `invalid_credentials` text by hand: the plan prescribes exactly that edit, and the file is dev-only.
- Checked and clean: open redirects and reflected text, CSRF on the start route (Astro `checkOrigin`, POST only), login CSRF on the GET return route (PKCE), what reaches logs and Sentry, the middleware interplay (`join_code` survives the round trip), the ESLint override, and the shell logic of the release check under `bash -e`.

## Triage summary

- Fixed: F1 (Fix A), F3, F4, F5, F6 (Fix A), F7, F10
- Accepted: F2, F8 (owner action), F9 (owner check)
- Skipped / dismissed: none

Gates re-run after the fixes on 2026-10-06: `npm run lint`, `npx astro check` (0 errors), `npm run build`, `npm test` (27 files, 385 tests; the first run had one failure in the untouched `tests/integration/group-isolation.test.ts`, which passed on three reruns), and `npm run smoke` against the production preview (209 of 209).
