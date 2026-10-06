<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Google login

- **Plan**: context/changes/google-login/plan.md
- **Scope**: Phase 2 of 2
- **Reviewed phases**: 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warnings, 9 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- Diff scope: one commit, `03e21f5`, 20 files. 18 are in the plan's Changes Required list, `plan.md` carries the Progress edits, and `eslint.config.js` is not in the plan (the owner approved keeping a narrow override; see F2 for a defect in it). The SHA write-back for rows 2.1 to 2.9 is uncommitted in `plan.md` and goes into the review commit.
- Plan adherence: a read-only reviewer compared all 10 Changes Required items with the files, sentence by sentence. All 10 are MATCH, nothing is MISSING, nothing from "What We're NOT Doing" crept in. Extras seen and harmless: an `outcome` field on the info line of returned exchange errors, a third `CLAUDE.md` bullet for the return routes, a `setCookieExcludes` assertion on the foreign-origin smoke step, a reworded README Redirect URLs bullet, the roadmap "Ready for `/10x-plan`" cell `no` to `yes`, an empty `code=` counted as absent.
- Automated rows re-run in this review on the phase branch: 2.1 `npm run lint` (exit 0), 2.2 `npx astro check` (0 errors, 0 warnings), 2.3 `npm run build` (exit 0), 2.4 `npm test` (26 files, 379 tests), 2.5 smoke against the production preview (207 of 207 steps). 2.6: the Stryker run configured in `stryker.config.json` (vitest runner) reports 11.6% on the new functions and 11.7% on the untouched `auth-state.ts` (control), so the runner does not detect dynamic mutants with Vitest 5.0.3 here; the built-in `command` runner with a temporary config in the session scratchpad gives 97.67% (42 of 43 killed). The one survivor (`error.code !== undefined` to `true` in `isStaleExchangeError`) is equivalent at run time (`includes(undefined)` is already false). The repo config was not changed.
- Real GoTrue check done by hand on the local stack (not covered by any test): `GET /auth/google/callback?code=junk` without a verifier cookie answers `302 /auth/signin?error=oauth_failed`; with a real verifier cookie taken from the start route's `Set-Cookie`, a junk code and a well-formed unknown code both answer `oauth_failed`, and the log line is the info-level `auth.google.callback.failed`, not an error. So a public GET with a made-up code does not reach Sentry locally; hosted GoTrue is v2.197.0 and was not checked.
- `ci.yml` live-check shell logic was run under `bash -e` with `curl` and `sleep` replaced by functions: success, a flaky hop 1 (3 tries, 2 pauses), a dead hop 1, a non-https `Location`, a timeout, a flaky hop 2, a dead hop 2 and a look-alike Google host. All behaved as specified. The exact hop-1 `curl` was also run against the local preview.
- Manual rows 2.7 to 2.9 were confirmed by the owner on 2026-10-06 ("jest ok") after a visual check at 375 px, keyboard focus and the click ending on GoTrue's JSON 400; Playwright 3 of 3. Rows 2.10 to 2.18 are post-merge by design and stay unticked.
- After triage: every fix except F9 (accepted) was applied on this branch. Gates re-run on the fixed code: `npm run lint` exit 0, `npx astro check` 0 errors and 0 warnings, `npm run build` exit 0, `npm test` 26 files and 382 tests, smoke 209 of 209 steps, and the eight `ci.yml` shell scenarios. One `npm test` run before the repeats failed once in `tests/integration/group-isolation.test.ts` (`JWT issued at future` while creating a group), a file this change does not touch; three further full runs passed and the container clocks agreed to the second, so it is recorded as a flake, not fixed. Stryker was not re-run: `src/lib/auth-errors.ts` did not change in the fixes. Break checks for the new assertions: five Vitest breaks and a smoke build with three breaks (four red steps), each restored from the index.
- Break checks done before the commit: four Vitest breaks and five smoke breaks (six red steps) went red on broken code and were restored from the index.
- Secret and log scan of the added lines: no URL, query, `code`, `state` or `error_description` reaches a report; provider values pass `^[a-z0-9_]{1,40}$`; no `console.*` in the new routes; no secret, client id or e-mail in the diff.
- Lessons checked: reports through `log.ts` (kept), smoke steps assert outcomes (see F5), `ci.yml` triggers and job-level `if:` untouched, English only. The branch `s-07/google-login/phase-2` is local only, as the lessons require until this review is triaged.

