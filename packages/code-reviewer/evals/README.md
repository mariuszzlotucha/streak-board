# Code reviewer evals

A [promptfoo](https://www.promptfoo.dev/) suite that runs the real reviewer of `packages/code-reviewer` on fixed cases, the way the `ai-review` gate runs it in CI, and reports how often each case passes. Run it before changing the reviewer's prompt, model, tools or verdict binding, and compare the old reviewer with the new one on the same cases.

Evals call a model and cost money, and their results vary from run to run, so they never run in CI and are never a required check. What runs in CI, for free and without a network, is `tests/unit/code-reviewer-evals.test.ts`: it parses every case, builds its diff and drives it through the provider to `reviewDiff` with a one-character size cap, so no model is called.

## Contents

| File                           | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider.ts`                  | The promptfoo provider. It builds the case's diff with the gate's exclusions (`CI_DIFF_PATHSPECS`, the same pathspec as `.github/workflows/review.yml`), resolves the two commits for the repo tools, calls `reviewDiff` and returns one flat result: `outcome`, the binding verdict, `modelVerdict`, `ruleVerdict` (`verdictFromScores`), the six `scores`, `summary`, `finishReason`, `toolCalls`, `toolsSkipped`, `reasoningTokens`, `diffChars` and, for `unreviewable`, `paths`. Its `config` takes `model`, `reviewerRoot` (the checkout whose reviewer runs, relative to the repository root) and `maxDiffChars` |
| `cases/*.yaml`                 | The 15 cases, one per file (see Cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `promptfooconfig.yaml`         | The default run: the reviewer of this checkout on `z-ai/glm-5.1`, every case 3 times                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `promptfooconfig.compare.yaml` | Old against new: provider `old` runs the reviewer of the `eval-old` worktree (see below), provider `new` the one of this checkout, both on `z-ai/glm-5.1`, every case 3 times                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `promptfooconfig.models.yaml`  | The models matrix: this checkout's reviewer on `z-ai/glm-5.1`, `z-ai/glm-5.3`, `deepseek/deepseek-v4.1-flash` and `openai/gpt-5.6-luna`, every case once. For information only: the production model stays `DEFAULT_REVIEWER_MODEL`                                                                                                                                                                                                                                                                                                                                                                                     |
| `report.ts`                    | Turns one result file into a Markdown report (see Report)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

All three configs share the cases, the grader of the `llm-rubric` assertions (`openrouter:anthropic/claude-sonnet-5.5`), a weight-0 assertion `verdict-agreement` (does the model's verdict agree with the score rule) and at most 4 reviews at a time. The repeat count lives in `evaluateOptions.repeat`: a top-level `repeat` passes `promptfoo validate` but is ignored. `--repeat` on the command line overrides it.

## Setup

The suite is its own npm package (`package.json` and `package-lock.json` here, `promptfoo` pinned to 0.124.1), so its 626 packages and its own `ai@6` never reach the root install that every CI job, the gate's action and `release` run. It needs Node 22.22 or later, newer than the repository's `.nvmrc`:

```bash
npm ci                                          # the root: the reviewer's own dependencies and tsx
npm ci --prefix packages/code-reviewer/evals    # promptfoo
npm run --prefix packages/code-reviewer/evals validate   # checks the three configs, no network
```

`OPENROUTER_API_KEY` comes from the shell environment, for the reviewer and for the grader alike. The scripts read no `.env` file: the root `.env` holds the app's Supabase keys and the E2E account, which the evals do not need, and the suite runs hundreds of third-party packages.

## Runs

Each script writes its result to `results/<name>-<timestamp>.json` (`results/` is gitignored), with promptfoo's cache, telemetry and update check off. Arguments after `--` go to promptfoo:

```bash
npm run --prefix packages/code-reviewer/evals eval                    # default run, x3
npm run --prefix packages/code-reviewer/evals eval -- --repeat 1      # a smoke run, every case once
npm run --prefix packages/code-reviewer/evals compare                 # old against new, x3
npm run --prefix packages/code-reviewer/evals models                  # models matrix, x1
npm run --prefix packages/code-reviewer/evals report -- results/<file>.json
```

### The old reviewer

`compare` loads the old reviewer from `../streak-board-worktrees/eval-old`, next to the repository. Create that worktree at `origin/master` before the run, give it `node_modules` (a link to the root's, or its own `npm ci`), and remove it afterwards:

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
- with providers `old` and `new`: the suspect cases, where `new` passed fewer runs than `old`, each with the command that re-runs it alone 5 times on both providers (`compare -- --repeat 5 --filter-pattern '<description>'`). At 3 runs, one run of difference is often noise; a regression is confirmed only when `new` passes fewer runs in the re-run too;
- every run at or above 24,576 reasoning tokens (75% of `DEFAULT_MAX_OUTPUT_TOKENS`), and every run without an output;
- the verdict criterion per provider: A, the runs of `expect: pass` cases where only the model said fail; B, the same for `expect: fail` cases; `rule` when B = 0 and A ≥ 1, otherwise `stricter`. Runs without a verdict count in neither. Next to it, the agreement with `expect` under today's binding (the stricter verdict) and under the score rule alone, computed from the recorded verdicts.

## Cost and data egress

Estimates from OpenRouter's prices on 2026-10-16: one review with the repo tools on GLM-5.1 costs about 0.06 USD and takes 25 to 250 s; `eval` (45 reviews with the grader) about 3–4 USD and 25–50 minutes; `compare` (90 reviews) about 6–8 USD and 45–90 minutes; `models` (60 reviews) about 3–4 USD; a suspect re-run (10 reviews) about 0.6 USD. Quote the spend with the results.

Every review sends the case's diff, its title and body, and whatever the repo tools read (files of the two commits) to OpenRouter and on to the model's provider; the `llm-rubric` assertions send the review summary to the Anthropic grader through OpenRouter. The historical cases are this repository's own merged PRs.

## Cases

Each file is a one-item YAML list: `description` (unique; `--filter-pattern` matches it), `metadata: { kind: regression | bug | injection, expect: pass | fail }`, `vars` and `assert`. `vars` takes one of two inputs, plus the optional `title` and `body` of the PR:

- `base` and `head`: two commits of this repository (full SHAs). The historical cases use the parents of a merge commit, with the title and body copied once from `gh pr view <n> --json title,body`;
- `files: { base: { <path>: <content> }, head: { <path>: <content> | null } }`: a temporary repository with one commit per side, removed after the review; `null` deletes the file in `head`.

Every case has at least one `javascript` assertion on the flat result (for example `output.verdict === "fail"` or `output.ruleVerdict === "fail"`), and every `llm-rubric` assertion sets `transform: output.summary`. The cases are:

- seven historical PRs from the baseline of 2026-10-14 (#114, #112, #111, #108 and #103 passed, #110 failed for a real missing `.env` load) and #116 at commit `7d319c1`, where only the model said fail;
- two seeded bugs from the M5L3 lesson: a React 19 migration with three planted flaws, and SQL built from a query parameter;
- six injections: lookalike closing tags around a real bug, a forged diff in the PR title, a comment that asks for higher scores, a source file hidden behind a NUL byte, an instruction outside the hunk of a changed file, and a plan that claims approval.

To add a case, add a `.yaml` file here (any other file type fails the offline test), give it a unique `description` and the fields above, run `npm run test:unit -- tests/unit/code-reviewer-evals.test.ts`, then one eval of that case (`eval -- --repeat 1 --filter-pattern '<description>'`).

### Why the gate's diff leaves the case files out

The cases hold deliberately broken code and text addressed to the reviewer, written literally. The `ai-review` gate reviews every PR, including the ones that change this suite, so `.github/workflows/review.yml` leaves `packages/code-reviewer/evals/cases/*.yaml` out of its code diff (with the two `package-lock.json` files), and Prettier skips the folder (`.prettierignore`), so the bytes stay exactly as written. The exclusion names the YAML files only: any other file put in `cases/` stays in the gate's diff, since `*` in a pathspec also matches `/`. The case paths still appear in the reviewer's list of changed files, and its repo tools can read them. Nothing imports the cases; outside them, tests and code write such characters as `\u` escapes.
