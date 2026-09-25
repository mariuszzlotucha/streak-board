# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Astro 7 SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. API routes must export `const prerender = false`.

**Auth flow**: `src/lib/supabase.ts` creates a Supabase SSR client (`@supabase/ssr`, cookie-based sessions) from `SUPABASE_URL`/`SUPABASE_KEY` — declared as server-only secrets in `astro.config.mjs`'s `env.schema` and read via `astro:env/server`. Both are `optional: true`; if either is unset, `createClient` returns `null`. `src/middleware.ts` runs on every request, resolves the user onto `context.locals.user` (or `null` when Supabase isn't configured), and redirects unauthenticated requests away from paths listed in its `PROTECTED_ROUTES` array (currently `["/dashboard"]`).

- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected example: `src/pages/dashboard.astro`

## Conventions

- Path alias `@/*` → `./src/*` (tsconfig).
- Astro components for static content/layout; React only where interactivity is needed.
- Merge Tailwind classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge) rather than concatenating class strings.
- shadcn/ui components live in `src/components/ui/` ("new-york" style, `lucide` icons). Add new ones with `npx shadcn@latest add [name]`.
- API routes use uppercase `GET`/`POST` exports.
- No Next.js directives in React components (no `"use client"`); extract hooks to `src/components/hooks/`.
- Services/helpers go in `src/lib/`; shared types (entities, DTOs) belong in `src/types.ts` (not yet created).
- Supabase migrations, once added, go in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled and granular per-operation/per-role policies on every new table. No custom tables/migrations exist yet — the app currently relies only on Supabase Auth's built-in `auth.users`.

## Commands

`npm run {dev,build,preview,lint,lint:fix,format,smoke}` — see `@README.md` (Available Scripts, Smoke test) for what each does and when to run it.

Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`. No test runner beyond `npm run smoke` plus lint/build.

## Environment

Node.js v22.14.0 (`.nvmrc`). Local Supabase/env-var setup, deployment, and CI jobs are documented in `@README.md` (Supabase Configuration, Deployment, CI) — don't duplicate that here.

<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 5 (interfejs 10xDevs 4.0)

Traktuj zmianę wizualną jako **zmianę 10x z kontraktem systemu projektowego**, a nie rozmowę „zrób to ładnie”:

```
/10x-new -> audit+reference research -> plan (tokens then one view) -> implement -> screenshot gate -> /10x-impl-review
```

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-ui` | Widok już się renderuje i wymaga audytu oraz ulepszenia: motyw, zmiana stylu, „ładniejszy interfejs”, tokeny, poprawki wizualne — w aplikacji kursowej lub dowolnym innym stacku. Nie do budowania widoku od podstaw. |
| `/10x-research` | Zlokalizuj źródło wartości i współdzielone komponenty tego repozytorium, zmapuj, które widoki je odczytują, i wybierz nazwany motyw — nie moodboard. Wynikiem jest lista zarzutów (plik, linia, wpływ na użytkownika). |
| `/10x-plan` / `/10x-implement` | Ten sam łańcuch co we wcześniejszych lekcjach M2; payloadem jest UI. |
| `/10x-impl-review` | Przed mergem; nie pomijaj ustaleń wizualnych jako kosmetycznych. |

### Kontrakt

- Dwie części, niezależnie od stacku: semantyczne tokeny w jednym źródle oraz importowalne komponenty znajdujące się w repozytorium. Tailwind v4 `@theme` + shadcn to sposób, w jaki realizuje je aplikacja kursowa; przed zaproponowaniem wartości przeczytaj implementację tego repozytorium.
- Wartości zaczerpnięte z zewnątrz trafiają do repozytorium wraz z linią wskazującą źródło. Nie do historii czatu.
- Jeden widok + globalne tokeny. Nie rebranding całego MVP. Nie worktree/`/goal`.
- Trzy kategorie zarzutów: brakujące tokeny, brakujący współdzielony komponent, przypadkowa architektura.
- Bramka wizualna: kitchen sink renderujący każdy stan, ze zrzutami ekranu; podłącz go do testu screenshotowego tylko wtedy, gdy repozytorium już taki ma. Nie aktualizuj bezrefleksyjnie baseline’ów.
- Brak systemu projektowego w repozytorium? Zaproponowanie go jest dozwolone — oznaczone jako dodanie zależności, ograniczone do tego, czego wymaga zmiana, i zawsze przegrywające z systemem, który już istnieje.
- Modele: kieruj według fazy, nie dostawcy. Najsilniejszy dostępny model do audytu, planu i przeglądu; tańszy poziom roboczy do wdrażania zarzutów w pętli; eskaluj tylko wtedy, gdy ten sam zarzut przetrwa dwie rundy. Działa każdy model obsługujący wizję, a żaden pojedynczy model — w tym Fable 5.1 — nie jest wymagany.

### Granice lekcji

- Nie ucz ponownie Exa/Context7, worktree’ów ani testowania screenshotowego jako kursu testowania.
- Nie inicjalizuj drugiego systemu projektowego w repozytorium, które już go ma — w tym `shadcn init` w starterze kursowym.

<!-- END @przeprogramowani/10x-cli -->