## Findings

### F1 — The return route's real wiring is exercised by no automated check before production

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/google/callback.ts:20, tests/integration/auth-google-callback.test.ts:8, scripts/smoke.mjs (Google return steps)
- **Detail**: Every test of the return route stubs `createClient`, and no test asserts that it receives `(context.request.headers, context.cookies)`. The smoke steps cover the return route only for the outcomes that need no exchange. So a regression in the cookie wiring, or a stale-code list that no longer matches what the SDK and GoTrue really return, passes CI and shows up only at the manual production rows 2.11 to 2.13, after the release. The risk is a regression, not a present bug: checked by hand on the local stack, a junk code with and without a verifier cookie ends on `oauth_failed` with an info line.
- **Fix**: Add `expect(createClient).toHaveBeenCalledWith(context.request.headers, context.cookies)` to the Google route tests, and two smoke steps that use no Google account: `GET /auth/google/callback?code=x` with `cookie: ""` ends exactly on `/auth/signin?error=oauth_failed` (real `pkce_code_verifier_not_found` from the SDK), and the same GET with the verifier cookies taken from the start step's `Set-Cookie` and a well-formed unknown code ends on `oauth_failed` (real local GoTrue answer).
  - Strength: Turns the manual check done in this review into a regression guard and proves the real SDK and GoTrue codes are in the stale list.
  - Tradeoff: The second step reads SDK-internal cookie names from a response, a small coupling, and it needs a smoke break check and a smoke re-run.
  - Confidence: HIGH — both calls were run by hand against the preview in this review.
  - Blind spot: Hosted GoTrue v2.197.0 may answer a made-up code differently from the local stack; only production row 2.11 would show it.
- **Decision**: FIXED — both Google route tests assert that `createClient` gets the request's own headers and the Astro cookies (`builds the Supabase client from the request's own headers and the Astro cookies`), and smoke gained two steps, `google return with a code but no verifier cookie ends on signin with oauth_failed` and `google return with the verifier cookie and an unknown code ends on signin with oauth_failed` (smoke is now 209 steps). Break checks: passing `new Headers()` to `createClient` turned the assertion red in both tests; removing `flow_state_not_found` and `pkce_code_verifier_not_found` from the stale list turned both new smoke steps red, so the real local GoTrue answers an unknown code with `flow_state_not_found`. Hosted GoTrue is still checked only at production row 2.11.

### F2 — The ESLint override replaces the base options and silently re-enables the `attributes` check in `.astro` files

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:70-71
- **Detail**: The base config sets `"@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }]` (`:34`) for every file. The override added for `.astro` files is `{ checksVoidReturn: { returns: false } }`; the options object replaces the base one, so inside `.astro` files `attributes` is checked again. Nothing breaks today (no `.astro` file passes an async handler as an attribute, `npm run lint` is clean), but the override is not "only the `returns` check off", which is what the owner approved. The first version written by the implementation (`{ attributes: false, returns: false }`) was right; the narrowing done in the session dropped `attributes: false`.
- **Fix**: Change the override to `{ checksVoidReturn: { attributes: false, returns: false } }` so `.astro` files behave exactly as before except for `returns`.
- **Decision**: FIXED — the override is now `{ checksVoidReturn: { attributes: false, returns: false } }` with a comment that the options replace the base ones (`eslint.config.js`); `.astro` files behave as before except for `returns`.

