<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard UI Implementation Plan

- **Plan**: context/changes/dashboard-ui/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-10-12
- **Verdict**: APPROVED (after triage: F2–F6 fixed, F1 skipped)
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Scope and evidence

- **Code reviewed.** Commit `d52fa40` on `s-11/dashboard-ui/phase-1` (not pushed), compared with `master` at `2ec358b`. The diff has 81 files, 38 of them screenshots.
- **Plan adherence.** All 11 planned changes match the plan's intent, and nothing planned is missing.
  - The `dashboard.astro` frontmatter lines kept for S-12 are byte-identical to master `:18-38`.
  - The view template is unchanged apart from `user?.id` → `viewerId` and `user?.email` → `email`.
  - The smoke diff is +12/−0.
- **Unplanned files.**
  - `.claude/settings.local.json` (F1).
  - Workflow bookkeeping, which is expected: S-11 `planning` → `in-progress` in `roadmap.md`, the `change.md` status, and the Progress ticks.
- **Accepted deviation.** `PendingInviteCard.astro:15` keeps `className="break-words"` on its `CardTitle`, although the contract names wrapping only for `GroupHeaderCard`. The old `<h2>` already had that class, so long group names still wrap; no change needed.
- **Later phases.** Phase 2 relies on `CardTitle as`, `Badge`, `NativeSelect`, the `SubmitButton` options, the `--success`/`--warning` tokens, the kitchen sink and the `controls` screenshot set. All of them are in place (`controls` is already implemented).

## Success criteria (Phase 1)

| #         | Check                                     | Result                                                                                                 |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1.1       | `npm run lint`                            | PASS, exit 0                                                                                           |
| 1.2       | Guard probe on `MembersCard.astro`        | PASS, exit 1 with the guard's message                                                                  |
| 1.3       | Literal scan of the view files            | PASS, no output                                                                                        |
| 1.4       | `node scripts/token-contrast.mjs`         | PASS, 17 gating pairs, every ratio identical to the plan's token table; D6 3.51:1 as information only  |
| 1.5       | `npx astro sync && npx astro check`       | PASS, 0 errors and 0 warnings; the 4 hints are in older `context/audits/` probe files                  |
| 1.6       | `npm run build`                           | PASS; no `example.test` anywhere in `dist/`                                                            |
| 1.7       | `npm test`                                | PASS, 29 files and 404 tests                                                                           |
| 1.8       | Smoke against the production preview      | PASS, 217 steps and `INFO  production build` (see the note below)                                      |
| 1.9       | `npx playwright test` against the preview | PASS, 3 tests                                                                                          |
| 1.10      | Moved and removed files not referenced    | PASS, no output                                                                                        |
| 1.11      | No heading nested in a card title         | PASS, both commands print nothing                                                                      |
| 1.12      | `gh pr checks`                            | PENDING by design: the branch is pushed only after this review is triaged                              |
| 1.13–1.16 | Manual                                    | Ticked. 1.13 and 1.14 have screenshots; 1.15 and 1.16 need none and the diff supports them (see below) |

Evidence for the manual rows:

- **1.13 and 1.14.** `before-public-*`, `phase1-public-*` and 22 `phase1-states-*` files are in the change folder.
- **1.15.** The rendered `<select>` has `name="recurrence"`, and `once` is selected.
- **1.16.** `--ring` reaches 7.39:1, and the base layer now uses a solid `outline-ring`.

Note on 1.8:

- The first smoke run failed one step, "privacy page renders the policy". The cause is local: this checkout has no `CONTACT_EMAIL` in `.dev.vars` (README:241), while CI writes it at `ci.yml:82`. The phase does not touch the policy.
- The build copies `.dev.vars` into `dist/server/`, so the rerun needed a rebuild. With `CONTACT_EMAIL=contact@example.com` added to `.dev.vars` for that rerun, all 217 steps passed.
- `.dev.vars` was restored afterwards with an identical checksum, and `dist/` was rebuilt.

## Findings

### F1 — Personal Claude Code settings committed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/settings.local.json:1-20 (added in d52fa40)
- **Detail**: The phase commit adds Claude Code's per-user settings file.
  - The plan does not mention it, and `.gitignore` does not cover it (`git check-ignore` exits 1).
  - It holds `permissions.defaultMode: "auto"` and `skillOverrides` that switch off 15 skills. One of them is the repo's own committed `playwright-cli`, which `context/foundation/test-stack.md:17` names as the browser CLI.
  - Tracked, the file carries one person's permission mode and skill set into every clone.
  - The "don't ask again" rules Claude Code later writes into this file would also show up as diffs to commit.
  - The branch is not pushed yet.
