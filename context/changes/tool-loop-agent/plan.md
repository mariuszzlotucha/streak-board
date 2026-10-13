# Modular ToolLoopAgent Code Reviewer Implementation Plan

## Overview

Turn `packages/code-reviewer` from a one-file script into a small, modular code-review agent built on the AI SDK 7 `ToolLoopAgent`: the structured-output schema and the prompts live in their own modules, a config module owns the model and the budget limits, and an agent module exports a reusable reviewer (`createReviewer` + `reviewDiff`) through a side-effect-free barrel, so a promptfoo provider can import it later. `review.ts` becomes a thin CLI. No eval environment is configured in this change.

## Current State Analysis

- `packages/code-reviewer/review-schema.ts:24-99` mixes three concerns: the zod schemas (`ReviewCriterion`, `ReviewCriteria`, `ReviewResult`), the system prompt (`REVIEWER_PROMPT`, lines 82-92) and `REVIEW_JSON_SCHEMA` (line 99).
- `packages/code-reviewer/review.ts:6-23` builds the agent inside `review()`, hard-codes `z-ai/glm-5.1`, inlines the Polish user prompt (`Zrecenzuj ten diff:\n\n${diff}`), runs at top level (reads stdin, `process.exit`, prints), and does not load `dotenv`. It cannot be imported without running a review.
- The demos `review-with-session.ts`, `cost-report.ts`, `rules-inject.ts` each construct their own `ToolLoopAgent` with the same hard-coded model; `review-with-session.ts:4-5` imports `REVIEWER_PROMPT`/`ReviewResult` from `review-schema.ts` and `readDiff` from `utils.ts`.
- `cost-report.ts:8,20-25` already shows how to read the OpenRouter cost: `openrouter(model, { usage: { include: true } })` and `providerMetadata.openrouter.usage.cost`.
- `utils.ts:1-9` `readDiff()` returns `undefined` and prints a bare `"error"` when stdin is a TTY or empty.
- The package has no `package.json`; it uses the root `ai@7.0.139`, `@openrouter/ai-sdk-provider@^3.1.0`, `zod@^4`, `tsx`. `npm run review` = `git diff | tsx packages/code-reviewer/review.ts` (root `package.json:18`). Root `tsc` covers it (no errors today); ESLint covers it (0 errors, 10 `no-console` warnings). `dotenv` is only a transitive dependency.
- AI SDK 7: `stepCountIs` is an alias of `isStepCount` (`node_modules/ai/dist/index.d.ts`, export list); the docs use `isStepCount`. `ToolLoopAgent` accepts the `generateText` settings (`maxOutputTokens`, …), `output: Output.object({ schema })`, and `generate()` returns `output`, `usage`, `steps` (`node_modules/ai/docs/03-agents/02-building-agents.mdx`).
- CLAUDE.md (M5L2 hard rules): the schema is the contract; pin `ai@7` / provider `@3`; log usage of every review and set a budget limit before running unattended.

## Desired End State

```
packages/code-reviewer/
  schemas/review-result.ts   ReviewCriterion, ReviewCriteria, ReviewResult (+ types), REVIEW_JSON_SCHEMA
  prompts/reviewer.ts        REVIEWER_INSTRUCTIONS, buildReviewPrompt(diff)
  config.ts                  DEFAULT_REVIEWER_MODEL, DEFAULT_MAX_STEPS, DEFAULT_MAX_OUTPUT_TOKENS, resolveReviewerModel(env)
  agent.ts                   createReviewer(options), reviewDiff(diff, options) → ReviewRun
  index.ts                   public barrel (no side effects)
  review.ts                  CLI: git diff | npm run review
  utils.ts                   readDiff()
  review-with-session.ts, cost-report.ts, rules-inject.ts   demos, rewired, behaviour unchanged
  README.md
```

`review-schema.ts` is gone. Importing `packages/code-reviewer/index.ts` reads no stdin, makes no network call and prints nothing. `git diff | npm run review` prints the same `ReviewResult` JSON on stdout as before, plus one usage/cost line on stderr.