### F3 — Two new event names break the documented `<area>.<action>.<outcome>` convention

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/google.ts:22,31
- **Detail**: README "Event names" says events follow `<area>.<action>.<outcome>`, with `.failed` a returned Supabase error and `.exception` a thrown one. `auth.google.start_failed` and `auth.google.start_exception` put the outcome after an underscore, so Workers Logs queries on `event:*.failed` or `event:*.exception` miss them, and the event is the Sentry fingerprint, so a later rename splits the issue history. The plan itself named these two events, so this is a plan defect that the code followed. Nothing is in production yet, so renaming now is free.
- **Fix**: Rename to `auth.google.start.failed` and `auth.google.start.exception` in the route and in the two test expectations; note the rename in the decision, because the plan text still names the old events.
- **Decision**: FIXED — renamed to `auth.google.start.failed` and `auth.google.start.exception` in `src/pages/api/auth/google.ts` and in the start-route test. The Phase 2 text of `plan.md` (Changes Required, item 2) still names `auth.google.start_failed` and `auth.google.start_exception`; phase blocks are read-only, so it is left as written and this decision is the record. The README does not name the events. Break check: renaming one back turned the start-route test red.

### F4 — `redirectTo` from the request origin is tested only on `localhost`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/auth-google-start-route.test.ts:19-20, scripts/smoke.mjs (start step)
- **Detail**: The plan calls building `redirectTo` from the request origin critical, because a mismatch with the allow-list is silent (the user returns to `https://streakboard.app/?code=...`). The unit test and smoke both run only on `http://localhost:4321`, so a mutant that hard-codes the origin or reads it from elsewhere (`Astro.site`, a constant) passes every automated check and would show only at production row 2.11.
- **Fix**: Let `start()` in the start-route test take a request URL, and add one case with `https://streakboard.app/api/auth/google` asserting `redirectTo: "https://streakboard.app/auth/google/callback"`.
- **Decision**: FIXED — the start-route test builds its request from a URL argument and has a new case, `asks for the return route on whichever origin the request came in on`, for `https://streakboard.app/api/auth/google`. Break check: a hard-coded `http://localhost:4321` origin turned it red.

### F5 — Two smoke message steps pass on the serialized island props alone

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:429-438
- **Detail**: The steps "signin page shows the cancelled message" and "shows the failed message" use `bodyIncludes` on the message text. Checked on the preview: the text occurs twice in the HTML, once in the `props` attribute of the `client:load` island and once in the rendered alert. A page whose alert no longer renders (an island or `ServerError` regression) would keep both steps green, the "body check that an error page would also satisfy" that `lessons.md` warns about. The older "expired-link message" step has the same weakness; the hint steps are fine because their text is not in the button.
- **Fix**: Replace `bodyIncludes` in these two steps with a `bodyMatches` regex that anchors the text inside the alert element (`data-slot="alert-description"`), after reading the exact markup from the rendered page, and re-run the smoke break check for them.
- **Decision**: FIXED — the two steps use a new `alertMessage()` helper, a regex anchored on `data-slot="alert-description"`. Break check: `ServerError` made to render nothing turned both steps red, while the older, unchanged step `signin page shows the expired-link message` stayed green (it has the same weakness and was left alone as outside this finding).

### F6 — The release live check sends a bodyless POST

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:189
- **Detail**: `curl -X POST -H "Origin: $base"` sends no `Content-Length` and no `Content-Type`, unlike the browser button. Locally it works (`302`), but the first run against Cloudflare's edge is the release itself; if the edge treated a bodyless POST differently, all three tries would fail and the release would go red with the code already live. The second hop accepts any `https://` host in the `Location`; tying it to `$SUPABASE_PROJECT_REF.supabase.co` would also catch a Worker secret pointing at another project, but that is not needed for the plan's goal, adds a variable the check does not use today, and can fail a good release if the variable differs from the host.
- **Fix**: Use `-X POST -d ''` in hop 1 (checked locally: `302` for the right origin and `403` for a foreign one, with the form content type and `Content-Length: 0` as a browser sends); leave hop 2's host pattern as the plan specifies.
- **Decision**: FIXED — hop 1 is now `probe -X POST -d '' -H "Origin: $base" ...`. The exact `curl` answers `302` for the right origin and `403` for a foreign one on the local preview, and the eight shell scenarios give the same results. Hop 2's host pattern stays as the plan specifies.

