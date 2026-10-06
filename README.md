# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

**Production:** <https://streakboard.app> (Cloudflare Registrar, DNS in Cloudflare). The same domain sends the auth e-mail.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run smoke` - Smoke test the auth and group flows against a running server (`BASE_URL`, defaults to `http://localhost:4321`)
- `npm test` - Run the Vitest integration tests against the local Supabase stack
- `npm run test:rls` - Run the SQL RLS scenario checks against the local database

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

The database schema (groups, members, tasks, task participation, row-level security and helper functions) lives in `supabase/migrations/`. A fresh `npx supabase start` applies it; after pulling new migrations run `npx supabase db reset` (it wipes local data) to re-apply them all.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

The group features need the same schema in the hosted project: run `npx supabase link --project-ref <project-ref>` once, then `npx supabase db push`.

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                   | Description                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/signin`          | Email/password sign-in form, with "Continue with Google" above it                                                                                                                   |
| `/auth/signup`          | Email/password sign-up form, with "Continue with Google" above it                                                                                                                   |
| `/auth/confirm-email`   | Post-signup "check your inbox" page                                                                                                                                                 |
| `POST /api/auth/google` | Starts the Google sign-in (the button's form): redirects to Supabase's authorize URL and sets the PKCE code verifier cookie on the same response; `GET` answers 404                 |
| `/auth/google/callback` | Return from Google (`GET`): exchanges the `code` and continues to `/dashboard`; cancellation, a stale attempt and a failure end on `/auth/signin?error=<code>` with a fixed message |
| `/dashboard`            | Protected group hub (redirects to `/auth/signin` if unauthenticated)                                                                                                                |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

The Google provider is off on the local stack (`supabase/config.toml` has no `[auth.external.google]`, and no Google credentials are used locally), so locally the "Continue with Google" button ends on GoTrue's JSON error from the local Supabase. That is expected; the start and return routes are covered by the Vitest tests and the smoke script instead, and the whole flow is checked on production.

Signing out of StreakBoard does not sign out of Google, and the start route sends no `prompt=select_account`. On a shared device with one Google account and earlier consent, "Continue with Google" can sign the next person in as the previous one without asking, so sign out of Google there as well.

### Group routes

| Route                            | Description                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `/join/<code>`                   | Public invite link: remembers the code in a short-lived cookie, redirects to `/dashboard` |
| `POST /api/groups/create`        | Create a group (field `name`); the caller becomes its owner                               |
| `POST /api/groups/join`          | Join with an invite code or a pasted invite link (field `code`)                           |
| `POST /api/groups/rename`        | Owner: rename the group (field `name`)                                                    |
| `POST /api/groups/leave`         | Member: leave the group (the owner leaves only by deleting it)                            |
| `POST /api/groups/remove-member` | Owner: remove another member (field `user_id`)                                            |
| `POST /api/groups/delete`        | Owner: delete the group; every membership goes with it                                    |

### Task routes

| Route                      | Description                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /api/tasks/create`   | Member: create a task in their group (fields `title`, `recurrence`: once/daily/weekly)            |
| `POST /api/tasks/update`   | Creator: change the title of a task (fields `task_id`, `title`)                                   |
| `POST /api/tasks/delete`   | Creator: delete a task (field `task_id`)                                                          |
| `POST /api/tasks/join`     | Member: join a task of their group (field `task_id`); joining twice does nothing                  |
| `POST /api/tasks/leave`    | Participant: leave a task they joined (field `task_id`); leaving twice does nothing               |
| `POST /api/tasks/checkoff` | Participant: tick the current day or week of a task (field `task_id`); ticking twice does nothing |
| `POST /api/tasks/uncheck`  | Participant: undo the tick of the current period (field `task_id`); undoing twice does nothing    |