### Key Discoveries:

- Schema field names, descriptions and the bare `z.number()` score (`review-schema.ts:14-23`) are the contract; move them byte-for-byte, including the Anthropic min/max comment.
- OpenRouter cost is per step in `providerMetadata.openrouter.usage.cost` and only present with `usage: { include: true }` (`cost-report.ts:8,20-22`).
- `review-with-session.ts` reuses the structured reviewer and passes `messages` instead of a prompt — `createReviewer()` must return the plain `ToolLoopAgent` so that still works.

## What We're NOT Doing

- No promptfoo config, provider file, datasets or eval scripts (future change).
- No automated tests (decision: typecheck + manual run only); no Vitest/`MockLanguageModel` suite.
- No hard USD budget / abort on cost; the budget is the step limit plus `maxOutputTokens`. A USD gate belongs to the CI gate / evals.
- No change to the six criteria, verdict values, field names or prompt wording (schema-is-contract rule).
- No separate `package.json`/workspace for the package; no dependency changes (`dotenv` stays transitive).
- No tools for the agent (`tools: {}` stays); no streaming.
- No CI wiring of `npm run review`.
- No fix for `rules-inject.ts`'s missing skill file: it reads `packages/anthropic/.claude/skills/greeting/SKILL.md` (`rules-inject.ts:7`), which does not exist, so it throws ENOENT before any model call — today and after this change. It only gets the model-id rewire.

## Implementation Approach

Split by concern first, then put the agent behind one factory and one convenience function that returns the output together with usage and cost, so both the CLI and a future eval provider consume the same call. Only the CLI reads the environment; library modules take explicit options and fall back to config constants.

## Critical Implementation Details

- **Branch base (deviation from lessons).** `packages/code-reviewer` exists only in commit `7f607bc` ("m5l2") on `m5l2-package-code-review`, not on `origin/master`. The planning branch `tool-loop-agent/plan` and every phase branch are cut from `m5l2-package-code-review` instead of fresh `master` (stacked), so their PRs show the m5l2 diff until it merges; once m5l2 is on `master`, rebase the open branches onto `origin/master`.
- **Side-effect-free imports.** `agent.ts`, `index.ts`, `schemas/*`, `prompts/*` and `config.ts` must not import `dotenv/config`, read stdin, call `process.exit` or log. Only `review.ts` and the demos do. promptfoo imports the module in its own process; a top-level stdin read would hang it.
- **Cost across steps.** With `maxSteps` 2 a review may take two model calls; `costUsd` is the sum of `providerMetadata.openrouter.usage.cost` over `result.steps`, and `null` (not `0`) when no step reports a cost, so "unknown" is not mistaken for "free".

## Phase 1: Modules, Agent and Public API

### Overview

Extract schema, prompts and config into their own modules, build the reusable agent and the barrel, delete `review-schema.ts`, and repoint every import so the package typechecks. `review.ts` switches to `reviewDiff` with its current output unchanged.

### Changes Required:

#### 0. Baseline snapshot (before any edit)

**File**: `<scratchpad>/reviewer-baseline.json` (not committed)

**Intent**: Capture the contract text before moving it, so criterion 1.6 can prove the move was verbatim.

**Contract**: `npx tsx -e "import('./packages/code-reviewer/review-schema.ts').then(m => console.log(JSON.stringify({ schema: m.REVIEW_JSON_SCHEMA, prompt: m.REVIEWER_PROMPT }, null, 2)))" < /dev/null > <scratchpad>/reviewer-baseline.json`

#### 1. Schema module

**File**: `packages/code-reviewer/schemas/review-result.ts` (new); `packages/code-reviewer/review-schema.ts` (deleted)

**Intent**: Move the zod schemas, their inferred types and `REVIEW_JSON_SCHEMA` out of `review-schema.ts` unchanged, with the existing doc comments (including why `score` is a bare `z.number()`).

