# Dependency hygiene (S-23) — Plan Brief

> Full plan: `context/changes/dependency-hygiene/plan.md`
> Research: `context/changes/dependency-hygiene/research.md`

## What & Why

The health check of 2026-10-19 found 18 high advisories in the root tree, one of them (`devalue`) in the deployed bundle, eight tooling packages listed as production dependencies, no Node pin while the local shell runs Node 24 against a Node 22 CI, incomplete env examples and no security stage in CI. S-23 (quality slice of M-4, anchor MS-04) clears the fixable advisories, rescopes the tooling, pins the runtime, completes the dotfiles, and makes new advisories reach a Dependabot PR and a blocking CI step. Nothing a user sees changes.

## Starting Point

`npm audit --omit=dev --audit-level=high` exits 1 (16 high, 2 moderate), six of the highs only because `shadcn` sits in `dependencies`. The Cloudflare plugin pins the vulnerable `wrangler`, `miniflare`, `undici` and `sharp` exactly, so the open-items update command alone would not move them. `.nvmrc` says 22.14.0, 40 packages in the lockfile claim a newer 22, this machine has no Node 22 at all, and `npm ci` runs in every CI job and in the `ai-review` action with no pin to stop a wrong major. There is no `dependabot.yml`, no `.editorconfig`, no `.dev.vars.example`.

## Desired End State

A clean production-path audit on `master` and as a gate in the `ci` job; `@eslint/config-helpers` gone, seven tooling packages in `devDependencies` (`shadcn` among them: `global.css` imports its stylesheet); `devEngines` (`onFail: warn`) and `.nvmrc` 22.23.3 so npm itself warns about another Node major on any machine or worktree; `.editorconfig`, both env templates and the four documents in step; a weekly lockfile-only Dependabot PR that passes `ai-review` as `skipped`, security updates on for the root manifest, nothing for the evals lockfile; the change released and recorded in deployment-plan.md as the next free Phase (27 today).

## Key Decisions Made

