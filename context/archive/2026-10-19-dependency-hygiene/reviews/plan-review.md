<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Dependency hygiene (S-23) Implementation Plan

- **Plan**: `context/changes/dependency-hygiene/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-19
- **Verdict**: REVISE → SOUND after the triage fixes of 2026-10-19 (all five findings fixed in the plan)
- **Findings**: 1 critical, 1 warning, 3 observations

## Verdicts

| Dimension             | Verdict                            |
| --------------------- | ---------------------------------- |
| End-State Alignment   | FAIL (1 finding)                   |
| Lean Execution        | PASS                               |
| Architectural Fitness | PASS                               |
| Blind Spots           | WARNING (1 warning, 1 observation) |
| Plan Completeness     | PASS (2 observations)              |

## Grounding

17/17 paths ✓, 10/11 claims ✓ (shadcn "never imported" ✗ → F1), brief↔plan ✓.

Confirmed on the way: `ci` is one of the six required checks of the ruleset "master protection" (`integration`, `ai-review`, `ci`, `smoke`, `e2e`, `compat`); Dependabot alerts are on and "Dependabot security updates" off (`automated-security-fixes`: `enabled: false`); `shadcn add --dry-run` exists and ran non-interactively on today's tree without writing (exit 0, `git status` unchanged); the drafted `dependabot.yml` is Prettier-clean with the repo config; `.gitignore` ignores `.dev.vars` by exact name, so `.dev.vars.example` is tracked; `.prettierignore` leaves `.github/*.yml` to Prettier (no automated gate formats YAML, so rows 3.6 matter); the ai-review skip path holds by file order: `review.yml:137-145` computes the diff with the five exclusions, `action.yml:68-95` (`prepare`) writes `outcome=skipped` on an empty diff before `setup-node`, `npm ci` and the key (`:121`), and `review.yml:283-296` passes on `skipped`. A Dependabot-triggered run gets the job's `permissions` (GitHub docs "Troubleshooting Dependabot on GitHub Actions": "You can use the `permissions` key in your workflow to increase the access for the token"), so the label DELETE at `review.yml:110` answers 404, not 403; the plan's phrase "a read-only token" should read "unless the workflow's `permissions` raises it, as `review.yml` does". `tests/unit/lockfile-sources.test.ts:17-27` asserts registry URLs and integrity on both lockfiles (covered by every `test:unit` row); no test parses `ci.yml`, `dependabot.yml`, `package.json` keys, `.nvmrc` or `.env.example`. Workers Builds is disabled (`README.md:263`), so no Cloudflare-side npm runs. `.editorconfig` values agree with `.prettierrc.json`.

## Findings

### F1 — `npm uninstall shadcn` breaks the build

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 step 2; Desired End State; rows 1.2, 1.12, 3.11
- **Detail**: The plan says shadcn "appears in comments and docs only" (`plan.md:19`, `:93`; research §3; health-check fix 2 "two CSS comments"). It is a live import: `src/styles/global.css:12` `@import "shadcn/tailwind.css";` (since `ccffaf4`, 2026-09-25), resolved through the package export `"./tailwind.css"` → `dist/tailwind.css` (629 lines of `@custom-variant` blocks and utilities). `src/components/ui/alert-dialog.tsx:24,46` use its `data-open:`/`data-closed:` variants. Without the package, Tailwind fails the build ("Can't resolve 'shadcn/tailwind.css'"), so rows 1.7 (`astro check`) and 1.9 (build) go red and the declared end state "shadcn gone from `package.json`" is unreachable. The package is consumed at build time only, which is what `devDependencies` means.
- **Fix A ⭐ Recommended**: Move `shadcn` to `devDependencies` with the six others; uninstall only `@eslint/config-helpers`
  - Strength: No `src/` change; every CI job and the reviewer action run plain `npm ci`, so the CSS is there wherever the app builds; `npm audit --omit=dev` still drops the six highs, so Phase 3's gate is unchanged; the CLI path and `CLAUDE.md` stay true.
  - Tradeoff: The six highs stay in the full audit and as GitHub alerts (scope `development`), like the patch-package chain: row 1.2's allow list grows by `shadcn`, `ts-morph`, `@ts-morph/common`, `fast-glob`; rows 1.12 and 3.11, Desired End State, Overview, the brief and the open-items 6.1 tick are reworded ("seven packages move; only `@eslint/config-helpers` leaves").
  - Confidence: HIGH — the import resolves from `node_modules` at build; compiled with the repo's `@tailwindcss/node`.
  - Blind spot: Whether shadcn's chain ever gets an in-range fix (the bot would bring it; the alerts stay until then).
- **Fix B**: Inline the two variants into `global.css`, drop the import, uninstall as planned
  - Strength: The package and its six highs leave the tree; the allow list stays the patch-package chain.
  - Tradeoff: A `src/` change in a slice whose non-goals exclude `src/`, with kitchen-sink, smoke and screenshot checks to prove the dialog animation unchanged; every future `npx shadcn add` may expect other variants of that file (`data-checked`, `data-selected`, …), so the registry drift returns.
  - Confidence: MEDIUM — the two variants are 14 lines; the file's role for future components is unmeasured.
  - Blind spot: The keyframes and utilities nothing uses yet.
- **Decision**: FIXED via Fix A (shadcn → devDependencies; only @eslint/config-helpers uninstalled), 2026-10-19

### F2 — `onFail: error` meets runtimes the plan does not control

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 2 step 1; Critical Implementation Details; Migration Notes; Phase 3 (Dependabot)
- **Detail**: Two consumers of npm run outside the `nvm use` shell the plan prescribes. (1) Dependabot: its npm updater runs on Node 24 with npm 12.2.0 (dependabot-core `npm_and_yarn/Dockerfile`: `NODEJS_VERSION=24`, `NPM_VERSION=12.2.0`; "Using node version: 24.21.0" in a 2026-09-28 update log) and reads neither `.nvmrc` nor `engines`. With the plan's `devEngines` every command it issues trips the check; updates go through only because Dependabot passes `--force` on `npm install`, `npm update` and `npm audit fix` (`file_updater/npm_lockfile_updater.rb`, `native_helpers.rb`), which npm turns into a warning (`lib/base-cmd.js` `checkDevEngines`: `if (force) return`, identical in npm 11.19 and 12.2.0); its one unforced call, the peer-conflict check `npm install --dry-run=true`, fails and is rescued as "no conflicts". The plan does not know this; row 3.10 would find a failure only after the merge. (2) This machine: the Claude Code hooks run `npx eslint`, `npx vitest related`, `npx vitest run` and `npx astro check` (`.claude/hooks/lint-edited-file.sh:24`, `related-tests.sh:27`, `end-of-turn.sh:42-68`) and exit 2 on any failure; `.husky/pre-commit` runs `npx lint-staged`; `playwright.config.ts:43` runs `npm run build && npm run preview`; `claude-review.yml` has no `setup-node`. The hooks are spawned by Claude Code, not by the Bash calls the plan prefixes with `nvm use`, so from the Phase 2 commit on every Edit in the implementation session, and in the S-20..S-22 sessions once they merge `master`, reports a bogus error and the Stop hook blocks until the session itself runs on Node 22.
- **Fix A ⭐ Recommended**: `onFail: "warn"`
  - Strength: npm prints `npm warn EBADDEVENGINES …` before every command on another major and continues, which answers the health check's complaint ("nothing warned"); Dependabot no longer depends on its own `--force`; hooks, husky, GUI commits and the parallel sessions keep working; the run still writes the lockfile on Node 22.
  - Tradeoff: No hard stop: a Node 24 shell can still install, commit and write an npm-11 lockfile, as today, now with a warning.
  - Confidence: HIGH — `warn` was probed on this machine (runs); the mechanism is npm's own.
  - Blind spot: Whether the owner wants a hard stop at all; a warning is easy to tune out.
  - Edits: Phase 2 step 1 contract and sentence; Desired End State bullet 2; Current State "Node."; Key Discoveries (+ Dependabot runtime and `--force`); Critical Implementation Details; Phase 2 note; Migration Notes; row 2.3 (grep the warning); `README.md:18` and `CLAUDE.md:58` wording; a dated correction under 6.7 in `owner-decisions.md`; the brief's Node-pin row, Phase 2 risk and criterion 2.
- **Fix B**: Keep `error`; document the `--force` dependence; make the npm callers outside the nvm shell Node-aware
  - Strength: The hard stop stays: nothing on this machine commits an npm-11 lockfile.
  - Tradeoff: A guarded `[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" && nvm use --silent` line in the three hook scripts and `.husky/pre-commit` (four more files, nvm-specific); the parallel sessions restart from a Node 22 shell after merging `master`; GUI git clients still need husky's `~/.config/husky/init.sh`; the bot works only while Dependabot keeps `--force`.
  - Confidence: MEDIUM — the hook plumbing is untested, and whether Claude Code's hook shell sources the profile (Node 24 again) is unverified.
  - Blind spot: The hook shell's PATH source.
- **Decision**: FIXED via Fix A (`onFail: warn`; Dependabot runtime and hooks recorded; owner-decisions corrected), 2026-10-19

### F3 — Three npm majors write the lockfile

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 Implementation Note (first bot PR)
- **Detail**: The run writes with npm 10.9 (Node 22), this machine with 11.19, Dependabot with 12.2.0 (npm 12.0.0 of 2026-07-08 lists no lockfile format change), and CI's `npm ci` (npm 10.9) reads whatever the bot wrote. The plan names churn from the run only.
- **Fix**: In the first-bot-PR note, add: read its lockfile diff for format-only churn and expect `ci` green; a red `npm ci` there is the trigger to align the npm major in the workflow, not a plan item today.
- **Decision**: FIXED (first-bot-PR note and the brief's risks), 2026-10-19

### F4 — Audit step red with a fix available has no stated path

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 step 3 (`ci` bullet); Migration Notes
- **Detail**: Both texts cover only "no in-range fix" (the break-glass). The usual case is a new high in a transitive package with an in-range fix: the step blocks every PR until someone runs `npm update <name>` or merges the Dependabot security PR (Dependabot fixes transitive packages exactly that way, `npm update <name> --force --package-lock-only`).
- **Fix**: One sentence in both places: "with an in-range fix, `npm update <name>` (lockfile only) in a PR of its own or the bot's security PR; without one, the break-glass".
- **Decision**: FIXED (in-range-fix path in the README contract and Migration Notes), 2026-10-19

### F5 — Closing records assume numbers that exist only later

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 steps 5 and 6
- **Detail**: Step 5 ticks open-items "with the date and the PR", but the PR is opened after the run and the impl review; step 6's "Phase 27" may be taken by a parallel session's closing PR first (lesson: each session takes its own Phase number).
- **Fix**: Tick with the date in Phase 3; the PR number and the Phase number ("the next free one, 27 today") land in the closing docs PR together with the release record.
- **Decision**: FIXED (date-only ticks; PR number and the next free Phase in the closing docs PR), 2026-10-19
