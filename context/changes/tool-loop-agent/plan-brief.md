# Modular ToolLoopAgent Code Reviewer — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Turn `packages/code-reviewer` into a well-organized code-review agent on the AI SDK 7 `ToolLoopAgent`, with the structured-output schema and the prompts in their own modules and a reusable, importable reviewer. The goal is that a future change can point promptfoo at the exported reviewer without touching the agent; this change configures no evals.

## Starting Point

`review.ts` is a top-level script: it builds the agent inline with a hard-coded `z-ai/glm-5.1`, inlines the user prompt and reads stdin on import. `review-schema.ts` mixes the zod schemas, the system prompt and the JSON Schema. Three lesson demos duplicate the agent setup.

## Desired End State

`schemas/review-result.ts`, `prompts/reviewer.ts`, `config.ts`, `agent.ts` (`createReviewer`, `reviewDiff`) and a side-effect-free `index.ts` barrel. `git diff | npm run review` prints the same `ReviewResult` JSON as today, plus a usage/cost line on stderr; `REVIEWER_MODEL` switches the model; the demos run on the shared modules.

## Key Decisions Made

| Decision         | Choice                                                                                                                            | Why (1 sentence)                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public API       | `createReviewer(options)` + `reviewDiff(diff, opts)` → `{ output, usage, costUsd, model }`                                        | A promptfoo provider becomes one call, and evals can swap models without code changes.                       |
| Demo scripts     | Keep, rewire onto the new modules, behaviour unchanged                                                                            | Lesson material stays; no duplicated model/agent config.                                                     |
| Cost & budget    | Return usage + OpenRouter `costUsd` + `finishReason`, CLI logs them to stderr; step limit (2) + `maxOutputTokens` ceiling (16384) | Meets the "log every review, set a budget" rule without truncating the JSON; a USD gate is left to CI/evals. |
| Branch base      | Stack planning and phase branches on `m5l2-package-code-review`                                                                   | The package exists only in the unmerged m5l2 commit; rebase onto `master` once it lands (plan review F1).    |
| Model selection  | `DEFAULT_REVIEWER_MODEL` in config; factory option; CLI reads `REVIEWER_MODEL`                                                    | Library stays env-free, CLI and evals can override.                                                          |
| Tests            | Typecheck + lint + side-effect-free import check + manual run                                                                     | Owner's choice; evals will exercise the reviewer end to end later.                                           |
| Schema & prompts | Moved verbatim (`REVIEWER_PROMPT` renamed `REVIEWER_INSTRUCTIONS`)                                                                | The schema is the contract; no behaviour change in a refactor.                                               |

## Scope

**In scope:**

- Schema, prompts, config, agent and barrel modules; delete `review-schema.ts`
- Thin CLI with usage/cost logging and a clear empty-input error
- Demos rewired; `stepCountIs` → `isStepCount`; package README

**Out of scope:**

- promptfoo config, providers, datasets; automated tests
- Hard USD budget / abort; agent tools; streaming; CI wiring
- `rules-inject.ts`'s pre-existing ENOENT (missing `packages/anthropic` skill file)
- Any change to criteria, verdict values, field names or prompt text; dependency changes

## Architecture / Approach

`review.ts` (CLI: dotenv, stdin, `resolveReviewerModel`) → `reviewDiff` in `agent.ts` → `createReviewer` builds a `ToolLoopAgent` from `config.ts` defaults, `prompts/reviewer.ts` and `schemas/review-result.ts` → `generate()` → `ReviewRun` (output + summed usage/cost). Only the CLI and demos touch env, stdin or the console; `index.ts` re-exports the library for future eval providers.

## Phases at a Glance

| Phase                            | What it delivers                                                        | Key risk                                                                  |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Modules, Agent and Public API | Split modules, `createReviewer`/`reviewDiff`, barrel; callers repointed | Silent change to schema/prompt text (guarded by a baseline snapshot diff) |
| 2. CLI, Demos and Docs           | Thin CLI with cost line, demos on shared modules, README                | Demos regress (manual check only)                                         |

**Prerequisites:** branches cut from `m5l2-package-code-review` (commit `7f607bc` holds the package; not on `master` yet); `OPENROUTER_API_KEY` in `.env` for the manual runs; root dependencies installed.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- No automated tests: a regression in `reviewDiff` shows up only in the manual run or later evals.
- `costUsd` relies on OpenRouter returning `usage.cost`; it is `null` for providers that don't.
- `dotenv` is only a transitive dependency; it works today but is not declared.
- Stacked branches show the m5l2 diff in their PRs until m5l2 merges to `master`.
- The schema moves away from the lesson template's `review-schema.ts` path; the M5L3 gate and evals must import it from `index.ts` (accepted, plan review F5).

## Success Criteria (Summary)

- `npm run review` output is unchanged on stdout and gains a usage/cost line on stderr.
- `import { reviewDiff } from "packages/code-reviewer"` works with no side effects.
- `tsc` and ESLint are clean for the package; no hard-coded model id outside `config.ts`.
