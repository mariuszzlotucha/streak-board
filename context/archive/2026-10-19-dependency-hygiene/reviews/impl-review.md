<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dependency hygiene (S-23)

- **Plan**: context/changes/dependency-hygiene/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations
- **Reviewed tree**: branch `s-23/dependency-hygiene/implementation`, commits 9561f1c (p1), a0c19d2 (p2), e2ed10b (p3) and c4974ba (epilogue) on `origin/master` 39dac54; local, not pushed (the push and the single PR follow this review's triage)

## Verdicts

| Dimension           | Verdict               |
| ------------------- | --------------------- |
| Plan Adherence      | PASS                  |
| Scope Discipline    | PASS                  |
| Safety & Quality    | PASS (2 observations) |
| Architecture        | PASS                  |
| Pattern Consistency | PASS                  |
| Success Criteria    | PASS (1 observation)  |

## Findings

### F1 — Manual row 1.12 describes a lockfile diff that differs from the real one

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/dependency-hygiene/plan.md:456; context/foundation/open-items.md:78 (6.1 note)
- **Detail**: The row tells the owner to expect "about 55 in-range moves", "the dev flags of the seven moved packages" and "nothing removed but the root entry of @eslint/config-helpers". The lockfile diff `origin/master..9561f1c` has 49 version moves (none across a major; wrangler 4.151.0, @cloudflare/vite-plugin 1.64.0, miniflare 5.20261012.0-beta, undici 7.29.1, sharp 0.35.5, devalue 5.9.4 as planned), 27 removed entries (`node_modules/wrangler/node_modules/esbuild@0.28.1` and its 26 `@esbuild/*` platform packages: wrangler 4.131.1 pinned esbuild 0.28.1 as a nested copy, wrangler 4.151.0 pins 0.28.2, which is the root copy, so npm deduped it), 0 additions and 352 entries newly flagged `dev`. Of the seven moved packages only four gain the flag: `zod` stays production through `astro` (`^4.5.4`) and `@astrojs/sitemap` (`^4.3.6`), `@types/react` and `@types/react-dom` through `@astrojs/react`'s peers. The 9561f1c commit body and the 6.1 note give the 49 moves but not the removals, so the owner's read of the diff meets 27 deletions nothing told them about.
- **Fix**: Add one sentence to the 6.1 note in `context/foundation/open-items.md` (27 removed lockfile entries are wrangler's nested esbuild 0.28.1 deduped onto the root 0.28.2; `zod` keeps no dev flag because astro depends on it) and repeat the numbers in the PR description, so row 1.12 is ticked against the real diff. The plan's phase text is not edited.
- **Decision**: FIXED (Fix now, 2026-10-19: the 6.1 note in open-items names the 27 dedupe removals and the four dev flags; the PR description repeats the numbers)

### F2 — Open-items notes cite branch SHAs that only a merge commit keeps

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/foundation/open-items.md:78, 82-84
- **Detail**: The 6.1, 6.5, 6.7 and 6.8 notes cite `9561f1c` and `a0c19d2`. The repository allows squash and rebase merges (`allow_squash_merge` and `allow_rebase_merge` are both true in the repository settings), either of which rewrites those commits and leaves the notes pointing at SHAs absent from `master`. Every PR so far was merged with a merge commit (#204 → 39dac54), so the SHAs hold under the repository's convention only, and the branch must not be rebased or amended before the merge.
- **Fix**: Merge the PR with a merge commit (say so in the PR description) and let the closing docs PR add the PR number next to each SHA, as the notes already announce.
- **Decision**: FIXED (Fix now, 2026-10-19: the 6.1 note says the SHAs stay in `master`'s history because the PR is merged with a merge commit; the PR description states the requirement)

### F3 — A registry outage reddens the required `ci` check and the README does not name the re-run

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:67-68; README.md:496
- **Detail**: `npm audit` calls the registry's bulk-advisory endpoint on every run; when it is unreachable npm exits 1 with `ENOAUDIT` ("audit endpoint returned an error"), the step fails and `ci` is a required check of the `master` ruleset. The plan accepts this (Performance Considerations: "a registry outage fails the step, re-run the job"), but the README's `ci` bullet documents only the advisory case, so a reader meeting a red audit step on an unrelated PR is sent to the break-glass instead of to the re-run button.
- **Fix**: Add to the README `ci` bullet: a registry outage (`ENOAUDIT`) is cleared by re-running the job, not by a PR.
- **Decision**: FIXED (Fix now, 2026-10-19: README `ci` bullet gained the `ENOAUDIT` re-run sentence)

## Success criteria check

Every `#### Automated` row was re-run in this review on Node 22.23.3 / npm 10.9.9 (`source ~/.nvm/nvm.sh && nvm use`), on the committed tree c4974ba, with a clean working tree before and after.

| Row              | Command                                                                   | Result                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 / 3.3        | `npm audit --omit=dev --audit-level=high`                                 | PASS (found 0 vulnerabilities)                                                                                                                                                                 |
| 1.2              | full-audit allow list (plan one-liner)                                    | PASS (high/critical: @ts-morph/common, braces, fast-glob, find-yarn-workspace-root, micromatch, patch-package, shadcn, ts-morph)                                                               |
| 1.3              | `npm ls wrangler miniflare undici sharp`                                  | PASS (one wrangler 4.151.0, one miniflare 5.20261012.0-beta, undici 7.29.1 in the 7.x copy and 8.12.2 under unifont, sharp 0.35.5)                                                             |
| 1.4              | `git diff origin/master -- package.json`                                  | PASS (one removal, seven moves with their ranges, `devEngines` after `overrides`)                                                                                                              |
| 1.5              | `rm -rf node_modules && npm ci`                                           | PASS as `npm ci` alone (`rm -rf` is denied by `.claude/settings.json`; `npm ci` removes node_modules itself, proven by a marker file; exit 0; `patch-package 8.0.1` applied the Stryker patch) |
| 1.6 / 2.4 / 3.4  | `npm run lint`                                                            | PASS                                                                                                                                                                                           |
| 1.7              | `npx astro check`                                                         | PASS (0 errors, 0 warnings, 5 hints)                                                                                                                                                           |
| 1.8 / 2.5 / 3.5  | `npm run test:unit`                                                       | PASS (42 files, 690 tests)                                                                                                                                                                     |
| 1.9              | `npm run build`                                                           | PASS                                                                                                                                                                                           |
| 1.10 / 2.7 / 3.6 | `npx prettier --check` on the union of the three rows' files              | PASS                                                                                                                                                                                           |
| 1.11             | `npx shadcn@latest add --dry-run button`                                  | PASS (exit 0)                                                                                                                                                                                  |
| 2.1              | `nvm use` picks `.nvmrc`                                                  | PASS (v22.23.3)                                                                                                                                                                                |
| 2.2              | `npm ci` log free of EBADENGINE / EBADDEVENGINES                          | PASS (0 lines)                                                                                                                                                                                 |
| 2.3              | Node 24 `npm run lint` prints `npm warn EBADDEVENGINES` and passes        | PASS (Node 24.21.0, npm 11.19.0)                                                                                                                                                               |
| 2.6              | example files: only comments and `KEY=` lines, six schema secrets in both | PASS                                                                                                                                                                                           |
| 3.1              | SchemaStore `dependabot-2.0.json` via `ajv-cli@5`                         | PASS (`.github/dependabot.yml valid`)                                                                                                                                                          |
| 3.2              | `actionlint:1.7.7 -ignore 'SC2034' .github/workflows/ci.yml`              | PASS                                                                                                                                                                                           |

Manual rows 1.12, 2.8, 3.7, 3.8, 3.9, 3.10 and 3.11 are `[ ]`, none ticked without evidence; all need the PR, its merge, the release or the first Dependabot PR.

## Notes

- Plan adherence: the five verbatim contracts (`.github/dependabot.yml`, the `ci.yml` step, `.editorconfig`, the `.env.example` tail, `.dev.vars.example`) are byte-identical to the plan; `.nvmrc` is `22.23.3` plus newline; `devEngines` has the plan's keys and values one per line (Prettier); the lessons entry differs from the contract only in capitalised first letters. Phase 3 item 6 (deployment-plan record) is written after the release in the closing docs PR, as planned. "What We're NOT Doing" holds in full: no `engines`, no `.npmrc`, no `github-actions` ecosystem, no `src/` change, no `overrides`, no major bump, `node-version: 22` untouched in all six jobs.
- Scope: the additions beyond the contract text are sentence-level and accurate (README: "and continue", the step name and a cross-link in the `ci` bullet, the exact-pins sentence and the evals-entry detail in Dependency updates; CLAUDE.md: the literal warning code; open-items intro: the state line); the roadmap S-23 flip to `in-progress` is mandated by `/10x-goal-implement`.
- Verified in this review: `npx` and `npm exec` do print `npm warn EBADDEVENGINES` on npm 11.19.0 (Node 24, this repository) and on npm 10.9.9 (a probe project pinned to `20.x`), so the README and 6.7 statements about `npx` and the husky hook stand (a reviewer's reading of npm's source suggested otherwise and was refuted by the probe).
- Safety: the audit step sits in the `ci` job, a required check of the ruleset (`integration`, `ai-review`, `ci`, `smoke`, `e2e`, `compat`), without `continue-on-error` or `if:`; `permissions` unchanged; lockfile-only Dependabot PRs hit `review.yml`'s `:(exclude)package-lock.json`, so the gate ends `skipped`; every installer runs plain `npm ci`; nothing under `src/` imports a moved package at runtime (`@import "shadcn/tailwind.css"` is build-time); every lockfile entry resolves to registry.npmjs.org with `integrity`.
- Pre-existing, left by the plan's contract: `.env.example` lines 1-2 keep `###` placeholders while every other line is `KEY=`.
- Not verifiable before the PR: Dependabot's server-side acceptance of the config and that security updates follow `versioning-strategy` (row 3.10); the `ci` build on a Dependabot PR with empty `SUPABASE_URL`/`SUPABASE_KEY` (both `optional: true` in `env.schema`; the first bot PR proves it); the updater's Node and npm versions (dependabot-core, as read during planning).
