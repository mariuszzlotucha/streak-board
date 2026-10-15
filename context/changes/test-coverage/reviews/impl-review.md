<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test coverage (S-10): risk-chosen tests, mutation-measured unit quality, e2e of the key flows

- **Plan**: context/changes/test-coverage/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 4 observations

Reviewed tree: branch `s-10/test-coverage/implementation` at `943f8e8`, 9 commits on `origin/master` (`21b7800` p1, `0e08366` p2, `99a4f77` p3, `5c803b1` p4, `a7731bf` p5, `577bb4e` + `cf6f110` + `81f9fdc` + `943f8e8` p6), not pushed, no PR. The plan was run as one goal run on one branch by the owner's decision (lessons.md "Run a whole implementation in one goal run and ship it as one PR"), so the review covers the branch before the push instead of a fresh `master`. `git diff --stat origin/master...HEAD -- src` is empty. Progress: 23 of 26 Automated rows ticked; 3.4, 4.4 and 6.2 need `gh pr checks` on the PR; all 20 Manual rows pending (none ticked without evidence).

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Verification (automated criteria re-run on 2026-10-16)

| Rows                         | Command                                                                                    | Result                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1.5, 2.5, 3.3, 4.3, 5.5, 6.3 | `npm run lint && npx astro check`                                                          | PASS (0 errors, 0 warnings, 4 hints)                                                          |
| 1.2, 4.2, 5.3                | `npm test` (stack up)                                                                      | PASS, 40 files, 743 tests (Phase 5 record: 40/743)                                            |
| 1.1, 5.3                     | `npm run test:unit` (stack stopped)                                                        | PASS, 22 files, 418 tests (22 files under `tests/unit/`)                                      |
| 1.3                          | `npm run test:mutation -- --mutate src/lib/landing.ts` (stack stopped)                     | PASS: 15 mutants, 11 runtime all `testsCompleted >= 1`, 14 Killed, 1 Survived                 |
| 1.4                          | `npm ci` in a scratch copy of package.json, package-lock.json, patches/                    | PASS: patch applied, both runner files `join(' > ')`                                          |
| 2.1–2.4, 3.1                 | `npx playwright test`                                                                      | PASS, 13 passed (setup + 6 specs × chromium, mobile-chromium)                                 |
| 3.2                          | `TEST_SUPABASE_URL=https://example.supabase.co … node scripts/e2e-user.mjs`                | PASS: "Refusing to create an E2E account on non-local Supabase host", exit 1                  |
| 4.1                          | `BASE_URL=http://localhost:4321 npm run smoke` against the preview of the current build    | PASS, 243 steps, 0 failed                                                                     |
| 5.1                          | the five S-12 unit files and `tests/integration/rule-contracts.test.ts` on `origin/master` | PASS                                                                                          |
| 5.2                          | `mutation-baseline.md`                                                                     | PASS: 14 rows; `testsCompleted: 0` only for the import-time throws and two Timeout detections |
| 5.4                          | `git diff --stat origin/master...HEAD -- src`                                              | PASS (empty)                                                                                  |
| 6.1                          | `git ls-remote --tags origin production`                                                   | PASS: `fb62d745635c6bdbd87136b2b0533ff9af86629a`                                              |
| 3.4, 4.4, 6.2                | `gh pr checks`                                                                             | PENDING (no PR yet, by design)                                                                |

Manual rows 1.6–1.7, 2.6–2.8, 3.5–3.6, 4.5–4.7, 5.6–5.8, 6.4–6.10: pending (owner).

## Findings

