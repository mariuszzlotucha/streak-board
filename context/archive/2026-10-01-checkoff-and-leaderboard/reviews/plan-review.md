<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Checkoff and leaderboard

- **Plan**: context/changes/checkoff-and-leaderboard/plan.md
- **Mode**: Deep
- **Date**: 2026-10-01
- **Verdict**: REVISE (light: four plan-text edits, no rework of the approach)
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS (1 observation) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING (2 warnings, 1 observation) |
| Plan Completeness | WARNING (2 warnings, 2 observations) |

## Grounding

27/27 existing paths ✓, 20/20 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (6 phases, 37 steps, titles identical, no checkboxes outside Progress). `docs/reference/contract-surfaces.md` is absent, so the contract-surface check was skipped.

Verified by experiment (all scratch work rolled back or stopped; nothing left behind):

- **DB model**: the Phase 2 migration exactly as written, about 60 assertions on the local stack in a rolled-back transaction: grants and RLS, insert-window edges (−8 rejected, −7 and +1 accepted, +2 rejected), 23505 / 23503 / 42501 mapping, view scoping, the `security_invoker` mutation leaks exactly as the plan expects, cascades for leave task, leave group, owner removal, delete task, delete group and delete account. The view over 90 000 rows (100 groups) returned one group's 15 rows in 30 ms. No issue.
- **Time model on the real runtime**: local workerd with the repo's compatibility date: `Intl` with `Europe/Warsaw` is correct at the day boundaries and on both DST days (23 h and 25 h).
- **Rule**: a scratch implementation of the Phase 1 contract reproduces the plan's whole oracle table; snapshot-versus-reference equivalence holds on 20 000 random histories (the optimistic tick/untick delta is always +1).
- **Origin check**: `origin-check.js` confirms form-like content type (substring match) with a foreign or missing Origin gives 403, `Accept` is never read, a JSON body bypasses the check; the new routes read only `formData()`, which rejects a JSON body.
- **Step 3 sub-agent** (six areas: origin check, smoke structure, blast radius, island patterns, test infrastructure, doc anchors) finished after the first report was shown; it confirmed every plan claim and added F4 and F8 and part of F7.

## Findings

### F1 — Rule CPU cost is unbudgeted and grows with stored history

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Performance Considerations; Phase 1 §1 `snapshotOf`; Phase 6 manual verification
- **Detail**: The plan says the computation is "linear in the number of periods and negligible against the Workers CPU budget" and gives no figure. `context/foundation/infrastructure.md:31,92` assumes the Free tier (10 ms CPU per invocation) and its own risk register names this exact risk ("load-test the leaderboard/streak-read endpoint with realistic group sizes"); `wrangler.jsonc` sets no `limits.cpu_ms` and no repo file confirms the actual plan. The dashboard recomputes every enrolment's whole history on every load. A scratch implementation of the Phase 1 contract taken literally (Set, sort, `periodsBetween` via `Date.UTC` per key) is correct but costs about 1.5 µs per stored period: 0.8–1.4 ms for 15 enrolments × 60 periods, 5.7–8.5 ms for 15 × 365 (80% ticks), 16–28 ms for 50 × 365 (warm Node, before React SSR and the Supabase client). One pass over integer day numbers (each key parsed once, sorted only when not already ascending) was about 9× cheaper (0.1 / 0.6 / 2.0 ms) and matched the reference on 5 000 random histories.
- **Fix**: Specify `snapshotOf` as a single pass over integer day numbers (no per-key Date or Set allocations); add one scale test (for example 15 enrolments × 730 periods within a deliberately generous bound, a guard against quadratic regressions, not a micro-benchmark); add a Phase 6 manual step: read the CPU time of `/dashboard` for a seeded group in Workers Logs (observability is enabled in `wrangler.jsonc`) and note it in `deployment-plan.md`.
  - Strength: No architecture change; about 9× cheaper in a prototype that matches an independent reference; keeps the pure, testable shape.
  - Tradeoff: A slightly less obvious fold; the scale test needs a generous bound to stay non-flaky in CI.
  - Confidence: HIGH for the Node numbers, MED for Workers (CPU accounting differs from Node).
  - Blind spot: The baseline CPU of today's `/dashboard` (Astro plus React SSR of about 12 islands) is unmeasured and the actual plan tier is unknown.
- **Decision**: FIXED — Fix in plan (Phase 1 §1 `snapshotOf` single pass, Phase 1 §3 scale guard, Performance Considerations with measured figures, Phase 6 manual step 6.6)

