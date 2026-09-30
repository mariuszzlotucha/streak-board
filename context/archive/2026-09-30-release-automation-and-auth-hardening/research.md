---
date: 2026-09-30
researcher: Claude (Sonnet 5.5)
git_commit: 726e3c0dd505399aec853a9e292773d59d704a08
branch: s-05/release-automation-and-auth-hardening/plan
repository: 10xDevs (streak-board)
topic: "Release automation and auth hardening (roadmap S-05): current state of the release path and the sign-up confirmation flow"
tags: [research, codebase, release, ci, workers-builds, supabase-auth, smtp, auth-callback]
status: partial
last_updated: 2026-09-30
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Release automation and auth hardening (S-05)

**Date**: 2026-09-30
**Git Commit**: 726e3c0dd505399aec853a9e292773d59d704a08
**Branch**: s-05/release-automation-and-auth-hardening/plan

## Research Question

What exists today for (1) the migrate-then-deploy release path and (2) sign-up email confirmation, and what would S-05's scope (`context/foundation/roadmap.md:129-153`) touch? Findings feed `/10x-plan`; no design decisions are made here.

## Summary

- **Release path (this inspected repo state):** `.github/workflows/ci.yml` is the only workflow and has three jobs (`ci`, `smoke`, `integration`) triggered on push/PR to `master`; none deploys or migrates. Migrations are run by hand (`supabase db push`). Workers Builds deploys `master` automatically, but this is recorded only in `deployment-plan.md:123`, not in any repo config, so code can reach production before its migration.
- **Auth path:** there is no `/auth/callback` route, no `emailRedirectTo` in `signup.ts`, no `flowType` option (so the `@supabase/ssr` default, PKCE, applies) and no `otp_expired` handling in `src` (grep of `otp_expired`, `flowType`, `token_hash`, `emailRedirectTo` found none). Locally `enable_confirmations = false` (`supabase/config.toml:209`), so no test exercises the confirmation link.
- **Docs:** at least seven places say deploys are manual and need reconciling (list under Detailed Findings).
- **Not answerable from the repo (gaps):** Workers Builds connection state, GitHub secrets and `production` environment, exact "master protection" ruleset, hosted Supabase Site URL/SMTP settings, whether Actions runners can reach the hosted database. See Open Questions.

## Detailed Findings

### CI and release path

- Workflow triggers: push and pull_request on `master` (`.github/workflows/ci.yml:3-7`). Jobs: `ci` (lint, `astro check`, build using `SUPABASE_URL`/`SUPABASE_KEY` secrets, lines 9-25), `smoke` (local Supabase stack, preview, `npm run smoke`, lines 27-55), `integration` (`npm test` plus `supabase/checks/rls-scenarios.sql`, lines 57-76). No `environment:`, `workflow_dispatch` or deploy step appears in that file.
- `package.json` scripts have no deploy, migrate or db script (subagent inspection, `package.json:5-16`). `wrangler.jsonc` has no `vars` and no `account_id`.
- Three migrations exist in `supabase/migrations/` (`20260925003350`, `20260925011727`, `20260925161234`); hosted project ref `wzpgyobsomvjyfrngyuu` is recorded at `context/changes/deployment/deployment-plan.md:116`.
- Workers Builds auto-deploy of `master`: `deployment-plan.md:123`. Manual-migration decision (2026-09-25) with Actions and Branching declined "for now": `deployment-plan.md:127`. S-05 is that revisit; its options (a) Actions job before deploy with Workers Builds disabled, (b) keep Workers Builds and enforce order by hand/check, (c) Supabase Branching (Pro) are an open user decision at `roadmap.md:138`.
- Roadmap risk: ungated `db push` on production, and a window without deploys when the trigger moves from Workers Builds to Actions (`roadmap.md:152`). Test-plan risk #1 wants a pre-production gate for schema/code mismatch and warns against a gate that only checks migration files exist (`context/foundation/test-plan.md:44,64`, via subagent).
- Secrets: in use today are `SUPABASE_URL` and `SUPABASE_KEY` (CI build step and Worker secrets, `deployment-plan.md:61`). A release job under option (a) would additionally need `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN` (and likely `CLOUDFLARE_ACCOUNT_ID`); grep of the workflows finds none of them today.
- Constraint from an earlier phase: any deploy path must keep `wrangler kv namespace list` at `[]` (`deployment-plan.md:20-46`, `session: false`).
- The `integration` check is the required status check on `master` (`context/foundation/lessons.md`, "Archive through a PR" entry); the ruleset itself is not in the repo.