- **Fix**: In the review commit, run `git rm --cached .claude/settings.local.json` and add the path to `.gitignore`. The file stays on disk, and `d52fa40` keeps its SHA for the Progress write-back.
- **Decision**: SKIPPED

### F2 — Smoke's kitchen-sink body check cannot fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:551-556
- **Detail**: The step requests `/dev/dashboard-kitchen-sink` without `?state=`.
  - That page lists the states and renders the control states. Fixture e-mails appear only for a known state (`dashboard-kitchen-sink.astro:14-15`), and the only `example.test` strings are in `dashboard-fixtures.ts:50-78`.
  - So `bodyExcludes: "@example.test"` passes even in dev, and the comment at `:554` promises more than the request proves.
  - The plan specified the step this way (change 9). It still breaks the lesson "Smoke steps must assert outcomes, not just the absence of errors", because a page that leaked the gallery would pass.
  - The 404 status check itself works.
- **Fix**: Request `/dev/dashboard-kitchen-sink?state=owner`.
  - In a production build, expect 404 and a body with neither `@example.test` nor "Dashboard kitchen sink".
  - In dev, expect 200 with `@example.test` in the body, which shows the check can fail.
- **Decision**: FIXED (Fix now). The step now requests `?state=owner`.
  - Production preview: 404 with an empty body.
  - Warm `astro dev`: 200 with the fixture e-mails. The old index request carried none, which confirms the finding.
  - The first request to a cold dev server can come back as an empty 200 while Vite re-optimizes dependencies. That dev-server behaviour predates this change, and CI runs smoke on the production build.

### F3 — The kitchen sink's forms post to the real endpoints

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dev/dashboard-kitchen-sink.astro:18-22
- **Detail**: State pages render the real `DashboardView`, whose forms post natively to the real endpoints (`ConfirmAction.tsx:52`).
  - Those endpoints act on the caller's own group, never on anything from the request: `api/groups/delete.ts:20-21`, `rename.ts:27-28`, `api/tasks/create.ts:32-33`, and `leave.ts:23`, which deletes the caller's membership.
  - A developer signed in on the dev server (as for manual check 1.15) who confirms "Delete group" on `?state=owner` deletes their real group in whatever Supabase the dev server uses.
  - `ui-screenshots.mjs:188` already cancels native submits for its dialog shot; the page itself does not.
  - Phase 2's keyboard pass ("dialogs keep and return focus") will open these dialogs.
- **Fix**: Add a dev-only inline script to the kitchen-sink page with the same capture-phase `submit` listener calling `preventDefault()`. The islands still show their submitting state, but no native POST leaves the gallery.
- **Decision**: FIXED (Fix now). The state branch of `dashboard-kitchen-sink.astro` gained the inline capture-phase listener, with a comment explaining why.
  - Playwright on `astro dev`, `?state=owner`, with "Delete group" confirmed: no POST request, the URL unchanged, the dialog held in its pending state, and no page errors.
  - Production preview: still 404 with an empty body, and the listener is not in the production chunk.

### F4 — Lint guard narrower than the CLAUDE.md rule

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: eslint.config.js:79-82, CLAUDE.md:34
- **Detail**: The selector is byte-identical to the plan's, and stdin probes confirm what it catches:
  - flagged: `bg-red-500`, `bg-red-500/50` and `cn("text-gray-500")`;
  - not flagged: `href="#add-task"` and `bg-success/10`.

  The same probes show what it misses:
  - palette classes on utilities outside its list: `border-t-red-500`, `ring-offset-red-500` and `decoration-red-500`. These fall inside the plan's own intent ("a Tailwind palette colour class").
  - every arbitrary value that is not px/rem: `w-[37%]`, `grid-cols-[1fr_2fr]` and `bg-[var(--x)]`.

  `CLAUDE.md:34` says "No literal colours or arbitrary values in views… ESLint enforces this", which promises more than the check does. Today's view files contain no arbitrary classes at all, so nothing slips through yet.

