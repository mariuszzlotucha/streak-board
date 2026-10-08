---
project: streak-board
based_on: context/foundation/infrastructure.md
platform: Cloudflare Workers
status: phases_0-4_done_pending_auth_smoke_test
last_updated: 2026-09-25
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
- [ ] Full browser smoke test (sign-up, sign-in, `/dashboard` check-off) — route-level checks only so far (`/` 200, `/auth/signin` 200, `/dashboard` unauth 302).

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

- [ ] Full browser sign-up/sign-in/check-off smoke test against the live URL (only route-level HTTP checks done so far, not actual Supabase auth flow).

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

**Status: ⏳ Waiting for Google's review (2026-10-08)** — the release, the HTTPS switch, the production check and both Google submissions are recorded below; Google's verdict on the review request is recorded by the change's Phase 3. Rows tagged "owner-reported" can only be seen in the Cloudflare dashboard, Search Console, the Google Cloud Console or a browser session; Claude did not see them.

- [x] Code (plan Phase 1) in PR #89, merged 2026-10-08 16:49 UTC as merge commit `caef850`. The merge adds nothing under `supabase/migrations/`; the latest is still `20261002090000_create_task_checkoffs.sql`.
- [x] Secret `CONTACT_EMAIL` (the controller's contact address shown on `/privacy` and in the footer) set by the owner with `npx wrangler secret put CONTACT_EMAIL` before the release; `npx wrangler secret list` shows it next to `SENTRY_DSN`, `SUPABASE_KEY` and `SUPABASE_URL`. The value is not in the repository.
- [x] `release` for PR #89: CI run 37811849750 on `master` (ci, smoke and integration `success`); the `release` job ran 2026-10-08 16:53:02-16:54:20 UTC and finished `success` after the owner's approval (Link, List migrations, Apply pending migrations, Deploy Worker and Check the live deployment all `success`). Nothing was applied. "Check the live deployment" includes the new checks: `/privacy` answers 200 with a plain `mailto:` link and `/` links `/privacy`. Active deployment afterwards (`npx wrangler deployments list`): 100% on version `ccd31a3f-a214-4d78-b2a8-7405317a9c1e`, created 16:54 UTC. The pending `release` of the plan PR's merge (`829d73a`, run 37805282553) was cancelled by the `release` concurrency group when this one queued; it held only documents.
- [x] Always Use HTTPS (owner, Cloudflare dashboard → `streakboard.app` → SSL/TLS → Edge Certificates): on. Claude's check (2026-10-08, `curl -sI`): `http://streakboard.app/`, `/auth/signin` and `/privacy` answer `301` to the same path on `https://`.
- [x] Claude's production check (2026-10-08, anonymous `curl` after the release): `/`, `/privacy`, `/auth/signin`, `/auth/signup` and `/auth/confirm-email` answer `200`; `/` carries the heading "Keep each other on track." and links `/auth/signup`, `/auth/signin` and `/privacy`; `/privacy` carries the "Privacy Policy" heading, the supervisory authority's name and a plain `mailto:` link with the owner's address in 4 places, and no page contains `/cdn-cgi/l/email-protection` or `data-cfemail` (no Cloudflare e-mail obfuscation); every public page carries the brand link to `/` and the footer link to `/privacy`; the sign-up page carries the notice that group members see the e-mail address; no page contains `bg-cosmic` or the starter's name; `/template.png` answers `404`, `/favicon.svg` and `/favicon.png` `200`; an anonymous `/?error_code=flow_state_already_used` answers `302` to `/auth/signin?error=oauth_failed` and `/dashboard` `302` to `/auth/signin`.
- [x] Owner's production check (owner-reported, 2026-10-08, in one answer to Claude's list; no values or per-step details were recorded): the pages at phone width; signing in, then opening `/`, lands on `/dashboard`; the `sb-` cookies are marked Secure in DevTools; Google sign-in works for a listed tester; signing out works.
- [x] Search Console review request (owner-reported, 2026-10-08, sent after the release, the HTTPS switch and the production check): Security issues → "Deceptive pages" → Request review, with the text from the `landing-page` plan (Phase 2, change 4) and "live since 8 October 2026".
- [x] Google Auth Platform → Branding (owner-reported, 2026-10-08): App home page `https://streakboard.app/`, privacy policy link `https://streakboard.app/privacy`, authorized domain `streakboard.app`. The app stays in Testing, so these are Draft Branding that users do not see.
- [ ] Google's verdict on the review request (Search Console and the Transparency Report): recorded by the `landing-page` Phase 3 docs PR. While the review is pending, the public pages are fixed forward, not reverted.

## Verification checklist (end-to-end, once unblocked)

- [ ] Fresh browser session against the live `*.workers.dev` URL: sign up, confirm-email flow (or note if stubbed), sign in, hit `/dashboard`, sign out. — superseded by the Phase 10 production checks on `https://streakboard.app` (`workers.dev` is switched off by Phase 4 of that change).
- [ ] `npx wrangler tail` shows clean request logs, no uncaught exceptions.
- [ ] `npx wrangler kv namespace list` still returns `[]`.
- [ ] `npx wrangler rollback` confirmed as the documented recovery path in `README.md`.

## Out of scope

- **GitHub Actions / deploy-on-merge automation** — originally excluded from this plan; now delivered by change `release-automation-and-auth-hardening` (gated `release` job in `.github/workflows/ci.yml`, Workers Builds disabled).
- **Custom domain binding** — originally deferred (default `workers.dev` subdomain); now delivered by change `custom-domain` (Phase 10).
- Staging environment / `[env.staging]` in `wrangler.jsonc` — deferred, single production environment for this MVP.
- Docker, multi-region/HA/DR — out of scope per `infrastructure.md`.
