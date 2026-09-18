---
project: streak-board
based_on: context/foundation/infrastructure.md
platform: Cloudflare Workers
status: in_progress
last_updated: 2026-09-18
---

# Cloudflare Workers Deployment Plan

Deployment runbook for streak-board, derived from `context/foundation/infrastructure.md`'s platform research. Covers **manual CLI deployment only** — GitHub Actions / deploy-on-merge automation is explicitly out of scope for this plan.

This file is a living checklist, not a one-time research artifact — update the checkboxes and "Discovered issues" as phases complete or new edge cases surface.

## Starting state (verified 2026-09-18)

- `npx wrangler deployments list` → `This Worker does not exist on your account` (error 10007) — nothing deployed yet.
- `npx wrangler kv namespace list` → `[]` — no KV namespaces provisioned.
- `npx wrangler whoami` → authenticated as `mariusz.zlotucha@gmail.com`, account ID `cef23e668d98bfbd15b2253f243c5556`.
- Repo already has `@astrojs/cloudflare@^14.3.1` and a Workers-with-static-assets `wrangler.jsonc` (not Cloudflare Pages — the adapter dropped Pages support; don't follow Pages-era tutorials or `_worker.js`/`functions/`-directory instructions).

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
- [ ] Commit `astro.config.mjs` (holding until you review/request the commit — not done automatically).
- [ ] If a future feature genuinely needs Astro's session API (flash messages, CSRF nonces) alongside Supabase auth, don't silently flip this back — re-open the decision explicitly and log it via `/10x-lesson`.

## Phase 2 — Manual first deploy

**Status: ⚠️ Blocked — discovered issue below**

- [ ] Set production secrets (**you run these yourself**, not through this session — `wrangler secret put` reads a real credential from stdin and shouldn't pass through a chat transcript):
  ```
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```
  Use your **production** Supabase project's URL and anon/public key (Supabase dashboard → Project Settings → API) — not the `.env` file's `http://127.0.0.1:54321` local-dev values.
- [ ] Confirm: `npx wrangler secret list` (shows names only, never values).
- [ ] Build and deploy: `npm run build && npx wrangler deploy`.
- [ ] Note the resulting `*.workers.dev` URL from the deploy output.
- [ ] Tail logs while exercising the app: `npx wrangler tail` in one terminal, then in a browser hit sign-up, sign-in, and the `/dashboard` check-off flow against the deployed URL.

### Discovered issue: account has no `workers.dev` subdomain registered

Attempted `npx wrangler deploy` on 2026-09-18 and hit:
```
✘ [ERROR] Wrangler could not automatically register "10x-astro-starter" as your workers.dev
  subdomain because the name is unavailable. Register a different subdomain at
  https://dash.cloudflare.com/cef23e668d98bfbd15b2253f243c5556/workers/onboarding.
```
This account has never had a `workers.dev` subdomain claimed. This is a **one-time, account-level, human decision** (you're picking a public, permanent subdomain prefix — e.g. `<something>.workers.dev` — that every Worker on the account will be reachable under) and there's no CLI command for it in this wrangler version (`wrangler --help` lists no `subdomain` command).

**Extra support step:**
- [ ] Open the dashboard link above and register a `workers.dev` subdomain for the account.
- [ ] Re-run `npx wrangler deploy` afterward — the Worker name (`10x-astro-starter`, from `wrangler.jsonc`) itself was not the problem; the account-level subdomain was.

**Other edge cases / extra support steps for this phase:**
- **`astro:env/server` resolves to `undefined` in production** (real upstream issue, withastro/astro#16790, open as of Sept 2026): if `wrangler tail` shows `createClient` returning `null` (sign-in silently no-ops) even though `wrangler secret list` shows both secrets set, the workaround is to read the Worker's native `env` directly instead of trusting `astro:env/server` — import `env` from `cloudflare:workers` inside `src/lib/supabase.ts`'s Cloudflare code path as a fallback. Only apply this if the tail/browser check actually shows the failure — don't patch preemptively.
- **KV namespace still gets auto-provisioned despite `session: false`**: re-run `npx wrangler kv namespace list` right after the first deploy. If a `SESSION`-named namespace appears anyway, Phase 1's build-log check was a false negative — stop, don't proceed to Phase 3, and re-verify the `session: false` placement.
- **Wrong Supabase project secrets**: this MVP has no staging environment, so a fat-fingered `wrangler secret put` points production traffic at the wrong (or local) Supabase project with nothing to catch it first. Treat the sign-in smoke check as mandatory before calling this phase done.

## Phase 3 — Rollback drill

**Status: ⏳ Not started (depends on Phase 2)**

- [ ] Make a trivial, obviously-visible change (comment or text tweak), deploy it, confirm it's live.
- [ ] `npx wrangler deployments list` to see both deployments, then `npx wrangler rollback` to revert to the prior one.
- [ ] Confirm the rollback took effect in the browser, then redeploy the real `master` state.

Turns "rollback works in theory" into a proven, once-rehearsed step before you need it under pressure.

## Phase 4 — Documentation

**Status: ⏳ Not started (depends on Phase 2/3)**

- [ ] Update `README.md`'s Deployment section: confirm the manual deploy flow (`npm run build && npx wrangler deploy`), and note that deploys are a deliberate human action (no CI automation).
- [ ] Add a "Rollback" subsection to `README.md` pointing at `npx wrangler rollback` / `npx wrangler deployments list`.
- [ ] Note that `context/foundation/infrastructure.md`'s "Getting Started" step 2 (`session: false`-on-adapter phrasing) is superseded by this file's Phase 1 — leave `infrastructure.md` itself untouched (research output, not a living runbook).

## Verification checklist (end-to-end, once unblocked)

- [ ] Fresh browser session against the live `*.workers.dev` URL: sign up, confirm-email flow (or note if stubbed), sign in, hit `/dashboard`, sign out.
- [ ] `npx wrangler tail` shows clean request logs, no uncaught exceptions.
- [ ] `npx wrangler kv namespace list` still returns `[]`.
- [ ] `npx wrangler rollback` confirmed as the documented recovery path in `README.md`.

## Out of scope

- **GitHub Actions / deploy-on-merge automation** — explicitly excluded.
- Custom domain binding — deferred, default `workers.dev` subdomain for now.
- Staging environment / `[env.staging]` in `wrangler.jsonc` — deferred, single production environment for this MVP.
- Docker, multi-region/HA/DR — out of scope per `infrastructure.md`.