### Wording that says deploys are manual (to reconcile)

- `README.md:182` (Deployment intro: "deliberate, manual action — there is no CI job that deploys"), plus the manual steps that follow and the manual `db push` mention near `README.md:133`; CI section at `README.md:236-240` says "three jobs" (subagent anchors).
- `deployment-plan.md:11` (manual only, Actions out of scope), `:127`, `:133` (unchecked reconcile follow-up), `:144` ("explicitly excluded").
- `roadmap.md:60` (Baseline "deploy pozostaje manualny"); S-05 task list at `roadmap.md:150` already names these fixes.
- `context/foundation/lessons.md` entries "Close every slice with a production deploy…" and "After every slice lands, show the production deploy…" define the manual chain (`git checkout master && … db push && npm run build && npx wrangler deploy`); automation would change them.
- `context/foundation/infrastructure.md:82` says routine `wrangler deploy` may run unattended from CI; the file is deliberately left as research output (`deployment-plan.md:110`).
- `CLAUDE.md` only points to README for deploy docs (no wording change, subagent read).

### Sign-up confirmation flow

- `src/lib/supabase.ts:10-21` calls `createServerClient` with only cookie `getAll`/`setAll`; no `flowType`. With `@supabase/ssr ^0.12.7` (`package.json:24`) the default is PKCE, so a callback would receive `?code=` and call `exchangeCodeForSession`. The code-verifier cookie is written during `signUp` (`src/pages/api/auth/signup.ts:17`), so confirmation must happen in the same browser.
- `signup.ts:17` calls `signUp({ email, password })` with no `emailRedirectTo`; success redirects to `/auth/confirm-email` (`signup.ts:24`). Supabase therefore falls back to the project Site URL.
- No site-URL env var exists: the env schema in `astro.config.mjs:20-25` has only `SUPABASE_URL`/`SUPABASE_KEY`; there is no `site:` or `security.checkOrigin` key. A request-origin or a new optional env var are the two sources for `emailRedirectTo`; that choice is not made.
- `supabase/config.toml`: `site_url = "http://127.0.0.1:3000"` (`:154`), `additional_redirect_urls = ["https://127.0.0.1:3000"]` (`:156`), `[auth.rate_limit] email_sent = 2` (`:182`, single occurrence), `enable_confirmations = false` (`:209`), `otp_expiry = 3600` (`:217`). These are local-stack settings and are not pushed by `db push` (`deployment-plan.md:124`). `smoke.mjs:6` defaults `BASE_URL` to `http://localhost:4321`, so the local `site_url` port (3000) does not match the dev/preview port.
- Middleware: `PROTECTED_ROUTES = ["/dashboard", "/api/groups"]` and `AUTH_ROUTES = ["/auth/signin","/auth/signup"]` (`src/middleware.ts:4-5`); `/auth/callback` is in neither, so it would be public without changes. Astro's default Origin check does not apply to a GET.
- Errors: `src/lib/auth-errors.ts` whitelists `?error=` values (`resolveSignInError` `:26`, `resolveSignUpError` `:69`); no code exists for an expired link or failed exchange. The archived signup-error-codes plan notes `otp_expired` arrives on the landing page as `?error_code=`, was not mapped, and requires whitelist plus smoke coverage for any new code (`context/archive/2026-09-25-signup-error-codes/plan.md:19,22,74`).
- Invite flow: `/join/<code>` stores a `join_code` cookie (`path: "/"`) and redirects to `/dashboard`; no `?next=` mechanism exists (`context/archive/2026-09-25-group-create-join-manage/plan.md:28-29,35`). A callback redirecting to `/dashboard` lets a pending join card be consumed as after sign-in; the invite link is re-openable if the cookie is lost (`:49`).
- Built-in SMTP rate limit (`over_email_send_rate_limit`) and single-use links: `deployment-plan.md:125-126`. Custom SMTP is not configured; provider and sender domain are undecided (`roadmap.md:139`).

