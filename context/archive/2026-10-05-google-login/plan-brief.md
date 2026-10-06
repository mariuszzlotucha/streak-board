# Google login — Plan Brief

> Full plan: `context/changes/google-login/plan.md`
> Frame brief: `context/changes/google-login/frame.md`
> Research: `context/changes/google-login/research.md`

## What & Why

A user can register and sign in with a Google account, without setting a password, next to e-mail+password (S-07, MS-06). Confirmed problem statement from the frame: Google is the right answer to the sign-up friction, but the slice is not "button + route": it is a shared callback whose error contract misleads for Google, configuration on three sides (Google, Supabase, app), and a production-only proof that CI cannot give without a Google account.

## Starting Point

The app has e-mail+password only; no `signInWithOAuth`, no Google block in `supabase/config.toml`. The e-mail confirmation callback turns every failure into "confirmation link expired", logs with raw `console.error`, and its no-code redirect is pinned in a unit test, the smoke script and the `release` check. Production auth settings (Site URL, Redirect URLs `https://streakboard.app/**`) live only in the Supabase Dashboard.

## Desired End State

On `https://streakboard.app` the sign-in and sign-up pages offer "Continue with Google". It signs the owner's existing account in (same user, same group), creates a new user for a new Google account, keeps an invite opened before sign-in, and ends cancellation, an expired attempt and a real failure on `/auth/signin` with three different messages. E-mail+password and the confirmation link work as before.

## Key Decisions Made

| Decision             | Choice                                                                                                                               | Why (1 sentence)                                                                                                                                                          | Source           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Google app status    | Testing; no privacy page in S-07 (the gate for publishing, goes to S-09)                                                             | Testing needs no home page or policy and fits the owner and friends; the exemption for openid/email/profile is untested live, so everyone is listed as a test user anyway | Plan (owner)     |
| E-mail form messages | Static Google hint in the invalid-credentials and e-mail-taken messages                                                              | A Google-only user gets the generic "invalid credentials", and the same text for every account leaks nothing                                                              | Plan (owner)     |
| Return route         | New `GET /auth/google/callback`, not a marker on `/auth/callback`                                                                    | The e-mail callback is proven on production and its three `link_expired` pins stay valid                                                                                  | Plan             |
| Start route          | `POST /api/auth/google` (GET answers 404)                                                                                            | POST is the convention and Astro's `checkOrigin` guards it                                                                                                                | Research / Plan  |
| Order                | Owner configures Google and Supabase first; code and `release` check second                                                          | A button before the provider is enabled shows raw GoTrue JSON; the new check makes the order fail loudly                                                                  | Plan             |
| Proof without Google | Smoke asserts the app side; `release` follows two hops (app to Supabase, Supabase to `accounts.google.com`)                          | A server-side `signInWithOAuth` only builds the URL, and the second hop answers only when the provider is enabled                                                         | Research / Plan  |
| Error contract       | `oauth_cancelled`, `oauth_failed`, `rate_limited`, `unknown`; reports via `log.ts`, fixed fields only                                | The callback is a public GET, so parameter-driven outcomes are info lines and no query is logged                                                                          | Research / Plan  |
| Expired flow state   | `/` redirects `error_code` `bad_oauth_state`, `bad_oauth_callback` or `flow_state_already_used` to `/auth/signin?error=oauth_failed` | Supabase sends these state failures to the Site URL root, where today nothing is shown                                                                                    | Research / Plan  |
| Account linking      | Accept Supabase's automatic linking; no "keep separate" exists                                                                       | Same verified e-mail joins the same user id; hosted "Confirm email" is read back in Phase 1                                                                               | Frame / Research |
| Local Google         | Provider not enabled locally or in CI                                                                                                | Avoids a Google-discovery dependency in CI; the real flow is proven on production                                                                                         | Plan             |

## Scope

**In scope:** Google and Supabase setup by the owner, button, start and return routes, error codes and messages, e-mail callback reporting fix, `/` redirect for an expired state, tests, smoke steps, `release` check, README, `CLAUDE.md`, roadmap notes, production proof.

**Out of scope:** privacy page and landing page (S-09), publishing the app, a Supabase custom domain, local Google, e-mail-path gaps, password reset, `supabase config push`, `prompt=select_account`, Google name or avatar.

## Architecture / Approach

The button is a plain Astro form posting to `/api/auth/google`. The route calls `signInWithOAuth` with a `redirectTo` built from the request origin and redirects to the returned Supabase URL; the PKCE verifier cookie is written by the existing `createClient`. Google returns to Supabase, Supabase to `/auth/google/callback`, which exchanges the code and redirects to `/dashboard` or to `/auth/signin?error=<code>`. `join_code` is not touched.

## Phases at a Glance

| Phase                                   | What it delivers                                                                                       | Key risk                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1. Provider setup and record            | Google client, Supabase provider, a `curl` proof, Phase 12 in `deployment-plan.md`                     | The console may demand an authorized domain for the Supabase redirect URI; the client secret is shown once |
| 2. Code, checks, docs, production proof | Routes, button, tests, smoke, `release` check, docs, then owner-run Google flows and a closing docs PR | Merging before Phase 1 fails the new `release` check; the Testing exemption is untested live               |

**Prerequisites:** S-06 done (`streakboard.app`, Supabase URLs); a Google account for the owner; friends' Gmail addresses for the test-user list.
**Estimated effort:** about 3 sessions across 2 phases; the owner's console steps take several tens of minutes.

## Open Risks & Assumptions

- The Testing-mode exemption for openid/email/profile is stated by one Google page and contradicted by others; the fallback is the test-user list.
- The consent screen shows `<project-ref>.supabase.co`; Google's brand name and logo need verification, which a shared `supabase.co` domain likely blocks.
- Hosted "Confirm email" is unrecorded; if off, a password account pre-registered for someone else's address keeps its password after that person signs in with Google (accepted for this audience).
- The `release` check depends on Google's discovery endpoint answering at release time and creates one `flow_state` row per run.
- Source read at GoTrue v2.196.0; hosted runs v2.197.0 (three reported differences, none in the error-redirect or linking logic).
- No Google credentials were available, so runtime claims are read from source and docs; the production checks are the proof.

## Success Criteria (Summary)

- The five production flows pass: existing account via Google, new Google account, invite through Google, cancel at the consent screen, e-mail+password and sign-out.
- `release` succeeds with the new Google check, and the no-code `/auth/callback` still answers 302 to `link_expired`.
- Lint, type check, build, `npm test` and `npm run smoke` pass; Phase 12 in `deployment-plan.md` records the owner-reported and verified results.
