---
project: streak-board (package name `10x-astro-starter`)
checked_at: 2026-10-19T09:36:46Z
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
recommended_fixes: 6
---

# Health check — streak-board

Read-only audit of the project as it stands on `master` at `a9d5cdb` (2026-10-19). Nothing was modified.

## Dependency Health

### Lockfile

Status: present (`package-lock.json`)
Package manager: npm (Node 22.14.0 per `.nvmrc`; CI installs with `npm ci`)

### Security Audit

Tool: `npm audit --json`
Summary: 0 CRITICAL, 18 HIGH, 4 MODERATE, 0 LOW (22 advisories in total)
Direct vs transitive: 3 direct roots (`wrangler`, `shadcn`, `patch-package`, all development tooling), 19 transitive. No advisory touches code that ships in the deployed Worker bundle except `devalue` (pulled in by `astro` and `@astrojs/react`), whose fixed version is a plain `npm update` away.

#### HIGH findings

Grouped by the dependency path that pulls them in, because that decides the fix.

- **wrangler** 4.131.1 (direct, dev) — advisories reach it through `miniflare` and `@cloudflare/vite-plugin` (vulnerable range 4.16.0–4.148.0). Fix: `npm update wrangler` to ≥ 4.148.1; `fixAvailable: true`, no major bump.
- **undici** 7.29.0 — via `ai` → `@ai-sdk/provider-utils` (GHSA-rfgv-xxqx-mfg5 CVSS 7.5 WebSocket DoS, GHSA-w293-vg96-wgc3 CVSS 7.4 TLS validation bypass in BalancedPool, plus seven lower-scored DoS/caching advisories). The `ai` package is only used by the local review script (`npm run review`), not by the app. Fix: `npm update undici ai @openrouter/ai-sdk-provider`; `fixAvailable: true`.
- **devalue** 5.9.2 — via `astro` and `@astrojs/react` (GHSA-j22f-vq7h-c4qm CVSS 7.5, serializes shared memory, plus six unscored hardening advisories). This one is in the runtime path. Fix: `npm update devalue` (≥ 5.9.3 resolves it); `fixAvailable: true`.
- **source-map-js** 1.2.1 — via `@tailwindcss/node` and `astro` → `magicast` (GHSA-68fv-2mgg-jv7q CVSS 7.5, build-time DoS). Fix: `npm update source-map-js`.
- **http-cache-semantics** ≤ 4.2.0 — via `astro` (GHSA-ch52-4w7c-c8xp CVSS 7.5, cross-user cache disclosure; build-time fetch only). Fix: `npm update http-cache-semantics`.
- **sharp** 0.35.4 — via `astro` and `wrangler` (GHSA-wq5f-xc86-pv6w, librsvg CVE-2026-96889; image optimisation at build time). Fix: `npm update sharp` to ≥ 0.35.5.
- **brace-expansion** 1.1.18 / 5.0.9 — via `eslint-plugin-jsx-a11y` → `minimatch@3` and `@stryker-mutator/core` → `minimatch@10` (GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p CVSS 7.5 stack exhaustion). Lint/mutation tooling only. Fix: `npm update brace-expansion`.
- **@modelcontextprotocol/sdk** 1.12.0–1.30.1 — via `shadcn` (GHSA-6qxp-vccf-f47h CVSS 7.5, OAuth client credential leak). Only reachable if someone runs the shadcn MCP server locally. Fix: see the `shadcn` entry below.
- **shadcn** 4.21.0 (direct) with **ts-morph**, **@ts-morph/common**, **braces**, **micromatch**, **fast-glob** — npm's only "fix" is a downgrade to `shadcn@1.0.0`, which is not a fix. `shadcn` is a code generator run as `npx shadcn@latest add <name>` and never imported by the app, yet it sits in `dependencies`. Fix: remove it from `package.json` (`npm uninstall shadcn`) and keep using `npx shadcn@latest`, or move it to `devDependencies` and accept the advisories as tooling-only. Removing it clears 6 of the 18 HIGH entries.
- **patch-package** 8.0.1 (direct, dev) with **find-yarn-workspace-root** → `micromatch`/`braces` — npm's only "fix" is a downgrade to 6.0.7. The package exists for one patch (`patches/@stryker-mutator+vitest-runner+10.0.0.patch`). Fix: keep and accept (dev-only, runs at `npm install`), or check whether `@stryker-mutator/vitest-runner` has shipped the fix upstream and drop the patch plus `patch-package`.

#### MODERATE findings (log only)

