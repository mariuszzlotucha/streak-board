# Custom domain — Plan Brief

> Full plan: `context/changes/custom-domain/plan.md`
> Frame brief: `context/changes/custom-domain/frame.md`
> Research: `context/changes/custom-domain/research.md`

## What & Why

S-06 (roadmap MS-01) puts the production app on `streakboard.app`. The problem statement from the frame, verbatim: "Rzeczywisty problem, wokół którego należy planować, to: doprowadzić do tego, że `streakboard.app` jest jedynym adresem, który kod i otoczenie podają dalej, tak aby żaden link wysłany drugiej osobie (potwierdzający, zaproszeniowy) ani żadna kontrola wydania nie wskazywały po cichu na stary adres." The slice is operational (no code, schema or tests), and the risk is that an address stored in a panel breaks sign-up silently.

## Starting Point

The app answers only at `https://10x-astro-starter.mariusz-zlotucha.workers.dev`. The apex `streakboard.app` is registered and in Cloudflare DNS but empty (no A, AAAA, CNAME, MX or TXT record), and today it only serves the auth e-mail sender `mail.streakboard.app`. The address lives outside the code in three places: the Cloudflare binding, the Supabase Site URL and Redirect URLs, and the GitHub variable `PRODUCTION_URL`; the code builds the confirmation and invite links from the request host (`signup.ts:18`, `dashboard.astro:131`).

## Desired End State

`https://streakboard.app` serves the app; a sign-up there delivers a confirmation link that lands signed in; the invite link starts with `https://streakboard.app/join/`; the `release` check runs against it; `workers.dev` and Preview URLs are off. README and `deployment-plan.md` say where the address lives and in what order to change it.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Problem framing | One address handed out everywhere, not just "the domain answers" | Address lives in four places outside the code; two earlier incidents were silent | Frame |
| Application code | Unchanged | Links are built from the request host, correct once the host is right | Frame / Research |
| Compatibility of the old host | Not required | Only the owner has an account or an invite link | Frame (user answers) |
| How the domain is bound | In the Cloudflare dashboard, no `routes` in `wrangler.jsonc` | Deploy without a `custom_domain` route never touches domains (`cli.js:153683`); declaring one forces DNS overrides in CI and needs token rights nobody confirmed | Plan (user chose) |
| Fate of `workers.dev` | Kept as fallback, switched off in the last phase (`workers_dev: false`, `preview_urls: false`) | One address at the end, a way back while the new host is unproven | Plan (user chose) |
| Order | Bind, then Supabase (add before change), then `PRODUCTION_URL`, then retire the old host | Production never points at an address that does not answer yet | Frame |
| Two platform risks | Tested by two different releases (Phase 1 and Phase 3) | A failure then has one possible cause: detached domain vs zone bot protection | Plan |
| Phase shape | Four phases, each with a small PR adding a "Phase 10" note to `deployment-plan.md`, plus one closing docs PR for the final result | Dashboard-only changes get an audit trail and a canary release; a PR cannot record its own release | Plan / Plan review |
| `www`, `site`, redirect, Worker rename | Out of scope | No requirement before S-09; the redirect would need code for traffic that does not exist | Frame / Plan |

## Scope

**In scope:** Custom Domain for the apex in Cloudflare; Supabase Redirect URLs and Site URL; `PRODUCTION_URL`; `workers_dev` and `preview_urls` in `wrangler.jsonc`; README and `deployment-plan.md` (and one roadmap note); real sign-up, invite-link and release checks on the new host.

**Out of scope:** `www.streakboard.app`; `site` in `astro.config.mjs`; a redirect from the old host; declaring routes in the repo; CI token or secret changes; Worker rename; `supabase config push`; any change under `src/`, `supabase/`, `tests/`; running the smoke script against production.

## Architecture / Approach

Additive before subtractive. The owner attaches the apex in the dashboard (Phase 1), Supabase gets the new Redirect URLs entry and then the new Site URL (Phase 2), the release gate and the docs follow (Phase 3), and only then `workers.dev` is switched off by config and its allow-list entry removed (Phase 4). Each step is verified from outside (`curl`, a real sign-up in a private window) before the next. Claude runs checks, edits and PRs; the owner does the dashboard steps and approves every `release`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Attach the domain | Apex answers over TLS; Phase 10 section started | Platform may detach the domain at the next deploy (tested by this phase's release) |
| 2. Supabase and user flows | Site URL and Redirect URLs on the new host; sign-up link, invite link and plain-text e-mails proven | Silent fallback to the Site URL; zone e-mail obfuscation breaking hydration |
| 3. Release gate and docs | `PRODUCTION_URL` on the new host; README "Custom domain" and checklist | Zone bot protection blocks the runner's `curl` (red release after a good deploy) |
| 4. Switch `workers.dev` off | `workers_dev: false`, `preview_urls: false` in the build output; old Redirect URLs entry gone; slice closed | Generated config may not carry the flags; no fallback host afterwards |

**Prerequisites:** `streakboard.app` in the owner's Cloudflare account (met); `gh` access to the repository; the owner available for dashboard steps and four phase `release` approvals (the closing docs PR's can be left superseded).
**Estimated effort:** ~2 sessions across 4 phases, 4 small PRs and a closing docs PR, about an hour of owner time in dashboards.

## Open Risks & Assumptions

- Whether a platform-side script upload leaves a dashboard-attached domain alone is unverified; the CLI side is read from `wrangler` 4.131.1. Recovery is re-adding the domain in the dashboard.
- Zone behaviours that `workers.dev` bypassed (bot protection, e-mail obfuscation) are platform knowledge, not observed on this account; Phases 2 and 3 check them.
- Current Supabase values are not verifiable from the repository; only behaviour (a real sign-up) proves them.
- Assumes the zone and the Worker share one Cloudflare account and nobody but the owner has a `workers.dev` link (checked in 1.7 and 4.7).
- README, `deployment-plan.md` and `roadmap.md` are shared with parallel slices; the PR that merges second resolves conflicts.

## Success Criteria (Summary)

- A new user signs up on `https://streakboard.app`, clicks the e-mail link and lands signed in on the dashboard; the invite link works on the new host.
- A `release` passes its post-deploy check against `https://streakboard.app`, and the old `workers.dev` address no longer serves the app.
- The README and `deployment-plan.md` let the next person change the address in the right order without rediscovering the traps.
