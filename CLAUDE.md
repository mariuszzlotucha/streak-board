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

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 5

Rozszerz cykl pojedynczej zmiany na pracę równoległą za pomocą **worktrees, delegowania ukierunkowanego na cel i orkiestracji wielu sesji**:

```
worktree per change -> /goal or claude -p -> PR -> review -> merge
```

Lekcja koncentruje się na bezpiecznej przepustowości: izolowanych kontekstach, wyborze właściwego trybu wykonania oraz ograniczaniu równoległości do możliwości przeglądu.

### Router zadań — od czego zacząć

| Umiejętność | Użyj, gdy |
| --- | --- |
| **Izolacja kodu** | |
| `git worktree add` | Potrzebujesz osobnego katalogu roboczego dla równoległej zmiany. Jedna zmiana na worktree, jeden świeży kontekst agenta na worktree. |
| **Złożone zmiany** | |
| `/10x-implement <change-id> phase <n>` | Zmiana ma wiele faz, wymaga ręcznych bramek lub korzysta z interaktywnego podejmowania decyzji podczas wykonania. |
| **Proste zmiany** | |
| `/goal` | Masz jasne, ograniczone zadanie i chcesz delegowania ukierunkowanego na cel. Agent pracuje autonomicznie w kierunku określonego celu z warunkiem zatrzymania. |
| `claude -p` | Chcesz bezobsługowego wykonania dobrze zdefiniowanego zadania. Pętla Ralph Wiggum (uruchom, sprawdź, ponów próbę) jest uniwersalnym autonomicznym wzorcem. |
| **Orkiestracja wielu sesji** | |
| Superset / Conductor / Antigravity / VS Code Agent View | Uruchamiasz równolegle wiele sesji agentów i potrzebujesz wglądu, koordynacji lub zarządzania sesjami między nimi. |

### Zasady pracy równoległej

- Jedna zmiana na worktree lub izolowaną przestrzeń roboczą. Jeden świeży kontekst agenta na zmianę.
- Wybieraj interaktywne `/10x-implement` dla złożonych zmian, a `/goal` lub `claude -p` dla prostych.
- Równoległość jest ograniczona przez możliwości przeglądu. Więcej agentów bez przeglądu oznacza więcej nieprzejrzanego kodu, a nie większą przepustowość.
- Problem z jakością wynikający z szybszego dostarczania jest celowy — stanowi przejście do bramek testowych w Module 3.

### Granice lekcji

- Nie omawiaj ponownie interaktywnych `/10x-implement` ani `/10x-impl-review`; to Lekcje 2 i 3.
- Nie wprowadzaj tutaj strategii testowania. Problem z jakością jest motywacją dla Modułu 3.
- Worktrees są mechanizmem izolacji, a nie tematem pełnego samouczka git.

### Ścieżki używane przez tę lekcję

- `context/changes/<change-id>/` - folder aktywnej zmiany
- `context/changes/<change-id>/plan.md` - dane wejściowe implementacji dla dowolnego trybu wykonania

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozstrzygnięta ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: „This change is archived. Open a new change with `/10x-new` instead.”

<!-- END @przeprogramowani/10x-cli -->