### F1 — Release job keeps a write-capable token in `.git/config` for every later step

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:266-273 (permissions, checkout), :311-314 (tag push)
- **Detail**: The `release` job now runs with `permissions: contents: write`, and its `actions/checkout@v4` keeps the default `persist-credentials: true`. The write token therefore sits in `.git/config` during `npm ci` (every dependency's install scripts, including the new `patch-package` postinstall), `supabase link`, `supabase db push` and `wrangler deploy`; before this change the same steps ran with a read-only token. The master ruleset still protects `master`, but the token can push any unprotected branch or tag. Only the `Mark the deployed commit` step needs to push.
- **Fix**: Add `with: { persist-credentials: false }` to the release checkout and authenticate the tag push alone: `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on that step and `git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}" refs/tags/production`.
  - Strength: least privilege with a three-line change; nothing else in the job uses git credentials (Supabase and Cloudflare use their own tokens).
  - Tradeoff: the first real release run is the only test of the step; a mistake shows as a red `Mark the deployed commit` (see F9 for making the live check still run).
  - Confidence: HIGH — the token-in-URL push is the documented pattern for `persist-credentials: false`.
  - Blind spot: a separate `tag` job after `release` would also work but would leave the tag unmoved when the live check fails while the Worker is already deployed, which is worse for `compat`; not recommended.
- **Decision**: FIXED (2026-10-16: `persist-credentials: false` on the release checkout; the tag step pushes with `GITHUB_TOKEN` in its own `env`)

### F2 — `?error=` non-reflection check skips `<script>` content for both values

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:1274-1283 (steps), :426-428 (`outsideScripts`)
- **Detail**: The plan asks that the value is "without the value in the body". Astro's inlined island runtime contains the literal `__proto__`, so the step uses `bodyNotMatches: outsideScripts(value)`, a lookbehind that ignores every `<script>` element. That is justified for `__proto__` only; for `not-a-code` the same relaxed check lets a reflection into an inline script (the classic sink) pass, while a plain `bodyExcludes` would catch it. Documented in test-plan §6.4/§6.6, so the choice is recorded, but the second value loses strength for no reason.
- **Fix**: For `not-a-code` assert `bodyExcludes: [NO_ERROR_ALERT, value]` (whole body) and keep `outsideScripts` for `__proto__` only, e.g. `bodyExcludes: value === "__proto__" ? NO_ERROR_ALERT : [NO_ERROR_ALERT, value]`.
- **Decision**: FIXED (2026-10-16: whole-body exclusion for `not-a-code`, `outsideScripts` kept for `__proto__` only; smoke re-run at the end of the triage)

### F3 — Check-off spec reloads before the save is known to have landed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/checkoff-round-trip.spec.ts:76, :88
- **Detail**: `CheckoffControl.tsx:66-88` flips the row optimistically before `sendCheckoff` resolves, so the assertions before each `page.reload()` pass on client state. The POST uses `keepalive: true` (`src/lib/checkoff-client.ts:47`) and survives the unload, but the reload's GET can be served before the insert commits, and then the risk assertion fails on a correct server. In CI (`retries: 2`) that red looks like a flake, and a genuinely intermittent lost write would also go green on retry, which is the failure the spec's header says it guards. The goal run saw exactly one red of this spec in the phone project in the first parallel run, green on 5 reruns. The control already exposes the signal: `aria-disabled` is set while the request is in flight (`CheckoffControl.tsx:122,137`) and removed on `saved`.
- **Fix A ⭐ Recommended**: Before each `reload()`, wait for the pending state to clear: `await expect(row.getByRole("button", { name: \`Undo ${title}\` })).not.toHaveAttribute("aria-disabled", "true")` after the tick, and the same on the `Mark done ${title}` button after the undo.
  - Strength: a state wait on the control's own accessible attribute, no time wait, no route knowledge in the spec; keeps the e2e rules of test-plan §6.3.
  - Tradeoff: couples the spec to the `aria-disabled` convention of `CheckoffControl.tsx`; a rename there turns the spec red (which is visible, not silent).
  - Confidence: HIGH — the attribute is present only while `pending` is true.
  - Blind spot: on a failed save the control also leaves the pending state; the post-reload assertion still catches that case.
- **Fix B**: Wrap each click in `page.waitForResponse((r) => r.url().endsWith("/api/tasks/checkoff") && r.ok())` (and `/uncheck` for the undo).
  - Strength: proves the server answered 2xx before the reload, independent of UI conventions.
  - Tradeoff: the spec learns two route paths, which the e2e rules keep out of specs; a JSON-mode change would require touching it.
  - Confidence: HIGH — the routes exist and answer JSON in island mode.
  - Blind spot: a 2xx that did not persist would still pass; the reload assertion remains the real check.
