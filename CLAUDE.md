# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Astro 7 SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. API routes must export `const prerender = false`.

**Auth flow**: `src/lib/supabase.ts` creates a Supabase SSR client (`@supabase/ssr`, cookie-based sessions) from `SUPABASE_URL`/`SUPABASE_KEY` — declared as server-only secrets in `astro.config.mjs`'s `env.schema` and read via `astro:env/server`. Both are `optional: true`; if either is unset, `createClient` returns `null`. Its `cookieOptions` set `Secure` on every Supabase cookie in a production build (`import.meta.env.PROD`). `src/middleware.ts` runs on every request, resolves the user onto `context.locals.user` (or `null` when Supabase isn't configured), and redirects unauthenticated requests away from paths listed in its `PROTECTED_ROUTES` array (currently `["/dashboard", "/api/groups", "/api/tasks"]`). The middleware tells an Auth service failure (answered 503 on those paths, via `resolveAuthState` in `src/lib/auth-state.ts`) from a missing session (302), and reports failures through `src/lib/log.ts`.

- API endpoints: `src/pages/api/auth/{signin,signup,signout,google}.ts` (`google.ts` starts the Google sign-in, a form POST guarded by Astro's origin check), `src/pages/api/groups/{create,join,rename,leave,remove-member,delete}.ts`, `src/pages/api/tasks/{create,update,delete,join,leave,checkoff,uncheck}.ts`
- Public pages: `src/pages/index.astro` (landing page; redirects a signed-in visitor to `/dashboard`, then an anonymous visitor with a flow-state `error_code` to `/auth/signin?error=oauth_failed`, in that order) and `src/pages/privacy.astro` (the privacy policy, server-rendered, public). They and the auth pages render inside `src/layouts/PublicLayout.astro`, built from `src/components/site/{SiteHeader,SiteFooter}.astro`; the footer (also on the dashboard) reads the operator's name and contact address from `src/lib/site.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`; both sign-in and sign-up render `src/components/auth/GoogleButton.astro` ("Continue with Google", a plain form posting to `/api/auth/google`)
- Auth return routes (public GETs): `src/pages/auth/callback.ts` (e-mail confirmation link; every exchange failure ends on `/auth/signin?error=link_expired`) and `src/pages/auth/google/callback.ts` (Google sign-in; cancellation, a stale attempt and a failure end on `/auth/signin` with a fixed code from `src/lib/auth-errors.ts`, never reflecting provider text)
- Protected group hub: `src/pages/dashboard.astro`
- Public invite route: `src/pages/join/[code].ts` (stores the code in a cookie and redirects to `/dashboard`)

## Conventions

- Path alias `@/*` → `./src/*` (tsconfig).
- Astro components for static content/layout; React only where interactivity is needed.
- Merge Tailwind classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge) rather than concatenating class strings.
- shadcn/ui components live in `src/components/ui/` ("new-york" style, `lucide` icons). Add new ones with `npx shadcn@latest add [name]`.
- API routes use uppercase `GET`/`POST` exports.
- No Next.js directives in React components (no `"use client"`); extract hooks to `src/components/hooks/`.
- Services/helpers go in `src/lib/`; shared types (entities, DTOs) belong in `src/types.ts` (generated from the local database schema with `npx supabase gen types typescript --local`; do not hand-edit).
- The privacy policy (`src/pages/privacy.astro`) states facts about the data model, who sees what, deletion, cookies and providers; a change to any of them updates the policy in the same change.
- Supabase migrations go in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled and granular per-operation/per-role policies on every new table. The schema currently consists of `groups`, `group_members`, `tasks`, `task_participants` and `task_checkoffs` (read through the `task_checkoff_periods` view) plus Supabase Auth's built-in `auth.users`.

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

## Zestaw narzędzi AI 10xDevs - Moduł 4, Lekcja 5 (Modernizacja DDD)

Ujawnij domenę, której kod legacy nigdy nie nazwał, a następnie użyj jej jako danych wejściowych do kolejnego cyklu.

```
domain distillation -> invariant aggregate / anti-corruption layer -> /10x-shape -> /10x-roadmap -> /10x-research -> /10x-plan
```

### Router zadań - Od czego zacząć

| Umiejętność / prompt                                             | Użyj, gdy                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/10x-domain-distillation`                                       | Jednorazowa mapa domeny. Zapisuje wszechobecny język wraz z jego źródłami, poddomenami Core/Supporting/Generic, niezmiennikami oraz informacją, czy kod je egzekwuje, rozbieżnościami między modelem a kodem i rankingiem „napraw najpierw” do `context/domain/domain-distillation.md`, a także `context/domain/glossary.md`. Użyj `--replace`, aby odświeżyć; poprzednie uruchomienie trafia do `context/archive/`. |
| `m4l5-1-domain-distillation`                                     | Ta sama destylacja jako pojedynczy prompt, wykonywana krok po kroku.                                                                                                                                                                                                                                                                                                                                                 |
| `m4l5-2-invariant-aggregate-refactor`                            | Kluczowa reguła biznesowa jest egzekwowana w wielu miejscach albo wcale. Planuje agregat strażniczy, który jest jej właścicielem.                                                                                                                                                                                                                                                                                    |
| `m4l5-3-anti-corruption-layer`                                   | Zewnętrzna zależność przenika do domeny. Planuje wokół niej warstwę Anti-Corruption Layer.                                                                                                                                                                                                                                                                                                                           |
| `/10x-shape` -> `/10x-roadmap` -> `/10x-research` -> `/10x-plan` | Przekazywanie artefaktów `context/domain/` do kolejnego cyklu.                                                                                                                                                                                                                                                                                                                                                       |

### Twarde zasady

- **Odkrywaj domenę; nie zakładaj jej.** Zacznij bez nazw encji, agregatów ani ścieżek i wskaż, skąd pochodzi każdy termin (z dokumentu lub kodu).
- **Twórz mapę albo plan, nie kod.** Te artefakty nie modyfikują kodu produkcyjnego; zmiana następuje później przez `/10x-plan` -> `/10x-implement`.
- **Używaj terminów ze słownika.** Gdy istnieje `context/domain/glossary.md`, używaj jego terminów w kodzie, planach i rozmowach oraz unikaj nazw oznaczonych przez niego jako „don't call it”.

<!-- END @przeprogramowani/10x-cli -->
