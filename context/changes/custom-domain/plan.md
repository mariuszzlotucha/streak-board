# Custom domain Implementation Plan

## Overview

S-06 (roadmap MS-01): make `streakboard.app` the only address of the production app. This is an operational slice: no code under `src/`, no migration, no test changes. The owner attaches the domain to the Worker in the Cloudflare dashboard, moves the Supabase Site URL and Redirect URLs, points the release gate (`PRODUCTION_URL`) at the new host, and finally switches `workers.dev` off. The order guarantees that nothing in production points at an address that does not answer yet, and that `workers.dev` stays a fallback until the new host has carried a full release.

The problem statement is the one settled in `frame.md`: `streakboard.app` must be the only address that the code and its surroundings hand out, so that no link sent to another person (confirmation, invite) and no release check silently points at the old address.

## Current State Analysis

- The app answers only at `https://10x-astro-starter.mariusz-zlotucha.workers.dev` (`README.md:7`; public check on 2026-10-02: `/` 200, `/dashboard` 302 to `/auth/signin`). `wrangler.jsonc:1-14` has no `routes`, `workers_dev` or `preview_urls`. The only deploy path is `npx wrangler deploy` in the `release` job (`.github/workflows/ci.yml:122`); Workers Builds is disconnected (`context/changes/deployment/deployment-plan.md:143-150`).
- `streakboard.app` (Cloudflare Registrar and DNS): public lookups on 2026-10-02 show Cloudflare name servers, no A, AAAA, CNAME, MX or TXT record at the apex, no record for `www`, mail records for the sender subdomain under `send.mail`, and no HTTPS answer from the apex. The Custom Domain can be added without a DNS conflict.
- `PRODUCTION_URL` in the GitHub environment `production` (required reviewer) is `https://10x-astro-starter.mariusz-zlotucha.workers.dev` (read with `gh api` on 2026-10-02, last updated 2026-09-30). The post-deploy check requires `/` 200, `/dashboard` 302 to `*/auth/signin` and `/auth/callback` 302 to `*/auth/signin?error=link_expired` (`ci.yml:126-150`).
- The address is derived from the request in exactly two places: `emailRedirectTo` in `src/pages/api/auth/signup.ts:18` and the invite link in `src/pages/dashboard.astro:131`. The `join_code` and `auth_email` cookies and the Supabase session cookies have no `domain`, so they are bound to the host (`src/lib/join-code.ts:14-20`, `src/lib/auth-email.ts:15-21`). `src/pages/auth/callback.ts:6-8` works only in the browser that signed up. The code needs no change.
- The Supabase Site URL and Redirect URLs live only in the hosted project's dashboard (`README.md:252-258`); the last recorded value is the `workers.dev` address (`deployment-plan.md:132`) and the current value is not verifiable from the repository. Twice already an address that existed only in a panel broke production silently (frame, "Konwencja między systemami").
- Member e-mails are rendered in server HTML, including the React island `Leaderboard` (`src/components/tasks/Leaderboard.tsx:33`, mounted at `src/pages/dashboard.astro:335`) and the Topbar (`src/components/Topbar.astro:8`). Traffic on a custom domain passes through the zone's edge features (bot protection, e-mail obfuscation), which `workers.dev` does not; this is platform knowledge, not observed on the account, so Phases 2 and 3 check it.

## Desired End State

- `https://streakboard.app` serves the app over valid TLS: `/` 200, `/dashboard` 302 to `https://streakboard.app/auth/signin`, `/auth/callback` 302 to `.../auth/signin?error=link_expired`.
- Supabase Site URL is `https://streakboard.app` and the Redirect URLs list contains only `https://streakboard.app/**`. A sign-up on the new host delivers a confirmation link that lands signed in on `/dashboard`; the invite link on the dashboard starts with `https://streakboard.app/join/`.
- `PRODUCTION_URL` is `https://streakboard.app` and the `release` check passes against it after each deploy.
- `workers.dev` and Preview URLs are off through `workers_dev: false` and `preview_urls: false` in `wrangler.jsonc`; the generated `dist/server/wrangler.json` carries both; the old host no longer answers 200.
- `README.md` and `deployment-plan.md` describe the new address, where the address lives (Cloudflare, Supabase, GitHub variable, docs) and the ordered checklist for changing it; `deployment-plan.md` records dates and results of every step.

Verify by the Success Criteria of Phase 4 plus the per-phase checks below.

### Key Discoveries:

