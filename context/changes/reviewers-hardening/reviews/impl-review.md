<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Reviewers hardening after PR #225 and #226

- **Plan**: context/changes/reviewers-hardening/plan.md
- **Scope**: Full plan (second full review, after both phase PRs merged and the first full review's fixes in a0c6f2b)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Reviewed state: `master` at 767dbcc (PR #229 de080b2 and PR #230 767dbcc) plus a0c6f2b (the first full review's fixes) on the unpublished branch `s-24/reviewers-hardening/close`, with the epilogue edits of `plan.md` (row 2.8 ticked with 767dbcc) and `change.md` staged. Success criteria re-run today: 63 tests in the two named files and 782 in the whole unit project, lint clean, 3 valid eval configs, `grep -rn "15 cases" README.md packages/code-reviewer` empty; criterion 1.4 re-run from the main checkout with a fresh `eval-old` worktree at 767dbcc (`results/compare-20261020T174648.json`: `nul-hidden` on `old` ends `unreviewable`, `metadata.reviewerRoot` is `/home/mariusz/code/streak-board-worktrees/eval-old`, no `Cannot find module`, 0 USD; the worktree was removed again), which replaces the phase 1 evidence file that lived in the removed tooling worktree. Every contract clause of both phases is MATCH or a review-driven extension recorded in `reviews/impl-review-phase-1.md`, `reviews/impl-review-phase-2.md` or `dry-run-results.md`; the two documented deviations (the loosened rubric of `non-english-input`, `lessons.md:213` changed to 16 cases) stand as recorded. "What We're NOT Doing" is intact: the `documentation` criterion, the schema, the verdict rule, `DEFAULT_REVIEWER_MODEL`, `.claude/review/claude-review.md`, the CLI stderr (`review.ts:79`) and the timeout are untouched, `old` ran only on `nul-hidden`, `new` once on 16 cases plus the four-run sample. Nothing new reaches the CI gate: `evals/provider.ts` and `evals/report.ts` are imported only by the unit test and each other. The `errorDetail` fields are bounded (400 characters each) and the result files are gitignored. The git call has fixed arguments, no shell and `cwd: REPO_ROOT`; probed with a linked worktree, a bare repository, no repository, a missing git, a symlinked checkout and a path with spaces, every failure falls back to this checkout. All 14 Progress rows have their evidence (commits, PR state, result files whose figures match `eval-results.md` to the fourth decimal). Re-examined and left as decided: the rubric's "the rationales" clause names text the grader cannot see (phase 2 review F1: keep the rubric that was measured; it passed in both runs); a bare e-mail address passes the checker by the plan's contract although GFM autolinks it; the real-git test at `code-reviewer-evals.test.ts:174-184` needs git 2.31 and a normal checkout (phase 1 review F6); the staged `change.md` moved the status back from `impl_reviewed` to `implemented`, which this review resets. Conservative false positives of the checker, all failing closed: a fence inside a list item with a blank line, an unclosed fence, indented code blocks, `@` or a URL inside an HTML comment, `www.` as a word, `@Injectable()` in prose.

## Findings

### F1 — A mention or link right after a code span passes `checkSummaryBody`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:127-129
- **Detail**: Fences and code spans are removed with the empty string, which glues their neighbours: ``foo`b`@octocat`` becomes `foo@octocat`, the lookbehind sees `o`, and the body passes (verified with the exported function). GitHub's mention filter works per text node and the node after `</code>` starts with `@`, so the comment would notify a user; ``foo`b`www.example.com`` passes the same way. The opposite case, ``@`x`octocat``, is flagged today although GitHub renders no mention.
- **Fix**: Replace a removed span or fence with one space instead of the empty string, and add ``foo`b`@octocat`` (rejected) and ``@`x`octocat`` (accepted) to the tests.
- **Decision**: FIXED (Fix now): removed code becomes one space; tests for ``foo`b`@octocat`` (rejected) and ``@`x`octocat`` (accepted).

### F2 — Reference-style links and `mailto:` pass the link rule

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:131
- **Detail**: `See [plan][p].` with the definition line `[p]: /context/changes/x/plan.md` has no `](` and no `https?://`, yet GitHub renders a link; `mailto:dev@example.com` passes too. `ai-review` noted the reference-style gap on PR #229 (minor), after the phase 1 review had run. A bare e-mail address passes by the plan's contract.
- **Fix**: Add `\]\[`, a definition line `^\s{0,3}\[[^\]]+\]:\s` (with the `m` flag) and `\bmailto:` to the link rule, with one test each.
- **Decision**: FIXED (Fix now): the link rule also matches `][`, a definition line and `mailto:`; one test each.