**Contract**: Exports `ReviewCriterion`, `ReviewCriteria`, `ReviewResult` (value + same-named type) and `REVIEW_JSON_SCHEMA` (`z.toJSONSchema(ReviewResult, { target: "draft-07" })`); field names, descriptions and enum values identical to `review-schema.ts:24-99`.

#### 2. Prompts module

**File**: `packages/code-reviewer/prompts/reviewer.ts` (new)

**Intent**: Hold the system prompt and the user-prompt builder so evals can vary or snapshot them without touching the agent.

**Contract**: `REVIEWER_INSTRUCTIONS` — the text of `REVIEWER_PROMPT` (`review-schema.ts:82-92`) verbatim, with its doc comment; `buildReviewPrompt(diff: string): string` returning exactly `` `Zrecenzuj ten diff:\n\n${diff}` `` (the current `review.ts:16` text).

#### 3. Config module

**File**: `packages/code-reviewer/config.ts` (new)

**Intent**: One place for the default model and the per-run budget limits, plus the env lookup the CLI and demos use.

**Contract**: `DEFAULT_REVIEWER_MODEL = "z-ai/glm-5.1"`, `DEFAULT_MAX_STEPS = 2`, `DEFAULT_MAX_OUTPUT_TOKENS = 16384` (a per-call cost ceiling, not a target: reasoning tokens may count towards it, and a cut-off answer is invalid JSON, so leave headroom; say so in its doc comment); `resolveReviewerModel(env: NodeJS.ProcessEnv = process.env): string` returns the trimmed `env.REVIEWER_MODEL` when non-empty, else `DEFAULT_REVIEWER_MODEL`. Pure: reads only the object it is given.

#### 4. Agent module

**File**: `packages/code-reviewer/agent.ts` (new)

**Intent**: Build the structured-output reviewer once per configuration and offer a single call that returns the verdict with its usage and cost, so the CLI and future eval providers share it.

**Contract**:

- `type ReviewerOptions = { model?: string; maxSteps?: number; maxOutputTokens?: number }` — `model` is an OpenRouter model id; omitted fields fall back to the config defaults (not to the environment).
- `createReviewer(options?: ReviewerOptions)` → `ToolLoopAgent` with `model: openrouter(modelId, { usage: { include: true } })`, `instructions: REVIEWER_INSTRUCTIONS`, `tools: {}`, `output: Output.object({ schema: ReviewResult })`, `stopWhen: isStepCount(maxSteps)`, `maxOutputTokens`.
- `type ReviewRun = { output: ReviewResult; usage: LanguageModelUsage; costUsd: number | null; model: string; finishReason: FinishReason }` — `finishReason` from the final step, so a run cut off by the token ceiling (`"length"`) is visible.
- `reviewDiff(diff: string, options?: ReviewerOptions & { abortSignal?: AbortSignal })` → `Promise<ReviewRun>`: throws an `Error` for an empty/whitespace-only diff before any model call; otherwise `createReviewer(options).generate({ prompt: buildReviewPrompt(diff), abortSignal })`; `usage` is the total usage; `costUsd` per Critical Implementation Details.
- Errors from the SDK (e.g. schema validation, API errors) propagate unchanged.

#### 5. Public barrel

**File**: `packages/code-reviewer/index.ts` (new)

**Intent**: The single import point for consumers (future promptfoo provider, other scripts).

**Contract**: Re-exports `createReviewer`, `reviewDiff`, `ReviewerOptions`, `ReviewRun`; the schema module's exports; `REVIEWER_INSTRUCTIONS`, `buildReviewPrompt`; the config constants and `resolveReviewerModel`. Nothing else; no side effects.

#### 6. Repoint existing callers

**File**: `packages/code-reviewer/review.ts`, `packages/code-reviewer/review-with-session.ts`

**Intent**: Keep the package compiling after `review-schema.ts` is deleted. `review.ts` calls `reviewDiff(diff)` and prints `run.output` exactly as today; `review-with-session.ts` imports `REVIEWER_INSTRUCTIONS`/`ReviewResult` from the new modules (its agents are rewired in Phase 2).

