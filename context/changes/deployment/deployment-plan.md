---
project: streak-board
based_on: context/foundation/infrastructure.md
platform: Cloudflare Workers
status: phases_0-16_done_17_partial_18_done
last_updated: 2026-10-16
---

# Cloudflare Workers Deployment Plan

Deployment runbook for streak-board, derived from `context/foundation/infrastructure.md`'s platform research. Phases 0-5 cover the manual CLI deployment. Since change `release-automation-and-auth-hardening`, production deploys run through the gated `release` job in `.github/workflows/ci.yml` (approval in the GitHub `production` environment, then `supabase db push`, then `wrangler deploy`); see `README.md` (Deployment) for the current flow. The manual `wrangler deploy` remains valid as a fallback.

This file is a living checklist, not a one-time research artifact — update the checkboxes and "Discovered issues" as phases complete or new edge cases surface.

## Phase 0 — Pre-flight verification

**Status: ✅ Done, re-verified 2026-09-18 (see update below — state changed since first check)**

- [x] `npx wrangler whoami` → authenticated as `mariusz.zlotucha@gmail.com`, account ID `cef23e668d98bfbd15b2253f243c5556`.
- [x] Repo already has `@astrojs/cloudflare@^14.3.1` and a Workers-with-static-assets `wrangler.jsonc` (not Cloudflare Pages — the adapter dropped Pages support; don't follow Pages-era tutorials or `_worker.js`/`functions/`-directory instructions).
- [x] `npx wrangler kv namespace list` → `[]` — no KV namespaces provisioned (still true after Phase 2's secret-put below — confirms Phase 1's fix holds).
- [x] `npx wrangler deployments list` — **initially** `This Worker does not exist on your account` (error 10007, first check). **Update:** running `wrangler secret put` in Phase 2 caused wrangler to auto-create a stub Worker (an empty "Upload" deployment + two "Secret Change" deployments, timestamps ~13:22–13:23 UTC 2026-09-18) purely to hold the secrets — no real code has been deployed yet. Don't mistake this stub's existence for a completed deploy.

---

## Phase 1 — Fix the session-store config before any deploy

**Status: ✅ Done (code change applied & build-verified; not yet committed to git)**

The infra doc's risk register flagged a "dual session-store trap": the Cloudflare adapter auto-provisions a KV-backed session store that would silently coexist with Supabase's own cookie sessions (`src/lib/supabase.ts`). Verified directly against installed source (`astro@7.3.2`, `@astrojs/cloudflare@14.3.1`), not just docs:

- `node_modules/@astrojs/cloudflare/dist/index.js:108-120` — the adapter enables the KV session driver **unconditionally** unless Astro's own top-level `session` config is `false`. This fires regardless of whether app code calls `Astro.session` (confirmed: no usage anywhere in `src/`).
- `node_modules/@astrojs/cloudflare/dist/wrangler.js:26` — when active, this injects `kv_namespaces: [{ binding: "SESSION" }]` (no `id`) into the effective wrangler config, and Cloudflare's automatic-provisioning creates that namespace for real on `wrangler deploy`.
- The correct fix location is **top-level** `session: false` in `defineConfig({...})` (`astro.config.mjs`), sibling of `adapter` — **not** an option passed into `cloudflare({...})`, which has no `session` field (only `sessionKVBindingName`, `imageService`, `imagesBindingName`, `prerenderEnvironment`, `experimental`). The infra doc's original phrasing pointed at the wrong location.

**Change applied** (`astro.config.mjs`, currently uncommitted):

```js
adapter: cloudflare(),
// Supabase cookies (src/lib/supabase.ts) are the single session source of truth —
// without this, the Cloudflare adapter auto-provisions a second, unused KV session store.
session: false,
```

**Verification performed:**

- [x] `npx astro build` — build log no longer prints `Enabling sessions with Cloudflare KV with the "SESSION" KV binding.`
- [x] `grep -r kv_namespaces dist/` — `dist/server/wrangler.json` now shows `"kv_namespaces":[]`.

**Remaining:**

- [x] Commit `astro.config.mjs` — done, commit `760f4fa`.
- [ ] If a future feature genuinely needs Astro's session API (flash messages, CSRF nonces) alongside Supabase auth, don't silently flip this back — re-open the decision explicitly and log it via `/10x-lesson`.

## Phase 2 — Manual first deploy

**Status: ✅ Done (2026-09-18)** — deployed and verified at the route level; full browser auth smoke test still outstanding (needs a real Supabase project).

- [x] Set production secrets — done by you directly (not through this session, by design: `wrangler secret put` reads a real credential from stdin and shouldn't pass through a chat transcript).
  ```
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```
- [x] Confirm: `npx wrangler secret list` → both `SUPABASE_KEY` and `SUPABASE_URL` present (`secret_text` type, values never shown).
- [x] Build and deploy: `npm run build && npx wrangler deploy` — succeeded, version `0ed45ab6-d20e-466b-9bcb-1dbddad831fc`.
- [x] Live URL: `https://10x-astro-starter.mariusz-zlotucha.workers.dev`
- [x] Full browser smoke test (sign-up, sign-in, `/dashboard` check-off) — route-level checks only so far (`/` 200, `/auth/signin` 200, `/dashboard` unauth 302). — closed by the owner on 2026-10-09 (superseded by the Phase 10 production check).

### Blocking issue: account has no `workers.dev` subdomain registered

Attempted `npx wrangler deploy` on 2026-09-18 and hit:

```
✘ [ERROR] Wrangler could not automatically register "10x-astro-starter" as your workers.dev
  subdomain because the name is unavailable. Register a different subdomain at
  https://dash.cloudflare.com/cef23e668d98bfbd15b2253f243c5556/workers/onboarding.
```

This account has never had a `workers.dev` subdomain claimed. This is a **one-time, account-level, human decision** (you're picking a public, permanent subdomain prefix — e.g. `<something>.workers.dev` — that every Worker on the account will be reachable under) and there's no CLI command for it in this wrangler version (`wrangler --help` lists no `subdomain` command).

**Resolved 2026-09-18:** instead of the account-level onboarding link, the subdomain was registered per-Worker via the dashboard's **Domains** tab for `10x-astro-starter` (Workers & Pages → 10x-astro-starter → Domains → toggled on `10x-astro-starter.mariusz-zlotucha.workers.dev`). Verified reachable: `curl https://10x-astro-starter.mariusz-zlotucha.workers.dev/` → `HTTP 500` (expected — only the empty stub Worker from `wrangler secret put` is live, not the real app; the 500 confirms the URL itself now resolves instead of erroring on "subdomain unavailable").

- [x] `workers.dev` subdomain registered and Worker URL reachable: `https://10x-astro-starter.mariusz-zlotucha.workers.dev`
- [x] Ran `npm run build && npx wrangler deploy` — succeeded. Version ID `0ed45ab6-d20e-466b-9bcb-1dbddad831fc`, uploaded 8 static assets + 28 server modules.
- [x] Verified: `/` → 200, `/auth/signin` → 200, `/dashboard` (unauthenticated) → 302 redirect (middleware guard working). `npx wrangler kv namespace list` still `[]` — Phase 1's fix holds under a real deploy.

**Phase 2 complete.** Live app: `https://10x-astro-starter.mariusz-zlotucha.workers.dev`

Still outstanding from this phase (not yet done — needs a real, non-local Supabase project to fully verify):

- [x] Full browser sign-up/sign-in/check-off smoke test against the live URL (only route-level HTTP checks done so far, not actual Supabase auth flow). — closed by the owner on 2026-10-09 (superseded by the Phase 10 production check).

**Other edge cases / extra support steps for this phase:**

- **`astro:env/server` resolves to `undefined` in production** (real upstream issue, withastro/astro#16790, open as of Sept 2026): if `wrangler tail` shows `createClient` returning `null` (sign-in silently no-ops) even though `wrangler secret list` shows both secrets set, the workaround is to read the Worker's native `env` directly instead of trusting `astro:env/server` — import `env` from `cloudflare:workers` inside `src/lib/supabase.ts`'s Cloudflare code path as a fallback. Only apply this if the tail/browser check actually shows the failure — don't patch preemptively.
- **KV namespace still gets auto-provisioned despite `session: false`**: re-run `npx wrangler kv namespace list` right after the first deploy. If a `SESSION`-named namespace appears anyway, Phase 1's build-log check was a false negative — stop, don't proceed to Phase 3, and re-verify the `session: false` placement.
- **Wrong Supabase project secrets**: this MVP has no staging environment, so a fat-fingered `wrangler secret put` points production traffic at the wrong (or local) Supabase project with nothing to catch it first. Treat the sign-in smoke check as mandatory before calling this phase done.

## Phase 3 — Rollback drill

**Status: ✅ Done (2026-09-18)**

Used two already-live, visually distinct deploys (ad hoc background-color changes) as the drill's before/after instead of a synthetic change:

- [x] `npx wrangler deployments list` — reviewed full deployment history, identified current (`609006fb`, hero-section red) and prior (`62719a11`, global-background red only) version IDs.
- [x] `npx wrangler rollback 62719a11-...` — succeeded (non-interactive prompts auto-answered: default rollback message, confirmed "yes" to deploy to 100% of traffic).
- [x] Confirmed rollback effect via curl: hero-section `bg-red-600` class gone from HTML, global `--background` CSS var still red (matches the rolled-back-to version exactly) — proves rollback restores the _exact_ prior version, not just "some" prior state.
- [x] Redeployed current working-tree state (`npm run build && npx wrangler deploy`) to restore the hero-section change — confirmed `bg-red-600` back in the live HTML.

Turns "rollback works in theory" into a proven, once-rehearsed step before you need it under pressure. **Note:** `wrangler rollback` prompts interactively (rollback message, confirm-to-100%) — in a non-interactive/scripted context it falls back to defaults ("Rollback" message, "yes" to confirm) rather than failing, which is convenient but means a scripted rollback can't be silently declined — know this before wiring it into anything automated.

## Phase 4 — Documentation

**Status: ✅ Done (2026-09-18)**

- [x] Updated `README.md`'s Deployment section: secrets-first ordering, explicit "deploys are manual, CI does not deploy" statement, and the discovered `workers.dev` subdomain first-deploy edge case with its fix.
- [x] Added a "Rollback" subsection to `README.md` (`wrangler rollback` / `wrangler deployments list`, non-interactive default-prompt behavior noted).
- [x] `context/foundation/infrastructure.md` intentionally left untouched (research output, not a living runbook) — this file and the README are now the accurate operational references; the `session: false`-on-adapter phrasing there is known-superseded by Phase 1 above.

## Phase 5 — Production release of S-01 `group-create-join-manage`

**Status: ✅ Done (2026-09-25)** — first slice-closing production release, following the lesson "Close every slice with a production deploy and a production Supabase migration" (`context/foundation/lessons.md`).

- [x] Linked the checkout to the hosted project: `npx supabase link --project-ref wzpgyobsomvjyfrngyuu` (bare project ref, not the project URL).
- [x] `npx supabase db push --dry-run` passed, then the migrations were pushed. `npx supabase migration list` shows all three present Local and Remote: `20260925003350`, `20260925011727`, `20260925161234`.
- [x] `select length(join_code), count(*) from public.groups group by 1;` on production → only length 12 (no 8-character codes, so no `preview_group` enumeration risk from the older code length).
- [x] Production app checked in the browser at `https://10x-astro-starter.mariusz-zlotucha.workers.dev` after signing in.

**Discovered issues:**

- **Workers Builds deploys `master` automatically.** The Cloudflare Worker is connected to the GitHub repo, so every push to `master` triggers a build and deploy. This contradicts the "deploys are manual only" statements in this plan, `README.md` and the roadmap. `wrangler deploy` by hand is still valid, but it is no longer the only path. Consequence: code that needs a new schema can go live before the migration does — push the migration first (`db push`), then merge/push the code.
- **Supabase Site URL must be set for the hosted project.** Confirmation e-mails link to the project's Site URL (default `http://localhost:3000`), and `supabase/config.toml` `site_url` only affects the local stack and is not pushed by `db push`. Fix, done in the Dashboard: Authentication → URL Configuration → Site URL `https://10x-astro-starter.mariusz-zlotucha.workers.dev`, Redirect URLs including `https://10x-astro-starter.mariusz-zlotucha.workers.dev/**`.
- **Built-in Supabase SMTP rate limit.** Repeated sign-ups (each sends a confirmation mail) hit `over_email_send_rate_limit`, shown in the app as "Too many attempts. Please try again later." Deleting the unconfirmed user does not reset the counter. Workaround: Dashboard → Authentication → Users → Add user with **Auto Confirm User**. Permanent fix (not done yet): custom SMTP under Authentication → SMTP Settings.
- **Confirmation links are single-use.** A second click (or an e-mail scanner that pre-fetched the link) ends on `?error_code=otp_expired`. The app has no `/auth/callback` route and `signup.ts` sets no `emailRedirectTo`; the e-mail is confirmed by Supabase's verify step, but the user lands on `/` not signed in.
- **Migrations stay manual** (decision 2026-09-25). Automation options considered and declined for now: a GitHub Actions job running `supabase db push` (needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, project ref) and Supabase Branching (Pro plan). Revisit if the ordering race above bites.

**Follow-ups (not scheduled):**

- [x] Custom SMTP for production auth e-mails (Resend, sender `noreply@mail.streakboard.app`), confirmed by a production sign-up on 2026-09-30.
- [x] Optional change: `emailRedirectTo` + `/auth/callback` route that exchanges the code for a session (live on production since 2026-09-30, see Phase 6).
- [x] Reconcile "deploy is manual" wording in `README.md` (Deployment) and this file's intro with Workers Builds (PR #19).

## Phase 6 — Automated release (change `release-automation-and-auth-hardening`)

**Status: ✅ Done (2026-09-30)**

- [x] First `release` run (started by the merge of PR #19 to `master`) waited for approval in the `production` environment and finished green: migrations linked and listed, `db push` applied **no migrations** (none in this change), Worker built and deployed, live URL check passed.
- [x] Production checks after the release: `/auth/callback` answers 302 to `/auth/signin?error=link_expired`; `/` and `/auth/signin` answer 200; `/dashboard` answers 302. `npx supabase migration list` shows all three local versions also remote; `npx wrangler kv namespace list` returns `[]`.
- [x] Workers Builds disconnected in the Cloudflare dashboard (2026-09-30); the Actions `release` job is the single deploy path. Confirmed on the merge of PR #20: no Cloudflare build ran.
- [x] Custom SMTP (Resend) configured, and a production sign-up delivers the e-mail from `mail.streakboard.app`; the link lands on `/dashboard` signed in, a second click in a private window shows the expired-link message.

## Phase 7 — Task create and manage (change `task-create-and-manage`, S-02)

**Status: ✅ Done (2026-10-01)**

- [x] Migration `20260930120000_create_tasks.sql` (table `tasks` with RLS, shipped with phase 1) applied by the `release` job; later phase PRs added no migrations.
- [x] `release` run for the merge of PR #30 (phase 4) approved in the `production` environment and finished green (CI run 36786890045). The `master` run for the phase 3 merge (PR #29) shows `cancelled` in Actions.
- [x] Production check (2026-10-01): a signed-in group member created, renamed and deleted a task; a second member saw it without controls; `/dashboard` still answers 302 when signed out.

## Phase 8 — Task join and leave (change `task-join-and-leave`, S-03)

**Status: ✅ Done (2026-10-01)**

- [x] Migration `20261001090000_create_task_participants.sql` (table `task_participants` with RLS and the two triggers, shipped with phase 1) applied by the `release` job: `migration list` showed it as local-only, `db push` applied only that migration. The phase 1 run was cancelled and the phase 2 run was superseded, so it went out with the run for the phase 3 merge (PR #38, `d67717b`).
- [x] `release` run 36796008409 approved in the `production` environment and finished green: Worker built and deployed, live URL check passed (`/` 200, `/dashboard` and `/auth/callback` 302).
- [x] Production check (2026-10-01, after the release finished at 00:31 UTC, done by hand by the user): a signed-in member joined and left another member's task, and a fresh task listed its creator. Result: passed.

### Follow-up: privilege hardening (full-plan review F4, PR #40)

- [x] Migration `20261001120000_harden_table_privileges.sql` (revokes unused privileges: `anon` on `groups` and `group_members`; TRUNCATE, REFERENCES and TRIGGER from `authenticated` on `groups`, `group_members` and `tasks`; INSERT and UPDATE on `group_members`) applied by the `release` job: `migration list` showed it as local-only, `db push` applied only that migration.
- [x] `release` run 36799055950 (merge of PR #40, `1d3a315`) approved in the `production` environment and finished green: Worker deployed (version `7020fa16-d75e-4be9-b04d-626e41266f53`), live URL check passed. The run for the PR #39 merge (36797072465) was superseded and cancelled; it never ran.
- [x] Production check (2026-10-01, after the release, done by hand by the user): left a task, the join button for it then appeared, and joining worked. Result: passed. Sign-in, dashboard and group flows were not reported separately.

## Phase 9 — Check-off and leaderboard (change `checkoff-and-leaderboard`, S-04)

**Status: ✅ Done (2026-10-01); the `/dashboard` CPU reading was accepted without a measurement**

- [x] Migration `20261002090000_create_task_checkoffs.sql` (table `task_checkoffs` with RLS and the `task_checkoff_periods` view, shipped with phase 2; additive, no backfill) applied by the `release` job: `db push` listed only that migration and applied it. The runs for the earlier phase merges were cancelled or superseded, so it went out with the run for the phase 5 merge (PR #51, `c963e86`).
- [x] `release` run 36917515328 approved in the `production` environment and finished green: Worker deployed (version `9956ddb1-6eda-4be3-a907-607988f26b08`), live URL check passed.
- [x] Production check (2026-10-01, after the release, done by hand by the user): two members checked off, the totals updated instantly, the state survived a reload, undo worked and the leave warning showed; on a phone the tap felt instant. Result: passed.
- [x] CPU and wall time of a `/dashboard` request (Workers Logs, observability enabled in `wrangler.jsonc`): not measured. On 2026-10-01 the user accepted the risk and told Claude to assume the CPU time is fine; no value was recorded. The Workers plan's CPU limit is 10 ms on the Free plan (`context/foundation/infrastructure.md`). Revisit if requests start failing with CPU-limit errors or `/dashboard` slows down as groups are added; the additive `create or replace view` fix is in the plan's Performance Considerations.

## Phase 10 — Custom domain (change `custom-domain`, S-06)

**Status: ✅ Done (2026-10-02)**

- [x] Custom Domain `streakboard.app` (apex only, no `www`) added by the owner on 2026-10-02 in the Cloudflare dashboard (Worker `10x-astro-starter` → Settings → Domains & Routes → Add → Custom domain). `wrangler.jsonc` has no `routes` entry on purpose: a deploy touches custom domains only when the config declares a `custom_domain` route, so the dashboard entry is not managed from the repository (see README "Custom domain").
- [x] DNS state after the domain was added (owner's dashboard listing, 2026-10-02): 4 of 200 records. Three are the Resend sender records under `mail.streakboard.app` (CNAME `send` and `rsend`, TXT `resend._domainkey`; DNS only) from the earlier auth e-mail work; the fourth is the apex record `streakboard.app` → Worker `10x-astro-starter` (Proxied), created by the Custom Domain. There was no other apex A, AAAA or CNAME record. `www` has no record and the apex has no MX; both are outside this change.
- [x] Checks on 2026-10-02, right after the domain was added: `https://streakboard.app/` 200, `/auth/signin` 200, `/dashboard` 302 to `https://streakboard.app/auth/signin`, `/auth/callback` 302 to `https://streakboard.app/auth/signin?error=link_expired`. The certificate is valid (`CN=streakboard.app`, issuer Google Trust Services `WE1`, expires 2026-12-31). The old address was unchanged: `/` 200, `/dashboard` 302.
- [x] Supabase auth moved to the new address (owner, Supabase Dashboard → Authentication → URL Configuration, 2026-10-02): Redirect URLs now hold `https://streakboard.app/**` and the earlier `https://10x-astro-starter.mariusz-zlotucha.workers.dev/**` entry; the entry was added first and the Site URL changed second, to `https://streakboard.app`. SMTP settings and e-mail templates were not touched.
- [x] User flows on the new host (2026-10-02, owner, private window, a fresh sign-up): the confirmation e-mail came from `noreply@mail.streakboard.app` and its link carried `redirect_to=https://streakboard.app/auth/callback`; clicking it in the same browser landed on `/dashboard` signed in, without `link_expired`; the invite link started with `https://streakboard.app/join/` and joined the group when opened as another user; member e-mails were plain text in the page source (no `data-cfemail`, no `/cdn-cgi/l/email-protection`) and the console showed no hydration errors. The owner reported all checks as passing; no obfuscation or template change was reported.
- [x] Phases 1 and 2 were delivered in one pull request at the owner's request (the plan has one PR per phase). The Supabase steps and the user flows were done before the merge, on the live app, because no code changes and the domain was already attached. Because of that, the check that a normal deploy leaves the dashboard-attached domain alone (plan rows 2.1 and 2.9) can run only after the release of this PR; the Phase 3 PR closes it.
- [x] Result of the `release` for the combined Phase 1 and 2 PR (PR #61, merged 2026-10-02 as merge commit `e2ee1e7`; no new migrations in the merge, the latest is `20261002090000_create_task_checkoffs.sql`): CI run 36991982924 on `master`; the `release` job ran 09:52:48-09:53:40 UTC and finished `success` after the owner's approval. Afterwards `https://streakboard.app/` printed `200`, `/auth/signin` `200`, `/dashboard` `302` to `https://streakboard.app/auth/signin`, `/auth/callback` `302` to `https://streakboard.app/auth/signin?error=link_expired`, and the old host `/` still `200`. A normal deploy left the dashboard-attached domain alone.
- [x] Variable change: the GitHub environment `production` variable `PRODUCTION_URL` was changed on 2026-10-02 from `https://10x-astro-starter.mariusz-zlotucha.workers.dev` to `https://streakboard.app` (set by Claude through `gh api -X PATCH` at the owner's explicit request; read back through the API).
- [x] Phases 3 and 4 were delivered in one pull request at the owner's request (the plan has one PR per phase). Consequence: the release of that PR is the first one to check the new address from a runner and also ships `workers_dev: false` and `preview_urls: false`. If it fails with 403 or 503 on `Expected 200 from https://streakboard.app/`, the cause is the zone's bot protection, and `workers.dev` is already off by then (rollback: switch `workers.dev` back on in the dashboard). The result of that release and the final status are recorded by the closing docs PR.
- [x] Result of the `release` for the combined Phase 3 and 4 PR (PR #62, merged 2026-10-02 as merge commit `7635719`; no new migrations, the latest is still `20261002090000_create_task_checkoffs.sql`): CI run 37017866589 on `master`; the `release` job ran 14:11:38-14:12:33 UTC and finished `success`. The deploy log says "No targets deployed for 10x-astro-starter" and no "differs from the remote configuration" warning appeared; "Check the live deployment" passed with `PRODUCTION_URL: https://streakboard.app`, so the zone's bot protection let the runner's `curl` through (wrangler 4.131.1).
- [x] Final checks from outside (2026-10-02, after that release): `https://streakboard.app/` 200, `/auth/signin` 200, `/dashboard` 302 to `https://streakboard.app/auth/signin`, `/auth/callback` 302 to `https://streakboard.app/auth/signin?error=link_expired`; the old host `https://10x-astro-starter.mariusz-zlotucha.workers.dev` answers 404 on `/` and `/dashboard`.
- [x] Owner's steps after the release (reported by the owner on 2026-10-02 as done, in answer to the list of steps; no separate details were given): the `workers.dev` entry removed from the Supabase Redirect URLs with the Site URL unchanged, a fresh sign-up on `https://streakboard.app` landing signed in on `/dashboard`, the main flow on production (check-off and undo, invite link starting with `https://streakboard.app/join/`), and no `workers.dev` link ever shared.

## Phase 11 — Observability: failures reach the response and monitoring (change `observability-swallowed-errors`, S-08)

**Status: ✅ Done (2026-10-02); the CPU readings and the production walk-through were accepted by the owner without recorded values**

- [x] The three phases were delivered in one pull request at the owner's request (PR #67, merged 2026-10-02 as merge commit `328ca00`; the plan has one PR per phase). No migrations; the latest is still `20261002090000_create_task_checkoffs.sql`.
- [x] `release` for PR #67: CI run 37054562093 on `master`; the `release` job ran 19:34:07-19:35:01 UTC and finished `success` after the owner's approval (Link, List migrations, Apply pending migrations, Deploy Worker and Check the live deployment all `success`). Active deployment afterwards: 100% on version `0d4ef72a-70f0-423a-b3d9-3f104fceee3b`.
- [x] Secret `SENTRY_DSN` set by the owner with `npx wrangler secret put SENTRY_DSN` on 2026-10-02 19:31 UTC (Worker version `ffca432b-a656-4f13-ba06-4aa8f63eb69e`, source "Secret Change"), before the release; the value is not in the repository or in any chat message.
- [x] Forced production event (owner, signed in, browser-console `fetch` of `/api/tasks/uncheck` with a JSON body, 2026-10-02): Sentry shows a new issue `TypeError: Unrecognized Content-Type header value. FormData can only parse ...` with 1 event and 1 user; tags `event: uncheck.exception`, `environment: production`, `level: error`, `handled: yes`, `mechanism: generic`, `release: 0d4ef72a-70f0-423a-b3d9-3f104fceee3b` (equal to the active Worker version above), `user.id` only. One issue with one event, so the request wrapper did not capture the error a second time.
- [x] Alert mail for the forced production event arrived (owner, 2026-10-02).
- [x] Local checks (Claude, 2026-10-02, production build in `astro preview`): with the local Auth container stopped, a signed-in `/dashboard` answered 503 (`Retry-After: 30`, `Cache-Control: no-store`, "Service unavailable" page), the check-off route answered `{"ok":false,"error":"unavailable"}` 503 for `Accept: application/json`, the public sign-in page stayed 200, an anonymous `/dashboard` stayed a 302, one `auth.unavailable` line was printed per request, and after restarting Auth `/dashboard` was 200 again without a restart; the smoke run on the same preview printed no `auth.*`, `auth.unexpected` or `request.unhandled` lines. The "Mark done" tap in the browser was not exercised.
- [x] Audit verify run (`context/audits/observability/2026-10-02_verify-check-off-and-uncheck-join-group.md`): every expectation met, HTTP results unchanged apart from the planned 503s.
- [x] Remaining manual checks (Workers plan tier, baseline and post-release CPU for `GET /dashboard` and `POST /api/tasks/checkoff`, the absence of `request`, cookies, headers and IP in the forced event's JSON, the production walk-through with `wrangler tail`, the "Mark done" tap during an outage, the local Sentry check with a DSN): confirmed by the owner on 2026-10-02 on their own responsibility, in answer to the list of open rows; no values were recorded. The CPU baseline was not taken before the release, so the "P95 within 2 ms of the baseline" condition of the plan was not measured. Revisit if requests start failing with CPU-limit errors (`exceededCpu`, Error 1102); the rollback is `npx wrangler rollback` plus reverting PR #67 (Phases 1 and 2 can stay).

## Phase 12 — Google login: provider setup and first production proof (change `google-login`, S-07)

**Status: ✅ Done (2026-10-06)** — the provider setup (plan Phase 1), the `release` of the Phase 2 merge and the production flows are recorded below. Rows tagged "owner-reported" can only be seen in the Google Cloud Console, the Supabase Dashboard, a browser session or the production logs; Claude did not see them. No secret, no client id value and no test-user address is recorded here.

- [x] Supabase read-back (owner-reported, 2026-10-06, Dashboard → Authentication → Sign In / Providers → Email): "Confirm email" is **on**. The phone provider is disabled, so no phone confirmation setting applies. With "Confirm email" on, the accepted-risk case the plan describes for "off" (a password account registered for someone else's address, without proof of the mailbox) is not in effect, by the source reading in the `google-login` research (GoTrue v2.196.0), not tested live.
- [x] Supabase URL Configuration read back (owner-reported, 2026-10-06, nothing changed in this step): Site URL `https://streakboard.app`, Redirect URLs include `https://streakboard.app/**`; both as recorded in Phase 10.
- [x] Google app (owner-reported, 2026-10-06, Google Cloud Console, personal Google account): consent screen user type External, publishing status Testing; user support and developer contact e-mails set; home page, privacy policy and terms left empty (the privacy policy is the gate for publishing and belongs to S-09); Data Access holds only the three basic scopes `openid`, `userinfo.email` and `userinfo.profile`.
- [x] Test users (owner-reported, 2026-10-06): 2 listed, the owner and one extra Google account that has no StreakBoard account (for the production checks of plan rows 2.12 and 2.13). Friends are not listed yet; in Testing only listed addresses can sign in, so each friend must be added before they try (limit 100).
- [x] OAuth client (owner-reported, 2026-10-06): type Web application; Authorized JavaScript origin `https://streakboard.app`; Authorized redirect URI `https://wzpgyobsomvjyfrngyuu.supabase.co/auth/v1/callback`. The Client secret is stored only in the owner's password manager.
- [x] Supabase Google provider (owner-reported, 2026-10-06, Dashboard → Authentication → Sign In / Providers → Google): enabled; Client ID and Client secret entered in the Dashboard form only; "Skip nonce checks" and "Allow users without an email" off; the displayed "Callback URL (for OAuth)" equals the redirect URI registered in Google.
- [x] Claude's check of the hosted provider (2026-10-06, anonymous `curl` of `https://wzpgyobsomvjyfrngyuu.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fstreakboard.app%2Fauth%2Fgoogle%2Fcallback`, no cookies): before the provider was enabled the answer was `400` with `validation_failed` and "Unsupported provider: provider is not enabled"; after it was enabled the answer is `302` to `https://accounts.google.com/` with a `client_id=` parameter (value not recorded) and `redirect_uri` equal to the Supabase callback above. Supabase asks Google for the scopes `email profile`.
- [x] `release` for PR #77 (merge `35d9815`): CI run 37389961933 on `master`; the `release` job ran 2026-10-05 23:46:41-23:47:32 UTC and finished `success` after the owner's approval (Link, List migrations, Apply pending migrations, Deploy Worker and Check the live deployment all `success`). The merge adds no migration (nothing under `supabase/`), so nothing was applied. "Check the live deployment" includes the new two-hop Google check: `POST /api/auth/google` answered a redirect to the Supabase `/auth/v1/authorize?provider=google` URL, and a GET of that URL answered a redirect to `https://accounts.google.com/`. Active deployment afterwards (`npx wrangler deployments list`): 100% on version `8649f530-c918-401d-a3ae-2f39206108e3`, created 2026-10-05 23:47 UTC.
- [x] Production flows on `https://streakboard.app` (owner-reported, 2026-10-06, in one answer to Claude's list of six checks: all six passed; no values or per-flow details were recorded): (1) the owner's existing e-mail account signs in with Google and lands on `/dashboard` as the same user with the same group; (2) a Google account without a StreakBoard account lands on `/dashboard` as a new user with the create and join forms; (3) an invite opened signed out, followed by "Continue with Google", ends on `/dashboard` with the "Join" card; (4) cancelling at the consent screen ends on `/auth/signin` with the cancelled message and a reload shows no error; (5) e-mail+password sign-in and sign-out still work; (6) Workers Logs and Sentry show no error-level `auth.google.*` line, no new Sentry issue and no `auth.google.callback.returned` line with `providerError=server_error`.
- [x] User created by flow (2) (owner decision, 2026-10-06): kept.
- Not exercised on production: the optional wait of more than five minutes on the consent screen, and the answer of hosted GoTrue to a made-up `code`. Both end on `oauth_failed` by design (a stale `flow_state` or an unknown code) and are covered by the unit, integration and smoke tests and by the local GoTrue; revisit if production Workers Logs show an `auth.google.callback.failed` line with an unexpected `code`.
- Friends were not listed as test users when the provider was set up (test-users row above); each must be added in the Google Cloud Console before they try.

## Phase 13 — Landing page and privacy policy (change `landing-page`, S-09)

**Status: ✅ Done (2026-10-09)** — the release, the HTTPS switch, the production check and both Google submissions are recorded below; Google accepted the review request (last row below) (`landing-page` was archived before the verdict). Rows tagged "owner-reported" can only be seen in the Cloudflare dashboard, Search Console, the Google Cloud Console or a browser session; Claude did not see them.

- [x] Code (plan Phase 1) in PR #89, merged 2026-10-08 16:49 UTC as merge commit `caef850`. The merge adds nothing under `supabase/migrations/`; the latest is still `20261002090000_create_task_checkoffs.sql`.
- [x] Secret `CONTACT_EMAIL` (the controller's contact address shown on `/privacy` and in the footer) set by the owner with `npx wrangler secret put CONTACT_EMAIL` before the release; `npx wrangler secret list` shows it next to `SENTRY_DSN`, `SUPABASE_KEY` and `SUPABASE_URL`. The value is not in the repository.
- [x] `release` for PR #89: CI run 37811849750 on `master` (ci, smoke and integration `success`); the `release` job ran 2026-10-08 16:53:02-16:54:20 UTC and finished `success` after the owner's approval (Link, List migrations, Apply pending migrations, Deploy Worker and Check the live deployment all `success`). Nothing was applied. "Check the live deployment" includes the new checks: `/privacy` answers 200 with a plain `mailto:` link and `/` links `/privacy`. Active deployment afterwards (`npx wrangler deployments list`): 100% on version `ccd31a3f-a214-4d78-b2a8-7405317a9c1e`, created 16:54 UTC. The pending `release` of the plan PR's merge (`829d73a`, run 37805282553) was cancelled by the `release` concurrency group when this one queued; it held only documents.
- [x] Always Use HTTPS (owner, Cloudflare dashboard → `streakboard.app` → SSL/TLS → Edge Certificates): on. Claude's check (2026-10-08, `curl -sI`): `http://streakboard.app/`, `/auth/signin` and `/privacy` answer `301` to the same path on `https://`.
- [x] Claude's production check (2026-10-08, anonymous `curl` after the release): `/`, `/privacy`, `/auth/signin`, `/auth/signup` and `/auth/confirm-email` answer `200`; `/` carries the heading "Keep each other on track." and links `/auth/signup`, `/auth/signin` and `/privacy`; `/privacy` carries the "Privacy Policy" heading, the supervisory authority's name and a plain `mailto:` link with the owner's address in 4 places, and no page contains `/cdn-cgi/l/email-protection` or `data-cfemail` (no Cloudflare e-mail obfuscation); every public page carries the brand link to `/` and the footer link to `/privacy`; the sign-up page carries the notice that group members see the e-mail address; no page contains `bg-cosmic` or the starter's name; `/template.png` answers `404`, `/favicon.svg` and `/favicon.png` `200`; an anonymous `/?error_code=flow_state_already_used` answers `302` to `/auth/signin?error=oauth_failed` and `/dashboard` `302` to `/auth/signin`.
- [x] Owner's production check (owner-reported, 2026-10-08, in one answer to Claude's list; no values or per-step details were recorded): the pages at phone width; signing in, then opening `/`, lands on `/dashboard`; the `sb-` cookies are marked Secure in DevTools; Google sign-in works for a listed tester; signing out works.
- [x] Search Console review request (owner-reported, 2026-10-08, sent after the release, the HTTPS switch and the production check): Security issues → "Deceptive pages" → Request review, with the text from the `landing-page` plan (Phase 2, change 4) and "live since 8 October 2026".
- [x] Google Auth Platform → Branding (owner-reported, 2026-10-08): App home page `https://streakboard.app/`, privacy policy link `https://streakboard.app/privacy`, authorized domain `streakboard.app`. The app stays in Testing, so these are Draft Branding that users do not see.
- [x] Google's verdict on the review request: **accepted** (owner-reported, 2026-10-09; the Safe Browsing flag is lifted) (Search Console and the Transparency Report): recorded here, in this row (the owner archived `landing-page` on 2026-10-08 while the review was pending, so its Phase 3 does not run). Search Console is the source of the verdict; owner-reported 2026-10-15: the Search Console check was done, so no further watch is needed. Passed: tick this row with the date, close the roadmap's Open Roadmap Question and update the status line above. Rejected: fix forward in a new change (`/10x-new`), never by reverting the public pages.
- [x] Google Auth Platform → Audience → Publish app (owner-reported, 2026-10-15): publishing status "In production". Branding unchanged from 2026-10-08. The post-publish login check with a non-test account is not recorded here; it was not confirmed.

## Phase 14 — Dashboard UI (change `dashboard-ui`, S-11)

**Status: ✅ Done (2026-10-12)** — both code phases are released with no new migrations, and Claude's and the owner's production checks passed.

- [x] Code shipped in one PR per code phase, as planned. Neither merge adds anything under `supabase/`, so there are no new migrations; the latest is still `20261002090000_create_task_checkoffs.sql`. The slice needs no new secret or variable; its only CI change is the `node scripts/token-contrast.mjs` step in the `ci` job.
  - Phase 1 (design-system groundwork: token values, components, the kitchen sink and the lint guard): PR #102, merged 2026-10-12 08:20 UTC as merge commit `7ca7942`.
  - Phase 2 (the dashboard view and its states, and the new protected page `/settings`): PR #103, merged 2026-10-12 16:29 UTC as merge commit `78a47e3`.
- [x] `release` for PR #102: CI run 38222989341 on `master` (ci, smoke and integration `success`). The `release` job ran 08:24:59-08:25:54 UTC and finished `success` after the owner's approval; Link, List migrations, Apply pending migrations, Deploy Worker and Check the live deployment were all `success`. `db push` reported "Remote database is up to date.", and Deploy Worker printed version `7c1f193d-da5f-40ec-9f22-9819cdda62cd`. The pending `release` of the plan PR's merge (PR #101, `2ec358b`, run 38206570239) waited from 05:09 UTC and was cancelled at 08:20:47 UTC by the `release` concurrency group when this run queued; it held only documents.
- [x] `release` for PR #103: CI run 38277781844 on `master` (ci, smoke and integration `success`). The `release` job ran 16:35:47-16:36:32 UTC and finished `success` after the owner's approval; the same five steps were all `success`. `db push` reported "Remote database is up to date.", and Deploy Worker printed version `e44e8175-676c-4ae9-afa1-ba7be8a224e6`.
- Rollback covers the code only; the slice has no schema change.
  - A bare `npx wrangler rollback` returns to the prior version, Phase 1's `7c1f193d-da5f-40ec-9f22-9819cdda62cd`, so it undoes Phase 2 only.
  - Undoing the whole slice is `npx wrangler rollback <id>` with the version before `7c1f193d-da5f-40ec-9f22-9819cdda62cd` from `npx wrangler deployments list`. The last release before S-11 (run 37811849750, PR #89) deployed `ccd31a3f-a214-4d78-b2a8-7405317a9c1e`.
  - Either way, revert the merged PR on `master` too, or the next approved `release` ships the code again.
- [x] Claude's production check (2026-10-12, anonymous `curl` after the PR #103 release):
  - `/`, `/privacy`, `/auth/signin` and `/auth/signup` answer `200`;
  - `/dashboard` and the new `/settings` answer `302` to `https://streakboard.app/auth/signin`;
  - `/dev/dashboard-kitchen-sink` answers `404`, with no `@example.test` in the body;
  - the stylesheet linked from `/` carries the S-11 token values: `--ring` `oklch(45% .017 213.2)`, `--destructive` `oklch(44.4% .177 26.899)`, `--muted-foreground` `oklch(53% .021 213.5)`, and the new `--success` and `--warning` pairs, published as `--color-success` and `--color-warning`.
- [x] Owner's production check on `https://streakboard.app`, on desktop and on a phone (owner-reported, 2026-10-12, in one answer to Claude's list of checks; no values or per-step details were recorded). Result: every check passed:
  - the new layout renders;
  - Mark done and Undo work and move the leaderboard;
  - the invite link copies;
  - Sign out in the header signs out;
  - `/`, `/privacy` and `/auth/signin` look as in `context/changes/dashboard-ui/screenshots/phase1-public-*`.
- Handoff to S-12 (`refactor-opportunities`; plan reviewed, not implemented yet):
  - Since this release, a failed `/dashboard` load answers `503` with the dashboard's error page ("The dashboard didn't load", the message and "Try again"), not `200` with the banner. S-12's manual step 1.6 therefore needs `503`, and a note under its criterion says so (`context/changes/refactor-opportunities/plan.md:111`).
  - The `loadDashboard({...})` call in `src/pages/dashboard.astro` is textually unchanged, so adding S-12's `log: requestFields(Astro)` causes at most a one-line conflict. It now sits at lines 22-27, not at the `:33-38` that S-12's plan cites (`refactor-opportunities/plan.md:386`).
  - `/settings` already passes `log: requestFields(Astro)` to its own loader, `loadSettings`, which reports `settings.load.failed`; the page then answers `503`.
  - This entry took Phase 14, the number S-12's plan names for its own release record (`context/changes/refactor-opportunities/plan.md:324,343` and Progress row 5.11). S-12 records its release as Phase 15, and a note under its criterion says so.

## Phase 15 — Refactor opportunities (change `refactor-opportunities`, S-12)

**Status: ✅ Done (2026-10-15)** — all five plan phases shipped in one PR (the plan has Phase 1 as its own release and Phases 2 to 5 after it; the owner chose a single goal run instead), the migration is applied on the hosted project, and the owner's privilege query and production check passed. The slice was archived the same day (`context/archive/2026-10-06-refactor-opportunities/`, PR #128).

- [x] Code: one PR for Phases 1 to 5 (branch `s-12/refactor-opportunities/implementation`, PR #125, head `5477d6f` after the implementation-review fixes, merged 2026-10-15 18:30 UTC as merge commit `748a0e3`). The phases on the branch:
  - Phase 1 (dashboard load failures through the log helper, `dashboard.load.failed` with `requestFields(Astro)`): no migration. Its own release and production check (the plan's manual step 1.6, a forced load failure answering `503`) were not run separately; they are covered by the single release below. Worker version `5474832b-47e3-4665-bb9f-5cf63954f06a`; the owner's production check (row 5.10 below) covers the healthy load, the forced failure was not exercised on production.
  - Phase 2 (CI guards for the migration and code seam: `npm run guard:migrations`, `npm run types:check`), Phase 3 (characterization net for the data routes) and Phase 4 (contract tests for rules duplicated in SQL and TS): no migration, no runtime change; they went out with the same release.
  - Phase 5 (explicit table grants, OPP-4): migration `20261015180024_grant_core_table_privileges.sql` (`grant select, delete on public.groups, public.group_members, public.tasks to authenticated`; additive and idempotent, a no-op where the privileges already exist, so no behaviour change on production), plus the S-12 privilege scenario in `supabase/checks/rls-scenarios.sql` (300 assertions, 293 before).
- [x] `release` for PR #125: CI run 38786421083 on `master` (ci, smoke and integration `success`). The `release` job ran 18:37:06-18:38:14 UTC and finished `success` after the owner's approval; Link, List migrations, Apply pending migrations, Deploy Worker and Check the live deployment were all `success`. `migration list` showed the remote at `20261001120000` and `db push` applied exactly one migration ("Applying migration 20261015180024_grant_core_table_privileges.sql..."); Deploy Worker printed version `5474832b-47e3-4665-bb9f-5cf63954f06a`.
- [x] Owner's hosted privilege query after `db push` (Supabase Dashboard → SQL editor of the hosted project, 2026-10-15; credentialed, never through the chat): `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1, 2 order by 1, 2;`. Result (owner-reported, pasted as text): exactly six rows, all `authenticated`: `DELETE,SELECT` on `group_members`, `groups`, `task_checkoffs`, `task_participants` and `tasks`, `SELECT` on `task_checkoff_periods`; no `anon` row. Matches the README privilege table and the S-12 scenario.
- [x] Live check after the release (2026-10-15): the job's "Check the live deployment" step passed (`/` 200, `/privacy` 200 with the `mailto:` link and linked from `/`, `/dashboard` 302, the two-hop Google check). Owner's production check on `https://streakboard.app` (owner-reported, 2026-10-15, "5.10 jest ok"; no per-step details recorded): signed in, the dashboard shows the group and its tasks, a task ticked and undone.
- Follow-up releases of the same day, none with a migration: PR #127 (`e4c6f3f`, the CI reviewer timeout, run 38791883256), PR #126 (`7f62e5a`, four fixes to `scripts/migration-guard.mjs`, run 38793445907) and PR #128 (`93bfa07`, the archive, run 38794318211). Their `release` jobs were still waiting for approval when this entry was written; under the `release` concurrency group the newest run supersedes the older two, so approving the run for `93bfa07` ships all three. Record the outcome here if a later check needs it.
- Rollback: the migration grants nothing new where the defaults already hold, so there is nothing to undo on the hosted schema; a privilege is only ever removed by a later migration. The code rollback is `npx wrangler rollback` to the version before the S-12 release (the last release before S-12, run 38277781844 for PR #103, deployed `e44e8175-676c-4ae9-afa1-ba7be8a224e6`), plus reverting the merged PR on `master`.

## Phase 16 — Test coverage: release compatibility gate and the `production` tag (change `test-coverage`, S-10)

**Status: ✅ Done (2026-10-16)** — the six plan phases went out on one branch (`s-10/test-coverage/implementation`, one PR by the owner's decision; the plan has one PR per phase): PR #133 merged as `45b7657`, released by run 38825633332 (Cloudflare version `afcb86c6…`, the first automatic move of the `production` tag), the ruleset extended to six required checks, `e2e` made a prerequisite of `release` in the closeout PR #134 (merged as `b6cc39f`, released by run 38829500495; the seven docs-only merges after it, `f7526a8` (PR #135), `d98bdc3` (PR #136), `4c41aa5` (PR #138), `7c0a484` (PR #139), `39217c3` (PR #140) `a2bd473` (PR #141) and `9a18fca` (PR #142), were released by runs 38830752363, 38831820264, 38833585543, 38834468485, 38835530086, 38836506711 and 38837797127; the tag then moved to `1e971f1` with the workflow change of PR #143, run 38839223209), the hosted Auth read-back and the production check reported by the owner. The change is archived at `context/archive/2026-10-15-test-coverage/`. No migration, no new secret or variable. Rows tagged "owner-reported" can only be seen in the Supabase Dashboard, the GitHub settings or a browser session. No migration: the latest is still `20261015180024_grant_core_table_privileges.sql`, and the slice needs no new secret or variable.

- [x] Initial `production` tag (plan Phase 6, change 1): pushed on 2026-10-16 at `fb62d745635c6bdbd87136b2b0533ff9af86629a` (`git tag production <sha> && git push origin production`), equal to `origin/master` at that moment, the merge of PR #130. That commit was deployed by the `master` push run 38796422365 on 2026-10-15 (the `release` job finished `success` at 19:51 UTC; Cloudflare version `67b301f9-ef5e-421e-a5d8-f251fbad992b`), which superseded the waiting runs of PRs #126, #127 and #128 named in Phase 15. The plan's planning-time SHA `30c01bb` (PR #105, the last `release` to succeed before 2026-10-15) was stale by then and was not used. `git ls-remote --tags origin production` shows the SHA above.
- [x] CI changes shipped on the branch: the `e2e` job (Phase 3, `99a4f77`; both Playwright projects, desktop and Pixel 7); the `changes` job's `migrations` output, the `compat` job (on a PR touching `supabase/migrations/`: the tagged commit built into `deployed/`, its own smoke against a local stack carrying the PR's migrations; skipped on other PRs, red with "no production tag: create it at the deployed commit" when the tag is missing) and the `Mark the deployed commit` step of the `release` job (`contents: write` at job level, `git tag -f production "$GITHUB_SHA"` and a force push of `refs/tags/production` right after `Deploy Worker`) (Phase 6). Smoke steps, unit and integration tests, the Stryker fix and the mutation baseline (Phases 1, 2, 4 and 5) change no runtime code.
- [x] `e2e` added to `release.needs` (closeout PR, 2026-10-16, on the owner's decision after a `claude-review` LOW note on #133): the `e2e` job already ran on every `master` push, but a red run did not stop the deploy; now `release` waits for `ci`, `smoke`, `e2e` and `integration`. README (CI, release) says so. A deviation from the plan, which left `e2e` out of the release prerequisites.
- [x] The PR's own CI run (plan rows 3.4, 4.4 and 6.2): PR #133 (`s-10/test-coverage/implementation`), final head `ed73bb0`, run 38824562138 on 2026-10-15 (UTC): `ci`, `smoke`, `e2e` (both Playwright projects) and `integration` green, `compat` skipped (no migration in the PR), `ai-review` and `claude-review` green. The first head `93dfe51` had the same result (run 38823421019); `ed73bb0` answered the two bot reviews (both Stryker packages pinned to the exact `10.0.0`, the release checkout comment corrected), and the second bot round ended with `claude-review` APPROVED and three `ai-review` minors declined with facts in the PR comments. Merged on 2026-10-15 at 23:47 UTC as merge commit `45b7657e2d3503ba4519c37630bdb25f8eab0634`.
- [x] Scratch PR, red (plan row 6.4, owner's go-ahead given in the review triage of 2026-10-16, before the implementation branch was pushed): draft PR #131 (`s-10/test-coverage/scratch-compat-red`, head `943a4d4`) renamed `tasks.title`, which the deployed code inserts and reads; `compat` failed in "Run the deployed commit's smoke against the new schema" (run 38822675599, job 116722764746, 2 min 46 s): the deployed smoke's dashboard steps ("dashboard shows the group and its invite link", "dashboard shows the member list to user B") went red. Closed unmerged, branch deleted. The first attempt of both scratch PRs failed earlier in "Build the deployed commit" with `Tsconfig not found astro/tsconfigs/strict` (runs 38821951822 and 38821963128): the deployed build's resolver reads the parent checkout's `tsconfig.json`, so the root `npm ci` of the `compat` job is load-bearing (commit `ef27121`).
- [x] Scratch PR, green (plan row 6.5): draft PR #132 (`s-10/test-coverage/scratch-compat-green`, head `a9c2cb7`) added a nullable `tasks.scratch_note`; `compat` passed with all 227 steps of the deployed commit's smoke (run 38822678146, job 116722773380, 2 min 58 s). On the same run `smoke` (2 min 9 s) and `e2e` (2 min 52 s, both Playwright projects) were green on code identical to the implementation branch; `integration` was red only because `src/types.ts` was not regenerated for the scratch column. Closed unmerged, branch deleted.
- [x] Hosted Auth read-back (plan row 4.7, owner-reported on 2026-10-16, Supabase Dashboard → Authentication): rate limit for sign-ups and sign-ins 30 (the dashboard's window is 5 minutes per IP address), rate limit for sending e-mails 30 per hour, captcha not configured (off), "Confirm email" on (as since Phase 12, 2026-10-06). The values are also in the PR #133 description. Only the 429 mapping is tested (`tests/unit/auth-errors.test.ts`); the limits themselves are not exercised (test-plan §7).
- [x] `release` for the S-10 PR (plan row 6.6): nine runs, none superseded. The first, 38825633332, on the `master` push of the merge commit `45b7657` (2026-10-15 23:47 UTC); `ci`, `smoke`, `e2e` and `integration` green, `compat` skipped (push), then `release` waited in the `production` environment from 23:50 UTC and was approved by the owner; the job (116733239263) ran from 00:00:47 to 00:01:43 UTC on 2026-10-16 with every step green: `supabase db push` printed "Remote database is up to date." (no migration), `wrangler deploy` uploaded Cloudflare version `afcb86c6-c655-4cc2-b8a9-2175231a104d` (deployment created 00:01:35 UTC, the newest in `npx wrangler deployments list`), "Mark the deployed commit" moved the tag for the first time (`fb62d74...45b7657 production -> production (forced update)`; `git ls-remote --tags origin production` shows `45b7657e2d3503ba4519c37630bdb25f8eab0634`), and "Check the live deployment" passed. The second, 38829500495, on the `master` push of the closeout merge `b6cc39f` (PR #134, 2026-10-16 00:26 UTC): the first run in which `release` also waited for `e2e`; approved by the owner, the job (116745715824) ran from 00:30:05 to 00:30:55 UTC with every step green, `db push` again "Remote database is up to date.", Cloudflare version `aa7dfbb3-b41f-4fba-9a0c-9e07c82c10b5` (the same Worker code), the tag moved `45b7657...b6cc39f`, live check green. Two more runs followed from the docs-only merges to `master`: 38830752363 (merge of #135, `f7526a8`, approved by the owner, job 00:43:10 to 00:44:00 UTC on 2026-10-16, Cloudflare version `76ffdafc-0f87-4aba-9afb-1ddc4370985a`, tag moved `b6cc39f...f7526a8`) and 38831820264 (merge of #136, `d98bdc3`, approved by the owner, job 00:54:39 to 00:55:19 UTC, Cloudflare version `add19041-e80f-4416-8ba4-44cdc3134399`, tag moved `f7526a8...d98bdc3`), both with `db push` up to date and the live checks green. Until PR #143, every push to `master` ran the gate, docs-only included, so identical code waited for approval again. Since #143, a push that touches only `context/` and `*.md` files skips the gate: run 38839832301 (the merge of #144) skipped `ci`, `smoke`, `e2e`, `integration` and `release`. A fifth followed from the merge of #138 (`4c41aa5`): run 38833585543, approved by the owner, job 116758532505 from 01:13:00 to 01:13:52 UTC, `db push` up to date, Cloudflare version `02358872-b3e0-4d0f-97ea-321315dcf169`, tag moved `d98bdc3...4c41aa5`, live checks green. A sixth followed from the merge of #139 (`7c0a484`, the records PR for the fifth run): run 38834468485, approved on the owner's account, job 116761820607 from 01:24:41 to 01:25:39 UTC, `db push` up to date, Cloudflare version `e4ef8195-cff8-4bf1-ba70-9f85506618b9`, tag moved `4c41aa5...7c0a484`, live checks green. The docs-only merges to `master` (#135, #136, #138 and #139) each ran the gate, so their runs repeat identical code. Two more followed: 38835530086 (merge of #140, `39217c3`, approved by the owner, job 116764643602 from 01:35:12 to 01:36:08 UTC, Cloudflare version `51dd4cde-828b-4f38-885d-7b097c1e2c29`, tag moved `7c0a484...39217c3`) and 38836506711 (merge of #141, `a2bd473`, approved by the owner, job 116767576680 from 01:45:36 to 01:46:29 UTC, Cloudflare version `0b91acea-bd0b-4d40-a508-b0f8f6ba5797`, tag moved `39217c3...a2bd473`), both with `db push` up to date and the live checks green. The ninth, 38837797127, followed from the merge of #142 (`9a18fca`): approved by the owner, job 116771517213 from 01:59:43 to 02:00:43 UTC, `db push` up to date, Cloudflare version `5fb800c2-3a79-447d-af60-ff364fd0a5aa`, tag moved `a2bd473...9a18fca`, live checks green.
- [x] Manual rows of S-10 (the eleven still open at archive: 1.6, 1.7, 2.7, 2.8, 3.5, 3.6, 4.6, 5.6, 5.7, 5.8, 6.8), checked by the agent on 2026-10-16 at the owner's request. The archived plan is read-only, so the results are recorded here, not ticked there. **1.6** hook: passed, simulated. The end-of-turn and per-edit hooks ran with `TEST_SUPABASE_URL` pointed at an unreachable port (the unit project alone, with the note) and with the stack up (the full run); the stack was not stopped and no turn was ended. The owner accepted this simulation as the closing evidence on 2026-10-16; the real turn-end check was not run. **1.7** docs: `--logLevel debug` crashes the runner (`TypeError: Converting circular structure to JSON`, exit 1) and `info` passes; the `ignorePatterns` caveat was missing and is now in the README, and the lessons entry carries neither caveat. **2.7** leftovers: a green run (13 of 13) and a red run (a deliberate failing assertion in `invite-join`, both projects) left no `e2e-*` account and no group or membership beyond the seed account. **2.8** spec rules: passed; no timed waits, no `locator(` calls, and each spec header names its risk and the seed. **3.5** duration and artifact: the `e2e` job ran from 2 min 52 s to 3 min 23 s on the PR runs (budget 6 min); the artifact check on a scratch PR with a deliberate red spec: scratch run 38833048009 (PR #137) failed in the step "Run the Playwright suite" as intended, the upload step succeeded, and the `playwright-report` artifact (5.3 MB, not expired) was attached; the PR was closed unmerged and its branch deleted. **3.6, 4.6, 5.8, 6.8** reading: four errors, fixed in the same PR: §3 pointed at the old change folder, §5 called `e2e` and `compat` advisory or not yet required, §6.6 gave 27 killed mutants where the table gives 25, and the §8 ledger predated the ruleset change. **5.6** survivors: 53 rows, each with a verdict; the 17 `fixed by` names exist as test titles. **5.7** determinism: a re-run of `src/lib/landing.ts` gives 93.33 %, the baseline's row.
- [x] Ruleset additions (plan row 6.7, owner, GitHub → Settings → Rules → "master protection", id `24254172`): done by the owner on 2026-10-16 at 01:58 CEST (23:58 UTC on 2026-10-15) as a full-rules PUT (README, Break-glass) with the agent's prepared payload: `ci`, `smoke`, `e2e` and `compat` added to the required status checks next to `integration` and `ai-review`, each with `integration_id` 15368 (GitHub Actions); `deletion` and `non_fast_forward` unchanged, `strict` false, no bypass actors. The read-back (`gh api repos/mariuszzlotucha/streak-board/rulesets/24254172`) lists all six. The GET output from before the PUT was saved first. The agent did not edit the ruleset itself (plan, "What We're NOT Doing"): its attempt was refused by the permission classifier and the owner ran the command.
- [x] Production check after the Phase 6 release (plan row 6.10, owner, `https://streakboard.app`): done by the owner on 2026-10-16 after release run 38825633332 (Cloudflare version `afcb86c6…`): sign-in, the dashboard with the group and its tasks, a task ticked and the tick undone, all ok. The Worker code is unchanged by the slice; the check proves the release path with the tag step.
- Rollback: code only, there is no schema change. `npx wrangler rollback` returns to the previous version; afterwards the owner moves the tag by hand to the rolled-back commit (`git tag -f production <sha> && git push --force origin refs/tags/production`, README, Rollback), otherwise `compat` tests code that is no longer live. Reverting the merged PR on `master` switches the gate, the tag step and the `e2e` job off again; the tag itself can stay as documentation or be deleted (`git push origin --delete refs/tags/production`).

## Phase 17 — S-12 manual checks, closeout (branch `docs/open-items-closeout`, 2026-10-16)

**Status: Partly done (2026-10-16)** — the manual rows still unticked in the archived S-12 plan (`context/archive/2026-10-06-refactor-opportunities/plan.md`, read-only, so the results are recorded here, as for S-10 in Phase 16) were run locally at the owner's request. Basis: `origin/master` `ea4564a`. Baseline before any change: `npm test`, 40 files, 743 tests, all passed. Nothing was pushed to a scratch branch, merged, released or run against the hosted project. The owner's answers of the same day are in `context/foundation/owner-decisions.md`; the rows below record what was run after them.

- [x] **1.6** (PostgREST down, local stack): `docker stop supabase_rest_10x-astro-starter`, then `GET /dashboard` as a signed-in test user: **503** with the page "The dashboard didn't load" and "Try again", answered after 8.6 s (the plan expected about 60 s; the local gateway failed at once with `name resolution failed`). The dev log gained exactly one `dashboard.load.failed` line with `route`, `userId`, `ray` (null locally) and the cause; the new lines held no e-mail, password or cookie. The container was started again, and `/dashboard` answered 200 afterwards. The test user was deleted.
- [x] **2.6** (migration guard, on local scratch branches that were never pushed and were then deleted): a statement edit of a merged migration → exit 1; a comment-only edit → exit 0; a new migration with `drop policy` and no marker → exit 1, the same with `-- compat: <reason>` → exit 0; a new migration with an older timestamp → exit 1; an allowlist entry from `--entry` → exit 0 with one warning; editing the allowlisted file again → exit 1. **Deviation:** a duplicate allowlist line in the same branch → exit 0 with two warnings (the plan expected exit 1). The variant "a line already at base" could not be run, because `origin/master` has no `supabase/checks/migration-edit-allowlist.txt` yet. Owner decision (2026-10-16): a duplicate line must fail the guard. Done in `scripts/migration-guard.mjs`, re-checked on a scratch branch that was never pushed: two identical lines exit 1, one line exits 0 with one warning.
- [x] **2.7** (`types:check`): renaming `join_code` to `join_code_renamed` in `src/types.ts` → exit 1 with the diff; restored → exit 0.
- [x] **2.9** (docs read-through): the README commands `guard:migrations` and `types:check`, the `npx supabase gen types typescript --local` command in CLAUDE.md and README, the CI job that runs both (`integration`, step `Check migrations`) and the S-12 lessons entry match the code. One correction in this change: the `test-plan.md` header said `Last updated: 2026-10-15`, while its §8 ledger records the 2026-10-16 edits; the header now says 2026-10-16.
- [x] **3.4** (route tests in `tests/integration/data-routes.test.ts`; each break restored with `git checkout --`): name limit 81 in `group-rules.ts` → 1 test red (`81-character name: invalid_name`); 42501 and 23505 swapped in `group-errors.ts` → several red; the zero-row redirect of `rename.ts:41` changed to `/dashboard` → 1 red; the `reportError("uncheck.failed", …)` line removed from `uncheck.ts:41` → 2 red.
- [x] **3.5** (coverage guard, `coverage guard` in `data-routes.test.ts`): an empty `src/pages/api/tasks/probe.ts` → 1 failing; file removed → 2 passing.
- [~] **3.6** (test names): a red row names its route and case (e.g. `POST /api/groups/rename > update touches no row (not the owner): forbidden, quiet`). Of the 150 names in that file, 42 start with an SQLSTATE or `XX000` code (e.g. `42501: forbidden with an error line carrying the status`) and read as labels rather than sentences. Not renamed in Phase 17. Owner decision (2026-10-16), done afterwards: the 42 code-prefixed titles in `tests/integration/data-routes.test.ts` now describe the case in words; the codes stay in the scripted errors and the assertions.
- [x] **4.5** (contract tests in `tests/unit/group-rules.test.ts` and `tests/unit/task-rules.test.ts`): limit 81 → 3 red; NBSP added to the trim set → 2 red; `"monthly"` in `TASK_RECURRENCES` → 2 red; each restored.
- [x] **5.5** (privileges, local database only): `revoke select, delete on public.groups, public.group_members, public.tasks from authenticated` → the S-12 block fails with `S-12 authenticated holds exactly DELETE,SELECT on groups -- expected DELETE,SELECT, got NULL` (exit 3). Re-applying `20261015180024_grant_core_table_privileges.sql` brings all 300 assertions back, and `information_schema.role_table_grants` equals the table taken before the revoke.

Run with the owner's go-ahead on 2026-10-16, with a scratch migration that was never committed and was deleted afterwards:

- [x] **4.6**: the scratch migration `20261016120000_scratch_s12_check_4_6.sql` moved `groups_name_length` from `between 1 and 80` to `between 1 and 81`. `npx supabase db reset` applied it, and `npm test` went red: 9 failing tests in `tests/integration/rule-contracts.test.ts`, starting with the 81-character row (`expected undefined to be '23514'`). The log also shows `cleanupUsers: deleteUser failed`, and the comment at `tests/integration/rule-contracts.test.ts:22-24` names the `owner_id … on delete restrict` foreign key as the cause for groups left untracked; later rows reported `group_members_user_id_key`. The scratch file was removed, and `npx supabase db reset` restored the constraint to `<= 80` (checked in `pg_constraint`).
- [x] **5.6**: `npx supabase db reset && npm run test:rls && npm test` on the restored database: RLS 300 assertions passed; `npm test` 40 files, 743 tests, all passed.
- Repository setting, owner's decision: Dependabot alerts enabled with `gh api -X PUT repos/mariuszzlotucha/streak-board/vulnerability-alerts` (204, read back 204). The read had returned 403 before.

Not run:

- [ ] **2.8**: declined by the owner on 2026-10-16. The `integration` merge block stays unchecked by hand.
- [ ] **5.12**: skipped by the owner on 2026-10-16 (optional, owner only).

Observation, not investigated: before the 1.6 check, the dev server logged `Invalid hook call` and `TypeError: Cannot read properties of null (reading 'useContext')` from `lucide-react` inside a React island, after a `[vite] program reload`. It did not recur during the check. It appears in dev only; the production build was not checked for it.

## Phase 18 — S-14 nickname: two releases (change `nickname`, S-14)

**Status: Done (2026-10-16)** — the change ships in two releases, because the `compat` job runs the smoke of the commit under the `production` tag against the PR's migrations (`context/changes/nickname/plan.md`, "Critical Implementation Details"). Release 1 (plan Phase 1) added the nickname next to the e-mail address in `list_group_members` and switched all the code to it. Both releases went out on 2026-10-16 and the owner checked production after each. Release 2 (plan Phase 2) drops the `email` column from `list_group_members`; its PR could be opened only while the tag pointed at a commit that contains the Phase 1 merge, and its record below was filled in by the closing docs PR after its own release (lesson "Close every slice by merging to master, approving the production release and checking the production URL").

Release 1 (migration A):

- [x] Code: PR #150 (branch `s-14/nickname/implementation`, https://github.com/mariuszzlotucha/streak-board/pull/150), merged on 2026-10-16 at 15:47 UTC as merge commit `62204c7`. `compat` ran green on the PR (CI run 38925547891: the smoke of the then-deployed commit `144fd2a` against migration A).
- [x] `release` for PR #150: CI run 38926815420 on the `master` push of `62204c7`: `ci`, `smoke`, `e2e` and `integration` green, `compat` skipped on `master` (it runs on PRs only); `release` was approved by the owner, and its job ran from 15:52:29 to 15:53:37 UTC with every step green. `supabase db push` applied exactly one migration, `20261016162551_add_nicknames.sql`; `wrangler deploy` printed `Current Version ID: cba83d63-5e2a-4fcd-96b2-ede52cf879eb`; "Mark the deployed commit" moved the tag `144fd2a...62204c7 production -> production (forced update)`. `git ls-remote --tags origin production` showed `62204c78e2b2ca631a488db6bf26f985fdfb5a9a` on 2026-10-16.
- [x] Anonymous live check by the agent (2026-10-16, about 15:56 UTC, `https://streakboard.app`): `/` 200; `/privacy` 200 with the new nickname text ("The other members of your group see your nickname … They do not see your e-mail address."); `/dashboard` 302 to `/auth/signin`; `/account/nickname` 302 to `/auth/signin`.
- [x] Owner's signed-in production check (plan row 1.19), 2026-10-16: the owner's account reached the nickname page once, and after saving, the dashboard showed the nickname; `/settings` showed the own e-mail address and `/privacy` the new text (confirmed by the owner).
- [x] Google account on production (plan row 1.20), 2026-10-16: the nickname page was prefilled with the name from Google, so the provider does send `full_name` or `name` in `user_metadata` and `suggestNickname` accepted it (confirmed by the owner; the local stack has no Google provider).
- RLS scenario assertions: 326 after Phase 1 (the S-14 section and the nickname rows of S-01).

Release 2 (migration B, `20261016175817_drop_email_from_list_group_members.sql`):

- [x] Code: PR #151 (branch `s-14/nickname/phase-2`, cut from `origin/master` `62204c7`, https://github.com/mariuszzlotucha/streak-board/pull/151), merged on 2026-10-16 at 16:18 UTC as merge commit `a08916e`. Migration B drops and recreates `list_group_members` with `returns table (user_id uuid, nickname text, joined_at timestamptz, is_owner boolean)`, without the join of `auth.users`. The RLS scenarios lose the two e-mail assertions of S-01 and gain "S-14 list_group_members has no email column" and "S-14 list_group_members returns exactly user_id, nickname, joined_at, is_owner" (Phase 2 review, F2): 326 assertions.
- [x] Tag check before the PR is opened (plan row 2.8): `git ls-remote --tags origin production` must name a commit that contains the Phase 1 merge `62204c7` (`git merge-base --is-ancestor 62204c7 <tag sha>` exits 0). Result: on 2026-10-16, right before PR #151 was opened, the tag was at `62204c78e2b2ca631a488db6bf26f985fdfb5a9a` (the Phase 1 merge itself) and the check exited 0.
- [x] `compat` on the PR (plan row 2.7): the smoke of the tagged Phase 1 commit `62204c7` against migration B passed on PR #151 (CI run 38930254593); every other check of the PR was green too, `ai-review` included.
- [x] `release` for PR #151 (plan row 2.9): CI run 38930891536 on the `master` push of `a08916e`: `ci`, `smoke`, `e2e` and `integration` green, `compat` skipped on `master`; `release` was approved by the owner, and its job (117075739069) ran from 16:22:07 to 16:23:12 UTC with every step green. `supabase db push` applied exactly one migration, `20261016175817_drop_email_from_list_group_members.sql` (16:22:56 UTC); `wrangler deploy` printed `Current Version ID: 83a2cb88-c07c-477a-99db-fd0e1a6f51f4`; "Mark the deployed commit" moved the tag `62204c7...a08916e production -> production (forced update)`, and "Check the live deployment" passed. Anonymous live check by the agent at about 16:24 UTC: `/` 200, `/privacy` 200, `/dashboard`, `/settings` and `/account/nickname` 302 to `/auth/signin`.
- [x] Owner's production check after release 2 (plan row 2.10), 2026-10-16: the dashboard with a group loads, the member list, the task participants and the leaderboard show nicknames, and `/settings` shows the own e-mail address (confirmed by the owner).

E-mail exposure window (Phase 1 review, F2): from release 1 the privacy policy says the other members do not see a member's e-mail address, while `list_group_members` still returned it to any member who called the RPC directly through PostgREST (the app itself no longer passed it on). The window opened with release 1 on 2026-10-16 at 15:53 UTC and closed when release 2 applied migration B on 2026-10-16 at 16:22:56 UTC, about 30 minutes.

Rollback:

- Code: `npx wrangler rollback` to the previous Worker version, then the owner moves the tag by hand to the rolled-back commit (`git tag -f production <sha> && git push --force origin refs/tags/production`, README, Rollback), otherwise `compat` tests code that is no longer live.
- Schema: not rolled back. Rolling the code back to release 1 (`cba83d63-5e2a-4fcd-96b2-ede52cf879eb`, `62204c7`) is safe after migration B, because that code reads only `user_id`, `nickname`, `joined_at` and `is_owner`. Code from before release 1 names members by `email`, which no longer exists after migration B: PostgREST returns the rows without that key, so that code would show every member as "Unknown member" (or with no name) instead of failing, and a rollback below release 1 needs a separate migration that restores the column first. Migration A adds a table, a function and a column, so code from before release 1 runs on it unchanged as long as migration B is not applied.

## Phase 19 — Code reviewer evals: two releases with the app unchanged (change `code-review-evals`)

**Status: Done (2026-10-17)** — the change adds the promptfoo eval suite of the AI reviewer and hardens the `ai-review` gate (`context/changes/code-review-evals/plan.md`); it touches no app code. From the tag's previous commit `737889f` (S-15) to `bcbaec9`, the only files changed outside `packages/code-reviewer/`, `tests/`, `context/` and Markdown are the gate's workflows and action, `.gitignore`, `.prettierignore`, `eslint.config.js` and the `yaml` devDependency (`package.json`, `package-lock.json`). Each merge still ran `release`, because the `changes` job counts every file outside `context/` and Markdown as code, so both releases redeployed the same app, without a migration.

- [x] Release 1, PR #159 (branch `code-review-evals/implementation`, https://github.com/mariuszzlotucha/streak-board/pull/159), merged on 2026-10-16 at 23:40 UTC as merge commit `c36d718`: CI run 38982681393 on the `master` push: `ci`, `smoke`, `e2e` and `integration` green, `compat` skipped on `master`; `release` was approved by the owner, and its job (117247897234) ran from 23:45:23 to 23:46:14 UTC with every step green. `supabase db push` reported "Remote database is up to date." (no migration); `wrangler deploy` printed `Current Version ID: f103040c-2208-4069-bd8d-025c9ddd7b3b`; "Mark the deployed commit" moved the tag `737889f...c36d718 production -> production (forced update)`. Anonymous live check by the agent at about 23:50 UTC: `/` 200, `/privacy` 200, `/dashboard` 302 to `/auth/signin`.
- [x] Release 2, PR #161 (branch `code-review-evals/review-fix`, https://github.com/mariuszzlotucha/streak-board/pull/161: the fixes for the three `minor` findings of the `ai-review` of #159), merged on 2026-10-17 at 00:14 UTC as merge commit `bcbaec9`: CI run 38985447798 on the `master` push: `ci`, `smoke`, `e2e` and `integration` green, `compat` skipped; `release` was approved by the owner, and its job (117256679388) ran from 00:18:36 to 00:19:26 UTC with every step green. No migration ("Remote database is up to date."); `Current Version ID: 8d8415f0-5a4e-493d-8c27-a195fffa6b97`; the tag moved `c36d718...bcbaec9`. Anonymous live check by the agent at about 00:20 UTC: `/` 200, `/privacy` 200, `/dashboard` 302 to `/auth/signin`.
- No signed-in production check: the app code is the one of `737889f`. The reviewer and the gate are not part of the Worker; they act on the next PR from `master`.

## Phase 20 — Account deletion (change `account-deletion`, S-15)

**Status: released 2026-10-16; manual rows open** — the change adds deletion of the caller's account in `/settings`, with the warning dialog, the successor choice for an owner with members, and the notice on `/?account=deleted` (`context/archive/2026-10-16-account-deletion/plan.md`). It shipped as one release, with migration `20261016180000_account_deletion_and_ownership_transfer.sql`. The plan's manual rows are not all ticked in the archive, which is read-only by convention, so this entry records what is confirmed and what is still open.

- [x] Code: PR #156, merged on 2026-10-16 at 18:51 UTC as merge commit `737889f`. Master run 38950529557 (`ci`, `smoke`, `e2e`, `integration` green; `compat` skipped on `master`).
- [x] `release` for PR #156: job 117142078394, approved by the owner. `supabase db push` applied `20261016180000_account_deletion_and_ownership_transfer.sql` (18:56 UTC); `wrangler deploy` printed `Current Version ID: a07437e3-97f0-4b19-bb4b-065cb9c73536`; "Mark the deployed commit" moved the tag `79d97cd...737889f production -> production (forced update)`.
- [x] Anonymous live check by the agent (2026-10-16 after the release, and again on 2026-10-17 at about 00:30 UTC): `/` 200; `/privacy` 200; `/dashboard` 302 to `/auth/signin`; `/?account=deleted` 200 with the notice "Your account has been deleted."
- [x] The owner deleted an account on production and reported that it worked. Every deletion runs the `auth.flow_state` DELETE first, so this also covers plan row 1.8 in substance, although the SQL check of row 1.8 is not recorded.
- [x] CI on the PR (plan row 4.5): every check of #156 passed, `ai-review` included (`ci`, `smoke`, `e2e`, `integration`, `compat`, `claude-review`, `ai-review`).
- [ ] Open, owner's checks (plan rows still `[ ]` in the archive): 1.8 (`has_table_privilege('postgres','auth.flow_state','DELETE')` on production, recorded here if run); 2.5 and 3.5 (the kitchen-sink screenshots of `settings-*` and `dashboard-new-owner`); 2.6 (the successor window operable from the keyboard alone); 3.6 (each of the four window variants read in a browser); 4.4 (`/privacy` sections on deletion, retention and rights read and accepted); 5.2 (two test accounts, a task checked off by the second, ownership transfer and the new owner's banner on `streakboard.app`); 5.3 (a member deletes an account on production and lands on `/?account=deleted`, the task stays with the owner with the second account's checkoff, and an owner who is the sole member is handled).

## Phase 21 — Installable app (change `installable-pwa`, S-17)

**Status: released 2026-10-17; Android and desktop confirmed, iOS pending.** The change makes StreakBoard installable: a manifest, icons, a service worker that caches nothing, the "new version" notice, `POST /api/client-errors`, the 404 page, the installed-app invite hint and a privacy policy line (`context/changes/installable-pwa/plan.md`). It shipped as one release with no migrations.

- [x] Code: PR #168, merged on 2026-10-17 as merge commit `d2b2323`. Master run 39033118236: `ci`, `smoke`, `e2e` and `integration` green; `compat` skipped on `master`.
- [x] `release` for PR #168: job 117398261198, approved by the owner. `supabase db push` reported "Remote database is up to date" (no migrations); `wrangler deploy` printed `Current Version ID: c7060200-0c8d-4817-bc8d-8042eb0f65e9`; "Mark the deployed commit" moved the tag `bcbaec9...d2b2323 production -> production (forced update)`.
- [x] Agent's live check (2026-10-17, anonymous `curl`):
  - `/` 200;
  - `/dashboard` 302 to `/auth/signin`;
  - `/manifest.webmanifest` 200 `application/manifest+json`, `cache-control: no-cache`;
  - `/sw.js` 200 `text/javascript`, `cache-control: no-cache`;
  - `/icons/icon-192.png` 200 `image/png`;
  - `/no-such-page` 404 `text/html`;
  - `POST /api/client-errors` with a JSON body 415.

  This covers plan row 2.2.

- [x] Owner's device checks (2026-10-17):
  - 2.3 Android Chrome: installed through the ⋮ menu ("Install app"); sign-in with e-mail and with Google, invite link pasted into "Join with code", and check-off all confirmed in the installed app. Chrome showed no automatic install prompt; that is expected, since the plan chose the browser's prompt only, with no prompt of our own.
  - 2.4 Desktop: Chrome on Ubuntu, installed and opened in its own window, check-off confirmed. Edge skipped by the owner.
  - 2.5 After sign-out, the installed app showed no data of the previous user.
- [ ] Open, iOS: `context/changes/installable-pwa/ios-check.md` handed to a group member with an iPhone; result pending (plan row 2.6).

## Phase 22 — Toast notifications (change `frontend-notifications`)

**Status: released 2026-10-17.** Success toasts after every group, task and nickname action (`?notice=<code>`), and dashboard errors as a toast that stays until closed (`context/archive/2026-10-17-frontend-notifications/plan.md`). One release, no migrations.

- [x] Code: PR #182, merged on 2026-10-17 as merge commit `7b81aec`. Master run 39068898243: `ci`, `smoke`, `e2e` and `integration` green; `compat` skipped on `master`.
- [x] `release` for PR #182: job 117502928385, approved by the owner. `supabase db push` reported "Remote database is up to date." (no migrations); `wrangler deploy` printed `Current Version ID: 0e373c35-04d5-464c-a0f8-b1f264f3b786`; the tag moved `bd62687...7b81aec production -> production (forced update)`.
- [x] Agent's live check (2026-10-17, anonymous `curl`): `/` 200, `/privacy` 200, `/dashboard` and `/dashboard?notice=task_created` 302 to `/auth/signin`.
- [x] Owner's check on `streakboard.app` (2026-10-17), reported OK: a task create shows the toast, it hides after about 5 s and waits while hovered, Escape and the close button hide it, a reload does not repeat it, and a bad invite code shows an error toast that stays until closed. This covers plan rows 2.6 and, in substance, 1.6 (except the CSP report check on `npm run preview`).
- [ ] Open, owner's checks (plan rows still `[ ]` in the archive): 1.6 (no CSP report on `npm run preview`), 1.7 (phone width: the toast covers neither the update notice nor page controls), 1.8 (`?notice=bogus` shows nothing), 2.7 (the `action-error` and `notice-success` kitchen-sink PNGs in light and dark mode).

## Phase 23 — Unique names and the landing grid text (PRs #184, #187; no change folder)

**Status: released 2026-10-17.** Task titles are unique within a group, and group names and nicknames across the app, all regardless of letter case (PR #184, docs in PR #185). The landing page describes the per-task grid instead of a shared spreadsheet (PR #187). Both went out in one release, with one migration. Neither has a change folder: both are small direct PRs, not roadmap slices. M-3 was closed in PR #186, docs-only, the same day.

- [x] Code: PR #184, merged on 2026-10-17 as `ff8b7bf`. Its master run 39071289558 had `ci`, `smoke`, `e2e` and `integration` green, then waited for approval and was cancelled when the next release queued (superseded, not approved). PR #187, merged as `96ce53c`; master run 39072156107: `ci`, `smoke`, `e2e` and `integration` green, `compat` skipped on `master`. The docs-only merges PR #185 (`3e01842`, run 39071304890) and PR #186 (`0c25907`, run 39072229889) skipped `release`.
- [x] `release` for `96ce53c` (it carries #184 and #187): job 117512613802, approved by the owner. `supabase migration list` showed `20261017150000` as local only. `supabase db push` printed "Applying migration 20261017150000_unique_names.sql..." and "Finished supabase db push.". `wrangler deploy` printed `Current Version ID: 6871079b-9133-4ebc-a7e1-3297301e6a86`. The tag moved `7b81aec...96ce53c production -> production (forced update)`.
- [x] No backfill needed: before the release the owner deleted the only production account, so the new unique indexes had no rows to check. As a side effect, production has no accounts and no push subscriptions. The `reminder_secret` hash does not depend on accounts and stays.
- [x] Agent's live check (2026-10-17, anonymous `curl` on `https://streakboard.app`): `/` 200 with the "Every task, at a glance" section and no "shared spreadsheet"; `/privacy` 200 with the sentence on unique nicknames and group names; `/dashboard` 302 to `/auth/signin`; `/auth/callback` 302 to `/auth/signin?error=link_expired`. `supabase migration list --linked` lists `20261017150000` both locally and remotely. `git ls-remote --tags origin production` shows `96ce53c`.
- [ ] Open, owner's checks:
  - Sign up again, choose a nickname, and create a group and tasks.
  - A second task whose title differs only in case shows "Your group already has a task with this name. Pick another one."
  - Turn reminders on again in Settings on the phone before the next 20:00 Warsaw run. The S-16 fan-out CPU check with `wrangler tail` needs at least one subscription.

## Phase 24 — Install promotion (change `install-promotion`, S-19)

**Status: released 2026-10-18; device checks pending.** StreakBoard now promotes its own installation: an "Install StreakBoard" card on the dashboard and an always-present block in the Settings Reminders card, with the offer chosen per browser, "Not now" kept in local storage on that device, and a privacy policy line on it (`context/archive/2026-10-18-install-promotion/plan.md`). One release, no migrations.

- [x] Code: PR #191, merged on 2026-10-18 as merge commit `1b51d4d`. Master run 39080963661: `ci`, `smoke`, `e2e` and `integration` green; `compat` skipped on `master`.
- [x] `release` for PR #191: job 117538378740, approved by the owner. `supabase db push` reported "Remote database is up to date." (no migrations); `wrangler deploy` printed `Current Version ID: 29a855da-0e59-4ff6-a43e-cdb47a1ccc38`; the tag moved `1d0fc23...1b51d4d production -> production (forced update)`. The job's "Check the live deployment" step passed. This covers plan row 3.1. The previous tag, `1d0fc23`, is the merge of PR #189 (invite auto-join), recorded in Phase 25.
- [x] Agent's live check (2026-10-18, anonymous `curl` on `https://streakboard.app`):
  - `/` 200;
  - `/privacy` 200 with the sentence on "Not now" kept in local storage;
  - `/dashboard` 302 to `/auth/signin`;
  - `/manifest.webmanifest` 200 `application/manifest+json`;
  - `/sw.js` 200 `text/javascript`.
- [ ] Open, owner's and group member's device checks (plan rows still `[ ]` in the archive; record the results here):
  - 3.2 Android Chrome: the dashboard shows either the "Install app" button or the menu instruction; the owner reports which (resolves research Open Question 1).
  - 3.3 Desktop Chrome: the same check; installing opens the app window with no card. Then `streakboard.app` in a normal tab: Chrome sends no `beforeinstallprompt` once installed, so the card still offers installing there until "Not now" (impl review F7); decide whether that needs a follow-up (`getInstalledRelatedApps`).
  - 3.4 iPhone, by a group member through `context/archive/2026-10-18-install-promotion/ios-check.md`: the card in Safari, installing from it, no card in the installed app, reminders turned on there and the 20:00 reminder received. Phase 21's iOS row is a separate check (S-17's `ios-check.md`) and stays open.
  - 3.5 A messenger's in-app browser on a phone shows "Open this page in Safari to install StreakBoard." on an iPhone and "Open this page in Safari or Chrome to install StreakBoard." elsewhere.
  - Still open from Phases 1-2: 1.3 (the `IN_APP_BROWSER_PATTERNS` list reviewed against the messengers the group uses), 2.7 (kitchen-sink screenshots of every install state in light and dark mode at phone width), 2.8 (the card and the inline block at 412 px, with no collision with the toast or the update notice).

## Phase 25 — Invite auto-join (PR #189; no change folder)

**Status: released 2026-10-17, before Phase 24 (recorded afterwards).** A pending invite is joined at once on the first dashboard visit, and it survives a sign-up in one browser and a sign-in in another: `POST /api/auth/signup` keeps the code with the account (`user_metadata.join_code`), `/dashboard` joins through `joinPendingInvite` (`src/lib/pending-invite.ts`, cookie first, then the stored code), and the `join_code` cookie lives 7 days instead of 1 hour. The privacy policy, README and CLAUDE.md were updated in the same PR. A small direct PR, not a roadmap slice, so no change folder. One release, no migrations.

- [x] Code: PR #189, merged on 2026-10-17 as merge commit `1d0fc23`. Master run 39075155221: `ci`, `smoke`, `e2e` and `integration` green; `compat` skipped on `master`. The next merge, PR #190 (`dc9adf3`, run 39076725932, the S-19 plan), was docs-only and skipped `release`, so production stayed on `1d0fc23` until Phase 24.
- [x] `release` for PR #189: job 117521519959, approved by the owner. `supabase db push` reported "Remote database is up to date." (no migrations); `wrangler deploy` printed `Current Version ID: 8e81b990-f32c-4f95-a19a-42622f452655`; the tag moved `96ce53c...1d0fc23 production -> production (forced update)`. The job's "Check the live deployment" step passed.
- [ ] Open: no check of the invite path on `streakboard.app` is recorded (open an invite link, sign up, confirm, land in the group with the "You joined the group." toast; and the same with the confirmation link opened in another browser).

## Phase 26 — iOS status bar and safe areas (PR #198; no change folder)

**Status: in review.** On a friend's iPhone the iOS status bar overlapped the app header (S-19 research, Open Question 5). `SiteHeader` is now sticky, so iOS 26 Safari tints the status bar with the header's background. `viewport-fit=cover` with `env(safe-area-inset-*)` paddings keeps the header, the footer, the toast and the new-version message clear of the status bar, the home indicator and Android's gesture bar wherever the page runs under them. It is a small direct PR, not a roadmap slice, so it has no change folder. One release, no migrations. M-3 is closed in PR #197, docs-only, after this release.

- [ ] Code: PR #198 merged; master run with `ci`, `smoke`, `e2e` and `integration` green.
- [ ] `release` for PR #198, approved by the owner: `wrangler deploy` version ID and the `production` tag move.
- [ ] Agent's live check (anonymous `curl` on `https://streakboard.app`): `/` 200 with `viewport-fit=cover`; `/dashboard` 302 to `/auth/signin`.
- [ ] Open, device checks (the list in PR #198):
  - iPhone, Safari: on a scrolled dashboard the status bar takes the header's colour, and no page content shows behind the clock.
  - iPhone: in the installed app and in a messenger's in-app browser the header sits below the status bar, and the footer and the new-version message clear the home indicator.
  - Android, the owner's installed app: the status bar and the header look as before, and the end of the page clears the gesture bar.

## Verification checklist (end-to-end, once unblocked)

- [x] Fresh browser session against the live `*.workers.dev` URL: sign up, confirm-email flow (or note if stubbed), sign in, hit `/dashboard`, sign out. — superseded by the Phase 10 production checks on `https://streakboard.app` (`workers.dev` is switched off by Phase 4 of that change).
- [x] `npx wrangler tail` shows clean request logs, no uncaught exceptions. — closed by the owner on 2026-10-09.
- [x] `npx wrangler kv namespace list` still returns `[]`. — closed by the owner on 2026-10-09.
- [x] `npx wrangler rollback` confirmed as the documented recovery path in `README.md`. — closed by the owner on 2026-10-09.

## Out of scope

- **GitHub Actions / deploy-on-merge automation** — originally excluded from this plan; now delivered by change `release-automation-and-auth-hardening` (gated `release` job in `.github/workflows/ci.yml`, Workers Builds disabled).
- **Custom domain binding** — originally deferred (default `workers.dev` subdomain); now delivered by change `custom-domain` (Phase 10).
- Staging environment / `[env.staging]` in `wrangler.jsonc` — deferred, single production environment for this MVP.
- Docker, multi-region/HA/DR — out of scope per `infrastructure.md`.
