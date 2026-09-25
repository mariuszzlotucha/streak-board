---
date: 2026-09-25T14:22:22+02:00
researcher: Claude Sonnet 5
git_commit: 779c418d3fd94d79acebf004d573c9274b4bbfd2
branch: master
repository: 10xDevs
topic: "Which Supabase error codes can signUp return, and how do we map them to fixed messages and keep the email after a failed submit?"
tags: [research, codebase, supabase-auth, signup, auth-errors, smoke]
status: partial
last_updated: 2026-09-25
last_updated_by: Claude Sonnet 5
---

# Research: Signup error codes and email retention

**Date**: 2026-09-25T14:22:22+02:00
**Researcher**: Claude Sonnet 5
**Git Commit**: 779c418d3fd94d79acebf004d573c9274b4bbfd2
**Branch**: master
**Repository**: 10xDevs

## Research Question

`change.md` has no intent text, so the question comes from the request that opened this change (follow-up F2 of the archived `ui-styles-audit`, plus its deferred C3 point 3):

1. Which error codes does Supabase Auth return from `signUp` (already-registered email, weak password, validation, rate limit, missing config)?
2. What do the signup handler, page and form do today with those errors?
3. What constrains keeping the email after a failed sign-in or sign-up (the form is a native POST followed by a redirect)?

## Summary

- Today `signup.ts` puts `error.message` into `?error=` and `signup.astro` renders it unchanged, so anyone can make the page show arbitrary text via a crafted URL (`src/pages/api/auth/signup.ts:11,16`, `src/pages/auth/signup.astro:7,17`). Sign-in already maps to fixed codes (`src/lib/auth-errors.ts:1-29`).
- Against the local Supabase (`enable_confirmations = false`, `minimum_password_length = 6`; `supabase/config.toml:175,209`) `signUp` returned these codes in the 13 probes I ran (table below): `user_already_exists` (422), `weak_password` (422), `validation_failed` (400), `anonymous_provider_disabled` (422). Two probes succeeded: the new valid account and a `.invalid` domain.
- The already-registered code observed was `user_already_exists`, not `email_exists`; both are in the SDK's `ErrorCode` union (`node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts`), and I only observed the first.
- The SDK's own doc comment says that for an existing confirmed user, with email and phone confirmation both enabled, `signUp` returns an obfuscated user and no error (`GoTrueClient.js:573-577`). Locally confirmations are off, so this branch was not exercised. Whether the codes above appear in a hosted project with confirmations on is untested.
- Email retention has no existing mechanism in `src/`: the email lives in `useState("")` and a redirect reloads the page (`SignInForm.tsx:14`, `SignUpForm.tsx:16`). The only cookie write is Supabase's (`src/lib/supabase.ts:16`).
- Neither the PRD, roadmap nor lessons constrain error handling or client-side storage of user input (subagent search of `context/**`, scope below).

## Detailed Findings

### Current signup error path

- `signup.ts` reads `email` and `password` with `as string` casts, with no try/catch. Missing config redirects to `/auth/signup?error=` + the literal `"Supabase is not configured"`; a Supabase error redirects with `error.message` (`src/pages/api/auth/signup.ts:5-17`). Success redirects to `/auth/confirm-email` (line 19).
- `signup.astro:7` reads `?error=` raw and passes it to `<SignUpForm serverError={error} client:load />` (line 17). Sign-in uses `resolveSignInError(...)` at `signin.astro:8`.
- `ServerError` renders whatever string it receives inside a destructive `Alert`, and renders nothing for an empty string or null (`src/components/auth/ServerError.tsx:8-15`). React escapes the text, so this is text spoofing, not XSS (matches `context/archive/2026-09-25-ui-styles-audit/reviews/impl-review.md:38-55`, F2).
- The existing sign-in pattern to copy: `SignInErrorCode` union, a `Record<Code, string>` of messages, `toSignInErrorCode(error: {code?: string})` with a `switch`, and `resolveSignInError(param)` guarded by `Object.hasOwn` (`src/lib/auth-errors.ts:1-29`). `signin.ts` wraps the whole handler in try/catch and redirects to `?error=unknown` (`src/pages/api/auth/signin.ts:5-27`).
- Client-side validation in `SignUpForm.validate()` checks: email not empty and matching `^[^\s@]+@[^\s@]+\.[^\s@]+$`; password not empty and at least `MIN_PASSWORD_LENGTH = 6` characters; confirmation not empty and equal (`SignUpForm.tsx:9,24-49`). There is no maximum length check.

