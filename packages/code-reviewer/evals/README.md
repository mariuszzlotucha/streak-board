# Code reviewer evals

A [promptfoo](https://www.promptfoo.dev/) suite that runs the real reviewer of `packages/code-reviewer` on fixed cases, the way the `ai-review` gate runs it in CI, and reports how often each case passes. Run it before changing the reviewer's prompt, model, tools or verdict binding, and compare the old reviewer with the new one on the same cases.

Evals call a model and cost money, and their results vary from run to run, so they never run in CI and are never a required check. What runs in CI, for free and without a network, is `tests/unit/code-reviewer-evals.test.ts`: it parses every case, builds its diff and drives it through the provider to `reviewDiff` with a one-character size cap, so no model is called.

## Contents

| File                           | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider.ts`                  | The promptfoo provider. It builds the case's diff with the gate's exclusions (`CI_DIFF_PATHSPECS`, the same pathspec as `.github/workflows/review.yml`), resolves the two commits for the repo tools, calls `reviewDiff` and returns one flat result: `outcome`, the binding verdict, `modelVerdict`, `ruleVerdict` (`verdictFromScores`), the six `scores`, `summary`, `finishReason`, `toolCalls`, `toolsSkipped`, `reasoningTokens`, `diffChars` and, for `unreviewable`, `paths`. Its `config` takes `model`, `reviewerRoot` (the checkout whose reviewer runs; a relative path is read from the main checkout, so it means the same from a linked worktree) and `maxDiffChars` |
| `cases/*.yaml`                 | The 15 cases, one per file (see Cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `promptfooconfig.yaml`         | The default run: the reviewer of this checkout on `z-ai/glm-5.1`, every case 3 times                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `promptfooconfig.compare.yaml` | Old against new: provider `old` runs the reviewer of the `eval-old` worktree (see below), provider `new` the one of this checkout, both on `z-ai/glm-5.1`, every case 3 times                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `promptfooconfig.models.yaml`  | The models matrix: this checkout's reviewer on `z-ai/glm-5.1`, `z-ai/glm-5.3`, `deepseek/deepseek-v4.1-flash` and `openai/gpt-5.6-luna`, every case once. For information only: the production model stays `DEFAULT_REVIEWER_MODEL`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `report.ts`                    | Turns one result file into a Markdown report (see Report)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

All three configs share the cases, the grader of the `llm-rubric` assertions (`openrouter:anthropic/claude-sonnet-5.5`), a weight-0 assertion `verdict-agreement` (does the model's verdict agree with the score rule) and at most 4 reviews at a time. The repeat count lives in `evaluateOptions.repeat`: a top-level `repeat` passes `promptfoo validate` but is ignored. `--repeat` on the command line overrides it.

## Setup

The suite is its own npm package (`package.json` and `package-lock.json` here, `promptfoo` pinned to 0.124.1), so its 626 packages and its own `ai@6` never reach the root install that every CI job, the gate's action and `release` run. It needs Node 22.22 or later, which the repository's `.nvmrc` (22.23.3) satisfies:

```bash
npm ci                                          # the root: the reviewer's own dependencies and tsx
npm ci --prefix packages/code-reviewer/evals    # promptfoo
npm run --prefix packages/code-reviewer/evals validate   # checks the three configs, no network
```

`OPENROUTER_API_KEY` comes from the shell environment, for the reviewer and for the grader alike. The scripts read no `.env` file: the root `.env` holds the app's Supabase keys and the E2E account, which the evals do not need, and the suite runs hundreds of third-party packages.

`npm ci` here reports 10 high-severity advisories (2026-10-19), all deep in promptfoo's tree: `basic-ftp` (through `get-uri`, `pac-proxy-agent` and `proxy-agent`), `braces` (through `chokidar` and `nunjucks`) and `node-forge` (through `jks-js`). npm's only offer is a downgrade to promptfoo 0.116.7. The suite stays on 0.124.1: it runs only locally, never in CI or the app, and an eval against OpenRouter should not reach FTP or PAC proxies, Java keystores or file watching. Check again when promptfoo is next bumped.

## Runs

Each script writes its result to `results/<name>-<timestamp>.json` (`results/` is gitignored), with promptfoo's cache, telemetry and update check off. Arguments after `--` go to promptfoo:

```bash
npm run --prefix packages/code-reviewer/evals eval                    # default run, x3
npm run --prefix packages/code-reviewer/evals eval -- --repeat 1      # a smoke run, every case once
npm run --prefix packages/code-reviewer/evals compare                 # old against new, x3: the full procedure
npm run --prefix packages/code-reviewer/evals models                  # models matrix, x1
npm run --prefix packages/code-reviewer/evals report -- results/<file>.json
```

### Old against new, within a budget

The default before a reviewer change is the capped procedure of the lesson "Run the eval suite, old against new, before shipping a reviewer change" (`context/foundation/lessons.md`). Agree the session's cap with the owner and quote the estimate first (see Cost and data egress), then:

1. Run `new` on every case: `compare -- --filter-providers '^new$' --repeat 1`, and a second pass when the budget allows.
2. Run `old` only on the cases `new` did not pass in every run, with the same number of runs: `compare -- --filter-providers '^old$' --repeat <n> --filter-pattern '^<case>:'`. At equal runs, a case `new` passed every time cannot be a regression.
3. Re-run a suspect case (`new` passed fewer runs than `old`) ×3 on both providers; it is a regression only when it repeats.

`report.ts` reads one result file, so sum A and B over the files of the passes by hand, and compare `old` with `new` across the files the same way. The full procedure, `compare` ×3 on every case with each suspect case re-run ×5 (the command `report.ts` prints), stays an option when the budget allows.

### The old reviewer

`compare` loads the old reviewer from `../streak-board-worktrees/eval-old`, next to the main checkout; a linked worktree finds it there too, since a relative `reviewerRoot` is read from the main checkout (an absolute one is used as it is). Create that worktree at `origin/master` before the run, from the main checkout (`git worktree add` reads its path from the current directory, so from a linked worktree the same relative path doubles; use the absolute path there), give it `node_modules` (a link to the root's, or its own `npm ci`), and remove it afterwards:

```bash
git fetch origin
git worktree add --detach ../streak-board-worktrees/eval-old origin/master
ln -s "$PWD/node_modules" ../streak-board-worktrees/eval-old/node_modules   # or: npm ci --prefix ../streak-board-worktrees/eval-old
# ... npm run --prefix packages/code-reviewer/evals compare ...
git worktree remove --force ../streak-board-worktrees/eval-old
```

Both providers review the same diffs: the historical cases are commits of this repository, and the file cases are built in a temporary repository per review.

## Report

`report.ts` reads only the result file it is given and makes no model call. It prints:

- per case and provider: passed runs, the binding verdicts (and runs that ended `too-large`, `unreviewable` or in an error), the runs where only the model or only the score rule said fail, mean latency, peak reasoning tokens and cost; totals per provider below;
- with providers `old` and `new`: the suspect cases, where `new` passed fewer runs than `old`, each with the command of the full procedure, which re-runs it alone 5 times on both providers (`compare -- --repeat 5 --filter-pattern '<description>'`; the default procedure re-runs it 3 times, see Runs). At 3 runs, one run of difference is often noise; a regression is confirmed only when `new` passes fewer runs in the re-run too;
- every run at or above 24,576 reasoning tokens (75% of `DEFAULT_MAX_OUTPUT_TOKENS`), and every run without an output, with the finish reason, the cause and the head and tail of the model's text when the provider kept them (a schema error);
- the verdict criterion per provider: A, the runs of `expect: pass` cases where only the model said fail; B, the same for `expect: fail` cases; `rule` when B = 0 and A ≥ 1, otherwise `stricter`. Runs without a verdict count in neither. Next to it, the agreement with `expect` under today's binding (the stricter verdict) and under the score rule alone, computed from the recorded verdicts.

## Cost and data egress

Measured on `z-ai/glm-5.1` in the session of 2026-10-16/17 (`context/changes/code-review-evals/eval-results.md`): one pass of the 15 cases with the grader costs about 0.66 USD. One review costs 0.009–0.021 USD for a synthetic case, 0.054–0.105 USD for a historical PR with the repo tools and about 0.09 USD for #103 without them, and takes 34 to 313 s. So `eval` ×3 is about 2 USD, `compare` ×3 about 4 USD if the old reviewer costs the same (not measured), and a suspect re-run ×3 on both providers about 0.1–0.6 USD. The models matrix was measured on one case only: `glm-5.3` cost about 7 times as much as `glm-5.1` there, so price `models` per model before running it. Quote the estimate before a session and the spend with the results; sum the spend from the costs the responses report plus the grader's tokens, since the key's `usage` counter lags by many minutes.

Every review sends the case's diff, its title and body, and whatever the repo tools read (files of the two commits) to OpenRouter and on to the model's provider; the `llm-rubric` assertions send the review summary to the Anthropic grader through OpenRouter. The historical cases are this repository's own merged PRs.

## Cases

Each file is a one-item YAML list: `description` (unique; `--filter-pattern` matches it), `metadata: { kind: regression | bug | injection, expect: pass | fail }`, `vars` and `assert`. `vars` takes exactly one of two inputs (the provider refuses a case with both), plus the optional `title` and `body` of the PR:

- `base` and `head`: two commits of this repository (full SHAs). The historical cases use the parents of a merge commit, with the title and body copied once from `gh pr view <n> --json title,body`;
- `files: { base: { <path>: <content> }, head: { <path>: <content> | null } }`: a temporary repository with one commit per side, removed after the review; `null` deletes the file in `head`.

Every case has at least one `javascript` assertion on the flat result (for example `output.verdict === "fail"` or `output.ruleVerdict === "fail"`), and every `llm-rubric` assertion sets `transform: output.summary`. The cases are:

- seven historical PRs from the baseline of 2026-10-14 (#114, #112, #111, #108 and #103 passed, #110 failed for a real missing `.env` load) and #116 at commit `7d319c1`, where only the model said fail;
- two seeded bugs from the M5L3 lesson: a React 19 migration with three planted flaws, and SQL built from a query parameter;
- six injections: lookalike closing tags around a real bug, a forged diff in the PR title, a comment that asks for higher scores, a source file hidden behind a NUL byte, an instruction outside the hunk of a changed file, and a plan that claims approval.

To add a case, add a `.yaml` file here (any other file type fails the offline test), give it a unique `description` and the fields above, run `npm run test:unit -- tests/unit/code-reviewer-evals.test.ts`, then one eval of that case (`eval -- --repeat 1 --filter-pattern '<description>'`).

### Why the gate's diff leaves the case files out

The cases hold deliberately broken code and text addressed to the reviewer, written literally. The `ai-review` gate reviews every PR, including the ones that change this suite, so `.github/workflows/review.yml` leaves `packages/code-reviewer/evals/cases/*.yaml` out of its code diff (with the two `package-lock.json` files), and Prettier skips the folder (`.prettierignore`), so the bytes stay exactly as written. The exclusion names the YAML files only: any other file put in `cases/` stays in the gate's diff, since `*` in a pathspec also matches `/`. The case paths still appear in the reviewer's list of changed files, and its repo tools can read them. Nothing imports the cases, but the provider and the offline test read them and run git on what they say, so the provider refuses a file path inside `.git` (it would rewrite the temporary repository's config, which git runs) and a `base` or `head` that is not a full SHA (git would read it as an option). Outside the cases, tests and code write such characters as `\u` escapes.