- `wrangler deploy` (4.131.1, pinned in `package-lock.json:16990-16993`) calls the custom-domain API only when the config declares a `custom_domain` route (`node_modules/wrangler/wrangler-dist/cli.js:153572-153580, 153683-153696`). The config declares none, so a deploy never touches a domain attached in the dashboard. This is the CLI side only; whether the platform leaves the domain attached after a script upload is observable only in practice (Phase 1 release, criterion 2.1).
- A declared `custom_domain` route is sent with `override_scope: true`, and in CI (no TTY) the CLI forces `override_existing_origin` and `override_existing_dns_record` without asking, swallows an error of the changeset request, and does not roll back partial trigger changes (`cli.js:152950-153058`, `:153971`). The Cloudflare Custom Domains page read on 2026-10-02 does not state the API token permissions needed for it. This is why the domain is attached in the dashboard and not declared in `wrangler.jsonc` (decision of this planning session).
- `workers_dev` defaults to `true` when there are no routes (`cli.js:153986-153988`) and every deploy POSTs the desired state to `/subdomain` (`cli.js:154062-154076`), so switching `workers.dev` off in the dashboard alone is undone by the next deploy. When disabling it, wrangler itself advises setting `preview_urls = false` as well (`cli.js:154028-154036`). Cloudflare's configuration docs describe the same pattern for dashboard-managed routes ("Source of truth": remove `route`/`routes` and set `workers_dev = false`).
- `wrangler deploy` reads the generated `dist/server/wrangler.json` (`.wrangler/deploy/config.json`), not `wrangler.jsonc`. The Cloudflare Vite plugin writes it by spreading the input config (`node_modules/@cloudflare/vite-plugin/dist/index.mjs:84621-84647`) and drops only the fields in `nullableNonApplicable` (`:63877-63945`), which do not include `routes` or `workers_dev`. Plugin 1.54.8 and wrangler 4.131.1 are installed in the main checkout; this worktree has no `node_modules`, so Phase 4 confirms the output with a build.
- With neither `workers.dev` nor a declared route, wrangler logs "No targets deployed for 10x-astro-starter" (`cli.js:153907-153914`); expected after Phase 4.
- Release mechanics from the lessons: merge, approve `release` in the `production` environment after checking `supabase/migrations/` in the merge commit, check the production URL, note the result in `deployment-plan.md`; a newer push supersedes an older pending release, so merge one PR at a time.

## What We're NOT Doing

- `www.streakboard.app`: no DNS record and no requirement before S-09 (landing page); decide it there.
- `site` in `astro.config.mjs` (the sitemap integration stays skipped without it).
- A redirect from `workers.dev` to the new host (needs middleware code and tests for traffic that does not exist; the frame says only the owner used the old address).
- Declaring the custom domain in `wrangler.jsonc` (`routes` with `custom_domain: true`).
- Changing the CI API token, GitHub secrets or `ci.yml`.
- Renaming the Worker `10x-astro-starter`, or changing any Worker secret.
- `supabase config push` or any Supabase auth settings in the repository (it would push the local-stack `config.toml` values, including SMTP, to production).
- Any change under `src/`, `supabase/` or `tests/`, and running `npm run smoke` against production (it needs auto-confirmed accounts and writes data).
- `context/foundation/infrastructure.md` (it holds no address; `deployment-plan.md:118`) and the baseline snapshot line in `roadmap.md` that mentions `workers.dev`.
- Keeping sessions on the old host: cookies are per host, so the owner signs in again on the new one.

## Implementation Approach

Four phases ordered by dependency, additive before subtractive: the new host goes live, then Supabase accepts it, then the release gate follows it, and only then the old host and its allow-list entry go. Every phase is checked from outside before the next one starts and ends with a small PR that adds what is known before the merge to a new "Phase 10" section of `deployment-plan.md`; the `release` that PR triggers doubles as a canary. Two platform questions are tested by two different releases on purpose, so a failure has one possible cause.

