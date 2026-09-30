# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

**Production:** <https://10x-astro-starter.mariusz-zlotucha.workers.dev> today. The product domain is **`streakboard.app`** (Cloudflare Registrar, DNS in Cloudflare): it already sends the auth e-mail, and the app itself will move to it in a separate change (custom domain binding, Supabase Site URL and Redirect URLs).

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

The database schema (groups, members, row-level security and helper functions) lives in `supabase/migrations/`. A fresh `npx supabase start` applies it; after pulling new migrations run `npx supabase db reset` (it wipes local data) to re-apply them all.

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

| Route                 | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                          |
| `/auth/signup`        | Email/password sign-up form                                          |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                  |
| `/dashboard`          | Protected group hub (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

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

| Route                    | Description                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `POST /api/tasks/create` | Member: create a task in their group (fields `title`, `recurrence`: once/daily/weekly) |
| `POST /api/tasks/update` | Creator: change the title of a task (fields `task_id`, `title`)                        |
| `POST /api/tasks/delete` | Creator: delete a task (field `task_id`)                                               |

`/api/groups/*` and `/api/tasks/*` follow the same `PROTECTED_ROUTES` rule as `/dashboard`: an unauthenticated request is redirected to `/auth/signin`. `/join/<code>` is the exception on purpose, so an invited visitor is sent through sign-in by the protected dashboard. Every group and task endpoint redirects back to `/dashboard`, adding `?error=<code>` on failure. Who may do what is decided by Postgres row-level security (see [RLS scenario checks](#rls-scenario-checks)); the app only forwards the signed-in user's session.

### RLS scenario checks

`supabase/checks/rls-scenarios.sql` asserts the row-level security rules of `groups`, `group_members` and `tasks` (visibility, joining via `join_group`, leaving, column privileges, and the `list_group_members` / `preview_group` helper functions) and exits non-zero on the first regression. Run it after every migration that touches group RLS, with the local stack running:

```bash
docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql
```

It only works against the local database (the container name comes from `project_id` in `supabase/config.toml`) and always ends with a rollback, so it leaves no data behind.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/) through a gated GitHub Actions release: a merge to `master` runs CI, and the `release` job in `.github/workflows/ci.yml` then applies pending Supabase migrations and deploys the Worker after a human approval. Workers Builds (Cloudflare's own build of `master`) is disabled, so this is the single deploy path.

### Release

1. Merge the PR to `master`. The `ci`, `smoke` and `integration` jobs run first.
2. When all three pass, the `release` job waits for approval in the GitHub `production` environment (Actions run page → **Review deployments**). **Before approving, check `supabase/migrations/` in the merge commit**: the approval comes before the job prints `supabase migration list`, so this is the moment to see which migrations will reach production.
3. After approval the job runs in this order: link the hosted Supabase project, `supabase migration list`, `npm run build` (so a build failure cannot leave the schema ahead), `supabase db push --yes` (schema before code), `npx wrangler deploy`, and finally checks the live URL (`/` must answer 200, `/dashboard` and `/auth/callback` must answer 302 to `/auth/signin`).
4. If a release fails, fix the cause and re-run the failed jobs from the Actions run page: `db push` is idempotent and skips migrations that are already applied.

The `release` job runs only on pushes to `master` (never on pull requests), and releases are serialised (`concurrency: release`), so two pushes cannot interleave migrations; if a newer push queues while an older release still waits for approval, the older run is superseded.

Required configuration of the GitHub `production` environment (Settings → Environments → `production`, with the owner as required reviewer; enter credentialed values in the GitHub UI, never in chat):

| Type     | Name                    | Purpose                                                |
| -------- | ----------------------- | ------------------------------------------------------ |
| Secret   | `SUPABASE_ACCESS_TOKEN` | Supabase CLI login for `link` and `db push`            |
| Secret   | `SUPABASE_DB_PASSWORD`  | Database password for `db push`                        |
| Secret   | `CLOUDFLARE_API_TOKEN`  | `wrangler deploy`                                      |
| Secret   | `CLOUDFLARE_ACCOUNT_ID` | `wrangler deploy`                                      |
| Secret   | `SUPABASE_URL`          | Build-time value of the `npm run build` step           |
| Secret   | `SUPABASE_KEY`          | Build-time value of the `npm run build` step           |
| Variable | `SUPABASE_PROJECT_REF`  | Hosted project ref used by `supabase link`             |
| Variable | `PRODUCTION_URL`        | Base URL for the post-deploy check (no trailing slash) |

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

First deploy on a fresh Cloudflare account also needs a one-time `workers.dev` subdomain registered for the account — if `wrangler deploy` fails with "could not automatically register ... as your workers.dev subdomain", enable it from the Worker's **Domains** tab in the Cloudflare dashboard (Workers & Pages → your Worker → Domains → enable the `workers.dev` route), then re-run the deploy.

### Rollback

```bash
npx wrangler deployments list   # see deployment history and version IDs
npx wrangler rollback [version-id]   # reverts to the given version, or the prior one if omitted
```

`wrangler rollback` prompts for a message and a confirmation; both fall back to sane defaults in a non-interactive shell. Rollback only affects the Worker's code/version — it does not touch Supabase (migrations are not rolled back, see the backward-compatibility rule above) or any bound resources.

### Auth e-mail sender domain

Confirmation e-mails are sent through Resend SMTP (configured in the Supabase Dashboard under Authentication → SMTP Settings, not in this repo) from the domain `streakboard.app` (Cloudflare Registrar, DNS in Cloudflare). Resend sends from the subdomain `mail.streakboard.app`, with the sender `noreply@mail.streakboard.app`. Until the custom domain binding is done the app itself stays on its `workers.dev` URL; the target production address is `https://streakboard.app`.

### Production auth settings

These settings live only in the Supabase Dashboard of the hosted project. `supabase/config.toml` configures just the local stack and `supabase db push` does not push it, so nothing in the repo sets them and they must be checked by hand after changing the production URL:

- **Site URL** (Authentication → URL Configuration): the production address, currently `https://10x-astro-starter.mariusz-zlotucha.workers.dev`. Without it confirmation links point to the default `http://localhost:3000`.
- **Redirect URLs** (same page): `https://<prod>/**` for the production address. Sign-up sends `emailRedirectTo` = `<origin>/auth/callback`; if it is missing from this allow-list Supabase silently falls back to the Site URL and the user is not signed in after confirming.
- **Custom SMTP** (Authentication → SMTP Settings): Resend credentials for the sender domain above. The built-in Supabase SMTP has a low rate limit (`over_email_send_rate_limit`).

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the auth flow (sign-up, sign-in, protected page, sign-out) and the group flow over HTTP. The group part uses three signed-up users (an owner and two members) with separate sessions: create, invite link, join, member view, rename, leave, remove member and delete group, including the rejected attempts (a member trying owner actions, malformed input, foreign-origin and GET requests). Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled and the group migrations from `supabase/migrations/` applied.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## Tests

Integration tests (Vitest, `tests/integration/`) exercise row-level security and creator-only permissions through real Supabase clients: two or more users in different groups, each denial paired with a positive control, and state re-read via the service-role client.

Prerequisite: the local stack must be running (`npx supabase start`, see [Supabase Configuration](#supabase-configuration)). No `.env` is needed; the global setup reads the URL and keys from `supabase status -o env`.

```bash
npm test            # Vitest integration suite
npm run test:rls    # SQL scenarios (supabase/checks/rls-scenarios.sql) via docker exec
```

Safety guard: the suite refuses to run unless the Supabase URL host is `127.0.0.1` or `localhost`. Test users use a dedicated email prefix and are removed after the run (leftovers from crashed runs are swept on the next one).

## CI

GitHub Actions runs four jobs: `ci`, `smoke` and `integration` on every push and PR to `master`, and `release` only after a push to `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step (the `release` build reads the same names from the `production` environment secrets, so set both).
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.
- **integration** — starts a local Supabase, then runs `npm test` and the SQL scenarios in `supabase/checks/rls-scenarios.sql`. No secrets required.
- **release** — runs only on pushes to `master`, after `ci`, `smoke` and `integration` pass and a reviewer approves the `production` environment: `supabase db push`, then `wrangler deploy`, then a check of the live URL. See [Deployment](#deployment).

## License

MIT