**Contract**: No `review-schema` import remains in the package; `review.ts` stdout unchanged (`JSON.stringify(output, null, 2)`).

### Success Criteria:

#### Automated Verification:

- No reference to the old module remains: `grep -rn "review-schema" packages/code-reviewer` prints nothing
- Type checking passes with no errors under `packages/`: `npx tsc --noEmit -p .`
- Linting passes with 0 errors: `npx eslint packages/code-reviewer`
- The barrel imports without side effects and exposes the API: `npx tsx -e "import('./packages/code-reviewer/index.ts').then(m => console.log(['createReviewer','reviewDiff','ReviewResult','REVIEW_JSON_SCHEMA','REVIEWER_INSTRUCTIONS','buildReviewPrompt','resolveReviewerModel'].every(k => k in m)))" < /dev/null` prints `true` and exits without waiting on stdin
- Schema and prompt text are byte-identical to the baseline: the same `tsx -e` command against `./packages/code-reviewer/index.ts` (with `prompt: m.REVIEWER_INSTRUCTIONS`) piped into `diff <scratchpad>/reviewer-baseline.json -` prints nothing

#### Manual Verification:

- `git diff HEAD~1 | npm run review` prints a valid `ReviewResult` JSON (six criteria, verdict, summary), same shape as before the change

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: CLI, Demos and Docs

### Overview

Make `review.ts` a proper thin CLI (env, model override, cost logging, clear error on empty input), move the demos onto the shared config and factory, and document the package.

### Changes Required:

#### 1. Thin CLI

**File**: `packages/code-reviewer/review.ts`, `packages/code-reviewer/utils.ts`

**Intent**: The CLI loads `.env`, picks the model via `resolveReviewerModel()`, runs `reviewDiff`, prints the `ReviewResult` JSON on stdout and one usage/cost line on stderr (stdout stays pipeable JSON). Missing input gets an actionable message instead of `"error"`.

**Contract**: `import "dotenv/config"` first; stdout = `JSON.stringify(output, null, 2)` only; stderr = one line with model, `finishReason`, input/output/total tokens and `cost_usd` (or `unknown` when `costUsd` is `null`); exit code 1 on missing/empty stdin with `readDiff()` printing `error: no diff on stdin (usage: git diff | npm run review)`; exit code 1 with the error message on a failed review.

#### 2. Demos on shared modules

**File**: `packages/code-reviewer/review-with-session.ts`, `packages/code-reviewer/cost-report.ts`, `packages/code-reviewer/rules-inject.ts`

**Intent**: Remove the duplicated hard-coded model and reviewer construction; each demo keeps its current prompts, output and side effects.