- **Fix A ⭐ Recommended**: Widen the utility alternation to `border(?:-[trblxyse])?|ring(?:-offset)?|decoration|accent|caret|placeholder`, and make the CLAUDE.md bullet name exactly what ESLint rejects: hex colours, colour functions, palette classes and arbitrary px/rem values.
  - Strength: Closes the gap inside the plan's own intent with the same verified selector shape, and the rule text stops overstating.
  - Tradeoff: `%`, `calc()` and `var()` arbitrary values stay review-only.
  - Confidence: HIGH — the probes show exactly which classes slip through, and the change only extends one alternation.
  - Blind spot: Lint and the stdin probes, including `href="#add-task"`, must be rerun after the change.
- **Fix B**: Also reject every bracket or paren arbitrary value (`-[…]`, `-(--…)`) in view files, except arbitrary variants such as `data-[…]:`.
  - Strength: Makes the CLAUDE.md rule true as written, and matches Phase 2's "`lg:grid-cols-3`, with no arbitrary values" contract.
  - Tradeoff: A more complex esquery regex (no "/" inside, per the plan's note), and a new class of false positives to verify.
  - Confidence: MED — not probed yet. No view file uses arbitrary classes today, so the current tree stays green.
  - Blind spot: Future shadcn-style variants in view files.
- **Decision**: FIXED (Fix A).
  - `UI_LITERAL` now also covers `border-{t,r,b,l,x,y,s,e}-`, `ring-offset-`, `decoration-`, `accent-`, `caret-` and `placeholder-` palette classes.
  - The `eslint.config.js` comment and `CLAUDE.md:34` now name exactly what ESLint rejects.
  - `npm run lint` passes over the whole repo.
  - Stdin probes: those palette classes, `hover:border-t-white`, `bg-red-500`, `bg-red-500/50` and `cn("text-gray-500")` are flagged. `href="#add-task"`, `bg-success/10`, `ring-offset-background`, `placeholder-shown:border-input`, `border-t-border`, `decoration-primary`, `accent-primary`, `ring-offset-2` and `border-t-2` are not.

### F5 — Contrast gate can read a stale token value

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/token-contrast.mjs:39-50
- **Detail**: `rootTokens` has two blind spots:
  - It reads only the first `:root { … }` block.
  - Its regex also matches declarations inside comments, and a later match overwrites an earlier one.

  So a comment after the real declaration, such as `/* was --ring: oklch(0.723 0.014 214.4) */`, or a second `:root` block makes the gate compute with a value the browser never uses, and still exit 0.

  The current result is correct: `global.css` has one `:root` block with no comments inside, and a second implementation reproduced every ratio to within 0.01. Malformed and missing values already make the script exit 1.

- **Fix**: Strip `/* … */` before parsing, and exit 1 when `global.css` has more than one `:root` block.
- **Decision**: FIXED (Fix now). `rootTokens` strips comments and requires exactly one `:root` block.
  - On the real `global.css`, the output is identical to the `d52fa40` version, and the script exits 0.
  - Scratch copy (a), a failing `--ring` followed by a comment holding the passing value: the old script exited 0 with 7.39:1, the new one exits 1 with the real 2.44:1.
  - Scratch copy (b), a second `:root` block: the old script exited 0, the new one exits 1 ("found 2").

### F6 — Screenshot script ignores page errors

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-screenshots.mjs:233-242
- **Detail**: What the script already does:
  - exits 1 on a non-200 page or a missing control;
  - closes the browser in `finally`.

  It never listens for `pageerror` or console errors, though. A state page whose island throws during hydration still yields PNGs and exits 0. Manual check 1.14 ("renders without console errors") and Phase 2's matrix therefore depend on someone watching the console through 22 or more page loads.

- **Fix**: In `open()`, collect `pageerror` events and console errors for each page, and exit 1 when there are any, naming the page and viewport.
- **Decision**: FIXED (Fix now, with an empty-page guard).
  - `open()` fails the run on an uncaught page error at any time, and on a console error while the page loads and hydrates. Console errors after `open()` do not count, because the `controls` set aborts requests on purpose.
  - It also fails on an empty 200 body, which a cold `astro dev` can serve while Vite re-optimizes.
  - The header comment lists the new exit conditions.
  - Negative run against a local fixture server: a page that throws, one that logs `console.error` and an empty page each failed at both viewports, the clean page was captured, and the run exited 1.
  - Full `public states controls` run against a warm `astro dev`, with `OUT_DIR` in the scratchpad: 94 shots, 0 failures, exit 0.