`/api/groups/*` and `/api/tasks/*` follow the same `PROTECTED_ROUTES` rule as `/dashboard`: an unauthenticated request is redirected to `/auth/signin`. `/join/<code>` is the exception on purpose, so an invited visitor is sent through sign-in by the protected dashboard. Every group and task endpoint redirects back to `/dashboard`, adding `?error=<code>` on failure; the two check-off routes also answer JSON (`{ ok, period }` or `{ ok: false, error }`) to a request that sends `Accept: application/json`, which is what the dashboard's check-off button uses. When the Auth service is unreachable, a protected request answers 503 (JSON `{ ok: false, error: "unavailable" }` for `Accept: application/json`, a plain page otherwise, both with `Retry-After`) instead of the redirect; a request with no session still redirects to `/auth/signin`. Who may do what is decided by Postgres row-level security (see [RLS scenario checks](#rls-scenario-checks)); the app only forwards the signed-in user's session.

### RLS scenario checks

`supabase/checks/rls-scenarios.sql` asserts the row-level security rules of `groups`, `group_members`, `tasks`, `task_participants` and `task_checkoffs` (visibility, joining via `join_group`, leaving, column privileges, the `task_checkoff_periods` view's group scoping, and the `list_group_members` / `preview_group` helper functions) and exits non-zero on the first regression. Run it after every migration that touches group RLS, with the local stack running:

```bash
docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql
```

It only works against the local database (the container name comes from `project_id` in `supabase/config.toml`) and always ends with a rollback, so it leaves no data behind.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/) through a gated GitHub Actions release: a merge to `master` runs CI, and the `release` job in `.github/workflows/ci.yml` then applies pending Supabase migrations and deploys the Worker after a human approval. Workers Builds (Cloudflare's own build of `master`) is disabled, so this is the single deploy path.

### Release

1. Merge the PR to `master`. The `ci`, `smoke` and `integration` jobs run first.
2. When all three pass, the `release` job waits for approval in the GitHub `production` environment (Actions run page → **Review deployments**). **Before approving, check `supabase/migrations/` in the merge commit**: the approval comes before the job prints `supabase migration list`, so this is the moment to see which migrations will reach production.
3. After approval the job runs in this order: link the hosted Supabase project, `supabase migration list`, `npm run build` (so a build failure cannot leave the schema ahead), `supabase db push --yes` (schema before code), `npx wrangler deploy`, and finally checks the live URL (`/` must answer 200, `/dashboard` and `/auth/callback` must answer 302 to `/auth/signin`, and the Google flow must answer in two hops: `POST /api/auth/google` 302 to Supabase's `/auth/v1/authorize?provider=google`, and that URL 302 to `https://accounts.google.com/`; each hop is tried up to 3 times).
4. If a release fails, fix the cause and re-run the failed jobs from the Actions run page: `db push` is idempotent and skips migrations that are already applied.

The `release` job runs only on pushes to `master` (never on pull requests), and releases are serialised (`concurrency: release`), so two pushes cannot interleave migrations; if a newer push queues while an older release still waits for approval, the older run is superseded.

Required configuration of the GitHub `production` environment (Settings → Environments → `production`, with the owner as required reviewer; enter credentialed values in the GitHub UI, never in chat):

| Type     | Name                    | Purpose                                                                                                 |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Secret   | `SUPABASE_ACCESS_TOKEN` | Supabase CLI login for `link` and `db push`                                                             |
| Secret   | `SUPABASE_DB_PASSWORD`  | Database password for `db push`                                                                         |
| Secret   | `CLOUDFLARE_API_TOKEN`  | `wrangler deploy`                                                                                       |
| Secret   | `CLOUDFLARE_ACCOUNT_ID` | `wrangler deploy`                                                                                       |
| Secret   | `SUPABASE_URL`          | Build-time value of the `npm run build` step                                                            |
| Secret   | `SUPABASE_KEY`          | Build-time value of the `npm run build` step                                                            |
| Variable | `SUPABASE_PROJECT_REF`  | Hosted project ref used by `supabase link`                                                              |
| Variable | `PRODUCTION_URL`        | Production host, e.g. `https://streakboard.app` (no trailing slash); base URL for the post-deploy check |

The Worker's runtime secrets (`SUPABASE_URL`, `SUPABASE_KEY`) are set once on the Worker itself (or whenever they change):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

**Migrations must be backward compatible.** The schema ships before the code and a code rollback does not roll the schema back, so every migration has to work with the code version that is currently deployed (add columns and tables first, remove or rename in a later release). There are no automated down-migrations.

### Manual deploy (fallback)

Only needed if Actions is unavailable. Run migrations first if any are pending (`npx supabase db push`), then:

```bash
npm run build && npx wrangler deploy
```

Only while `workers_dev` is enabled (it is `false` in `wrangler.jsonc` now), a first deploy on a fresh Cloudflare account also needs a one-time `workers.dev` subdomain registered for the account — if `wrangler deploy` fails with "could not automatically register ... as your workers.dev subdomain", enable it from the Worker's **Domains** tab in the Cloudflare dashboard (Workers & Pages → your Worker → Domains → enable the `workers.dev` route), then re-run the deploy.

### Rollback

```bash
npx wrangler deployments list   # see deployment history and version IDs
npx wrangler rollback [version-id]   # reverts to the given version, or the prior one if omitted
```

`wrangler rollback` prompts for a message and a confirmation; both fall back to sane defaults in a non-interactive shell. Rollback only affects the Worker's code/version — it does not touch Supabase (migrations are not rolled back, see the backward-compatibility rule above) or any bound resources.

### Auth e-mail sender domain

Confirmation e-mails are sent through Resend SMTP (configured in the Supabase Dashboard under Authentication → SMTP Settings, not in this repo) from the domain `streakboard.app` (Cloudflare Registrar, DNS in Cloudflare). Resend sends from the subdomain `mail.streakboard.app`, with the sender `noreply@mail.streakboard.app`. The app itself is served on `https://streakboard.app`.

### Production auth settings

These settings live only in the Supabase Dashboard of the hosted project. `supabase/config.toml` configures just the local stack and `supabase db push` does not push it, so nothing in the repo sets them and they must be checked by hand after changing the production URL:

- **Site URL** (Authentication → URL Configuration): the production address, `https://streakboard.app`. Without it confirmation links point to the default `http://localhost:3000`.
- **Redirect URLs** (same page): `https://streakboard.app/**`. Sign-up sends `emailRedirectTo` = `<origin>/auth/callback` and the Google start route sends `redirectTo` = `<origin>/auth/google/callback` (both covered by the wildcard); if either is missing from this allow-list Supabase silently falls back to the Site URL and the user is not signed in.
- **Custom SMTP** (Authentication → SMTP Settings): Resend credentials for the sender domain above. The built-in Supabase SMTP has a low rate limit (`over_email_send_rate_limit`).
- **Google provider** (Authentication → Sign In / Providers → Google): enabled with the Client ID and Client secret of a Web application client created in the Google Cloud Console (Google Auth Platform, publishing status **Testing**). The Client ID and secret are entered only in this Dashboard form, never in the repo, CI or chat. The client's authorized redirect URI is Supabase's own callback, `https://<project-ref>.supabase.co/auth/v1/callback`; the wildcard Redirect URL above covers the app's `/auth/google/callback`. In Testing every person who should sign in must be listed as a test user in the Google console (limit 100). Publishing the app (Testing to In production) is gated on a public privacy policy page, which does not exist yet (it belongs to the landing-page slice, S-09). A wrong, rotated or deleted client secret reaches the user as "Something went wrong" and shows only as an `auth.google.callback.returned` info line with `providerError=server_error` in Workers Logs, not in Sentry. The duplicate-e-mail hint on the sign-up page ("use Continue with Google if you signed up with it") shows only when GoTrue answers `user_already_exists`, which it does with auto-confirm on (the local stack). With "Confirm email" on, as on the hosted project, GoTrue is expected to answer an existing address with an obfuscated success and no e-mail (by the source reading in the `google-login` research, not tested live), so a Google-only user who signs up with a password lands on `/auth/confirm-email` without the hint; that obfuscated sign-up success is a known gap of the e-mail path.

### Custom domain

The apex `streakboard.app` is attached to the Worker in the Cloudflare dashboard (Worker → Settings → Domains & Routes) and deliberately not declared in `wrangler.jsonc`. With Wrangler 4.131.x a deploy touches custom domains only when the config declares a `custom_domain` route, so a dashboard-attached domain survives every release. Declaring any such route makes Wrangler send the declared set (with `override_scope`, and in CI forcing the DNS and origin overrides), so a domain attached only in the dashboard may be replaced, and `streakboard.app` would then have to be listed in the file too. Do not add `routes` to `wrangler.jsonc` or `--strict` to the release step to silence a "local configuration differs from the remote configuration" warning.

`workers.dev` and Preview URLs are off through `workers_dev: false` and `preview_urls: false` in `wrangler.jsonc` (without them a deploy would turn `workers.dev` back on). The deploy log therefore says "No targets deployed for 10x-astro-starter": expected, not a failure. The old `https://10x-astro-starter.mariusz-zlotucha.workers.dev` address stops serving the app with the first deploy that carries these keys. To bring `workers.dev` back for good, set `workers_dev: true` in `wrangler.jsonc`; switching it on in the dashboard alone is reverted by the next deploy.

Changing the production address, in this order (add before you remove, move the dependants last):

1. Attach the new host as a Custom Domain in the Cloudflare dashboard (Worker → Settings → Domains & Routes) and make sure it answers (`/` 200, `/dashboard` 302 to its `/auth/signin`).
2. Add the new `https://<host>/**` entry to the Supabase Redirect URLs, keeping the old one.
3. Change the Supabase Site URL.
4. Change `PRODUCTION_URL` in the GitHub `production` environment.
5. Update the docs (this README, `context/changes/deployment/deployment-plan.md`).
6. Verify with a real sign-up and an invite link on the new host.
7. Only then remove the old Redirect URLs entry and switch the old host off. For the move to `streakboard.app` (2026-10, change `custom-domain`, Phase 4) `workers.dev` is switched off through `wrangler.jsonc` and the `workers.dev` Redirect URLs entry is removed after the release that carries it.

## Observability

Server-side failures are reported through `src/lib/log.ts`, never with a bare `console.error`. `reportError(event, error, context)` writes one structured error line, `reportInfo(event, context)` one info line, and `reportMapped(event, code, error, context)` applies the route policy in one place: a returned Supabase error that a route maps to `unknown` or `forbidden` is an error, `rate_limited` is an info line, and every other code is a domain outcome (`invalid_code`, validation) and stays quiet. `requestFields(context)` supplies the `route` (the route pattern, never the raw path), `userId` and the `cf-ray` id.

- **Event names** follow `<area>.<action>.<outcome>`, for example `groups.join.failed`, `tasks.create.exception`, `checkoff.forbidden`, `auth.unavailable`. `.failed` is a returned Supabase error, `.exception` a thrown one.
- **Levels**: error for unexpected outcomes (unmapped SQLSTATEs, 5xx, network failures, `42501`), info for stale or expected ones (a task that is gone, an invalid id, not enrolled, an undo that removes nothing, a rate limit).
- **Fields**: `event`, `route`, `userId`, `ray`, `status`, the SQLSTATE `code` and a scrubbed `message` (plus `details`, `hint` and a trimmed `stack` when present). Messages pass through `src/lib/redact.ts`, which masks e-mail addresses, the values in `Key (column)=(value)` fragments and `/join/<code>` URLs.
- **Never logged**: e-mail addresses, cookies, request bodies and the invite code. The join route logs `codeLength` instead of the code.
- **Reading logs**: `npx wrangler tail --format json` for a live stream, or query Workers Logs by `event` (and `code`, `userId`) in the Cloudflare dashboard.
- **503 contract**: when the Auth service is unreachable, a protected request answers 503 (`{"ok":false,"error":"unavailable"}` for `Accept: application/json`, a plain page otherwise) with `Retry-After: 30` and an `auth.unavailable` error line, while a missing session still redirects to `/auth/signin` silently.
- **Adding a Supabase call**: report its returned `error` through the helper (`reportMapped` in a route that maps the code to a redirect); never map `error.code` and drop it.
- **Sentry**: error-level reports (`reportError`, and `reportMapped` for `unknown` and `forbidden`) are also sent to Sentry through `@sentry/cloudflare`; info lines never are. `src/lib/sentry.ts` wraps each request from the middleware (the adapter's entry point stays), and `src/lib/sentry-options.ts` locks data collection down: no default integrations, no cookies, headers, bodies or query strings, only `user.id`, and a `beforeSend` scrubber. Events group by event name and SQLSTATE; the release is the Worker version id and the environment comes from `SENTRY_ENVIRONMENT` (`production` in `wrangler.jsonc`). With no `SENTRY_DSN` nothing is sent.
  - Create the Sentry project, then run `npx wrangler secret put SENTRY_DSN` yourself; never put the DSN in the repo, a build variable or a chat.
  - For a local preview, optionally put `SENTRY_DSN` and `SENTRY_ENVIRONMENT=local` in `.dev.vars` (dev vars win over the config var).
  - Do not run `npx astro add @sentry/astro` or create `sentry.server.config.js`: its server half loses events on Workers and its Vite plugin touches every build.
  - Set the key's rate limit and spike protection in Sentry (Dedupe is off, so a burst counts every event against the quota), and add an issue alert rule that mails you, filtered to `environment:production`.
  - The free quota is second-hand (about 5k errors a month); verify it on sentry.io.
  - Optional: the Sentry MCP for Claude Code, `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the auth flow (sign-up, sign-in, protected page, sign-out), the group flow and the task flow (create, rename, join, leave, check off, undo, delete) over HTTP. The group and task parts use three signed-up users (an owner and two members) with separate sessions: create, invite link, join, member view, rename, leave, remove member and delete group, including the rejected attempts (a member trying owner actions, malformed input, foreign-origin and GET requests). The check-off steps assert the page after each action (the row, the streak and the Leaderboard totals), the JSON period against an independent Warsaw-date oracle, and that leaving a task erases its history. The Google steps need no Google account (the provider is off on the local stack): they assert the start route (302 to Supabase's authorize URL with the PKCE challenge and the verifier cookie, 403 for a foreign origin, 404 for GET, `join_code` untouched), the outcomes of the return route (no parameters, a code without the verifier cookie, the real verifier cookie with an unknown code, cancelled, refused), the `/` redirect for an expired flow state, the Google messages and hints, and the button on both auth pages. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled and all migrations from `supabase/migrations/` applied (groups, tasks, task participation, check-offs).

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## Tests

Integration tests (Vitest, `tests/integration/`) exercise row-level security and creator-only permissions through real Supabase clients: two or more users in different groups, each denial paired with a positive control, and state re-read via the service-role client. Unit tests (`tests/unit/`) cover the pure rules: the streak and Leaderboard rules (`streak-rules`, `leaderboard-rules`, day and week boundaries in Europe/Warsaw, written from the PRD sentence), the check-off island's net-delta store and request protocol (`checkoff-sync`, `checkoff-client`) and the task rules.

Prerequisite: the local stack must be running (`npx supabase start`, see [Supabase Configuration](#supabase-configuration)). No `.env` is needed; the global setup reads the URL and keys from `supabase status -o env`.

```bash
npm test            # Vitest: integration and unit suites
npm run test:rls    # SQL scenarios (supabase/checks/rls-scenarios.sql) via docker exec
```

Safety guard: the suite refuses to run unless the Supabase URL host is `127.0.0.1` or `localhost`. Test users use a dedicated email prefix and are removed after the run (leftovers from crashed runs are swept on the next one).

## CI

GitHub Actions runs five jobs: `changes`, `ci`, `smoke` and `integration` on every push and PR to `master`, and `release` only after a push to `master`. On a pull request that changes only files under `context/` and `*.md` files, `ci`, `smoke` and `integration` are skipped at job level; a job skipped by `if:` satisfies the required check `integration`, so docs-only PRs can merge. Do not use `paths-ignore` on the workflow trigger: a workflow skipped by a path filter never reports that check and blocks the merge.

- **changes** — decides whether a PR touches anything besides `context/**` and `*.md` files (always yes on a push). If it cannot tell, the other jobs run.
- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step (the `release` build reads the same names from the `production` environment secrets, so set both).
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.
- **integration** — starts a local Supabase, then runs `npm test` and the SQL scenarios in `supabase/checks/rls-scenarios.sql`. No secrets required.
- **release** — runs only on pushes to `master`, after `ci`, `smoke` and `integration` pass and a reviewer approves the `production` environment: `supabase db push`, then `wrangler deploy`, then a check of the live URL, including the anonymous two-hop Google check (the start route redirects to Supabase, and Supabase's Google provider redirects to `accounts.google.com`; each run leaves one short-lived flow state row in Supabase). See [Deployment](#deployment).

## License

MIT