- **fast-uri** 3.1.7 via `@astrojs/check` → `yaml-language-server` → `ajv` — host-case normalisation (GHSA-hrr3-gc8f-f4qj, 4.8). `npm update fast-uri`.
- **qs** 6.15.1 via `@stryker-mutator/core` → `typed-rest-client` and via `shadcn` — three DoS advisories (≤ 5.3). `npm update qs`.
- **smol-toml** 1.8.0 via `astro` and `@astrojs/cloudflare` — quadratic parse (GHSA-r4xh-jqrq-34v2, 5.3). `npm update smol-toml`.
- **typed-rest-client** 2.3.1 via `@stryker-mutator/core` — `npm update typed-rest-client`.

### Outdated Dependencies

Packages with major version gaps: 3 (each one major behind, none two or more)

- **@astrojs/react**: 6.0.5 → 7.1.0 (1 major)
- **typescript**: 6.0.3 → 7.0.2 (1 major)
- **lint-staged**: 16.4.0 → 17.6.0 (1 major)

None of these is urgent. The Astro core is current (7.3.2), as are Vitest 5, Tailwind 4 and React 19.

## Test Suite

Test runner: Vitest 5.0.3 (two projects: `unit` and `integration`) plus Playwright for e2e and Stryker for mutation testing
Tests found: 690 unit tests in 42 files; 38 integration/e2e spec files (33 Playwright tests in 12 files across desktop and phone projects)
Test execution: passing — `npx vitest run --project unit` ran green in 5.3 s during this check. The integration project and the RLS SQL scenarios need the local Supabase stack (`supabase start`) and were not run here.

Configuration: `vitest.config.ts`, `playwright.config.ts`, `stryker.config.json`
Framework: Vitest 5.0.3, @playwright/test, @stryker-mutator/core 10.0.0 (with a local patch to its Vitest runner)

Beyond the runners the repo has a smoke script (`scripts/smoke.mjs`, binds dashboard and settings markup), a migration guard, a generated-types freshness check (`npm run types:check`), a dependency-boundary check (`npm run deps`, dependency-cruiser) and a token-contrast script. An agent has several independent ways to verify its own change.

## CI/CD

Provider: GitHub Actions
Configuration: `.github/workflows/ci.yml` (plus `review.yml`, AI code review, and `claude-review.yml`)

| Stage      | Status | Notes                                                                                                                                                                                     |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint       | ✓      | `npm run lint` (ESLint) and `node scripts/token-contrast.mjs` in job `ci`                                                                                                                 |
| Test       | ✓      | `smoke` (production preview against local Supabase), `e2e` (Playwright, desktop + phone), `integration` (Vitest integration project, migration guard, types freshness, RLS SQL scenarios) |
| Build      | ✓      | `npm run build` in `ci`, `smoke`, `e2e`, `compat` and `release`                                                                                                                           |
| Type check | ✓      | `npx astro check` in job `ci`                                                                                                                                                             |
| Security   | ✗      | No `npm audit`, CodeQL, Dependabot or equivalent step; `.github/dependabot.yml` is absent                                                                                                 |

Also present: a `compat` job that runs the currently deployed commit's smoke against the PR's migrations (release compatibility gate) and a gated `release` job (migrations, `wrangler deploy`, live check, `production` tag). Documentation-only merges skip the code jobs by design.

## Configuration

### High severity

None. `tsconfig.json` extends `astro/tsconfigs/strict` (`strict: true`), `.gitignore` covers `.env`, `.env.production`, `.dev.vars`, `dist/` and `node_modules/`.

### Medium severity

None. ESLint (`eslint.config.js`, flat config with Astro, React, hooks, a11y and Prettier plugins) and Prettier (`.prettierrc.json`, Astro and Tailwind plugins) are configured and wired to pre-commit through husky and lint-staged.

### Low severity

- **`.editorconfig`** — missing. Prettier already enforces formatting on commit, so this only matters for editors without the Prettier extension. Fix: add a four-line `.editorconfig` (`root = true`, `[*]`, `indent_style = space`, `indent_size = 2`, `end_of_line = lf`, `insert_final_newline = true`).

Present: `.env.example`, `.nvmrc`, `CLAUDE.md`, `AGENTS.md`, `.dependency-cruiser.cjs`.

## Stack Assessment Cross-Reference

No stack-assessment.md found. Run /10x-stack-assess for quality-gate analysis. The project already has what that assessment usually asks compensation for: strict TypeScript, type checking in CI, generated database types compared in CI, and routing conventions in `CLAUDE.md`.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Update the transitive advisories that have a non-breaking fix

