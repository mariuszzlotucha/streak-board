# Release Automation and Auth Hardening Implementation Plan

## Overview

Roadmap slice S-05 (`context/foundation/roadmap.md:129-153`). Two goals: (1) make "migrate, then deploy" to production an automated, gated GitHub Actions release so schema always lands before the code that needs it; (2) make production sign-up reliable: custom SMTP, `emailRedirectTo` plus an `/auth/callback` route that turns the confirmation link into a signed-in session, and documentation that matches how we really deploy.

## Current State Analysis

- `.github/workflows/ci.yml` has three jobs (`ci`, `smoke`, `integration`) on push/PR to `master`; nothing deploys or migrates (`ci.yml:3-76`). Workers Builds deploys `master` on every push, known only from `context/changes/deployment/deployment-plan.md:123`. Migrations are pushed by hand (`deployment-plan.md:127`).
- No `/auth/callback`, no `emailRedirectTo`, no `flowType` (PKCE default), no `otp_expired`/expired-link handling (`src/lib/supabase.ts:10-21`, `src/pages/api/auth/signup.ts:17`). The PKCE verifier cookie is set during `signUp`, so the link works only in the browser that registered.
- `/auth/callback` is already public: `PROTECTED_ROUTES` and `AUTH_ROUTES` do not list it (`src/middleware.ts:4-5`). `?error=` values are whitelisted with `Object.hasOwn` (`src/lib/auth-errors.ts:26,69`).
- Locally `enable_confirmations = false` (`supabase/config.toml:209`), so no test sends or follows a confirmation link. Site URL, Redirect URLs and SMTP for the hosted project live only in the Supabase Dashboard.
- Docs claiming "manual only": `README.md:182` and the CI section `README.md:236-240`; `deployment-plan.md:11,127,133,144`; `roadmap.md:60`; two production-release entries in `context/foundation/lessons.md`.

## Desired End State

- A merge to `master` runs CI; after all CI jobs pass, a `release` job waits for approval in the GitHub `production` environment, then runs `supabase db push` and only afterwards builds and runs `wrangler deploy`, then checks the live URL. Workers Builds is disabled, so this is the single deploy path.
- A new user signing up on production receives the confirmation e-mail from the project's own domain (Resend SMTP), clicks the link and lands on `/dashboard` signed in. A reused or foreign-browser link lands on `/auth/signin` with an explicit "link expired or already used" message.
- README, deployment plan, roadmap and lessons describe the automated flow, the required secrets, and the Site URL / Redirect URLs / SMTP production settings.

### Key Discoveries:

- Release job placed inside `ci.yml` with `needs: [ci, smoke, integration]` releases exactly the commit that CI tested (a `workflow_run` trigger would check out the default-branch head instead).
- `integration` is the required status check on `master` (`lessons.md`, "Archive through a PR"); a release job that is skipped on PRs does not affect it.
- Supabase silently falls back to Site URL if `emailRedirectTo` is not in the Redirect URLs allow-list, so the allow-list `https://<prod>/**` must stay complete (`deployment-plan.md:124`).
- The `?error=` whitelist pattern must be reused for the new code; arbitrary text is never reflected (`auth-errors.ts:26`, smoke covers it at `scripts/smoke.mjs:150-160`).
- Invite flow: `/join/<code>` keeps a `join_code` cookie and there is no `?next=`; the callback redirects to `/dashboard` so a pending join is consumed like after sign-in (`context/archive/2026-09-25-group-create-join-manage/plan.md:28-35`).

## What We're NOT Doing

- Supabase Branching (Pro) and keeping Workers Builds with manual ordering: rejected in the planning interview.
- Enabling confirmations plus mailpit in the CI smoke job: link handling is covered by tests around the route and by a manual production check.
- OAuth/passwordless login, a `?next=` return-to mechanism, custom domain binding, staging environment.
- Editing `context/foundation/infrastructure.md` (research output, left as-is per `deployment-plan.md:110`).
- Aligning the local `site_url` port (3000) in `supabase/config.toml` with the dev port; irrelevant while local confirmations are off.
- Automated down-migrations. A failed release after `db push` is handled by `wrangler rollback` for code; migrations must be backward compatible (documented in Phase 3).