- Who does what: the owner performs the dashboard steps (Cloudflare, Supabase, GitHub UI) and approves each `release`; Claude runs the `curl` checks, the `gh api` reads, the edits and the PRs. Nothing credentialed goes through the chat. Writing the GitHub variable is the owner's step in the UI; Claude runs `gh api -X PATCH` only on explicit request (`gh` 2.4.0 has no `gh variable`).
- Branches follow the lessons: `s-06/custom-domain/phase-N`, cut from `origin/master` after `git fetch origin` (this is a linked worktree: no `git checkout master`, no `git pull`). Merge one phase PR at a time and let its `release` finish before the next one is merged.
- Worktree setup before Phase 1: this linked worktree has no `node_modules`, no `.env` or `.dev.vars`, and no Husky hooks (`.husky/_` is generated by `prepare`). Run `npm ci` once, which also installs the hooks, before the first `prettier`, lint or build command; without it `prettier --check` fails on the missing `prettier-plugin-astro`. Copy `.env` and `.dev.vars` from the main checkout before the build in Phase 4.
- `deployment-plan.md` section number: this plan says "Phase 10", the next free number at the time of writing. If a parallel slice has taken it by implementation time, use the next free one; the PR that merges second resolves the conflict.
- Post-release rows and records: a phase PR cannot contain the result of its own `release`. Rows that need that release (3.5, 4.5, 4.6, 4.8 to 4.11) are checked after the merge and ticked in the next commit that lands. The result of each phase's release is written by the next phase's PR, as criterion 2.1 already does for Phase 1: Phase 2 records Phase 1's, Phase 3 records Phase 2's, Phase 4 records Phase 3's. Phase 4's own result and the final `✅ Done` status go into one closing docs commit on the branch `s-06/custom-domain/closing`, opened as a PR after the Phase 4 checks; it carries documentation only, so its `release` can be approved or left superseded.

## Critical Implementation Details

- **State sequencing**: add before you remove and move the dependants last. In Supabase the allow-list entry goes in before the Site URL changes; `PRODUCTION_URL` changes before the Phase 3 release is approved; `workers_dev: false` ships only after a release has passed on the new host; the old Redirect URL is removed only after that release. Reversing any pair reproduces an incident the frame lists (silent fallback to the Site URL, a red `release` after a good deploy, no fallback host).
- **Timing & lifecycle**: the Phase 1 release tests whether a normal deploy leaves the dashboard-attached domain alone; the Phase 3 release tests whether the zone lets a GitHub runner's `curl` through (`workers.dev` bypassed the zone). Do not merge phases or skip the `curl` between them, or a failure cannot be attributed.
- **Debug & observability**: after Phase 4 the deploy log says "No targets deployed for 10x-astro-starter" because the domain is panel-managed and `workers.dev` is off; that is expected, not a failure. A `release` that fails with `Expected 200 from https://streakboard.app/, got 403` or `503` while `curl` from the owner's machine returns 200 points at the zone's bot protection, not at the Worker. If the Worker was last deployed from the dashboard, the deploy log may also print "The local configuration ... differs from the remote configuration ... Uploading the Worker will override the remote configuration" (`cli.js:164344-164367`); in CI without `--strict` this is a warning only and does not detach the domain, because domains are written only for a declared `custom_domain` route (`cli.js:153683`). Do not answer it by adding `routes` to `wrangler.jsonc` or `--strict` to the release step.

## Phase 1: Attach streakboard.app to the Worker (Cloudflare dashboard)

### Overview

The owner attaches the apex as a Custom Domain in the dashboard; no code or configuration in the repository changes. Nobody uses the new address yet, so `workers.dev` keeps serving real traffic. Signing up on the new host is intentionally not tested here: its callback is not on the Supabase allow-list until Phase 2.

### Changes Required:

#### 1. Pre-checks (owner, read-only)

**Intent**: confirm the binding can be created without disturbing anything else.

**Contract**: the zone `streakboard.app` and the Worker `10x-astro-starter` are in the same Cloudflare account (the zone is offered when the domain is added); Worker → Settings → Domains & Routes shows no custom domain or route (only `workers.dev` and Preview URLs); the zone's DNS tab has no A, AAAA or CNAME record for the apex (a public lookup on 2026-10-02 showed none). Dashboard labels may differ from these names.

#### 2. Add the Custom Domain (owner, Cloudflare dashboard)

**Intent**: bind the apex to the Worker; Cloudflare creates the DNS record and the certificate.

**Contract**: Workers & Pages → `10x-astro-starter` → Settings → Domains & Routes → Add → Custom domain → `streakboard.app` (the apex only, no `www`). Wait until it shows active with the certificate issued before testing. `wrangler.jsonc` gets no `routes` entry.

#### 3. Start the Phase 10 section in the deployment plan

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: the audit trail of an operational change that exists only in dashboards lives in the repository, and the phase gets a reviewable PR.

**Contract**: new section `## Phase 10 — Custom domain (change custom-domain, S-06)` placed after Phase 9 (`:174-181`) and before "Verification checklist" (`:183`), with `**Status: 🚧 In progress (started <date>)**` and bullets in the style of Phases 7 to 9: hostname, date, state of the dashboard entry, the `curl` results of this phase.

### Success Criteria:

#### Automated Verification:

