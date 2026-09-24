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

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 3

Przejrzyj kod wygenerowany przez AI przed scaleniem, korzystając z **łańcucha przeglądu implementacji**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` jest głównym tematem lekcji. Przegląd jest bramką jakości, a nie poleceniem naprawienia każdego znaleziska.

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| **Przegląd kodu (główny temat lekcji)** | |
| `/10x-impl-review <change-id>` | Zaimplementowano kod i chcesz przeprowadzić ustrukturyzowany przegląd przed scaleniem. Umiejętność sprawdza zgodność z planem, dyscyplinę zakresu, bezpieczeństwo i jakość, architekturę, spójność wzorców oraz kryteria sukcesu, a następnie przedstawia ustalenia do selekcji. |
| **Wynik powtarzającej się lekcji** | |
| `/10x-lesson` | Ustalenie ujawnia powtarzającą się regułę projektu lub wzorzec błędów agenta. Zapisz je w `context/foundation/lessons.md` zamiast traktować je jako jednorazową notatkę. |

### Dyscyplina selekcji

- Dotkliwość określa, jak poważne jest ustalenie. Wpływ określa, jak duże znaczenie ma teraz decyzja.
- Prawidłowe wyniki: napraw teraz, napraw inaczej, pomiń, zaakceptuj jako ryzyko, zapisz jako powtarzającą się regułę (`/10x-lesson`), nie zgódź się.
- Naprawiaj krytyczne ustalenia. Nie poświęcaj godzin na obserwacje o niskim wpływie tylko dlatego, że agent je znalazł.
- Świadome pomijanie ustaleń o niskim wpływie jest prawidłowym wynikiem przeglądu, a nie zaniedbaniem.
- Jeśli nie zgadzasz się z ustaleniem, zapisz dlaczego. Błędne rozumowanie agenta również jest sygnałem.

### Granice przeglądu

- Ta lekcja dotyczy przeglądu zaimplementowanego kodu. Nie tworzy planu, nie wykonuje nowych faz ani nie uczy przeglądu CI.
- Strategia testowania i bramki jakości zostaną wprowadzone w Module 3.
- Nie używaj `/10x-contract` jako wyniku selekcji w tej lekcji.

### Ścieżki używane przez tę lekcję

- `context/changes/<change-id>/plan.md` — oczekiwany kontrakt implementacji
- `context/changes/<change-id>/reviews/` — wynik przeglądu
- `context/foundation/lessons.md` — powtarzające się lekcje

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "Ta zmiana jest zarchiwizowana. Zamiast tego otwórz nową zmianę za pomocą `/10x-new`."

<!-- END @przeprogramowani/10x-cli -->