**Contract**: `rules-inject.ts` gets only the model-id rewire (its ENOENT is out of scope, see What We're NOT Doing). `review-with-session.ts` uses `createReviewer({ model: resolveReviewerModel() })` as the structured reviewer and `buildReviewPrompt(diff)` for the first message, keeping its recaller agent and follow-up question local; `cost-report.ts` and `rules-inject.ts` take their model id from `resolveReviewerModel()` (`cost-report.ts` writes that id into `cost.json`). `stepCountIs` → `isStepCount` throughout the package.

#### 3. Package README

**File**: `packages/code-reviewer/README.md` (new)

**Intent**: Explain how to run the reviewer and how to consume it programmatically, so the future eval change starts from documented API.

**Contract**: Sections: module map; CLI usage (`git diff | npm run review`, `OPENROUTER_API_KEY`, `REVIEWER_MODEL`); programmatic usage (`import { reviewDiff } from "./packages/code-reviewer"` → `ReviewRun`); budget (default step and token limits, cost logged per run); the schema-is-contract rule (change schema first, then prompts, gates and evals).

### Success Criteria:

#### Automated Verification:

- Type checking passes with no errors under `packages/`: `npx tsc --noEmit -p .`
- Linting passes with 0 errors: `npx eslint packages/code-reviewer`
- No hard-coded model id outside config: `grep -rn "glm-5.1" packages/code-reviewer --include=*.ts` matches only `config.ts`
- Empty input fails fast with the new message: `printf '' | npx tsx packages/code-reviewer/review.ts; echo "exit=$?"` prints the usage error and `exit=1` without a network call

#### Manual Verification:

- `git diff HEAD~1 | npm run review` prints the `ReviewResult` JSON on stdout and one usage/cost line on stderr (`npm run review 2>/dev/null` yields pure JSON); on the largest available diff the stderr line shows finishReason `stop`, not `length`
- `REVIEWER_MODEL=<another OpenRouter id> git diff HEAD~1 | npm run review` uses that model (shown in the stderr line)
- `git diff HEAD~1 | npx tsx packages/code-reviewer/review-with-session.ts` and `npx tsx packages/code-reviewer/cost-report.ts` behave as before; `npx tsx packages/code-reviewer/rules-inject.ts` fails with the same pre-existing ENOENT for `packages/anthropic/.claude/skills/greeting/SKILL.md`
- README reads correctly and matches the exported API

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None in this change (decided: typecheck + manual run). The future eval change exercises `reviewDiff` end to end.

### Integration Tests:

- None; the barrel import check in Phase 1 proves the module is importable without side effects.

### Manual Testing Steps:

1. `git diff HEAD~1 | npm run review` → valid `ReviewResult` JSON on stdout, usage/cost line on stderr.
2. Same with `REVIEWER_MODEL` set to another id → stderr shows that model.
3. `printf '' | npm run review` → usage error, exit 1, no API call.
4. Run the demos → `review-with-session.ts` and `cost-report.ts` behave as before; `rules-inject.ts` fails with the same pre-existing ENOENT.

## Performance Considerations

Each review is capped at `DEFAULT_MAX_STEPS = 2` model calls and `DEFAULT_MAX_OUTPUT_TOKENS = 16384` per call (today there is no output cap; the ceiling is set high so reasoning tokens cannot truncate the JSON); the agent is built per `reviewDiff` call (cheap, no network), which keeps calls with different options independent.

## Migration Notes

`review-schema.ts` is removed; in-repo callers are repointed in Phase 1. `REVIEWER_PROMPT` is renamed `REVIEWER_INSTRUCTIONS` (text unchanged). `npm run review` keeps its path and stdout format.

## References

- Current reviewer: `packages/code-reviewer/review.ts:6-23`, `packages/code-reviewer/review-schema.ts:24-99`
- Cost extraction pattern: `packages/code-reviewer/cost-report.ts:8,20-25`
- AI SDK agent docs: `node_modules/ai/docs/03-agents/02-building-agents.mdx`, `node_modules/ai/docs/03-agents/04-loop-control.mdx`
- Rules: `CLAUDE.md` (M5L2 hard rules)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Modules, Agent and Public API

#### Automated

- [x] 1.1 No reference to the old module remains — 664163d
- [x] 1.2 Type checking passes with no errors under packages/ — 664163d
- [x] 1.3 Linting passes with 0 errors — 664163d
- [x] 1.4 The barrel imports without side effects and exposes the API — 664163d
- [x] 1.6 REVIEW_JSON_SCHEMA identical to the pre-change output — 664163d

#### Manual

- [x] 1.5 npm run review prints a valid ReviewResult JSON, same shape as before — 664163d

### Phase 2: CLI, Demos and Docs

#### Automated

- [x] 2.1 Type checking passes with no errors under packages/ — dbf752b
- [x] 2.2 Linting passes with 0 errors — dbf752b
- [x] 2.3 No hard-coded model id outside config — dbf752b
- [x] 2.4 Empty input fails fast with the new message — dbf752b

#### Manual

- [x] 2.5 npm run review prints JSON on stdout and one usage/cost line on stderr, finishReason stop — dbf752b
- [x] 2.6 REVIEWER_MODEL override is used — dbf752b
- [x] 2.7 Demos behave as before; rules-inject fails with the same pre-existing ENOENT — dbf752b
- [x] 2.8 README matches the exported API — dbf752b
