<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Code review evals and gate hardening

- **Plan**: context/changes/code-review-evals/plan.md
- **Scope**: Full plan (Phases 1–2 of 2; Phase 2's Manual rows 2.6–2.8 need the PR and are pending)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Evidence

- **Scope**:
  - The branch is `code-review-evals/implementation`, cut from `274c5f7` (the merge of PR #158).
  - Its commits are `d09ab4e` (Phase 1), `8becf54` (budget amendment), `dafab1b` (eval session), `bfeefb5` (Phase 2) and `6c1744c` (epilogue).
  - On top of them sit the owner's uncommitted ticks of rows 1.10 and 2.5, in `plan.md`, `eval-results.md` and `owner-decisions.md`.
  - Phase 2 is reviewed although rows 2.6–2.8 are open. Those rows can run only on the PR, and the lesson "Implement plans with /10x-goal-implement…" puts the review of a run's phases before the single push.
- **Plan adherence**:
  - Every code contract of Phase 1 (items 1–12) matches the plan.
  - Phase 2 took the planned branch for `stricter` (A = 0, B = 0): `agent.ts`, `review.ts` and their tests are unchanged, and the only file under `packages/` it touched is `packages/code-reviewer/README.md`.
  - Nothing from "What We're NOT Doing" appears.
  - The extras are harmless:
    - in `provider.ts`, `GIT_TERMINAL_PROMPT=0` and a path guard with its test;
    - one extra provider test;
    - `ReviewPromptOptions` exported from the barrel;
    - `mkdir -p results` in the scripts.
- **Literal attack characters**:
  - No `.ts` or `.yml` file holds one: TypeScript uses `\u` escapes, and no changed file holds a NUL byte.
  - Two older full-width lookalikes sit in `context/` (`open-items.md:53`, `plan.md:20`), which the gate's diff leaves out.
- **Automated criteria**: re-run 2026-10-17 on `6c1744c` plus the uncommitted ticks, every command without `OPENROUTER_API_KEY`.
  - 1.1/2.1 `npx tsc --noEmit -p .`: pass.
  - 1.2/2.2 `npm run lint`: pass.
  - 1.3/2.3 `npm run test:unit`: pass, 27 files and 502 tests.
  - 1.4 `npx prettier --check packages/code-reviewer .github tests README.md eslint.config.js package.json`: pass.
  - 1.5 `npm ci --prefix packages/code-reviewer/evals && npm run --prefix packages/code-reviewer/evals validate`: pass. 609 packages, the three configs are valid, and npm reports 7 high advisories (F7).
  - 1.6 actionlint 1.7.7 on both workflows: pass.
  - 1.7 CLI, stdout empty each time: pass.
    - exit 2 on empty stdin;
    - exit 3 on 300,000 characters;
    - exit 4 on `Binary files a/x.ts and b/x.ts differ`.
  - 1.8 demo: exit 3 on 300,000 characters, stdout empty: pass.
  - 1.9 gate diff of `origin/master...HEAD`: 113,176 characters, under 200,000: pass.
  - 2.4 plan command `npx prettier --check packages/code-reviewer README.md context/foundation context/changes/code-review-evals`: exit 1 (F10).
    - It fails only on `context/foundation/infrastructure.md` and `shape-notes.md`. The branch does not touch them; their last commits are from 2026-09-18 and 2026-09-16.
    - Every file the branch changes passes.
- **Manual criteria**:
  - 1.10 and 2.5 are ticked on the owner's word (2026-10-17) and recorded in `eval-results.md`.
  - 1.11–1.14 are backed by `eval-results.md` (`dafab1b`), under the budget amendment:
    - two passes of `new`;
    - no `old` run, because `new` passed every case both times;
    - the models matrix on `react19-migration` only.

    The row titles stay unchanged, as the amendment says.

  - 2.6–2.8 are pending: they need the PR, the merge and a scratch PR.
    - For 2.6, the old reviewer reviews this PR from the base commit.
    - At 113,176 characters the diff is over `MAX_DIFF_CHARS_FOR_TOOLS` (50,000), so that review runs without repo tools and cannot read the cases through a tool either.
    - For comparison, #103 (95,919 characters, no tools) took 88–105 s in the session, against the 600 s timeout.
- **Reproduced in a scratch directory** (no key, model call aborted):
  - F1: a `core.fsmonitor` command in a case's `.git/config` ran during `buildCaseInput`.
  - F2: `reviewDiff` got past the binary check on `Binary files /dev/null and b/img.png and /dev/null differ` and stopped only at the missing API key.
- **Considered, not raised**:
  - The demo has the size limit but neither the binary check nor a timeout. It is a demo, outside the plan's contract.
  - The sticky-comment filter expects `\n` right after the marker, which is what the builder writes. Row 2.6 can confirm that a second `ai-review` run edits the comment in place.
  - U+2028 and U+2029 in a raw path are folded into F2.

## Findings

### F1 — Gate-hidden case files can run commands in npm test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/provider.ts:152 (also :216, `.github/workflows/review.yml:142`, `tests/unit/code-reviewer-evals.test.ts:71-80`)
- **Detail**: `review.yml` leaves `packages/code-reviewer/evals/cases/*.yaml` out of the gate's diff as data, but the offline test sends every case through `buildCaseInput`, which runs git on what the case says.
  - `.git` paths: `fileMap` rejects absolute paths and `..` but accepts `.git/…`, so a case can overwrite the temp repo's `.git/config` after `git init`. Reproduced: a `core.fsmonitor` command written that way ran during `git add -A`.
  - Unchecked refs: `base` and `head` reach `git diff` as they are, so a value such as `--output=<path>` is parsed as an option and writes a file.
  - Where it runs: both paths run in every local `npm test` and `test:unit` and in the CI `integration` job, from a file the reviewer never sees. A PR that changes only cases ends `skipped`.
  - Local eval runs: promptfoo also runs `javascript` assertions and `transform` as code, with the key in the environment.
  - Today's 15 cases are harmless: no `.git` paths, full 40-hex SHAs, plain `output.*` comparisons.
- **Fix A ⭐ Recommended**: In `provider.ts`, reject any `.git` path segment (case-insensitive) and require `base` and `head` to be 40-hex SHAs, with a test for each. Reword "data, never imported" in `review.yml` and the evals README to say what the provider refuses.
  - Strength: closes the CI path where it starts. The change is small and the existing cases already comply.
  - Tradeoff: it is a code change before the push, so the gates run again and the PR diff grows a little.
  - Confidence: HIGH — both vectors are reproduced or plain in the code, and the fix stays inside the provider.
  - Blind spot: assertion code stays executable in local eval runs.
- **Fix B**: Fix A plus an offline-test rule that allows only `llm-rubric` and `javascript` assertions, and `transform`s, of a strict `output.*` shape.
  - Strength: no executable code can hide in a gate-hidden file, not even in local eval runs that have the key.
  - Tradeoff: more code, and a pattern every future case must fit, which makes new cases harder to write.
  - Confidence: MED — the allowed shape needs care (`output.scores.securitySafety <= 3`, `output.summary`).
  - Blind spot: other promptfoo fields that take code.
- **Decision**: FIXED via Fix A — `fileMap` in `provider.ts` refuses any `.git` path segment (case-insensitive) and `buildCaseInput` refuses a `base` or `head` that is not a 40-hex SHA, with two tests in `code-reviewer-evals.test.ts`; the `review.yml` comments and the evals README say what the provider refuses. The repro now throws `is inside .git` and runs no command; break-check: both tests red on the old provider.

### F2 — Binary check bypassed by a path ending in " and /dev/null"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/agent.ts:141 (also :165)
- **Detail**: The marker line is split at the last " and ", and a `/dev/null` side is skipped.
  - The bypass: a new NUL file at `img.png and /dev/null` prints `Binary files /dev/null and b/img.png and /dev/null differ`. The split gives `/dev/null and b/img.png`, which ends in `.png`, and `/dev/null`, so the check passes and the content stays hidden. Reproduced: `reviewDiff` got past the check.
  - The JSDoc's claim ("a side usually ends without an extension and is listed, which fails closed") does not hold for this shape, and the plan's contract has the same gap.
  - Exploiting it also needs reviewed code that loads that odd path.
  - Minor: `.` does not match U+2028 or U+2029. With `core.quotePath=false` (the local CLI only), a raw path holding one skips the check.
- **Fix**: Check every split at " and ", not just the last one, and parse with `slice` and `indexOf` instead of the regex. A line then passes only when every split leaves sides that are `/dev/null` or end with a binary extension.
  - Keep reporting the last split's sides as today, and add the `/dev/null` case to the test.
  - The existing `fish and chips.png` and `before.png and after.png` tests keep their results.
  - No eval run is needed: the check runs before the model.
- **Decision**: FIXED — `hiddenBinaryPaths` tries every split at " and " with `indexOf` and `slice` (no regular expression) and lists the last split's sides, or the first failing split's when the last one passes; a line without " and " fails closed. New tests for the `/dev/null` bypass and a raw U+2028 path; the existing tests keep their assertions (one title updated); README (Input format) updated. The repro now ends in `UnreviewableDiffError`; break-check: both tests red on the old `agent.ts`. No eval run: the check runs before the model.

### F3 — The evals README teaches the procedure and costs the session replaced

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/evals/README.md:69 (also :34-42, :63, `packages/code-reviewer/evals/report.ts:198-208`)
- **Detail**: The Phase 2 lesson "Run the eval suite, old against new, before shipping a reviewer change" makes the capped procedure the default: `new` first, `old` only where `new` slipped, suspects ×3.
  - The README still shows `compare` ×3 as the way to run old against new.
  - `report.ts` prints a ×5 re-run for each suspect.
  - "Cost and data egress" keeps the pre-session estimates: `eval` 3–4 USD, `compare` 6–8 USD, 25–250 s per review.
  - The session measured about 0.66 USD per 15-case pass with the grader, 0.009–0.105 USD and 34–313 s per review, and `glm-5.3` at about 7× the cost of `glm-5.1`.
  - So `compare` ×3 lands near 4 USD, over the owner's 3 USD cap, and the `models` figure is unmeasured.
  - The README matches the letter of Phase 1 item 13 ("szacowane koszty", estimated costs), which was written before the amendment, but the next session would quote the wrong figures and the wrong default.
- **Fix A ⭐ Recommended**: Docs only. Rewrite "Runs" and "Cost and data egress" to the lesson's default, with the full ×3/×5 as the option and the measured figures from `eval-results.md`. Say that `report.ts` reads one result file, so A and B over several files are summed by hand, and that its ×5 command belongs to the full procedure.
  - Strength: the README agrees with the binding lesson and the session data, and only Prettier has to run again.
  - Tradeoff: `report.ts` keeps printing ×5, and the README has to explain why.
  - Confidence: HIGH — every figure is in `eval-results.md`.
  - Blind spot: the old reviewer's cost was not measured.
- **Fix B**: Fix A, plus `report.ts` reads several result files and prints the ×3 re-run, with a fixture test.
  - Strength: the tool follows the default procedure, and the test also covers F4.
  - Tradeoff: new code beyond the plan, and more to review before the push.
  - Confidence: MED — merging runs from several files is not verified against promptfoo's output.
  - Blind spot: the repeat indices of runs from separate files.
- **Decision**: FIXED via Fix A — evals README: "Old against new, within a budget" with the lesson's three steps (and `report.ts` reading one file), `compare` ×3 named the full procedure, the report bullet's ×5 explained, and the measured costs in Cost and data egress.

### F4 — No unit test covers report.ts, whose counts decided the binding

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/report.ts:54-69
- **Detail**: `readRuns` and `renderReport` are exported, but no test imports them.
  - A and B, the `rule`/`stricter` result and the suspect list all come from them, and so did Phase 2's decision. It was cross-checked by hand against the run tables in `eval-results.md`.
  - On a malformed file, a `null` row throws a `TypeError`.
  - A string `cost` turns the sum into a string, and then `toFixed` throws.
- **Fix**: Add a fixture-based unit test covering:
  - A and B;
  - `rule` against `stricter`;
  - runs without a verdict left out;
  - one suspect case;
  - a row without `response`.
- **Decision**: FIXED — `describe("report.ts")` in `code-reviewer-evals.test.ts`: A, B and the binding per provider with both agreement columns, a suspect case with its re-run command, a run without a response, and a file that is not a promptfoo result.

### F5 — Lockfiles and archive types are invisible to the gate

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:142 (also `packages/code-reviewer/config.ts:90`)
- **Detail**: The gate's diff leaves out both lockfiles, now including the new `packages/code-reviewer/evals/package-lock.json`, and nothing in CI checks where their packages come from.
  - `BINARY_EXTENSIONS` lets archives and WebAssembly (`zip`, `gz`, `tgz`, `br`, `zst`, `wasm`) through without review. Before this change every binary passed, so the list narrows the gap, and it follows the plan's D4.
  - Both lockfiles are clean today: 705 and 1,265 entries, each with an `https://registry.npmjs.org/` `resolved` and an `integrity`.
- **Fix**: Add a unit test that every entry of both lockfiles has a registry `resolved` and an `integrity`; leave the extension list as planned.
- **Decision**: FIXED — `tests/unit/lockfile-sources.test.ts`: every entry of both lockfiles (links and bundled entries aside) has an `https://registry.npmjs.org/` `resolved` and an `integrity`. The extension list stays as planned.

### F6 — The workflow-step harness keeps the real HOME and PATH

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/helpers/workflow-steps.ts:196-197
- **Detail**: The harness is safe today:
  - it rebuilds the environment without `GH_TOKEN`, `GITHUB_TOKEN` or `OPENROUTER_API_KEY`;
  - the `gh` and `npm` stubs come first in `PATH`, and the `gh` stub accepts only `api`;
  - no tested step runs git or touches the network;
  - the temp directory is removed.

  But a step gets the real `HOME` and can reach the real `git`, `npx` and `curl`. A later test of "Compute the code diff" would run a real `git fetch` with the developer's `~/.gitconfig` and its credential helpers.

- **Fix**: Set `HOME` to the temp directory, and add stubs for `git`, `npx` and `curl` that fail loudly.
- **Decision**: FIXED — `HOME` is the temporary directory, and stubs for `git`, `npx` and `curl` exit 127 with a message; the workflow tests still pass.

### F7 — The evals package installs with 7 high npm advisories

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/package-lock.json
- **Detail**: `npm ci --prefix packages/code-reviewer/evals` (row 1.5, re-run 2026-10-17) reports 7 high advisories under `promptfoo@0.124.1`:
  - `basic-ftp`, through `get-uri`, `pac-proxy-agent` and `proxy-agent`;
  - `braces`, through `chokidar` and `nunjucks`;
  - `node-forge`, through `jks-js`.

  npm's only offer is a downgrade to `promptfoo@0.116.7`. The package runs only locally, never in CI or the app, and none of these paths (FTP and PAC proxies, Java keystores, file watching) should run in an eval against OpenRouter. But every install prints the warning, and the README does not mention it.

- **Fix**: Note it in the evals README with the date, and re-check on the next promptfoo bump; do not downgrade.
- **Decision**: FIXED — a dated paragraph in the evals README (Setup) on the 7 advisories and why the suite stays on 0.124.1.

### F8 — The reviewer README's case list adds up to 16

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/README.md:217 (also :180, :209)
- **Detail**:
  - Line 217 lists "seven … historical PRs, two seeded bugs, six injections and a file hidden behind a NUL byte", which adds up to 16. The NUL case is one of the six (`evals/README.md:84`).
  - Lines 180 and 209 date the runs 2026-10-16, but the second pass started at 00:01 on 2026-10-17 (`compare-20261017T000102.json`). `owner-decisions.md` and `open-items.md` say 2026-10-16/17.
- **Fix**: Write "six injections, one of them a source file hidden behind a NUL byte" on line 217, and "2026-10-16/17" on lines 180 and 209.
- **Decision**: FIXED — line 217 reads "six injections, one of them a source file hidden behind a NUL byte"; lines 180 and 209 date the runs 2026-10-16/17.

### F9 — The test plan still says it has no AI-native layer

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md:92 (also :234)
- **Detail**: §5 now lists the promptfoo suite, which uses an LLM grader, but two other sections still deny any AI-native part:
  - §3 says "Nie planuję warstwy AI-native" ("I am not planning an AI-native layer").
  - §8 says "AI-native tool references last verified: 2026-09-30 (brak narzędzi AI-native w planie)" ("no AI-native tools in the plan").

  Both statements are still true of the app, but not of the CI tooling, and the plan does not draw that line.

- **Fix**: In §3, add that the AI reviewer's eval suite (§5) tests the CI tool, not the app. In §8, update the AI-native line to 2026-10-17 with promptfoo 0.124.1.
- **Decision**: FIXED — §3 names the eval suite an exception (it tests the CI tool, not the app), §8's AI-native line is dated 2026-10-17 with promptfoo 0.124.1, and the ledger entry of 2026-10-17 says so.

### F10 — Phase 2's Prettier command cannot pass on the baseline

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/code-review-evals/plan.md:549
- **Detail**: The command checks all of `context/foundation`. Two files there were unformatted before this change: `infrastructure.md` (last commit 2026-09-18) and `shape-notes.md` (2026-09-16). The command exits 1 on those two alone. Every changed file passes, and that is what row 2.4 asks for ("on the changed files"); the run recorded the adaptation.
- **Fix**: Say so in the PR description, and leave the two files to a separate docs change.
- **Decision**: FIXED (queued) — the note goes into the PR description; listed in `follow-ups/review-fixes.md`. No file change.

## Triage

Triaged 2026-10-17 with the owner. All 10 findings were fixed: F1 and F3 via Fix A, the other eight as proposed, and F10 queued for the PR description. These checks were re-run after the fixes, every command without `OPENROUTER_API_KEY`:

- `npx tsc --noEmit -p .`: pass.
- `npm run lint`: pass.
- `npm run test:unit`: pass, 28 files and 511 tests, 9 more than before.
- Prettier, the 1.4 command and every changed file: pass.
- actionlint on both workflows: pass.
- CLI: exits 2, 3 and 4 with empty stdout.
- Gate diff against `origin/master`: about 121,000 characters, under 200,000 and still over `MAX_DIFF_CHARS_FOR_TOOLS`.
- The scratch repro of F1 and F2: both are now refused.
- Break-check: the four new F1 and F2 tests go red on the committed `provider.ts` and `agent.ts` and green on the fixed ones.
