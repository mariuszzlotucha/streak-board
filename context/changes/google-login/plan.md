# Google login Implementation Plan

## Overview

S-07 (roadmap MS-06, FR-001 OAuth part): a user can register and sign in with a Google account, without setting a password, next to the existing e-mail+password login. The work has three sides, in this order: the owner sets up Google (Cloud project, consent screen in status Testing, Web client) and enables the Google provider in the Supabase Dashboard; the app gets a "Continue with Google" button, a start route and its own return route with an error contract that tells cancellation, expiry and failure apart; the release gate and the smoke script prove what can be proven without a Google account, and the owner proves the rest on `https://streakboard.app`.

The problem statement is the one confirmed in `frame.md`: Google is the right answer to the sign-up friction, but the slice is not "button + route". It is a shared callback whose error contract misleads for Google, configuration on three sides, and a production-only proof. Decisions settled in this planning session (owner answers): the Google app stays in status **Testing**, and the privacy policy and home-page link are not part of S-07 (they are the gate for publishing and go to S-09); the e-mail forms get a **static Google hint** in two messages.

## Current State Analysis

- The app has e-mail+password only: `signInWithPassword` at `src/pages/api/auth/signin.ts:18`, `signUp` at `src/pages/api/auth/signup.ts:19-20`; `signInWithOAuth` appears nowhere (ast-grep and rg, research section 6). `supabase/config.toml` has no `[auth.external.google]`; its only provider block is a disabled `apple` template (`:305-318`).
- The e-mail confirmation callback `src/pages/auth/callback.ts:9-35` sends every failure to `/auth/signin?error=link_expired` (`:18,26,31`), reads no `error_description`, and logs with raw `console.error` (`:25,30`), against `context/foundation/lessons.md:133-138`. Three places pin the no-code request to exactly `/auth/signin?error=link_expired`: `tests/integration/auth-callback.test.ts:45-48`, `scripts/smoke.mjs:346-351` and `.github/workflows/ci.yml:149-153` (the `release` live check).
- `@supabase/ssr` 0.12.7 and `auth-js` 2.116.0 (`package-lock.json`): `createServerClient` forces PKCE; a server-side `signInWithOAuth` returns `{ data: { url } }` without redirecting (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:4845,4849`) and writes the verifier through the client's `setAll` before it resolves (`node_modules/@supabase/ssr/src/cookies.ts:485-500`). `src/lib/supabase.ts:15-19` forwards `setAll` to Astro cookies; Astro attaches cookies set before `context.redirect(...)` to the returned response (`astro/dist/core/middleware/astro-middleware.js:42`, `core/app/prepare-response.js:5`).
- GoTrue returns a provider denial to `redirectTo` as `?error=access_denied&error_description=...` with no `code` and no `error_code`, in the query and duplicated in the fragment; a refusal after state is loaded adds `error_code`; an unknown or older-than-300-s `state` goes to the Site URL root with `error_code=bad_oauth_state`, a missing one with `bad_oauth_callback` and an already used one with `flow_state_already_used`, all in the query (GoTrue v2.196.0 `internal/api/external.go:812-865`, `external_oauth.go:44-73`, `external.go:534-563`; hosted is v2.197.0). `src/pages/index.astro` reads no query string.
- Same e-mail as an existing account: GoTrue adds a Google identity to the same `auth.users` row (id and every foreign key stay); an UNCONFIRMED password account loses its password first; with hosted "Confirm email" off, every provider e-mail counts as verified (`internal/models/linking.go:67-68`, `external.go:398-422`). The hosted "Confirm email" value is not recorded in the repo. A Google-only user gets the generic `invalid_credentials` from `signInWithPassword` (`token.go:116-118`), and the app has no password-reset flow (rg over `src`: none).
- `join_code` is a Lax, host-only, 1 h cookie (`src/lib/join-code.ts:14-20`) that `signin.ts`, `signup.ts`, `callback.ts` and `middleware.ts` do not reference; the Google round trip is top-level navigations. No test walks an invite through a callback; the only coverage of the invite path is `scripts/smoke.mjs:522-525,556-557,570-571`.
- POST is the convention for state changes, guarded by Astro's built-in `checkOrigin` (default on, no override in `astro.config.mjs`); the only GET routes are `auth/callback.ts` and `join/[code].ts` (research section 6). Smoke asserts the foreign-Origin 403 only for `/api/groups/*` and `/api/tasks/*`, and that GET on `delete` and `remove-member` answers 404 (`scripts/smoke.mjs:785-811`).
- Production auth settings live only in the Supabase Dashboard: Site URL `https://streakboard.app`, Redirect URLs `https://streakboard.app/**` (owner-reported 2026-10-02, `context/changes/deployment/deployment-plan.md:190`). Project ref `wzpgyobsomvjyfrngyuu` (`deployment-plan.md:124`). Google exists nowhere in the repo or in a recorded production step.
- `/` already shows product copy (`src/components/Welcome.astro:22-40`, commit `35b08ea`), but no privacy, terms or about page exists (`find src/pages public`, `rg -il "privacy|terms of|prywatno|regulamin" src public`: no match). `docs/reference/contract-surfaces.md` does not exist in this repo.

## Desired End State

- On `https://streakboard.app` a signed-out visitor sees "Continue with Google" on `/auth/signin` and `/auth/signup`. Clicking it opens Google's consent screen and returns to `/dashboard` signed in. With the same e-mail as an existing account the user lands in that account (same group); with a new Google account a new user lands on the empty dashboard. An invite opened before signing in (`/join/<code>`) still shows its "Join" card after the Google round trip.
- Cancelling at Google ends on `/auth/signin` with "Google sign-in was cancelled." A stale or consumed attempt ends on `/auth/signin` with "Google sign-in could not be completed. Please try again." (also when Supabase sent the browser to `/` because the flow state expired, was missing or was already used). An unexpected failure ends with "Something went wrong." and an error report.
- E-mail+password sign-up, sign-in and the confirmation link behave as before; the two e-mail messages carry a Google hint; the no-code `/auth/callback` request still answers 302 to `/auth/signin?error=link_expired`.
- The `release` live check proves, anonymously, that production redirects the start route to Supabase and Supabase redirects to `accounts.google.com`. The smoke script proves the app side without Google. The Google flows are proven by hand and recorded in `deployment-plan.md` (Phase 12).

Verify by the Success Criteria of both phases.

### Key Discoveries:

- A server-side `signInWithOAuth` only builds the URL (`GoTrueClient.ts:4845,4849`), so smoke can assert the start route (302, `redirect_to`, verifier cookie, untouched `join_code`) with the provider disabled on the local stack and no network.
- Following the Supabase `/authorize` URL one hop with `curl` answers `302` to `https://accounts.google.com/...` only when the provider is enabled with a non-empty client id and secret; otherwise GoTrue answers a JSON 400 (`internal/api/external.go:47-50`, `provider/google.go:40-73`, reported, not run). That gives an anonymous production proof of the Supabase side without a Google account.
- The wildcard Redirect URL `https://streakboard.app/**` matches `https://streakboard.app/auth/google/callback`, and any URL on the Site URL's own origin passes (`internal/utilities/request.go:94-139`). A `redirectTo` that is not allowed silently falls back to the Site URL root with `?code=...`, which the app would not handle: the production check must see the user land on `/dashboard`.
- Provider errors reach the server only in the query string; the fragment copy is invisible to it. The callback is a public GET, so every parameter is attacker-controlled: reports use fixed fields only, and parameter-driven outcomes are info lines (`src/lib/redact.ts:10-12` does not mask OAuth `code` or `state`).
- In Testing, Google's audience page says a subset of `openid`/`email`/`profile` needs no test-user list and no 7-day expiry; other Google pages contradict it. Everyone who will sign in is listed as a test user anyway (the cap is 100), so the fallback is already in place.
- The consent screen will show `<ref>.supabase.co` (Supabase's own guide); a custom domain is a paid add-on on a paid plan and is not part of this slice.

## What We're NOT Doing

- A privacy-policy page, a footer link, or any change to the landing page: the gate for publishing the Google app (S-09 lists S-07 as its prerequisite, `roadmap.md:137`). S-09 must keep the `/` redirect for the three flow-state error codes added here.
- Publishing the Google app to "In production", brand verification, a Supabase custom domain (the consent screen keeps showing the project domain).
- Enabling `[auth.external.google]` in `supabase/config.toml`, local Google credentials, or any provider secret in CI. Locally the button leads to GoTrue's JSON error because the provider is off; this is documented, not fixed.
- `supabase config push` or Supabase auth settings in the repository (it would push local `enable_confirmations = false` to production).
- Gaps of the e-mail path: link in another browser, resend, confirm-password field, the obfuscated sign-up success ("check your email" without a mail), audit items B2 and B4. The e-mail callback gets only a reporting fix.
- Password reset or a way for a Google user to set a password; showing the Google name or avatar; `prompt=select_account` or other provider query params; manual identity linking or unlinking.
- Playwright coverage of Google; running `npm run smoke` against production; Google brand-guideline checks beyond the allowed label "Continue with Google".
- `docs/reference/contract-surfaces.md` (it does not exist; nothing to update), `setAll` cache headers, and the S-09, S-10 and S-11 files.

## Implementation Approach

Two phases, owner first: the Google and Supabase configuration comes before any code that shows the button, because a button deployed before the provider is enabled sends users to a raw GoTrue JSON 400. Phase 2 ships code and the `release` check together; the check fails loudly when the provider is not enabled, so the order is enforced rather than remembered.

- Dedicated return route: `GET /auth/google/callback` instead of a marker on `/auth/callback`. The e-mail callback is proven on production, its three `link_expired` pins stay valid, and Google gets its own error contract. Start route: `POST /api/auth/google` (convention, `checkOrigin`); a GET answers 404.
- Error codes: `oauth_cancelled` (provider `error=access_denied` without `error_code`), `oauth_failed` (no `code`, or an exchange failing with `flow_state_not_found`, `flow_state_expired`, `bad_code_verifier` or `pkce_code_verifier_not_found`), `rate_limited` (429), `unknown` for everything else. They join `SignInErrorCode`, so `/auth/signin?error=` shows them through the existing allow-list.
- Reporting follows `lessons.md:133-138` through `src/lib/log.ts` with `requestFields(context)`: expected outcomes and every parameter-driven outcome are `reportInfo`; returned unexpected Supabase errors and thrown errors are `reportError`. The e-mail callback gets the same split (expected exchange failures become an info line, so the benign cross-browser case stops being an error-level line); its redirects do not change.
- Who does what: the owner performs everything in Google Cloud Console and the Supabase Dashboard and approves the `release`; Claude runs the `curl` checks, the edits, the commits and the PRs. The client secret goes only into the Supabase Dashboard form, never into chat, repo or CI.
- Branches (lessons): `s-07/google-login/phase-1` and `s-07/google-login/phase-2`, each cut from a fresh `master` after `git checkout master && git pull --ff-only`, commit messages in English, one PR per phase, each PR shown by its full URL. The planning branch `s-07/google-login/plan` is merged first (by `/10x-plan-review`). Phase 2 is not merged before every Phase 1 row is ticked.
- Reviews: `/10x-plan-review google-login` before implementation, `/10x-impl-review google-login phase N` after each phase (triaged before the push), the full-plan review before `/10x-archive`.
- Post-release rows: a PR cannot record its own `release`. The Phase 2 rows that need it (2.10 to 2.18) are checked after the merge and ticked, with the result written to `deployment-plan.md`, in a small closing docs PR on the branch `s-07/google-login/closing`.
- `deployment-plan.md` section number: this plan says "Phase 12", the next free number at the time of writing (the last section is Phase 11). If another slice has taken it, use the next free one.

## Critical Implementation Details

- **Ordering.** Do not merge the Phase 2 PR until the provider is enabled on the hosted project (Phase 1). The new `release` check fails otherwise, with the code already live; fix the configuration and re-run the failed jobs.
- **`redirectTo` must be built from the request origin** (`${new URL(context.request.url).origin}/auth/google/callback`), exactly as `signup.ts:19` does. A mismatch with the allow-list is silent: the user returns to `https://streakboard.app/?code=...`.
- **Reports carry fixed fields only**: `route`, `userId`, `ray`, `status`, an outcome name, and, for provider parameters, a value kept only if it matches `^[a-z0-9_]{1,40}$`. Never the URL, the query, `code`, `state` or `error_description`.
- **`await` `signInWithOAuth` before returning the redirect**, so the verifier `Set-Cookie` is already on the response.

## Phase 1: Google and Supabase provider setup (owner) and its record

### Overview

The owner creates the Google OAuth client and enables the provider in Supabase, Claude proves with an anonymous `curl` that the provider answers, and the steps are recorded in a new "Phase 12" section of `deployment-plan.md`. No code changes. The PR is documentation only.

### Changes Required:

#### 1. Supabase read-back (owner, Supabase Dashboard, read-only)

**Intent**: Learn the two production values that decide how account linking and duplicate sign-up behave, before any Google user exists.

**Contract**: Authentication, Sign In / Providers, Email: record whether "Confirm email" is on or off, and, if the dashboard shows it, the phone confirmation setting. Authentication, URL Configuration: read back Site URL and Redirect URLs and report them (expected `https://streakboard.app` and `https://streakboard.app/**`). Nothing is changed in this step. If "Confirm email" is off, record it as an accepted risk (a password account registered for someone else's address, without proof of the mailbox, keeps its password after that person signs in with Google); the audience is the owner and friends, and the plan continues.

#### 2. Google Cloud Console (owner, personal Google account)

**Intent**: Create the OAuth client that Supabase uses, with the consent screen in Testing.

**Contract**: Google Auth Platform, Branding: app name `StreakBoard`, user support e-mail and developer contact e-mail; leave home page, privacy policy and terms empty. Audience: user type External, publishing status Testing; add the owner and every friend as test users (limit 100), plus one extra Google account that has no StreakBoard account, for the production checks 2.12 and 2.13 (the owner's own Gmail already belongs to the existing account). Data Access: no scope beyond the default `openid`, `email`, `profile`. Clients, Create client: type Web application; Authorized JavaScript origins `https://streakboard.app`; Authorized redirect URIs `https://wzpgyobsomvjyfrngyuu.supabase.co/auth/v1/callback`. Copy the Client ID; the Client secret is shown once at creation, so store it in the password manager only. If the console refuses the redirect URI without an authorized domain, stop and report the exact text (Google's docs do not say whether Testing enforces it).

#### 3. Supabase Google provider (owner, Supabase Dashboard)

**Intent**: Turn the provider on with the client from step 2.

**Contract**: Authentication, Sign In / Providers, Google: enable; paste the Client ID and the Client secret into the form (nowhere else); "Skip nonce checks" off; "Allow users without an email" off; save. The "Callback URL (for OAuth)" shown by the dashboard must equal the redirect URI registered in step 2. Site URL and Redirect URLs stay as they are (the wildcard covers `/auth/google/callback`).

#### 4. Phase 12 section in the deployment plan

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Record the owner-reported steps and Claude's check the way Phases 10 and 11 do, so the production state of a dashboard-only setting has a dated trace.

**Contract**: A new `## Phase 12 — Google login: provider setup and first production proof (change google-login, S-07)` section after Phase 11 and before "Verification checklist", with `**Status: in progress**` and dated bullets: the "Confirm email" and phone-confirmation values, Site URL and Redirect URLs as read back, Google app status Testing with the number of test users (no addresses), client created (no values), provider enabled, the result of the `curl` check (status and host only), and an "owner-reported" tag on every row that only the owner can see. No secret, no client id value, no test-user address. Phase 2 and the closing PR extend the same section.

### Success Criteria:

#### Automated Verification:

- The provider answers on the hosted project: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://wzpgyobsomvjyfrngyuu.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fstreakboard.app%2Fauth%2Fgoogle%2Fcallback"` prints `302` and a URL that starts with `https://accounts.google.com/`, contains `client_id=` and contains `redirect_uri=https%3A%2F%2Fwzpgyobsomvjyfrngyuu.supabase.co%2Fauth%2Fv1%2Fcallback`
- The edited document is formatted: `npx prettier --check context/changes/deployment/deployment-plan.md`

#### Manual Verification:

- "Confirm email" (and phone confirmation, if shown) read in the Supabase Dashboard and reported as on or off
- Google app: user type External, status Testing, support and developer e-mails set, owner, friends and one extra account without a StreakBoard account (for 2.12 and 2.13) listed as test users, scopes unchanged
- Web client created with the two URIs above; the Client secret is stored only in the owner's password manager
- Supabase Google provider enabled with the client id and secret, both switches off, displayed callback URL equal to the registered redirect URI
- Supabase Site URL and Redirect URLs read back unchanged
- The Phase 12 section is committed on the Phase 1 branch with the owner-reported rows tagged as such; its merge to `master` is verified when the Phase 2 branch is cut from the fresh `master` (a PR cannot record its own merge)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual steps were done before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: App code, tests, smoke, release check, docs, and the production proof

### Overview

The button, the start route, the Google return route, the error contract, the e-mail callback reporting fix, the `/` redirect for an expired flow state, tests, smoke steps, the `release` check, and the docs. After the merge and the owner's approval of the `release`, the Google flows are proven on production and the result is recorded by the closing docs PR.

### Changes Required:

#### 1. Error codes, messages, and mapping functions

**Files**: `src/lib/auth-errors.ts`, `src/components/dev/SignInStates.tsx` (one string)

**Intent**: Give the new outcomes fixed, allow-listed messages, add the Google hint to the two e-mail messages, and keep the code-to-outcome decisions in pure functions that unit tests can pin.

**Contract**: `SignInErrorCode` gains `oauth_cancelled` and `oauth_failed`; `SIGN_IN_ERROR_MESSAGES` gains "Google sign-in was cancelled. Try again or sign in with your email." and "Google sign-in could not be completed. Please try again."; `invalid_credentials` becomes "Invalid email or password. If you signed up with Google, use Continue with Google."; `email_taken`, which lives in `SIGN_UP_ERRORS` (a separate map; `resolveSignUpError` renders it as the field error under the e-mail input), becomes "An account with this email already exists. Sign in instead, or use Continue with Google if you signed up with it." (the substring "already exists" stays; `smoke.mjs:344` asserts it, and a new smoke step asserts the hint separately). The dev-only kitchen sink `src/components/dev/SignInStates.tsx:138` hard-codes the old `invalid_credentials` text; update that string to the new one. New pure exports: `toGoogleReturnErrorCode(params: URLSearchParams): SignInErrorCode | null` (`oauth_cancelled` when `error` is `access_denied` and `error_code` is absent; `unknown` for any other `error` or `error_code`; `oauth_failed` when `code` is absent; otherwise `null`, meaning "exchange"); `toGoogleExchangeErrorCode(error: { code?: string }): SignInErrorCode` (the four stale codes give `oauth_failed`, `over_request_rate_limit` gives `rate_limited`, anything else `unknown`); `isStaleExchangeError(error: { code?: string }): boolean` (the same four codes, shared with the e-mail callback).

#### 2. Start route

**File**: `src/pages/api/auth/google.ts` (new)

**Intent**: Start the Google PKCE flow from a form POST and send the browser to Supabase, with the verifier cookie on the same response.

**Contract**: `export const prerender = false`; `POST` only. A null client redirects to `/auth/signin?error=not_configured`. Otherwise `await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })` with `redirectTo` built from the request origin; on success `context.redirect(data.url)`. A returned `{ error }` or a missing `data.url` is reported with `reportError("auth.google.start_failed", ...)` and redirects to `/auth/signin?error=unknown`; a thrown error is reported as `auth.google.start_exception` with the same redirect. Reports use `requestFields(context)` and never the URL. The route touches no cookie of its own (`join_code` stays).

#### 3. Return route

**File**: `src/pages/auth/google/callback.ts` (new)

**Intent**: Finish the Google sign-in with a contract that tells cancellation, a stale attempt and a real failure apart, and never reflects provider text.

**Contract**: `export const prerender = false`; `GET` only. Order: null client → `/auth/signin?error=not_configured`; `toGoogleReturnErrorCode(url.searchParams)` non-null → `reportInfo("auth.google.callback.returned", ...)` with the outcome and, only when they match `^[a-z0-9_]{1,40}$`, `providerError` and `providerErrorCode`, then redirect to `/auth/signin?error=<code>`; otherwise `await exchangeCodeForSession(code)`. A returned error is mapped by `toGoogleExchangeErrorCode`: `unknown` → `reportError("auth.google.callback.failed", error, { ...requestFields(context), status })`; `oauth_failed` and `rate_limited` → `reportInfo` with the Supabase `error.code` and `status`; the user is redirected to `/auth/signin?error=<code>`. A thrown error → `reportError("auth.google.callback.exception", ...)` and `?error=unknown`. Success → `/dashboard`. The route reads neither `error_description` nor any cookie and deletes nothing.

#### 4. E-mail callback reporting

**File**: `src/pages/auth/callback.ts`

**Intent**: Replace the two raw `console.error` calls with the `log.ts` convention without changing any redirect.

**Contract**: A returned exchange error: `isStaleExchangeError(error)` → `reportInfo("auth.callback.stale", { ...requestFields(context), code: error.code, status: error.status })`, otherwise `reportError("auth.callback.failed", error, ...)`; a thrown error → `reportError("auth.callback.exception", error, requestFields(context))`. All redirects stay `/auth/signin?error=link_expired`; the no-code and `error`/`error_code` early return stays silent and unchanged. Remove the two `eslint-disable no-console` comments and update the header comment.

#### 5. Expired flow state on the landing page

**File**: `src/pages/index.astro`

**Intent**: When Supabase sends the browser to the Site URL root because the flow state is expired (older than 300 s), unknown, missing or already used, show the Google failure message instead of a silent landing page.

**Contract**: In the frontmatter, `Astro.url.searchParams.get("error_code")` equal to one of `bad_oauth_state` (unknown or expired state), `bad_oauth_callback` (state missing) or `flow_state_already_used` (state consumed) redirects to `/auth/signin?error=oauth_failed`. The three values are a fixed list matched exactly; any other query renders the page as today. A signed-in user is sent on from the sign-in page to `/dashboard` by the middleware, which is fine.

#### 6. Button on the sign-in and sign-up pages

**Files**: `src/components/auth/GoogleButton.astro` (new), `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Offer Google where users sign in or up, as a plain form that works before any island hydrates and does not disturb the e-mail form or the Playwright locators.

**Contract**: `GoogleButton.astro` renders `<form method="POST" action="/api/auth/google">` with one `<button type="submit">` styled with `buttonVariants({ variant: "outline" })`, full width, an inline decorative Google "G" mark (`aria-hidden`) and the text "Continue with Google" (the accessible name must not contain "Sign in"; `tests/e2e/auth.setup.ts:19`, `helpers.ts:24` and `seed.spec.ts:27` match `{ name: "Sign in" }` as a substring). Below it an "or" divider built from existing Tailwind tokens (`src/components/ui` has no separator). Both pages place it in `CardContent` above the e-mail form, outside the React island (no nested form).

#### 7. Tests

**Files**: `tests/unit/auth-errors.test.ts` (new), `tests/integration/auth-google-start-route.test.ts` (new), `tests/integration/auth-google-callback.test.ts` (new), `tests/integration/auth-callback.test.ts` (updated)

**Intent**: Pin the new contract, and keep the e-mail callback's redirects pinned while its reporting changes.

**Contract**: Follow `tests/integration/auth-signin-route.test.ts:1-85` (stubbed `createClient`, `routePattern` and `locals` in the context, console spies, no e-mail in logs). `auth-errors.test.ts`: every new code resolves to its message and a foreign `?error=` resolves to `null`; both hint messages (`resolveSignInError("invalid_credentials")` and `resolveSignUpError("email_taken")`) contain "Continue with Google" and `email_taken` still contains "already exists"; `toGoogleReturnErrorCode` for no params, `error=access_denied`, `error=access_denied&error_code=signup_disabled`, `error=server_error` and a bare `code`; `toGoogleExchangeErrorCode` and `isStaleExchangeError` for each stale code, `over_request_rate_limit`, `validation_failed` and an unknown code. Start route: success redirects to the stubbed URL and passed `{ provider: "google", options: { redirectTo: "http://localhost:4321/auth/google/callback" } }`; returned error, missing URL, thrown error and null client each redirect as specified, with the expected report event and no URL in the log. Return route: every row of the specification (no params, cancelled, refusal with `error_code`, success to `/dashboard`, each stale code, rate limit, unknown error, throw, null client), the log level of each, and that the stubbed cookies object is never written. Updated e-mail callback test: the context gains `routePattern` and `locals`; the existing redirect assertions stay as they are; add that a stale exchange error logs `auth.callback.stale` at info level, an unexpected one logs `auth.callback.failed` at error level, and a throw logs `auth.callback.exception`.

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Assert the outcomes of the new app side without Google, in the style of the existing steps.

**Contract**: The runner (`for (const [name, run, expectation] of steps)` at `:1619`) gains two optional keys, `locationIncludes` (every listed string occurs in the `Location`) and `setCookieExcludes` (no `Set-Cookie` contains the string), and its failure printout names them. New steps, placed after the existing callback and sign-in page steps and run with throwaway jars or the `cookie` option so user A's jar is not touched: the start route answers 302 with a `Location` that includes `/auth/v1/authorize?provider=google`, the percent-encoded `redirect_to` of `${BASE_URL}/auth/google/callback` and `code_challenge=`, and sets a cookie containing `-code-verifier=`; the same POST with a foreign `Origin` answers 403; a GET to the start route answers 404; the start route called with `cookie: "join_code=0123abcd"` neither clears nor sets `join_code` (`setCookieExcludes: "join_code"`); the return route with no parameters answers 302 exactly to `/auth/signin?error=oauth_failed`, with `?error=access_denied&error_description=` exactly to `?error=oauth_cancelled`, and with `?error=access_denied&error_code=signup_disabled` exactly to `?error=unknown`; `/?error_code=bad_oauth_state`, `/?error_code=bad_oauth_callback` and `/?error_code=flow_state_already_used` each answer 302 exactly to `/auth/signin?error=oauth_failed`, while `/?error_code=something_else` and `/` still answer 200; `/auth/signin?error=oauth_cancelled` and `?error=oauth_failed` render their messages, `/auth/signin?error=Injected%20message` does not reflect the text, `/auth/signin?error=invalid_credentials` includes "If you signed up with Google" and `/auth/signup?error=email_taken` includes "if you signed up with it" (hint-only text; the always-rendered button already contains "Continue with Google", so that string would prove nothing); `/auth/signin` and `/auth/signup` include `action="/api/auth/google"` and "Continue with Google". The existing `/auth/callback` steps stay unchanged.

#### 9. Release gate

**File**: `.github/workflows/ci.yml`

**Intent**: Prove, anonymously and after every deploy, that production's start route reaches Supabase and that Supabase's Google provider answers.

**Contract**: In the `Check the live deployment` step, after the `/auth/callback` assertion, two exact checks in the style of the existing ones: `curl -X POST -H "Origin: $base" "$base/api/auth/google"` must answer `302` with a `Location` matching `https://*/auth/v1/authorize?provider=google*`; a request to that `Location` (with `--max-time 20`) must answer `302` with a `Location` matching `https://accounts.google.com/*`. Each hop is tried up to 3 times, 3 s apart, in the style of the `/` loop at `ci.yml:137-141`, every curl with `--max-time 20`; only the third failed try fails the step, and the message prints that try's status and `Location`. The existing three assertions stay as they are. Each run creates one short-lived `flow_state` row in Supabase; accepted.

#### 10. Documentation

**Files**: `README.md`, `CLAUDE.md`, `context/foundation/roadmap.md`

**Intent**: Keep the contract documents true.

**Contract**: README: the Auth routes table (`:147-156`) gains the start route and `/auth/google/callback`; "Production auth settings" (`:254-258`) gains the Google provider (client created in Google Cloud Console in status Testing, Client ID and secret only in the Supabase Dashboard, callback URL `https://<project-ref>.supabase.co/auth/v1/callback`, the wildcard Redirect URL covering `/auth/google/callback`, the privacy-policy gate for publishing, and one sentence that a wrong, rotated or deleted client secret reaches the user as "Something went wrong" and shows only as an `auth.google.callback.returned` info line with `providerError=server_error` in Workers Logs, not in Sentry); the Release step 3 sentence (`:202`) and the CI `release` bullet (the "**release** —" bullet under the CI jobs) name the new live check; the first paragraph of the "## Smoke test" section names the Google start and return steps; a note that locally the button ends on GoTrue's JSON error because the provider is disabled. `CLAUDE.md`: the API endpoints and Auth pages lists (lines 11-12) gain `google.ts`, `auth/google/callback.ts` and `GoogleButton.astro`, and the callback is mentioned. `roadmap.md`: S-07 handoff row (`:180`) no longer says "Czeka na S-06"; the three S-07 Unknowns (`:109-111`) get their resolutions (Google only; automatic linking by Supabase, no "keep separate"; Testing needs no home page or policy, the policy is the publishing gate and goes to S-09). The `Status` field is set by the plan and implement skills, not here.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Unit and integration tests pass, including the new and updated ones, with the local stack running: `npm test`
- Smoke passes against the production preview with the new steps, with the local stack running: `npm run build && npm run preview`, then `BASE_URL=http://localhost:4321 npm run smoke`
- The new mapping functions survive a narrowed mutation run, survivors reviewed one by one and covered only where a mutant is a user-visible bug: `npx stryker run --mutate "src/lib/auth-errors.ts:<line range of the new functions>"`

#### Manual Verification:

- Locally, `/auth/signin` and `/auth/signup` show "Continue with Google" above an "or" divider and the e-mail form; the layout holds at phone width and keyboard focus is visible
- Locally, clicking the button reaches the local Supabase and ends on GoTrue's JSON error (provider off locally): the app shows no error page and logs no error line
- The Playwright e2e specs still pass locally (they need the local stack and `E2E_USERNAME` and `E2E_PASSWORD`; not run in CI)
- After the merge and the owner's approval, the `release` run finishes `success`, including the new two-hop Google check (CI run id recorded)
- On production, the owner's existing e-mail account signs in with Google (same Gmail) and lands on `/dashboard` as the same user with the same group
- On production, a Google account without a StreakBoard account signs in and lands on `/dashboard` as a new user with the create and join forms
- On production, an invite opened signed out (`/join/<code>`) and followed by "Continue with Google" ends on `/dashboard` with the "Join" card for that group
- On production, cancelling at Google's consent screen ends on `/auth/signin` with the "Google sign-in was cancelled" message, and reloading the page shows no error
- On production, e-mail+password sign-in and sign-out still work
- The flows above leave no error-level `auth.google.*` line and no new Sentry issue; a search of Workers Logs after the flows finds no `auth.google.callback.returned` line with `providerError=server_error` (a wrong client secret or a revoked client comes back that way and is reported at info level only, so Sentry stays silent); `auth.google.callback.returned` lines for a cancelled attempt and `auth.callback.stale` lines are expected outcomes
- The Phase 12 section of `deployment-plan.md` records the release result and the manual results, with the owner-reported rows tagged, and whether the production user created by 2.12 was kept as a test account or deleted in the Supabase Dashboard
- The closing docs PR is merged

**Implementation Note**: After completing the code, the docs and all local verification, run `/10x-impl-review google-login phase 2`, triage it, then push and open the PR. After the merge, approve the `release`, do the production checks, and tick the production rows in the closing docs PR. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/auth-errors.test.ts`: messages and allow-list, the hint wording, `toGoogleReturnErrorCode`, `toGoogleExchangeErrorCode`, `isStaleExchangeError`
- Edge cases: `error=access_denied` with and without `error_code`; a bare `code`; every stale code; `validation_failed` and unknown codes fall to `unknown`; a foreign `?error=` resolves to nothing

### Integration Tests:

- Start route and return route with a stubbed Supabase client: redirects, the exact report event and level for each outcome, no URL or query in any report, cookies untouched by the return route
- E-mail callback: redirects unchanged, reporting split into info for stale and error for unexpected and thrown
- Smoke against the local stack: the app-side outcomes listed in Phase 2, change 8 (302 target, verifier cookie, 403 for a foreign origin, 404 for GET, untouched `join_code`, each callback outcome, the `/` redirect, the messages, the button in both pages)
- `release` live check on production: the two-hop proof of the Supabase provider

### Manual Testing Steps:

1. Phase 1 rows 1.3 to 1.7 in the Google and Supabase consoles, then the `curl` check.
2. Local pages and layout at phone width, keyboard focus, and the expected local JSON error after a click.
3. After the release: the owner's existing account, a new Google account, an invite through Google, a cancel at the consent screen, then e-mail+password and sign-out.
4. Optional: wait more than five minutes on the consent screen and confirm that the return ends on `/auth/signin` with the failure message.

## Performance Considerations

One extra POST route and one extra GET route; the Google return performs one `exchangeCodeForSession`, like the e-mail callback. The Worker's CPU limit (10 ms on Free) is not measured here; the S-08 note says the baseline was never taken (`deployment-plan.md`, Phase 11), so no new condition is added. The `release` check adds two `curl` calls and one `flow_state` row per run.

## Migration Notes

No schema change and no migration. Existing users and their foreign keys are untouched: signing in with Google using an existing e-mail adds an identity to the same `auth.users` row. If the hosted "Confirm email" is off, an unconfirmed-account takeover by pre-registration is theoretically possible (risk accepted for the owner-and-friends audience, recorded in Phase 12). Rollback: `npx wrangler rollback` removes the button and routes; the Google provider can stay enabled in Supabase without effect. Dashboard settings are not rolled back by Wrangler.

## References

- Frame: `context/changes/google-login/frame.md`
- Related research: `context/changes/google-login/research.md`
- Callback and reporting: `src/pages/auth/callback.ts:9-35`, `src/lib/log.ts:88-130`, `src/lib/auth-errors.ts:1-75`, `src/pages/api/auth/signin.ts:7-33`
- Test patterns: `tests/integration/auth-signin-route.test.ts:1-85`, `tests/integration/auth-callback.test.ts:1-76`, `scripts/smoke.mjs:332-401,785-811,1619-1651`
- Release gate: `.github/workflows/ci.yml:137-154`
- Precedent for owner-only third-party steps: `context/archive/2026-10-02-custom-domain/plan.md`, `context/changes/deployment/deployment-plan.md:184-211`
- Lessons applied: `context/foundation/lessons.md:5-9` (English commits), `:12-17` (phase branches and PRs), `:19-24` (planning branch), `:26-31` (smoke asserts outcomes), `:77-82` (close by merge, approval and production check), `:84-89` (skills run git), `:133-138` (report every returned Supabase error)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Google and Supabase provider setup (owner) and its record

#### Automated

- [x] 1.1 The provider answers on the hosted project: `curl` of the Supabase `/authorize` URL prints `302` and a `https://accounts.google.com/` URL with `client_id=` and the Supabase callback as `redirect_uri` — 4a816ae
- [x] 1.2 The edited document is formatted: `npx prettier --check context/changes/deployment/deployment-plan.md` — 4a816ae

#### Manual

- [x] 1.3 "Confirm email" (and phone confirmation, if shown) read in the Supabase Dashboard and reported as on or off — 4a816ae
- [x] 1.4 Google app: user type External, status Testing, support and developer e-mails set, owner, friends and one extra account without a StreakBoard account listed as test users, scopes unchanged — 4a816ae
- [x] 1.5 Web client created with the two URIs; the Client secret is stored only in the owner's password manager — 4a816ae
- [x] 1.6 Supabase Google provider enabled with the client id and secret, both switches off, displayed callback URL equal to the registered redirect URI — 4a816ae
- [x] 1.7 Supabase Site URL and Redirect URLs read back unchanged — 4a816ae
- [x] 1.8 The Phase 12 section is committed on the Phase 1 branch with the owner-reported rows tagged as such; its merge to `master` is verified when the Phase 2 branch is cut — 4a816ae

### Phase 2: App code, tests, smoke, release check, docs, and the production proof

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 03e21f5
- [x] 2.2 Type check passes: `npx astro check` — 03e21f5
- [x] 2.3 Build passes: `npm run build` — 03e21f5
- [x] 2.4 Unit and integration tests pass, including the new and updated ones, with the local stack running: `npm test` — 03e21f5
- [x] 2.5 Smoke passes against the production preview with the new steps, with the local stack running — 03e21f5
- [x] 2.6 The new mapping functions survive a narrowed mutation run, survivors reviewed one by one — 03e21f5

#### Manual

- [x] 2.7 Locally, `/auth/signin` and `/auth/signup` show "Continue with Google" above an "or" divider and the e-mail form; the layout holds at phone width and keyboard focus is visible — 03e21f5
- [x] 2.8 Locally, clicking the button ends on GoTrue's JSON error (provider off locally): the app shows no error page and logs no error line — 03e21f5
- [x] 2.9 The Playwright e2e specs still pass locally — 03e21f5
- [x] 2.10 After the merge and the owner's approval, the `release` run finishes `success`, including the new two-hop Google check
- [x] 2.11 On production, the owner's existing e-mail account signs in with Google and lands on `/dashboard` as the same user with the same group
- [x] 2.12 On production, a Google account without a StreakBoard account lands on `/dashboard` as a new user with the create and join forms
- [x] 2.13 On production, an invite opened signed out and followed by "Continue with Google" ends on `/dashboard` with the "Join" card
- [x] 2.14 On production, cancelling at the consent screen ends on `/auth/signin` with the cancelled message, and reloading shows no error
- [x] 2.15 On production, e-mail+password sign-in and sign-out still work
- [x] 2.16 The flows above leave no error-level `auth.google.*` line and no new Sentry issue, and Workers Logs show no `auth.google.callback.returned` line with `providerError=server_error`
- [x] 2.17 The Phase 12 section of `deployment-plan.md` records the release result and the manual results, owner-reported rows tagged, and whether the user created by 2.12 was kept or deleted
- [ ] 2.18 The closing docs PR is merged