### What local Supabase returns from `signUp`

Method: a throwaway Node script (not committed) called `supabase.auth.signUp` from `@supabase/supabase-js` 2.116.0 with `persistSession: false`, against the local instance in `.env` (`SUPABASE_URL` points at localhost). 13 probes in total, two runs. Test users `probe-*@example.com` and `probe-d-*@nodomain.invalid` were created in the local database.

| Case (inputs) | Result |
| --- | --- |
| new valid email + password | success: user and session returned, `email_confirmed_at` set |
| same email again | `AuthApiError` 422 `user_already_exists`, "User already registered" |
| same email in upper case | same as above |
| same email, different password | same as above |
| password `"12345"` (5 chars) | `AuthWeakPasswordError` 422 `weak_password`, "Password should be at least 6 characters." |
| empty password `""` | 400 `validation_failed`, "Signup requires a valid password" |
| `null` password | 400 `validation_failed`, same message |
| email `"not-an-email"` | 400 `validation_failed`, "Unable to validate email address: invalid format" |
| email padded with spaces | 400 `validation_failed`, same message |
| empty email `""` | 422 `anonymous_provider_disabled`, "Anonymous sign-ins are disabled" |
| `null` email | 422 `anonymous_provider_disabled`, same message |
| 73-character password | 400 `validation_failed`, "Password cannot be longer than 72 characters" |
| `user@nodomain.invalid` | success (no error) |

Consequences for a mapping, for these local probes only:

- `validation_failed` covers three different causes (bad password, bad email format, password over 72 characters); only the message text differs. A code-only mapping cannot tell them apart.
- A 73-character password passes client validation (no max check in `validate()`, `SignUpForm.tsx:24-49`) and reaches Supabase, so `validation_failed` is reachable from the UI.
- Empty or missing email yields `anonymous_provider_disabled`. The UI blocks empty email (`SignUpForm.tsx:27-31`), so it is reachable only by posting to the API directly.
- `weak_password` at 5 characters agrees with the client minimum (`SignUpForm.tsx:9`) because `minimum_password_length = 6` (`supabase/config.toml:175`); `password_requirements = ""` (line 178) adds no other rule locally.

Not probed, only listed in the SDK: `over_request_rate_limit`, `over_email_send_rate_limit`, `email_address_invalid`, `email_address_not_authorized`, `signup_disabled`, `email_exists` (all in `error-codes.d.ts`). Sign-in already maps `over_request_rate_limit` (`auth-errors.ts:17-18`). Local limits: `sign_in_sign_ups = 30` per 5 minutes per IP and `email_sent = 2` (`supabase/config.toml:182,190`); I did not trigger either, because that would throttle the shared dev instance.

### Confirmation setting changes what "already registered" looks like

- Local config: `[auth.email] enable_confirmations = false` (`supabase/config.toml:209`). The README says Supabase requires confirmation by default and explains how to turn it off (`README.md:130-139`).
- SDK doc comment: with confirmations enabled, an existing confirmed user gets an obfuscated user object rather than an error (`GoTrueClient.js:573-577`; the comment names both email and phone confirmation).
- So `user_already_exists` may never be returned in a project that has confirmations on, and the app would redirect to `/auth/confirm-email` (`signup.ts:19`). This is derived from the doc comment, not observed.
- The CI smoke job starts local Supabase (`.github/workflows/ci.yml:41`) and runs `npm run smoke` against a production preview (lines 49-53). I did not verify that the CLI reads `supabase/config.toml` there; that is the expected behaviour, so a smoke assertion on a duplicate signup would depend on `enable_confirmations = false`.

