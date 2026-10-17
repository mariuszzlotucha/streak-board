# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Astro 7 SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. API routes must export `const prerender = false`.

**Auth flow**: `src/lib/supabase.ts` creates a Supabase SSR client (`@supabase/ssr`, cookie-based sessions) from `SUPABASE_URL`/`SUPABASE_KEY` — declared as server-only secrets in `astro.config.mjs`'s `env.schema` and read via `astro:env/server`. Both are `optional: true`; if either is unset, `createClient` returns `null`. The same schema holds `CONTACT_EMAIL` (the privacy policy's contact address, read at runtime through `contactEmail()` in `src/lib/site.ts`, so it is not in the repo). Its `cookieOptions` set `Secure` on every Supabase cookie in a production build (`import.meta.env.PROD`). `src/middleware.ts` runs on every request, resolves the user onto `context.locals.user` (or `null` when Supabase isn't configured), and redirects unauthenticated requests away from paths listed in its `PROTECTED_ROUTES` array (currently `["/dashboard", "/settings", "/account", "/api/groups", "/api/tasks", "/api/account", "/api/reminders"]`). The middleware tells an Auth service failure (answered 503 on those paths, via `resolveAuthState` in `src/lib/auth-state.ts`) from a missing session (302), and reports failures through `src/lib/log.ts`. On a protected path it is also the nickname gate: it reads the signed-in user's own row of `nicknames` (`getOwnNickname` in `src/lib/nicknames.ts`) into `context.locals.nickname`, redirects a user without one to `/account/nickname` from every protected path except its `NICKNAME_ROUTES` (that page and `POST /api/account/nickname`), and answers 503 (`nickname.lookup.failed`) when the read fails; elsewhere `locals.nickname` is `null`.

- API endpoints: `src/pages/api/auth/{signin,signup,signout,google}.ts` (`google.ts` starts the Google sign-in, a form POST guarded by Astro's origin check), `src/pages/api/groups/{create,join,rename,leave,remove-member,delete,transfer,dismiss-owner-notice}.ts` (`transfer` hands the group to another member through `transfer_group_ownership`; `dismiss-owner-notice` is the new owner's "Got it"), `src/pages/api/tasks/{create,update,delete,join,leave,checkoff,uncheck}.ts`, `src/pages/api/account/nickname.ts` (sets or changes the nickname through `set_nickname`; the first save ends on `/dashboard`, a change on `/settings`), `src/pages/api/account/delete.ts` (deletes the caller's account through `delete_own_account`, with `successor_id` for an owner with other members, then signs out, clears `join_code` and ends on `/?account=deleted`), `src/pages/api/reminders/{subscribe,unsubscribe,unsubscribe-all}.ts` (store or delete this device's push subscription, or all of the caller's, through `src/lib/reminders/subscription-route.ts`)
- Scheduled reminders: `wrangler.jsonc` points `main` at the custom Worker entry `src/worker.ts` (`fetch` is Astro's handler; `scheduled` is wrapped by `runScheduledWithSentry` in `src/lib/sentry.ts`) with crons `0 18 * * *` and `0 19 * * *`; `reminderRun` in `src/lib/reminder-rules.ts` acts only in the 20:00 Warsaw hour (daily tasks every day, weekly on Sunday, once never), and `src/lib/reminders/run.ts` reads `due_reminders` through `createAnonClient` (`src/lib/supabase-anon.ts`) with `REMINDER_SECRET`, sends encrypted Web Push (`src/lib/reminders/web-push.ts`, VAPID) and prunes subscriptions the push service reports gone (404/410)
- Public pages: `src/pages/index.astro` (landing page, sections in `src/components/landing/`; `landingRedirect` in `src/lib/landing.ts` redirects a signed-in visitor to `/dashboard`, then an anonymous visitor with a flow-state `error_code` to `/auth/signin?error=oauth_failed`, in that order; `?account=deleted` shows the `role="status"` line "Your account has been deleted.") and `src/pages/privacy.astro` (the privacy policy, server-rendered, public). They and the auth pages render inside `src/layouts/PublicLayout.astro`, built from `src/components/site/{SiteHeader,SiteFooter}.astro`; the footer (also on the dashboard) reads the operator's name and contact address from `src/lib/site.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`; both sign-in and sign-up render `src/components/auth/GoogleButton.astro` ("Continue with Google", a plain form posting to `/api/auth/google`)
- Auth return routes (public GETs): `src/pages/auth/callback.ts` (e-mail confirmation link; every exchange failure ends on `/auth/signin?error=link_expired`) and `src/pages/auth/google/callback.ts` (Google sign-in; cancellation, a stale attempt and a failure end on `/auth/signin` with a fixed code from `src/lib/auth-errors.ts`, never reflecting provider text)
- Protected group hub: `src/pages/dashboard.astro` renders `DashboardView` (`src/components/dashboard/DashboardView.astro`, cards in `src/components/dashboard/`) inside `src/layouts/AppLayout.astro` (brand header with Sign out, `<main>`, footer); data loaded by `loadDashboard` in `src/lib/dashboard-data.ts`, and a failed load answers 503 with the error page; after an ownership transfer the new owner sees a one-time `role="status"` banner with "Got it" (`groups.owner_notice_pending`)
- Protected settings page: `src/pages/settings.astro` renders `SettingsView` (`src/components/dashboard/SettingsView.astro`, with `GroupSettingsCard`: rename, "Transfer ownership" (only with another member) and delete for the owner, leave for a member; and `AccountCard`: the nickname, the user's own e-mail address, the only place it is shown, a link to change the nickname and "Delete account", whose dialog depends on the user's group: none, member, sole owner, or owner with members, who must choose a successor; and `RemindersCard`: the per-device reminders switch, island `src/components/account/RemindersToggle.tsx` with `usePushReminders` and `src/lib/pwa/push.ts`) inside `AppLayout`; data loaded by `loadSettings` in `src/lib/settings-data.ts` (the caller's group only), a failed load answers 503 with the error page, and the actions redirect to `/dashboard`. `AppLayout` renders the Main nav, "Dashboard" and "Settings", next to the brand only when given `current`, and the "Signed in as" line with the nickname (`nickname` prop) only when the user has one
- Protected nickname page: `src/pages/account/nickname.astro` renders `NicknameView` (`src/components/account/`, form `NicknameForm`) inside `AppLayout` without the Main nav: the first choice every account makes before any other protected page (prefilled with the name from Google via `suggestNickname`, when it passes the rules) and the change reached from `/settings`. Members are named by nickname everywhere (`GroupMember.nickname`, "Unknown member" without one); no member's e-mail address reaches the dashboard
- Public invite route: `src/pages/join/[code].ts` (stores the code in a cookie for 7 days and redirects to `/dashboard`). `POST /api/auth/signup` also stores a pending code with the new account (`user_metadata.join_code`, `inviteForSignUp`), because the confirmation link works only in the browser that signed up. `/dashboard` joins a pending invite at once through `joinPendingInvite` (`src/lib/pending-invite.ts`): cookie first, then the stored code; it ends on `?notice=group_joined` or `?error=invalid_code|already_in_group` and spends the invite; a transient failure keeps the cookie and the "Join <group>?" card becomes the manual retry
- Security headers: `src/middleware.ts` sets the fixed headers (`SECURITY_HEADERS` in `src/lib/security-headers.ts`, repeated in `public/_headers` for static files) and sends the page CSP Astro computes from `security.csp` in `astro.config.mjs` (Supabase origin added in `src/layouts/Layout.astro`) as Report-Only (`toReportOnly`, `CSP_MODE`); public routes `src/pages/api/csp-report.ts` (logs normalized `csp.violation` lines) and `src/pages/.well-known/security.txt.ts` (contact from `CONTACT_EMAIL`); see `@README.md` (Security headers and CSP)
- Not found: `src/pages/404.astro` (SSR, "Page not found" inside `PublicLayout`, status 404) for every unmatched address
- Installable app: `public/manifest.webmanifest`, `public/icons/` (from `node scripts/pwa-icons.mjs`) and the service worker `public/sw.js`, which caches nothing and has no `fetch` handler (PRD Non-Goals) but handles `push` and `notificationclick` for the reminders; `Layout.astro` links them and loads `src/lib/pwa/register.ts` (production build only), which shows `src/components/site/UpdateNotice.astro` after a release takes over an open page and reports failures to the public `src/pages/api/client-errors.ts` (a `text/plain` code only, reported as `client.sw.<code>`)

## Conventions

- Path alias `@/*` → `./src/*` (tsconfig).
- Astro components for static content/layout; React only where interactivity is needed.
- Merge Tailwind classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge) rather than concatenating class strings.
- shadcn/ui components live in `src/components/ui/` (`radix-maia` style, `lucide` icons). Add new ones with `npx shadcn@latest add [name]` (see UI below).
- API routes use uppercase `GET`/`POST` exports.
- No Next.js directives in React components (no `"use client"`); extract hooks to `src/components/hooks/`.
- Services/helpers go in `src/lib/`; shared types (entities, DTOs) belong in `src/types.ts` (generated from the local database schema with `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`, which CI compares with `npm run types:check`; do not hand-edit).
- The privacy policy (`src/pages/privacy.astro`, one component per section in `src/components/privacy/`) states facts about the data model, who sees what, deletion, cookies and providers; a change to any of them updates the policy in the same change.
- Supabase migrations go in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled and granular per-operation/per-role policies on every new table. The schema currently consists of `groups`, `group_members`, `tasks`, `task_participants`, `task_checkoffs` (read through the `task_checkoff_periods` view) and `nicknames` (written only through `set_nickname`) plus `push_subscriptions` (one row per device, cascade-deleted with the user; written through `subscribe_push`, `unsubscribe_push`, `unsubscribe_all_push`) and `reminder_secret` (the hash of `REMINDER_SECRET`), plus Supabase Auth's built-in `auth.users`. `due_reminders` and `prune_push_subscriptions` are callable by `anon` but guarded by the secret through the internal `check_reminder_secret`. `groups.owner_notice_pending` flags the new owner's banner. Ownership changes only through `transfer_group_ownership` and accounts are deleted through `delete_own_account` (both `security definer` on `auth.uid()`; their inner layers `transfer_group_ownership_for` and `delete_account` are for the operator in the SQL Editor only). `groups.owner_id` and `tasks.created_by` are `on delete restrict`, so deleting a group owner or task creator any other way fails.

## UI

- **Tokens.** Colours, radii and fonts live in `src/styles/global.css`: values in `:root` and `.dark`, published to Tailwind by `@theme inline`. A new token goes into all three blocks, with its raw value and source in the change's `tokens-source/` folder, and `node scripts/token-contrast.mjs` must pass (CI runs it after lint).
- **Components.** They live in `src/components/ui/` (`radix-maia`, lucide icons). Check there before creating one, and add a missing one with `npx shadcn@latest add <name>` (preview with `--dry-run`). The registry imports `cn` from the npm package `cn`: point the new file at `@/lib/utils` and restore the package files (`git checkout -- package.json package-lock.json && npm ci`); ESLint rejects the `cn` package import. Shared form pieces (`FormField`, `SubmitButton`) live in `src/components/forms/`.
- **No literals.** No literal colours or arbitrary values in views; use tokens. In the dashboard view files (`src/pages/dashboard.astro`, `src/pages/settings.astro`, `src/pages/dev/`, `src/pages/account/`, `src/layouts/`, `src/components/{dashboard,tasks,groups,forms,site,dev,account}/`) ESLint rejects hex colours, colour functions, Tailwind palette classes and arbitrary px/rem values; other arbitrary values (`%`, `calc()`, `var()`) are left to review. When prose trips the rule, reword it; do not weaken the rule.
- **No `asChild` from `.astro`.** Astro hands a React component its `.astro` children as static HTML, so `asChild` loses the child's props. Use `CardTitle as="h2"` for card headings, and `<a class:list={buttonVariants(...)}>` for link buttons.
- **Smoke binds the markup.** `scripts/smoke.mjs` binds the dashboard and settings markup with regular expressions (one `<li>` per task, exact `<h2>` card headings, badges and buttons holding only their text, `role="alert"` only for errors): keep its invariants, or change smoke in the same change.
- **The gate.** The dev-only kitchen sink `/dev/dashboard-kitchen-sink` renders the real `DashboardView`, `SettingsView` and `NicknameView` from fixtures (`src/components/dev/dashboard-fixtures.ts`) in every page state of `/dashboard`, `/settings` (`settings-*`) and `/account/nickname` (`nickname-*`), plus the control states. `scripts/ui-screenshots.mjs` captures them against a running `astro dev` (see `@README.md`, Smoke test).

## Parallel work (git worktrees)

Several slices can be developed at once, one agent session per linked git worktree (siblings under `../streak-board-worktrees/`; the main checkout stays on `master`). In a worktree never run `git checkout master` or `git pull`; base branches on `origin/master`. Only one session at a time runs the local Supabase stack and the DB-backed tests. The independence check, the setup and the shared-resource rules are in `context/foundation/lessons.md` ("Run independent slices in parallel git worktrees, one agent session each").

## Commands

`npm run {dev,build,preview,lint,lint:fix,format,smoke,test,test:unit,test:mutation,test:rls,guard:migrations,types:check,deps,review}` — see `@README.md` (Available Scripts, Smoke test) for what each does and when to run it.

Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`. Tests: `npm test` (both Vitest projects, unit and integration, against the local Supabase stack; needs `supabase start`), `npm run test:unit` (the unit project alone; needs no stack), `npm run test:mutation -- --mutate <path>` (Stryker on the unit project) and `npm run test:rls` (SQL RLS scenarios via `docker exec`); the Playwright e2e specs in `tests/e2e/` run with `npx playwright test`; see `@README.md` (Tests).

## Environment

Node.js v22.14.0 (`.nvmrc`). Local Supabase/env-var setup, deployment, and CI jobs are documented in `@README.md` (Supabase Configuration, Deployment, CI) — don't duplicate that here.

## Mutation testing

Repo uses Stryker for selective mutation testing on risk-critical modules.
Run it only for code covered by the current change or a risk from test-plan.md,
prefer narrowed scope with --mutate "path/to/file.ts:start-end", and do not chase
100% mutation score. Survived mutants should be reviewed one by one: add an
assertion only when the mutant represents a user-visible or business-relevant bug.

<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — moduł 5, lekcja 5 (agenci asynchroniczni i zdalni)

Deleguj ograniczoną, zaplanowaną zmianę i wróć, aby ją przejrzeć. Kontrola nie znika; przenosi się do kontraktu zadania, konfiguracji sandboxa i końcowego przeglądu.

```
/10x-plan -> /goal + /10x-goal-implement (interactive or claude -p) -> review the commits and the manual checklist
```

### Router zadań — od czego zacząć

| Umiejętność                       | Użyj jej, gdy                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/10x-goal-implement <change-id>` | Zatwierdzony `context/changes/<id>/plan.md` powinien zostać wykonany bez nadzoru. Połącz go z `/goal <condition>`; zapisuje commit po każdej zielonej fazie i kończy się oczekującymi ręcznymi kontrolami. |
| `/10x-implement`                  | Chcesz samodzielnie kierować każdą fazą.                                                                                                                                                                   |

### Twarde zasady

- **Deleguj wyłącznie zaplanowaną pracę.** Brak zatwierdzonego `plan.md` oznacza brak działania bez nadzoru.
- **Ogranicz każde uruchomienie.** Warunek `/goal` określa stan końcowy i limit tur.
- **Zielone uruchomienie nie oznacza ukończonej zmiany.** Przejrzyj commity i wykonaj ręczną checklistę przed mergowaniem.
- **Przyznaj sandboxowi tylko te sekrety i dostęp do sieci, których zadanie potrzebuje.**
- **Monitoruj równoległe i zdalne uruchomienia w jednym miejscu.** Uruchamiaj każdą sesję bez nadzoru w osobnym obszarze roboczym herdr, aby widzieć, którzy agenci pracują, są zablokowani lub skończyli, oraz interweniować z przeglądarki (konfiguracja w M2L6 Deep Dive).

<!-- END @przeprogramowani/10x-cli -->