- Apex answers over valid TLS: `curl -s -o /dev/null -w '%{http_code}\n' https://streakboard.app/` prints `200`
- Sign-in page answers on the new host: `curl -s -o /dev/null -w '%{http_code}\n' https://streakboard.app/auth/signin` prints `200`
- Protected route redirects on the new host: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://streakboard.app/dashboard` prints `302 https://streakboard.app/auth/signin`
- Callback guard answers on the new host: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://streakboard.app/auth/callback` prints `302 https://streakboard.app/auth/signin?error=link_expired`
- Old address unchanged: `/` prints `200` and `/dashboard` prints `302` on `https://10x-astro-starter.mariusz-zlotucha.workers.dev`
- Docs formatting passes: `npx prettier --check context/changes/deployment/deployment-plan.md`

#### Manual Verification:

- Pre-checks done: the zone and the Worker are in the same Cloudflare account, Domains & Routes shows no custom domain or route (only `workers.dev` and Preview URLs), and the zone has no apex A, AAAA or CNAME record
- The Custom Domain for the apex shows active in the dashboard with its certificate issued
- `deployment-plan.md` has the new Phase 10 section with the date and the results of 1.1 to 1.5

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan. Rollback: delete the Custom Domain in the dashboard (nobody uses it); Cloudflare does not delete the certificate automatically, which is harmless.

---

## Phase 2: Move Supabase auth to the new address and prove the user flows

### Overview

The owner edits the two Supabase URL settings additively and the phase proves, with real sign-up and invite flows on the new host, that links built from `streakboard.app` work. This is the step where a wrong value fails silently (the user is not signed in after confirming), so it is verified by behaviour, not by reading the panel. The Phase 1 PR must be merged and its `release` finished before this phase starts, which also tests that a deploy leaves the domain attached.

### Changes Required:

#### 1. Supabase Redirect URLs and Site URL (owner, Supabase Dashboard)

**Intent**: make confirmation links built from `streakboard.app` valid, then make it the default.

**Contract**: Authentication → URL Configuration. First add `https://streakboard.app/**` to Redirect URLs and keep `https://10x-astro-starter.mariusz-zlotucha.workers.dev/**`; then set Site URL to `https://streakboard.app`. Do not touch SMTP settings or e-mail templates; if a template turns out to hard-code the old host, change only that host and record it.

#### 2. Zone behaviours that `workers.dev` bypassed (owner, verify)

**Intent**: catch zone-level rewriting of the app's HTML before it reaches other users.

**Contract**: signed in as a member of a group, open the dashboard on the new host and view the page source: member e-mails must be plain text (no `data-cfemail`, no `/cdn-cgi/l/email-protection`) and the browser console must show no hydration errors. If they appear, turn off Email Address Obfuscation (and Rocket Loader) for the zone in the Cloudflare dashboard and re-check.

#### 3. README: production auth settings

**File**: `README.md` (section "Production auth settings", `:252-258`)

**Intent**: the documentation matches the panel after this phase.

**Contract**: the Site URL bullet names `https://streakboard.app`; the Redirect URLs bullet names `https://streakboard.app/**` and says the `workers.dev` entry stays only until Phase 4 switches that address off; the explanation of the silent fallback to the Site URL stays.

#### 4. Phase 10 entry

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: record what was set and what was observed.

**Contract**: append to the Phase 10 section the Phase 1 `release` run and the survival check (2.1), the Supabase values after the change, the date, and the results of the manual checks (including whether a template needed a change and whether obfuscation had to be turned off).

### Success Criteria:

#### Automated Verification:

- The Phase 1 release finished green and the domain survived the deploy: `curl -s -o /dev/null -w '%{http_code}\n' https://streakboard.app/` prints `200` after it
- Docs formatting passes: `npx prettier --check README.md context/changes/deployment/deployment-plan.md`
- README names the new Site URL: `grep -n "Site URL" README.md` prints a line containing `https://streakboard.app`

#### Manual Verification:

- Supabase URL Configuration shows Site URL `https://streakboard.app` and both Redirect URLs entries (`https://streakboard.app/**` and the `workers.dev` one)
- A fresh sign-up at `https://streakboard.app/auth/signup` in a private window delivers the confirmation e-mail from `noreply@mail.streakboard.app`, and the link carries `redirect_to=https://streakboard.app/auth/callback`
- Clicking the link in the same browser lands on `https://streakboard.app/dashboard` signed in, without `link_expired`
- The dashboard on the new host shows an invite link starting with `https://streakboard.app/join/`, and opening it as the new user joins the group
- Member e-mails are plain text in the page source (no `data-cfemail`, no `/cdn-cgi/l/email-protection`) and the browser console shows no hydration errors
- `deployment-plan.md` Phase 10 records the Phase 1 release result, the Supabase values, the date and the results of 2.4 to 2.8

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan. Rollback: set the Site URL back to `https://10x-astro-starter.mariusz-zlotucha.workers.dev` (the old Redirect URLs entry was never removed). The test users created here can be deleted in Authentication → Users at the owner's discretion.