### F2 — The optimistic request has no upper bound

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 5 §1 `sendCheckoff`, §2 `CheckoffControl` pending state
- **Detail**: `sendCheckoff` has five outcomes; a request that never settles (flaky mobile network, tab frozen right after the tap) is none of them. The button stays disabled with "Done" shown and the leaderboard delta applied while nothing was saved: silent loss of the interaction the PRD calls key (`prd.md:37`). The repo already solved this for native forms: `useFormSubmitting` expires the pending state after 15 s (`src/components/hooks/useFormSubmitting.ts:3-32`); the plan reuses neither that nor an equivalent.
- **Fix**: In `sendCheckoff` add `signal: AbortSignal.timeout(15_000)` (same bound as `PENDING_TIMEOUT_MS`) and `keepalive: true`; map an abort to `failed` (rollback and message); test with a never-resolving injected fetch and fake timers. A retry after a false timeout is safe because both routes are idempotent.
- **Decision**: FIXED — Fix in plan (Phase 5 §1: `keepalive` and a 15 s `AbortController`/`setTimeout` bound, abort → `failed`; §3: never-settling fetch with fake timers. Refined from the report: `AbortSignal.timeout` is not driven by fake timers, so the controller + `setTimeout` form is specified)

### F3 — Smoke misses three branches the plan specifies for the new routes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §4 versus "Critical Implementation Details" and Phase 3 §2
- **Detail**: (1) The plan says "the smoke loop proves the foreign-Origin 403 in both response modes", but the loop (`scripts/smoke.mjs:303-315`) sends no `Accept` header (`request()` sets only Cookie, Origin and Content-Type, `:52-62`) and the listed JSON steps (400, 200, 200, 403, 200, 200) contain no foreign-Origin or anonymous step. The one genuinely new boundary is unproven, including the 302 that Phase 5's `failed` branch assumes for an expired session. (2) The route contract defines "task not visible" (quiet redirect, 404 `gone`) but no step posts a well-formed unknown id, although join has exactly that step (`:907-916`). A tick after the task was deleted is the most realistic multi-user race on this page and nothing else covers it: the flow test calls `checkOff` directly, after the route's `getTask`. (3) "Every JSON answer carries Cache-Control: no-store" has no assertion; the step runner checks only status, location, Set-Cookie and body (`:1099-1107`).
- **Fix**: With the new `headers` option add steps for both routes: foreign Origin with `Accept: application/json` gives 403; anonymous with `Accept: application/json` gives 302 `/auth/signin`; a well-formed unknown task id gives a quiet 302 `/dashboard` in redirect mode and 404 `"error":"gone"` in JSON mode. For no-store either add a header check to the runner or drop the claim. Note for the implementer: the scripts ESLint config defines only `console`, `process`, `fetch`, `URLSearchParams` as globals (`eslint.config.js:76`); `Intl` and `Date` are fine, `URL`, `Headers`, `AbortSignal` and `setTimeout` would fail `no-undef`.
- **Decision**: FIXED — Fix in plan (Phase 3 §4: JSON-mode foreign-Origin, anonymous and unknown-id steps for both routes, runner response-header expectation asserting `Cache-Control: no-store`, ESLint-globals note; Critical Implementation Details now says "smoke steps")

### F4 — Types gate missing in Phases 2–4 and 6

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Automated Verification and Progress of Phases 2, 3, 4 and 6
- **Detail**: Only Phases 1 and 5 run `npx astro check`. The required CI job `ci` runs it (`.github/workflows/ci.yml:24`) and `tsconfig.json` includes `**/*`, but `npm run build` does not type-check (Astro strips types) and ESLint reports lint rules, not compiler errors. Phases 2–4 are where type errors are most likely: the regenerated `src/types.ts` with nullable view columns, the first `Promise.allSettled` over typed Supabase calls, and `.astro` and `.tsx` island props. A phase can be green locally, have its review triaged and be pushed (per the lessons), then fail the required `ci` check on the PR.
- **Fix**: Add "Types check: `npx astro check`" to the Automated Verification of Phases 2, 3 and 4, and make 6.1 `npm run lint && npx astro check && npm run build`, with matching Progress steps (next free indices).
- **Decision**: FIXED — Fix in plan (types-check bullets in Phases 2, 3, 4 and 6; Progress steps 2.7, 3.6, 4.8, 6.7. Refined from the report: Phase 6 gets its own step 6.7 instead of rewording 6.1, because Progress step titles are immutable)

### F5 — No failure path for the board computation

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §1
- **Detail**: The plan isolates the four load failures but is silent on `buildBoard` and `rankStandings`, which run in the same frontmatter. Outside the try (`src/pages/dashboard.astro:36-83`) a throw 500s the page; inside it, the catch (`:78-83`) sets `loadFailed` and hides Members and group management, against the page's own rule that secondary data must not hide task management (`:50`). This is the highest-risk code of the slice.
- **Fix**: Compute the board in its own try/catch: `console.error` and treat it as `checkoffsFailed` (note, no controls, no leaderboard).
- **Decision**: FIXED — Fix in plan (Phase 4 §1: board computation in its own try/catch, a throw becomes `checkoffsFailed` and never reaches the outer catch)

