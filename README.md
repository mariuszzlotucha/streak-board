# StreakBoard

StreakBoard is a habit tracker for a group of friends: everyone tracks the same tasks, marks them done every day or week, and sees each other's streaks on one shared leaderboard.

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
git clone https://github.com/mariuszzlotucha/streak-board.git
cd streak-board
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
- `npm test` - Run both Vitest projects, unit and integration; needs the local Supabase stack
- `npm run test:unit` - Run the Vitest unit project alone (`tests/unit/`); needs no stack
- `npm run test:mutation` - Run Stryker on the unit project (`-- --mutate <path>` narrows it to one module or line range; see [Tests](#tests))
- `npm run test:rls` - Run the SQL RLS scenario checks against the local database
- `npm run guard:migrations` - Check the migrations of this branch against `origin/master` (`-- --base <ref>` for another base): immutability of merged files, the `-- compat:` marker, ordering (see [Deployment](#deployment))
- `npm run types:check` - Diff `src/types.ts` against a fresh generation from the local stack (non-zero with the diff when it is stale)
- `npm run deps` - Check the import rules with dependency-cruiser (`.dependency-cruiser.cjs`): no circular imports, `src/lib` must not import components or pages, `src/components` must not import pages; CI does not run it
- `npm run review` - Run the AI code reviewer on a diff read from stdin (`git diff | npm run --silent review`; see `packages/code-reviewer/README.md`)

## Project Structure

```text
.
├── .github/              # CI, release and review workflows
├── context/              # Foundation docs, change folders and archive
├── packages/
│   └── code-reviewer/    # AI code reviewer (npm run review)
├── public/               # Public assets
├── scripts/              # Helper scripts: smoke, token contrast, migrations, e2e setup
├── src/
│   ├── components/       # UI components (Astro & React)
│   ├── layouts/          # Astro layouts
│   ├── lib/              # Services and helpers
│   ├── pages/            # Astro pages
│   │   └── api/          # API endpoints
│   └── styles/           # Global styles and design tokens (global.css)
├── supabase/             # Migrations, local config and RLS checks
├── tests/                # Unit, integration and e2e (Playwright) tests
└── wrangler.jsonc        # Cloudflare Workers config
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

To try the evening reminders locally with `npx wrangler dev --test-scheduled`, add three more lines to `.dev.vars` (generated as in [Reminder secrets](#reminder-secrets); `CONTACT_EMAIL` must be set too) and store the secret's hash in the local database with the SQL statement given there (Studio → SQL Editor):

```
VAPID_PUBLIC_KEY=<base64url public key>
VAPID_PRIVATE_KEY=<base64url private key>
REMINDER_SECRET=<random secret, at least 32 characters>
```

Then trigger one run by hand while `wrangler dev` is up (crons `0 18 * * *` and `0 19 * * *` in `wrangler.jsonc`; the run sends only in the hour that is 20:00 in Warsaw, so pick the one that matches the current offset):

```bash
curl "http://localhost:8787/__scheduled?cron=0+19+*+*+*"
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

### Public pages

| Route      | Description                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`        | Landing page (`src/pages/index.astro`, redirects in `src/lib/landing.ts`); a signed-in visitor is redirected to `/dashboard`, and an anonymous visitor with a flow-state `error_code` (`bad_oauth_state`, `bad_oauth_callback`, `flow_state_already_used`) to `/auth/signin?error=oauth_failed`; `?account=deleted` (where account deletion ends) shows the line "Your account has been deleted." |
| `/privacy` | The privacy policy (`src/pages/privacy.astro`, sections in `src/components/privacy/`), the same for every visitor                                                                                                                                                                                                                                                                                 |

Both pages, and the auth pages below, share `src/layouts/PublicLayout.astro`: a header with the StreakBoard name and a footer that names the operator and links the policy and the contact address. The dashboard shows the same footer.

Any other address renders the 404 page `src/pages/404.astro` ("Page not found", status 404). `POST /api/client-errors` is public too: it takes a fixed service-worker error code as a `text/plain` body (what `navigator.sendBeacon` sends), reports it as `client.sw.<code>` and answers 204; another content type gets 415, an unknown code or an empty body 400, and a body over 256 bytes 413 (refused on its declared length before it is read, or once the read passes 256 bytes).

### Installable app (PWA)

The app can be installed from Chrome and Edge and added to the iOS home screen. The pieces are static files in `public/`: `manifest.webmanifest` (start URL `/dashboard`, standalone), the icons in `public/icons/` and `sw.js`; `public/_headers` keeps `sw.js` and the manifest out of HTTP caches and serves the manifest as `application/manifest+json`. `src/layouts/Layout.astro` links them and loads `src/lib/pwa/register.ts`, which registers the worker in a production build only and shows `UpdateNotice` ("A new version of StreakBoard is available.") when a release takes over an open page.

The app promotes its own installation: the island `src/components/account/InstallPrompt.tsx` shows a dismissable "Install StreakBoard" card under the dashboard heading and an always-present block in the Settings Reminders card, with the offer that `classifyInstall` in `src/lib/pwa/install.ts` picks for the browser (`ios-safari` and `ios-other`: Share → Add to Home Screen; `prompt`: an "Install app" button when Chromium handed over `beforeinstallprompt`, which the layout script captures on every page; `chromium-menu`: the browser menu's Install, for Chrome and Edge and for a browser whose event was already used on the page; `macos-safari`: File → Add to Dock; `in-app`: open the page in Safari or Chrome, for a listed in-app token or an iOS WebView without `Safari/`; `none`: no card, and a "no install steps for this browser" line in Settings; `installed`: nothing). "Not now" is stored on the device in local storage under `streakboard.install-dismissed` (named in the privacy policy); the kitchen sink pins the offers in the `install-*` and `settings-install-*` states. The capture calls `preventDefault()` on every page, so Chromium's own mini-infobar does not show anywhere, the public pages included; without a `fetch` handler in `sw.js` Chrome shows no automatic prompt anyway (S-17), so the island's button or menu instruction is the only install hint.

- **`sw.js` must not cache anything** (PRD Non-Goals: no offline mode, no page or data cache). It has no `fetch` handler, takes over at once (`skipWaiting`, `clients.claim`) and deletes any cache on activate; smoke fails if it ever contains `respondWith` or `caches.put`. S-16 adds `push` there.
- **Theme colour**: `#007a55`, the light `--primary` token (`oklch(0.508 0.118 165.612)` in `src/styles/global.css`). It is repeated in `THEME_COLOR` (`src/lib/site.ts`), `public/manifest.webmanifest`, `public/favicon.svg` and `scripts/pwa-icons.mjs`; change them together.
- **Icons**: regenerate them from `public/favicon.svg` with `node scripts/pwa-icons.mjs` (sharp comes with Astro; if it is missing, `npx --yes -p sharp node scripts/pwa-icons.mjs`) and commit `public/icons/`.

### Auth routes

| Route                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/signin`               | Email/password sign-in form, with "Continue with Google" above it                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/auth/signup`               | Email/password sign-up form, with "Continue with Google" above it                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/auth/confirm-email`        | Post-signup "check your inbox" page                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `POST /api/auth/google`      | Starts the Google sign-in (the button's form): redirects to Supabase's authorize URL and sets the PKCE code verifier cookie on the same response; `GET` answers 404                                                                                                                                                                                                                                                                                                                                       |
| `/auth/google/callback`      | Return from Google (`GET`): exchanges the `code` and continues to `/dashboard`; cancellation, a stale attempt and a failure end on `/auth/signin?error=<code>` with a fixed message                                                                                                                                                                                                                                                                                                                       |
| `/dashboard`                 | Protected group hub (redirects to `/auth/signin` if unauthenticated); answers 503 with an error page when its data cannot be loaded; after an ownership transfer the new owner sees a one-time notice with "Got it"                                                                                                                                                                                                                                                                                       |
| `/settings`                  | Protected group settings: the owner renames the group, hands it over to another member ("Transfer ownership") or deletes it, a member leaves it; the Account card shows the user's nickname and own e-mail address (the only page that shows it) with a link to change the nickname and "Delete account" (its dialog says what goes and what stays, and an owner with other members chooses a successor in it); redirects to `/auth/signin` if unauthenticated, answers 503 when the group cannot be read |
| `/account/nickname`          | Protected nickname page: the first choice every account makes before any other protected page (the field starts with the name from Google when the account has one), and the change reached from `/settings`; no Main nav                                                                                                                                                                                                                                                                                 |
| `POST /api/account/nickname` | Signed-in user: set or change the nickname (field `nickname`, 2 to 24 characters with at least one visible one and no control or format character, unique regardless of case); the first save ends on `/dashboard`, a change on `/settings`; a rejected save ends on `/account/nickname?error=<code>`; `GET` answers 404                                                                                                                                                                                  |
| `POST /api/account/delete`   | Signed-in user: delete the own account through `delete_own_account` (field `successor_id`, required only for a group owner with other members); signs out, clears `join_code` and ends on `/?account=deleted`; a refusal ends on `/dashboard?error=<code>` (`invalid_successor` for a missing or invalid successor); `GET` answers 404                                                                                                                                                                    |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

The Google provider is off on the local stack (`supabase/config.toml` has no `[auth.external.google]`, and no Google credentials are used locally), so locally the "Continue with Google" button ends on GoTrue's JSON error from the local Supabase. That is expected; the start and return routes are covered by the Vitest tests and the smoke script instead, and the whole flow is checked on production.

Signing out of StreakBoard does not sign out of Google, and the start route sends no `prompt=select_account`. On a shared device with one Google account and earlier consent, "Continue with Google" can sign the next person in as the previous one without asking, so sign out of Google there as well.

### Group routes

| Route                                   | Description                                                                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/join/<code>`                          | Public invite link: remembers the code in a cookie for 7 days, redirects to `/dashboard`, which joins the group at once after sign-in (sign-up also stores the code with the account, so a confirmation opened in another browser keeps the invite) |
| `POST /api/groups/create`               | Create a group (field `name`, unique across the app regardless of case); the caller becomes its owner                                                                                                                                               |
| `POST /api/groups/join`                 | Join with an invite code or a pasted invite link (field `code`)                                                                                                                                                                                     |
| `POST /api/groups/rename`               | Owner: rename the group (field `name`, unique across the app regardless of case)                                                                                                                                                                    |
| `POST /api/groups/leave`                | Member: leave the group (the owner leaves only after handing it over, or by deleting it)                                                                                                                                                            |
| `POST /api/groups/remove-member`        | Owner: remove another member (field `user_id`)                                                                                                                                                                                                      |
| `POST /api/groups/delete`               | Owner: delete the group; every membership goes with it                                                                                                                                                                                              |
| `POST /api/groups/transfer`             | Owner: hand the group over to another member (field `new_owner_id`); the former owner stays a member, the new one sees a one-time notice; a missing or invalid member ends on `?error=invalid_successor`                                            |
| `POST /api/groups/dismiss-owner-notice` | New owner: dismiss the ownership notice ("Got it"); always ends on `/dashboard`                                                                                                                                                                     |

### Task routes

| Route                      | Description                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/tasks/create`   | Member: create a task in their group (fields `title`, unique in the group regardless of case, `recurrence`: once/daily/weekly) |
| `POST /api/tasks/update`   | Creator: change the title of a task (fields `task_id`, `title`, unique in the group regardless of case)                        |
| `POST /api/tasks/delete`   | Creator: delete a task (field `task_id`)                                                                                       |
| `POST /api/tasks/join`     | Member: join a task of their group (field `task_id`); joining twice does nothing                                               |
| `POST /api/tasks/leave`    | Participant: leave a task they joined (field `task_id`); leaving twice does nothing                                            |
| `POST /api/tasks/checkoff` | Participant: tick the current day or week of a task (field `task_id`); ticking twice does nothing                              |
| `POST /api/tasks/uncheck`  | Participant: undo the tick of the current period (field `task_id`); undoing twice does nothing                                 |

`/settings`, `/account/*`, `/api/groups/*`, `/api/tasks/*` and `/api/account/*` follow the same `PROTECTED_ROUTES` rule as `/dashboard`: an unauthenticated request is redirected to `/auth/signin`. On every protected path the middleware also reads the signed-in user's own nickname (`public.nicknames`) into `locals.nickname`: a user without one is redirected to `/account/nickname` from every protected path except that page and its route `POST /api/account/nickname`, and a failed read answers 503 like an Auth outage. `/join/<code>` is the exception on purpose, so an invited visitor is sent through sign-in by the protected dashboard. Every group and task endpoint redirects back to `/dashboard`, adding `?error=<code>` on failure; the two check-off routes also answer JSON (`{ ok, period }` or `{ ok: false, error }`) to a request that sends `Accept: application/json`, which is what the dashboard's check-off button uses. When the Auth service is unreachable, a protected request answers 503 (JSON `{ ok: false, error: "unavailable" }` for `Accept: application/json`, a plain page otherwise, both with `Retry-After`) instead of the redirect; a request with no session still redirects to `/auth/signin`. With the Auth service up, `/dashboard` itself answers 503 with an error page (a heading, the message and "Try again") when its data cannot be loaded; a failed read of tasks, participants or check-offs only replaces that part of the page with a notice and keeps the 200. `/settings` answers 503 with its own error page the same way when the group cannot be read. Who may do what is decided by Postgres row-level security (see [RLS scenario checks](#rls-scenario-checks)); the app only forwards the signed-in user's session.

### RLS scenario checks

`supabase/checks/rls-scenarios.sql` asserts the row-level security rules of `groups`, `group_members`, `tasks`, `task_participants`, `task_checkoffs` and `nicknames` (visibility, joining via `join_group`, leaving, column privileges, the `task_checkoff_periods` view's group scoping, the `list_group_members` / `preview_group` helper functions, `set_nickname`, the only write path to `nicknames`: a user reads only their own row, nicknames are unique regardless of letter case, 2 to 24 characters, trimmed and made of visible characters (no control or format characters), and go with the account, and the S-15 functions: `transfer_group_ownership` hands the group only from its owner to another member and sets the notice flag, which only the owner clears; `delete_account` hands over the group and the tasks, keeps everyone else's progress, removes the person's data and security log entries and changes nothing on a refusal; neither inner layer is callable by clients, and deleting a task creator directly fails on `tasks.created_by`'s restrict) and exits non-zero on the first regression. `list_group_members` returns each member's nickname, never an e-mail address: S-14's second release dropped its `email` column, and the check asserts that the column is gone. It also pins the table-level privileges in both directions (read from `information_schema.role_table_grants`, so a missing privilege and an extra one both fail; column-level grants are outside this check):

| Object                                                                    | `authenticated`  | `anon` |
| ------------------------------------------------------------------------- | ---------------- | ------ |
| `groups`, `group_members`, `tasks`, `task_participants`, `task_checkoffs` | `DELETE, SELECT` | none   |
| `task_checkoff_periods` (view)                                            | `SELECT`         | none   |
| `nicknames` (written only through `set_nickname`)                         | `SELECT`         | none   |

Run it after every migration that touches group RLS or privileges, with the local stack running:

```bash
docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql
```

It only works against the local database (the container name comes from `project_id` in `supabase/config.toml`) and always ends with a rollback, so it leaves no data behind.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/) through a gated GitHub Actions release: a merge to `master` runs CI, and the `release` job in `.github/workflows/ci.yml` then applies pending Supabase migrations and deploys the Worker after a human approval. Workers Builds (Cloudflare's own build of `master`) is disabled, so this is the single deploy path.

### Release

1. Merge the PR to `master`. The `ci`, `smoke`, `e2e` and `integration` jobs run first.
2. When all four pass, the `release` job waits for approval in the GitHub `production` environment (Actions run page → **Review deployments**). **Before approving, check `supabase/migrations/` in the merge commit**: the approval comes before the job prints `supabase migration list`, so this is the moment to see which migrations will reach production.
3. After approval the job runs in this order: link the hosted Supabase project, `supabase migration list`, `npm run build` (so a build failure cannot leave the schema ahead), `supabase db push --yes` (schema before code), `npx wrangler deploy`, then moves the `production` tag to the deployed commit (`git tag -f production` and a force push of `refs/tags/production`; the `compat` job builds whatever the tag points at), and finally checks the live URL (`/` must answer 200; `/privacy` must answer 200 with a plain `mailto:` contact link (not rewritten by Cloudflare's e-mail obfuscation) and the body of `/` must link it with `href="/privacy"`, all retried together up to 10 times, 3 s apart, because only the new Worker version passes them; `/dashboard` and `/auth/callback` must answer 302 to `/auth/signin`, and the Google flow must answer in two hops: `POST /api/auth/google` 302 to Supabase's `/auth/v1/authorize?provider=google`, and that URL 302 to `https://accounts.google.com/`; each hop is tried up to 3 times).
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

The Worker's runtime secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `CONTACT_EMAIL`) are set once on the Worker itself (or whenever they change):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret put CONTACT_EMAIL
```

`CONTACT_EMAIL` is the controller's contact address that the privacy policy and the footer publish. It is not secret, but it is read at runtime so the address stays out of the repo and the bundle; locally put it in `.dev.vars` (and `.env`). Unset, the footer drops its Contact link and the policy shows "[contact address not configured]", which smoke and the release live check report as a missing `mailto:` link.

**Migrations must be backward compatible.** The schema ships before the code and a code rollback does not roll the schema back, so every migration has to work with the code version that is currently deployed (add columns and tables first, remove or rename in a later release). There are no automated down-migrations. The `compat` job rehearses this on every PR that touches `supabase/migrations/`: it builds the commit the `production` tag points at (the deployed code) and runs that commit's own smoke against a local stack carrying the PR's migrations; a red `compat` means the migration has to be split (see [CI](#ci)). The `integration` job guards the mechanics on every PR with `npm run guard:migrations` (`scripts/migration-guard.mjs`):

- **Merged migrations are immutable.** A migration that is on `master` may change only in comments and blank lines; it is never deleted or renamed (the hosted history records the applied version, and a missing file breaks `db push`). Undo its effect in a new migration instead. When a merged file really has to change, run `node scripts/migration-guard.mjs --entry supabase/migrations/<file>`, append the printed line to `supabase/checks/migration-edit-allowlist.txt` and replace `<reason>` with at least 20 characters. The allowlist is append-only, an entry counts only in the PR that adds it and only for the exact content it names (another edit needs another entry), an entry that matches no edit fails, a line that repeats an earlier one fails too (one line authorises one edit), and every used entry shows as a warning on the PR.
- **A destructive migration carries `-- compat:`.** A new migration that drops anything, alters a policy, renames something, replaces (`create or replace`) a function or view an earlier migration created, or revokes a privilege on a table, view or function an earlier migration created needs one line `-- compat: <how the deployed code keeps working>`. The check is a heuristic that makes the author think; it proves nothing about compatibility.
- **A new migration sorts after every merged one.** Otherwise `supabase db push` is expected to refuse the older timestamp; rename the file (it is new in the PR, so the rename is free). The guard sees the base at the time `integration` runs and the ruleset does not require branches to be up to date, so update the branch (which re-runs `integration`) before merging a migration PR when another migration merged in the meantime. A merged out-of-order file can be neither renamed nor deleted past the guard; the owner applies it by hand with `supabase db push --include-all` (credentialed, never through the chat).

The same job checks that `src/types.ts` equals a fresh generation (`npm run types:check`); after a migration regenerate it with `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`.

### Reminder secrets

The evening reminder cron (`src/worker.ts` → `src/lib/reminders/run.ts`) sends Web Push with a VAPID key pair and calls the reminder database functions with a shared secret. It reads all three from the Worker's runtime secrets; while any of them (or `SUPABASE_URL`, `SUPABASE_KEY`, `CONTACT_EMAIL`) is missing, each run logs `reminders.config.missing` and sends nothing. Set them once:

1. Generate the VAPID key pair; the first line printed is `VAPID_PUBLIC_KEY` (the 65-byte uncompressed point), the second `VAPID_PRIVATE_KEY` (the 32-byte scalar), both base64url:

```bash
node -e "const k=require('crypto').generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});const b=(s)=>Buffer.from(s,'base64url');console.log(Buffer.concat([Buffer.from([4]),b(k.x),b(k.y)]).toString('base64url'));console.log(k.d)"
```

2. Generate the shared secret: `openssl rand -base64 32`.
3. Store the three on the Worker:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put REMINDER_SECRET
```

4. Store the secret's hash in the production database (Supabase dashboard → SQL Editor), after the migration that creates `reminder_secret` has been applied; until then every run logs `reminders.due.failed` and sends nothing:

```sql
insert into public.reminder_secret (hash) values (sha256(convert_to('<secret>', 'UTF8'))) on conflict (id) do update set hash = excluded.hash;
```

Changing `VAPID_PUBLIC_KEY` invalidates every existing subscription; rotating `REMINDER_SECRET` needs steps 3 and 4 together.

**CPU ceiling.** Each push costs CPU for its own encryption (one ECDH key pair, HKDF and AES-GCM) and the VAPID key import, on top of a fixed cost per run (Worker start, Sentry, the Supabase client, the `due_reminders` call). Measured on the first production run (2026-10-17, one subscription, one push, all in the cron invocation): 11 ms CPU, against the Workers Free plan's 10 ms per invocation. So the cron run no longer sends: it hands each push over RPC to the Worker's own `ReminderSender` entrypoint (`src/worker.ts`, service binding `REMINDER_SENDER` in `wrangler.jsonc`), and each call is a separate invocation with its own CPU limit. The owner chose this over the Paid plan (2026-10-17). A sender invocation cut off over its limit reaches the run as a thrown call and is counted as `failed` (`reminders.send.failed`, status null). Check the CPU of the cron and sender invocations with `npx wrangler tail` after the first evening run with two subscriptions. A sender reports to the logs only, not to Sentry (it runs outside the scheduled wrapper).

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

After a rollback, move the `production` tag by hand to the commit that is live again, so the `compat` job keeps testing the deployed code (only the `release` job moves it automatically): find the commit of the rolled-back version (the `release` run that deployed it, or `npx wrangler deployments list`), then `git tag -f production <sha> && git push --force origin refs/tags/production`. The `release` job moves the tag with the run's `GITHUB_TOKEN`, so a tag protection rule or a ruleset covering `refs/tags/production` would turn that step red after a successful deploy (the live check still runs); there is none today, and adding one means moving the tag by hand after every release.

### Auth e-mail sender domain

Confirmation e-mails are sent through Resend SMTP (configured in the Supabase Dashboard under Authentication → SMTP Settings, not in this repo) from the domain `streakboard.app` (Cloudflare Registrar, DNS in Cloudflare). Resend sends from the subdomain `mail.streakboard.app`, with the sender `noreply@mail.streakboard.app`. The app itself is served on `https://streakboard.app`.

### Production auth settings

These settings live only in the Supabase Dashboard of the hosted project. `supabase/config.toml` configures just the local stack and `supabase db push` does not push it, so nothing in the repo sets them and they must be checked by hand after changing the production URL:

- **Site URL** (Authentication → URL Configuration): the production address, `https://streakboard.app`. Without it confirmation links point to the default `http://localhost:3000`.
- **Redirect URLs** (same page): `https://streakboard.app/**`. Sign-up sends `emailRedirectTo` = `<origin>/auth/callback` and the Google start route sends `redirectTo` = `<origin>/auth/google/callback` (both covered by the wildcard); if either is missing from this allow-list Supabase silently falls back to the Site URL and the user is not signed in.
- **Custom SMTP** (Authentication → SMTP Settings): Resend credentials for the sender domain above. The built-in Supabase SMTP has a low rate limit (`over_email_send_rate_limit`).
- **Google provider** (Authentication → Sign In / Providers → Google): enabled with the Client ID and Client secret of a Web application client created in the Google Cloud Console (Google Auth Platform, publishing status **Testing**). The Client ID and secret are entered only in this Dashboard form, never in the repo, CI or chat. The client's authorized redirect URI is Supabase's own callback, `https://<project-ref>.supabase.co/auth/v1/callback`; the wildcard Redirect URL above covers the app's `/auth/google/callback`. In Testing every person who should sign in must be listed as a test user in the Google console (limit 100). Publishing the app (Testing to In production) is gated on a public home page and privacy policy: Google Auth Platform → Branding takes the app home page `https://streakboard.app/`, the privacy policy link `https://streakboard.app/privacy` and the authorized domain `streakboard.app`. While the app is in Testing, Branding saves them as a draft that users do not see. A wrong, rotated or deleted client secret reaches the user as "Something went wrong" and shows only as an `auth.google.callback.returned` info line with `providerError=server_error` in Workers Logs, not in Sentry. The duplicate-e-mail hint on the sign-up page ("use Continue with Google if you signed up with it") shows only when GoTrue answers `user_already_exists`, which it does with auto-confirm on (the local stack). With "Confirm email" on, as on the hosted project, GoTrue is expected to answer an existing address with an obfuscated success and no e-mail (by the source reading in the `google-login` research, not tested live), so a Google-only user who signs up with a password lands on `/auth/confirm-email` without the hint; that obfuscated sign-up success is a known gap of the e-mail path.

#### Handling a data deletion request

Users delete their own account on `/settings` ("Delete account"). The privacy policy keeps a request by e-mail, sent from the account's own address, for someone who cannot sign in any more, and promises deletion within one month. The owner runs it in the SQL Editor of the hosted project (find the user id under Authentication → Users by the requester's e-mail address):

1. If the person owns a group with other members, choose the successor among them (ask the person, or take the member who joined first): `select user_id, joined_at from public.group_members where group_id = (select id from public.groups where owner_id = '<user id>') and user_id <> '<user id>' order by joined_at;`
2. Run `select public.delete_account('<user id>', '<successor id or null>');` (write a bare `null` without quotes when there is no successor). It does in one transaction what the settings button does: deletes the security log entries that name the person and their unfinished sign-in flow states, hands the group to the successor (or deletes it when the person is its only member), passes the tasks the person created to the owner of each task's group, then deletes the user, with their nickname, membership, own participation and check-offs, sessions and identities. An owner with other members and no valid successor is refused (`P0003`), an unknown id too (`P0002`), and a refusal changes nothing.
3. Reply within one month of the request.

Do not delete the user under Authentication → Users (or with `auth.admin.deleteUser`): for a task creator or a group owner it fails with "Database error deleting user", because `tasks.created_by` and `groups.owner_id` are `on delete restrict`, and for anyone else it leaves their security log entries behind.

### Security headers and CSP

Every response the Worker answers carries `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`, set by `withSecurityHeaders` (`SECURITY_HEADERS` in `src/lib/security-headers.ts`) in `src/middleware.ts`. Static files never reach the middleware, so `public/_headers` repeats the same values; change both together (`tests/unit/security-headers.test.ts` compares them).

Rendered pages also get a Content-Security-Policy computed by Astro from `security.csp` in `astro.config.mjs` (Astro hashes its own scripts and styles; the `is:inline` script of `src/components/site/ClearErrorParam.astro` is hashed by hand, and `tests/unit/csp-hash.test.ts` fails when the two drift). `src/layouts/Layout.astro` adds the Supabase origin to `form-action`. The policy is sent as `Content-Security-Policy-Report-Only`: `toReportOnly` in the middleware renames the header while `CSP_MODE` is `"report-only"`. To enforce it, set `CSP_MODE = "enforce"` after a week without unexpected violations. API routes and redirects carry no CSP. CSP is off in `astro dev`; check it on `npm run build && npm run preview` (`tests/e2e/csp-report-only.spec.ts` does).

Browsers send violations to `POST /api/csp-report` (public, `application/csp-report` or `application/reports+json`, at most 8 KiB). It logs one `csp.violation` info line per violation in Workers Logs, with only the directive, the blocked origin (or `inline`, `eval`, `data`) and the document path; full URLs, script samples and request headers are not logged, and nothing goes to Sentry.

`/.well-known/security.txt` is served by `src/pages/.well-known/security.txt.ts`: its `Contact` is `mailto:` the `CONTACT_EMAIL` secret, and its `Expires` is derived from the build date, so every release renews it; without `CONTACT_EMAIL` it answers 404.

Operator settings outside the repo (Cloudflare dashboard and DNS), checked by hand:

- **HSTS**: SSL/TLS → Edge Certificates → HTTP Strict Transport Security, max-age 6 months, include subdomains, no preload. Check: `curl -sI https://streakboard.app/` shows `strict-transport-security`.
- **SPF** for the apex, which sends no mail: DNS TXT `streakboard.app` = `v=spf1 -all` (next to the Google verification record; `dig +short TXT streakboard.app`). Resend's own records for `mail.streakboard.app` stay as they are; a received confirmation e-mail ("Show original") shows `DKIM: PASS with domain mail.streakboard.app`.
- **DMARC**, staged: DNS TXT `_dmarc.streakboard.app` = `v=DMARC1; p=none; rua=mailto:<operator address>`; after a week of reports with Resend passing, change it to `p=reject`.
- **WAF**: a custom rule blocking `starts_with(http.request.uri.path, "/wp-") or ends_with(http.request.uri.path, ".php")`. Check: `curl -s -o /dev/null -w "%{http_code}" https://streakboard.app/wp-admin/install.php` returns 403.

### Custom domain

The apex `streakboard.app` is attached to the Worker in the Cloudflare dashboard (Worker → Settings → Domains & Routes) and deliberately not declared in `wrangler.jsonc`. With Wrangler 4.131.x a deploy touches custom domains only when the config declares a `custom_domain` route, so a dashboard-attached domain survives every release. Declaring any such route makes Wrangler send the declared set (with `override_scope`, and in CI forcing the DNS and origin overrides), so a domain attached only in the dashboard may be replaced, and `streakboard.app` would then have to be listed in the file too. Do not add `routes` to `wrangler.jsonc` or `--strict` to the release step to silence a "local configuration differs from the remote configuration" warning.

`workers.dev` and Preview URLs are off through `workers_dev: false` and `preview_urls: false` in `wrangler.jsonc` (without them a deploy would turn `workers.dev` back on). The deploy log therefore says "No targets deployed for 10x-astro-starter": expected, not a failure. The old `https://10x-astro-starter.mariusz-zlotucha.workers.dev` address stops serving the app with the first deploy that carries these keys. To bring `workers.dev` back for good, set `workers_dev: true` in `wrangler.jsonc`; switching it on in the dashboard alone is reverted by the next deploy.

The site is HTTPS-only. "Always Use HTTPS" is on for `streakboard.app` (Cloudflare dashboard → SSL/TLS → Edge Certificates, switched on by the owner in S-09), so every `http://` request is redirected to `https://`. Production builds also set `Secure` on the Supabase session and verifier cookies (`cookieOptions` in `src/lib/supabase.ts`), so a local `npm run preview`, which serves plain `http://localhost`, keeps a session only in browsers that treat `http://localhost` as secure (Chromium, Firefox), not in Safari. `npm run dev` is unaffected.

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

- **Event names** follow `<area>.<action>.<outcome>`, for example `groups.join.failed`, `tasks.create.exception`, `checkoff.forbidden`, `auth.unavailable`. `.failed` is a returned Supabase error, `.exception` a thrown one. The dashboard loader's events (`dashboard.tasks.failed`, `dashboard.participants.failed`, `dashboard.checkoffs.failed`, `dashboard.leaderboard.failed`, `dashboard.load.failed`) are all `.failed` because the data helpers in `src/lib/groups.ts` and `src/lib/tasks.ts` rethrow a returned error, so the loader cannot tell it from a thrown one.
- **Levels**: error for unexpected outcomes (unmapped SQLSTATEs, 5xx, network failures, `42501`), info for stale or expected ones (a task that is gone, an invalid id, not enrolled, an undo that removes nothing, a rate limit).
- **Fields**: `event`, `route`, `userId`, `ray`, `status`, the SQLSTATE `code` and a scrubbed `message` (plus `details`, `hint` and a trimmed `stack` when present). Messages pass through `src/lib/redact.ts`, which masks e-mail addresses, the values in `Key (column)=(value)` fragments and `/join/<code>` URLs.
- **Never logged**: e-mail addresses, cookies, request bodies and the invite code. The join route logs `codeLength` instead of the code.
- **Reading logs**: `npx wrangler tail --format json` for a live stream, or query Workers Logs by `event` (and `code`, `userId`) in the Cloudflare dashboard.
- **503 contract**: when the Auth service is unreachable, a protected request answers 503 (`{"ok":false,"error":"unavailable"}` for `Accept: application/json`, a plain page otherwise) with `Retry-After: 30` and an `auth.unavailable` error line, while a missing session still redirects to `/auth/signin` silently.
- **Adding a Supabase call**: report its returned `error` through the helper (`reportMapped` in a route that maps the code to a redirect); never map `error.code` and drop it. A bare `console` call in `src` now fails lint (`no-console` is an error; `src/lib/log.ts` is the only exception).
- **Sentry**: error-level reports (`reportError`, and `reportMapped` for `unknown` and `forbidden`) are also sent to Sentry through `@sentry/cloudflare`; info lines never are. `src/lib/sentry.ts` wraps each request from the middleware (the adapter's entry point stays), and `src/lib/sentry-options.ts` locks data collection down: no default integrations, no cookies, headers, bodies or query strings, only `user.id`, and a `beforeSend` scrubber. Events group by event name and SQLSTATE; the release is the Worker version id and the environment comes from `SENTRY_ENVIRONMENT` (`production` in `wrangler.jsonc`). With no `SENTRY_DSN` nothing is sent.
  - Create the Sentry project, then run `npx wrangler secret put SENTRY_DSN` yourself; never put the DSN in the repo, a build variable or a chat.
  - For a local preview, optionally put `SENTRY_DSN` and `SENTRY_ENVIRONMENT=local` in `.dev.vars` (dev vars win over the config var).
  - Do not run `npx astro add @sentry/astro` or create `sentry.server.config.js`: its server half loses events on Workers and its Vite plugin touches every build.
  - Set the key's rate limit and spike protection in Sentry (Dedupe is off, so a burst counts every event against the quota), and add an issue alert rule that mails you, filtered to `environment:production`.
  - The free quota is second-hand (about 5k errors a month); verify it on sentry.io.
  - Known risk: `POST /api/client-errors` is public and has no rate limit (S-17 left one out on purpose). Astro's origin check stops cross-site browser requests, but a script without an `Origin` header can send valid codes, and each one is a Sentry event. They group into one issue per code (`client.sw.<code>`, the fingerprint is `[event, code]`), so they do not bury other errors, but they do use the quota. If they ever do, add a Cloudflare rate-limit rule for that path or drop the report to info level.
  - Optional: the Sentry MCP for Claude Code, `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the auth flow (sign-up, sign-in, protected page, sign-out), the group flow and the task flow (create, rename, join, leave, check off, undo, delete) over HTTP. The group and task parts use three signed-up users (an owner and two members) with separate sessions: create, invite link, join, member view, rename, leave, remove member and delete group, including the rejected attempts (a member trying owner actions, malformed input, a group name or task title already taken in another case, foreign-origin and GET requests). The add-task form must post a native `recurrence` select with `once` preselected. The dashboard steps assert the signed-in shell (the brand link, `<main>`, exactly one "Sign out" in a form posting to the sign-out route, "Signed in as" with the nickname), the `<h1>` of each state (the no-group heading with "Join with code" and no "Join group"), the invite stored at sign-up joining user B on the first dashboard visit (signed in from a browser without the invite cookie, with no "Join group" click), the sole owner's invite sentence and the invite link inside the Members card, the in-group card order (Tasks, the Leaderboard, then Members) under the "Your group" eyebrow, the Main nav ("Dashboard" and "Settings", with `aria-current="page"` on the current page), that no group-settings control is left on the dashboard, and that `?error=` puts the alert first in `<main>` together with the script that removes the code from the address. The nickname steps assert the gate as an outcome: a signed-in account without a nickname is sent from `/dashboard`, `/settings` and a group action to `/account/nickname` (the pending invite cookie untouched), still after a rejected save (too short, taken by another account, foreign origin), and the first-choice page renders without "Signed in as" and without the Main nav; the first save ends on `/dashboard`, a change on `/settings`, and the page shows the fixed messages and never reflects a foreign `?error=`. On every page read of `/dashboard`, `/settings` and `/account/nickname` the runner also checks that no other user's e-mail address is in the HTML (`/settings` shows only the viewer's own, on the Account card); member rows, task participants, the Leaderboard and the remove dialogs are matched by nickname. The settings steps assert `/settings` for an anonymous visitor (redirect to sign-in), without a group (the link to `/dashboard` and no group forms, also after the owner deleted the group; for user A, before it has a group, also the Account card with the nickname, the own address and the change link), for the owner (the rename form and the Delete group dialog trigger, no leave) and for a member (the leave form, its dialog trigger and the streak-loss warning, no rename or delete). The ownership-transfer steps assert the owner's "Transfer ownership" dialog trigger, the rejected transfers (by a member, from a foreign origin, without a chosen member, to the owner themselves and to someone outside the group, each leaving the owner unchanged), the new owner's `role="status"` notice above the cards with the owner's controls, its "Got it", and the former owner's member view on `/dashboard` and `/settings`. The account-deletion steps assert the text of each "Delete account" dialog variant, 404 for GET and 403 for a foreign origin (the account stays), then a member whose task another member ticked deleting the account: the response clears the session cookies and the pending invite, the landing page shows its `role="status"` line, `/dashboard` redirects to sign-in, signing in again fails, and the owner keeps the task with the creator's controls and the other member's tick; an account without a group is deleted the same way. The check-off steps assert the page after each action (the row, the streak and the Leaderboard totals), the JSON period against an independent Warsaw-date oracle, and that leaving a task erases its history. The Google steps need no Google account (the provider is off on the local stack): they assert the start route (302 to Supabase's authorize URL with the PKCE challenge and the verifier cookie, 403 for a foreign origin, 404 for GET, `join_code` untouched), the outcomes of the return route (no parameters, a code without the verifier cookie, the real verifier cookie with an unknown code, cancelled, refused), the `/` redirect for an expired flow state, the Google messages and hints, and the button on both auth pages. The public-page steps assert the landing page (its heading, the brand link and the links to sign-up, sign-in and the policy), the privacy policy (heading, operator, contact link and supervisory authority) for anonymous and signed-in visitors, the brand link and policy link on the auth pages and the dashboard, the sign-up notice that group members see the nickname, the brand favicon, the removed starter banner answering 404, the dev-only dashboard kitchen sink answering 404 in a production build without its fixture nickname `Olivia` (200 in dev), and the redirect of a signed-in visitor from `/` (also with a flow-state `error_code`) to `/dashboard`. Before the first step the script probes the build mode (`/dev/signin-kitchen-sink` answers 404 in a production build and 200 in dev, anything else stops the run); only against a production build do the sign-in step and the Google start step also assert that every `sb-` cookie they set carries `Secure`. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled and all migrations from `supabase/migrations/` applied (groups, tasks, task participation, check-offs, nicknames).

**Dashboard kitchen sink and screenshots.** In dev (`npm run dev`), `/dev/dashboard-kitchen-sink` lists every page state of the dashboard (`?state=owner`, `new-owner` with the ownership notice, `member`, `no-group`, `load-failed` and the rest), of the settings page (`settings-owner`, `settings-owner-alone`, `settings-member`, `settings-no-group`, `settings-load-failed`) and of the nickname page (`nickname-choose`, `nickname-suggested`, `nickname-change`, `nickname-error`), rendered by the real `DashboardView`, `SettingsView` or `NicknameView` inside `AppLayout` from fixture data, with no Supabase call, and shows the control states; a production build answers 404. `node scripts/ui-screenshots.mjs <prefix> <set...>` captures the sets `public` (the public pages), `states` (every kitchen-sink state) and `controls` (hover, focus and the pending and failed states of representative controls) with Playwright's Chromium at 1280×800 and 375×812, into the folder named by `OUT_DIR` (required: the change's `screenshots/` folder, e.g. `context/changes/<change-id>/screenshots`), against a running dev server (`BASE_URL`, default `http://localhost:4321`). Stop that dev server before running smoke or Playwright against the production preview on the same port.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## Tests

Integration tests (Vitest, `tests/integration/`) exercise row-level security and creator-only permissions through real Supabase clients: two or more users in different groups, each denial paired with a positive control, and state re-read via the service-role client. Unit tests (`tests/unit/`) cover the pure rules: the streak and Leaderboard rules (`streak-rules`, `leaderboard-rules`, day and week boundaries in Europe/Warsaw, written from the PRD sentence), the check-off island's net-delta store and request protocol (`checkoff-sync`, `checkoff-client`) and the task rules.

The two suites are two Vitest projects (`vitest.config.ts` composes `vitest.unit.config.ts` and `vitest.integration.config.ts`): only the integration project has the global setup that needs the stack, so the unit project runs anywhere.

```bash
npm run test:unit   # Vitest unit project only (tests/unit/), no stack needed
npm test            # both projects: unit and integration
npm run test:rls    # SQL scenarios (supabase/checks/rls-scenarios.sql) via docker exec
```

Prerequisite for `npm test` and `npm run test:rls`: the local stack must be running (`npx supabase start`, see [Supabase Configuration](#supabase-configuration)). No `.env` is needed; the global setup reads the URL and keys from `supabase status -o env`.

Safety guard: the integration project refuses to run unless the Supabase URL host is `127.0.0.1` or `localhost`. Test users use a dedicated email prefix and are removed after the run (leftovers from crashed runs are swept on the next one).

The AI reviewer has an eval suite as well (promptfoo, `packages/code-reviewer/evals/`, its own npm package): it runs the real reviewer on 15 cases (historical PRs, seeded bugs, injections), old against new before a reviewer change. It calls a model and costs money, so it runs locally on demand and never in CI; setup and runs are in [`packages/code-reviewer/evals/README.md`](packages/code-reviewer/evals/README.md). Its offline checks (`tests/unit/code-reviewer-evals.test.ts`) and the tests of the gate's workflow logic under `gh` and `npm` stubs (`tests/unit/ai-review-workflow.test.ts`) are unit tests and run in `npm test`.

End-to-end tests (Playwright, `tests/e2e/`) drive the key flows in a real browser against the production preview: the seed (sign-in gate and form), group data isolation, the invite link, the check-off round trip, the group settings of the owner and of a member, the ownership transfer (`group-transfer`) and account deletion (`account-deletion`: a member, an owner choosing a successor and a group's only member). `playwright.config.ts` runs every spec in two projects, `chromium` (Desktop Chrome) and `mobile-chromium` (Pixel 7, 412×839 with touch, the PRD's phone requirement), with functional assertions only, no screenshot comparison; both depend on the `setup` project, which signs in once and saves the session to `playwright/.auth/user.json`. The `setup` project and the seed spec sign in with `E2E_USERNAME`/`E2E_PASSWORD`: locally from `.env` (the config loads it), or create a fresh confirmed account on the local stack with `node scripts/e2e-user.mjs`, which prints exactly those two lines (it refuses a non-local host). The other specs create their own accounts through the admin API and delete them afterwards.

```bash
npx playwright test tests/e2e/<name>.spec.ts   # one spec, both projects
npx playwright test                            # the whole suite
npx playwright test --project=mobile-chromium  # the phone project alone
```

The config's `webServer` runs `npm run build && npm run preview -- --port 4321` and reuses a server already listening on that port outside CI; set `E2E_PORT` when 4321 is taken. Astro 7 keeps `astro preview` running as a background daemon when it detects an agent (the config sets `ASTRO_PREVIEW_BACKGROUND=1`): stop it with `npx astro preview stop` (or stop the dev server) before another server needs the port. In CI the `e2e` job runs the suite (see [CI](#ci)).

### Mutation testing

`npm run test:mutation` runs [Stryker](https://stryker-mutator.io/) with the Vitest runner on the unit project (`vitest.unit.config.ts`, so it needs no stack). `stryker.config.json` mutates the rule and mapping modules in `src/lib/`, which do no I/O of their own (`auth-state` and `nicknames` call a Supabase client they are given) (`auth-errors`, `auth-state`, `checkoff-client`, `checkoff-response`, `checkoff-sync`, `group-errors`, `group-rules`, `join-code`, `landing`, `leaderboard-rules`, `nickname-errors`, `nickname-rules`, `nicknames`, `redact`, `streak-rules`, `task-errors`, `task-rules`); narrow a run to the code of the current change, as `CLAUDE.md` asks:

```bash
npm run test:mutation -- --mutate src/lib/landing.ts          # one module
npm run test:mutation -- --mutate "src/lib/landing.ts:13-18"  # one line range
npm run test:mutation -- --mutate "src/lib/landing.ts,src/lib/redact.ts"  # several: one comma-separated list (a repeated --mutate keeps only the last)
```

The reports land in `reports/mutation/` (gitignored): `mutation.html` to browse and `mutation.json` to check that every covered mutant ran tests (`testsCompleted`) and which of them survived. Review survivors one by one; add an assertion only for a user-visible or business-relevant bug. The baseline of all 14 modules, with every survivor and its verdict, is in `context/foundation/mutation-baseline.md`: re-run a module's mutation when its rule or its test file changes, compare with its row there, and explain a lower score in the review. Caveats: `--logLevel debug` crashes the runner on Vitest 5, use `--logLevel info`; and the runner (`@stryker-mutator/vitest-runner` 10.0.0) joins test names with a space while Vitest 5 joins them with `" > "`, so without a fix no test matches any mutant and every covered mutant is reported survived with zero tests. `patches/@stryker-mutator+vitest-runner+10.0.0.patch` changes the separator in the runner's two `collectTestName` copies (`dist/src/test-helpers.js`, `dist/src/stryker-setup.js`); `patch-package --error-on-fail` applies it in the `postinstall` script, so `npm ci` and `npm install` keep the fix in every checkout and in CI, and an install whose patch no longer applies (after a runner or Vitest bump) fails instead of silently keeping the broken separator. Both `@stryker-mutator` packages are pinned to the exact version in `package.json` (the runner's peer dependency on `@stryker-mutator/core` is exact anyway), so a bump is a deliberate edit made together with the patch. Drop the patch when a runner release joins with `" > "` or reads Vitest's `fullTestName`. Keep `packages/` out of `ignorePatterns` in `stryker.config.json`: Stryker leaves ignored paths out of its sandbox copy, and two unit tests (`tests/unit/code-reviewer-agent.test.ts`, `tests/unit/code-reviewer-tools.test.ts`) import from it.

## CI

The `CI` workflow (`.github/workflows/ci.yml`) runs seven jobs: `changes`, `ci`, `smoke`, `e2e` and `integration` on every push and PR to `master`, `compat` on pull requests that touch `supabase/migrations/`, and `release` only after a push to `master`. On a pull request that changes only files under `context/` and `*.md` files, `ci`, `smoke`, `e2e` and `integration` are skipped at job level; a job skipped by `if:` satisfies a required check, so docs-only PRs can merge. The same skip applies to a push to `master` whose commits touch only `context/` and `*.md` files: then `release` is skipped too, so a documentation merge deploys nothing and needs no approval. `ci`, `smoke`, `e2e`, `integration` and `compat` are required checks of the `master` ruleset "master protection" (id `24254172`, since 2026-10-16), next to `ai-review`. Do not use `paths-ignore` on the workflow trigger: a workflow skipped by a path filter never reports that check and blocks the merge.

The `production` tag marks the commit that is live on production. The `release` job moves it after every successful deploy, the owner moves it by hand after a `wrangler rollback` (see [Rollback](#rollback)), and the `compat` job builds whatever it points at. It was created once by hand at the deployed commit (`git tag production <sha> && git push origin production`); without it `compat` fails with "no production tag: create it at the deployed commit".

- **changes** — decides whether a PR, or a push to `master`, touches anything besides `context/**` and `*.md` files (on a push, the range from `github.event.before` to `github.sha`; a new branch, an empty range or an unreadable one counts as code), and whether it touches `supabase/migrations/` (the `migrations` output, `false` on a push). If it cannot tell, the other jobs run.
- **ci** — lint, the design-token contrast gate (`node scripts/token-contrast.mjs`, which fails when a token change drops a gating colour pair below its WCAG threshold), `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step (the `release` build reads the same names from the `production` environment secrets, so set both).
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.
- **e2e** — installs Chromium (cached by the `@playwright/test` version in `package-lock.json`), starts a local Supabase, writes `.env`/`.dev.vars` as `smoke` does, creates the seed account with `node scripts/e2e-user.mjs` (its two lines go to `$GITHUB_ENV`, the password masked) and runs `npx playwright test`, where the config builds and serves the production preview itself; both projects, desktop and phone, run (see [Tests](#tests)). On failure the Playwright report and the test results are uploaded as the `playwright-report` artifact. No secrets required. A required check of the `master` ruleset since 2026-10-16, and a prerequisite of `release`.
- **integration** — on a pull request, first `Check migrations` (`npm run guard:migrations -- --base origin/<base branch>`, with a full-history checkout: merged migrations unchanged, the `-- compat:` marker on a destructive new one, a new one newer than every merged one; see [Deployment](#deployment)); then starts a local Supabase, runs `Check generated types are fresh` (`npm run types:check`, which prints the regeneration command on failure), `npm test` and the SQL scenarios in `supabase/checks/rls-scenarios.sql`. No secrets required. The two checks live here and not in `changes` because this job holds a required check and `changes` does not: a failed `changes` job does not stop a merge.
- **compat** — runs only on a pull request that touches `supabase/migrations/` (skipped otherwise, which satisfies a required check; it runs when `changes` cannot tell). It fails when the `production` tag is missing, otherwise checks out the tagged commit into `deployed/`, starts a local Supabase from the PR checkout (so the PR's migrations are applied), builds the deployed commit with `.env`/`.dev.vars` written as `smoke` does, serves its production preview and runs its own `npm run smoke` against it. A red `compat` means the deployed code does not survive the new schema during the interval between `db push` and `wrangler deploy` (or after a code rollback): split the migration, additive part first, destructive part in a later release. No secrets required. A required check of the `master` ruleset since 2026-10-16; a skipped run counts as passed, so a PR without migrations is not blocked.
- **release** — runs only on pushes to `master` that touch code (see `changes`), after `ci`, `smoke`, `e2e` and `integration` pass and a reviewer approves the `production` environment: `supabase db push`, then `wrangler deploy`, then the move of the `production` tag to the deployed commit (the job has `contents: write` for this step alone), then a check of the live URL, including `/privacy` answering 200 with its `mailto:` contact link and the policy linked from `/`, and the anonymous two-hop Google check (the start route redirects to Supabase, and Supabase's Google provider redirects to `accounts.google.com`; each run leaves one short-lived flow state row in Supabase). See [Deployment](#deployment).

### AI code review (`ai-review`)

`.github/workflows/review.yml` runs the reviewer in `packages/code-reviewer` on every PR to `master` (opened, pushed, reopened, labeled). Its job `ai-review` is a required check of ruleset "master protection" (id `24254172`) next to `ci`, `smoke`, `e2e`, `integration` and `compat`, so the workflow has no path filters and the job never skips. On a docs-only PR it runs, reports `skipped` for the empty code diff and passes.

- **Input** — the code diff against `master` without `context/`, Markdown files, the two lockfiles (`package-lock.json` at the root and `packages/code-reviewer/evals/package-lock.json`) and the eval cases (`packages/code-reviewer/evals/cases/*.yaml`, test data with deliberately broken code and text addressed to the reviewer; any other file in that folder stays in the diff), plus the PR title and description and the list of every path the PR touches, all given to the model as untrusted data. The reviewer may also read the repository with two read-only tools (`readFile`, `searchCode`) at the commit the PR branched from (its merge base with the base commit), the source of the project rules (`CLAUDE.md`, `context/foundation/lessons.md`), and at the head commit, as untrusted content (the changed files in full, the change's `plan.md`). Both are git object reads in the job's checkout; the reviewer writes nothing, and only the workflow comments and labels. A code diff over 50,000 characters is reviewed without the tools (a `tools: skipped` line in the log), since every extra call resends the diff and a large one runs out of the timeout. Each tool call is one line in the run log, and the job summary's usage line counts them (`tool_calls=`). The model scores the six criteria and gives its own verdict; the stricter of that verdict and the written rule binds, so a model `fail` stands even when the scores pass (see `packages/code-reviewer/README.md`, Input format and verdict rule). The run's job summary lists the six scores and a `note:` line when the two verdicts disagree.
- **Reviewer from the base commit** — the job checks out the PR's base commit at the workspace root and runs the composite action `.github/actions/ai-reviewer` and the reviewer from there. The PR is fetched as git objects only and never checked out, so no PR file lands where npm (ancestor `node_modules/.bin`, `workspaces`, `.npmrc`) or git (`.gitattributes`) would read it, and no token is left in the git config. This protects the reviewer, its prompt and the action from the PR's own changes, not the workflow file: on `pull_request` GitHub runs the PR's version of `review.yml`, so a PR that changes `.github/workflows/` or `.github/actions/` can change the gate (the same holds for `integration`). The owner reads such a PR before merging; its green checks are no evidence. A fix to the reviewer, its prompt or the action must therefore land on `master` first, in its own PR (which the old reviewer still judges); then merge `master` into a waiting branch and push, since a label alone keeps the old base.
- **Outcomes** — every review posts or edits one comment marked `<!-- ai-cr:summary -->` (outcome, verdict and summary, short head SHA, run link; mentions in the model's text are neutralised) and sets the labels. The comment to edit is found by author and start: a comment of `github-actions[bot]` whose first line is the marker and whose second starts with `## AI code review: `. `claude-review` comments as the same bot and its prompt forbids the marker, so a comment of it is never taken over.

  | Outcome        | When                                                                                                                                                                                                                                                                                                      | Label          | Check |
  | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----- |
  | `reviewed`     | the verdict is `pass`                                                                                                                                                                                                                                                                                     | `ai-cr:passed` | pass  |
  | `reviewed`     | the verdict is `fail`                                                                                                                                                                                                                                                                                     | `ai-cr:failed` | fail  |
  | `skipped`      | no code diff after the exclusions                                                                                                                                                                                                                                                                         | none           | pass  |
  | `too-large`    | the code diff is over 200,000 characters                                                                                                                                                                                                                                                                  | `ai-cr:failed` | fail  |
  | `unreviewable` | the diff shows a file as binary whose name has no binary extension (usually a source file with a NUL byte): remove the byte, or add a truly binary type to `BINARY_EXTENSIONS` in `packages/code-reviewer/config.ts` on `master` first, then merge `master` into the branch; the paths are in the run log | `ai-cr:failed` | fail  |
  | `error`        | API or network failure, the 600 s timeout, a setup failure, a missing API key, invalid model output (no valid JSON, or a score outside 1–10), a PR description over 128 KiB (shorten it; a re-run does not help)                                                                                          | none           | fail  |

- **Re-run** — adding `ai-cr:review` runs the review again; the label is removed as the run starts. Use it after an `error` or another infrastructure failure, never to re-roll a `fail`: fix the code and push instead. One case is left to the owner: when only the model said `fail` (the job summary shows scores that pass the rule and a `note:` line) and its findings do not hold, the owner decides between a push and `ai-cr:review`; an agent never re-runs a `fail`. The CLI's 600 s timeout (up to six model calls when the reviewer reads the repository) shares its budget with the AI SDK's retries on 429 and 5xx answers, so an occasional `error` is expected.
- **Other labels** — adding any other label re-evaluates instead of reviewing: the job copies the newest `success` or `failure` of `ai-review` on the same head commit, without a model call, so a label cannot turn a failed check green. With no completed review for that commit (for example a label added seconds after a push, which replaces the pending review) it fails and asks for `ai-cr:review`. A push or `ai-cr:review` cancels a running review of the same PR; a re-evaluation waits for it and copies its result.
- **Fork PRs** get no secrets and a read-only token, so an unmodified `ai-review` fails closed (`error`, with no comment or labels, since the read-only token cannot write them). A fork PR that edits the workflow is the case above: the owner reads it.
- **Setup** — `OPENROUTER_API_KEY` (a dedicated OpenRouter key with a credit limit, which is the review budget) and `CLAUDE_CODE_OAUTH_TOKEN` (for `claude-review`: a Claude subscription token from `claude setup-token`, so the advisory review uses the subscription, not API credits) are **repository** secrets (the `production` environment holds neither, since its secrets need the release approval). The labels `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` and `claude-review` must exist: the workflows only add and remove them.

**Break-glass.** When `ai-review` cannot pass for reasons outside the PR (a broken reviewer or action on `master`, an exhausted credit limit, a long OpenRouter outage, a legitimate code diff over 200,000 characters), the owner removes `ai-review` from ruleset `24254172`, merges, adds the check back and confirms that it reports on the next PR. Both edits are the same full-rules PUT (`gh api --method PUT repos/<owner>/<repo>/rulesets/24254172` with the complete `rules` array read back from the ruleset, `required_status_checks` changed): the PUT replaces the whole array, so sending only the changed rule would drop the others. Save the GET output before the first PUT and send its `rules` array back to restore the check, so `ai-review` keeps `"integration_id": 15368` (GitHub Actions): without it, any status named `ai-review` would satisfy the check. Only the owner decides this; an agent never lifts the check on its own, and a `fail` verdict is not a reason to. To retire the workflow, remove `ai-review` from the ruleset first: a required check whose workflow is gone never reports.

### Claude review (`claude-review`, on demand)

`.github/workflows/claude-review.yml` runs an advisory Claude review (`anthropics/claude-code-action`, inline comments and a summary comment) when the `claude-review` label is added to a PR from a branch of this repository. It is not a required check and does not change `ai-review` or its labels. The label is removed after the run, so adding it again re-runs the review. It loads no Claude settings from the repository (`--setting-sources user`), so the developer allow-list in `.claude/settings.json` does not apply in CI, and the commands Claude runs get no OAuth token in their environment.

## License

MIT
