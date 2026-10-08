# Landing page Implementation Plan

## Overview

S-09 (roadmap MS-03): a stranger who opens a public link to `https://streakboard.app` reaches a page they can trust. The page says what StreakBoard promises (several people track the same habit and see each other's consistency, instead of a shared spreadsheet coloured by hand; `context/foundation/prd.md`, Vision), links a privacy policy and leads to sign-up or sign-in. A signed-in visitor goes from `/` to `/dashboard`.

The problem statement is the reframed one from `frame.md`: today a stranger first meets a Safe Browsing warning ("Deceptive pages") and behind it a generic page without a privacy policy, so S-09 must deliver a page worth trusting **and** get the flag lifted. A deploy does not lift the flag; Google's review does. The plan therefore ends with the owner's submissions to Google, Google's verdict and the gate on `/10x-archive` recorded in `change.md` (Notes).

Decisions settled in this planning session (owner answers, 2026-10-08):

- The trust pass covers the whole public surface: a brand header and a footer with the policy link on `/`, `/privacy`, `/auth/signin`, `/auth/signup` and `/auth/confirm-email`, a brand favicon, `/template.png` removed and the starter's cosmic styling gone.
- "Continue with Google" stays as it is and is not tested with an account outside the test-user list; the README sentence about test users stays.
- HTTPS is enforced: the owner turns on Cloudflare "Always Use HTTPS", and the Supabase cookies carry `Secure` in production builds.
- The policy publishes `mariusz.zlotucha@gmail.com` as the controller's contact address.
- One code phase (one commit, one PR, one release), then a closing phase for the release, HTTPS and the Google submissions. A third, records-only phase waits for Google's verdict, so the closing phase finishes in one session (added in the plan review, F2).

Decisions made by the plan from the research evidence: the signed-in redirect lives in `index.astro` and runs before the flow-state check; the policy is `/privacy`, server-rendered; no terms page; the legal bases are the contract and legitimate interests; account deletion is requested by e-mail and done by hand within one month.

## Current State Analysis

- `/` is `src/pages/index.astro`: the flow-state redirect (`:8-12`) sends `error_code` ∈ {`bad_oauth_state`, `bad_oauth_callback`, `flow_state_already_used`} to `/auth/signin?error=oauth_failed`, then it renders `src/components/Welcome.astro`: the starter's cosmic background (`:5-15`), the heading "StreakBoard" with a generic line (`:21-27`), "Sign In"/"Sign Up" (`:28-41`) and three cards whose icons are a padlock and `</>` (`:45-112`). `src/components/Topbar.astro` (`:5-33`) is rendered only by `Welcome.astro`; it has a signed-in variant (e-mail, Dashboard, Sign out) and an anonymous one.
- Signed-in visitors: the middleware sends them to `/dashboard` only from `/auth/signin` and `/auth/signup`, comparing the path after stripping trailing slashes (`src/middleware.ts:9,39-42`), so `/` renders for them today. During an Auth outage `locals.user` is `null` (`:17`) and only protected paths answer 503 (`:29-33`).
- Auth pages: `src/pages/auth/signin.astro:15-33` and `signup.astro:17-40` render a `Card` inside a full-screen `bg-muted` wrapper. Outside `<title>`, their production HTML contains "StreakBoard" 0 times, next to a password field and the "Continue with Google" button (`src/components/auth/GoogleButton.astro:6-33`; research §1). `confirm-email.astro:21-34` uses `bg-cosmic` and a gradient heading.
- Starter leftovers served publicly: `bg-cosmic` (`src/styles/global.css:125-127`, used by `Welcome.astro:5` and `confirm-email.astro:22`), `public/favicon.png` (the starter's mark, linked at `src/layouts/Layout.astro:21`) and `public/template.png` (the "10x-astro-starter" banner, 1,266,671 bytes, referenced only by `README.md:3`). `README.md:1-5` still opens with "# 10x Astro Starter" and "A modern, opinionated starter template…". Not public: the Worker name `10x-astro-starter` (`wrangler.jsonc:3`, `workers_dev: false`).
- No privacy, terms or contact page exists (`src/pages/`; production `/privacy` answers 404, research §1). Nothing on the domain receives mail; the owner's contact address is `mariusz.zlotucha@gmail.com` (research, follow-up).
- Transport: `http://streakboard.app/` and `http://streakboard.app/auth/signin` answer 200 without a redirect (research §1). `src/lib/supabase.ts:10-21` passes the library's cookie defaults unchanged: `path: "/"`, `sameSite: "lax"`, `httpOnly: false`, `maxAge` 400 days, no `secure` (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11`). The library spreads `cookieOptions` over those defaults (`node_modules/@supabase/ssr/dist/main/cookies.js:223-230,463-470`). The app's own cookies use `secure: import.meta.env.PROD` (`src/lib/join-code.ts:18`, `src/lib/auth-email.ts:19`).
- Personal data (research §4 and follow-up, plus a read-only check of the local stack on 2026-10-08):
  - Supabase Auth keeps the e-mail, the account timestamps and, for Google sign-ins, the name and picture claims that the app never reads. For each session it keeps `ip` and `user_agent` (`auth.sessions`).
  - GoTrue writes `auth.audit_log_entries` with an `ip_address` column and a JSON `payload` (`actor_id`, `actor_username`, `action`, `traits`); a `user_deleted` entry names the deleted user in `traits.user_id`. The table has no foreign key to `auth.users`, so deleting a user leaves its rows behind; `auth.sessions` and `auth.identities` cascade.
  - The public tables hold the group name, task titles, memberships, participation and check-offs (`src/types.ts:30-205`).
  - Members see each other's e-mails through `list_group_members`, and a signed-in holder of an invite code sees the group name (`supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:10-48`).
  - Leaving a group, or being removed from it, deletes that member's participation and check-offs in its tasks; the member's own tasks stay in the group (`supabase/migrations/20261001090000_create_task_participants.sql:92-117`).
  - Deleting an account: `groups.owner_id` blocks it (restrict); memberships, created tasks, participation and check-offs cascade (research §4, Deletion).
  - Providers, regions and retention: research §4 and follow-up (Supabase in the EU, Ireland; Resend in the US; Sentry in the US or the EU, keeping errors 30 days on the free plan and 90 while an organization trial runs, `research.md:180`, not checked; free plans everywhere).
  - Request logs: `wrangler.jsonc:12-14` enables observability without `invocation_logs: false`, so besides the app's own lines Cloudflare writes one invocation log per request with its method and URL (Workers Logs documentation); an invite link's path carries its code there. `src/lib/redact.ts` masks only the app's own lines and Sentry events (plan review F1).
- Tests and gates:
  - Smoke checks `/` by status only (`scripts/smoke.mjs:346,454-460`) and the three flow-state codes with `locationExact` (`:448-453`); it has no helper for link targets.
  - The smoke jar is signed in from `:540-544` until `:1757` and never requests `/` in that window. `location` is a prefix match and `locationExact` an exact one (`:1767-1781`).
  - The release live check requests `/` anonymously and needs exactly 200 (`.github/workflows/ci.yml:162-169`); none of its requests reads a body.
  - `/dev/signin-kitchen-sink` answers 404 in a production build and renders in dev (`src/pages/dev/signin-kitchen-sink.astro:7-8`).
  - Playwright signs in once and reuses the stored session against the production preview on `http://localhost` (`playwright.config.ts`); it does not run in CI. No test asserts cookie attributes (`rg` over `tests/`).

## Desired End State

- An anonymous visitor on `https://streakboard.app/` sees:
  - a header with the StreakBoard mark and name, "Sign in" and "Sign up";
  - the heading "Keep each other on track." and how the product works in three steps;
  - a paragraph about the shared spreadsheet;
  - a footer that names who runs the service and links "Privacy Policy" and "Contact".

  The page uses the app's tokens (the same look as the auth pages and the dashboard) and works at phone width.

- A signed-in visitor on `/`, with or without a query (the three flow-state codes included), gets a 302 to `/dashboard`. For anonymous visitors the flow-state codes still end on `/auth/signin?error=oauth_failed`.
- `/privacy` answers 200 for everyone and states, in plain English:
  - who runs the service and what is collected;
  - why and on which legal basis;
  - who can see what;
  - which providers process data, and where;
  - how long data is kept and which cookies are set;
  - the rights, including objection and a complaint to the Polish supervisory authority;
  - how to get an account deleted and what that deletes.
- `/auth/signin`, `/auth/signup` and `/auth/confirm-email` show the same header and footer. Sign-up says, next to the form, that group members will see the e-mail address, and links the policy. The dashboard shows the footer.
- The favicon is the StreakBoard mark, `/template.png` answers 404 and no page uses `bg-cosmic`.
- In a production build every `sb-` cookie carries `Secure`, and Cloudflare redirects every `http://` request to `streakboard.app` to `https://`.
- The `release` live check fails unless `/privacy` answers 200 and `/` links it.
- After Phase 2, the review has been requested and Branding holds the home page and policy URLs (as a draft), both recorded.
- After Phase 3, the review has passed and is recorded, and the owner has confirmed the four archive-gate items in `change.md`.

Verify by the Success Criteria of all three phases.

### Key Discoveries:

- `Topbar.astro` becomes dead code with the signed-in redirect: a page that renders it never has a user (during an outage the user is `null`, so the anonymous page shows anyway). It is deleted, not restyled.
- A brand link to `/` serves both audiences: anonymous visitors get the landing page, and signed-in visitors reach `/dashboard` through the new redirect. The header therefore needs no signed-in variant, not even on `/privacy`.
- The middleware strips trailing slashes, so a `/` entry in `AUTH_ROUTES` would never match (`src/middleware.ts:39-41`). The page-level redirect avoids that and keeps both of `/`'s redirects in one file.
- `cookieOptions` is merged over the library defaults, so `{ secure: import.meta.env.PROD }` adds `Secure` to every cookie the client writes (session chunks, the PKCE verifier, deletions) and changes nothing else.
- `auth.audit_log_entries` survives a user's deletion. A documented deletion procedure has to delete those rows explicitly, or "deleted within one month" would not be true.
- The primary token `oklch(0.508 0.118 165.612)` is Tailwind's emerald-700 (`#007a55` in sRGB), which the favicon can use where an SVG favicon renderer may not support `oklch()`.

## What We're NOT Doing

- Publishing the Google app (Testing → In production), brand verification, or listing more test users (owner decision). The policy and the home page are only the prerequisites.
- A live test of Google sign-in with an account outside the test-user list, a note under the Google button, or rewording the test-user sentence in `README.md:265` (owner decision). The contradiction between Google's pages stays as recorded in `research.md` §6.
- Restyling the "Continue with Google" button to Google's branding guidelines; they are mandatory only for verification, which S-09 does not do.
- A terms of service page. Google lists the link as optional, and the duty under the Polish e-services act is doubtful for a free, non-commercial service run by a private person (research §5).
- A cookie banner or consent. The cookies serve only the service the user asked for, so the plan treats them as strictly necessary (Prawo komunikacji elektronicznej art. 399 ust. 3 pkt 2, research §5) and the policy only informs. `join_code`, `auth_email` and the PKCE verifier are clearly exempt. The 400-day `sb-*` session cookie is a grey zone: the non-binding WP29 opinion WP194 says persistent login cookies are not exempt. The owner accepts this interpretation (plan review F4).
- Self-service account deletion or data export (a schema and product decision, domain question Q-09). Requests go by e-mail.
- A minimum-age clause (GDPR Art. 8 applies only to consent, which is not a basis here), a postal address, a data protection officer, a Polish translation.
- HSTS, CSP and other security headers; only "Always Use HTTPS" and `Secure` cookies.
- A Leaderboard preview on `/` (owner decision in the frame); Open Graph, Twitter or canonical tags; a sitemap or `robots.txt`.
- A dashboard header or any dashboard change beyond the footer (S-11 `dashboard-ui` owns the redesign); dark mode.
- Renaming the Worker `10x-astro-starter` or the npm package. Neither is public, and a Worker rename would detach the custom domain and the secrets.
- New Playwright specs or screenshot baselines (`test-plan.md`: e2e not planned, UI look not tested). The existing suite runs once to prove the session still works.
- Checking the Sentry data region; the policy uses a statement that holds for both regions (it may process data in the United States).

## Implementation Approach

Phase 1 builds the whole public surface in one change set, ordered so that each step leaves a consistent tree:

1. shared site facts and the page shell;
2. the policy, which every footer link points to;
3. `/`;
4. the auth pages and the assets;
5. the cookie flag;
6. the smoke steps and the release check;
7. the docs.

It ships as one commit, one PR and one release (owner choice). Phase 2 belongs to the owner: approve the release, turn on HTTPS, check production, then send the review request and fill in Branding. Claude verifies with `curl` and records every result in a small docs PR. Phase 3 waits for Google's verdict, records it and opens the archive gate; the verdict decides when `/10x-archive` may run.

Content rules for every page:

- English, worded like the app (task, invite link, Mark done, streak, leaderboard, group; `context/domain/glossary.md`). "Habit" and "goal" may appear in copy, not in code names.
- No promise the code cannot keep: levels, badges, reminders, history, statistics, several groups or profiles (glossary, last section).
- Tokens and the shared `ui` components only, no raw palette classes; `cn()` for class merges.

## Critical Implementation Details

### Timing & lifecycle

The review request goes out only after three things: the release has passed, "Always Use HTTPS" is on, and the production check is done. The reasons (research §6):

- Google asks for a review only once all deceptive content is gone, and fixing some pages earns no partial return.
- A site that switches between compliant and non-compliant within a short window cannot request reviews for 30 days.

While the review is pending, do not revert or roll back the public pages unless production is broken; fix forward.

### State sequencing

In `index.astro` the signed-in check must come before the flow-state check. A signed-in visitor who comes back with `flow_state_already_used` (for example after a second click on "Continue with Google") goes straight to `/dashboard`; today they end there anyway, through `/auth/signin` (research §2). The smoke step for that case pins the order.

### Secure cookies on the local preview

`import.meta.env.PROD` is true in `npm run build && npm run preview`, which serves plain `http://localhost`. Chromium and Firefox accept and send `Secure` cookies on `localhost`; Safari does not, so a local preview session works only in the first two (the dev server is unaffected). Smoke keeps its own cookie jar and ignores the attribute, so it must assert `Secure` explicitly, and only when its build-mode probe reports a production build.

## Phase 1: Public pages, privacy policy and HTTPS-only cookies

### Overview

Every public page gets the StreakBoard identity and a link to a new privacy policy, `/` gets the promise and the signed-in redirect, the starter leftovers go, the Supabase cookies become `Secure` in production, and smoke, the release check and the docs prove and describe all of it.

### Changes Required:

#### 1. Site facts

**File**: `src/lib/site.ts` (new)

**Intent**: One source for the operator's name and contact address, used by the footer and the policy.

**Contract**: exports `SITE_OPERATOR = "Mariusz Złotucha"` and `CONTACT_EMAIL = "mariusz.zlotucha@gmail.com"`, nothing else. Smoke repeats the literals, since it imports nothing from `src/`.

#### 2. Brand assets

**Files**: `public/favicon.svg` (new), `public/favicon.png` (replaced), `public/template.png` (deleted), `src/layouts/Layout.astro`

**Intent**: Replace the starter's favicon with a StreakBoard mark and stop serving the starter banner.

**Contract**:

- `favicon.svg`: one simple glyph (a single lucide icon path such as `flame` or `check`, ISC licence) in white on a rounded square filled `#007a55`.
- `favicon.png`: a 48×48 render of the same SVG. It can be rendered with `sharp`, which is already in `node_modules`; the render script is not committed.
- `Layout.astro`'s head links the SVG (`type="image/svg+xml"`) and the PNG as a fallback; the title and description are unchanged.
- `GET /template.png` answers 404.

#### 3. Public shell

**Files**: `src/layouts/PublicLayout.astro`, `src/components/site/SiteHeader.astro`, `src/components/site/SiteFooter.astro` (all new)

**Intent**: One frame for the five public pages, so each one tells the visitor which site they are on and links the policy.

**Contract**:

- `PublicLayout`:
  - props `{ title?: string }`, forwarded to `Layout`;
  - a default slot for the page content inside `<main>`, and a named slot `actions` forwarded to the header;
  - the frame is a full-height column on `bg-muted`: header, then `<main>` that takes the remaining height (each page lays out its own content inside it), then footer.
- `SiteHeader`:
  - a `<header>` with a link to `/` that holds `<img src="/favicon.svg" alt="">` and the text "StreakBoard";
  - the right side renders the `actions` slot, which only `/` fills;
  - no signed-in variant.
- `SiteFooter`:
  - a `<footer>` with "StreakBoard is run by {SITE_OPERATOR}.", a "Privacy Policy" link to `/privacy` and a "Contact" link to `mailto:{CONTACT_EMAIL}`;
  - muted-foreground tokens, readable at 375 px width.

#### 4. Privacy policy

**File**: `src/pages/privacy.astro` (new)

**Intent**: The policy that Google requires for the home page and Branding, and the information GDPR Art. 13 requires when the account is created. Every statement must be true for the code as it is.

**Contract**:

- `GET /privacy`, server-rendered (no `prerender` export), public (no middleware change), and the same response whether the visitor is signed in or not.
- `PublicLayout title="Privacy Policy"`, `<h1>Privacy Policy</h1>`, a "Last updated" date (the implementation date), plain English.
- `<h2>` sections in this order, each with these statements. The sources are research §4, §5 and the follow-up, plus Current State Analysis above; re-check each anchor while writing.
  1. **Who we are**:
     - StreakBoard is run by Mariusz Złotucha, a private individual, who is the controller;
     - contact: `CONTACT_EMAIL` as a `mailto:` link;
     - no data protection officer.
  2. **What we collect**:
     - account: the e-mail address, a password hash kept by Supabase Auth (the app never stores the password) and the sign-up and sign-in times;
     - with "Continue with Google": the name, e-mail and profile picture that Google shares (the app uses only the e-mail);
     - for each signed-in session: the IP address and the browser (user agent), plus a security log of account events with the IP address (Supabase Auth);
     - content you create: the group name, task titles (free text, so nothing sensitive belongs there), memberships, the tasks you join and the days or weeks you mark done;
     - technical:
       - our own log entries (route, user id, request id, time);
       - error reports that carry only the user id: no cookies, headers, request bodies or query strings (`src/lib/sentry-options.ts:15-40`, `src/lib/log.ts:119-129`);
       - our own log entries and error reports mask e-mail addresses and invite codes (`src/lib/redact.ts`);
       - Cloudflare, as the host, processes the IP address and request details to serve the site, and its request logs record each requested address (an invite link contains its code) with request details such as the IP address;
     - no analytics, no advertising, no tracking scripts.
  3. **Why we use it and on what legal basis**:
     - running your account and the group features (create and join a group, tasks, check-offs, streaks, the leaderboard) and sending the sign-up confirmation e-mail: Art. 6(1)(b), performance of the contract (using StreakBoard);
     - keeping the service secure and finding and fixing errors (request logs, error reports, session data and the security log): Art. 6(1)(f), our legitimate interest in a working and secure service.
  4. **Who can see your data**:
     - the other members of your group see your e-mail address, the tasks you create and join, the days or weeks you mark done, your streaks and your place on the leaderboard;
     - anyone signed in who has your group's invite link can see the group's name before joining;
     - when you leave a group, or its owner removes you, your participation and check-offs in its tasks are deleted and the group no longer shows your e-mail; tasks you created stay in the group;
     - nobody else sees your e-mail in the app.
  5. **Service providers and transfers**:
     - Cloudflare: hosting, domain, DNS, request logs;
     - Supabase: database and sign-in; the database is in the EU (Ireland); the contracting party is Supabase Pte. Ltd. (Singapore), with Standard Contractual Clauses;
     - Resend: sends the confirmation e-mail and keeps account data, e-mail metadata and logs in the United States;
     - Sentry: error reports; may process data in the United States;
     - Google: acts under its own terms when you choose "Continue with Google";
     - transfers outside the EEA rely on the EU–US Data Privacy Framework and/or Standard Contractual Clauses.
  6. **How long we keep it**:
     - account, content, session data and the security log: until the account is deleted;
     - request logs, ours and Cloudflare's: up to 7 days;
     - error reports: up to 90 days (30 on Sentry's free plan, 90 while an organization trial runs);
     - e-mail delivery logs: 30 days;
     - Supabase platform logs: 1 day;
     - cookies: see the next section.
  7. **Cookies**, only strictly necessary ones:
     - the session cookie (`sb-…-auth-token`, possibly split into numbered parts) keeps you signed in; it is removed when you sign out and otherwise lasts up to 400 days after it was last refreshed;
     - a sign-in check cookie (`sb-…-code-verifier`) is used during e-mail sign-up and Google sign-in;
     - `join_code` (1 hour) remembers an invite while you sign in;
     - `auth_email` (60 seconds) refills the e-mail field after a failed attempt;
     - no consent is asked, because none of them is used for anything but the service you asked for.
  8. **Your rights**:
     - access, rectification, erasure, restriction and portability;
     - **the right to object**, in its own paragraph, to processing based on legitimate interests (Art. 21);
     - write to the contact address; you get an answer within one month;
     - you can complain to the Prezes Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa, uodo.gov.pl).
  9. **Deleting your account**:
     - there is no button yet: write from your account's address, and the account and everything above is deleted within one month;
     - if you own a group, the group is deleted with all its tasks and every member's check-offs in it; the other members keep their accounts;
     - tasks you created in someone else's group are deleted together with the other members' participation and check-offs on them;
     - leaving a group keeps your account.
  10. **Do you have to give us your data**:
      - the e-mail address is needed to create an account; without it the service cannot work;
      - there are no automated decisions with legal or similarly significant effects (the leaderboard only adds up streaks).
  11. **Changes**: changes are published on this page with a new date.
- The wording may change during implementation as long as each statement keeps its meaning. Smoke pins only the heading, the operator's name, the contact link and the supervisory authority's name.

#### 5. Landing page

**Files**: `src/pages/index.astro` (rewrite); `src/components/Welcome.astro` and `src/components/Topbar.astro` (deleted)

**Intent**: The promise page for a stranger; a signed-in visitor goes straight to their dashboard.

**Contract**:

- Frontmatter:
  1. `if (Astro.locals.user) return Astro.redirect("/dashboard");`
  2. the existing flow-state block (`FLOW_STATE_ERRORS`, `/auth/signin?error=oauth_failed`), unchanged apart from its comment.
- `PublicLayout` with the default title. The `actions` slot holds "Sign in" (a link to `/auth/signin`) and "Sign up" (primary, `/auth/signup`), styled with `buttonVariants`.
- Content contract (English). The implementer may polish the wording, but keeps the heading, the claims and the link targets.
  - **Hero**:
    - `<h1>Keep each other on track.</h1>`;
    - "StreakBoard is a habit tracker for a group of friends. You track the same tasks, mark them done every day or week, and see each other's streaks on one shared leaderboard.";
    - buttons "Sign up" → `/auth/signup` (primary) and "Sign in" → `/auth/signin` (outline).
  - **"How it works"** (`<h2>`), three items with `lucide-react` icons rendered statically (no `client:` directive):
    1. "Start a group": "Create a group and share its invite link with your friends."
    2. "Add shared tasks": "Anyone in the group can add a task — daily, weekly or once — and everyone joins the ones they want to keep up with."
    3. "Mark done and compare": "Mark a task done when you've done it. Every day or week you keep up adds one to your streak, and the leaderboard ranks the group by everyone's total."
  - **"The shared spreadsheet, without the upkeep"** (`<h2>`): "If your group ever colored a shared sheet green and red, this is that sheet, kept for you. Miss a day — or a week, on a weekly task — and your streak is halved, not reset, so one bad day doesn't end the run."
- Tokens and the shared components only; mobile first; no raw palette classes (`purple-*`, `blue-*`).
- `Welcome.astro` and `Topbar.astro` are deleted (no other importers).

#### 6. Auth pages and styles

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/styles/global.css`

**Intent**: Identity and the policy link where passwords are typed and data is collected; the last cosmic page moves to the tokens.

**Contract**:

- Sign-in and sign-up:
  - `PublicLayout title="Sign in"` / `"Sign up"`, with the existing `Card` centered in `<main>`;
  - the pages' own `min-h-screen bg-muted` wrapper goes, because the shell provides it;
  - forms, the Google button, error handling and the card footer links are unchanged.
- Sign-up only: under the e-mail form, inside the card, "Members of your group will see your e-mail address. See our Privacy Policy." with a link to `/privacy`. "Your group" covers both a group the user joins and one they create (`list_group_members` shows every member's e-mail to every member).
- Confirm-email:
  - `PublicLayout title={content.heading}` with a `Card` laid out like sign-in;
  - the dev and production texts and the link to `/auth/signin` are unchanged;
  - no gradient text.
- `global.css`: the `@utility bg-cosmic` block (`:125-127`) is removed; nothing uses it any more.
- The middleware is unchanged; signed-in visitors still go from these pages to `/dashboard`.

#### 7. Dashboard footer

**File**: `src/pages/dashboard.astro`

**Intent**: Signed-in users can no longer reach `/`, so the policy has to be linked from where they are.

**Contract**: `<SiteFooter />` after the "Signed in as" card (`:441-452`), inside the same column. Nothing else on the dashboard changes (S-11 owns its layout).

#### 8. Secure session cookies

**File**: `src/lib/supabase.ts`

**Intent**: Session and verifier cookies never travel over plain HTTP in production.

**Contract**: the `createServerClient` options gain `cookieOptions: { secure: import.meta.env.PROD }` (the same expression as `src/lib/join-code.ts:18` and `src/lib/auth-email.ts:19`), with a one-line comment. `getAll`, `setAll` and the `createClient` signature are unchanged.

#### 9. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Every new behaviour is proven by its outcome (lesson "Smoke steps must assert outcomes").

**Contract**:

- New helpers:
  - `linkTo(href)`: an `<a>` element with exactly that `href`;
  - a brand-link pattern: an `<a href="/">` whose content contains "StreakBoard";
  - `LANDING_HEADING`: an `<h1>` with "Keep each other on track.";
  - `PRIVACY_HEADING`: an `<h1>` with "Privacy Policy".
- A build-mode probe runs before the steps: `GET /dev/signin-kitchen-sink` with `cookie: ""`. 404 means a production build and 200 means dev; anything else stops the run with a message (fail fast).
- Changed steps:
  - `home renders` (`:346`): 200, `LANDING_HEADING`, the brand link, and `linkTo` for `/auth/signup`, `/auth/signin` and `/privacy`;
  - `home with an unrelated error_code still renders` (`:454-459`) and `home without a query still renders` (`:460`): also `LANDING_HEADING`;
  - `signin page renders for anonymous user` and `signup page renders for anonymous user` (`:348-349`): the brand link and `linkTo("/privacy")`; sign-up also contains "will see your e-mail address";
  - `signin accepts correct password` (`:540-544`): in a production build at least one `sb-` cookie is set and every `sb-` Set-Cookie carries `Secure`. A failure prints the cookie names only, never the values, like the `setCookieExcludes` message;
  - `dashboard renders for signed-in user` (`:545`): `linkTo("/privacy")`.
- New anonymous steps, next to the other anonymous `/` steps:
  - `privacy page renders the policy`: 200, `PRIVACY_HEADING`, the brand link, "Mariusz Złotucha", `href="mailto:mariusz.zlotucha@gmail.com"` and "Prezes Urzędu Ochrony Danych Osobowych";
  - `confirm-email page shows the brand and the policy link`;
  - `starter banner is not served`: `/template.png` → 404;
  - `brand favicon is served`: `/favicon.svg` → 200, and the body includes `<svg`.
- New signed-in steps, right after `dashboard renders for signed-in user`:
  - `home redirects signed-in user to dashboard`: `/` → 302, `locationExact: "/dashboard"`;
  - `home with a flow-state error_code redirects signed-in user to dashboard`: `/?error_code=flow_state_already_used` → 302, `locationExact: "/dashboard"`;
  - `privacy page stays public for signed-in user`: `/privacy` → 200 with `PRIVACY_HEADING`.
- Unchanged: the three anonymous flow-state steps (`:448-453`) and `signout clears session` (`:1757`).

#### 10. Release check

**File**: `.github/workflows/ci.yml` (step "Check the live deployment")

**Intent**: A release fails unless production serves the policy and the home page links it. This is the automated half of archive-gate item 1.

**Contract**:

- After the `/` loop, `/privacy` must answer exactly 200, and the body of an anonymous `GET /` must contain `href="/privacy"`.
- Both checks run together in a retry loop, up to 10 tries 3 s apart. The `/` loop stops at the first 200, which the previous Worker version also returns (`.github/workflows/ci.yml:163-169`), and these are the first live checks that only the new version passes; the Google hops already retry for the same reason (`:182-185`).
- After the last try the step fails and prints what it expected and what it got (the last status, or that the link is missing), like the existing checks.
- No other check changes.

#### 11. Documentation

**Files**: `README.md`, `CLAUDE.md`

**Intent**: The docs match the new public surface, the release checks, the HTTPS setup and the deletion procedure.

**Contract**:

- `README.md:1-5`: the title "StreakBoard", one sentence describing the product; the banner line is removed.
- A "Public pages" table before "Auth routes" (`README.md:147`):
  - `/`: landing page; signed-in → `/dashboard`; flow-state `error_code` → `/auth/signin?error=oauth_failed`;
  - `/privacy`: the privacy policy.
- Release step 3 (`README.md:208`) and the CI `release` bullet (`README.md:336`) name the `/privacy` 200 check and the policy link on `/`.
- The Google provider paragraph (`README.md:265`): "which does not exist yet (it belongs to the landing-page slice, S-09)" becomes the home page and policy URLs plus the note that, while the app is in Testing, Branding saves them as a draft that users do not see. The test-user sentence stays.
- The "Custom domain" section (`README.md:267`):
  - "Always Use HTTPS" is on (owner, Cloudflare dashboard, S-09);
  - production builds set `Secure` on the Supabase cookies, so a local `npm run preview` keeps a session only in browsers that treat `http://localhost` as secure (Chromium, Firefox).
- The "Smoke test" section (`README.md:302`) mentions the landing, policy and brand steps and the signed-in redirect, and says that the `Secure` check runs only against a production build.
- A new short subsection, "Handling a data deletion request", under "Production auth settings", run by the owner in the Supabase Dashboard:
  1. If the person owns a group, delete the group first (SQL editor: `delete from public.groups where owner_id = '<user id>'`); `groups.owner_id` blocks deleting the user otherwise.
  2. Delete the user (Authentication → Users).
  3. Then delete their audit entries: `delete from auth.audit_log_entries where payload->>'actor_id' = '<user id>' or payload->'traits'->>'user_id' = '<user id>'`. This runs after step 2, because deleting the user writes a `user_deleted` entry that names them.
  4. Reply within one month.
- `CLAUDE.md`:
  - the architecture lists the public pages (`index.astro` with its two redirects, `privacy.astro`), `PublicLayout` and `src/components/site/`;
  - the auth-flow line notes `Secure` cookies in production builds;
  - the conventions gain a rule: "The privacy policy (`src/pages/privacy.astro`) states facts about the data model, who sees what, deletion, cookies and providers; a change to any of them updates the policy in the same change."

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Astro check passes: `npx astro sync && npx astro check`
- Production build passes: `npm run build`
- Vitest suite passes with the local Supabase stack running (one DB session at a time): `npm test`
- Smoke passes against the production preview, including the new and changed steps and the `Secure` check: `npm run build && npm run preview -- --port 4321`, then `BASE_URL=http://localhost:4321 npm run smoke`
- The Playwright suite passes against the production preview, so the stored session survives `Secure` cookies on `http://localhost`: `npx playwright test`
- No starter leftover is referenced: `rg -n "bg-cosmic|Welcome|Topbar|template\.png|10x Astro Starter" src public README.md CLAUDE.md` prints nothing
- CI on the PR: the `ci`, `smoke` and `integration` jobs pass

#### Manual Verification:

- The owner reads `/privacy` on the preview and confirms that every statement is true and acceptable (controller, contact, legal bases, retention, deletion consequences)
- `/` reads well and works on desktop and at about 375 px width (no horizontal scroll, buttons within reach)
- Sign-in, sign-up and confirm-email show the header and footer at phone width; the sign-up notice and the new favicon look right
- In a browser on the preview: signing in lands on `/dashboard`, opening `/` while signed in lands on `/dashboard`, the dashboard footer opens `/privacy`, and signing out still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Production release, HTTPS and Google submissions

### Overview

This phase closes the slice the way the lessons require (merge, approved `release`, production check, a record in `deployment-plan.md`), then sends the Google submissions that the owner put behind the deploy and records them in a small docs PR. It finishes in one session; Google's verdict, which takes days to weeks, is Phase 3. The owner does the dashboard and console steps; Claude runs the anonymous `curl` checks and writes the records. No credentials go into the chat.

### Changes Required:

#### 1. Release

**Intent**: Phase 1 reaches production through the gated release.

**Contract**: the owner merges the Phase 1 PR and approves `release` in the `production` environment after checking that the merge commit adds nothing under `supabase/migrations/` (the latest stays `20261002090000_create_task_checkoffs.sql`). A failed release is re-run from the Actions page; a broken production is rolled back with `npx wrangler rollback`.

#### 2. Always Use HTTPS

**Intent**: Plain HTTP never serves a page with a password field again.

**Contract**: the owner, in the Cloudflare dashboard: `streakboard.app` → SSL/TLS → Edge Certificates → Always Use HTTPS: On. Claude then checks with `curl -sI` that `http://streakboard.app/` and `http://streakboard.app/auth/signin` answer 301 to the same path on `https://`.

#### 3. Production check

**Intent**: Production shows what Phase 1 proved on the preview, before anything is sent to Google.

**Contract**:

- Claude, with anonymous `curl`:
  - `/` has the heading and links to `/auth/signup`, `/auth/signin` and `/privacy`;
  - `/privacy` answers 200 with the heading and `href="mailto:mariusz.zlotucha@gmail.com"` (not rewritten into `/cdn-cgi/l/email-protection`);
  - `/auth/signin` and `/auth/signup` carry the brand link;
  - `/template.png` answers 404 and `/favicon.svg` 200.
- The owner, in a browser:
  - the pages at phone width;
  - signing in, then opening `/`, lands on `/dashboard`;
  - the `sb-` cookies are marked Secure in DevTools;
  - Google sign-in still works for a listed tester, and signing out works.

#### 4. Search Console review request

**Intent**: Ask Google to re-evaluate the site once everything above is live.

**Contract**: the owner, after steps 1–3: Search Console → Security issues → Request review, with this text (the release date filled in):

```text
StreakBoard (https://streakboard.app) is a free habit tracker for groups of friends, run by Mariusz Złotucha; contact details are on https://streakboard.app/privacy.

Issue: until 2 October 2026 the home page still showed the text of the open-source starter template the app was built from, next to sign-in buttons, and the sign-in and sign-up pages did not show the site's name, so a visitor could not tell which site they were on.

Steps taken (live since <release date>): the home page describes the product and who runs it; every public page (home, sign-in, sign-up, e-mail confirmation, privacy policy) shows the StreakBoard name and logo and links the privacy policy; the template's leftover images and styling are removed; plain HTTP redirects to HTTPS.

Outcome: the site asks only for a StreakBoard account's own e-mail and password and does not imitate any other service. The only third-party mark is the standard "Continue with Google" button, which starts Google sign-in through our authentication provider (Supabase) and returns to streakboard.app.
```

#### 5. Google Auth Platform Branding

**Intent**: The OAuth app points at the same home page and policy, which is the precondition for publishing it later (archive-gate item 3).

**Contract**: the owner: App home page `https://streakboard.app/`, privacy policy link `https://streakboard.app/privacy`, authorized domain `streakboard.app`. While the app is in Testing these are saved as Draft Branding that users do not see; the publishing status stays Testing.

#### 6. Records

**Files**: `context/changes/deployment/deployment-plan.md`, `context/changes/landing-page/change.md`

**Intent**: Every external step and its result is written down before the wait for Google starts.

**Contract**:

- Claude adds "Phase 13 — Landing page and privacy policy (change `landing-page`, S-09)" to `deployment-plan.md`: the merge commit, the CI run, the release result, the HTTPS check, the production check, the review request date and the Branding entries.
- The first three `change.md` Notes items are ticked as the owner confirms them; the fourth waits for Phase 3.
- These records go in a small docs PR at the end of this phase, so nothing waits unmerged during the review.

### Success Criteria:

#### Automated Verification:

- The `release` run for the merge finishes `success`, including the new `/privacy` and policy-link checks
- Plain HTTP redirects to HTTPS on production: `http://streakboard.app/` and `http://streakboard.app/auth/signin` answer 301 to `https://` (`curl -sI`)
- Anonymous production responses match the Phase 1 smoke expectations for `/`, `/privacy` (contact link not rewritten), the auth pages, `/template.png` and `/favicon.svg` (`curl`)

#### Manual Verification:

- The owner's production check passes: phone width, signed-in `/` → `/dashboard`, `Secure` on the `sb-` cookies, Google sign-in for a listed tester, sign-out
- The Search Console review is requested after the release and the HTTPS switch, and its date is recorded in `deployment-plan.md` Phase 13
- Branding holds the home page and policy URLs and `streakboard.app` as an authorized domain (draft), recorded in Phase 13

**Implementation Note**: After the docs PR is merged, the slice waits for Google's verdict. Continue with Phase 3 only when Search Console shows the result.

---

## Phase 3: Google review outcome

### Overview

Google answers the review request in days to weeks (research §6). This phase starts when Search Console shows the verdict: Claude confirms it from outside, the result is recorded, and the owner opens the archive gate. It changes no code unless the review is rejected.

### Changes Required:

#### 1. Review outcome

**Intent**: The verdict is confirmed from two sources before anything is archived.

**Contract**: the owner reads Search Console → Security issues. Claude queries `https://transparencyreport.google.com/transparencyreport/api/v3/safebrowsing/status?site=streakboard.app`, expecting status `1` and no flag, with `example.com` as the control.

#### 2. A rejected review

**Intent**: A rejection is fixed, not undone.

**Contract**:

- The fix and the next request stay in S-09 as new commits under this change, never as a revert of the public pages.
- The next request goes out only after the fix is live, and the pages must not switch back and forth (30-day block for repeat offenders; Critical Implementation Details).
- This phase then waits again.

#### 3. Records and archive gate

**Files**: `context/changes/deployment/deployment-plan.md`, `context/changes/landing-page/change.md`

**Intent**: The slice is archived only when Google has accepted the site, and the record shows it.

**Contract**:

- Claude adds the verdict, its date and the Transparency Report result to Phase 13 in `deployment-plan.md`.
- The fourth `change.md` Notes item is ticked when the owner confirms it.
- Both go in a small docs PR.
- `/10x-archive landing-page` runs only after the owner confirms all four items in `change.md` (Notes).

### Success Criteria:

#### Automated Verification:

- The Transparency Report API returns status 1 with no flag for `streakboard.app`

#### Manual Verification:

- Search Console shows no security issue; the result and its date are recorded in `deployment-plan.md` Phase 13
- The owner confirms all four archive-gate items in `change.md` before `/10x-archive landing-page`

---

## Testing Strategy

### Unit Tests:

- None new: the slice adds no pure logic.

### Integration Tests:

- The existing Vitest suite stays green. `src/lib/supabase.ts` changes, and the tests that need the client already mock it.
- Smoke is the behaviour test (Phase 1, change 9). The existing Playwright suite runs once against the production preview; no new specs.

### Manual Testing Steps:

1. On the preview, signed out: read `/`, follow "Sign up", "Sign in" and "Privacy Policy" from the header, the hero and the footer; check the page at about 375 px width.
2. Open `/auth/signup`, check the notice next to the form and its link, then `/auth/signin` and `/auth/confirm-email`.
3. Sign in, open `/` (it lands on `/dashboard`), follow the dashboard footer to `/privacy`, sign out.
4. On production after the release: the same walk, plus `http://` → `https://` and the Secure flag on the `sb-` cookies.

## Performance Considerations

The landing and policy pages are server-rendered static content with no new client JavaScript (the icons render statically). Removing `template.png` takes a 1.27 MB file off the site.

## Migration Notes

No database migration. Rollback: `npx wrangler rollback` restores the previous Worker, and "Always Use HTTPS" can be switched off in the dashboard. While a review is pending, prefer fixing forward (Critical Implementation Details). Dropping `Secure` again would need no data change; cookies are rewritten on the next refresh.

## References

- Frame: `context/changes/landing-page/frame.md` (reframed problem, archive gate)
- Research: `context/changes/landing-page/research.md` (§1–§7, follow-up with the owner's inputs)
- Archive gate checklist: `context/changes/landing-page/change.md` (Notes)
- Lessons: `context/foundation/lessons.md` ("Smoke steps must assert outcomes", "Close every slice by merging to master, approving the production release and checking the production URL", "Run independent slices in parallel git worktrees, one agent session each")
- Domain language: `context/domain/glossary.md`; product promise: `context/foundation/prd.md` (Vision, Business Logic)
- Similar implementation: `src/pages/auth/signin.astro:15-33` (Card on `bg-muted`), `src/lib/join-code.ts:14-20` (a `secure` cookie in production), `scripts/smoke.mjs:125-151` (HTML helpers)
- Previous slice: `context/archive/2026-10-05-google-login/plan.md` (flow-state redirect on `/`, Google app in Testing)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Public pages, privacy policy and HTTPS-only cookies

#### Automated

- [x] 1.1 Lint passes — 903a89b
- [x] 1.2 Astro check passes — 903a89b
- [x] 1.3 Production build passes — 903a89b
- [x] 1.4 Vitest suite passes — 903a89b
- [x] 1.5 Smoke passes against the production preview, including the new steps and the Secure check — 903a89b
- [x] 1.6 Playwright suite passes against the production preview — 903a89b
- [x] 1.7 No starter leftover is referenced — 903a89b
- [x] 1.8 CI jobs ci, smoke and integration pass on the PR — 4036a7c

#### Manual

- [x] 1.9 Owner confirms every statement of the privacy policy — 903a89b
- [x] 1.10 Landing page reads well on desktop and at phone width — 903a89b
- [x] 1.11 Auth pages show the header, footer, sign-up notice and new favicon — 903a89b
- [x] 1.12 Signed-in browser flow on the preview: dashboard redirect, footer link, sign-out — 903a89b

### Phase 2: Production release, HTTPS and Google submissions

#### Automated

- [ ] 2.1 Release run succeeds with the new live checks
- [ ] 2.2 Plain HTTP redirects to HTTPS on production
- [ ] 2.3 Production pages match the smoke expectations

#### Manual

- [ ] 2.4 Owner's production check passes
- [ ] 2.5 Search Console review requested and recorded
- [ ] 2.6 Branding URLs saved and recorded

### Phase 3: Google review outcome

#### Automated

- [ ] 3.1 Transparency Report shows no flag for streakboard.app

#### Manual

- [ ] 3.2 Review passed and recorded
- [ ] 3.3 Owner confirms the archive gate in change.md