### F6 — A deviation from the PRD sentence is decided but not labelled

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Implementation Approach → Rule; Phase 1 decay table; Progress 1.5
- **Detail**: PRD Business Logic (`prd.md:97`): a miss lowers the streak "o wartość mniejszą niż jego pełny stan (nie zeruje się całkowicie)". The plan's `floor(v / 2^m)` zeroes a streak of 1 in one miss (`decayStreak(1,1)=0`, "1 → 0"). Research flagged exactly this (`research.md` Open Question 1) and the plan chose whole numbers, but never says it departs from the PRD sentence, while check 1.5 requires every expected value to be derivable "from the PRD sentence and this plan". The same holds for the PRD's two tabs (`prd.md:29`) versus the Leaderboard card, which appears only as "no tabs".
- **Fix**: Add a "Deviations from the PRD" line to the Rule decision: "a streak of 1 falls to 0 (whole numbers); a streak of 2 or more never resets in one miss; the leaderboard is a card, not a tab"; reword 1.5 to "…from the PRD sentence and the Rule decision".
- **Decision**: FIXED — Fix in plan ("Deviations from the PRD" sentence added to the Rule decision. Refined from the report: step 1.5 keeps its title because Progress titles are immutable; "this plan" in it now covers the labelled deviation)

### F7 — Four small spec corrections

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 6 §1; Phase 2 §3; Phase 6 §2 and manual 6.3
- **Detail**: (a) `AGENTS.md` is a symlink to `CLAUDE.md` (`ls -l`), so "CLAUDE.md and AGENTS.md" is one file; the second edit finds the text already changed. (b) Phase 2 §3 says anon gets "42501 on insert and no rows on select". After `revoke all … from anon` anon's SELECT is denied too, verified (anon select on the table gives 42501), and the S-03 precedent asserts the same (`supabase/checks/rls-scenarios.sql` "S-03 anon cannot read participants", `tests/integration/task-participation.test.ts` "the anonymous client is denied"); following the sentence yields a failing assertion. (c) Phase 2 allows "any timestamp later than `20261001120000`" but 6.3 and the deployment note hard-code `20261002090000_…`; `supabase migration new` stamps the real clock time. (d) Phase 6 updates test-plan §3, §5, §6.1 and §6.6 but not its "Last updated" line (`:9`), the Freshness Ledger (`:182-184`) or the stack row that says tests live in `tests/integration/` only (`:100`).
- **Fix**: Write "CLAUDE.md (AGENTS.md is a symlink to it)"; "anon → 42501 on insert and select (table and view)"; "the migration created in Phase 2 (name noted in its PR)"; add the three test-plan touch-ups to Phase 6 §1.
- **Decision**: FIXED — Fix in plan ((a) CLAUDE.md with the AGENTS.md symlink noted, (b) anon 42501 on insert and select, (c) migration name pinned in Phase 2 §1 instead of loosening 6.3 because Progress titles are immutable, (d) test-plan `:9`, `:182`, `:100` added to Phase 6 §1)

### F8 — Leaderboard rows weaken seven Members-card assertions

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §3 and §5; "Smoke-visible markup"
- **Detail**: Nothing goes red, but `memberRow(viewerEmail, "You")` matches any `<li>` holding the e-mail followed by a "You" element, so the viewer's new Leaderboard row satisfies it even if the Members card lost its marker. Seven positives are affected (`scripts/smoke.mjs:428,468,517,539,664,700,720`); the negatives (`:434,474`) stay valid only while "You" appears solely on the viewer's own Leaderboard row, and the "Owner" checks are unaffected. The plan's "Smoke-visible markup" paragraph does not mention this.
- **Fix**: Anchor `memberRow` to the Members card (start the match after the Members heading and stop at the card's `</ul>`) in the Phase 4 §5 helper changes, or accept the weaker check explicitly.
- **Decision**: FIXED — Fix in plan (Phase 4 §5: `memberRow` anchored to the Members card; "Smoke-visible markup" notes it)

## Triage summary

- **Date**: 2026-10-01
- **Fixed**: F1, F2, F3, F4, F5, F6, F7, F8 (8)
- **Skipped / Accepted / Dismissed**: none
- **Verdict after fixes**: SOUND (was REVISE)
- **Refined while applying** (each noted in its Decision line): F2 uses `AbortController` + `setTimeout` because `AbortSignal.timeout` is not driven by fake timers; F4 adds separate steps instead of rewording 6.1; F6 leaves step 1.5 as it is; F7c pins the migration name in Phase 2 instead of loosening 6.3. The reason in the last three: Progress step titles are immutable.
- **Plan after triage**: 6 phases, 42 Progress steps (new: 2.7, 3.6, 4.8 and 6.7 types check, 6.6 production CPU readout); the Progress ↔ Phase check passes (indices unique, titles identical, no checkboxes outside Progress).