---

## Phase 3: Point the release gate at the new address and update the docs

### Overview

`PRODUCTION_URL` moves to the new host while `workers.dev` still serves as a fallback, and the documentation describes the new address and how it is managed. The `release` of this phase's PR is the first to check the new address from a GitHub runner, which tests whether the zone's bot protection lets that `curl` through.

### Changes Required:

#### 1. `PRODUCTION_URL` (owner, GitHub)

**Intent**: make the post-deploy check hit the real address.

**Contract**: set the variable `PRODUCTION_URL` in the environment `production` to `https://streakboard.app` (no trailing slash) before this phase's `release` is approved. The owner does it in the GitHub UI (Settings → Environments → production → Environment variables); on explicit request Claude runs `gh api -X PATCH repos/mariuszzlotucha/streak-board/environments/production/variables/PRODUCTION_URL -f name=PRODUCTION_URL -f value=https://streakboard.app`. The `gh api` read in the criteria below confirms the value.

#### 2. README

**File**: `README.md`

**Intent**: one correct production address plus the operating knowledge about the domain, so the next change of address does not rediscover it.

**Contract**:

- The "Production" line (`:7`) names `https://streakboard.app` and drops the "today / will move" wording; the `PRODUCTION_URL` row (`:218`) says it is the production host.
- "Auth e-mail sender domain" (`:248-250`) drops "Until the custom domain binding is done..." and says the app is served on `https://streakboard.app`.
- New subsection "Custom domain" after "Production auth settings": the apex is attached in the Cloudflare dashboard (Worker → Settings → Domains & Routes) and deliberately not declared in `wrangler.jsonc`; with Wrangler 4.131.x a deploy touches custom domains only when the config declares a `custom_domain` route; declaring any such route makes wrangler send the declared set (with `override_scope`, and in CI forcing DNS and origin overrides), so a domain attached only in the dashboard may be replaced and `streakboard.app` must then be listed in the file too; the ordered checklist "Changing the production address": (1) the new host answers, (2) add the new Redirect URLs entry, (3) change the Site URL, (4) change `PRODUCTION_URL`, (5) update the docs, (6) verify with a real sign-up and an invite link, (7) only then remove the old Redirect URLs entry and switch the old host off.

#### 3. Deployment plan

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: record the gate switch and keep the historical sections honest.

**Contract**: append to Phase 10 the variable change (old and new value, date) and the Phase 2 `release` run and its result; annotate `:193` ("Custom domain binding — deferred") as delivered by change `custom-domain` (Phase 10), the way the GitHub Actions item below it was annotated, and mark the unchecked item at `:185` as superseded by the Phase 10 production checks; leave the historical entries (`:66-132`) as they are.

### Success Criteria:

#### Automated Verification:

- `PRODUCTION_URL` reads back as the new address: `gh api repos/mariuszzlotucha/streak-board/environments/production/variables --jq '.variables[] | select(.name=="PRODUCTION_URL") | .value'` prints `https://streakboard.app`
- README names the new production address: `grep -n '^\*\*Production:\*\*' README.md` prints a line containing `https://streakboard.app`
- No stale wording is left in the README: `grep -nE 'Until the custom domain binding|will move to it' README.md` prints nothing
- Docs formatting passes: `npx prettier --check README.md context/changes/deployment/deployment-plan.md`

#### Manual Verification:

- The `PRODUCTION_URL` change was made before the Phase 3 `release` was approved, and that run finished green with "Check the live deployment" passing against `https://streakboard.app`
- README "Custom domain" subsection explains where the domain is attached, why `wrangler.jsonc` has no `routes`, the risk of adding `custom_domain` routes, and the ordered "Changing the production address" checklist
- `deployment-plan.md` Phase 10 records the variable change and the Phase 2 release result, and `:185` and `:193` point to Phase 10

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan. Row 3.5 can only be checked after this PR is merged and released; the result of that release is recorded by the Phase 4 PR. Rollback: set `PRODUCTION_URL` back to the `workers.dev` address (still enabled) and re-run the failed job. If the check failed with 403 or 503 from the runner, the cause is the zone's bot protection: relax it or add a skip rule for the check, then repeat. Do not start Phase 4 until a `release` has passed on the new address.