- **Decision**: FIXED via Fix A (2026-10-16: `not.toHaveAttribute("aria-disabled", "true")` waits before both reloads; spec re-run at the end of the triage)

### F4 — Invite spec cleanup skips the second step when the first throws

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/invite-join.spec.ts:25-30
- **Detail**: The comment says "Both cleanups run and both are checked", but the two awaits are sequential: when `deletePersonas` throws, `deleteAccountsByEmail` never runs and the account the sign-up form created leaks. Nothing sweeps it later: the Vitest global setup sweeps only the `vitest-` prefix (`tests/setup/constants.ts:1`) and Playwright has no global setup, so leaks accumulate on the shared local stack (Manual row 2.7 would catch it only after the fact).
- **Fix**: Run both and rethrow the first failure: `const results = await Promise.allSettled([deletePersonas(personas.splice(0)), deleteAccountsByEmail(signedUpEmails.splice(0))]); const failed = results.find((r) => r.status === "rejected"); if (failed) throw failed.reason;`.
- **Decision**: FIXED (2026-10-16: `try { deletePersonas } finally { deleteAccountsByEmail }`, which keeps the owner-first order the comment relies on and still runs the second cleanup; the membership FK is `on delete cascade`, so the order is a courtesy, not a constraint)

### F5 — `patch-package` exits 0 on a failed patch outside CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package.json:21
- **Detail**: `postinstall: patch-package` fails the install only where `ci-info` detects CI (patch-package 8.0.1, `--error-on-fail` is on by default in CI only). Locally, a runner or Vitest bump that no longer matches the patch prints a warning, keeps `nameParts.join(' ')` and reproduces the "all survived, testsCompleted 0" report that the new lesson exists to prevent; nobody sees it until the next baseline read.
- **Fix**: `"postinstall": "patch-package --error-on-fail"`, so a non-applying patch fails `npm install` everywhere.
- **Decision**: FIXED (2026-10-16: `--error-on-fail` added to the postinstall script; README Mutation testing paragraph aligned)

### F6 — `compat` committed before the two scratch-PR checks the plan puts first

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .github/workflows/ci.yml:198-259 (commit `81f9fdc`); plan.md:64, :366, :428
- **Detail**: The plan lands the `changes` output and the `compat` job "after the two scratch-PR checks (one red, one green) are done with the owner's go-ahead" and pauses "before the `compat` commit is pushed". The job is committed locally while rows 6.4 and 6.5 are unticked; the branch is not pushed, and deployment-plan.md Phase 16 records both scratch PRs as pending, so the proof is owed, not skipped. The job has never run anywhere yet.
- **Fix**: Before `git push`, with the owner's go-ahead, open the two scratch draft PRs from a branch cut off this one (a `drop column` the deployed code reads, then an additive migration), confirm `compat` red then green, close them unmerged and delete the branches; land any `compat` fix as a fixup commit on this branch, then push and record the PR numbers and run ids in deployment-plan Phase 16.
- **Decision**: FIX IN PROGRESS (2026-10-16: owner go-ahead given during triage; the two scratch PRs run right after the triage, before any push of the implementation branch)

### F7 — Third copy of the stack resolution, and the two e2e copies disagree

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/e2e-user.mjs:32-80, tests/e2e/local-supabase.ts:30-56, tests/setup/global-setup.ts:22-55
- **Detail**: The seed script resolves the stack like the Vitest global setup (`TEST_SUPABASE_*` first, else `supabase status -o env`) and guards the host; `tests/e2e/local-supabase.ts` reads only `npx supabase status -o env`. With the `TEST_SUPABASE_*` trio set, the seed account and the specs' personas can land on different stacks. Three copies of the same resolution and guard now exist.
- **Fix**: Make `local-supabase.ts` honour the same trio-or-none rule as the script (or make the script ignore it), and say in both headers which one is the reference copy.
- **Decision**: FIXED (2026-10-16: `stackFromEnv()` with the trio-or-none rule added to `local-supabase.ts`, host guard applied to the resolved stack; both files name `tests/setup/global-setup.ts` as the reference copy)