### Where the email is lost

- Both forms are native `<form method="POST">` with `noValidate`, no fetch (`SignInForm.tsx:49`, `SignUpForm.tsx:72`).
- The email is `useState("")` (`SignInForm.tsx:14`, `SignUpForm.tsx:16`) passed to `FormField`; the input's `name` defaults to its `id`, so it posts as `email` (`FormField.tsx:47`).
- The server redirect makes a full page load, so state is empty afterwards. Only `?error=` survives (`signin.ts:13,18,26`, `signup.ts:11,16`). Charges C3 point 3 recorded the same (`context/archive/2026-09-25-ui-styles-audit/charges.md:29`).
- Persistence in `src/` (excluding `src/components/ui/`), searched with `sessionStorage|localStorage|document\.cookie|useEffect|cookies\.(set|get|delete)`: hits are only `src/lib/supabase.ts:16` (Supabase cookie writer) and the two effects in `src/components/hooks/useFormSubmitting.ts:13,23`. No form-value persistence and no on-mount effect exist.
- Three mechanisms are open, none implemented or tried:
  1. **Query param**: the email would appear in the URL, browser history and any access log. Not tried.
  2. **`sessionStorage`** written in `handleSubmit`, read after remount. `client:load` islands are rendered on the server first (Astro's default, standard behaviour, not re-verified in this repo), so reading in a lazy `useState` initialiser risks a hydration mismatch; a `useEffect` avoids that but shows the empty field for one paint. The archived `ui-styles-audit` hit a related hydration constraint with dynamic imports (`src/pages/dev/signin-kitchen-sink.astro` comment).
  3. **Short-lived cookie** set by the API route on the error redirect and read by the `.astro` page, passed as a prop to the form. No storage in JS and no flash. The API route already has `context.cookies`, and `src/lib/supabase.ts:16` writes cookies the same way. Whether `Astro.cookies.get/delete` behave as needed in this Cloudflare setup was not tested.
- Earlier in this conversation I suggested `sessionStorage` before this investigation; the SSR consideration in (2) and option (3) were not weighed then.

### Consumers and gates

- `serverError` is consumed by `SignUpForm.tsx:12,15,133` and `SignInForm.tsx:10,13,86`; `signup.astro:17` is the only place a raw value is passed (subagent report, anchors re-checked by grep).
- The dev kitchen sink renders only the sign-in states; `SignInStates.tsx` and `signin-kitchen-sink.astro` contain no reference to `SignUpForm` or `signup` (grep, empty result). No visual gate exists for signup error states.
- `scripts/smoke.mjs` has 11 steps; the signup steps are the success path only (`smoke.mjs:42-46`) and the signed-in redirect (`:59`). There are no signup failure assertions. Signup posts only `{email, password}` (`:44`).
- Test tooling: `package.json` scripts are dev, build, preview, astro, lint, lint:fix, format, smoke; no playwright or vitest config (subagent report, scope: repo root and `package.json`). `CLAUDE.md` states "No test runner beyond `npm run smoke` plus lint/build."
- Docs that mention the smoke test: `README.md:58,190-200`.

## Code References

- `src/pages/api/auth/signup.ts:5-19` - handler, raw `error.message` redirect, no try/catch
- `src/pages/auth/signup.astro:7,17` - raw `?error=` passed to the form
- `src/lib/auth-errors.ts:1-29` - sign-in code union, messages, `toSignInErrorCode`, `resolveSignInError`
- `src/pages/api/auth/signin.ts:5-27` - try/catch pattern with `?error=unknown`
- `src/components/auth/ServerError.tsx:8-15` - renders any string in an Alert
- `src/components/auth/SignUpForm.tsx:9,16,24-49,72,133` - min length, email state, validation, native POST, error slot
- `src/components/auth/SignInForm.tsx:14,49,86` - same for sign-in
- `src/components/auth/FormField.tsx:47` - `name={name ?? id}`
- `scripts/smoke.mjs:42-46,59` - signup steps
- `supabase/config.toml:175,182,190,209` - min password length, email rate limit, sign-in/up rate limit, confirmations off
- `node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts` - SDK `ErrorCode` union
- `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:573-577,732` - duplicate-signup doc comment, `signUp` implementation
- `.github/workflows/ci.yml:41,49-53` - local Supabase and smoke in CI

## Architecture Insights

- Auth error handling follows one shape: server maps SDK error to a closed code union, redirects with `?error=<code>`, the page resolves the code to a message and unknown values render nothing. Signup is the only flow outside it.
- Redirect-after-POST with no client fetch means anything the user typed must cross a full page reload through the URL, a cookie or browser storage. The repo has no precedent for the last two on form values.
- The auth behaviour depends on a Supabase project setting (`enable_confirmations`) that the app does not read, so signup outcomes differ between local/CI and a confirmations-on project.

## Historical Context (from prior changes)

Per-claim verdicts (subagent search of `context/**` plus my re-check of the four lines cited):

- `context/archive/2026-09-25-ui-styles-audit/plan.md:35` - "not mapping `?error=` on signup / not changing `signup.ts`": a recorded deferral. Supported.
- `plan.md:36` - "not keeping the email after a failed sign-in (needs a decision on where to store it)": a recorded deferral; the storage decision is still open. Supported.
- `reviews/impl-review.md:38-55` (F2) - signup reflects free text; Fix A (keep deferred) chosen; the review noted signup error codes and the already-registered case had not been researched (line 52). This research covers the local part of that gap.
- `follow-ups/review-fixes.md:5` - queued the F2 work with the instruction to research codes first.
- `reviews/impl-review.md:24` - the review checked user enumeration through `email_not_confirmed` on sign-in. This is a review check, not a stated policy.
- `context/foundation/lessons.md` has one entry (English commit messages). `prd.md`, `roadmap.md`, `shape-notes.md` have no constraint on auth error text, client storage of user input, email in URLs or logs, or enumeration (subagent scope: `context/**`, case-insensitive terms `email|?error|error code|enumerat|sessionStorage|localStorage|prefill|retain|defaultValue|privacy|PII`; `group-*` archive folders were not opened, zero grep hits).

## Related Research

- `context/archive/2026-09-25-ui-styles-audit/research.md` - not opened for this change; its plan/charges/review were read instead.

## Open Questions

Decisions for the plan (not answered by evidence):

1. **Duplicate email message.** Show "already registered" (reveals account existence, but the API already does so locally) or a generic message. Sign-in avoids revealing which field was wrong (`invalid_credentials`).
2. **Code set and validation split.** `validation_failed` merges three causes; either accept one generic "check your details" message, or add a client max-length check for 72 characters so it is not reachable from the UI.
3. **Email retention scope and mechanism.** Sign-in only or both forms; query param, `sessionStorage` or cookie.
4. **Smoke coverage.** Whether to assert a duplicate signup, knowing it relies on `enable_confirmations = false`.

Evidence gaps (why `status: partial`):

- Behaviour of `signUp` in a project with confirmations on (hosted Supabase) is from an SDK comment, not tested.
- Rate-limit codes on `signUp`, `email_address_invalid` and `email_address_not_authorized` were not reproduced.
- `Astro.cookies` read/delete behaviour under the Cloudflare adapter for option (3) was not tested.
- `context/archive/2026-09-25-ui-styles-audit/research.md` was not read.
