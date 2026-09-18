---
project: streak-board
researched_at: 2026-09-18
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: typescript
  framework: astro
  runtime: cloudflare-workers
---

## Recommendation

**Deploy on Cloudflare Workers.**

On the raw agent-friendliness matrix, Cloudflare and Vercel tie for the top score; Cloudflare wins the tie-break for three concrete reasons drawn from the interview and the project's actual state: you already have hands-on Cloudflare familiarity, the free tier (100k requests/day) has no commercial-use restriction (unlike Vercel Hobby, which is non-commercial-only), and — most importantly — this repository is **already configured for Cloudflare Workers**, not a hypothetical target: `@astrojs/cloudflare@^14.3.1` is installed, `wrangler.jsonc` already exists with the Workers-with-static-assets binding and `nodejs_compat` flag set. Recommending anything else would mean undoing working configuration. `context/foundation/tech-stack.md`'s `deployment_target: cloudflare-pages` hint is stale — see the correction below.

**Correction to `tech-stack.md`:** its `deployment_target: cloudflare-pages` hint no longer matches reality. Astro's `@astrojs/cloudflare` adapter dropped Cloudflare Pages support as of v13 — Cloudflare/Astro now target **Workers exclusively**, and this project's own `wrangler.jsonc` already reflects that (it's a Workers-with-static-assets config, not a Pages one). Don't follow Pages-flavored tutorials, `_worker.js`/`functions/`-directory instructions, or older agent priors when touching deploy config.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Score |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| **Vercel** | Pass | Pass | Pass | Pass | Pass | 5/5 |
| **Netlify** | Partial | Pass | Pass | Pass | Pass | 4.5/5 |
| **Fly.io** | Partial | Partial | Pass | Pass | Partial | 3.5/5 |
| **Railway** | Partial | Partial | Pass | Pass | Partial | 3.5/5 |

**Cloudflare Workers** — `wrangler deploy` / `wrangler rollback` / `wrangler tail` cover the full deploy→observe→revert loop non-interactively (all GA). Docs are markdown-native (`developers.cloudflare.com/llms.txt`, per-product `llms.txt`/`llms-full.txt`, any page fetchable as markdown). Free tier: 100k requests/**day** (~3M/month), 10ms CPU/invocation — comfortably covers this app's expected traffic at $0, no commercial-use restriction. MCP is Partial: Cloudflare ships GA remote MCP servers, but they're scoped to account/observability operations rather than a dedicated deploy-this-app tool, and are newer/narrower than Vercel's or Netlify's.

**Vercel** — `vercel deploy` / `vercel rollback` / `vercel logs` are all GA and deterministic; official Vercel MCP is GA (docs search, project/deployment management). Ties Cloudflare on raw criteria score. Held to runner-up because Hobby (the $0 tier) is explicitly non-commercial-use only per Vercel's ToS, and Hobby's `rollback` only reaches one deployment back — a real ceiling if this app is ever monetized or needs deeper rollback history, neither of which is likely at this MVP's scale but both are live risks the interview didn't rule out.

**Netlify** — Functions/adapter are GA and docs are solid (`docs.netlify.com/llms.txt`, per-page `.md`). Official Netlify MCP server is GA per vendor. Marked down on CLI-first: there is **no CLI rollback subcommand** — reverting to a prior deploy is a dashboard/API "Publish deploy" action, not a single `netlify` command, which breaks the fully-unattended operational loop the criteria value most.

**Fly.io** — Genuinely supports persistent processes/WebSockets natively (unneeded here) and has GA CLI/logs/docs. Scored down twice: it requires a Dockerfile (real ops surface — this skill doesn't write one, but the project would need one), and there's no dedicated rollback command (`fly releases --image` + `fly deploy --image` is a manual image swap, not atomic). Its own MCP/AI-agent tooling was flagged in research as early-stage.

**Railway** — GA CLI (`railway up`/`logs`/`redeploy`), llms.txt docs, and a real MCP server, but its **default builder (Railpack) is in beta** as of this research, its containers run always-on (no serverless-native billing model), and full historical rollback to an arbitrary past deploy is dashboard-only. No free tier remains for new accounts (only a one-time $5 trial credit).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins the tie-break with Vercel on cost certainty (no non-commercial restriction), your stated familiarity, and — decisively — that the project is already wired for it. Migration cost to "start over" on another platform would be non-trivial busywork with no clear benefit for this MVP's scope.

#### 2. Vercel

Ties on raw criteria score and has the most mature Astro adapter ecosystem of any candidate, plus a GA (not beta) MCP server. Runner-up only because Hobby's non-commercial restriction and one-step-back rollback are real strings that Cloudflare's free tier doesn't carry.

#### 3. Netlify

Comparable managed/serverless experience and equally strong agent-readable docs, kept third by the one concrete gap that matters most for unattended agent operation: no CLI-based rollback path at all.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Subtle platform lock-in.** The Astro adapter's auto-provisioned session KV, `astro:env/server` binding model, and the `nodejs_compat` shim couple the SSR entrypoint to workerd-specific semantics — migrating off Cloudflare later means touching that entrypoint and env-access layer directly, not just swapping a build target.
2. **No CommonJS support in workerd.** Any transitive npm dependency (an auth/UI library, parts of the Supabase client chain) that assumes a full Node runtime can build and run locally yet fail only in production, since local emulation isn't a perfect match for the deployed edge runtime.
3. **Edge-opaque debugging.** `wrangler tail` gives less rich stack traces/heap inspection than an always-on Node process (Fly/Railway) — a real cost for a solo developer debugging after hours during a 3-week build.
4. **Free tier is a cliff, not a ramp.** Exceeding any single limit (CPU-ms, requests) jumps straight to the Standard plan's $5/mo minimum — there's no metered middle tier the way Vercel Hobby→Pro or Netlify's credit system provides more headroom before a hard paywall.
5. **Adapter churn risk.** `@astrojs/cloudflare` had a breaking change (dropping Pages support) within roughly a year of its own life — a platform/adapter pairing still actively renegotiating its primary deployment target is inherently less settled than one that's stayed stable for years.

### Pre-Mortem — How This Could Fail

The team assumed the Astro adapter's auto-provisioned session KV was purely incidental infrastructure and never disabled it, even though session state was meant to live in Supabase cookies. Six months in, a "sign out everywhere" feature exposed stale KV session entries silently overriding fresh Supabase sessions on a slice of requests — two independent session stores had drifted out of sync, a bug invisible in local dev since `wrangler dev` doesn't replicate KV's ~60s eventual-consistency propagation, and only surfaced under real multi-device usage. Debugging took days: `wrangler tail` produced undecorated JSON logs with no request-correlation ID wired up from day one. Meanwhile the friend group had quietly grown past its original size, tipping several Workers CPU-ms limits at once — the team's "it's free" assumption evaporated into an unplanned bill during a week they were heads-down on something else, and confusion about *why* billing kicked in delayed the actual session-sync fix by another week.

### Unknown Unknowns

- **Dual session-store trap** — the adapter's auto-provisioned KV session store and Supabase's own session cookies are two independent systems unless one is explicitly disabled; most tutorials don't mention this.
- **Local emulation isn't the deployed runtime** — `wrangler dev` doesn't perfectly replicate workerd's KV eventual-consistency delay or exact CPU-time accounting, so "it worked in dev" carries less certainty here than on a Node-based platform.
- **Per-environment secrets are easy to fat-finger** — `wrangler secret put` is scoped per Worker/environment with no single unified cross-environment view (unlike Vercel/Netlify's per-preview env-var dashboards); forgetting to set a secret on a new staging Worker is a live risk.
- **CPU-time billing, not wall-clock** — a Worker slow only because it's waiting on a slow Supabase network call doesn't cost extra CPU-ms, which means normal Node performance intuition (slow I/O ≈ high cost) doesn't transfer, potentially masking real regressions.
- **Real-time features require a different programming model entirely** — if a genuinely live leaderboard is ever wanted (beyond "instant after your own checkbox"), Cloudflare's answer is Durable Objects + WebSocket Hibernation, an actor-per-connection model unlike anything else in this Astro SSR app — not an incremental change, a second architecture.

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a preview version with its own URL without shifting production traffic; `wrangler versions deploy` promotes a version to 100% traffic. No fork-PR gating the way GitHub-Actions-integrated platforms have — any authenticated CLI session can create a preview.
- **Secrets**: `SUPABASE_URL`/`SUPABASE_KEY` live as Workers secrets, set per environment via `wrangler secret put SUPABASE_URL` / `wrangler secret put SUPABASE_KEY` — matching the existing `astro:env/server` pattern already in `src/lib/supabase.ts`. Only accounts with API-token access to the Workers project can read or rotate them; there's no plaintext `.env` shipped to the edge.
- **Rollback**: `wrangler rollback [deployment-id]` reverts to a prior deployment in one command (defaults to the immediately preceding one). No database migrations are involved since Supabase is managed separately — only the Worker's code/version changes.
- **Approval**: routine deploys (`wrangler deploy`) can run unattended from CI. A human approves: rotating the Supabase service key, changing production secrets, and any first-time DNS/custom-domain binding in the Cloudflare dashboard.
- **Logs**: `wrangler tail` streams live production logs read-only; `wrangler deployments list` / `wrangler deployments view <ID>` inspect deploy history without dashboard access.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Auto-provisioned session KV drifts out of sync with Supabase's own session cookies | Pre-mortem / Unknown unknowns | M | H | Explicitly set `session: false` on the adapter (or confirm which store is authoritative) before shipping auth; don't leave both running by default |
| Local dev (workerd) masks Node-specific dependency bugs until production | Devil's advocate | M | M | Smoke-test any new npm dependency with `wrangler dev`/a real deploy, not just `astro dev`, before merging |
| Stale Pages-era guidance (docs, tutorials, agent priors) produces an outdated deploy setup | Devil's advocate / Research finding | H | M | Treat this file's correction as authoritative; never follow `_worker.js`/`functions/`-directory instructions |
| Free-plan CPU-time cap (10ms/invocation) throttles streak-computation logic under real data volume | Unknown unknowns | L | M | Load-test the leaderboard/streak-read endpoint with realistic group sizes before relying on the free tier long-term |
| Per-environment secrets (`wrangler secret put`) forgotten when a staging environment is added | Unknown unknowns | M | M | Document the exact `wrangler secret put` commands for every environment in a deploy runbook before the first staging deploy |
| Adapter breaking changes recur (as happened with Pages removal) | Devil's advocate | L | M | Pin `@astrojs/cloudflare` and review its changelog before any version bump, rather than auto-upgrading |
| Cloudflare's MCP/observability tooling is newer and narrower than alternatives | Devil's advocate | L | L | Default to `wrangler tail` for log inspection; revisit MCP adoption once the Workers Observability server matures |

## Getting Started

1. Dependencies are already installed and configured — confirm with `cat wrangler.jsonc` and `grep cloudflare package.json`: `@astrojs/cloudflare@^14.3.1` and `wrangler.jsonc` (Workers-with-static-assets, `nodejs_compat` flag, `compatibility_date: 2026-05-08`) are already in place. No re-scaffolding needed.
2. Explicitly decide the session-store question before wiring auth end-to-end: either pass `session: false` to the Cloudflare adapter in `astro.config.mjs` so Supabase's own session cookies are the single source of truth, or deliberately keep the adapter's KV session store and document why two stores coexist.
3. Set Supabase secrets for the Workers environment: `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY` (mirrors the existing `astro:env/server` schema in `astro.config.mjs`).
4. Build and deploy: `npm run build && npx wrangler deploy`.
5. Verify with `npx wrangler tail` while exercising sign-in and the task check-off flow, to confirm real-world latency meets the PRD's "must be instant" guardrail.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
