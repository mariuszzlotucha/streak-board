# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Astro 7 SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. API routes must export `const prerender = false`.

**Auth flow**: `src/lib/supabase.ts` creates a Supabase SSR client (`@supabase/ssr`, cookie-based sessions) from `SUPABASE_URL`/`SUPABASE_KEY` — declared as server-only secrets in `astro.config.mjs`'s `env.schema` and read via `astro:env/server`. Both are `optional: true`; if either is unset, `createClient` returns `null`. The same schema holds `CONTACT_EMAIL` (the privacy policy's contact address, read at runtime through `contactEmail()` in `src/lib/site.ts`, so it is not in the repo). Its `cookieOptions` set `Secure` on every Supabase cookie in a production build (`import.meta.env.PROD`). `src/middleware.ts` runs on every request, resolves the user onto `context.locals.user` (or `null` when Supabase isn't configured), and redirects unauthenticated requests away from paths listed in its `PROTECTED_ROUTES` array (currently `["/dashboard", "/settings", "/api/groups", "/api/tasks"]`). The middleware tells an Auth service failure (answered 503 on those paths, via `resolveAuthState` in `src/lib/auth-state.ts`) from a missing session (302), and reports failures through `src/lib/log.ts`.

- API endpoints: `src/pages/api/auth/{signin,signup,signout,google}.ts` (`google.ts` starts the Google sign-in, a form POST guarded by Astro's origin check), `src/pages/api/groups/{create,join,rename,leave,remove-member,delete}.ts`, `src/pages/api/tasks/{create,update,delete,join,leave,checkoff,uncheck}.ts`
- Public pages: `src/pages/index.astro` (landing page, sections in `src/components/landing/`; `landingRedirect` in `src/lib/landing.ts` redirects a signed-in visitor to `/dashboard`, then an anonymous visitor with a flow-state `error_code` to `/auth/signin?error=oauth_failed`, in that order) and `src/pages/privacy.astro` (the privacy policy, server-rendered, public). They and the auth pages render inside `src/layouts/PublicLayout.astro`, built from `src/components/site/{SiteHeader,SiteFooter}.astro`; the footer (also on the dashboard) reads the operator's name and contact address from `src/lib/site.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`; both sign-in and sign-up render `src/components/auth/GoogleButton.astro` ("Continue with Google", a plain form posting to `/api/auth/google`)
- Auth return routes (public GETs): `src/pages/auth/callback.ts` (e-mail confirmation link; every exchange failure ends on `/auth/signin?error=link_expired`) and `src/pages/auth/google/callback.ts` (Google sign-in; cancellation, a stale attempt and a failure end on `/auth/signin` with a fixed code from `src/lib/auth-errors.ts`, never reflecting provider text)
- Protected group hub: `src/pages/dashboard.astro` renders `DashboardView` (`src/components/dashboard/DashboardView.astro`, cards in `src/components/dashboard/`) inside `src/layouts/AppLayout.astro` (brand header with Sign out, `<main>`, footer); data loaded by `loadDashboard` in `src/lib/dashboard-data.ts`, and a failed load answers 503 with the error page
- Protected settings page: `src/pages/settings.astro` renders `SettingsView` (`src/components/dashboard/SettingsView.astro`, with `GroupSettingsCard`: rename and delete for the owner, leave for a member) inside `AppLayout`; data loaded by `loadSettings` in `src/lib/settings-data.ts` (the caller's group only), a failed load answers 503 with the error page, and the actions redirect to `/dashboard`. `AppLayout` (`current` prop) renders the Main nav, "Dashboard" and "Settings", next to the brand
- Public invite route: `src/pages/join/[code].ts` (stores the code in a cookie and redirects to `/dashboard`)

## Conventions

- Path alias `@/*` → `./src/*` (tsconfig).
- Astro components for static content/layout; React only where interactivity is needed.
- Merge Tailwind classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge) rather than concatenating class strings.
- shadcn/ui components live in `src/components/ui/` (`radix-maia` style, `lucide` icons). Add new ones with `npx shadcn@latest add [name]` (see UI below).
- API routes use uppercase `GET`/`POST` exports.
- No Next.js directives in React components (no `"use client"`); extract hooks to `src/components/hooks/`.
- Services/helpers go in `src/lib/`; shared types (entities, DTOs) belong in `src/types.ts` (generated from the local database schema with `npx supabase gen types typescript --local`; do not hand-edit).
- The privacy policy (`src/pages/privacy.astro`, one component per section in `src/components/privacy/`) states facts about the data model, who sees what, deletion, cookies and providers; a change to any of them updates the policy in the same change.
- Supabase migrations go in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled and granular per-operation/per-role policies on every new table. The schema currently consists of `groups`, `group_members`, `tasks`, `task_participants` and `task_checkoffs` (read through the `task_checkoff_periods` view) plus Supabase Auth's built-in `auth.users`.

## UI

- **Tokens.** Colours, radii and fonts live in `src/styles/global.css`: values in `:root` and `.dark`, published to Tailwind by `@theme inline`. A new token goes into all three blocks, with its raw value and source in the change's `tokens-source/` folder, and `node scripts/token-contrast.mjs` must pass (CI runs it after lint).
- **Components.** They live in `src/components/ui/` (`radix-maia`, lucide icons). Check there before creating one, and add a missing one with `npx shadcn@latest add <name>` (preview with `--dry-run`). The registry imports `cn` from the npm package `cn`: point the new file at `@/lib/utils` and restore the package files (`git checkout -- package.json package-lock.json && npm ci`); ESLint rejects the `cn` package import. Shared form pieces (`FormField`, `SubmitButton`) live in `src/components/forms/`.
- **No literals.** No literal colours or arbitrary values in views; use tokens. In the dashboard view files (`src/pages/dashboard.astro`, `src/pages/settings.astro`, `src/pages/dev/`, `src/layouts/`, `src/components/{dashboard,tasks,groups,forms,site,dev}/`) ESLint rejects hex colours, colour functions, Tailwind palette classes and arbitrary px/rem values; other arbitrary values (`%`, `calc()`, `var()`) are left to review. When prose trips the rule, reword it; do not weaken the rule.
- **No `asChild` from `.astro`.** Astro hands a React component its `.astro` children as static HTML, so `asChild` loses the child's props. Use `CardTitle as="h2"` for card headings, and `<a class:list={buttonVariants(...)}>` for link buttons.
- **Smoke binds the markup.** `scripts/smoke.mjs` binds the dashboard and settings markup with regular expressions (one `<li>` per task, exact `<h2>` card headings, badges and buttons holding only their text, `role="alert"` only for errors): keep its invariants, or change smoke in the same change.
- **The gate.** The dev-only kitchen sink `/dev/dashboard-kitchen-sink` renders the real `DashboardView` and `SettingsView` from fixtures (`src/components/dev/dashboard-fixtures.ts`) in every page state of `/dashboard` and `/settings` (`settings-*`), plus the control states. `scripts/ui-screenshots.mjs` captures them against a running `astro dev` (see `@README.md`, Smoke test).

## Parallel work (git worktrees)

Several slices can be developed at once, one agent session per linked git worktree (siblings under `../streak-board-worktrees/`; the main checkout stays on `master`). In a worktree never run `git checkout master` or `git pull`; base branches on `origin/master`. Only one session at a time runs the local Supabase stack and the DB-backed tests. The independence check, the setup and the shared-resource rules are in `context/foundation/lessons.md` ("Run independent slices in parallel git worktrees, one agent session each").

## Commands

`npm run {dev,build,preview,lint,lint:fix,format,smoke,test,test:rls}` — see `@README.md` (Available Scripts, Smoke test) for what each does and when to run it.

Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`. Tests: `npm test` (Vitest integration tests against the local Supabase stack; needs `supabase start`) and `npm run test:rls` (SQL RLS scenarios via `docker exec`); see `@README.md` (Tests).

## Environment

Node.js v22.14.0 (`.nvmrc`). Local Supabase/env-var setup, deployment, and CI jobs are documented in `@README.md` (Supabase Configuration, Deployment, CI) — don't duplicate that here.

## Mutation testing

Repo uses Stryker for selective mutation testing on risk-critical modules.
Run it only for code covered by the current change or a risk from test-plan.md,
prefer narrowed scope with --mutate "path/to/file.ts:start-end", and do not chase
100% mutation score. Survived mutants should be reviewed one by one: add an
assertion only when the mutant represents a user-visible or business-relevant bug.

<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 5, Lekcja 2 (Agent zespołowy z SDK)

Zbuduj minimalnego agenta do przeglądu kodu: diff na wejściu, ustrukturyzowany werdykt JSON na wyjściu. Schemat i prompt systemowy są kontraktem, od którego zależy wszystko później (bramka CI, ewaluacje).

```
review schema + system prompt -> review.ts (ready-made agent SDK or AI SDK ToolLoopAgent) -> git diff | npx tsx review.ts
```

### Router zadań — od czego zacząć

| Umiejętność / prompt / szablon                      | Użyj, gdy                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `m5l2-review-schema.ts.template` (config templates) | Rozpoczynasz tworzenie recenzenta. Skopiuj go do pakietu recenzenta: sześć ocenianych kryteriów (1–10), werdykt i podsumowanie jako schemat zod oraz prompt systemowy. |
| `m5l2-agent` (prompts)                              | Konfigurujesz punkt wejścia AI SDK, a następnie planujesz modułowego recenzenta `ToolLoopAgent` za pomocą `/10x-plan`.                                                 |
| `/10x-plan` -> `/10x-implement`                     | Przekształcasz jednoplikowego recenzenta w moduły wielokrotnego użytku.                                                                                                |

### Twarde zasady

- **Schemat jest kontraktem.** Najpierw zmień kryteria, wartości werdyktu lub nazwy pól w schemacie, a następnie w promptach, bramkach i ewaluacjach.
- **Przypinaj główne wersje.** Kod lekcji jest przeznaczony dla AI SDK 7 (`ai@7`, `@openrouter/ai-sdk-provider@3`) oraz Node 22+.
- **Śledź koszt każdego uruchomienia.** Loguj użycie z każdego przeglądu i ustaw twardy limit budżetu, zanim agent zacznie działać bez nadzoru.

<!-- END @przeprogramowani/10x-cli -->