### Testing constraints

- Local stack `enable_confirmations = false` means smoke and integration never send or read confirmation mail; the CI stack excludes mailpit (`ci.yml:41,70`). `tests/helpers/supabase.ts:38` creates users with `email_confirm: true`. Test global setup refuses non-local hosts, so tests must not target production (archived testing plan `:74-76`, via subagent).
- Test-plan risk #5 (sign-up → confirm → `/dashboard` on production) points to integration on error mapping plus a manual production smoke, and warns against E2E on real mail (`test-plan.md:68`).

## Code References

- `.github/workflows/ci.yml:3-76` - only workflow; ci/smoke/integration, no deploy
- `src/lib/supabase.ts:10-21` - SSR client, cookie handlers, no flowType
- `src/pages/api/auth/signup.ts:17,24` - `signUp` without `emailRedirectTo`; redirect to confirm-email
- `src/middleware.ts:4-5` - protected/auth route lists
- `src/lib/auth-errors.ts:26,69` - error-code whitelists
- `astro.config.mjs:20-25` - env schema (no site URL)
- `supabase/config.toml:154,156,182,209,217` - local auth settings
- `context/changes/deployment/deployment-plan.md:116-133` - production release, discovered issues

## Architecture Insights

- Production auth settings (Site URL, Redirect URLs, SMTP) live in the hosted Dashboard and are not code- or `db push`-managed; anything S-05 does about them is documentation plus dashboard steps unless the plan adds a management-API step.
- The `?error=` whitelist pattern is the established way to surface auth failures; new callback failure codes should follow it and be added to smoke.
- Two independent deploy triggers (Workers Builds and any new Actions job) would race; the plan must pick one owner.

## Historical Context (from prior changes)

- `context/changes/deployment/deployment-plan.md:123-133` - discovered issues that seed S-05; follow-ups still unchecked.
- `context/archive/2026-09-25-signup-error-codes/plan.md:74` - error-code mapping (partially superseded: `otp_expired` still unmapped, supported).
- `context/archive/2026-09-25-group-create-join-manage/plan.md:28-49` - join cookie flow, supported for the callback redirect target.
- `context/archive/2026-09-30-testing-runner-data-isolation-and-permissions/plan.md:14,74-76,277` - CI layout and local-only test guard.

## Related Research

None found for this topic in `context/changes/**/research.md` or `context/archive/**/research.md` (subagent grep; not exhaustively read).

## Open Questions

User decisions (for `/10x-plan`):
1. Release ordering: option (a), (b) or (c) from `roadmap.md:138`; gate design (GitHub `production` environment with required reviewers) and whether Workers Builds is disabled.
2. SMTP provider and sender domain (`roadmap.md:139`).
3. Source of the `emailRedirectTo` origin (request origin vs new env var).
4. Whether and how to test the confirmation flow (enable confirmations plus mailpit in CI, or manual production smoke only).

Evidence gaps (not visible in the repo; the user must confirm in dashboards):
- Whether Workers Builds is still connected, its build settings, and how it is disabled.
- Existing GitHub repo secrets and `production` environment; exact "master protection" ruleset and whether a new deploy check must be required.
- Cloudflare API token scope and account ID handling; Supabase DB password availability; whether Actions runners can reach the hosted database (direct IPv6 vs pooler).
- Hosted Supabase Site URL, Redirect URLs and SMTP state.
- Not read in full by subagents: `README.md` beyond quoted lines, review documents, `src/middleware.ts` Origin logic beyond route lists.