### F7 — An implementation comment is rendered into every sign-in and sign-up page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/GoogleButton.astro:5
- **Detail**: `<!-- A plain form, ... -->` is an HTML comment, so it is served to every visitor of `/auth/signin` and `/auth/signup` (seen in the built template). Nothing sensitive, but it is an internal note in a public response; `Welcome.astro` does the same, so this is a repo habit.
- **Fix**: Turn it into a `{/* ... */}` template comment.
- **Decision**: FIXED — now a `{/* ... */}` template comment, no longer rendered into the page.

### F8 — The new `CLAUDE.md` line is not exact about the callbacks' outcomes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:13
- **Detail**: The line says every e-mail callback failure ends on `/auth/signin?error=link_expired`; a missing Supabase configuration ends on `not_configured` (`src/pages/auth/callback.ts`). It also lists the Google outcomes as `oauth_cancelled|oauth_failed|unknown`, while the route can also end on `rate_limited` and `not_configured`. The README wording (`error=<code>` with a fixed message) is accurate.
- **Fix**: Say "every exchange failure ends on `link_expired`" for the e-mail callback, and "fixed codes from `src/lib/auth-errors.ts`" for the Google one.
- **Decision**: FIXED — `CLAUDE.md:13` now says "every exchange failure ends on `/auth/signin?error=link_expired`" for the e-mail callback and "a fixed code from `src/lib/auth-errors.ts`" for the Google one.

### F9 — A double-click or a second tab can fail the Google flow once, with only an info line as trace

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/GoogleButton.astro:7, src/pages/auth/google/callback.ts:40
- **Detail**: The button has no pending state, and the redirect carries no flow id, so the exchange reads the fixed `-code-verifier` cookie, which mirrors the most recently stored verifier. Two overlapping starts can leave a mismatched verifier: the return then answers `bad_code_verifier`, the user sees "Google sign-in could not be completed. Please try again." and an immediate retry works; only an info line records it. The start route does no network call, so the window is small.
- **Fix A**: Accept the risk and record it in the decision.
  - Strength: No code, nothing in the form changes, and the retry path is already the designed message.
  - Tradeoff: A rare first-attempt failure with no error-level trace.
  - Confidence: HIGH — the failure is retryable and covered by the `oauth_failed` message.
  - Blind spot: The frequency in real use is unknown.
- **Fix B**: Disable the button in an inline `onsubmit`, plus a `pageshow` handler that re-enables it.
  - Strength: Removes the double-click case.
  - Tradeoff: Inline script in a plain-form component; without the `pageshow` reset the browser's back button from Google's page restores a disabled button; a second tab is not covered.
  - Confidence: MEDIUM — the bfcache behaviour was not run here.
  - Blind spot: Whether the project's CSP or other inline-script rules exist.
- **Decision**: ACCEPTED (Fix A) — the risk is accepted: after a double-click or a second tab the first attempt can end on `bad_code_verifier`, the user sees the `oauth_failed` message, a retry works, and the trace is the info line `auth.google.callback.failed`. No code change.

### F10 — The return route re-implements the `reportMapped` policy inline

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/google/callback.ts:42-52
- **Detail**: `lessons.md` says route handlers use `reportMapped` for a returned Supabase error. The route writes the same levels by hand: `unknown` an error line, `rate_limited` and the stale codes an info line. Behaviour is the same except that `reportMapped` adds `outcome` to the error line. The plan prescribes the inline form, and a change to the central policy would not reach this route.
- **Fix**: Skip, or call `reportMapped("auth.google.callback.failed", errorCode, error, { ...requestFields(context), status: error.status })` for `unknown` and `rate_limited` and keep only the stale info line inline; the tests need small edits (`outcome` on the error line).
- **Decision**: FIXED — the return route calls `reportMapped("auth.google.callback.failed", ...)` for `unknown` and `rate_limited` and keeps one inline info line for the stale codes (`reportMapped` is silent for them). The error line now also carries `outcome: "unknown"`, which the test asserts. Break check: passing `"oauth_failed"` to `reportMapped` turned three tests red. The Phase 2 text names the inline form; the behaviour it describes is unchanged.
