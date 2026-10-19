# Repository Guidelines

StreakBoard: an Astro 7 SSR app with React 19 islands, Tailwind 4, shadcn/ui and Supabase (auth, Postgres with RLS), deployed to Cloudflare Workers. `@CLAUDE.md` is the authoritative architecture and conventions reference; this file is the short route into it.

## Hard rules

- Never hand-edit `src/types.ts`; regenerate it from the local schema (`@CLAUDE.md`, Conventions) or `npm run types:check` fails in CI.
- API routes under `src/pages/api/` export uppercase `GET`/`POST` and `const prerender = false`.
- No literal colours, palette classes or arbitrary px/rem values in view files; use the tokens in `src/styles/global.css`. ESLint enforces this; reword prose rather than weaken the rule.
- Import `cn` from `@/lib/utils`, never from the `cn` package. No `asChild` on React components rendered from `.astro`; no `"use client"`.
- Every new table in `supabase/migrations/` ships with RLS and per-operation, per-role policies. Add first, remove or rename in a later release: the `compat` CI job runs the deployed commit's smoke against your migrations.
- Dashboard or settings markup must keep the invariants of `scripts/smoke.mjs`, or change smoke in the same PR.
- A change to the data model, visibility, deletion, cookies or providers updates `src/pages/privacy.astro` in the same PR.
- In a git worktree never run `git checkout master` or `git pull`; base branches on `origin/master`. One session at a time runs the local Supabase stack.

## Project structure

`src/pages/` (routes, API), `src/components/` (`ui/` shadcn, feature folders, `hooks/`), `src/lib/` (services), `src/middleware.ts` (auth and nickname gates, security headers), `src/worker.ts` (Worker entry, reminder cron), `supabase/migrations/`, `tests/{unit,integration,e2e}/`, `context/` (PRD, roadmap, test plan, change folders). Full map: `@README.md` (Project Structure).

## Commands

- `npm run lint`, `npm run format`: ESLint (`@eslint.config.js`) and Prettier (`@.prettierrc.json`).
- `npm run test:unit`: Vitest unit project, no stack needed. Run before every push.
- `npm test`: unit plus integration against a running `supabase start`.
- `npm run smoke`, `test:rls`, `guard:migrations`, `deps`: the other CI gates, see `@README.md` (Available Scripts, Tests).
- `npx playwright test`: e2e specs in `tests/e2e/`, projects `chromium` and `mobile-chromium`.

## Testing

Unit tests are `tests/unit/*.test.ts`, integration `tests/integration/`, browser risks `tests/e2e/*.spec.ts` named after a risk in `@context/foundation/test-plan.md`. One file: `npx vitest run --project unit tests/unit/<file>`. Mutation testing only on touched code; do not chase 100%.

## Commits and pull requests

Conventional Commits with a scope: `fix(layout): ...`, `docs(roadmap): ...`. Husky lints and formats staged files. PRs target `master` and need `ci`, `smoke`, `e2e`, `integration`, `compat` and the AI review green; a merge deploys through the gated `release` job.

## Secrets

`SUPABASE_URL`, `SUPABASE_KEY`, `CONTACT_EMAIL`, `REMINDER_SECRET` live in git-ignored `.env` / `.dev.vars` (template `@.env.example`). Never commit or log them.