**Impact**: Clears the runtime-path `devalue` advisory and most of the HIGH count, so the next `npm audit` an agent runs is signal, not noise. Builds and lint stop depending on vulnerable `brace-expansion`, `source-map-js`, `sharp` and `undici`.
**Severity**: high
**Effort**: moderate (15–30 min, mostly re-running the suites)
**Fix**:

```
npm update wrangler devalue undici sharp source-map-js http-cache-semantics brace-expansion fast-uri qs smol-toml typed-rest-client
npm run lint && npm run test:unit && npm run build
npm audit
```

Do not run `npm audit fix --force`; it would downgrade `shadcn` and `patch-package` to pre-release-era versions. Review the `package-lock.json` diff before committing.

### 2. Take `shadcn` out of `dependencies`

**Impact**: The CLI is never imported at runtime, so it inflates the production dependency tree and carries 6 HIGH advisories (`ts-morph`, `braces`, `micromatch`, `fast-glob`, `@modelcontextprotocol/sdk`) that npm cannot fix. Removing it keeps the advisory list honest.
**Severity**: medium
**Effort**: quick (< 5 min) plus one `npm ci` to confirm `npx shadcn@latest add --dry-run <name>` still works
**Fix**:

```
npm uninstall shadcn
```

Then update the `## UI` section of `CLAUDE.md` if it should say the CLI is fetched by `npx` on demand (it already uses `npx shadcn@latest`, so this may need no wording change).

### 3. Decide on `patch-package`

**Impact**: It runs on every `npm install` (including CI) and pulls a `micromatch`/`braces` chain with HIGH advisories whose only npm "fix" is a major downgrade. One patch depends on it.
**Severity**: low
**Effort**: moderate (15–30 min to check upstream)
**Fix**: open `patches/@stryker-mutator+vitest-runner+10.0.0.patch`, check whether a newer `@stryker-mutator/vitest-runner` includes the change, and if so `npm install -D @stryker-mutator/vitest-runner@latest @stryker-mutator/core@latest`, delete the patch, `npm uninstall patch-package` and remove the `postinstall` script. Otherwise accept the advisories as dev-only and note the decision in `context/foundation/owner-decisions.md`.

### 4. Add a security stage to CI

**Impact**: Today advisories surface only when someone runs `npm audit` by hand. A weekly Dependabot or an `npm audit --audit-level=high` step makes drift visible to the agent in PR checks.
**Severity**: medium
**Effort**: quick (< 5 min) for Dependabot; moderate if `npm audit` becomes a required check (it will fail on today's state until fix 1 lands)
**Fix**: add `.github/dependabot.yml` with a weekly `npm` update schedule for `/`, grouped by minor/patch to limit PR noise. Optionally append `- run: npm audit --audit-level=high --omit=dev` to the `ci` job once fix 1 is merged; `--omit=dev` keeps dev-only tooling advisories from blocking releases.

### 5. Plan the three major upgrades

**Impact**: `@astrojs/react` 7, TypeScript 7 and lint-staged 17 are each one major behind. The gap is small now; it widens quietly.
**Severity**: low
**Effort**: significant (> 1 hour) for TypeScript 7 (new compiler), moderate for the other two
**Fix**: one PR each, starting with `lint-staged` (lowest risk), then `@astrojs/react` (check React 19 island behaviour against the kitchen sink and `scripts/ui-screenshots.mjs`), TypeScript last after reading its 7.0 migration notes and running `npx astro check`.

### 6. Add `.editorconfig`

**Impact**: Convenience for editors without a Prettier integration; Prettier on commit already guarantees the committed result.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: create `.editorconfig` with `root = true`, `[*]`, `indent_style = space`, `indent_size = 2`, `end_of_line = lf`, `insert_final_newline = true`, `charset = utf-8`.

### Addressed in upcoming lessons (Category B)

None outstanding. CI/CD, deployment and the agent instruction files (`CLAUDE.md`, `AGENTS.md`) are already in place, so this project is past the stage at which those lessons would have added them.

## Summary

Health status: needs-attention

The project is in strong operational shape for agent work: a pinned lockfile, strict TypeScript with type checking in CI, 690 passing unit tests plus integration, RLS, smoke, mutation and 33 Playwright tests, lint and formatting enforced on commit and in CI, a release compatibility gate and a gated deploy. The only material gap is dependency hygiene: 18 HIGH advisories, all transitive or in development tooling except `devalue`, most of which a single `npm update` clears, with the rest traceable to `shadcn` living in production dependencies and to `patch-package`. CI has no security scanning stage, which is why they accumulated unnoticed.

Next step: run fix 1 and fix 2 in one PR, confirm `npm audit` drops to the `patch-package` chain only, then add Dependabot (fix 4). After that the project reads as healthy and no change to how agents work here is needed.