| Decision                              | Choice                                                                                                                           | Why (1 sentence)                                                                                                                                                                                                                                                                  | Source            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Update command                        | Open-items list plus `@cloudflare/vite-plugin`, `npm update` (lockfile only); `npm audit fix` without `--force` only as fallback | The plugin pins the four vulnerable copies exactly, so without it they stay; `--force` would downgrade `shadcn` and `patch-package` by a major                                                                                                                                    | Research          |
| Rescoping                             | Hand edit of `package.json`, then `npm install`                                                                                  | `npm install -D <name>` without a spec resolves `latest` and rewrites ranges                                                                                                                                                                                                      | Research          |
| `shadcn`                              | Stays, as a devDependency; only `@eslint/config-helpers` is uninstalled                                                          | `src/styles/global.css:12` imports `shadcn/tailwind.css` (alert-dialog's `data-open:` variants), so the build needs it                                                                                                                                                            | Review (F1)       |
| Node pin                              | `devEngines.runtime` node `22.x`, `onFail: warn`; `.nvmrc` 22.23.3; no `.npmrc`                                                  | `engine-strict` fails `npm ci` on 40 packages at 22.14.0 and couples installs to dependencies' claims; `devEngines` also covers `npm run` and `npx`; `warn`, not `error`, because the Claude Code hooks, GUI commits and Dependabot's updater (Node 24) run outside the nvm shell | Plan, review (F2) |
| Audit step                            | `npm audit --omit=dev --audit-level=high` in the `ci` job, blocking                                                              | Enforcement belongs in the required job; `--omit=dev` keeps the accepted `patch-package` chain out; break-glass documented                                                                                                                                                        | Plan              |
| Dependabot and `ai-review`            | `versioning-strategy: lockfile-only`, weekly, minor and patch grouped, majors ignored                                            | A Dependabot run has no Actions secrets; a lockfile-only PR has an empty code diff and passes as `skipped`                                                                                                                                                                        | Plan              |
| Security updates                      | Owner enables them; the evals entry carries `open-pull-requests-limit: 0` and `ignore` for every dependency                      | A fix reaches a PR soon after the alert; 6.9 keeps the evals directory alerts-only                                                                                                                                                                                                | Plan              |
| `patch-package` and the Stryker patch | Stay, dev-only; re-check when the runner publishes anything newer than 10.0.0                                                    | Upstream has no fix for the test-name separator                                                                                                                                                                                                                                   | Owner (6.3)       |
| Evals lockfile                        | Stays; no Dependabot PRs for the directory                                                                                       | 10 highs through `promptfoo`, whose only "fix" is a downgrade; never installed in CI                                                                                                                                                                                              | Owner (6.9)       |
| Run shape                             | Three phases, one `/10x-goal-implement` run, one branch, one PR; everything on Node 22.23.3 via `nvm use`                        | Lessons on goal runs; after Phase 2 every npm command on Node 24 warns, and the run stays on Node 22 so npm 10 writes the lockfile                                                                                                                                                | Plan              |
| Out of Dependabot's scope             | No `github-actions` ecosystem, no Dependabot secret                                                                              | A bot PR that edits `.github/` is in the reviewed diff and would fail the gate without a secret                                                                                                                                                                                   | Plan              |

## Scope

**In scope:** in-range lockfile update; `@eslint/config-helpers` removed; seven packages (`shadcn` included) to `devDependencies`; `devEngines`, `.nvmrc` 22.23.3, `.editorconfig`, `.env.example`, `.dev.vars.example`; README, `CLAUDE.md`, `AGENTS.md`, evals README; `.github/dependabot.yml`; audit step in `ci`; a lesson; open-items §6 ticks; release and its deployment-plan Phase; the first bot PR watched.

**Out of scope:** the three majors (6.4); AGENTS.md rule wording (6.6); `npm audit fix --force`; `overrides`; `engine-strict`; `node-version` changes in `ci.yml`; a `github-actions` Dependabot entry; a Dependabot secret or the label workflow; an evals audit step; a report-only or moderate-level audit; the pre-existing `SC2034` warnings in `ci.yml`; any change to `src/`, the schema, smoke or e2e.

## Architecture / Approach

Phase 1 edits the tree on the pinned Node and proves the production-path audit clean before anything gates on it. Phase 2 adds the runtime pin and the dotfiles and rewrites the four documents. Phase 3 wires the watch: Dependabot opens lockfile-only PRs that the `ai-review` gate passes as `skipped` while the four CI jobs run in full, and the `ci` job's new audit step blocks a merge on a high advisory reachable from `dependencies`. The merge is a real release (the bundle moves with `devalue` and the Cloudflare plugin), approved by the owner and checked on production.

## Phases at a Glance

| Phase                                                                           | What it delivers                                                                                                                                      | Key risk                                                                                                                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Clear the fixable advisories and rescope the tooling (6.1)                   | Lockfile with every in-range fix, `@eslint/config-helpers` gone, seven packages dev (`shadcn` stays for its stylesheet); `npm audit --omit=dev` clean | The new Cloudflare plugin (miniflare beta, workerd) changes `astro build`/`preview`; smoke and e2e on the PR are the test                        |
| 2. Pin the runtime and complete the dotfiles (6.7, 6.5, 6.8)                    | `devEngines`, `.nvmrc` 22.23.3, `.editorconfig`, both env templates, four documents                                                                   | A Node 24 shell gets the `EBADDEVENGINES` warning at every npm command and continues; a hard stop would block the hooks, GUI commits and the bot |
| 3. Automate the watch: Dependabot and the CI audit step (6.2), docs and closing | `dependabot.yml`, blocking audit step in `ci`, README CI section, lesson, open-items ticks; PR, release, deployment-plan Phase, first bot PR          | An advisory without an in-range fix blocks every PR (break-glass documented); the first bot PR's gate outcome is verified, not assumed           |

**Prerequisites:** the planning PR merged and `master` pulled; Node 22.23.3 installed with `nvm install 22.23.3` (the run does it); network to the npm registry and SchemaStore; Docker for actionlint; the owner for the Code security setting, the `release` approval and the production check.

**Estimated effort:** one `/10x-goal-implement` run of about 1-2 hours (lockfile commands and clean installs dominate), the owner's read of the lockfile diff and the docs, one PR with full CI, one release; the first Dependabot PR within about a week.

## Open Risks & Assumptions

- **The day's registry decides the exact versions**: `wrangler` 4.151.x and the miniflare beta the plugin pins; the plan names the shape (one copy each, outside the advisory ranges), not the numbers.
- **The Cloudflare plugin bump** is the one change with runtime behaviour (preview on workerd); `smoke` and `e2e` on the PR cover it. A red run means reading the plugin's changelog, not pinning a vulnerable version.
- **Lockfile churn**: Phase 1 runs on npm 10.9.9 (Node 22.23.3) while the current lockfile may come from npm 11; a format-only diff is acceptable and noted in the commit. Dependabot writes with npm 12.2.0 and CI reads with npm 10.9; the first bot PR's lockfile diff and its `ci` job show whether they agree.
- **Dependabot's first check** has no documented time; `ignore` on the evals entry is documented for version updates and expected to cover security updates (row 3.10 verifies). GitHub re-evaluates the alerts after the merge; the expected remainder (the `braces` chain, two evals alerts) is an expectation, not an observation.
- **`lockfile-only` never touches exact pins** (`@stryker-mutator/*`, `husky`, `eslint-plugin-jsx-a11y`); those stay manual.
- **`npx shadcn@latest` needs the network**; it proves the CLI path after the move.

## Success Criteria (Summary)

- `npm audit --omit=dev --audit-level=high` exits 0 on `master` and in the `ci` job, and the only high advisories left in the full tree are the two dev-only `braces` chains (`patch-package`, `shadcn`).
- A shell on Node 24 is warned by npm before every install, run and commit; `npm ci` on `.nvmrc`'s Node prints no engine warning.
- A weekly Dependabot PR arrives lockfile-only, `ai-review` passes it as `skipped`, the four CI jobs run on it; the change is released and recorded.