---

## Phase 4: Switch workers.dev off

### Overview

After Phases 1 to 3 the new host has carried a full release, so the old host and its allow-list entry can go. The phase sets `workers_dev: false` and `preview_urls: false`, releases, removes the old Redirect URLs entry, and closes the slice with the main-flow check on the production URL and a closing docs commit.

### Changes Required:

#### 1. Wrangler configuration

**File**: `wrangler.jsonc`

**Intent**: turn `workers.dev` and Preview URLs off by configuration (a deploy would otherwise re-enable `workers.dev` by default) and leave a warning for the next editor of the file.

**Contract**: add two keys and a comment above them; the build must carry both into `dist/server/wrangler.json`, which is what the deploy reads.

```jsonc
// The custom domain streakboard.app is attached in the Cloudflare dashboard, not here (README "Custom domain").
// Declaring `routes` with `custom_domain` would make wrangler manage that set from this file.
"workers_dev": false,
"preview_urls": false,
```

#### 2. README

**File**: `README.md`

**Intent**: the documentation reflects the final state.

**Contract**: the "Custom domain" subsection says `workers.dev` and Preview URLs are off through `workers_dev: false` and `preview_urls: false`; the first-deploy paragraph about registering a `workers.dev` subdomain (`:237`) is marked as applying only while `workers_dev` is enabled; the Redirect URLs bullet drops the transitional `workers.dev` mention; the last step of the checklist is worded as done for this change.

#### 3. Supabase Redirect URLs (owner, after the release)

**Intent**: remove the stale allow-list entry only when nothing can build links on the old host any more.

**Contract**: after the Phase 4 `release` is green, remove `https://10x-astro-starter.mariusz-zlotucha.workers.dev/**` from Redirect URLs and leave the Site URL as it is; then repeat a fresh sign-up on the new host, because the allow-list has just changed.

#### 4. Records in the Phase 4 PR

**Files**: `context/changes/deployment/deployment-plan.md`, `context/foundation/roadmap.md`

**Intent**: write down what is known before the merge and resolve the roadmap's open question about `workers.dev`.

**Contract**: append to Phase 10 the Phase 3 `release` run and its result (the first check of the new host from a runner); in the S-06 block of the roadmap the Unknown about the fate of `workers.dev` (`:94-95`) gets the decision (switched off after verification, Phase 4). Roadmap statuses stay with the skills.

#### 5. Closing docs commit (after the release and the checks)

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: close the audit trail with the results that exist only after the Phase 4 `release`.

**Contract**: on the branch `s-06/custom-domain/closing`, Phase 10 status becomes `✅ Done (<date>)` with the Phase 4 release run, the final production check and the wrangler version, and the post-release Progress rows are ticked in the same commit; opened as a PR with `gh pr create`. Documentation only.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- The build output carries both flags: `npm run build && node -e "const c=JSON.parse(require('fs').readFileSync('dist/server/wrangler.json','utf8'));console.log(c.workers_dev,c.preview_urls)"` prints `false false`
- Docs formatting passes: `npx prettier --check README.md context/changes/deployment/deployment-plan.md context/foundation/roadmap.md`
- After the release the new host answers: `/` prints `200` and `/dashboard` prints `302 https://streakboard.app/auth/signin`
- After the release the old host no longer serves the app: `curl -s -o /dev/null -w '%{http_code}\n' https://10x-astro-starter.mariusz-zlotucha.workers.dev/` prints a code other than `200`

#### Manual Verification:

- Confirmed with the owner that no `workers.dev` link has been shared since the frame (the "only me" answer still holds)
- The `release` run for the Phase 4 PR was approved after checking `supabase/migrations/` (none expected) and finished green; its log shows "No targets deployed for 10x-astro-starter" and the check ran against `https://streakboard.app`
- The `workers.dev` entry is removed from the Supabase Redirect URLs and the Site URL is unchanged
- A fresh sign-up on `https://streakboard.app` after the removal still lands signed in on `/dashboard`
- Main flow on production: sign in, the dashboard loads, a task can be checked off and undone, and the invite link starts with `https://streakboard.app/join/`
- `deployment-plan.md` Phase 10 records the Phase 3 release result, and the roadmap S-06 Unknown records the decision
- The closing docs commit sets Phase 10 to `✅ Done` with dates, the Phase 4 release run and the final production check

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan. Rollback: if the new host stops answering after the release, switch `workers.dev` back on in the dashboard first (the next deploy turns it off again while the file says `false`); the lasting fix is `workers_dev` back to `true` (or both keys removed) and a release; re-add the old Redirect URLs entry only if links on the old host are needed again. The code itself rolls back with `npx wrangler rollback`; Supabase and Cloudflare dashboard settings do not. Phase 4 is complete only after the merge, the release, rows 4.5 to 4.11 and the closing docs commit (4.13).