## Implementation Approach

Code first (independent of infrastructure), then the release workflow, then documentation, and last the production cutover, which needs manual dashboard work. The GitHub `production` environment and its secrets are created before the Phase 2 merge so the gate exists before the job. Cutover order protects production from a deploy gap: the Actions release must succeed once (while Workers Builds is still on) before Workers Builds is switched off. This change ships no migrations, so the transitional race between the two deployers is harmless.

## Phase 1: Email confirmation callback

### Overview

Make the confirmation link produce a signed-in session and give failures a clear message.

### Changes Required:

#### 1. Sign-up redirect target

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Tell Supabase where to send the user after the confirmation link, so they do not land on the Site URL root unauthenticated.

**Contract**: `signUp({ email, password, options: { emailRedirectTo: <request origin> + "/auth/callback" } })`, origin from `new URL(context.request.url).origin`. No new env var. The success redirect to `/auth/confirm-email` and all error paths are unchanged.

#### 2. Callback route

**File**: `src/pages/auth/callback.ts` (new)

**Intent**: Exchange the PKCE `code` for a session and continue to the app.

**Contract**: `export const prerender = false`; `GET` only. With a Supabase client from `createClient(request.headers, cookies)`: if the client is `null`, redirect `/auth/signin?error=not_configured`; if `code` is missing, or an `error`/`error_code` query param is present, or `exchangeCodeForSession(code)` returns an error or throws, redirect `/auth/signin?error=link_expired` (log server-side with the existing `console.error` + eslint-disable pattern from `signup.ts`); on success redirect `/dashboard`. Errors delivered in the URL hash never reach the server and fall into the missing-`code` branch.

#### 3. Error code and message

**File**: `src/lib/auth-errors.ts`

**Intent**: Add the expired-link failure to the sign-in whitelist so the message is shown without reflecting URL text.

**Contract**: extend `SignInErrorCode` with `"link_expired"`; message "This confirmation link has expired or was already used. If your email is confirmed, sign in." in `SIGN_IN_ERROR_MESSAGES`. `toSignInErrorCode` is unchanged (the code is set by the callback, not mapped from a Supabase error).

#### 4. Tests

**Files**: `tests/integration/auth-callback.test.ts` (new), `scripts/smoke.mjs`

**Intent**: Lock the redirect contract and the whitelist. Per the smoke lesson each step asserts its outcome, not just absence of errors.

**Contract**: Vitest test calls the route's `GET` with a stub context and `vi.mock("@/lib/supabase")`: no code → `/auth/signin?error=link_expired`; `error_code=otp_expired` → same; exchange error → same; exchange success → `/dashboard`; null client → `not_configured`. Smoke adds: `GET /auth/callback` (no code) answers 302 with `location` `/auth/signin?error=link_expired`; `GET /auth/signin?error=link_expired` renders 200 and contains the fixed message. `GET /auth/callback` must not trip the foreign-Origin 403 check (GET is exempt).

### Success Criteria:

#### Automated Verification:

- Lint and types pass: `npm run lint && npx astro check`
- Build passes: `npm run build`
- Integration tests including the callback test pass (local Supabase running): `npm test`
- Smoke passes with the new callback steps: `npm run smoke` against the built preview (CI `smoke` job)

#### Manual Verification:

- Opening `/auth/callback` in a browser without a code lands on `/auth/signin` showing the expired-link message.
- Local sign-up still redirects to `/auth/confirm-email` and works as before (no regression from `emailRedirectTo`).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding. Progress checkboxes live in `## Progress`.

---

## Phase 2: Release workflow

### Overview

Add the gated release job so schema and code ship together in the right order.

### Changes Required:

