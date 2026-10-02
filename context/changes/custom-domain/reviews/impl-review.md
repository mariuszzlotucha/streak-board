<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Custom domain Implementation Plan

- **Plan**: context/changes/custom-domain/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

Mode: two read-only sub-agents (plan drift; safety, quality and patterns) plus the main session's own gate runs. Scope guard: `git diff 7df2c1b..HEAD` touches README.md, wrangler.jsonc, deployment-plan.md, roadmap.md, plan.md, change.md and the review reports; nothing under `src/`, `supabase/`, `tests/` or `.github/`. All 38 Progress rows are ticked. Evidence re-run by the sub-agents and the main session on 2026-10-02: apex `/` 200, `/auth/signin` 200, `/dashboard` 302 to `https://streakboard.app/auth/signin`, `/auth/callback` 302 to `...?error=link_expired`; old host `/`, `/dashboard`, `/auth/signin` all 404; `PRODUCTION_URL` reads back `https://streakboard.app`; release run 36991982924 (PR #61) and 37017866589 (PR #62) both `success`, the second with "No targets deployed for 10x-astro-starter" and the check against `https://streakboard.app`; `dist/server/wrangler.json` carries `workers_dev: false` and `preview_urls: false` with no `routes`; the certificate claim re-verified with `openssl`; no token, key or one-time link in the changed files; no stale `workers.dev` reference in `src/`, `scripts/`, `tests/`, `ci.yml` or `package.json`.

Not verifiable from the repo (owner reports only): Supabase panel values, the Cloudflare panel state, the browser flows.

## Verdicts

| Dimension           | Verdict                   |
| ------------------- | ------------------------- |
| Plan Adherence      | PASS                      |
| Scope Discipline    | PASS                      |
| Safety & Quality    | PASS                      |
| Architecture        | PASS                      |
| Pattern Consistency | PASS (1 observation)      |
| Success Criteria    | WARNING (owner-only rows) |

## Findings

### F1 — Owner-only rows are ticked with no trace in the repo

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/custom-domain/plan.md (rows 4.7, 4.9, 4.10, 4.11)
- **Detail**: These rows rest on the owner's reply "ok, sprawdzaj" to the list of post-release steps, which Claude read as confirmation of the whole list. Phase 10 says so honestly ("reported by the owner ... no separate details were given"), but the Progress ticks read as full evidence. The Supabase panel state (4.9) and the sign-up after the removal (4.10) leave no trace that can be checked from the CLI, and 4.11 bundles four sub-checks into one report.
- **Fix**: Keep the ticks and add "(owner-reported)" to those four rows, so the Progress section carries the same caveat as Phase 10.
- **Decision**: FIXED (Fix now): rows 4.7, 4.9, 4.10 and 4.11 in plan.md Progress carry "(owner-reported)" after the SHA; ticks stay

### F2 — Phases were merged in pairs, which weakens the canary

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Implementation Approach ("one PR per phase", two separate canaries)
- **Detail**: Phases 1+2 (PR #61) and 3+4 (PR #62) shipped as combined PRs at the owner's request. Row 3.5 is therefore proven by the combined release, which also turned `workers.dev` off. In practice nothing went wrong: the release passed on the new host, so the bot-protection question has a clean answer, and PR #61's release had already shown that a normal deploy leaves the domain alone. The deviation is disclosed in Phase 10 and in both PR bodies.
- **Fix**: None needed; mention it as a conscious deviation in the closing PR description.
- **Decision**: FIXED (Fix now): the conscious deviation is stated in the PR #63 description; no file change

### F3 — `wrangler.jsonc` comment does not say why the two keys are `false`

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: wrangler.jsonc:15-18
- **Detail**: Both comment lines are about `routes` and the dashboard-attached domain, but they sit above `workers_dev` and `preview_urls`. A later editor sees two keys set to `false` with no reason; the explanation (a deploy would turn `workers.dev` back on without them) is only in the README.
- **Fix**: Add one comment line above the two keys, for example: "`workers_dev` and `preview_urls` stay false: without them a deploy turns workers.dev back on (README 'Custom domain')." A comment change does not alter the built config.
- **Decision**: FIXED (Fix now): comment line added above `workers_dev` in wrangler.jsonc; the built config still prints `false false`

### F4 — README does not say a dashboard toggle of `workers.dev` is undone by the next deploy

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md, "Custom domain" (after the `workers_dev` paragraph)
- **Detail**: The Phase 4 rollback in the plan switches `workers.dev` back on in the dashboard first and adds that the next deploy turns it off again while the file says `false`. The README carries the first half only, so a reader who toggles it in the dashboard loses it on the next release.
- **Fix**: Add one clause: to bring `workers.dev` back for good, set `workers_dev: true` in `wrangler.jsonc`; a dashboard toggle is reverted by the next deploy.
- **Decision**: FIXED (Fix now): README "Custom domain" says a dashboard toggle is reverted by the next deploy and `workers_dev: true` is the lasting way back

### F5 — The "Changing the production address" checklist has no step for attaching the host

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md, "Custom domain" checklist (step 1)
- **Detail**: Step 1 says "make sure the new host answers", which implies the Cloudflare Domains & Routes step but never names it, although the first paragraph of the section makes that the owner's job. The plan's own seven-step list had the same gap.
- **Fix**: Reword step 1 to: attach the new host as a Custom Domain in the Cloudflare dashboard and make sure it answers (`/` 200, `/dashboard` 302 to its `/auth/signin`).
- **Decision**: FIXED (Fix now): README checklist step 1 now names attaching the Custom Domain in the dashboard

### F6 — Phase 10's first bullet still points to a README section "added in a later phase"

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md (Phase 10, first bullet)
- **Detail**: The bullet says "see README 'Custom domain', added in a later phase". The section exists now, so the phrase reads as a stale forward reference.
- **Fix**: Drop ", added in a later phase".
- **Decision**: FIXED (Fix now): ", added in a later phase" dropped from the first Phase 10 bullet

### F7 — Roadmap baseline line and S-06 status still describe the old state

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md:76 (baseline "Cloudflare Workers pod adresem `workers.dev`"); S-06 `Status: in-progress`
- **Detail**: The baseline line is stale, but the plan lists it as out of scope. The S-06 status is `in-progress` until `/10x-archive` closes the slice ("Roadmap statuses stay with the skills").
- **Fix**: None in this PR; the baseline line is a one-word follow-up for whoever next edits the roadmap, and `/10x-archive` sets `done`.
- **Decision**: SKIPPED: out of scope per the plan; `/10x-archive` sets the roadmap status to done
