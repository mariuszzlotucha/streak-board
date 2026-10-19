---
project: streak-board (package name `10x-astro-starter`)
checked_at: 2026-10-19T10:00:17Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 18
  moderate: 4
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 9
---

# Health check — streak-board

Read-only audit of the project on branch `docs/agents-md-health-check` (same code as `master` at `a9d5cdb`, 2026-10-19). Second, deeper pass: it adds a dry-run preview of `npm audit fix`, GitHub's Dependabot view of the same tree, a check of the nested `packages/code-reviewer/evals` lockfile, a comparison of documented and actually-read environment variables, and a local run of every CI gate and of the full test suite against the running local Supabase stack. Nothing in the project was modified; `package.json` and `package-lock.json` are byte-identical to before the run.

## Dependency Health

### Lockfile

Status: present (`package-lock.json`, lockfile v3) plus a second, independent lockfile at `packages/code-reviewer/evals/package-lock.json` (private package `code-reviewer-evals`, one devDependency `promptfoo`, not a workspace, not installed by CI)
Package manager: npm (CI installs with `npm ci`; Node 22 in CI and `.nvmrc`, see Configuration for the local mismatch)

### Security Audit

Tool: `npm audit --json` at the root, `npm audit --json` in `packages/code-reviewer/evals`, and GitHub's Dependabot alerts (`GET /repos/{owner}/{repo}/dependabot/alerts?state=open`) as a second source
Summary (root): 0 CRITICAL, 18 HIGH, 4 MODERATE, 0 LOW (22 packages flagged; npm counts packages, GitHub counts advisories, so the two totals differ)
Summary (nested evals lockfile): 0 CRITICAL, 10 HIGH, 0 MODERATE, 0 LOW, all through `promptfoo` 0.124.1, which is already the latest release
Summary (GitHub, both lockfiles): 31 open alerts, 15 high, 12 medium, 4 low; 29 on the root lockfile, 2 on the evals lockfile
Direct vs transitive: 3 direct roots at the root (`wrangler` and `patch-package` in devDependencies, `shadcn` in dependencies), 19 transitive. GitHub tags 28 of the 31 alerts as `runtime` scope, because the packages that pull them in sit in `dependencies` (see Dependency scoping below); only `devalue` actually ships in the deployed Worker bundle (found in 2 chunks of `dist/server`, Astro's serializer).

#### What a plain `npm audit fix` would do (dry run, nothing written)

`npm audit fix --dry-run --json` resolves 32 changes, 6 additions and 17 removals, all inside the semver ranges `package.json` already allows (so it is equivalent to `npm update` on those packages, no major bumps): `wrangler` 4.131.1 → 4.151.0, `devalue` 5.9.2 → 5.9.4, `sharp` 0.35.4 → 0.35.5, `source-map-js` 1.2.1 → 1.2.2, `http-cache-semantics` 4.2.0 → 4.3.0, `brace-expansion` 1.1.18 → 1.1.21 and 5.0.9 → 5.0.12, `smol-toml` 1.8.0 → 1.9.1, `fast-uri` 3.1.7 → 3.1.8, `undici` 7.29.0 → 7.29.1, `@modelcontextprotocol/sdk` 1.30.1 → 1.32.1, `miniflare` → 5.20261012.0-beta, `@cloudflare/vite-plugin` 1.54.8 → 1.64.0, `shadcn` 4.21.0 → 4.22.1. The dry run does not re-audit the resulting tree reliably, so the post-fix `npm audit` has to be read after the real run. By `fixAvailable` the only advisories expected to survive are the two chains whose "fix" is a major downgrade: `shadcn` (`ts-morph`, `@ts-morph/common`, `braces`, `micromatch`, `fast-glob`) and `patch-package` (`find-yarn-workspace-root` → `micromatch`, `braces`).

#### HIGH findings (root)

Grouped by the dependency path that pulls them in, because that decides the fix.

- **devalue** 5.9.2 — via `astro` 7.3.2 and `@astrojs/react` 6.0.5 (GHSA-j22f-vq7h-c4qm CVSS 7.5, `stringify`/`uneval` serialize shared memory; GHSA-x5rw-q4pp-hg5g high; plus five medium/low hardening advisories). **The only advisory in the runtime path**: `devalue` is bundled into `dist/server/chunks/` (2 files). Fix: `npm update devalue` → 5.9.4.
- **wrangler** 4.131.1 (direct, dev) — inherits through `miniflare` and `@cloudflare/vite-plugin` (vulnerable range 4.16.0–4.148.0); `package.json` allows `^4.131.1`, wanted is 4.151.1. Fix: `npm update wrangler`.
- **undici** 7.29.0 — only the copy under `ai` → `@ai-sdk/provider-utils` (GHSA-rfgv-xxqx-mfg5 CVSS 7.5 WebSocket DoS, GHSA-w293-vg96-wgc3 CVSS 7.4 TLS validation bypass in BalancedPool, plus eight medium/low). The second copy, `undici` 8.10.2 under `astro` → `unifont`, is outside the vulnerable range. `ai` is used only by `packages/code-reviewer` (the `npm run review` script), never by `src/`. Fix: `npm update undici` → 7.29.1.
- **source-map-js** 1.2.1 — via `@tailwindcss/node` and `astro` → `magicast` (GHSA-68fv-2mgg-jv7q CVSS 7.5, build-time DoS). Fix: `npm update source-map-js` → 1.2.2.
- **http-cache-semantics** 4.2.0 — via `astro` (GHSA-ch52-4w7c-c8xp CVSS 7.5, cross-user cache disclosure; build-time fetch only). Fix: `npm update http-cache-semantics` → 4.3.0.
- **sharp** 0.35.4 — via `astro` and `wrangler` (GHSA-wq5f-xc86-pv6w, librsvg CVE-2026-96889; image optimisation at build time, not in the Worker bundle). Fix: `npm update sharp` → 0.35.5.
- **brace-expansion** 1.1.18 / 5.0.9 — via `eslint-plugin-jsx-a11y` → `minimatch@3` and `@stryker-mutator/core` → `minimatch@10` (GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p CVSS 7.5 stack exhaustion). Lint and mutation tooling only. Fix: `npm update brace-expansion`.
- **@modelcontextprotocol/sdk** 1.30.1 — via `shadcn` (GHSA-6qxp-vccf-f47h CVSS 7.5, OAuth client credential leak). Reachable only if someone runs the shadcn MCP server locally. Fix: `npm update @modelcontextprotocol/sdk` → 1.32.1, or remove `shadcn` (below).
- **shadcn** 4.21.0 (direct, listed in `dependencies`) with **ts-morph**, **@ts-morph/common**, **braces**, **micromatch**, **fast-glob** — npm's only "fix" is a downgrade to `shadcn@1.0.0`, which is not a fix. `shadcn` is a code generator run as `npx shadcn@latest add <name>`; nothing in `src/` imports it (the only matches are two CSS comments in `src/styles/global.css`). Fix: `npm uninstall shadcn` and keep using `npx shadcn@latest`. Clears 6 of the 18 HIGH entries.
- **patch-package** 8.0.1 (direct, dev) with **find-yarn-workspace-root** → `micromatch`/`braces` — npm's only "fix" is a downgrade to 6.0.7. It exists for one patch, `patches/@stryker-mutator+vitest-runner+10.0.0.patch`, which changes the test-name join from `' '` to `' > '` in two files of the runner (the Vitest 5 test-id format). Upstream `@stryker-mutator/vitest-runner` is still 10.0.0 (last published 2026-08-14), so the patch cannot be dropped yet. Fix: accept as dev-only (runs at `npm install`, never deployed) and record the decision; re-check when Stryker 10.1 or 11 ships.

#### HIGH findings (nested `packages/code-reviewer/evals` lockfile)

- **promptfoo** 0.124.1 (direct, dev, already the latest) pulls `basic-ftp`, `braces`, `chokidar`, `get-uri`, `jks-js`, `node-forge`, `nunjucks`, `pac-proxy-agent`, `proxy-agent` with HIGH advisories; npm's only "fix" is a downgrade to 0.116.7. The package has no `node_modules` on this machine, is not installed by any CI job, and is run by hand for paid eval sessions only. Fix: accept, and tell Dependabot to ignore that directory, or move the evals to a one-off `npx promptfoo@latest` and delete the lockfile.

#### MODERATE findings (root, log only)

- **fast-uri** 3.1.7 via `@astrojs/check` → `yaml-language-server` → `ajv` (GHSA-hrr3-gc8f-f4qj, 4.8). `npm update fast-uri` → 3.1.8.
- **qs** 6.15.1 via `@stryker-mutator/core` → `typed-rest-client`, and 6.16.0 via `shadcn` (three DoS advisories ≤ 5.3). `npm update qs`.
- **smol-toml** 1.8.0 via `astro` and `@astrojs/cloudflare` (GHSA-r4xh-jqrq-34v2, 5.3). `npm update smol-toml` → 1.9.1.
- **typed-rest-client** 2.3.1 via `@stryker-mutator/core`. `npm update typed-rest-client`.

#### Dependency scoping

Eight packages sit in `dependencies` although nothing under `src/` imports them: `shadcn` (CLI), `ai`, `@openrouter/ai-sdk-provider` and `zod` (imported only by `packages/code-reviewer/*.ts`, run through `tsx`), `@astrojs/check` (the `astro check` CLI), `@types/react`, `@types/react-dom`, and `@eslint/config-helpers` (imported nowhere; `eslint.config.js` imports `defineConfig` from `eslint/config`, which ESLint ships itself). For a Vite-bundled Worker this changes nothing in the deployed artifact, but it does two things to the audit signal: GitHub labels the alerts of those packages `runtime`, and `npm audit --omit=dev` cannot filter them out. `yaml` and `tsx` are correctly in devDependencies.

### Outdated Dependencies

Packages outdated in any way: 24. Packages where the lockfile is behind the range `package.json` allows (`current != wanted`, so a plain `npm update` moves them): 22, among them `astro` 7.3.2 → 7.4.0, `wrangler` 4.131.1 → 4.151.1, `@playwright/test` 1.63.0 → 1.64.1, `eslint` 10.10.0 → 10.13.0, `vitest` 5.0.3 → 5.0.5, `supabase` 2.117.0 → 2.121.0.

Packages with major version gaps: 3 (each one major behind, none two or more)

- **@astrojs/react**: 6.0.5 → 7.1.0 (1 major)
- **typescript**: 6.0.3 → 7.0.2 (1 major)
- **lint-staged**: 16.4.0 → 17.6.0 (1 major)

## Test Suite

Test runner: Vitest 5.0.3 (two projects, `unit` and `integration`) plus Playwright for e2e, Stryker 10.0.0 for mutation testing (with the local patch above) and SQL RLS scenarios
Tests found: 66 Vitest files, 1162 tests (unit 42 files / 690 tests, integration 24 files / 472 tests); 33 Playwright tests in 12 files across the `chromium` and `mobile-chromium` projects; 405 RLS assertions
Test execution: passing — during this check `npm test` ran all 66 files green in 15 s against the running local Supabase stack, `npm run test:rls` passed all 405 assertions, and `npx vitest run --project unit` alone passed 690 tests in 5.3 s. The Playwright suite was listed (33 tests) but not run: it needs a production build, the preview server and the E2E account, and CI runs it on every code PR. Chromium 1243 is installed locally for it.

Configuration: `vitest.config.ts`, `playwright.config.ts`, `stryker.config.json`; `tests/setup/global-setup.ts` reads the stack from `TEST_SUPABASE_*` or, when they are unset, from `npx supabase status -o env`, so the integration project needs no extra configuration beyond `supabase start`.
Framework: Vitest 5.0.3, @playwright/test 1.63.0, @stryker-mutator/core 10.0.0

Local CI gates, run here and all green: `npm run lint` (34 s), `node scripts/token-contrast.mjs`, `npx astro check` (14 s), `npm run deps` (dependency-cruiser), `npm run guard:migrations`, `npm run types:check` (generated types fresh against the local schema). An agent has seven independent ways to verify its own change without pushing.

## CI/CD

Provider: GitHub Actions
Configuration: `.github/workflows/ci.yml` (jobs `changes`, `ci`, `smoke`, `e2e`, `integration`, `compat`, `release`), `.github/workflows/review.yml` (AI code review), `.github/workflows/claude-review.yml`

| Stage      | Status | Notes                                                                                                                                                                                                                                                         |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint       | ✓      | `npm run lint` and `node scripts/token-contrast.mjs` in job `ci`                                                                                                                                                                                              |
| Test       | ✓      | `smoke` (production preview against local Supabase), `e2e` (Playwright, desktop and phone), `integration` (Vitest integration project, migration guard, types freshness, RLS SQL scenarios)                                                                   |
| Build      | ✓      | `npm run build` in `ci`, `smoke`, `e2e`, `compat` and `release`                                                                                                                                                                                               |
| Type check | ✓      | `npx astro check` in job `ci`                                                                                                                                                                                                                                 |
| Security   | ✗      | No `npm audit`, CodeQL or Dependabot version updates; `.github/dependabot.yml` absent; repository setting `dependabot_security_updates` is `disabled`. Present on the GitHub side: Dependabot alerts (enabled), secret scanning and push protection (enabled) |

Branch protection, read from the repository ruleset for `master`: deletion and non-fast-forward blocked, required status checks `integration`, `ai-review`, `ci`, `smoke`, `e2e`, `compat`. The last four `master` runs (2026-10-18 to 2026-10-19) all succeeded. The `compat` job runs the currently deployed commit's smoke against the PR's migrations (release compatibility gate); the gated `release` job applies migrations, runs `wrangler deploy`, checks the live site and moves the `production` tag. Documentation-only merges skip the code jobs by design.

## Configuration

### High severity

None. `tsconfig.json` extends `astro/tsconfigs/strict` (`strict: true`); `.gitignore` covers `.env`, `.env.production`, `.dev.vars`, `dist/`, `node_modules/` and the generated report folders (`git status` is clean after a full build and test run).

### Medium severity

- **`engines` in `package.json` and `.npmrc`** — missing. `.nvmrc` and CI pin Node 22, but the shell this check ran in has Node 24.21.0 and nothing warned; an agent on the wrong Node gets the first signal from a CI failure. Fix: add `"engines": { "node": "22.x" }` to `package.json` and an `.npmrc` with `engine-strict=true`, so `npm ci` refuses the wrong runtime, and run `nvm use` before a session.
- **`.env.example` incomplete** — it documents `SUPABASE_URL`, `SUPABASE_KEY`, `CONTACT_EMAIL`, `E2E_USERNAME`, `E2E_PASSWORD`, but the `env.schema` in `astro.config.mjs` also declares `REMINDER_SECRET`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and `wrangler preview` reads `.dev.vars`, for which there is no example file. The README's "Reminder secrets" section covers them in prose. Fix: add the three keys to `.env.example` with a comment pointing at README "Reminder secrets", and add `.dev.vars.example` with the same keys plus `SENTRY_DSN` (Worker secret, README "Observability"). `TEST_SUPABASE_*` need no entry: the test setup derives them from `supabase status`.

### Low severity

- **`.editorconfig`** — missing. Prettier runs on commit, so this only matters for editors without the Prettier extension. Fix: `root = true`, `[*]`, `indent_style = space`, `indent_size = 2`, `end_of_line = lf`, `insert_final_newline = true`, `charset = utf-8`.

Present: `eslint.config.js` (flat config with Astro, React, hooks, a11y and Prettier plugins, plus the project's own no-literal and no-`cn`-package rules), `.prettierrc.json`, `.nvmrc`, `.env.example`, `.dependency-cruiser.cjs`, `.husky/pre-commit` (lint-staged), `CLAUDE.md`, `AGENTS.md`.

## Stack Assessment Cross-Reference

No stack-assessment.md found. Run /10x-stack-assess for quality-gate analysis. The project already has what that assessment usually asks compensation for: strict TypeScript, type checking in CI, database types generated and compared in CI, and routing conventions in `CLAUDE.md` and `AGENTS.md`.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Update the transitive advisories that have an in-range fix

**Impact**: Clears the one runtime-path advisory (`devalue`) and most of the HIGH count, so the next `npm audit` an agent runs is signal, not noise. The dry run shows every move stays inside the ranges `package.json` already allows.
**Severity**: high
**Effort**: moderate (15–30 min, mostly re-running the suites)
**Fix**:

```
npm update wrangler devalue undici sharp source-map-js http-cache-semantics brace-expansion fast-uri qs smol-toml typed-rest-client @modelcontextprotocol/sdk
npm run lint && npm run test:unit && npm run build && npm audit
```

Or, equivalently for these packages, `npm audit fix` without `--force`. Never `npm audit fix --force`: it would downgrade `shadcn` to 1.0.0 and `patch-package` to 6.0.7. Read the `package-lock.json` diff before committing; expect about 55 lines of package moves.

### 2. Remove `shadcn` and move the other tooling out of `dependencies`

**Impact**: Removes the 6 HIGH entries npm cannot fix, and makes GitHub's `runtime`/`development` scope and `npm audit --omit=dev` truthful, so a future security step in CI can block on runtime advisories only.
**Severity**: medium
**Effort**: quick (< 5 min) plus one `npm ci`
**Fix**:

```
npm uninstall shadcn @eslint/config-helpers
npm install -D ai @openrouter/ai-sdk-provider zod @astrojs/check @types/react @types/react-dom
npx shadcn@latest add --dry-run button
```

The last line proves the CLI still works through `npx`. `CLAUDE.md` already says `npx shadcn@latest add`, so no wording change is needed there.

### 3. Record the `patch-package` decision

**Impact**: Its chain (`find-yarn-workspace-root` → `micromatch`/`braces`) carries HIGH advisories whose only npm "fix" is a major downgrade, and it runs on every `npm install` in CI. Upstream has not shipped the test-name fix the patch provides.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add a line to `context/foundation/owner-decisions.md`: keep `patch-package` and the Stryker patch, dev-only, re-check when `@stryker-mutator/vitest-runner` publishes anything newer than 10.0.0 (`npm view @stryker-mutator/vitest-runner version`).

### 4. Add a security stage

**Impact**: Today advisories surface only when someone runs `npm audit` by hand; the alerts GitHub already raises reach nobody's PR. With fixes 1 and 2 merged, a blocking check on runtime advisories becomes cheap.
**Severity**: medium
**Effort**: quick (< 5 min) for the two files; moderate if the audit step becomes a required check
**Fix**: add `.github/dependabot.yml` (`package-ecosystem: npm`, `directory: /`, weekly, groups for minor and patch; a second entry for `/packages/code-reviewer/evals` with `open-pull-requests-limit: 0` to keep the alerts without PRs), enable "Dependabot security updates" in the repository's Code security settings (currently disabled), and append `- run: npm audit --audit-level=high --omit=dev` to the `ci` job after fix 2.

### 5. Pin the Node runtime

**Impact**: The local shell runs Node 24 while CI and `.nvmrc` say 22; today nothing stops an agent from installing or testing on the wrong major.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: `"engines": { "node": "22.x" }` in `package.json`, `.npmrc` with `engine-strict=true`, and `nvm use` (or `fnm use`) at the start of a session. CI already uses `node-version: 22`.

### 6. Complete the environment examples

**Impact**: A new agent or machine setting up the reminders locally has to find three secret names in README prose; a missing key fails only at runtime.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add `REMINDER_SECRET=`, `VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=` to `.env.example` with a comment pointing at README "Reminder secrets", and create `.dev.vars.example` with those plus `CONTACT_EMAIL=`, `SUPABASE_URL=`, `SUPABASE_KEY=`, `SENTRY_DSN=`.

### 7. Plan the three major upgrades

**Impact**: `@astrojs/react` 7, TypeScript 7 and lint-staged 17 are each one major behind. The gap is small now; it widens quietly.
**Severity**: low
**Effort**: significant (> 1 hour) for TypeScript 7 (new compiler), moderate for the other two
**Fix**: one PR each, starting with `lint-staged` (lowest risk), then `@astrojs/react` (check the React islands in the kitchen sink and `scripts/ui-screenshots.mjs`), TypeScript last after reading its 7.0 migration notes and running `npx astro check`. Trigger: a gap of two majors, or Astro dropping support for TypeScript 6.

### 8. Decide what to do with the evals lockfile

**Impact**: 10 HIGH advisories and 2 of GitHub's 31 alerts come from a tool that is never installed by CI or shipped; they still inflate every number an agent sees.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: either keep `packages/code-reviewer/evals/package-lock.json` and exclude the directory from Dependabot PRs (fix 4), or delete the lockfile and run the evals with `npx promptfoo@latest` so there is nothing to audit.

### 9. Add `.editorconfig`

**Impact**: Convenience for editors without a Prettier integration; Prettier on commit already guarantees the committed result.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: create `.editorconfig` with `root = true`, `[*]`, `indent_style = space`, `indent_size = 2`, `end_of_line = lf`, `insert_final_newline = true`, `charset = utf-8`.

### Addressed in upcoming lessons (Category B)

None outstanding. CI/CD, deployment and the agent instruction files (`CLAUDE.md`, `AGENTS.md`) are already in place, so this project is past the stage at which those lessons would have added them.

## Summary

Health status: needs-attention

Operationally the project is as strong as a solo project gets: pinned lockfile, strict TypeScript with type checking in CI, 1162 Vitest tests plus 405 RLS assertions and 33 Playwright tests, lint, format and dependency-boundary rules enforced on commit and in CI, six required checks on `master`, a release compatibility gate and a gated deploy. All six local gates and the full suite ran green during this check. The only material gap is dependency hygiene: 18 HIGH advisories at the root and 10 in the evals lockfile, with exactly one (`devalue`) in the deployed bundle; a plain in-range `npm update` clears most of them, removing `shadcn` from `dependencies` clears six more, and the rest trace to `patch-package` and `promptfoo`, whose upstreams have no fix. Three smaller gaps compound it: no `engines` pin while the local shell runs Node 24 against a Node 22 CI, an `.env.example` missing the reminder secrets, and no security stage in CI even though GitHub's alerts are on.

Next step: fixes 1, 2, 5 and 6 fit one code PR (it changes `package-lock.json`, so it runs the full CI); then fix 4 (Dependabot config and the repository setting) and the two decisions (3 and 8). After that the project reads as healthy and nothing about how agents work here needs to change.