---

## Testing Strategy

### Unit Tests:

- None added. No code under `src/` changes; what changes is Cloudflare, Supabase and GitHub configuration, which unit tests cannot see.

### Integration Tests:

- None added. The existing `ci`, `smoke` and `integration` jobs must stay green on every phase PR. The checks that now guard the address are the `release` post-deploy check against the new host (`ci.yml:126-150`) and the build-time assertion of the generated config in Phase 4.

### Manual Testing Steps:

1. Phase 1: `curl` the four paths on the new host and the two on the old one.
2. Phase 2: sign up in a private window on the new host, check the mail's link host, click it in the same browser, check the invite link and the plain-text e-mails in the page source.
3. Phase 3: confirm the variable, approve the `release`, read the "Check the live deployment" step.
4. Phase 4: repeat a fresh sign-up after the last Supabase change and run the main flow on production.

## Performance Considerations

None expected: no code path changes. Requests on the new host pass through the zone's edge features; Phases 2 and 3 check the two that can change behaviour (e-mail obfuscation, bot protection).

## Migration Notes

No database migration; `supabase db push --yes` in each `release` reports nothing to apply, but check `supabase/migrations/` in the merge commit before approving, as the lessons require. Cookies are per host, so existing sessions on the old host do not carry over: the owner signs in again on the new host. Invite links already shared with the old host stop working in Phase 4; the frame says none were shared outside the owner. README, `deployment-plan.md` and `roadmap.md` are also edited by parallel slices: each session edits only its own sections and the PR that merges second resolves the remaining conflicts.

## References