#### 1. Release job

**File**: `.github/workflows/ci.yml`

**Intent**: After all CI jobs pass on a push to `master`, apply pending migrations to the hosted project and only then deploy the Worker.

**Contract**: new job `release` with `needs: [ci, smoke, integration]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/master'`, `environment: production` (required reviewer = approval gate), `concurrency: { group: release, cancel-in-progress: false }`. Steps in order: checkout, setup-node 22 with npm cache, `supabase/setup-cli`, `npm ci`, `supabase link --project-ref ${{ vars.SUPABASE_PROJECT_REF }}`, `supabase migration list`, `supabase db push --yes` (the gate is the environment approval, not the CLI prompt), `npm run build`, `npx wrangler deploy`, then an outcome check that fails the job unless `${{ vars.PRODUCTION_URL }}/` answers exactly 200 and `/dashboard` answers exactly 302 with a `location` ending in `/auth/signin` (compare `curl -w '%{http_code}'` output; plain `curl -f` would pass on a wrong 200). Environment secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY` (build-time). Nothing in `ci`/`smoke`/`integration` changes; the release job is skipped on pull requests.

#### 2. Production environment (manual prerequisite, before merging this phase)

**Intent**: The approval gate must exist before the job does: a job that references a missing `production` environment makes GitHub create it without protection rules, so the first run on `master` would go ahead unapproved.

**Contract**: the user creates environment `production` with the owner as required reviewer and adds the secrets and variables listed above (`SUPABASE_PROJECT_REF=wzpgyobsomvjyfrngyuu`, `PRODUCTION_URL=https://10x-astro-starter.mariusz-zlotucha.workers.dev` as variables). Credentialed values are entered by the user in the GitHub UI, never through chat. Check with `gh api repos/mariuszzlotucha/streak-board/environments/production` (shows the required-reviewer rule). Only then merge this phase's PR; that merge starts the first real `release` run.

### Success Criteria:

#### Automated Verification:

- Workflow lints: `actionlint .github/workflows/ci.yml` (or a YAML parse if `actionlint` is unavailable)
- The four privileged secret names appear only inside the `release` job: `grep -n "SUPABASE_ACCESS_TOKEN\|SUPABASE_DB_PASSWORD\|CLOUDFLARE_API_TOKEN\|CLOUDFLARE_ACCOUNT_ID" .github/workflows/ci.yml` matches only lines within that job's line range
- On the phase PR, `ci`, `smoke` and `integration` are green and `release` does not run

#### Manual Verification:

- Reviewer confirms the step order (link, migration list, db push, build, deploy, post-deploy check) and that `environment: production` is set on the job.
- The `production` environment exists with a required reviewer and all secrets/variables before this phase's PR is merged.

**Implementation Note**: The job's first real run is the `master` push that merges this phase, so the environment prerequisite above must be done first. Workers Builds is still on at that point and may deploy the same commit concurrently; harmless because this change ships no migrations.

---

## Phase 3: Documentation and lessons

### Overview

Make the docs and rules tell the truth about the new flow and record production settings that live only in dashboards.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Replace "deploys are manual" with the Actions release flow.

**Contract**: rewrite the Deployment intro (`README.md:182`) and manual steps; the runbook tells the approver to check `supabase/migrations/` in the merge commit before approving (approval comes before the job shows `migration list`), and that a failed release is fixed by re-running the failed jobs because `db push` is idempotent; add a "Release" description (approval, order db push then deploy, Workers Builds disabled), the required GitHub environment secrets/variables, backward-compatible-migration rule and rollback (`wrangler rollback` for code); CI section (`:236-240`) becomes four jobs; add a "Production auth settings" subsection: Site URL, Redirect URLs `https://<prod>/**`, custom SMTP (Resend), and why `config.toml` does not cover them.

#### 2. Deployment plan and roadmap

**Files**: `context/changes/deployment/deployment-plan.md`, `context/foundation/roadmap.md`

