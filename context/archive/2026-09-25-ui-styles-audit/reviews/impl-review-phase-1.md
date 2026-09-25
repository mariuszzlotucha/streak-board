<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Signin: tokeny presetu shadcn i komponenty z `ui/`

- **Plan**: context/changes/ui-styles-audit/plan.md
- **Scope**: Phase 1 of 5
- **Reviewed phases**: 1
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Evidence

- Commit under review: f19263b, amended during triage to ccffaf4 (F2) (`feat(ui-styles-audit): Preset tokens and before screenshots (p1)`).
- Token parity: `:root` 32/32, `.dark` 31/31, `@theme inline` 40/40 variables identical to `tokens-source/preset-b7Br7G9Kq.global.css` (scripted comparison).
- `components.json` is identical (key by key) to `tokens-source/preset-b7Br7G9Kq.components.json`.
- Lockfile: 289 packages added, 0 removed, 0 version changes vs. parent commit. Every new package's `engines.node` is satisfied by `.nvmrc` 22.14.0 (highest requirement: `shadcn` >=20.18.1).
- Automated criteria re-run: build exit 0, lint exit 0, `--background: oklch(1 0 0)` at `global.css:14`, `utility bg-cosmic` at `global.css:125`, `tokens-source` file present.
- Manual: 1.6 evidenced by the two PNGs in the commit; 1.7 and 1.8 confirmed by the user (anonymous pages and the Outfit woff2 in the build checked separately; authenticated `/dashboard` was not inspected by the reviewer).

## Findings

### F1 — Unplanned changes: landing hero and lessons.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/Welcome.astro:21; context/foundation/lessons.md
- **Detail**: Plan "What We're NOT Doing" explicitly leaves the red hero (`Welcome.astro:21`) untouched, yet `bg-red-600` was removed in f19263b. `context/foundation/lessons.md` was also created, which no phase lists. Both were requested by the user during the session and are harmless, but the plan (the source of truth for later reviews) still says otherwise.
- **Fix**: Add a short addendum to plan.md recording both user-requested changes and amending the `Welcome.astro:21` exclusion.
- **Decision**: Fixed via Fix (addendum added to plan.md before `## Progress`)

### F2 — Commit f19263b lacks the required Co-Authored-By trailer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: commit f19263b, now ccffaf4 (message footer)
- **Detail**: The session's attribution rule requires commit messages to end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. The phase-1 commit was created without it. The implement skill forbids `--amend`, so the trailer was not added afterwards.
- **Fix**: Leave the commit as is and add the trailer to every later commit, or amend f19263b (local, unpushed) only with the user's explicit approval.
- **Decision**: Fixed via Fix (f19263b amended with the trailer, message only; unpushed; new SHA ccffaf4, Progress rows updated)

### F3 — `cn` npm package is now a hoisted transitive dependency

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package-lock.json (`node_modules/cn`, pulled in by `shadcn`); affects Phase 2 gate 2.2
- **Detail**: `shadcn` depends on the `cn` package, so `import { cn } from "cn"` (the quirk seen in the scratch output) now resolves silently and the build would not fail. The only guard is Phase 2 criterion 2.2 (`! grep -rn 'from "cn"' src`).
- **Fix**: Run 2.2 right after `shadcn add` in Phase 2 and fix any hit to `@/lib/utils`; no plan change needed.
- **Decision**: Fixed via Fix (no edit needed now; gate 2.2 to be run immediately after `shadcn add` in Phase 2)
