# Dashboard UI — Plan Brief

> Full plan: `context/changes/dashboard-ui/plan.md`
> Research: `context/changes/dashboard-ui/research.md`

## What & Why

`/dashboard` is where members tick tasks and compare streaks every day. Today it is a narrow, sign-in-style column ordered by when features were added. On a phone, the owner sees the invite link and the member list before the first "Mark done", and the leaderboard and Sign out sit far below. S-11 rebuilds the view on the existing design system (shadcn preset `b7Br7G9Kq`, `radix-maia`) and answers the five audit charges: C1 layout, C2 missing components, C3 tokens and contrast, C4 errors and partial failures, C5 the agent rule file.

## Starting Point

Tokens and `ui/` components are already in use; the literal scan finds 1 literal in 22 view files. What is wrong:

- the shell and the card order;
- six hand-built pills, a new-york-style select and ten overridden card headings;
- three contrast pairs below the WCAG thresholds;
- an error alert that stays in the URL, and grey footnotes for partial failures;
- a stale "new-york" rule in `CLAUDE.md`.

Smoke binds the dashboard markup with regular expressions in CI.

## Desired End State

- **Shell:** a header with the brand and the only Sign out, a `<main>`, a quiet "Signed in as" line and the footer.
- **Layout:** under the group's `<h1>`, two columns from 1024 px. Tasks sit on the left; Leaderboard, Members with the invite link, and Group settings on the right. Phones show the same order.
- **Rows:** "Mark done", or the success-coloured "Done today" with Undo, comes first, with a larger streak. Management controls are quiet.
- **States:** empty states point at the next step, and the pending invite is a single decision. Partial failures are amber notices in place; a failed load is an error page that answers 503.
- **Guards:** a dev kitchen sink with screenshots, a token contrast gate and an ESLint guard keep the next view on the contract.

## Key Decisions Made

| Decision          | Choice                                                                                                         | Why (1 sentence)                                                              | Source                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| Desktop layout    | Two columns from 1024 px; HTML order = phone order                                                             | Tasks and check-off come first everywhere, without duplicate markup.          | Plan (owner)            |
| Header            | `SiteHeader` with Sign out in `actions`; "Signed in as" above the footer                                       | Sign out appears once (e2e strict mode) and is reachable on a phone.          | Plan (owner)            |
| Task row          | Check-off first; Mark done is the only filled button; quiet Edit/Delete                                        | The daily action outweighs management.                                        | Plan (owner)            |
| Tokens            | ring mist-600, destructive red-800, muted-fg L 0.53; new `--success` (emerald-700) and `--warning` (amber-800) | All three failing pairs pass, with margin, at rest and on hover.              | Research + Plan (owner) |
| Visual gate       | Dev-only kitchen sink (11 states) and script-driven screenshots; no `toHaveScreenshot`                         | e2e is not in CI, and dev routes answer 404 in the build Playwright runs.     | Research + Plan (owner) |
| Errors            | Presentation only: alert at the top of the content, `?error=` removed after render                             | The S-08 contract and S-12's route tests stay valid.                          | Plan (owner)            |
| Handed-over fixes | G5 only: a failed load answers 503; G4, B1 and B3 deferred                                                     | A page-level edit, with no change to the loader.                              | Research + Plan (owner) |
| Empty states      | Next step shown; `<h1>` "Join {group}?" for a pending invite; "Join with code" on the form                     | One decision per page; "Join group" appears only once.                        | Plan (owner)            |
| Copy              | "Each member's streaks, added up", "How often", new notices                                                    | Glossary terms; no points, score or repeat.                                   | Research + Plan (owner) |
| Management weight | One "Group settings" card last; ghost triggers in rows that open the red dialog                                | The owner's seven red buttons become one.                                     | Plan (owner)            |
| Card heading      | `CardTitle as="h2"`, not `asChild`                                                                             | Astro drops `asChild` classes for `.astro` children (checked in the adapter). | Plan                    |
| Form pieces       | Move to `src/components/forms/`; `SubmitButton` gets `variant`/`className`                                     | Auth and dashboard forms share them; the defaults stay the same.              | Plan                    |
| Lint guard        | `no-restricted-syntax` regex on the view files (checked on probes)                                             | A failing check beats a rule an agent forgets; no new dependency.             | Research + Plan         |
| Delivery          | 3 phases; one branch and PR per code phase, each released                                                      | Lessons default; each phase is reviewed before its push.                      | Plan (owner)            |

## Scope

**In scope:** shell and layout; task row, members and settings; empty, invite and failure states; `Badge`, `NativeSelect` and `CardTitle as`; token values and new tokens; 503 on a failed load; kitchen sink and screenshot script; smoke steps, ESLint guard and the `CLAUDE.md` UI section; README and records.

**Out of scope:** the S-08 redirect contract; `loadDashboard` (S-12); G4, B1 and B3; dark mode, `Banner.astro`, the Auth 503 page, input borders; primary hover contrast (D6); tabs, avatars and remembered UI state; the check-off grid (S-13); `toHaveScreenshot`, e2e in CI and new dependencies.

## Architecture / Approach

The page body moves into `DashboardView.astro` (Phase 1, same HTML), so `/dashboard` and the dev kitchen sink render the same component; the kitchen sink renders it from fixtures built with the real `buildBoard`. Tokens change only in `global.css`, with their sources in `tokens-source/` and a contrast gate script. Phase 2 adds `AppLayout` (header, `<main>`, footer) and rebuilds the components. Every rule the tests bind stays intact: one `<li>` per task, one value per element, exact button texts, and `role="alert"` only for errors. Smoke keeps its helpers and gains outcome steps.

## Phases at a Glance

| Phase                                | What it delivers                                                                                                                                                               | Key risk                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1. Design-system groundwork          | Badge, NativeSelect, `CardTitle as`, moved form pieces; token values and contrast gate; `DashboardView`; kitchen sink and screenshots; ESLint guard and `CLAUDE.md` UI section | The global token change shows on the public pages; the extraction must keep the HTML |
| 2. The dashboard view and its states | Signed-in shell, two columns, new task row, settings card, empty/invite/failure states, 503, smoke steps, 7-state matrix                                                       | Smoke regex invariants and hydration parity in the islands                           |
| 3. Production release and records    | Both merges released, production checked on desktop and phone, the deployment record                                                                                           | Release approval and the production check are owner actions                          |

**Prerequisites:** the planning PR is merged; the local Supabase stack and `.env` are ready for smoke, Vitest and e2e; Playwright's Chromium is installed.
**Estimated effort:** about 3–4 implementation sessions: Phase 1 is one long session, Phase 2 one or two, and Phase 3 is short and owner-driven.

## Open Risks & Assumptions

- **S-12 overlap.** S-12 edits the same `loadDashboard` call, and its manual step 1.6 expects 200 for a failed load; after S-11 that is 503. The handoff is recorded in `change.md`, in a note in S-12's plan and in `deployment-plan.md`.
- **Screenshot size.** About 80 PNGs across the two code phases add several MB to the repository.
- **D6.** The primary button hover stays at 3.51:1 until a follow-up.
- **Production bundle.** The dev-only route ships in the Worker bundle, but its fixtures are built only in dev.

## Success Criteria (Summary)

- On a phone, the owner's first screen shows a task's "Mark done". On desktop, tasks and the leaderboard sit side by side.
- Every 7-state cell is shown in the kitchen sink or the screenshots, or marked N/A with a reason.
- The contrast gate passes, smoke passes in CI with the new outcome steps, and e2e passes locally.
- Production shows the new view, and the release is on record.
