# Release Automation and Auth Hardening — Plan Brief

> Full plan: `context/changes/release-automation-and-auth-hardening/plan.md`
> Research: `context/changes/release-automation-and-auth-hardening/research.md`

## What & Why

Production releases have no enforced order: Workers Builds deploys `master` on every push, while migrations are pushed by hand, so code can go live before its schema. Separately, production sign-up is fragile: the built-in Supabase mailer hits a low rate limit and the confirmation link leaves the user signed out. This slice (roadmap S-05) automates a gated "migrate, then deploy" release and makes sign-up confirmation work.

## Starting Point

CI has three jobs and deploys nothing. The app has no `/auth/callback` and no `emailRedirectTo`; local tests run with confirmations off, so the link flow is untested. Site URL and SMTP are Dashboard-only settings. README, deployment plan, roadmap and two lessons all say deploys are manual.

## Desired End State

Merging to `master` runs CI, then a `release` job waits for approval in the `production` environment, runs `db push`, deploys, and checks the live URL. Workers Builds is off. A new user gets the confirmation mail from the project's own domain, clicks it and lands on `/dashboard` signed in; a reused link shows a clear "expired or already used" message. Docs match reality.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Release ordering | Actions job: `db push` then `wrangler deploy`, Workers Builds disabled | One deploy owner and guaranteed schema-before-code | Plan |
| Where the job lives | Inside `ci.yml` with `needs` on all CI jobs | Releases exactly the commit CI tested | Plan |
| Gate | GitHub `production` environment with required reviewer | Guards against an unattended bad migration (roadmap risk) | Plan |
| SMTP | Resend on an own verified domain | Removes the built-in rate limit; roadmap's example | Plan |
| `emailRedirectTo` origin | Request origin + `/auth/callback` | No new env var; Supabase allow-list still applies | Plan |
| Failed/reused link | Redirect to `/auth/signin?error=link_expired` | Reuses the whitelist pattern, gives a working path | Plan |
| Testing | Unit/integration around the route + smoke on whitelist; manual production check | Matches test-plan risk #5; no mailpit in CI | Plan |
| Cutover order | Environment and secrets before the Phase 2 merge; first Actions release, then disable Workers Builds | Gate exists before the job; no period without deploys | Plan review |

## Scope

**In scope:** callback route, `emailRedirectTo`, `link_expired` code, tests; gated release job; docs and lessons rewrite; production setup (environment, secrets, SMTP, Site URL), first release, Workers Builds off.

**Out of scope:** Supabase Branching, mailpit-based CI, OAuth/passwordless, `?next=`, custom domain, staging, down-migrations, editing `infrastructure.md`.

## Architecture / Approach

Code first (independent of infrastructure), then the workflow (with its GitHub environment created first), then docs, then a manual cutover. The callback exchanges the PKCE `code` for a session and redirects to `/dashboard`; any failure goes to sign-in with `link_expired`. The release job serialises with `concurrency`, keeps privileged secrets in the environment, and asserts the outcome with `curl` after deploy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Email confirmation callback | `emailRedirectTo`, `/auth/callback`, `link_expired`, tests | Link only works in the same browser (PKCE cookie) |
| 2. Release workflow | Gated `release` job in `ci.yml`, plus the `production` environment and secrets created before its merge | Job without an existing environment would run unapproved |
| 3. Documentation and lessons | README, deployment plan, roadmap, lessons reconciled | Docs drifting from the real workflow |
| 4. Production cutover | SMTP, Site URL, Workers Builds off, prod sign-up check | Dashboard-only steps; Actions may not reach the hosted DB |

**Prerequisites:** GitHub admin access; Cloudflare API token, Supabase access token and DB password before the Phase 2 merge; a domain for Resend before Phase 4.
**Estimated effort:** ~4 sessions across 4 phases; Phase 4 is mostly manual work.

## Open Risks & Assumptions

- Assumes `supabase link` and `db push` work from a GitHub runner (direct vs pooler connection is unverified until the first run).
- Assumes Workers Builds can be disconnected in the Cloudflare dashboard.
- Allow-list must include `https://<prod>/**`, otherwise Supabase silently falls back to Site URL.
- Confirmation link works only in the registering browser; other browsers get the expired-link message.

## Success Criteria (Summary)

- A production sign-up ends signed in on `/dashboard` via a mail from the own domain.
- A release from `master` applies migrations first, then deploys, after one approval click.
- No document says deploys are manual.