- Frame: `context/changes/custom-domain/frame.md`
- Related research: `context/changes/custom-domain/research.md`
- Wrangler 4.131.1: `node_modules/wrangler/wrangler-dist/cli.js:152950-153058` (custom domains), `:153558-153696` (triggers), `:153907-153914`, `:153986-154121` (workers.dev); Cloudflare Vite plugin 1.54.8: `node_modules/@cloudflare/vite-plugin/dist/index.mjs:84621-84647`, `:63877-63945`
- Wrangler configuration docs ("Source of truth", routes, `workers_dev`): https://developers.cloudflare.com/workers/wrangler/configuration/
- Similar operational phase: `context/archive/2026-09-30-release-automation-and-auth-hardening/plan.md` (Phase 4, production cutover)
- Lessons: "Close every slice by merging to master, approving the production release and checking the production URL"; "Run independent slices in parallel git worktrees, one agent session each" (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Attach streakboard.app to the Worker (Cloudflare dashboard)

#### Automated

- [x] 1.1 Apex answers over valid TLS: `curl -s -o /dev/null -w '%{http_code}\n' https://streakboard.app/` prints `200` — 0b15b59
- [x] 1.2 Sign-in page answers on the new host: `curl -s -o /dev/null -w '%{http_code}\n' https://streakboard.app/auth/signin` prints `200` — 0b15b59
- [x] 1.3 Protected route redirects on the new host: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://streakboard.app/dashboard` prints `302 https://streakboard.app/auth/signin` — 0b15b59
- [x] 1.4 Callback guard answers on the new host: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://streakboard.app/auth/callback` prints `302 https://streakboard.app/auth/signin?error=link_expired` — 0b15b59
- [x] 1.5 Old address unchanged: `/` prints `200` and `/dashboard` prints `302` on `https://10x-astro-starter.mariusz-zlotucha.workers.dev` — 0b15b59
- [x] 1.6 Docs formatting passes: `npx prettier --check context/changes/deployment/deployment-plan.md` — 0b15b59

#### Manual

- [x] 1.7 Pre-checks done: the zone and the Worker are in the same Cloudflare account, Domains & Routes shows no custom domain or route (only `workers.dev` and Preview URLs), and the zone has no apex A, AAAA or CNAME record — 0b15b59
- [x] 1.8 The Custom Domain for the apex shows active in the dashboard with its certificate issued — 0b15b59
- [x] 1.9 `deployment-plan.md` has the new Phase 10 section with the date and the results of 1.1 to 1.5 — 0b15b59

### Phase 2: Move Supabase auth to the new address and prove the user flows

#### Automated

- [ ] 2.1 The Phase 1 release finished green and the domain survived the deploy: `curl -s -o /dev/null -w '%{http_code}\n' https://streakboard.app/` prints `200` after it
- [x] 2.2 Docs formatting passes: `npx prettier --check README.md context/changes/deployment/deployment-plan.md` — 7dd01af
- [x] 2.3 README names the new Site URL: `grep -n "Site URL" README.md` prints a line containing `https://streakboard.app` — 7dd01af

#### Manual

- [x] 2.4 Supabase URL Configuration shows Site URL `https://streakboard.app` and both Redirect URLs entries (`https://streakboard.app/**` and the `workers.dev` one) — 7dd01af
- [x] 2.5 A fresh sign-up at `https://streakboard.app/auth/signup` in a private window delivers the confirmation e-mail from `noreply@mail.streakboard.app`, and the link carries `redirect_to=https://streakboard.app/auth/callback` — 7dd01af
- [x] 2.6 Clicking the link in the same browser lands on `https://streakboard.app/dashboard` signed in, without `link_expired` — 7dd01af
- [x] 2.7 The dashboard on the new host shows an invite link starting with `https://streakboard.app/join/`, and opening it as the new user joins the group — 7dd01af
- [x] 2.8 Member e-mails are plain text in the page source (no `data-cfemail`, no `/cdn-cgi/l/email-protection`) and the browser console shows no hydration errors — 7dd01af
- [ ] 2.9 `deployment-plan.md` Phase 10 records the Phase 1 release result, the Supabase values, the date and the results of 2.4 to 2.8

### Phase 3: Point the release gate at the new address and update the docs

#### Automated

- [ ] 3.1 `PRODUCTION_URL` reads back as the new address: `gh api repos/mariuszzlotucha/streak-board/environments/production/variables --jq '.variables[] | select(.name=="PRODUCTION_URL") | .value'` prints `https://streakboard.app`
- [ ] 3.2 README names the new production address: `grep -n '^\*\*Production:\*\*' README.md` prints a line containing `https://streakboard.app`
- [ ] 3.3 No stale wording is left in the README: `grep -nE 'Until the custom domain binding|will move to it' README.md` prints nothing
- [ ] 3.4 Docs formatting passes: `npx prettier --check README.md context/changes/deployment/deployment-plan.md`

#### Manual

- [ ] 3.5 The `PRODUCTION_URL` change was made before the Phase 3 `release` was approved, and that run finished green with "Check the live deployment" passing against `https://streakboard.app`
- [ ] 3.6 README "Custom domain" subsection explains where the domain is attached, why `wrangler.jsonc` has no `routes`, the risk of adding `custom_domain` routes, and the ordered "Changing the production address" checklist
- [ ] 3.7 `deployment-plan.md` Phase 10 records the variable change and the Phase 2 release result, and `:185` and `:193` point to Phase 10

### Phase 4: Switch workers.dev off

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 The build output carries both flags: `npm run build && node -e "const c=JSON.parse(require('fs').readFileSync('dist/server/wrangler.json','utf8'));console.log(c.workers_dev,c.preview_urls)"` prints `false false`
- [ ] 4.4 Docs formatting passes: `npx prettier --check README.md context/changes/deployment/deployment-plan.md context/foundation/roadmap.md`
- [ ] 4.5 After the release the new host answers: `/` prints `200` and `/dashboard` prints `302 https://streakboard.app/auth/signin`
- [ ] 4.6 After the release the old host no longer serves the app: `curl -s -o /dev/null -w '%{http_code}\n' https://10x-astro-starter.mariusz-zlotucha.workers.dev/` prints a code other than `200`

#### Manual

- [ ] 4.7 Confirmed with the owner that no `workers.dev` link has been shared since the frame (the "only me" answer still holds)
- [ ] 4.8 The `release` run for the Phase 4 PR was approved after checking `supabase/migrations/` (none expected) and finished green; its log shows "No targets deployed for 10x-astro-starter" and the check ran against `https://streakboard.app`
- [ ] 4.9 The `workers.dev` entry is removed from the Supabase Redirect URLs and the Site URL is unchanged
- [ ] 4.10 A fresh sign-up on `https://streakboard.app` after the removal still lands signed in on `/dashboard`
- [ ] 4.11 Main flow on production: sign in, the dashboard loads, a task can be checked off and undone, and the invite link starts with `https://streakboard.app/join/`
- [ ] 4.12 `deployment-plan.md` Phase 10 records the Phase 3 release result, and the roadmap S-06 Unknown records the decision
- [ ] 4.13 The closing docs commit sets Phase 10 to `✅ Done` with dates, the Phase 4 release run and the final production check