### F8 — Documentation drift and adaptations recorded only in code comments

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:146, :9; tests/unit/auth-errors.test.ts:14-17; tests/e2e/invite-join.spec.ts:48-49, :63-64; tests/e2e/checkoff-round-trip.spec.ts:51-52
- **Detail**: (a) test-plan.md:146 still says `vitest.config.ts` sets `TZ=America/Los_Angeles`; the setting now lives in `vitest.unit.config.ts` (`shared`). (b) The mapper test says its oracle was "written from the README's auth-error documentation", but the README has no GoTrue → `?error=` table (only the SMTP and log-policy notes), so the source is the module's comments and `switch`. (c) The Phase 2 adaptations (no second sign-in in the invite spec because local auto-confirm signs the member in; task join by the creator trigger instead of a client join) and the Phase 4 `outsideScripts` choice are explained only in spec comments and test-plan §6.6; the one-PR lesson wants every deviation in the PR description. (d) The test-plan header and §8 say 2026-10-15 (as the plan prescribed) while the §6.6 notes for phases 5 and 6, the baseline and deployment-plan say 2026-10-16.
- **Fix**: One-line edits for (a) and (b); carry (c) and the `fb62d74` tag note into the PR description; leave (d) as is or add "(fazy 5–6: 2026-10-16)" to the §8 line.
- **Decision**: FIXED (2026-10-16: (a) test-plan §6.1 names `vitest.unit.config.ts`; (b) the mapper test names the module's comments as its oracle; (d) §8 notes the 2026-10-16 entries; (c) goes into the PR description when the PR is opened)

### F9 — Release and compat job hygiene

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:304-316 (release), :226-232 (compat)
- **Detail**: (a) When `Mark the deployed commit` fails (token, a future tag rule), the job stops before `Check the live deployment`, so the owner sees a red release with no evidence about the Worker that was just deployed, and a re-run repeats `db push` and `deploy`; the step order itself (tag right after deploy) follows the new lesson and should stay. (b) The root `npm ci` in `compat` is unused: the stack starts from the Supabase CLI binary and build, preview and smoke run in `deployed/`; it costs about a minute on every migration PR. The plan prescribed "npm ci in both checkouts", so dropping it is a (harmless) deviation to list.
- **Fix**: (a) give the deploy step `id: deploy` and the live check `if: ${{ !cancelled() && steps.deploy.outcome == 'success' }}`; (b) drop the root `npm ci` and the root entry of `cache-dependency-path`, or keep both and accept the minute.
- **Decision**: FIXED (a) / REVERTED (b) (2026-10-16: (a) applied. (b) was applied and then undone: the first `compat` runs (scratch PRs #131 and #132) failed in "Build the deployed commit" with `Tsconfig not found astro/tsconfigs/strict`, reproduced locally: the deployed build's resolver also reads the parent directory's `tsconfig.json`, whose `extends` resolves only when the PR checkout has `node_modules`. The root `npm ci` the plan prescribed stays, with a comment that records why.)

### F10 — Harmless additions outside the contract

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/deployment/deployment-plan.md:5-6; context/foundation/test-plan.md:9; .github/workflows/ci.yml:154, :226-228
- **Detail**: Not in any phase contract: the deployment-plan frontmatter `status`/`last_updated` (it corrects a stale `phases_0-14_done` while Phase 15 is done), the test-plan header "Last updated" line, `retention-days: 7` on the Playwright failure artifact, and `cache-dependency-path` for both lockfiles in `compat`. The roadmap (`planning` → `in-progress`) and `change.md` edits are the skills' own bookkeeping. All self-consistent and harmless.
- **Fix**: Keep them; list them with the other deviations in the PR description.
- **Decision**: ACCEPTED (2026-10-16: kept; listed in the PR description's deviation list)