### F3 — The cap comment blames the code-span regex, but the fence regex is the quadratic one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/claude-review-dry-run.mjs:118-119 (comment), :128 (fence regex)
- **Detail**: Measured today on a body of exactly 65,536 characters: the fence regex on one run of backticks takes 2,589 ms, the code-span regex on the same body 0.4 ms; on 13,107 unclosed fence openers (` ```x `) the fence regex takes 1,074 ms. The comment reworded in a0c6f2b, like the one before it, names the code-span regex. The cause is ``(`{3,}|~{3,}).*\n``: when no newline follows, it backtracks through every run length and rescans the line each time. A lookahead after the opener, ``(`{3,}(?!`)|~{3,}(?!~))``, brings the backtick run to 0.4 ms with the same results on the probe inputs; the unclosed-opener case stays about 1 s at the cap, which the cap bounds.
- **Fix**: Anchor the fence opener with the two lookaheads and reword the comment to what remains (the fence regex is quadratic on unclosed openers, about 1 s at the cap; the cap is GitHub's limit).
- **Decision**: FIXED (Fix now): the fence opener carries the two lookaheads (0.5 ms at the cap on one run of backticks) and the comment names the remaining case, unclosed openers at about 1 s at the cap.

### F4 — Two checker tests pass without the code they name

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/claude-review-dry-run.test.ts:63-65 and :89-93
- **Detail**: The "without scanning it" test passes with the early return deleted: a scanned body of 65,536 backticks adds no mention or link failure and takes 2.6 s, under the 30 s timeout of `vitest.unit.config.ts`. The ` ```json ` fence test passes with the fence regex deleted, because the code-span regex alone strips a fence that has no blank line inside.
- **Fix**: Append `\n@octocat` to the over-limit body (with the early return the result stays the one length failure), and give the fence test a block with a blank line inside, which only the fence regex removes.
- **Decision**: FIXED (Fix now): the over-limit body ends in a mention, and the fence test has a blank line inside its block.

### F5 — The provider writes to stderr although the lint config keeps it side-effect free

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/evals/provider.ts:356-358
- **Detail**: `findMainCheckout` writes one line with `process.stderr.write` on the fallback path (phase 1 review F5). `eslint.config.js:129-131` sets `no-console: error` for the package so that "its library modules (and the eval provider) must stay side-effect free", and `evals/provider.ts` is not in the exception list (`evals/report.ts` is); the direct write sidesteps the rule instead of following it. Everything else the provider has to say goes out as data (`error`, `metadata`).
- **Fix A ⭐ Recommended**: Drop the write; the fallback stays visible as `metadata.reviewerRoot` in every result row and as the load error of `old`.
  - Strength: Respects the rule with less code; the information was already in the result file.
  - Tradeoff: No hint on the console at the moment of the fallback.
  - Confidence: HIGH — `metadata.reviewerRoot` is set on every run and the phase 1 test reads it.
  - Blind spot: None significant.
- **Fix B**: Return the note as data: `findMainCheckout` returns `{ root, note }`, `callApi` puts the note into `metadata`, and `report.ts` prints it once.
  - Strength: Keeps the hint and the rule.
  - Tradeoff: Three files and their tests for one rare message.
  - Confidence: MED — the shape of the note in the report is a design choice.
  - Blind spot: Whether anyone reads the report before the `old` load error.
- **Decision**: FIXED via Fix B: `findMainCheckout` and `resolveReviewerRoot` return `{ root, note }`, `callApi` writes the note as `metadata.reviewerRootNote`, and `report.ts` prints it once under "## Provider notes"; no write to stderr.

### F6 — `gitEnv()` passes the shell's `GIT_DIR` family to the main-checkout call

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/provider.ts:139-150
- **Detail**: `gitEnv()` spreads `process.env`, so `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` and `GIT_CEILING_DIRECTORIES` from the shell reach `git rev-parse --git-common-dir`. With `GIT_DIR` pointing at another repository's `.git`, git succeeds and a relative `reviewerRoot` is resolved against that repository without the fallback note (a bare `GIT_DIR` falls back with it). Pre-existing for the async `git()` helper; the new call adds the silent case. Rare on a developer shell.
- **Fix**: Delete the `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES` and `GIT_CEILING_DIRECTORIES` keys in `gitEnv()`.
- **Decision**: FIXED (Fix now): `gitEnv()` leaves out the seven repository variables; tested with `vi.stubEnv`.

### F7 — The closing records are still missing, and nothing waits on the owner any more

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md (no S-24 entry), context/foundation/roadmap.md:142
- **Detail**: The first full review queued both records for the archive PR while the release of #230 waited for the owner. Both `master` runs have since released, approved by the owner: 39441344500 (#229, de080b2; job 118696306021, "Remote database is up to date.", Cloudflare 96154c75-577f-4eb8-bc66-563e491913f2, tag fd3f52d → de080b2) and 39449289445 (#230, 767dbcc; job 118721909079, no migrations, Cloudflare 540e7116-cf81-4421-aa79-be55f8e57a54, tag → 767dbcc). The `production` tag is at 767dbcc and the anonymous live check today answers 200 on `/`, 200 on `/privacy` and 302 on `/dashboard`; the application did not change. The deployment plan has no S-24 entry (Phases 28 to 30 are S-20 to S-22; 27 is reserved for S-23), and the roadmap Risk line still says about 1 USD for a pass of 15 cases while step b measured 0.72 USD for 16. The lesson "Close every slice by merging to master, approving the production release and checking the production URL" asks for the entry.
- **Fix**: Write Phase 31 (S-24) with the facts above and correct the roadmap figure in this closing PR, since nothing blocks them now; the archive PR then only moves the folder.
- **Decision**: FIXED (Fix now): Phase 31 in `deployment-plan.md` and the roadmap figure, in this closing PR; the last row of Phase 31 waits for the closing PR's own release.

### F8 — The top-level Language bullet does not quote the session result the plan asked for

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:520
- **Detail**: Phase 2 change 3 says the Language bullet of `README.md` and the Known-limits bullet of the package README both "quote the result of this session". `README.md:520` states the coverage and the limits and defers the figures to `packages/code-reviewer/README.md:214`, which quotes them; the pre-change bullet deferred the same way, and no record names the deviation.
- **Fix**: Add one clause at `README.md:520`: "(16 of 16 cases at 0.84 USD on 2026-10-20, `old` not run)".
- **Decision**: FIXED (Fix now): one sentence at `README.md:520`.

### F9 — The review-fix branch does not carry the name the lesson prescribes

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: branch `s-24/reviewers-hardening/close` (local only)
- **Detail**: "Work every phase on its own branch and open a PR with gh" puts review fixes on `<roadmap-id>/<change-id>/review-fix`; this branch is named `close`. `git ls-remote` shows no `s-24/reviewers-hardening/*` head, so renaming costs nothing.
- **Fix**: `git branch -m s-24/reviewers-hardening/review-fix` before the push.
- **Decision**: FIXED (Fix now): the local branch is `s-24/reviewers-hardening/review-fix`.

## Earlier full review (a0c6f2b, 2026-10-20)

The first full review of the same scope found 0 critical, 1 warning and 5 observations; its report is in the history of this file at a0c6f2b.

| Finding                                                                                          | Decision                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| F1 The comment on the 65,536-character cap claimed it keeps the regexes from running for seconds | FIXED in a0c6f2b (comment reworded; superseded by F3 above)       |
| F2 8.4 ticked with a stale "stays open" sentence; the CI schema error has no diagnostics         | FIXED in a0c6f2b (8.4 reworded, 8.7 added with its trigger)       |
| F3 No S-24 entry in the deployment plan, stale cost figure in the roadmap                        | FIX QUEUED for the archive PR; done here as F7 above              |
| F4 The plan's Phase 2 text carries the rubric wording that was replaced                          | FIXED (one sentence in the Notes of `change.md`, staged)          |
| F5 The eval README did not warn that the report prints raw model text                            | FIXED in a0c6f2b                                                  |
| F6 The new prompt sentence is a comma-spliced list                                               | SKIPPED (a cosmetic prompt edit needs a paid pass and its own PR) |

## Triage

F1 to F9 fixed on 2026-10-20 (F5 via Fix B), in the review-fix commit of this closing PR. Gates after the fixes: 67 tests in the two named files and 786 in the unit project, `tsc --noEmit` clean, lint clean, 3 valid eval configs.
