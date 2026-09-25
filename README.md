# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

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

`/api/groups/*` follows the same `PROTECTED_ROUTES` rule as `/dashboard`: an unauthenticated request is redirected to `/auth/signin`. `/join/<code>` is the exception on purpose, so an invited visitor is sent through sign-in by the protected dashboard. Every group endpoint redirects back to `/dashboard`, adding `?error=<code>` on failure. Who may do what is decided by Postgres row-level security (see [RLS scenario checks](#rls-scenario-checks)); the app only forwards the signed-in user's session.

### RLS scenario checks

`supabase/checks/rls-scenarios.sql` asserts the row-level security rules of `groups` and `group_members` (visibility, joining via `join_group`, leaving, column privileges, and the `list_group_members` / `preview_group` helper functions) and exits non-zero on the first regression. Run it after every migration that touches group RLS, with the local stack running:

```bash
docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql
```

It only works against the local database (the container name comes from `project_id` in `supabase/config.toml`) and always ends with a rollback, so it leaves no data behind.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/). Deploys are a deliberate, manual action — there is no CI job that deploys on push/merge; `.github/workflows/ci.yml` only lints, type-checks, builds, and runs the smoke test.

1. Set `SUPABASE_URL` and `SUPABASE_KEY` as Worker secrets (one-time, or whenever they change):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

2. Build and deploy:

```bash
npm run build && npx wrangler deploy
```

First deploy on a fresh Cloudflare account also needs a one-time `workers.dev` subdomain registered for the account — if `wrangler deploy` fails with "could not automatically register ... as your workers.dev subdomain", enable it from the Worker's **Domains** tab in the Cloudflare dashboard (Workers & Pages → your Worker → Domains → enable the `workers.dev` route), then re-run the deploy.

### Rollback

```bash
npx wrangler deployments list   # see deployment history and version IDs
npx wrangler rollback [version-id]   # reverts to the given version, or the prior one if omitted
```

`wrangler rollback` prompts for a message and a confirmation; both fall back to sane defaults in a non-interactive shell. Rollback only affects the Worker's code/version — it does not touch Supabase (managed separately) or any bound resources.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the auth flow (sign-up, sign-in, protected page, sign-out) and the group flow over HTTP. The group part uses three signed-up users (an owner and two members) with separate sessions: create, invite link, join, member view, rename, leave, remove member and delete group, including the rejected attempts (a member trying owner actions, malformed input, foreign-origin and GET requests). Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled and the group migrations from `supabase/migrations/` applied.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## CI

GitHub Actions runs two jobs on every push and PR to `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.

## License

MIT
