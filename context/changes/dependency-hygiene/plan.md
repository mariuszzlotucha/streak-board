# Dependency hygiene (S-23) Implementation Plan

## Overview

Clean up the dependency tree and the runtime pin after the health check of 2026-10-19, as roadmap slice S-23 (quality, anchor MS-04) and open-items §6 ask, without changing anything a user sees:

- every advisory with an in-range fix leaves the root tree, `@eslint/config-helpers` leaves `package.json`, and seven tooling packages, `shadcn` among them, move to `devDependencies` (6.1);
- the Node runtime is pinned so a machine on another major learns it from npm itself (6.7), with `.editorconfig` (6.5) and complete environment examples (6.8);
- new advisories reach a weekly Dependabot PR and a blocking audit step in the `ci` job (6.2).

The owner's decisions 6.3 (keep `patch-package` and the Stryker patch, dev-only) and 6.9 (keep the evals lockfile, no Dependabot PRs for it) are recorded in `context/foundation/owner-decisions.md` and stay as they are. The four decisions of this planning session (`devEngines` instead of `engine-strict`, a blocking audit step, lockfile-only Dependabot PRs, security updates on for the root manifest only) are recorded there too.

Sources: `context/changes/dependency-hygiene/research.md` (2026-10-19, at `77b6784`), `context/foundation/open-items.md` §6, `context/foundation/health-check.md` (fixes 1, 2, 4, 5, 6, 9), `context/foundation/roadmap.md:113-125`, `context/changes/dependency-hygiene/reviews/plan-review.md` (F1 and F2 applied 2026-10-19).

## Current State Analysis

