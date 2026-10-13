<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Modular ToolLoopAgent Code Reviewer

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 6 observations

Reviewed `git diff c6524a6..HEAD` on `tool-loop-agent/phase-2` (PR #112 open; Phase 1 merged as #111). Findings already triaged in reviews/impl-review-phase-1.md and reviews/impl-review-phase-2.md are not repeated. All automated criteria of both phases re-run and pass (1.1–1.4, 1.6 byte-identical to the baseline, 2.1–2.4); manual checks 1.5 and 2.5–2.8 were confirmed by the user. The final module tree, the barrel exports (plan list plus the accepted `ReviewRunError` and `DEFAULT_MAX_DIFF_CHARS`), the schema/prompt contract and the side-effect-free library all match the plan; ESLint `--print-config` confirms `no-console` is an error in the library modules and off for the CLI, utils and demos.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — `maxDiffChars` is not validated; `NaN` disables the input cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/agent.ts:109-112
- **Detail**: `diff.length > NaN` is always false, so `reviewDiff(diff, { maxDiffChars: NaN })` sends any diff to the provider (probe reached the request, stopped only by the missing API key). A realistic source is `maxDiffChars: Number(process.env.X)` with X unset. `0`, negative values and `null` reject every diff with a confusing "over the 0 limit". `maxSteps` already gets this check in `resolveOptions`; `maxDiffChars` does not.
- **Fix**: Throw before any model call unless `maxDiffChars` is an integer >= 1 (or `Infinity`), mirroring the `maxSteps` check.
- **Decision**: FIXED — `reviewDiff` throws unless `maxDiffChars` is an integer >= 1 or `Infinity` (probe: NaN and 0 rejected before any call)

### F2 — The CLI imports `dotenv`, which `package.json` does not declare

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/review.ts:6 (also README.md:30)
- **Detail**: This change added `import "dotenv/config"` to the CLI (the demos already had it). `dotenv` resolves only because npm hoists it from `shadcn → @dotenvx/dotenvx → dotenv@17.4.2`; a shadcn upgrade or a nested install breaks the CLI with `ERR_MODULE_NOT_FOUND`. The plan chose "no dependency changes (`dotenv` stays transitive)", so this is a plan-level risk the implementation inherited.
- **Fix A ⭐ Recommended**: Add `dotenv` to root `devDependencies` (the installed 17.x).
  - Strength: Makes the CLI's and demos' real dependency explicit; no code change, and `dotenv/config` stays quiet on stdout.
  - Tradeoff: Goes against the plan's "no dependency changes" boundary; touches `package.json` and `package-lock.json`.
  - Confidence: HIGH — the package is already installed at that version.
  - Blind spot: None significant.
- **Fix B**: Replace the import with Node 22's `process.loadEnvFile()` in a try/catch (it throws when `.env` is missing).
  - Strength: No dependency at all; Node 22.14 is pinned in `.nvmrc`.
  - Tradeoff: The CLI and the three demos would load `.env` differently unless all four change; slightly different parsing rules from dotenv.
  - Confidence: MED — not exercised against the repo's `.env`.
  - Blind spot: Whether `.env` uses syntax dotenv accepts and Node does not.
- **Decision**: FIXED (Fix B) — `loadEnv()` in utils.ts wraps `process.loadEnvFile()` (ENOENT ignored, shell wins); used by the CLI and all three demos; no `dotenv` import left; plan addendum

### F3 — Plan documents miss the Phase 1 triage additions; `plan-brief.md` is stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/tool-loop-agent/plan.md (`## Addenda`); context/changes/tool-loop-agent/plan-brief.md:15, :68
- **Detail**: The Phase 1 triage said to record F3 "as a plan addendum", but `## Addenda` has only the Phase 2 entries. Unrecorded in the plan: `ReviewRunError` (replaces "SDK errors propagate unchanged" and changes what a returned `finishReason` can be), `DEFAULT_MAX_DIFF_CHARS` / `maxDiffChars`, `resolveOptions` with its `maxSteps` throw, and the new reading of manual check 2.5. `plan-brief.md` still says `git diff | npm run review`.
- **Fix**: Add a dated "Phase 1 review triage" addendum covering these, and update the two `plan-brief.md` lines to the `npx tsx` command.
- **Decision**: FIXED — Phase 1 triage addendum in plan.md; plan-brief.md:15,68 point at the `npx tsx` command

### F4 — Unrelated files rode along in Phase 1

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/simple-code-reviewer/change.md; .agents/skills/, .claude/skills/ symlinks, skills-lock.json
- **Detail**: Commit 664163d ("Stage all", approved for that commit) added an empty change scaffold `simple-code-reviewer` (`status: new`, placeholder notes) that `/10x-status` will list as an open change, and the vendored ai-sdk skills, which the 664163d message does not mention. Both are already on master via #111.
- **Fix**: Remove `context/changes/simple-code-reviewer/` if it is not a planned change, and mention the vendored skills in the PR description.
- **Decision**: FIXED — `context/changes/simple-code-reviewer/` removed; vendored skills noted in the PR description

### F5 — `maxSteps` has no effect without tools, but the docs present it as a call budget

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/agent.ts:143-146; README.md:87; config.ts:10
- **Detail**: The generate loop runs another step only after client tool calls (`node_modules/ai/dist/index.js:5890`). With `tools: {}` every review is exactly one model call, so `DEFAULT_MAX_STEPS = 2` never allows a second call, and the `resolveOptions` comment "any other value would never stop the loop" cannot happen today. The SDK's default `maxRetries: 2` also allows up to three HTTP requests per call on 429/5xx, which the budget table does not mention.
- **Fix**: State in the README budget row and the `resolveOptions` comment that, with no tools, a review is one model call (plus up to two SDK retries) and `maxSteps` matters only once tools exist.
- **Decision**: FIXED — README budget row and `resolveOptions` comment: one model call without tools; README notes the SDK `maxRetries: 2`

### F6 — `maxOutputTokens: null` from an untyped caller removes the token ceiling

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/agent.ts:148
- **Detail**: The destructuring default applies only to `undefined`; `null` passes it and the SDK's `!= null` check, so the call goes out with no ceiling (probe reached the provider). The SDK rejects `0` and `1.5`, but inside `generate()` rather than next to the `maxSteps` check.
- **Fix**: Resolve `maxOutputTokens` with `?? DEFAULT_MAX_OUTPUT_TOKENS` and validate it (integer >= 1) in `resolveOptions`.
- **Decision**: FIXED — `resolveOptions` uses `??` and requires `maxOutputTokens` to be an integer >= 1

### F7 — "Never as a returned `ReviewRun`" overstates the `length` contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/agent.ts:37-41; README.md:77
- **Detail**: The SDK parses the output whenever the last step did not end in `tool-calls` and has text (`dist/index.js:5954`), so a step ending in `length`, `content-filter` or `other` whose text happens to be schema-valid JSON is returned as a `ReviewRun`. Rare, but the docs promise it cannot happen.
- **Fix**: Reword to "a cut-off answer is normally invalid JSON and throws `ReviewRunError`; check `finishReason` on a returned run".
- **Decision**: FIXED — `ReviewRun.finishReason` doc and README say a cut-off answer that still parses is returned

### F8 — `readDiff` assumes Buffer chunks and trims diff content

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/utils.ts:19-28
- **Detail**: `chunk as Buffer` holds only while nobody calls `setEncoding` on stdin; with string chunks `.length` counts UTF-16 units and `Buffer.concat` throws. `.trim()` also strips a trailing blank context line of the last hunk, so that hunk no longer matches its header count (harmless to the model).
- **Fix**: Normalise chunks with `Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)` and use `trim()` only for the emptiness test, stripping just trailing newlines from the returned diff.
- **Decision**: FIXED — `readDiff()` normalises string chunks with `Buffer.from` and strips only trailing newlines

### F9 — `sumStepUsage` treats `null` differently from the SDK's own sum

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/agent.ts:174-175
- **Detail**: The failure-path sum tests absence with `=== undefined`, while the SDK's `addLanguageModelUsage` (`dist/index.js:2532`, not exported) uses `== null`, so a provider `null` is summed as 0 instead of printed as `unknown`.
- **Fix**: Use `a == null && b == null` in the `add` helper.
- **Decision**: FIXED — `add` helper uses `== null`
