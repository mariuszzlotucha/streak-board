# Landing page — Plan Brief

> Full plan: `context/changes/landing-page/plan.md`
> Frame brief: `context/changes/landing-page/frame.md`
> Research: `context/changes/landing-page/research.md`

## What & Why

A stranger who opens a public link to `streakboard.app` today first meets a Safe Browsing warning (social engineering), and behind it a generic page with no privacy policy. S-09 must give them a page they can trust, one that says "a shared goal, visible to each other", and it must get the flag lifted (reframed problem statement, `frame.md`). A deploy does not lift the flag; Google's review does.

## Starting Point

`/` already has product copy (commit `35b08ea`), but it keeps the starter's cosmic look. The sign-in and sign-up pages, where the password is typed next to a Google-branded button, never show the StreakBoard name. The starter's favicon and banner (`/template.png`) are still served, there is no privacy page, and plain HTTP answers 200. The Search Console flag "Deceptive pages" names no sample URL, so the review judges the whole site.

## Desired End State

Every public page (`/`, `/privacy`, sign-in, sign-up, e-mail confirmation) shows the StreakBoard mark and name and links a privacy policy that is true for the current code. `/` says "Keep each other on track." and explains the product in three steps; a signed-in visitor goes straight to `/dashboard`. Plain HTTP redirects to HTTPS and the session cookies are `Secure`. After the release the owner requests the Search Console review and fills in Google Branding, and `/10x-archive` waits until the review has passed.

## Key Decisions Made

| Decision                 | Choice                                                                                                   | Why (1 sentence)                                                                                                                                                                    | Source                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Promise and language     | "Shared goal and visibility", English, no leaderboard preview                                            | That is the PRD's value, and the rest of the app is English                                                                                                                         | Frame (owner)                  |
| Signed-in visitor on `/` | 302 to `/dashboard`, checked in `index.astro` before the flow-state `error_code` check                   | The middleware strips trailing slashes, so `/` cannot join `AUTH_ROUTES`, and the dashboard is where such a visitor ends up anyway                                                  | Plan                           |
| Order of Google steps    | New pages and policy live first, then the review request and the Branding URLs; archive after the review | The owner wants the policy in place before anything is sent to Google                                                                                                               | Frame (owner)                  |
| Trust pass scope         | Whole public surface: auth pages, confirm-email, favicon, `/template.png`, `bg-cosmic`                   | The review judges the whole site, and the pages with the password field carry no identity today                                                                                     | Plan (owner)                   |
| Google button            | Unchanged, no test with an account outside the test-user list                                            | Owner decision; the Google app stays in Testing and publishing comes later                                                                                                          | Plan (owner)                   |
| HTTPS                    | Cloudflare "Always Use HTTPS" plus `Secure` Supabase cookies in production builds                        | A link pasted as `http://` must not show a password form over plain HTTP or send the session in clear                                                                               | Plan (owner)                   |
| Policy contact           | `mariusz.zlotucha@gmail.com`                                                                             | Owner's address, confirmed; it works without any setup                                                                                                                              | Plan (owner)                   |
| Phases                   | One code phase (one PR, one release), a closing phase, and a records-only phase for Google's verdict     | The owner prefers one review and one release over three; the wait for Google gets its own phase so the closing phase ends in one session                                            | Plan (owner), plan review F2   |
| Legal frame              | Contract and legitimate interests; no terms page, cookie banner or age clause                            | Google lists terms as optional, the cookies serve only the requested service (the 400-day session cookie is a grey zone the owner accepts), and GDPR Art. 8 applies only to consent | Plan, Research, plan review F4 |
| Account deletion         | By e-mail, by hand, within one month; consequences stated; README procedure also clears the audit log    | No self-service flow exists (Q-09), and `auth.audit_log_entries` (with IP addresses) survives a user's deletion                                                                     | Plan                           |

## Scope

**In scope:**

- A shared public layout (brand header, footer with the policy and contact) on five pages, plus the footer on the dashboard
- `/privacy`: controller, data, bases, recipients, providers and transfers, retention, cookies, rights, deletion
- The `/` rewrite and the signed-in redirect; `Welcome.astro` and `Topbar.astro` deleted
- Branded favicon; `/template.png` and `bg-cosmic` removed; the sign-up notice about e-mail visibility
- `Secure` Supabase cookies in production; smoke steps that assert content, link targets and redirects; the release check for `/privacy`
- README and CLAUDE.md updates, including a data deletion procedure; the owner's steps for HTTPS, Search Console and Branding

**Out of scope:**

- Publishing or verifying the Google app; Google button restyle or note; a live test with an account outside the test-user list
- Terms page, cookie banner, self-service deletion, HSTS/CSP, Open Graph tags, sitemap, dashboard redesign (S-11), new e2e specs

## Architecture / Approach

`PublicLayout` (Layout, then `SiteHeader`, `<main>` and `SiteFooter`) wraps `/`, `/privacy` and the three auth pages. The header's link to `/` serves everyone, because a signed-in visitor is redirected from `/` to `/dashboard`. Operator name and contact address live in `src/lib/site.ts`. The policy is a contract with the data model (foreign keys, `list_group_members`, cookies, providers), and CLAUDE.md gets a rule to keep the two in step. Smoke probes the build mode through `/dev/signin-kitchen-sink` (404 in production) so that it asserts `Secure` only against a production build.

## Phases at a Glance

| Phase                                                  | What it delivers                                                                                               | Key risk                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Public pages, privacy policy and HTTPS-only cookies | All code, smoke, release check and docs in one PR                                                              | A policy statement that does not match the code; `Secure` cookies on the `localhost` preview |
| 2. Production release, HTTPS and Google submissions    | Approved release, "Always Use HTTPS", production check, review request, Branding, records in a docs PR         | Production differs from the preview (for example a rewritten contact link)                   |
| 3. Google review outcome                               | Google's verdict confirmed (Search Console, Transparency Report), recorded in a docs PR, then the archive gate | Google may reject the review or take weeks; the slice stays open until it passes             |

**Prerequisites:** S-06 and S-07 done (they are); the planning PR merged; the local Supabase stack for `npm test`, smoke and Playwright (one DB session at a time); the owner's access to Cloudflare, Search Console and Google Auth Platform.
**Estimated effort:** about 1–2 sessions for Phase 1; Phase 2 takes about an hour of owner steps; Phase 3 starts after the review's wait (days to weeks) and takes minutes.

## Open Risks & Assumptions

- The flag's cause is inferred (no sample URLs): pages without identity next to sign-in. If the review is rejected, the fix and the resubmission stay in S-09; do not toggle pages back and forth (30-day review block for repeat offenders).
- If Google refuses accounts outside the test-user list, a stranger who picks "Continue with Google" sees Google's error page; the owner accepted that until the app is published.
- Legal statements are an interpretation, not legal advice; the owner confirms every policy statement before merge.
- The 400-day `sb-*` session cookie is treated as strictly necessary, so there is no consent banner; the non-binding WP29 opinion WP194 says persistent login cookies are not exempt. The owner accepts this interpretation (plan review F4).
- Safari does not keep `Secure` cookies on `http://localhost`, so a local preview session works only in Chromium and Firefox.

## Success Criteria (Summary)

- A stranger on `https://streakboard.app` sees which site they are on, what it promises and where the privacy policy is, on every public page, without a browser warning.
- A signed-in user lands on the dashboard from `/`; smoke and the release check prove the content, the links and the redirects.
- Search Console shows no security issue and the Transparency Report shows no flag; only then is S-09 archived.