- **The tree.** `npm audit --json` at `77b6784` flags 22 packages (18 high, 4 moderate, 0 critical); `npm audit --omit=dev --audit-level=high` exits 1 with 16 high and 2 moderate across 18 packages, six of them (`shadcn`, `ts-morph`, `@ts-morph/common`, `fast-glob`, `micromatch`, `braces`) only because `shadcn` sits in `dependencies` (`package.json:47`) and npm's only "fix" for it is a major downgrade. GitHub lists 31 open Dependabot alerts (29 root, 2 evals; 28 scoped `runtime`). `package.json` and `package-lock.json` last changed in `d09ab4e` (2026-10-16).
- **The Cloudflare chain pins the vulnerable copies.** `@astrojs/cloudflare@14.3.1` → `@cloudflare/vite-plugin@1.54.8` pins `wrangler 4.131.1` and `miniflare 5.20260911.0-alpha` exactly, and that miniflare pins `undici 7.29.0` and `sharp 0.35.4` exactly (research §2). The open-items 6.1 command names `wrangler undici sharp` but not the plugin, so on its own it leaves those copies in place. `@cloudflare/vite-plugin@1.64.0` (newest in the adapter's `^1.53.0`, first outside the advisory range) pins `wrangler 4.151.0` and `miniflare 5.20261012.0-beta`, which pins `undici 7.29.1` and `sharp 0.35.5`.
- **Eight tooling packages sit in `dependencies`** (`package.json:26,30,32,37,38,39,47,51`). `ai`, `@openrouter/ai-sdk-provider` and `zod` are imported only by `packages/code-reviewer/` (seven files) and one unit test; `@astrojs/check` runs only as `npx astro check` (`ci.yml:68`); `@eslint/config-helpers` is imported nowhere (`eslint.config.js:3` takes `defineConfig` from `eslint/config`, and `eslint@10.10.0` depends on the package itself). `shadcn` is run as `npx shadcn@latest add` and imported by no code, but `src/styles/global.css:12` imports its stylesheet (`@import "shadcn/tailwind.css"`, since `ccffaf4`), whose `data-open:`/`data-closed:` variants `src/components/ui/alert-dialog.tsx:24,46` use: a build-time consumer, so the package stays and moves to `devDependencies` (plan review F1; research §3 and health-check fix 2 called it "comments only"). Every CI job and the reviewer action run plain `npm ci`, so devDependencies are present wherever they are needed; `.dependency-cruiser.cjs` and ESLint have no rule about dependency sections. `npm install -D <name>` without a spec resolves `latest` (it would move `ai` 7.0.139 → 7.0.143 and rewrite ranges), so the move is a hand edit.
- **Node.** `.nvmrc` says `22.14.0`; the six `ci.yml` jobs that set up Node use `node-version: 22` (newest 22.x), the `ai-reviewer` action installs on `.nvmrc`'s exact version (`action.yml:97-100`); this machine runs Node 24.21.0 (npm 11.19.0) with no Node 22 installed under nvm and nothing that switches on `.nvmrc`. `package.json` has no `engines` or `devEngines`, there is no `.npmrc`. In the current lockfile 40 non-optional packages claim a Node above 22.14.0 (37 `@babel/*` under Stryker `^22.18.0`, `eslint-plugin-astro`/`astro-eslint-parser` `^22.22.3`, a production-path `undici` `>=22.19.0`), so `engine-strict=true` with today's `.nvmrc` would fail `npm ci` in the required `ai-review` check (research §4). Node 22.23.3 is the newest 22.x (`nvm ls-remote`: "Latest LTS: Jod"); on it no non-optional package fails. `devEngines` (npm ≥ 10.9.0; `.nvmrc`'s Node ships 10.9.2+) was probed on this machine: with `runtime: { name: node, version: 22.x, onFail: error }`, npm 11.19 on Node 24 refuses `npm run`, `npm install` and `npx` with `EBADDEVENGINES` ("Invalid semver version "22.x" does not match "v24.21.0" for "runtime""). With `onFail: warn` the same commands print the warning and continue (probed). Dependabot's npm updater runs on Node 24 with npm 12.2.0 (dependabot-core `npm_and_yarn/Dockerfile`, read 2026-10-19) and reads neither `.nvmrc` nor `engines`; it passes `--force` on `npm install`, `npm update` and `npm audit fix`, which npm turns into a warning even under `onFail: error` (`lib/base-cmd.js`, `checkDevEngines`), while its unforced peer check `npm install --dry-run=true` fails and is rescued as "no conflicts" (plan review F2).
- **Gates.** `ci` (`ci.yml:53-72`: `npm ci`, `astro sync`, lint, token contrast, `astro check`, build) holds a required check. `ai-review` (`review.yml`) reviews the code diff without `context/`, Markdown and both lockfiles (`review.yml:144`), needs `OPENROUTER_API_KEY` from Actions secrets (`:152`), and reports `skipped` on an empty diff. A Dependabot-triggered run gets Dependabot secrets only (the repository has 0) and a read-only token unless the workflow's `permissions` key raises it (`review.yml:49-53` does), so a bot PR that changes `package.json` ends the required check in `error` for lack of the key. The repository has Dependabot alerts on (since 2026-10-16), "Dependabot security updates" off, no `.github/dependabot.yml`.
- **Dotfiles and docs.** No `.editorconfig`; `.prettierrc.json` has `tabWidth: 2`, `printWidth: 120`. `.env.example` has 5 keys, `astro.config.mjs:48-56` declares 6 server secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `CONTACT_EMAIL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `REMINDER_SECRET`); `.dev.vars.example` does not exist; `SENTRY_DSN` is a Worker secret (`wrangler.jsonc:23`, `src/lib/sentry-options.ts:6-7`). `E2E_USERNAME`/`E2E_PASSWORD` are read from `.env` by `playwright.config.ts:6`. The Node version is stated in `README.md:18`, `CLAUDE.md:58` and `packages/code-reviewer/evals/README.md:22`; the env templates in `README.md:38-41,101,116-129` and `AGENTS.md:38`; the evals README's advisory count (`:32`, "7 high") is stale (10 today).
- **Process.** A lockfile change is code for the `changes` job (`ci.yml:21-50`), so the PR runs `ci`, `smoke`, `e2e` and `integration` (`compat` skipped, no migrations) and the merge runs the gated `release`, a real deploy because the bundle changes (`devalue` is in 2 of 99 server chunks). Every file this plan edits is Prettier-clean today, and `actionlint` on `ci.yml` reports only two pre-existing `SC2034` warnings (`ci.yml:104,271`). Recent plans in `context/archive/` are written in English.

## Desired End State

- `npm audit --omit=dev --audit-level=high` exits 0 on `master` and as a step of the `ci` job; the full `npm audit` lists as high only two dev-only `braces` chains, the accepted `patch-package` one (`find-yarn-workspace-root` → `micromatch` → `braces`) and shadcn's (`shadcn` → `ts-morph` → `@ts-morph/common` → `fast-glob` → `micromatch` → `braces`). `@eslint/config-helpers` is gone from `package.json`; `shadcn`, `ai`, `@openrouter/ai-sdk-provider`, `zod`, `@astrojs/check`, `@types/react`, `@types/react-dom` are devDependencies at their current ranges; one copy each of `wrangler` and `miniflare`, both with `undici` and `sharp` outside the advisory ranges.
- `package.json` carries `devEngines.runtime` (`node`, `22.x`, `onFail: warn`), `.nvmrc` says `22.23.3`, `npm ci` on that Node prints no `EBADENGINE` or `EBADDEVENGINES` line, and on Node 24 `npm ci`, `npm run` and `npx` print `npm warn EBADDEVENGINES` and continue. README, `CLAUDE.md`, `AGENTS.md` and the evals README say so.
- `.editorconfig` exists and agrees with Prettier; `.env.example` lists the six schema secrets plus the two E2E names; `.dev.vars.example` lists the six plus the optional Sentry pair; README points `.dev.vars` at its own template.
- `.github/dependabot.yml` opens one grouped, lockfile-only PR a week for the root manifest (minor and patch, majors ignored) and none for `packages/code-reviewer/evals`; the owner has enabled Dependabot security updates; the first bot PR passes `ai-review` as `skipped` and the four CI jobs green.
- The change is released (owner approval, production check), recorded as the next free Phase (27 today) of `context/changes/deployment/deployment-plan.md`, open-items §6 is ticked (6.4 and 6.6 stay), and the roadmap closes S-23 at archive.

### Key Discoveries:

- `npm update <names>` changes `package-lock.json` only and never rewrites the ranges in `package.json` (npm docs); the update list must include `@cloudflare/vite-plugin` (research §2). The health check's `npm audit fix --dry-run` (fix 1) moved 55 packages, all in range: wrangler 4.131.1 → 4.151.0, devalue 5.9.2 → 5.9.4, sharp → 0.35.5, source-map-js → 1.2.2, http-cache-semantics → 4.3.0, brace-expansion 1.1.18 → 1.1.21 and 5.0.9 → 5.0.12, smol-toml → 1.9.1, fast-uri → 3.1.8, undici → 7.29.1, `@cloudflare/vite-plugin` → 1.64.0, miniflare → 5.20261012.0-beta (`health-check.md:46`).
- `npm uninstall` edits both files; `@eslint/config-helpers` stays in the lockfile as ESLint's own dependency, now dev (research §3). `@types/react` and `@types/react-dom` are required peers of `@astrojs/react` (production), so npm keeps them without a `dev` flag even after the move; the move still documents intent and changes nothing in the Worker bundle (Vite bundles `src/` imports, not sections).
- `devEngines` is checked before `install`, `ci`, `run` and, as probed, `exec`/`npx`, so it also meets every npm caller outside the `nvm use` shell: the husky hook (`npx lint-staged`, `.husky/pre-commit`), the three Claude Code hooks (`.claude/hooks/lint-edited-file.sh:24`, `related-tests.sh:27`, `end-of-turn.sh:42-68`: `npx eslint`, `npx vitest`, `npx astro check`, exit 2 on any failure), Playwright's `webServer` (`playwright.config.ts:43`) and Dependabot's updater on Node 24. With `onFail: error` they would fail or block on a Node 24 session; with `onFail: warn` (plan review F2) they print the warning and continue. The root's own `engines` is skipped when `devEngines` is present, and no dependency's `engines` claim is enforced (arborist `build-ideal-tree.js:192-213` only runs with `engine-strict`).
- `ai-review` passes a PR as `skipped` only when the code diff is empty after the exclusions (`review.yml:144`: `context/`, `*.md`, both lockfiles, the eval cases). A Dependabot PR with `versioning-strategy: lockfile-only` touches only `package-lock.json` (GitHub docs: "Only create pull requests to update lockfiles. Ignore any new versions that would require package manifest changes."), so it needs no secret. `open-pull-requests-limit: 0` stops version updates only ("Security update pull requests are subject to a separate, fixed limit of 10"), so the evals entry also carries `ignore` for every dependency; Dependabot alerts are independent of the config file and stay visible.
- `npm audit` has no allow list; `audit-level` is the minimum level that makes it exit non-zero; `omit` defaults to `dev` only under `NODE_ENV=production`, which nothing in the repository sets, so the CI step spells out `--omit=dev` (research §5).
- The draft `dependabot.yml` of this plan validates against SchemaStore's `dependabot-2.0.json` with `ajv-cli` (`--spec=draft7 --strict=false`, the schema carries an `x-intellij-enum-metadata` keyword strict mode rejects), and a deliberately wrong value fails the check; `actionlint` accepts the audit step with `-ignore 'SC2034'`.
- Prettier parses `.editorconfig` and `.prettierrc` wins on conflict; the proposed values agree with `.prettierrc.json`. `trim_trailing_whitespace` is left out on purpose: Markdown hard line breaks are two trailing spaces.

## What We're NOT Doing

- The three major upgrades of open-items 6.4 (`lint-staged` 17, `@astrojs/react` 7, `typescript` 7): one PR each, by hand, when their trigger fires; Dependabot ignores majors.
- Open-items 6.6 (the `AGENTS.md` rule wording) and the two closed decisions 6.3 and 6.9: `patch-package` and the Stryker patch stay, the evals lockfile stays and gets no PRs; its 10 high advisories stay as alerts.
- `npm audit fix --force` (it would downgrade `shadcn` to 1.0.0 and `patch-package` to 6.0.7), `overrides` for transitive packages (only as the fallback named in Phase 1), and any update outside the ranges `package.json` allows, including `@astrojs/cloudflare` 14.4.0 (in range; the first Dependabot PR brings it).
- `engines` + `.npmrc engine-strict=true` (decision of 2026-10-19: `devEngines`), `onFail: error` (plan review F2: it would block the Claude Code hooks and GUI commits on a Node 24 machine, and Dependabot's updater passes it only through its own `--force`), changing `node-version: 22` in `ci.yml` to `.nvmrc` (the newest 22.x is what the pin allows), and installing Node 22 for the owner's other projects: `nvm use` stays per shell.
- A `github-actions` ecosystem entry in `dependabot.yml`: a bot PR that edits `.github/` is in the reviewed diff, and without a Dependabot secret `ai-review` would end in `error`. The SHA-pinned actions keep their manual bumps.
- A Dependabot secret for the reviewer, the `ai-cr:review` label workflow, security updates for the evals directory, `labels: []`, and a report-only audit step (decisions of 2026-10-19).
- An audit step for the evals lockfile, a `moderate` audit level, fixing the pre-existing `SC2034` warnings in `ci.yml`, and any change to `src/`, the schema, the smoke or e2e suites: the change has no user-visible effect to test.
- Rewriting `CLAUDE.md`'s `npx shadcn@latest add` instructions or the `@import "shadcn/tailwind.css"` in `src/styles/global.css:12`: the CLI keeps working through `npx` (Phase 1 proves it) and the stylesheet stays installed as a devDependency.

## Implementation Approach

- **Three phases, one run, one PR** (lessons: "Implement plans with /10x-goal-implement", "Run a whole implementation in one goal run"): branch `s-23/dependency-hygiene/implementation` cut from fresh `origin/master` after the planning PR is merged; `/goal` condition "all three phases done, automated rows green, one PR opened"; one commit per phase with SHA write-back; `/10x-impl-review dependency-hygiene` triaged before the single push and `gh pr create`. No phase needs a production state created by an earlier phase, so nothing splits the run. Rows that need the PR's own merge and release (3.7–3.11) are manual and ticked afterwards, the release record in a small closing docs PR (the next free deployment-plan Phase, 27 today).
- **Everything on the pinned Node.** Before the first command: `source ~/.nvm/nvm.sh && nvm install 22.23.3`. Every npm command and every `git commit` of the run is prefixed with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&` (each Bash call starts a fresh shell on Node 24; `nvm use` reads `.nvmrc`, so Phase 1 runs on 22.23.3 only after `.nvmrc` is bumped in Phase 2; until then use `nvm use 22.23.3`). The lockfile is then written by npm 10.9.9, the npm that `ai-review`'s `npm ci` reads it with.
- **Phase 1 uses the explicit update list plus the plugin**, not `npm audit fix`: the list is the health check's, extended by the one package the research found missing, and it is readable in the commit; `npm audit fix` (never `--force`) is the fallback only if an in-range fix is still reported afterwards. The rescoping is a hand edit of `package.json` followed by `npm install`, which re-flags the lockfile without moving versions.
- **Phase 2 pins with `devEngines`** (owner decision): it checks the project's runtime, not the dependencies' claims, so a future dependency's `engines` cannot break `npm ci`; `.nvmrc` moves to 22.23.3 first, which clears today's `EBADENGINE` warnings. `onFail: warn`, not `error`: the pin then informs every shell and bot without stopping the Claude Code hooks, GUI commits or Dependabot's updater (plan review F2), and the run itself stays on Node 22 through the `nvm use` prefix.
- **Phase 3 is the last** (open-items 6.2): the audit step makes sense only after Phase 1, and the Dependabot config lands with the documentation that explains why the bot PRs are lockfile-only. The owner flips "Dependabot security updates" after the merge, so the config file is already on `master` when the first security update is considered.

## Critical Implementation Details

- **Timing & lifecycle.** From the Phase 2 commit on, any Node 24 shell prints `npm warn EBADDEVENGINES` before `npm run`, `npm install`, `npm ci` and `npx`, the husky pre-commit hook and the Claude Code hooks included, and continues. The implementation run keeps `source ~/.nvm/nvm.sh && nvm use` in the shell that runs npm or commits, so npm 10 writes the lockfile; the parallel worktree sessions (S-20 to S-22) see the warning after they merge `master` and switch at their next `npm ci`. Do not set `nvm alias default` for the owner.
- **Debug & observability.** After every lockfile command read `npm ls wrangler miniflare undici sharp` (one copy of `wrangler` and of `miniflare` is the expected shape; two copies mean the root `wrangler` resolved past the plugin's exact pin, and `npm dedupe` collapses them because the plugin's pin satisfies the root's `^4.131.1` too) and `npm audit --json` (the `vulnerabilities` keys, each with `severity`, `isDirect`, `fixAvailable`). Read the `package-lock.json` diff before the Phase 1 commit; a format-only churn from npm 10.9.9 is acceptable and is noted in the commit body, anything outside the ranges in `package.json` is not.

## Phase 1: Clear the fixable advisories and rescope the tooling (6.1)

### Overview

Move every advisory with an in-range fix out of the root tree, remove the one package nothing needs in `package.json`, and move the seven tooling packages, `shadcn` among them, to `devDependencies`, so that the audit of the production path is clean before Phase 3 makes it a gate. No source file changes.

### Changes Required:

#### 1. In-range update of the lockfile

**File**: `package-lock.json`

**Intent**: Bring the flagged transitive packages, and the Cloudflare plugin that pins four of them, to the newest versions the existing ranges allow, so every advisory with an in-range fix disappears.

**Contract**: One command on Node 22.23.3, lockfile only:

```bash
npm update wrangler @cloudflare/vite-plugin devalue undici sharp source-map-js http-cache-semantics brace-expansion fast-uri qs smol-toml typed-rest-client @modelcontextprotocol/sdk
```

`package.json` is unchanged by this step (`npm update` does not rewrite ranges); no package moves past the range `package.json` allows and no major version changes; the `postinstall` (`patch-package --error-on-fail`) succeeds. Expected moves: those of the health check's dry run (Key Discoveries), with `wrangler` and `miniflare` at whatever the plugin's pins are on the day (4.151.0 and 5.20261012.0-beta on 2026-10-19). If `npm ls wrangler miniflare` shows two copies of either, run `npm dedupe` and read the diff again. If `npm audit` still reports an advisory with `fixAvailable: true` on a production path, run `npm audit fix` (never `--force`) and read the diff; if a fix exists only outside the range (none known today), stop and ask instead of adding an `overrides` entry.

#### 2. Remove `@eslint/config-helpers`

**Files**: `package.json`, `package-lock.json`

**Intent**: `@eslint/config-helpers` is imported nowhere; ESLint depends on it itself. `shadcn` stays: `src/styles/global.css:12` imports its stylesheet, so it moves to `devDependencies` in step 3 instead (plan review F1).

**Contract**: `npm uninstall @eslint/config-helpers` removes the entry from `dependencies` (`package.json:30`); `@eslint/config-helpers@0.7.x` stays in the lockfile as `eslint`'s dependency, flagged `dev`, and no other package leaves the lockfile (shadcn's subtree stays, flagged `dev` after step 3). `components.json`, the `shadcn` comments in `eslint.config.js:104,115`, the import in `src/styles/global.css:12` and `CLAUDE.md`'s `npx shadcn@latest add` instructions stay as they are.

#### 3. Move the seven tooling packages to `devDependencies`

**Files**: `package.json`, `package-lock.json`

**Intent**: `ai`, `@openrouter/ai-sdk-provider`, `zod`, `@astrojs/check`, `@types/react`, `@types/react-dom` and `shadcn` are used by the reviewer package, `astro check`, the type checker and the Tailwind build (`global.css:12`) only; in `dependencies` they make GitHub scope their alerts `runtime` and keep `npm audit --omit=dev` from filtering them, shadcn's six highs included.

**Contract**: Hand edit: cut the seven lines from `dependencies` (`package.json:26,32,37,38,39,47,51` at `77b6784`) and paste them into `devDependencies` in alphabetical order with their current ranges (`^0.9.10`, `^3.1.0`, `^19.2.14`, `^19.2.3`, `^7.0.139`, `^4.21.0`, `^4.6.7`), then `npm install` so the lockfile's root entry (`packages[""]`) mirrors `package.json` and the `dev` flags follow (`@types/react*` keep no `dev` flag: `@astrojs/react` peer-depends on them). No version changes in the lockfile from this step. `npm install -D <name>` is not used (it would resolve `latest` and rewrite the ranges).

### Success Criteria:

#### Automated Verification:

- Production-path audit clean: `npm audit --omit=dev --audit-level=high` exits 0
- Full audit: only the patch-package and shadcn chains are high or critical: `npm audit --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s).vulnerabilities;const bad=Object.entries(v).filter(([n,x])=>["high","critical"].includes(x.severity)&&!["braces","micromatch","fast-glob","@ts-morph/common","ts-morph","shadcn","find-yarn-workspace-root","patch-package"].includes(n)).map(([n])=>n);console.log("high/critical:",Object.entries(v).filter(([,x])=>["high","critical"].includes(x.severity)).map(([n])=>n).join(", ")||"none");process.exit(bad.length?1:0)})'`
- One copy each of wrangler and miniflare, all four outside the advisory ranges: `npm ls wrangler miniflare undici sharp` (expected: wrangler ≥ 4.149.0, miniflare ≥ 5.20261012.0, undici ≥ 7.29.1 in the `7.x` copy, sharp ≥ 0.35.5)
- package.json changed only by the one removal and the seven moves: `git diff origin/master -- package.json` (no range changes, no new entries)
- Clean install from the lockfile applies the Stryker patch: `rm -rf node_modules && npm ci` (exit 0, `patch-package` reports the patch applied)
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Unit tests pass: `npm run test:unit`
- Build passes: `npm run build`
- Prettier passes: `npx prettier --check package.json`
- shadcn CLI still runs through npx: `npx shadcn@latest add --dry-run button` (network; exit 0)

#### Manual Verification:

- Owner reads the lockfile diff: about 55 in-range moves and the dev flags of the seven moved packages, nothing removed but the root entry of @eslint/config-helpers, no major bump, nothing outside the ranges in package.json

**Implementation Note**: The run does not stop here; the manual row is the owner's read of the PR diff later. Commit on Node 22.23.3 (`nvm use 22.23.3` until `.nvmrc` moves in Phase 2).

---

## Phase 2: Pin the runtime and complete the dotfiles (6.7, 6.5, 6.8)

### Overview

Make a wrong Node version fail at the first npm command instead of in CI, raise `.nvmrc` to the toolchain's real floor, add `.editorconfig`, complete the environment examples, and update every document that states the Node version or the env templates.

### Changes Required:

#### 1. Runtime pin

**File**: `package.json`

**Intent**: Warn before `npm ci`, `npm install`, `npm run` and `npx` on a Node major other than 22, with npm's own message, on every machine and in every worktree, without stopping the hooks, GUI commits or Dependabot's updater.

**Contract**: A new top-level field, placed after `overrides`, exactly:

```json
"devEngines": {
  "runtime": { "name": "node", "version": "22.x", "onFail": "warn" }
}
```

No `engines` field and no `.npmrc`. On Node 22.23.3 every npm command behaves as before; on Node 24 they print `npm warn EBADDEVENGINES` with the required and current versions and continue (both modes probed on this machine with npm 11.19.0). `error` is not used: it would block the Claude Code hooks and GUI commits on a Node 24 machine, and Dependabot's updater (Node 24, npm 12.2.0) passes it only through its own `--force` (plan review F2).

#### 2. `.nvmrc`

**File**: `.nvmrc`

**Intent**: The newest 22.x, above the lockfile's highest non-optional `engines` floor (22.22.3), so `npm ci` prints no `EBADENGINE` warning and the `ai-reviewer` action (`node-version-file: .nvmrc`) installs on a version every package accepts.

**Contract**: The file holds `22.23.3` and a trailing newline, nothing else.

#### 3. `.editorconfig`

**File**: `.editorconfig` (new)

**Intent**: Editors without a Prettier integration get the same indentation, line endings, final newline and charset; Prettier keeps the last word.

**Contract**:

```ini
# Editor defaults for editors without a Prettier integration; .prettierrc.json wins where both apply.
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
charset = utf-8
```

No `trim_trailing_whitespace` (Markdown hard line breaks) and no `max_line_length`.

#### 4. `.env.example`

**File**: `.env.example`

**Intent**: Document every secret `astro.config.mjs`'s `env.schema` declares, so a machine setting up the reminders locally finds the three names in the template instead of README prose.

**Contract**: The five existing lines stay as they are; appended, with the comment:

```ini
# Reminder secrets (README, "Reminder secrets"): the VAPID key pair and the shared secret of the evening cron.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
REMINDER_SECRET=
```

`TEST_SUPABASE_*` get no entry (`tests/setup/global-setup.ts:23-39` takes them from `supabase status -o env`).

#### 5. `.dev.vars.example`

**File**: `.dev.vars.example` (new, tracked; `.gitignore` ignores `.dev.vars` by exact name)

**Intent**: The template for the local Cloudflare runtime secrets, which README today tells the reader to copy from `.env.example`.

**Contract**:

```ini
# Local Cloudflare runtime secrets for `npm run dev`, `npm run preview` and `wrangler dev` (README, "Supabase Configuration").
# Copy to .dev.vars and fill in; .dev.vars is git-ignored, never commit it.
SUPABASE_URL=
SUPABASE_KEY=
CONTACT_EMAIL=
# Reminder secrets (README, "Reminder secrets"), needed only to run the evening cron locally.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
REMINDER_SECRET=
# Optional (README, "Observability"): report errors of a local preview to Sentry.
# SENTRY_DSN=
# SENTRY_ENVIRONMENT=local
```

No `E2E_*` lines: Playwright reads them from `.env` (`playwright.config.ts:6`).

#### 6. Documents that state the Node version or the templates

**Files**: `README.md`, `CLAUDE.md`, `AGENTS.md`, `packages/code-reviewer/evals/README.md`

**Intent**: Every statement of the Node version and of the env templates matches the new files, and a reader learns that npm itself warns about another Node major.

**Contract**:

- `README.md:18` (Prerequisites): Node.js v22.23.3 (`.nvmrc`; `nvm install` reads it), and one sentence that `package.json` pins the major through `devEngines`, so on another Node major `npm ci`, `npm install`, `npm run` and `npx` print `npm warn EBADDEVENGINES` first: run `nvm use` before them. `README.md:30-34` (step 2): `nvm use` before `npm install`.
- `README.md:38-41` (step 4): `cp .dev.vars.example .dev.vars`, with the Supabase values filled in from the next section. `README.md:101` keeps `cp .env.example .env`.
- `README.md:123-129` (reminders locally): the three lines are those of `.dev.vars.example` and `.env.example`; the generation steps stay in "Reminder secrets".
- `CLAUDE.md:58` (Environment): Node.js v22.23.3 (`.nvmrc`); `devEngines` in `package.json` makes npm warn on another major, so run `nvm use` first.
- `AGENTS.md:38` (Secrets): templates `@.env.example` and `@.dev.vars.example`.
- `packages/code-reviewer/evals/README.md:22`: the suite needs Node 22.22 or later, which the repository's `.nvmrc` (22.23.3) satisfies; `:32`: 10 high-severity advisories (2026-10-19), rationale unchanged.

### Success Criteria:

#### Automated Verification:

- `nvm use` picks 22.23.3 from .nvmrc: `source ~/.nvm/nvm.sh && nvm use >/dev/null && node --version` prints `v22.23.3`
- `npm ci` on 22.23.3 prints no EBADENGINE or EBADDEVENGINES: `source ~/.nvm/nvm.sh && nvm use >/dev/null && set -o pipefail && npm ci 2>&1 | tee "$(mktemp)" | { ! grep -q 'EBADENGINE\|EBADDEVENGINES'; }`
- Node 24 gets the EBADDEVENGINES warning from `npm run` and still runs it: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && set -o pipefail && npm run lint 2>&1 | grep 'npm warn EBADDEVENGINES'` (exit 0 only when lint passes and the warning is printed)
- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- Example files hold only comments and `KEY=` lines, with the six schema secrets in both: `grep -vE '^(#|$|[A-Z0-9_]+=)' .env.example .dev.vars.example` prints nothing, and `for k in SUPABASE_URL SUPABASE_KEY CONTACT_EMAIL VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY REMINDER_SECRET; do grep -q "^$k=" .env.example && grep -q "^$k=" .dev.vars.example || echo "missing $k"; done` prints nothing
- Prettier passes on the changed docs: `npx prettier --check package.json README.md CLAUDE.md AGENTS.md packages/code-reviewer/evals/README.md`

#### Manual Verification:

- Owner reads the Node and env-file wording in README, CLAUDE.md, AGENTS.md and the evals README

**Implementation Note**: From this phase's commit on, a Node 24 shell gets the `EBADDEVENGINES` warning from every npm command, the pre-commit hook and the Claude Code hooks included, and continues; the run keeps `source ~/.nvm/nvm.sh && nvm use` in the shell that runs npm or commits so that npm 10 writes the lockfile.

---

## Phase 3: Automate the watch: Dependabot and the CI audit step (6.2), docs and closing

### Overview

New advisories reach a weekly lockfile-only Dependabot PR and a blocking audit step in the required `ci` job; the README, a lesson and open-items record how the pieces fit; then the PR, the release and the first bot PR close the slice.

### Changes Required:

#### 1. Dependabot configuration

**File**: `.github/dependabot.yml` (new)

**Intent**: One grouped PR a week with every in-range minor and patch of the root lockfile, no manifest change (so `ai-review` passes it as `skipped` without a secret), majors ignored (open-items 6.4 stays one PR each, by hand), and no PRs for the eval suite (decision 6.9).

**Contract**: Exactly this file (validated against SchemaStore's `dependabot-2.0.json` during planning):

```yaml
# Dependabot (README, "CI" > "Dependency updates"). Version updates: weekly, in range, lockfile only, so a PR carries no
# manifest change and the ai-review gate passes it as `skipped` (a Dependabot-triggered run has no Actions secrets).
# The eval suite's lockfile gets no PRs (owner decision 6.9, 2026-10-19); its alerts stay visible on GitHub.
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "06:00"
      timezone: Europe/Warsaw
    versioning-strategy: lockfile-only
    groups:
      minor-and-patch:
        update-types:
          - minor
          - patch
    ignore:
      - dependency-name: "*"
        update-types:
          - version-update:semver-major
  - package-ecosystem: npm
    directory: /packages/code-reviewer/evals
    schedule:
      interval: weekly
    open-pull-requests-limit: 0
    ignore:
      - dependency-name: "*"
```

Exact pins (`@stryker-mutator/*`, `husky`, `eslint-plugin-jsx-a11y`) never get a PR under `lockfile-only`; that is intended for the Stryker pair (decision 6.3) and accepted for the other two.

#### 2. Audit step in the `ci` job

**File**: `.github/workflows/ci.yml`

**Intent**: A high or critical advisory reachable from `dependencies` fails the required `ci` check, so it blocks a merge instead of waiting for a manual audit (owner decision 2026-10-19; lesson "Enforcement steps belong inside the job that holds the required check").

**Contract**: In the `ci` job, between `- run: npm ci` (`ci.yml:63`) and `- run: npx astro sync`, a named step with a comment:

```yaml
# Advisories reachable from `dependencies` only (`--omit=dev`); fails the job at high or critical. npm audit has no
# allow list: a high advisory without an in-range fix blocks every PR until the owner lowers the level in a PR of
# its own and records it in open-items (README, CI).
- name: Audit production dependencies
  run: npm audit --omit=dev --audit-level=high
```

The job's id, name and every other step stay as they are; no other job gets the step.

#### 3. README, CI section

**File**: `README.md` (`## CI`, the `ci` bullet at `:495` and a new subsection at the end of the section)

**Intent**: The reader learns what the audit step blocks, the break-glass, and how the bot PRs relate to the gate.

**Contract**:

- The `ci` bullet gains: after `npm ci`, `npm audit --omit=dev --audit-level=high` fails the job on a high or critical advisory reachable from `dependencies`. With an in-range fix the cure is `npm update <name>` (lockfile only) in a PR of its own, or the Dependabot security PR that brings the same move; `npm audit` has no allow list, so an advisory without an in-range fix blocks every PR until the owner lowers the level (`--audit-level=critical`) in a PR of its own and records it in `context/foundation/open-items.md`; devDependencies are audited by hand (`npm audit`).
- New subsection `### Dependency updates` at the end of `## CI`: Dependabot (`.github/dependabot.yml`) opens one grouped, lockfile-only PR a week (Monday, 06:00 Warsaw) for the root manifest, minor and patch in range, majors ignored (open-items 6.4: one PR each by hand), nothing for `packages/code-reviewer/evals` (its alerts stay); a Dependabot-triggered run has no Actions secrets, which is why the PRs change only the lockfile: the `ai-review` code diff is then empty and the check passes as `skipped`, while `ci`, `smoke`, `e2e` and `integration` run in full; merging a bot PR triggers a release like any code merge; a bot PR that bumps `vitest` or the Stryker runner gets the narrowed mutation check of `context/foundation/lessons.md` ("Before trusting a mutation score…") before the merge; Dependabot security updates are enabled by the owner (Code security) and follow the same configuration.

#### 4. Lesson

**File**: `context/foundation/lessons.md` (append)

**Intent**: Record the rule for the next bot that opens PRs.

**Contract**: One entry in the file's format:

- Title: `Bot-opened PRs run without Actions secrets: keep Dependabot PRs lockfile-only so the review gate passes as skipped`
- Context: `.github/dependabot.yml`, `.github/workflows/review.yml` (`ai-review`, a required check that needs `OPENROUTER_API_KEY`), and any future bot that opens PRs (a `github-actions` ecosystem entry, a release bot).
- Problem: a workflow run triggered by Dependabot gets Dependabot secrets only (the repository has none) and a read-only token unless the workflow's `permissions` key raises it, so a bot PR that changes `package.json` or `.github/` ends `ai-review` in `error` and cannot merge; the gate passes as `skipped` only on an empty code diff (`context/`, Markdown and the lockfiles are excluded).
- Rule: configure a bot so its PRs touch only files the gate excludes (`versioning-strategy: lockfile-only` for npm; no `github-actions` ecosystem) or give it its own Dependabot secret on purpose; keep a runtime pin (`devEngines`, `engines`) at warning level, because the bot's npm runs on its own Node (24 today, npm 12) and survives a hard stop only through its own `--force`; check the first bot PR's `ai-review` outcome before relying on it; never lift the check for a bot.
- Applies to: plan, implement, impl-review

#### 5. Open items

**File**: `context/foundation/open-items.md` (§6 and the intro)

**Intent**: The backlog shows what this change closed and what still waits for a trigger.

**Contract**: 6.1, 6.2, 6.5, 6.7, 6.8 become `[x]` with the date, in Polish like the rest of the file (the PR number is added in the closing docs PR that also records the release); 6.1's note says that `shadcn` stayed as a devDependency because `src/styles/global.css` imports its stylesheet; 6.7's note says `devEngines` (`onFail: warn`) and `.nvmrc` 22.23.3 instead of `engine-strict`, and why (40 packages above 22.14.0, the `ai-review` install, the hooks and Dependabot's Node 24); 6.3 and 6.9 become `[x]` pointing at `owner-decisions.md`; 6.4 and 6.6 stay `[ ]`. The intro line (`:3`, "dziś to tylko 2.8 i 5.12") and the closing paragraph (`:96`) list the remaining boxes: 2.8, 5.12, 6.4, 6.6.

#### 6. Deployment record (after the release)

**File**: `context/changes/deployment/deployment-plan.md` (new `## Phase N — Dependency hygiene (S-23)` with the next free number, 27 on 2026-10-19, after the last phase, `:455-470` today; a parallel session's closing PR may take 27 first)

**Intent**: The release and the first bot PR are recorded where every release is.

**Contract**: The phase block in the file's format: the PR and merge commit, the `master` run with the four jobs, the `release` job (approval, "Remote database is up to date.", the Worker version id, the tag move), the live check, the date the owner enabled Dependabot security updates, and the first Dependabot PR (number, `ai-review` `skipped`, the four jobs, merged and released or not). Written in the closing docs PR, after the release, together with the PR number in open-items §6.

### Success Criteria:

#### Automated Verification:

- dependabot.yml validates against the SchemaStore schema: `curl -sSfL -o "$(mktemp -d)/dependabot-2.0.json" https://json.schemastore.org/dependabot-2.0.json` then `npx --yes ajv-cli@5 validate -s <that file> -d .github/dependabot.yml --spec=draft7 --strict=false` prints `.github/dependabot.yml valid`
- actionlint passes on ci.yml (pre-existing SC2034 ignored): `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -ignore 'SC2034' .github/workflows/ci.yml`
- The audit step's command passes locally: `npm audit --omit=dev --audit-level=high` exits 0
- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- Prettier passes on the changed files: `npx prettier --check .github/dependabot.yml .github/workflows/ci.yml README.md context/foundation/lessons.md context/foundation/open-items.md`

#### Manual Verification:

- CI on the PR green: `ci` with the audit step, `smoke`, `e2e`, `integration`; `compat` skipped; `ai-review` `reviewed`; the owner reads the `.github/` diff because the PR edits the gate's workflow file
- After the merge the owner enables "Dependabot security updates" in Settings → Code security and analysis
- Merge, `release` approved, production check (`/` 200, `/privacy` 200 with the `mailto:` link, `/dashboard` 302 to `/auth/signin`, a new Worker version id) and the release recorded as the next free Phase (27 today) in deployment-plan.md
- Insights → Dependency graph → Dependabot shows the configuration without errors, and the first grouped PR is lockfile-only with `ai-review` `skipped` and the four CI jobs green
- GitHub alerts after the merge: the root alerts drop to the two `braces` chains through `patch-package` and `shadcn` (scope `development`), the evals keep their two

**Implementation Note**: The merge touches `package.json`, the lockfile and `.github/`, so the push to `master` runs `release`; the app's own code is unchanged, the bundle moves with `devalue` and the plugin. The first Dependabot PR is large (22 packages behind `wanted` today, among them `astro`, `vitest`, `@playwright/test`, `supabase`) and runs the full CI; the owner merges it like any code PR and approves its release. The exact day of the first bot check is not documented by GitHub; the row waits for it. Its lockfile is written by Dependabot's npm (12.2.0 today) while CI's `npm ci` reads it with npm 10.9: read the bot's lockfile diff for format-only churn and expect `ci` green; a red `npm ci` there is the trigger to align the npm major in the workflow, not a plan item today (plan review F3).

---

## Testing Strategy

### Unit Tests:

- No source change, so no new test. The existing unit project (`npm run test:unit`) runs after every phase on the updated tree; it imports `packages/code-reviewer` (`ai`, `@openrouter/ai-sdk-provider`, `zod` now dev) and proves the move left them installed.
- `tests/unit/ai-review-workflow.test.ts` pins `review.yml`'s pathspecs; this plan does not touch `review.yml`. `tests/unit/lockfile-sources.test.ts` asserts a registry `resolved` and an `integrity` on every entry of both lockfiles, so the rewritten lockfile is checked by every `test:unit` row.
- `npm run build` (row 1.9) proves that `src/styles/global.css:12` still resolves `shadcn/tailwind.css` from `devDependencies`.

### Integration Tests:

- `smoke`, `e2e` and `integration` on the PR exercise the updated Cloudflare toolchain (`astro build`, `astro preview` on the new `@cloudflare/vite-plugin`, `miniflare` and `workerd`) and the full Vitest suite; a red `smoke` or `e2e` after Phase 1 points at the plugin bump (see Phase 1's fallback order).
- The `ci` job on the PR runs the new audit step on the PR's own lockfile.

### Manual Testing Steps:

1. Read the `package-lock.json` diff of Phase 1 (row 1.12).
2. Read the four documents of Phase 2 (row 2.8).
3. After the merge: enable Dependabot security updates, approve `release`, check production, record the release as the next free Phase (rows 3.8, 3.9).
4. On the first bot PR: `ai-review` outcome, CI jobs, alert count (rows 3.10, 3.11).

## Performance Considerations

- `npm audit` adds a registry round trip (a few seconds) to the `ci` job; a registry outage fails the step, re-run the job.
- `npm update` and `rm -rf node_modules && npm ci` take a few minutes each on this machine; `npx shadcn@latest add --dry-run` downloads the CLI once.
- A Dependabot PR runs the full CI (three local Supabase stacks) at most once a week; the first one is large.

## Migration Notes

- **Every clone and worktree**: `nvm install` (reads `.nvmrc`) once, then `source ~/.nvm/nvm.sh && nvm use` in the shell that runs npm or commits; on Node 24 npm prints `npm warn EBADDEVENGINES` and continues, so the warning, not a failure, is the signal to switch. The parallel S-20 to S-22 sessions see it as soon as they merge `master`.
- **Rollback**: revert the PR (manifest, lockfile, workflow, dotfiles and docs together); Dependabot stops when `dependabot.yml` is gone; the owner flips the security-updates setting back by hand. Code rolls back with `npx wrangler rollback` as usual; there is no schema change.
- **After this change**: a Dependabot PR that bumps `vitest` or `@stryker-mutator/vitest-runner` gets the narrowed mutation check before the merge (lessons.md, "Before trusting a mutation score…"); a `patch-package` failure on such a PR is decision 6.3's re-check trigger. The three majors (6.4) stay manual PRs. A high advisory on a production path blocks every PR: with an in-range fix, `npm update <name>` (lockfile only) in a PR of its own or the bot's security PR clears it; without one, the break-glass is a PR of its own that lowers the step to `--audit-level=critical` and adds an open-items entry with the advisory and the trigger to restore `high`.

## References

- Research: `context/changes/dependency-hygiene/research.md` (§1 audit today, §2 the update list, §3 rescoping, §4 the Node pin, §5 Dependabot and the audit step, §6-7 dotfiles, §8 process, Open Questions 1-8)
- Step list and decisions: `context/foundation/open-items.md` §6 (6.1-6.9), `context/foundation/owner-decisions.md` ("Health check 2026-10-19"), `context/foundation/health-check.md:139-215` (fixes 1-9), `context/foundation/roadmap.md:113-125` (S-23)
- Lessons: `context/foundation/lessons.md:19-25` (planning branch), `:119-124` (worktrees), `:147-152` (a required check must not skip), `:183-188` (enforcement in the required job), `:190-195` (mutation runner after a Vitest bump), `:204-209` (`/10x-goal-implement`), `:218-223` (handover and Node)
- Code and config: `package.json:21,25-52,53-81`, `.nvmrc`, `.env.example`, `astro.config.mjs:48-56`, `.github/workflows/ci.yml:21-50,53-72`, `.github/workflows/review.yml:8-9,49-51,144,152`, `.github/actions/ai-reviewer/action.yml:97-111`, `.husky/pre-commit`, `.claude/hooks/{lint-edited-file,related-tests,end-of-turn}.sh`, `src/styles/global.css:12`, `src/components/ui/alert-dialog.tsx:24,46`, `playwright.config.ts:6,43`, `src/lib/sentry-options.ts:6-7`, `packages/code-reviewer/evals/package.json:5-6`
- Docs to edit: `README.md:18,30-41,101,116-129,488-501`, `CLAUDE.md:58`, `AGENTS.md:38`, `packages/code-reviewer/evals/README.md:22,32`, `context/changes/deployment/deployment-plan.md:455-470`
- Prior art: `context/archive/2026-10-16-code-review-evals/plan.md:129` (the evals package's `engines` decision), `context/archive/2026-10-14-ci-cd-code-review/plan.md:208` (setup-node and `.nvmrc` in the action)
- npm and GitHub docs read during research and planning: npm `configuring-npm/package-json.md` (`devEngines`), `commands/npm-update.md`, `commands/npm-audit.md`, `using-npm/config.md` (`engine-strict`, `omit`, `audit-level`); GitHub "Dependabot options reference" (`versioning-strategy`, `open-pull-requests-limit`, `groups`, `ignore`, `schedule`), "Troubleshooting Dependabot on GitHub Actions" (secrets and token of Dependabot-triggered runs, the `permissions` key); dependabot-core `npm_and_yarn/Dockerfile` (Node 24, npm 12.2.0), `file_updater/npm_lockfile_updater.rb` and `native_helpers.rb` (`--force` on the lockfile commands), `update_checker/version_resolver.rb` (the unforced peer check); npm `lib/base-cmd.js` (`checkDevEngines`, its `force` branch); all read 2026-10-19

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Clear the fixable advisories and rescope the tooling (6.1)

#### Automated

- [x] 1.1 Production-path audit clean: `npm audit --omit=dev --audit-level=high` exits 0 — 9561f1c
- [x] 1.2 Full audit: only the patch-package and shadcn chains are high or critical — 9561f1c
- [x] 1.3 One copy each of wrangler and miniflare, all four outside the advisory ranges: `npm ls wrangler miniflare undici sharp` — 9561f1c
- [x] 1.4 package.json changed only by the one removal and the seven moves: `git diff origin/master -- package.json` — 9561f1c
- [x] 1.5 Clean install from the lockfile applies the Stryker patch: `rm -rf node_modules && npm ci` — 9561f1c
- [x] 1.6 Lint passes: `npm run lint` — 9561f1c
- [x] 1.7 Type check passes: `npx astro check` — 9561f1c
- [x] 1.8 Unit tests pass: `npm run test:unit` — 9561f1c
- [x] 1.9 Build passes: `npm run build` — 9561f1c
- [x] 1.10 Prettier passes: `npx prettier --check package.json` — 9561f1c
- [x] 1.11 shadcn CLI still runs through npx: `npx shadcn@latest add --dry-run button` — 9561f1c

#### Manual

- [ ] 1.12 Owner reads the lockfile diff: about 55 in-range moves and the dev flags of the seven moved packages, nothing removed but the root entry of @eslint/config-helpers, no major bump, nothing outside the ranges in package.json

### Phase 2: Pin the runtime and complete the dotfiles (6.7, 6.5, 6.8)

#### Automated

- [x] 2.1 `nvm use` picks 22.23.3 from .nvmrc
- [x] 2.2 `npm ci` on 22.23.3 prints no EBADENGINE or EBADDEVENGINES
- [x] 2.3 Node 24 gets the EBADDEVENGINES warning from `npm run` and still runs it
- [x] 2.4 Lint passes: `npm run lint`
- [x] 2.5 Unit tests pass: `npm run test:unit`
- [x] 2.6 Example files hold only comments and `KEY=` lines, with the six schema secrets in both
- [x] 2.7 Prettier passes on the changed docs

#### Manual

- [ ] 2.8 Owner reads the Node and env-file wording in README, CLAUDE.md, AGENTS.md and the evals README

### Phase 3: Automate the watch: Dependabot and the CI audit step (6.2), docs and closing

#### Automated

- [ ] 3.1 dependabot.yml validates against the SchemaStore schema
- [ ] 3.2 actionlint passes on ci.yml (pre-existing SC2034 ignored)
- [ ] 3.3 The audit step's command passes locally: `npm audit --omit=dev --audit-level=high`
- [ ] 3.4 Lint passes: `npm run lint`
- [ ] 3.5 Unit tests pass: `npm run test:unit`
- [ ] 3.6 Prettier passes on the changed files

#### Manual

- [ ] 3.7 CI on the PR green: ci with the audit step, smoke, e2e, integration; compat skipped; ai-review reviewed; the owner reads the .github diff
- [ ] 3.8 After the merge the owner enables Dependabot security updates in Code security
- [ ] 3.9 Merge, release approved, production check and the release recorded as the next free Phase (27 today) in deployment-plan.md
- [ ] 3.10 Dependabot tab shows the configuration without errors and the first grouped PR is lockfile-only with ai-review skipped and the four CI jobs green
- [ ] 3.11 GitHub alerts after the merge: root alerts reduced to the braces chains through patch-package and shadcn, the evals keep two