**Intent**: Remove statements that contradict the new flow.

**Contract**: deployment-plan intro (`:11`) and "Out of scope" (`:144`) reflect Actions deploys; tick the follow-ups at `:131-133` when done in Phase 4; roadmap Baseline (`:60`) no longer says "deploy pozostaje manualny". Roadmap status of S-05 is handled by the plan/implement/archive skills, not edited here.

#### 3. Lessons

**File**: `context/foundation/lessons.md`

**Intent**: The two manual "production release" lessons no longer describe the rule.

**Contract**: add a lesson (via `/10x-lesson`) for the automated release: closing a slice means merging to `master`, approving the `production` release, and checking the flow on the production URL; annotate the two existing entries ("Close every slice…", "After every slice lands…") as superseded by it. English only.

### Success Criteria:

#### Automated Verification:

- Formatting passes: `npx prettier --check README.md context/changes/deployment/deployment-plan.md context/foundation/roadmap.md context/foundation/lessons.md`
- Stale wording gone: `grep -n "three jobs" README.md` returns nothing

#### Manual Verification:

- README Deployment section matches the Phase 2 workflow (job name, secrets, order, gate) and lists the Site URL / SMTP settings.
- Deployment plan and roadmap no longer claim deploys are manual; the lessons file has the new entry and the two superseded annotations.

---

## Phase 4: Production cutover

### Overview

Configure SMTP and Site URL, confirm the first gated release, switch off Workers Builds, and verify sign-up end to end on production. Steps needing credentials are run by the user (never through chat). The GitHub environment and secrets already exist from Phase 2.

### Changes Required:

#### 1. Supabase and Resend

**Intent**: Stop depending on the built-in SMTP limit and make links target the production app.

**Contract**: verify a sender domain in Resend (SPF/DKIM DNS records), then Supabase Dashboard → Authentication → SMTP Settings with Resend SMTP credentials; confirm Site URL and Redirect URLs (`https://10x-astro-starter.mariusz-zlotucha.workers.dev/**`).

#### 2. First release and Workers Builds switch-off

**Intent**: Prove the Actions path before removing the old one.

**Contract**: the first `release` run was started by the Phase 2 merge and approved through the `production` environment created there; once it is green (and the Phase 3 docs are merged), disable Workers Builds (Worker → Settings → Builds → disconnect). Record date, result and the applied (none) migrations in `deployment-plan.md`, and tick its three follow-ups.

### Success Criteria:

#### Automated Verification:

