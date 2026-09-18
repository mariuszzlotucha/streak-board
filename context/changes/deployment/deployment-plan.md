---
project: streak-board
based_on: context/foundation/infrastructure.md
platform: Cloudflare Workers
status: phases_0-4_done_pending_auth_smoke_test
last_updated: 2026-09-18
---

# Cloudflare Workers Deployment Plan

Deployment runbook for streak-board, derived from `context/foundation/infrastructure.md`'s platform research. Covers **manual CLI deployment only** — GitHub Actions / deploy-on-merge automation is explicitly out of scope for this plan.

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
- [x] Confirmed rollback effect via curl: hero-section `bg-red-600` class gone from HTML, global `--background` CSS var still red (matches the rolled-back-to version exactly) — proves rollback restores the *exact* prior version, not just "some" prior state.
- [x] Redeployed current working-tree state (`npm run build && npx wrangler deploy`) to restore the hero-section change — confirmed `bg-red-600` back in the live HTML.

Turns "rollback works in theory" into a proven, once-rehearsed step before you need it under pressure. **Note:** `wrangler rollback` prompts interactively (rollback message, confirm-to-100%) — in a non-interactive/scripted context it falls back to defaults ("Rollback" message, "yes" to confirm) rather than failing, which is convenient but means a scripted rollback can't be silently declined — know this before wiring it into anything automated.

## Phase 4 — Documentation

**Status: ✅ Done (2026-09-18)**

- [x] Updated `README.md`'s Deployment section: secrets-first ordering, explicit "deploys are manual, CI does not deploy" statement, and the discovered `workers.dev` subdomain first-deploy edge case with its fix.
- [x] Added a "Rollback" subsection to `README.md` (`wrangler rollback` / `wrangler deployments list`, non-interactive default-prompt behavior noted).
- [x] `context/foundation/infrastructure.md` intentionally left untouched (research output, not a living runbook) — this file and the README are now the accurate operational references; the `session: false`-on-adapter phrasing there is known-superseded by Phase 1 above.

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
