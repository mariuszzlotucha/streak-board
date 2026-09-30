# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Astro 7 SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. API routes must export `const prerender = false`.

**Auth flow**: `src/lib/supabase.ts` creates a Supabase SSR client (`@supabase/ssr`, cookie-based sessions) from `SUPABASE_URL`/`SUPABASE_KEY` — declared as server-only secrets in `astro.config.mjs`'s `env.schema` and read via `astro:env/server`. Both are `optional: true`; if either is unset, `createClient` returns `null`. `src/middleware.ts` runs on every request, resolves the user onto `context.locals.user` (or `null` when Supabase isn't configured), and redirects unauthenticated requests away from paths listed in its `PROTECTED_ROUTES` array (currently `["/dashboard", "/api/groups"]`).

- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`, `src/pages/api/groups/{create,join,rename,leave,remove-member,delete}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
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
- Supabase migrations go in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled and granular per-operation/per-role policies on every new table. The schema currently consists of `groups` and `group_members` plus Supabase Auth's built-in `auth.users`.

## Commands

`npm run {dev,build,preview,lint,lint:fix,format,smoke}` — see `@README.md` (Available Scripts, Smoke test) for what each does and when to run it.

Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`. No test runner beyond `npm run smoke` plus lint/build.

## Environment

Node.js v22.14.0 (`.nvmrc`). Local Supabase/env-var setup, deployment, and CI jobs are documented in `@README.md` (Supabase Configuration, Deployment, CI) — don't duplicate that here.

<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 5 (10xDevs 4.0 UI)

**W przypadku pracy nad UI w widoku, który już się renderuje, użyj `/10x-ui`.** Przeprowadza ono zmianę wizualną przez ten sam łańcuch co każdą inną zmianę (`/10x-new` → `/10x-research` →
`/10x-plan` → `/10x-implement` → `/10x-impl-review`) i obejmuje zasady:
kiedy rozpocząć pracę i którego widoku dotyczy, audyt pod kątem opłat, kontrakt systemu projektowego w formie, w jakiej realizuje go to repozytorium, stany komponentów, bramkę zrzutu ekranu oraz regułę, która utrzymuje kolejnego agenta przy kontrakcie. W jego `references/` znajduje się lista kontrolna jakości.

Tworzenie widoku po raz pierwszy nie jest zadaniem dla `/10x-ui` — zbuduj go poprzez
zwykły łańcuch, a następnie wróć do niego z `/10x-ui`.

<!-- END @przeprogramowani/10x-cli -->