- Production callback is live: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $PRODUCTION_URL/auth/callback` prints `302` with `/auth/signin?error=link_expired`
- Production routes: `/` and `/auth/signin` answer 200, `/dashboard` answers 302
- Migrations in sync (user runs): `npx supabase migration list` shows every local version also remote
- No stray KV namespace (user runs): `npx wrangler kv namespace list` returns `[]`

#### Manual Verification:

- The first `release` run waited for approval in the `production` environment, then went green.
- After disabling Workers Builds, a push to `master` no longer starts a Cloudflare build; only the Actions release deploys.
- A new sign-up on production delivers the confirmation e-mail from the custom domain (not the built-in sender) and no `over_email_send_rate_limit` appears on repeated sign-ups within normal use.
- Clicking the link lands on `/dashboard` signed in; clicking it a second time in a signed-out or private window lands on `/auth/signin` with the expired-link message (a signed-in browser is redirected to `/dashboard` by the middleware).
- `deployment-plan.md` records the release; the three follow-ups are ticked.

---

## Testing Strategy

### Unit Tests:

- Callback route: missing code, `error_code` param, exchange error, exchange throw, success, null client (Phase 1).
- Whitelist: `link_expired` resolves to its message; unknown values still resolve to `null`.

### Integration Tests:

- Existing Vitest and RLS suites stay green; local tests never target production (global setup refuses non-local hosts).

### Manual Testing Steps:

1. Production sign-up with a fresh e-mail: mail arrives from the own domain, link signs the user in on `/dashboard`.
2. In a signed-out or private window, open the same link again, and open a fresh link in a different browser: expired-link message on `/auth/signin`.
3. Sign up via an invite link (`/join/<code>`) and confirm: the pending join is still offered on `/dashboard` when the cookie survives, otherwise the re-open path from the group-create-join-manage plan applies.

## Performance Considerations

Release job time is dominated by CI (`needs`) plus a `db push`; acceptable for a manual-gated release. `concurrency` serialises releases so two pushes cannot interleave migrations.

## Migration Notes

No schema change in this slice. Rule for future slices: migrations must be backward compatible with the currently deployed code (schema ships before code, and code rollback does not roll the schema back). Rollback of a bad deploy: `npx wrangler rollback` (see README Rollback). If a release fails after `db push`, re-run the failed jobs; `db push` skips already-applied migrations.

## References

- Related research: `context/changes/release-automation-and-auth-hardening/research.md`
- Roadmap item: `context/foundation/roadmap.md:129-153`
- Discovered issues: `context/changes/deployment/deployment-plan.md:121-133`
- Whitelist pattern: `src/lib/auth-errors.ts:26`; smoke steps: `scripts/smoke.mjs:147-183`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Email confirmation callback

#### Automated

- [ ] 1.1 Lint and types pass: `npm run lint && npx astro check`
- [ ] 1.2 Build passes: `npm run build`
- [ ] 1.3 Integration tests including the callback test pass (local Supabase running): `npm test`
- [ ] 1.4 Smoke passes with the new callback steps: `npm run smoke` against the built preview (CI `smoke` job)

#### Manual

- [ ] 1.5 Opening `/auth/callback` in a browser without a code lands on `/auth/signin` showing the expired-link message
- [ ] 1.6 Local sign-up still redirects to `/auth/confirm-email` and works as before

### Phase 2: Release workflow

#### Automated

- [ ] 2.1 Workflow lints: `actionlint .github/workflows/ci.yml` (or a YAML parse if `actionlint` is unavailable)
- [ ] 2.2 The four privileged secret names appear only inside the `release` job
- [ ] 2.3 On the phase PR, `ci`, `smoke` and `integration` are green and `release` does not run

#### Manual

- [ ] 2.4 Reviewer confirms the step order and that `environment: production` is set on the job
- [ ] 2.5 The `production` environment exists with a required reviewer and all secrets/variables before this phase's PR is merged

### Phase 3: Documentation and lessons

#### Automated

- [ ] 3.1 Formatting passes: `npx prettier --check` on the changed docs
- [ ] 3.2 Stale wording gone: `grep -n "three jobs" README.md` returns nothing

#### Manual

- [ ] 3.3 README Deployment section matches the Phase 2 workflow and lists the Site URL / SMTP settings
- [ ] 3.4 Deployment plan and roadmap no longer claim deploys are manual; lessons file has the new entry and the two superseded annotations

### Phase 4: Production cutover

#### Automated

- [ ] 4.1 Production callback is live: `/auth/callback` answers 302 to `/auth/signin?error=link_expired`
- [ ] 4.2 Production routes: `/` and `/auth/signin` answer 200, `/dashboard` answers 302
- [ ] 4.3 Migrations in sync (user runs): `npx supabase migration list`
- [ ] 4.4 No stray KV namespace (user runs): `npx wrangler kv namespace list` returns `[]`

#### Manual

- [ ] 4.5 The first `release` run waited for approval in the `production` environment, then went green
- [ ] 4.6 After disabling Workers Builds, a push to `master` no longer starts a Cloudflare build
- [ ] 4.7 A new production sign-up delivers the confirmation e-mail from the custom domain
- [ ] 4.8 Clicking the link lands on `/dashboard` signed in; a second click in a signed-out or private window lands on `/auth/signin` with the expired-link message
- [ ] 4.9 `deployment-plan.md` records the release and the three follow-ups are ticked
