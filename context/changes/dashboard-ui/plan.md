# Dashboard UI Implementation Plan

## Overview

S-11 (`dashboard-ui`) restyles `/dashboard`, the view users open every day, against the existing design system: shadcn preset `b7Br7G9Kq` (`radix-maia`, base `mist`, emerald primary, Outfit Variable), with values in `src/styles/global.css` and components in `src/components/ui/`.

The plan answers the five charges of the audit (`research.md`, C1–C5):

- The page gets a signed-in shell and a layout in the order of the main loop: tasks with check-off first, then the leaderboard, members and group settings.
- Hand-built labels, the select and the card headings become repo components.
- The focus ring and the destructive and muted text reach WCAG contrast, and the done state and warnings get their own tokens.
- Errors and partial failures appear where they matter.
- A rule plus a lint check keep the next view on the contract.

A dev-only kitchen sink with committed screenshots is the visual gate. The S-08 error contract and the data loader stay as they are. The only behaviour change is that a failed dashboard load answers 503 (audit finding G5).

## Current State Analysis

From `research.md` (commit `7340675`), checked again while planning:

- **Shell and order (C1).**
  - `src/pages/dashboard.astro:51-52` reuses the sign-in page's centred `max-w-md` shell inside `Layout.astro`, with no header, `<main>` or `<header>`.
  - Cards follow the order features were added (`:60-90`).
  - At 375×812 the owner's first screen is the invite link and the member list. The first "Mark done" sits at about 810 px, the leaderboard at about 1615 px and "Sign out" at about 2286 px (`screenshots/before-owner-mobile*.png`).
  - Every form ends in a full-width primary button, and the owner sees 7 red buttons.
- **Components (C2).** The view reads tokens: the literal scan finds 1 hit in 22 view files, `CreateTaskForm.tsx:58`. Several pieces are still hand-built or misplaced:
  - 6 hand-built pills;
  - a `<select>` in new-york style;
  - 10 card headings nested in `CardTitle` (a `div`, `ui/card.tsx:31-32`) with their own typography;
  - `FormField`/`SubmitButton` living in `src/components/auth/`;
  - the starter's unused `ui/LibBadge.astro`, coloured with palette classes.
- **Contrast below the WCAG thresholds (C3)**, computed from the `:root` values:

  | Pair                              | Contrast | Threshold |
  | --------------------------------- | -------- | --------- |
  | Focus ring's 1 px line on a card  | 2.44:1   | 3:1       |
  | Focus ring's 50 % halo on a card  | 1.51:1   | 3:1       |
  | Destructive text on its 10 % tint | 3.99:1   | 4.5:1     |
  | Muted text on `bg-muted`          | 4.15:1   | 4.5:1     |

  There is no success or warning token, and "Done today" is plain text (`CheckoffControl.tsx:108`).

- **Errors (C4).**
  - Every `?error=` code becomes one alert at the top of the page, and the code stays in the address.
  - Partial failures are grey footnotes (`TasksCard.astro:47-52`).
  - `loadFailed` shows a message with no heading and no retry, and answers 200 (G5).
  - The pending invite shows two "Join group" buttons, and an `<h2>` comes before the `<h1>`.
- **Agent rules (C5).**
  - `CLAUDE.md:23` says the components are in "new-york" style; the repo uses `radix-maia`.
  - `CLAUDE.md` has no UI rule.
  - `components.json:18` sends hooks to `@/hooks`, against `CLAUDE.md:25`.
- **Tests.**
  - Smoke runs in CI on the production build and binds dashboard markup with regular expressions, including 41 `NO_ERROR_ALERT` expectations and the row helpers.
  - e2e runs locally only.
  - No test checks the recurrence field.

## Desired End State

After Phase 2, a signed-in user who opens `/dashboard` sees the following.

- **The shell.**
  - A brand header with the only "Sign out" button.
  - A `<main>` with the page content.
  - A quiet "Signed in as <e-mail>" line, then the footer.
  - The page is at most `max-w-5xl` wide.
- **In a group.**
  - The error alert comes first, only after a failed action; a script then removes `?error=` from the address.
  - Then the "Your group" eyebrow and the group name as the `<h1>`.
  - From 1024 px there are two columns. Tasks takes about two thirds on the left. Leaderboard, Members with the invite link, and Group settings are stacked on the right.
  - Phones show the same order in one column.
- **Each task row has three lines.**
  - The title, the how-often badge and the creator's quiet Edit/Delete.
  - "Mark done", the only filled button in the row; or the success-coloured "Done today" with Undo. The streak is a larger figure.
  - The participants, with outline Join or Leave.
  - "Add a task" is a disclosure, open when there are no tasks.
- **Without a group.**
  - An `<h1>` and one sentence about StreakBoard, above the Create and Join cards.
  - With a pending invite, the `<h1>` is "Join {group}?" with the only "Join group" button. Create and Join sit below under "Or start your own group".
- **Failures.**
  - Partial failures are amber notices (`role="status"`) in the place of the missing content.
  - A failed load is a page with an `<h1>`, the message and "Try again", and answers 503.
- **Tokens.**
  - The focus line is at least 3:1.
  - Destructive and muted text are at least 4.5:1.
  - `--success` and `--warning` pairs exist.
  - The public pages pick up the new values.
- **Guards.**
  - `/dev/dashboard-kitchen-sink` (dev only) shows 11 page states and the control states.
  - `scripts/ui-screenshots.mjs` captures them.
  - `CLAUDE.md` has a UI section.
  - ESLint rejects literal colours and arbitrary values in the view files.

Verified by:

- smoke in CI, with the rewritten pending-invite and dashboard steps and new layout, header and error steps;
- the local Playwright suite;
- `node scripts/token-contrast.mjs` and the lint guard;
- the 7-state matrix with its screenshots;
- a manual 503 check.

### Key Discoveries:

- **`asChild` does not work from `.astro`.**
  - Astro hands a static React component its `.astro` children as a `StaticHtml` element (`node_modules/@astrojs/react/dist/server.js:72-79`).
  - That element ignores extra props, and Astro strips the slot markers (`node_modules/astro/dist/runtime/server/render/component.js:56-58,262-267`).
  - So `<CardTitle asChild><h2>` would silently drop the classes. Plain props such as `as="h2"` and `variant` arrive intact, and `<Badge>Owner</Badge>` in `.astro` renders `<span …>Owner</span>`.
- **`NativeSelect` splits its props** (registry source `radix-maia/native-select`). `className` styles the wrapper `div` (default `w-fit`); every other prop goes to the `<select>`. The registry file imports `cn` from the npm package `cn` and an `IconPlaceholder`. `npx shadcn add` turns the placeholder into the lucide icon, but keeps the `cn` import and installs the package (Phase 1, change 1).
- **`Alert` can carry `role="status"`.** It hard-codes `role="alert"` before `{...props}` (`src/components/ui/alert.tsx:22`), so `role="status"` from a view wins.
- **The smoke row helpers are order-sensitive inside one `<li>` and order-blind between cards** (`scripts/smoke.mjs:125-136,155-254,293-315,338`). The new layout keeps them valid as long as the markup invariants in Critical Implementation Details hold.
  - The weak step is the pending-invite check (`:784-789`). "Join group" there is also the `JoinGroupForm` button.
  - The bare step is "dashboard renders for signed-in user" (`:632-636`), which checks only `linkTo("/privacy")`.
- **The lint guard was verified on stdin probes.** The `no-restricted-syntax` selector in Phase 1, change 10 flags a hex colour, a colour function, an arbitrary px/rem value and a palette colour class in each of these: `.astro` attributes, `class:list`, JSX `className`, template literals and `cn()` arguments.
  - It does not flag `href="#add-task"` or token classes such as `bg-success/10`.
  - It does flag prose that contains a string like "text-gray".
  - Over today's scope it reports exactly `CreateTaskForm.tsx:58:21`.
- **The token candidates were checked with the research's method** (OKLCH → OKLab → sRGB, alpha composited in gamma-encoded sRGB). The values are in the token table below.
  - The primary button's `hover:bg-primary/80` gives 3.51:1 (`src/components/ui/button.tsx:11`). That pair is not one the owner chose to fix, so it becomes deferred D6.
- **`CardTitle` has few users.** It is used only by the dashboard components, `Leaderboard.tsx` and the dev `SignInStates.tsx` (grep). Its default typography can change without touching the public or auth pages.
- **Playwright can test the wrong server.** It reuses whatever already answers on its port (`playwright.config.ts:34-43`, `reuseExistingServer`). A running `astro dev` would replace the production preview.
- **S-12 (`refactor-opportunities`) overlaps in two places.**
  - Its phase 1 adds `log: requestFields(Astro)` to the `loadDashboard({...})` call at `dashboard.astro:33-38` (`context/changes/refactor-opportunities/plan.md:80`).
  - Its manual step 1.6 expects status 200 for a failed load (`plan.md:110,402`).
- **e2e binds three things.**
  - One visible "Sign out" button (`tests/e2e/auth.setup.ts:23`).
  - The text "Signed in as <e-mail>" (`tests/e2e/seed.spec.ts:31`).
  - The group name as a level-1 heading, the task title and "1 member"/"1 task" as exact element texts (`tests/e2e/group-data-isolation.spec.ts:48-52`).

## What We're NOT Doing

- **The S-08 error contract and its routes.** No action or task context in error redirects; the 13 routes and their `?error=<code>` stay as they are.
- **`loadDashboard` and its tests.** `src/lib/dashboard-data.ts` and `tests/unit/dashboard-data.test.ts` belong to S-12; the 503 is set in the page.
- **Audit findings G4, B1 and B3** (`context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md`):
  - G4, the check-off island's "no longer available" message for any 403/404;
  - B1, a malformed invite link;
  - B3, a failed invite preview ending as `loadFailed`.
- **Deferred items D1–D4 from research.** (D5, the stale source path, is fixed in Phase 1.)
  - D1: `Banner.astro`.
  - D2: the Auth 503 page.
  - D3: dark mode. `.dark` only receives values for the new tokens, and there is still no toggle.
  - D4: input border contrast.
- **D6, primary button hover contrast** (`hover:bg-primary/80` in `ui/button.tsx:11`, 3.51:1). It applies on every page and is not one of the pairs the owner decided to fix.
- **Layout ideas that reopen product decisions.**
  - Tabs or a segmented control. The leaderboard "is not a separate tab" (`context/domain/glossary.md:38`).
  - A "Join {name}" invite button. Buttons are `whitespace-nowrap`, so an 80-character name would overflow at 375 px.
  - Avatars or display names. Those would be new data and need a privacy-policy change.
  - Remembering UI state such as the disclosure in browser storage. The policy promises essential cookies only.
- **The check-off grid or history** (S-13).
- **Layout changes to the landing, privacy and auth pages.** Only the global tokens reach them.
- **New tooling.**
  - No `toHaveScreenshot`, Playwright in CI or new npm dependency (S-10 owns e2e in CI).
  - No `shadcn init`, second palette, skeletons or Radix `select`. The native select keeps working without JavaScript.

## Implementation Approach

The work runs in three phases, in the `/10x-ui` order:

- **Phase 1:** environment, library and token values. No layout change, and smoke passes with only new steps added.
- **Phase 2:** the view and its states.
- **Phase 3:** release and records.

Phase 1 also extracts the page body into `DashboardView.astro`, so the kitchen sink renders the real view from fixtures from the start; Phase 2 then changes components with the gate already in place.

Each code phase has its own branch and PR (`s-11/dashboard-ui/phase-1`, `s-11/dashboard-ui/phase-2`), reviewed with `/10x-impl-review dashboard-ui phase N` before the push, then merged and released through the gated `release` job.

Owner decisions (planning interview, 2026-10-11):

| #   | Decision          | Choice                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Desktop layout    | Two columns from 1024 px: Tasks on the left (about two thirds); Leaderboard, Members with the invite link and Group settings stacked on the right. The HTML order is the phone order; page width `max-w-5xl`.                                                                                                                                 |
| 2   | Header            | `SiteHeader` with a plain Sign out form in its `actions` slot. "Signed in as <e-mail>" is a quiet line above the footer. `AccountCard` goes, and "Sign out" appears exactly once.                                                                                                                                                             |
| 3   | Task row          | Check-off first. **Line 1:** title, how-often `Badge` and the creator's small, quiet Edit/Delete. **Line 2:** Mark done (the only filled button in the row), or "Done today" in the success colour with Undo, plus a larger streak. **Line 3:** participants with Join/Leave; Join becomes outline.                                           |
| 4   | Tokens            | Fix contrast globally: the solid part of the focus indicator ≥ 3:1; destructive text on its tint and muted text on `bg-muted` ≥ 4.5:1. Add `--success`/`--success-foreground` (the preset's emerald) and `--warning`/`--warning-foreground` (Tailwind amber). Values and sources go in `tokens-source/`. Re-screenshot the four public pages. |
| 5   | Visual gate       | Dev-only `/dev/dashboard-kitchen-sink` (404 in a production build) rendering the real view from fixtures in every state, plus a control-states section. A committed `scripts/ui-screenshots.mjs` captures 1280×800 and 375×812 with the Astro toolbar hidden. No `toHaveScreenshot`.                                                          |
| 6   | Errors            | Presentation only. The S-08 contract stays. The alert sits at the top of the page content, and a script removes `?error=` after render.                                                                                                                                                                                                       |
| 7   | Handed-over fixes | G5 only: `loadFailed` answers 503 with the same page. B3, G4 and B1 are deferred.                                                                                                                                                                                                                                                             |
| 8   | Empty / first run | **No tasks:** one line on what a task is, with the form in view. **Sole member:** the invite is the highlighted next step. **No group:** an `<h1>` and one sentence, above the cards. **Pending invite:** `<h1>` "Join {group}?" with "Join group", and Create/Join under "Or start your own group". `JoinGroupForm` says "Join with code".   |
| 9   | Copy              | Leaderboard caption "Each member's streaks, added up". Check-offs-failed notice as in the wording table. "Repeats" → "How often".                                                                                                                                                                                                             |
| 10  | Management weight | One "Group settings" card at the end of the right column. Owner: Rename group, then Delete group last. Member: Leave group. Row-level Delete and Remove become quiet neutral triggers that open the same red confirmation.                                                                                                                    |
| 11  | Delivery          | 3 phases, with one branch and one PR per code phase (lessons default), each released.                                                                                                                                                                                                                                                         |

Plan decisions:

- The invite button text stays "Join group".
- "Add a task" is a native `<details>`.
- `FormField`/`SubmitButton` move to `src/components/forms/`. `SubmitButton` gets optional `variant`/`className`; the defaults stay primary and full width.
- The token values and the wording below.

Token values (light theme; contrast against the card `oklch(1 0 0)` unless stated; palette values from `node_modules/tailwindcss/theme.css`, Tailwind 4.3.3):

| Token                        | Before                              | After                                    | Source                          | Contrast after                                                                     |
| ---------------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `--ring`                     | mist-400 `oklch(0.723 0.014 214.4)` | mist-600 `oklch(0.45 0.017 213.2)`       | palette                         | 1 px line 7.39:1 (was 2.44); on `--muted` 6.64:1; against its own 50 % halo 3.19:1 |
| `--destructive`              | red-600 `oklch(0.577 0.245 27.325)` | red-800 `oklch(0.444 0.177 26.899)`      | palette                         | on its 10 % tint 6.94:1 (was 3.99); on the 20 % hover tint 5.68:1; on card 8.37:1  |
| `--muted-foreground`         | mist-500 `oklch(0.56 0.021 213.5)`  | `oklch(0.53 0.021 213.5)`                | mist-500 with L lowered         | on `--muted` 4.70:1 (was 4.15); on card 5.23:1                                     |
| `--success` (new)            | —                                   | emerald-700 `oklch(0.508 0.118 165.612)` | the preset's primary            | on card 5.37:1; on its 10 % tint 4.66:1                                            |
| `--success-foreground` (new) | —                                   | emerald-50 `oklch(0.979 0.021 166.113)`  | the preset's primary-foreground | on `--success` 5.09:1                                                              |
| `--warning` (new)            | —                                   | amber-800 `oklch(0.473 0.137 46.201)`    | palette                         | on card 7.13:1; at 90 % on card 5.75:1; on its 10 % tint 6.09:1                    |
| `--warning-foreground` (new) | —                                   | amber-50 `oklch(0.987 0.022 95.277)`     | palette                         | on `--warning` 6.88:1                                                              |
| base layer `outline-ring/50` | ring at 50 %                        | `outline-ring`                           | plan                            | native focus outlines (links, `<summary>`) 7.39:1                                  |

Why these values:

- **red-800, not red-700.** red-700 passes at rest (5.33:1), but its hover tint drops to 4.38:1.
- **L 0.53.** 0.54 gives 4.51:1, with no margin.
- **`.dark` gets only the new tokens**, recorded but not gated (dark mode is out of scope): emerald-400/950 and amber-400/950, 8.98, 7.83, 10.11 and 8.73:1.

Wording set by this plan:

| Where                         | Text                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No-group `<h1>` / sentence    | "Start or join a group" / "StreakBoard lets a group share tasks, mark them done every day or week, and compare streaks on a leaderboard." |
| Section under the invite      | "Or start your own group"                                                                                                                 |
| Join form button              | "Join with code"                                                                                                                          |
| No tasks                      | "No tasks yet. Add something your group wants to do once, every day or every week."                                                       |
| Disclosure / recurrence label | "Add a task" / "How often"                                                                                                                |
| Invite, sole member           | "You're the only member so far. Share this invite link so others can join."                                                               |
| Invite, several members       | "Share this invite link to add people to your group." (unchanged)                                                                         |
| Leaderboard caption           | "Each member's streaks, added up"                                                                                                         |
| Participants failed           | "Participants are unavailable right now. Reload to try again." (unchanged text)                                                           |
| Check-offs failed             | "Streaks are unavailable right now, so tasks can't be marked done and the leaderboard is hidden. Reload to try again."                    |
| Tasks failed                  | "Tasks are unavailable right now. Reload to try again."                                                                                   |
| Load failed `<h1>` / link     | "The dashboard didn't load" / "Try again"                                                                                                 |
| Settings card heading         | "Group settings"                                                                                                                          |

## Critical Implementation Details

### Timing & lifecycle

- **Public "before" shots.** Write the screenshot script (Phase 1, change 8) before touching the tokens. Run `node scripts/ui-screenshots.mjs before public` before editing `global.css` (change 5). The global token change has no other baseline.
- **Smoke, e2e and the dev server.** The screenshot script needs `astro dev`, which takes port 4321 by default; the smoke and Playwright runs use the same port for the production preview. Before smoke, stop `astro dev` or move the preview and `BASE_URL` to another port. Before `npx playwright test`, stop it or set `E2E_PORT`. Otherwise both suites test the dev server. A smoke run counts only when it prints `INFO  production build`; `INFO  dev server` means it tested the dev server.
- **S-12 overlap.** Leave lines 18-38 of the `dashboard.astro` frontmatter textually unchanged: the user, the destructuring and the `loadDashboard({...})` call. Whichever of S-11 and S-12 merges second then resolves at most a one-line conflict.

### Markup the tests bind

Smoke runs in CI; e2e runs locally.

- **`<h1>` contents.** The in-group `<h1>` holds only the group name (`groupHeading`).
- **Card headings.** Exactly `<h2>Members</h2>` and `<h2>Tasks</h2>`.
- **Counts.** "1 member", "2 members" and "1 task" are each one string in their own element.
- **Task rows.**
  - Each row is one `<li>` without a nested `<li>`, and the title comes first.
  - The recurrence badge, "Done today"/"Done this week"/"Done", "Mark done" and "Undo" are each the whole text of their element. The check icon is an `svg`, never a text glyph.
  - `<span>Streak</span>` is immediately followed by `<span>N</span>`.
  - Each participant's e-mail span is immediately followed by the `You` badge.
- **Leaderboard rows.** Each `<li>` holds only `<span>`s: position, e-mail, optional `You`, total.
- **Destructive controls.** Each keeps a hidden-fields-only form in the server HTML, followed by a `<button aria-haspopup="dialog">` whose text starts with the label, with no icon before it.
- **`role="alert"`.** Only for errors. Notices use `role="status"`.
- **Role-gated texts.**
  - "Rename group" and "Delete group" appear only for the owner, and "Leave group" only for members.
  - "Join group" and "Create a group" never appear in in-group views.
  - "Your group" appears only in in-group views, and no-group views contain no "/join/".
- **Sign out.** One visible "Sign out" button, and the visible text "Signed in as <e-mail>".

### Astro and React gotchas

- **No `asChild` from `.astro`.**
  - Headings use `CardTitle as="h2"`.
  - Link buttons use `<a class:list={buttonVariants(...)}>`, as in `src/pages/index.astro:13-19`.
  - The `<summary>` takes the same `buttonVariants` classes.
- **`NativeSelect` props.** `className` sizes the wrapper; `name`, `id` and `defaultValue` must reach the `<select>`.
- **Hydration parity.**
  - Island renders must not read `matchMedia`, `Date.now()`, `localStorage`, random ids, locale-dependent formatting or `typeof window`.
  - Islands stay `client:load`, never `client:only`: the server HTML must equal the first client render (`CheckoffControl.tsx:33-39`, `Leaderboard.tsx:10-15`).

## Phase 1: Design-system groundwork

### Overview

Phase 1:

- adds the missing components and fixes the token values;
- moves the shared form pieces;
- extracts the view into a component;
- builds the visual gate;
- leaves the rule and the lint check.

The page layout does not change. Smoke passes with only new steps added (charges C2, C3 values and C5; D5).

### Changes Required:

#### 1. shadcn configuration and the two new components

**Files**: `components.json`, `src/components/ui/badge.tsx` (new), `src/components/ui/native-select.tsx` (new)

**Intent**: Point the CLI's hooks alias at the folder the conventions use, then add `Badge` (a UI label, not a gamification badge) and `NativeSelect` from the `radix-maia` registry, so the view stops hand-building them.

**Contract**:

- `aliases.hooks` is `@/components/hooks`.
- `npx shadcn@latest add badge native-select` adds exactly the two files. Preview it first with `--dry-run`.
- **The registry's `cn`.** Both registry items import `cn` from the npm package `cn` and list it as a dependency (`npx shadcn@latest view badge native-select`, CLI 4.21.4). The CLI keeps that import and runs `npm install cn`, because `package.json` does not list `cn`. Right after the add:
  - point both imports at `@/lib/utils`, like the six existing `ui/` components;
  - restore the package files: `git checkout -- package.json package-lock.json && npm ci`.
- The files then import `cn` from `@/lib/utils` and `ChevronDownIcon` from `lucide-react`, and are formatted with the repo's Prettier and ESLint.
- `src/styles/global.css` stays unchanged, since the items have no CSS variables. After the restore, `git status --short` lists only `components.json` and the two new files.

#### 2. Card heading as the heading element

**Files**: `src/components/ui/card.tsx`, plus the card headings in `GroupHeaderCard.astro`, `MembersCard.astro`, `TasksCard.astro`, `OwnerActions.astro`, `LeaveGroupCard.astro`, `NoGroupCards.astro`, `PendingInviteCard.astro` (all in `src/components/dashboard/`) and `src/components/tasks/Leaderboard.tsx`

**Intent**: `CardTitle` renders the heading itself with the card-heading typography, so the 10 nested headings with their own classes go.

**Contract**:

- `CardTitle` accepts `as?: "div" | "h1" | "h2" | "h3"` (default `"div"`). Its default classes become the typography the view uses today, `font-heading text-xl font-semibold`.
- Each `<CardTitle><hN class="font-heading …">X</hN></CardTitle>` becomes `<CardTitle as="hN">X</CardTitle>`, with the same text and heading level.
- The group-name `<h1>` in `GroupHeaderCard` keeps only its larger size and wrapping until Phase 2 moves it out of the card.

#### 3. Labels and the recurrence field

**Files**: `src/components/dashboard/MembersCard.astro`, `src/components/dashboard/TaskRow.astro`, `src/components/tasks/Leaderboard.tsx`, `src/components/tasks/CreateTaskForm.tsx`

**Intent**: Replace the six hand-built pills with `Badge` and the hand-built `<select>` with `NativeSelect`, removing the view's only literal (`CreateTaskForm.tsx:58`).

**Contract**:

- **Badges.**
  - "Owner" and the recurrence label use `variant="secondary"`; "You" uses `variant="outline"`.
  - Each badge holds only its text, with no icon, and keeps its position in the row.
- **The recurrence field.**
  - The `<select>` keeps `id="new-task-recurrence"`, `name="recurrence"` and `defaultValue="once"`.
  - Its options come from `TASK_RECURRENCES`/`RECURRENCE_LABELS` through `NativeSelectOption`, and `className="w-full"` sets the wrapper's width.
  - The "Repeats" label text changes in Phase 2.

#### 4. Shared form pieces out of `auth/`

**Files**:

- `src/components/auth/FormField.tsx` → `src/components/forms/FormField.tsx` (`git mv`)
- `src/components/auth/SubmitButton.tsx` → `src/components/forms/SubmitButton.tsx` (`git mv`)
- their 8 importers
- `src/components/ui/LibBadge.astro` (deleted)

**Intent**: Put the field and the submit button where both the auth pages and the dashboard forms find them. Drop the starter's palette-coloured label, which a "check `ui/` first" rule would point agents to.

**Contract**:

- **Import paths only.** No markup change in `CreateTaskForm`, `EditTaskForm`, `CreateGroupForm`, `JoinGroupForm`, `RenameGroupForm`, `SignInForm`, `SignUpForm` and `dev/SignInStates`.
- **`SubmitButton` options.** It gains an optional `variant` (the `buttonVariants` variant type) and `className`, merged with `cn()`. Without them it renders exactly as today (primary, `w-full`), so the auth pages and their smoke and e2e bindings are unaffected.

#### 5. Token values, their source and a contrast gate

**Files**: `src/styles/global.css`, `context/changes/dashboard-ui/tokens-source/README.md` (new), `scripts/token-contrast.mjs` (new), `.github/workflows/ci.yml`

**Intent**: Fix the failing contrast pairs at the token layer and add the success and warning roles. Store the values and their sources in the repo, with a script that recomputes the pairs after any later token change.

**Contract**:

- **`global.css`.**
  - `:root` takes the values from the token table: `--ring`, `--destructive` and `--muted-foreground` changed, and `--success`, `--success-foreground`, `--warning` and `--warning-foreground` added.
  - `.dark` gets the four new tokens; its existing values stay.
  - `@theme inline` publishes `--color-success`, `--color-success-foreground`, `--color-warning` and `--color-warning-foreground`.
  - The base layer's `outline-ring/50` becomes `outline-ring`.
  - The header comment points to the preset's raw values at `context/archive/2026-09-25-ui-styles-audit/tokens-source/preset-b7Br7G9Kq.global.css` (D5). It names the values S-11 changed or added, pointing to the `tokens-source/` folder of change `dashboard-ui` by change id, because the folder moves to `context/archive/` at archive.
- **`tokens-source/README.md`.** Per token:
  - the old value, the new value and the source: the palette name, or the derivation for `--muted-foreground`;
  - the reasons for red-800 and L 0.53;
  - the deviation from the preset (the solid outline);
  - the script's output.
- **`scripts/token-contrast.mjs`** has zero dependencies and is linted by the existing `scripts/**/*.mjs` block.
  - It reads the `:root` OKLCH values from `src/styles/global.css`.
  - It converts them with the research's method: OKLab to sRGB per Ottosson, alpha composited in gamma-encoded sRGB.
  - It prints each pair with its ratio and threshold, and exits 1 when a gating pair is below its threshold.

  | Pair                                           | Threshold | Gate                 |
  | ---------------------------------------------- | --------- | -------------------- |
  | ring on card                                   | 3:1       | yes                  |
  | ring on muted                                  | 3:1       | yes                  |
  | ring on its own 50 % halo                      | 3:1       | yes                  |
  | destructive on card                            | 4.5:1     | yes                  |
  | destructive on its 10 % and 20 % tints         | 4.5:1     | yes                  |
  | muted-foreground on muted and on card          | 4.5:1     | yes                  |
  | success on card and on its 10 % tint           | 4.5:1     | yes                  |
  | success-foreground on success                  | 4.5:1     | yes                  |
  | warning on card and at 90 % on card            | 4.5:1     | yes                  |
  | warning-foreground on warning                  | 4.5:1     | yes                  |
  | primary-foreground on primary                  | 4.5:1     | yes                  |
  | secondary-foreground on secondary              | 4.5:1     | yes                  |
  | foreground on card                             | 4.5:1     | yes                  |
  | primary-foreground on the 80 % hover tint (D6) | 4.5:1     | no, information only |

- **CI.** The `ci` job in `.github/workflows/ci.yml` runs `node scripts/token-contrast.mjs` right after `npm run lint` (`:50`), so a token change that breaks a gating pair fails the PR. README's CI section names the step.

#### 6. The view as a component

**Files**: `src/pages/dashboard.astro`, `src/components/dashboard/DashboardView.astro` (new)

**Intent**: Move the page body into one component that both `/dashboard` and the kitchen sink render, without changing the HTML, so the gate shows the real view.

**Contract**:

- **`DashboardView` props.** The fields of `DashboardData` (`src/lib/dashboard-data.ts:30-44`) plus `viewerId: string | undefined`, `inviteLink: string | null` and `email: string | undefined`. The e-mail feeds `AccountCard` (`dashboard.astro:88`) while the old shell stays inside the view. Phase 2 passes it to `AppLayout` instead and drops it from the view.
- **Moved logic.** `isOwner`, `showGroupForms`, `showMembers` and `showTasks` move into the view with their comments and rules. The reads of `user` at `dashboard.astro:62,76` become `viewerId`.
- **`dashboard.astro`.**
  - It keeps lines 18-38 unchanged and computes `inviteLink` as today.
  - It renders `<Layout title="Dashboard">` around the view, passing each field explicitly. This phase keeps the old shell markup inside the view.
- **Same HTML.** The rendered HTML matches the old one, so smoke passes without edits.

#### 7. The kitchen sink

**Files**: `src/pages/dev/dashboard-kitchen-sink.astro` (new), `src/components/dev/dashboard-fixtures.ts` (new), `src/components/dev/DashboardControlStates.tsx` (new)

**Intent**: A dev-only page that shows the real view in every page state from fixture data, plus the control states.

**Contract**:

- **Dev-only route.** It follows `src/pages/dev/signin-kitchen-sink.astro:5-8`: in a production build it answers 404 with an empty body. The page builds the fixtures by calling a function, and only in dev.
- **Routing.**
  - `?state=<id>` renders one state the way `/dashboard` renders: the same layout and the same `DashboardView`.
  - Without a known `state`, the page lists links to every state and renders `DashboardControlStates`.
- **State ids:**
  - `owner`
  - `member`
  - `sole-member` (alone, no tasks)
  - `no-group`
  - `pending-invite`
  - `action-error` (owner, with the `forbidden` message)
  - `load-failed`
  - `tasks-failed`
  - `participants-failed`
  - `checkoffs-failed`
  - `long-text` (an 80-character group name and task title, a long e-mail)
- **Fixtures.**
  - Members have `@example.test` e-mails, and the viewer's is passed to the view as `email`.
  - Tasks cover daily, weekly and once, each ticked and not ticked; a task the viewer does not take part in; a task created by someone else; and a task with no participants.
  - The board comes from the real `buildBoard` with `groupPeriodsByEnrolment` and `rankStandings` at a fixed `now` of `2026-10-11T10:00:00Z`.
  - No Supabase calls. Invite links are built from the request origin.
- **`DashboardControlStates`** is rendered `client:load`. It shows:
  - each button variant the view uses, default and disabled;
  - `SubmitButton` pending;
  - a `FormField` with an error, and a disabled `Input`;
  - `NativeSelect` default and disabled;
  - the `Badge` variants;
  - the destructive `Alert`.

#### 8. Screenshot script

**File**: `scripts/ui-screenshots.mjs` (new)

**Intent**: Capture the gate's evidence the same way in every phase, instead of one-off scratch scripts.

**Contract**:

- **Usage.** `node scripts/ui-screenshots.mjs <prefix> <set...>` captures these sets:
  - `public`: `/`, `/privacy`, `/auth/signin`, `/auth/signup`;
  - `states`: every kitchen-sink state;
  - `controls`, used from Phase 2: hover and focus-visible on representative controls, the check-off pending and failed states through a held or failed request (`page.route`), a confirmation dialog while it submits, and the copy fallback hint.
- **Environment.**
  - It runs against a running `astro dev` (`BASE_URL`, default `http://localhost:4321`) with Chromium from `@playwright/test`.
  - Viewports are 1280×800 and 375×812, at `deviceScaleFactor` 1, full page, with the Astro dev toolbar hidden.
- **Output.** It writes PNG files named `<prefix>-<set>-<name>-<desktop|mobile>.png` to `context/changes/dashboard-ui/screenshots/` (or `OUT_DIR`).
- **Failures.** It exits 1 when a page does not answer 200 or a listed control is missing.
- **No baselines.** No `toHaveScreenshot`.

#### 9. Smoke: two new outcome checks

**File**: `scripts/smoke.mjs`

**Intent**: Prove that the dev route stays closed in production, and that the replaced field still posts `recurrence`, which no test checked.

**Contract**:

- **Kitchen-sink step.** A new step loads `/dev/dashboard-kitchen-sink` anonymously. When `PRODUCTION_BUILD`, it expects 404 and no `@example.test` in the body; otherwise 200.
- **Recurrence check.** A `RECURRENCE_FIELD` regex asserts that the form posting to `/api/tasks/create` holds a `<select … name="recurrence">` whose `once` option is selected. It is added to an existing owner-dashboard step that already asserts `TASKS_HEADING`.
- **No existing expectation changes.**

#### 10. Rule and lint check

**Files**: `eslint.config.js`, `CLAUDE.md`, `README.md`

**Intent**: Leave a rule and a failing check so the next agent stays on the contract. This is the "Utrwal to" step of `/10x-ui` (charge C5).

**Contract**:

- **`eslint.config.js`.**
  - A new block applies to the view files: `src/pages/dashboard.astro`, `src/pages/dev/**`, `src/layouts/**` and `src/components/{dashboard,tasks,groups,forms,site,dev}/**`.
  - It reports `no-restricted-syntax` errors on string literals and template parts that contain a hex colour, a colour function, an arbitrary px/rem value or a Tailwind palette colour class. The message points to tokens and `src/components/ui/`.
  - A false positive in prose is fixed by rewording. lint-staged and CI already run ESLint.
  - A second block applies `no-restricted-imports` to `src/**/*.{ts,tsx,astro}`: importing the module `cn` is an error whose message points to `@/lib/utils`. A later `shadcn add` that keeps the registry's import then fails lint.
  - The selector is non-obvious and was verified, so it is given here:

  ```js
  const PALETTE =
    "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|white|black";
  // esquery regex: no "/" inside; the lookahead keeps `href="#add-task"` out.
  const UI_LITERAL = `/#[0-9a-fA-F]{3,8}(?![\\w-])|\\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\\(|-\\[[0-9.]+(?:px|rem)\\]|\\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(?:${PALETTE})\\b/`;
  // "no-restricted-syntax": ["error",
  //   { selector: `Literal[value=${UI_LITERAL}]`, message },
  //   { selector: `TemplateElement[value.raw=${UI_LITERAL}]`, message }]
  ```

- **`CLAUDE.md`.** All edits stay outside the `<!-- BEGIN/END @przeprogramowani/10x-cli -->` block (`:52-78`).
  - Line 23 says `radix-maia` instead of "new-york".
  - A new `## UI` section after Conventions says:
    - **Tokens.** They live in `src/styles/global.css`: values in `:root`/`.dark`, published by `@theme inline`. A new token goes into all three blocks, with its raw value and source in the change's `tokens-source/`, and `node scripts/token-contrast.mjs` must pass.
    - **Components.** They live in `src/components/ui/` (`radix-maia`, lucide icons). Check there before creating one, and add missing ones with `npx shadcn@latest add <name>`. The registry imports `cn` from the npm package `cn`: point the new file at `@/lib/utils` and restore `package.json` and `package-lock.json`. Shared form pieces live in `src/components/forms/`.
    - **No literals.** No literal colours or arbitrary values in views; use tokens. ESLint enforces this for the dashboard view files.
    - **No `asChild` from `.astro`.** Use `CardTitle as`, and `<a class:list={buttonVariants(...)}>` for link buttons.
    - **Smoke binds the markup.** `scripts/smoke.mjs` binds the dashboard markup: keep its invariants, or change smoke in the same change.
    - **The gate.** Where the kitchen sink and the screenshot script are.
- **`README.md`.** The smoke paragraph (`:325`) mentions the kitchen-sink 404 step. A short paragraph next to it says how to open the kitchen sink and run the screenshot script.

#### 11. Screenshots

**Folder**: `context/changes/dashboard-ui/screenshots/`

**Intent**: Evidence for the phase review: the global token change on the public pages, and the gate's first run.

**Contract**: `before-public-*` is taken before change 5. `phase1-public-*` and `phase1-states-*` are taken after it, at both widths.

### Success Criteria:

#### Automated Verification:

- Lint passes with the view-file literal guard: `npm run lint`
- Guard rejects a literal in a view file: `printf '<span class="bg-red-500">x</span>\n' | npx eslint --stdin --stdin-filename src/components/dashboard/MembersCard.astro` exits non-zero and prints the guard's message
- Literal scan of the view files prints nothing. The baseline was 1 hit:

  ```bash
  grep -rnP '#[0-9a-fA-F]{3,8}(?![\w-])|\b(?:rgba?|hsla?|oklch)\(|-\[[0-9.]+(?:px|rem)\]|\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mist|mauve|olive|taupe|white|black)\b' src/pages/dashboard.astro src/pages/dev src/layouts src/components/dashboard src/components/tasks src/components/groups src/components/forms src/components/site src/components/dev
  ```

- Token contrast gate passes: `node scripts/token-contrast.mjs` exits 0
- Astro check passes: `npx astro sync && npx astro check`
- Production build passes: `npm run build`
- Vitest suite passes with the local Supabase stack running (one DB session at a time): `npm test`
- Smoke passes against the production preview with no existing expectation edited:
  - start the preview: `npm run build && npm run preview -- --port 4321`;
  - run smoke: `BASE_URL=http://localhost:4321 npm run smoke`; its output has the line `INFO  production build`;
  - the diff of `scripts/smoke.mjs` shows only the new step and the added `RECURRENCE_FIELD` check.
- Playwright suite passes against the production preview, with no dev server on the port: `npx playwright test`
- Moved and removed files are not referenced: `rg -n "components/auth/(FormField|SubmitButton)|LibBadge" src tests scripts` prints nothing
- No heading is nested in a card title: these commands print nothing:
  - `rg -nU "<CardTitle[^>]*>\s*<h[1-6]" src`
  - `rg -n "font-heading text-xl font-semibold" src/components/dashboard src/components/tasks`
- CI jobs ci, smoke and integration pass on the PR: `gh pr checks`

#### Manual Verification:

- Public pages before and after reviewed: `before-public-*` and `phase1-public-*` (landing, privacy, sign-in and sign-up, at 1280×800 and 375×812) differ only by the token changes: a darker focus ring, darker destructive text and darker muted text
- Kitchen sink shows all 11 states in dev, screenshots committed:
  - `/dev/dashboard-kitchen-sink` lists every state;
  - each `?state=` page renders without console errors;
  - `phase1-states-*` (both widths) are in the change folder.
- A task added in the browser keeps its recurrence: on the dev server, a task added with "Weekly" shows "Weekly" in its row
- Focus ring visible from the keyboard: tabbing through the dashboard and the sign-in page shows the darker ring or outline on every control and link

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Then run `/10x-impl-review dashboard-ui phase 1` on the phase branch, triage it, and only then push and open the PR. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 2: The dashboard view and its states

### Overview

Phase 2 rebuilds the page from the Phase 1 parts: the signed-in shell, the layout, the task row, the states and the copy. Smoke gets the rewritten and new outcome steps (charges C1, C4 and the C3 usage; G5).

### Changes Required:

#### 1. Signed-in shell and the 503

**Files**: `src/layouts/AppLayout.astro` (new), `src/pages/dashboard.astro`, `src/components/site/SiteHeader.astro`, `src/components/dashboard/AccountCard.astro` (deleted)

**Intent**: Give the dashboard a header with the brand and Sign out, a `<main>` landmark and the footer, like the public pages. Answer 503 when the dashboard could not be loaded.

**Contract**:

- **`AppLayout`** (props `title`, `email`) renders `Layout` with a `bg-muted` page:
  - `SiteHeader`, with a plain form posting to `/api/auth/signout` and an outline "Sign out" button in its `actions` slot;
  - `<main>`, with the slot inside a `max-w-5xl` container;
  - the line `Signed in as <span …>{email}</span>`: muted text, with the address emphasised and breaking anywhere;
  - `SiteFooter`, as in `PublicLayout`.
- **`dashboard.astro`.**
  - It renders `AppLayout` around `DashboardView`.
  - Right after the unchanged `loadDashboard` block, it sets `Astro.response.status = 503` when `loadFailed`, and only then. The partial failures stay 200.
  - It renders a few-line inline script (`<script is:inline>`) that removes the `error` parameter with `history.replaceState`, keeping other parameters and the hash. It is inline so that smoke can see it in the HTML; the site sends no CSP.
- **`SiteHeader`.** Its comment says it now serves both layouts.

#### 2. Page structure

**Files**: `src/components/dashboard/DashboardView.astro`, `src/components/dashboard/PageHeading.astro` (new), `src/components/dashboard/GroupHeaderCard.astro` (deleted)

**Intent**: Order the page by the main loop and give every state exactly one `<h1>`.

**Contract**:

- **`PageHeading`** (props `eyebrow?`, `title`, `description?`, always an `<h1>`) is the only place for the page heading's typography.
- **Load failed.** The page shows only a block with the `<h1>` "The dashboard didn't load", the `error` message from `loadDashboard`, and a "Try again" link to `/dashboard` styled with `buttonVariants`.
- **Otherwise,** the `error` alert comes first in `<main>` (destructive, `CircleAlert`, `role="alert"`).
- **In a group**, the alert is followed by:
  - `PageHeading` with the eyebrow "Your group" and the group name as the title, wrapping long names;
  - a grid `lg:grid-cols-3`, with no arbitrary values. The left column (`lg:col-span-2`) holds Tasks or its placeholder. The right column holds Leaderboard, Members and Group settings, in that HTML order.
- **Without a group:**
  - With a pending invite: `PendingInviteCard`, then an `<h2>` "Or start your own group", then `NoGroupCards` with `<h3>` titles.
  - Otherwise: `PageHeading` "Start or join a group" with the sentence from the wording table, then `NoGroupCards` with `<h2>` titles, in two columns from 1024 px.
- **The flags keep their meaning.**
  - Members show only after a successful load.
  - `tasksFailed` swaps Tasks for the placeholder.
  - The Leaderboard shows only with a board.

#### 3. Tasks card

**Files**: `src/components/dashboard/TasksCard.astro`, `src/components/dashboard/DashboardView.astro`

**Intent**: An empty state, partial-failure notices in place, and an add form that does not compete with the rows.

**Contract**:

- **Header.** `<h2>Tasks</h2>` and the count as one string in its own element.
- **No tasks.** The line from the wording table, starting with "No tasks yet" (smoke `:1799`).
- **Notices.** On `participantsFailed` and on `checkoffsFailed`: a warning `Alert` with an icon and `role="status"`, above the list.
- **"Add a task"** is a native `<details>` after the list:
  - It is `open` when there are no tasks.
  - Its `<summary>` takes `buttonVariants` outline classes and a plus icon, with the native marker hidden.
  - It holds `CreateTaskForm`.
- **On `tasksFailed`,** `DashboardView` renders a placeholder card: `<h2>Tasks</h2>` and the warning `Alert` (`role="status"`) "Tasks are unavailable right now. Reload to try again." The top alert keeps the generic message that `loadDashboard` sets.

#### 4. Task row

**Files**: `src/components/dashboard/TaskRow.astro`, `src/components/tasks/EditTaskForm.tsx`, `src/components/tasks/CheckoffControl.tsx`, `src/components/groups/ConfirmAction.tsx`

**Intent**: Put the daily action first and make the row's management controls quiet.

**Contract**:

- **Line 1.**
  - The title, then the recurrence `Badge`, then, for the task's creator, Edit and Delete as small `ghost` buttons.
  - For the creator, `EditTaskForm` renders the title, the badge and Edit in view mode, through a new `recurrenceLabel: string` prop. The badge thus follows the title and is hidden while the title is edited.
  - For everyone else, `TaskRow` renders the title and the badge.
- **Line 2** is `CheckoffControl`, moved before the participants line.
  - "Mark done" stays the only filled button.
  - The done state is a `text-success` element holding a check icon (`svg`, `aria-hidden`) and exactly the `DONE_LABELS` text, followed by Undo (outline).
  - The streak keeps `<span>Streak</span>` immediately followed by `<span>N</span>`, with the figure at least `text-lg`.
- **Line 3** is the participant line.
  - The ARIA list stays, with no nested `<li>`.
  - Join becomes an `outline` button; Leave is unchanged.
- **`ConfirmAction`** gains `triggerVariant?: "destructive" | "outline" | "ghost"`, defaulting to `variant`.
  - Task Delete and member Remove pass `triggerVariant="ghost"` and keep the destructive confirmation.
  - Trigger texts and `aria-label`s stay unchanged.

#### 5. Members card with the invite link

**Files**: `src/components/dashboard/MembersCard.astro`, `src/components/groups/CopyInviteLink.tsx`

**Intent**: Move the invite link to the members list, and make it the next step for someone alone in a group.

**Contract**:

- **Invite block.** `MembersCard` takes `inviteLink`. After the list it renders the invite sentence and `CopyInviteLink`; the input keeps `aria-label="Invite link"`.
- **One member.** The sole-member sentence, and `CopyInviteLink` gets a new optional `emphasis` prop, which gives the Copy button the default (filled) variant.
- **Several members.** The unchanged sentence and the outline button.
- **Count.** It stays one string in its own element.

#### 6. Group settings card

**Files**: `src/components/dashboard/GroupSettingsCard.astro` (new), `src/components/dashboard/OwnerActions.astro` and `src/components/dashboard/LeaveGroupCard.astro` (deleted), `src/components/groups/RenameGroupForm.tsx`

**Intent**: One card at the end of the right column for group management, with the dangerous action last.

**Contract**:

- **Heading.** `<h2>Group settings</h2>`.
- **Owner.**
  - `RenameGroupForm`, whose "Rename group" submit becomes an outline button sized to its text through the new `SubmitButton` props.
  - Then the delete description, and the "Delete group" `ConfirmAction` with a destructive trigger, last.
- **Member.** The leave description and the "Leave group" `ConfirmAction` with a destructive trigger.
- **Unchanged.** The dialog titles and descriptions; smoke checks the streak-loss sentences.

#### 7. No group and the pending invite

**Files**: `src/components/dashboard/NoGroupCards.astro`, `src/components/dashboard/PendingInviteCard.astro`, `src/components/groups/JoinGroupForm.tsx`

**Intent**: One decision per page and a valid heading order.

**Contract**:

- **`NoGroupCards`** takes `headingLevel: 2 | 3` for "Create a group" and "Join a group".
- **`PendingInviteCard`.**
  - Its title is the `<h1>` "Join {groupName}?", wrapping long names.
  - It keeps its form: the hidden `code`, and a primary "Join group" button, full width on phones.
- **`JoinGroupForm`.** Its submit says "Join with code", so "Join group" appears only on the invite.

#### 8. Warning alert

**File**: `src/components/ui/alert.tsx`

**Intent**: A warning variant for the partial-failure notices.

**Contract**:

- A variant `warning`, built like `destructive` but with the warning token: `bg-card text-warning`, the description at 90 %, the icon in the current colour.
- Views pass `role="status"`.

#### 9. Wording

**Files**: `src/components/tasks/Leaderboard.tsx`, `src/components/tasks/CreateTaskForm.tsx`, and the components above

**Intent**: Use glossary terms in the interface.

**Contract**:

- Every text from the wording table, including the Leaderboard caption and "How often".
- No "points", "score", "repeat" or "tab" in view text.

#### 10. Kitchen sink in the new shell

**Files**: `src/pages/dev/dashboard-kitchen-sink.astro`, `src/components/dev/DashboardControlStates.tsx`, `src/components/dev/dashboard-fixtures.ts`

**Intent**: Keep the gate identical to the real page.

**Contract**:

- State pages render inside `AppLayout`, with the fixture viewer's e-mail.
- The control states add the ghost and destructive triggers, the warning `Alert`, the done state and the `<summary>`.
- The fixtures follow any prop changes.

#### 11. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Keep the CI gate on the new markup, and assert this phase's outcomes rather than the absence of errors.

**Contract**:

- **Helpers stay.** The row, member, leaderboard and dialog helpers stay as they are. If one fails, fix the markup, unless the helper depended on card order.
- **Rewritten steps:**
  - **"Dashboard renders for signed-in user"** (`:632-636`, user A without a group). The page has:
    - `BRAND_LINK` and `<main`;
    - a form posting to `/api/auth/signout`, and exactly one "Sign out", checked by a `bodyNotMatches` regex that needs two;
    - "Signed in as" followed by A's e-mail in one element;
    - the `<h1>` "Start or join a group" and "Join with code";
    - no "Join group";
    - `linkTo("/privacy")`.
  - **"Dashboard previews the pending invite for user B"** (`:784-789`).
    - The page has the `<h1>` "Join {groupName}?" and a form posting to `/api/groups/join` whose hidden `code` is `joinCode`.
    - It has "Or start your own group", and no "/join/".
- **New or extended steps:**
  - **The owner's first dashboard** (`:750-762`): the sole-member sentence, and the invite input between `<h2>Members</h2>` and `<h2>Group settings</h2>`.
  - **An owner dashboard with tasks**, in this order: `TASKS_HEADING`, `aria-label="Leaderboard"`, `<h2>Members</h2>`, `<h2>Group settings</h2>`. It also has the "Your group" eyebrow and `groupHeading`.
  - **`/dashboard?error=forbidden` for a member**: the alert's message inside `<main>` before the `<h1>`, and the `replaceState` script present.
  - **The "2 members" step** excludes the sole-member sentence.

#### 12. 7-state matrix

**Files**: the kitchen sink and the `after-controls-*` screenshots

**Intent**: The phase is done when every cell is shown or N/A with a reason, not when the happy path looks right.

**Contract**:

- "KS `<id>`" means the kitchen-sink state.
- "Shot" means a `controls` screenshot from `scripts/ui-screenshots.mjs`.
- "→ page alert" means the action ends in the page-level `?error=` alert.

| Control                                                           | default                                                      | hover                                | focus-visible                           | disabled                                           | error                                                            | empty                                                                | loading                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | --------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| Default buttons (Mark done, Add task, Join group)                 | KS `owner`, `sole-member`, `pending-invite`                  | shot                                 | shot                                    | KS controls                                        | N/A: → page alert, or the check-off message                      | N/A                                                                  | see the SubmitButton, check-off and dialog rows |
| Outline buttons (Undo, Join, Leave, Copy, Sign out, Rename group) | KS `owner`                                                   | shot                                 | shot                                    | KS controls                                        | N/A: → page alert                                                | N/A                                                                  | N/A: a native POST navigates away               |
| Ghost buttons (Edit, Delete, Remove)                              | KS `owner`                                                   | shot                                 | shot                                    | KS controls                                        | N/A: they only open a dialog or the edit form                    | N/A                                                                  | N/A: as for error                               |
| Destructive buttons (Delete group, Leave group, dialog confirms)  | KS `owner`, `member`                                         | shot                                 | shot                                    | KS controls                                        | N/A: → page alert                                                | N/A                                                                  | see the dialog row                              |
| "Add a task" `<summary>`                                          | KS `owner` (closed), `sole-member` (open)                    | shot                                 | shot                                    | N/A: never disabled                                | N/A                                                              | N/A                                                                  | N/A                                             |
| Text fields (`FormField`)                                         | KS `no-group`, `sole-member`                                 | N/A: maia `Input` has no hover style | shot                                    | KS controls                                        | KS controls (message under the field)                            | placeholders in KS `no-group`                                        | N/A                                             |
| How often (`NativeSelect`)                                        | KS `sole-member`                                             | N/A: hover style only in dark mode   | shot                                    | KS controls                                        | N/A: preset `once`, no client check; a forged value → page alert | N/A                                                                  | N/A                                             |
| `SubmitButton`                                                    | KS forms                                                     | shot                                 | shot                                    | KS controls (pending is disabled)                  | → field message or page alert                                    | N/A                                                                  | KS controls (spinner, "Adding…")                |
| Check-off (`CheckoffControl`)                                     | KS `owner` (to do, done)                                     | shot                                 | shot                                    | shot: held request, dimmed and `aria-disabled`     | shot: failed request, message next to the control                | N/A                                                                  | shot: held request, optimistic flip             |
| Confirmation dialog                                               | KS `owner` (triggers)                                        | shot                                 | shot                                    | shot: Cancel and confirm disabled while submitting | → page alert                                                     | N/A                                                                  | shot: spinner in the confirm button             |
| Invite link (`CopyInviteLink`)                                    | KS `owner`, `sole-member` (emphasis)                         | shot                                 | shot                                    | N/A: always enabled                                | shot: copy refused, manual-copy hint                             | N/A                                                                  | N/A: copying is instant                         |
| `Badge`                                                           | KS `owner`                                                   | N/A: static label                    | N/A: not focusable                      | N/A                                                | N/A                                                              | N/A                                                                  | N/A                                             |
| Alerts and notices                                                | KS `action-error`, `participants-failed`, `checkoffs-failed` | N/A                                  | N/A                                     | N/A                                                | KS `action-error`, `load-failed`                                 | N/A                                                                  | N/A                                             |
| Leaderboard                                                       | KS `owner`                                                   | N/A                                  | N/A                                     | N/A                                                | KS `checkoffs-failed` (hidden; notice in Tasks)                  | N/A: always at least the viewer                                      | shot: moves with the held check-off             |
| Page                                                              | KS states                                                    | N/A                                  | N/A                                     | N/A                                                | KS `action-error`, `load-failed`, `tasks-failed`                 | KS `no-group`, `sole-member`, a task with no participants in `owner` | N/A: server-rendered, data is in the HTML       |
| Header and footer links                                           | any KS state                                                 | shot                                 | shot (solid outline in the ring colour) | N/A                                                | N/A                                                              | N/A                                                                  | N/A                                             |

#### 13. Docs and records

**Files**: `README.md`, `CLAUDE.md`, `context/changes/dashboard-ui/change.md`, `context/changes/refactor-opportunities/plan.md`

**Intent**: Keep the docs true, and leave the outcome of every charge on record.

**Contract**:

- **`README.md`.**
  - The `/dashboard` row (`:163`) adds "answers 503 with an error page when its data cannot be loaded". The protected-routes paragraph (`:195`) says the same.
  - The smoke paragraph describes the new dashboard steps.
- **`CLAUDE.md`.** In Architecture, the dashboard renders in `src/layouts/AppLayout.astro` with `DashboardView`.
- **`change.md` Notes** record:
  - the outcome of C1–C5;
  - D1–D6 with their reasons;
  - the S-12 handoff: its plan's step 1.6 expects 200 for a failed load, which is 503 after S-11;
  - the S-13 handoff: the done-state token pair, the smoke helpers and the row structure.
- **S-12's plan.** If S-12 (`refactor-opportunities`) is not implemented yet, add a one-line note under its criterion at `context/changes/refactor-opportunities/plan.md:110`: "After S-11 (`dashboard-ui`), a failed load answers 503 with the dashboard error page, not 200 with the banner." Its Progress row 1.6 (`:402`) keeps its title, since titles are fixed after review.

#### 14. Screenshots

**Folder**: `context/changes/dashboard-ui/screenshots/`

**Intent**: Evidence for the phase review and the matrix.

**Contract**: `after-states-*` at both widths, and `after-controls-*`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Literal scan of the view files prints nothing: the command from Phase 1
- Token contrast gate passes: `node scripts/token-contrast.mjs` exits 0
- Astro check passes: `npx astro sync && npx astro check`
- Production build passes: `npm run build`
- Vitest suite passes with the local Supabase stack running: `npm test`
- Smoke passes against the production preview with the rewritten and new dashboard steps: `npm run build && npm run preview -- --port 4321`, then `BASE_URL=http://localhost:4321 npm run smoke`, whose output has the line `INFO  production build`
- Playwright suite passes against the production preview, with no dev server on the port: `npx playwright test`
- Removed pieces and old wording are gone: `rg -n "AccountCard|GroupHeaderCard|OwnerActions|LeaveGroupCard|Total streak points|Scores are unavailable|Repeats" src` prints nothing
- CI jobs ci, smoke and integration pass on the PR: `gh pr checks`

#### Manual Verification:

- Every cell of the 7-state matrix is shown or N/A with its reason: each cell in change 12 appears in the kitchen sink or in `after-controls-*`, or carries the N/A reason given there
- Layout reads in the main-loop order on desktop and phone. Check in the kitchen sink and on a real dashboard, at 1280×800 and 375×812:
  - Tasks, then Leaderboard, Members with the invite link, and Group settings;
  - two columns from 1024 px;
  - no horizontal scroll at 375 px, including the `long-text` state;
  - on a phone, the owner's first "Mark done" is in the first screen.
- A failed load answers 503 with the error page:
  - with the local stack up and no other session using it, stop PostgREST: `docker stop supabase_rest_10x-astro-starter`;
  - load `/dashboard` signed in: the status is 503, and the page shows the `<h1>`, the message and "Try again";
  - run `docker start supabase_rest_10x-astro-starter`: "Try again" loads the dashboard.
- An action error shows once and leaves the address: after a rejected action, or on `/dashboard?error=forbidden`, the alert is the first thing in the main content; after a reload there is no alert, and the address is `/dashboard`
- Keyboard and screen-reader pass:
  - the Tab order follows the visual order;
  - every control shows the ring or outline;
  - Enter or Space toggles "Add a task";
  - dialogs keep and return focus;
  - in the browser's accessibility tree, the notices have the role `status` and the error the role `alert` (both are in the server HTML, so screen readers don't announce them on load).
- Pending invite is a single decision: signed out, open an invite link, then sign in as a user without a group. The page's `<h1>` is "Join {group}?", with one "Join group" button that joins. "Create a group" and "Join with code" sit under "Or start your own group".
- Charges, deferrals and handoffs recorded in change.md: C1–C5, D1–D6, the S-12 handoff and the S-13 handoff; the note is in S-12's plan unless S-12 was implemented first

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Then run `/10x-impl-review dashboard-ui phase 2` on the phase branch, triage it, and only then push and open the PR. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 3: Production release and records

### Overview

Phase 3 closes the slice by the lessons' release path: merge, approve `release`, check production, and record the result. There are no migrations.

### Changes Required:

#### 1. Releases

**Files**: none (GitHub)

**Intent**: Ship both phase merges through the gated release.

**Contract**:

- For each merge commit (Phase 1 and Phase 2), the `release` job runs, and the owner approves it in the `production` environment.
- No file under `supabase/migrations/` is new, so `db push` has nothing to apply.
- A failed run is fixed by re-running the failed jobs. Rollback is `npx wrangler rollback`; there is no schema change.

#### 2. Production check

**Files**: none (streakboard.app)

**Intent**: See the slice's main flow on the production URL, on desktop and on a phone.

**Contract**: The owner signs in on streakboard.app and walks the main loop:

- open the dashboard;
- Mark done, then Undo;
- watch the leaderboard;
- copy the invite;
- Sign out.

The public pages show the new tokens.

#### 3. Records

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Leave the release on record for the next slice.

**Contract**: A new `## Phase 14 — Dashboard UI (change dashboard-ui, S-11)`, or the next free number if S-12 records first, with:

- the dates, merge commits and release runs;
- "no new migrations";
- the production checks;
- the S-12 handoff.

This is a docs-only PR on `s-11/dashboard-ui/phase-3`; the CI jobs skip at job level.

### Success Criteria:

#### Automated Verification:

- Release runs succeed for both phase merges: the `release` job of the Phase 1 and the Phase 2 merge commit ends `success`, including its live URL checks (`gh run list --workflow ci.yml --branch master`, `gh run view <id>`)

#### Manual Verification:

- Production dashboard checked on desktop and phone: on streakboard.app, the new layout renders; Mark done and Undo work and move the leaderboard; the invite link copies; Sign out in the header signs out
- Production public pages checked: `/`, `/privacy` and `/auth/signin` look as in `phase1-public-*`
- Release recorded in deployment-plan.md: the Phase 14 entry (or the next free number), with the dates, merge commits, release runs, "no new migrations", the checks and the S-12 handoff

**Implementation Note**: The owner merges, approves and checks production; the agent prepares the record and the closing docs PR.

---

## Testing Strategy

### Unit Tests:

- **No new Vitest tests.**
  - `loadDashboard` does not change, and `tests/unit/dashboard-data.test.ts` keeps pinning its flags.
  - The view's state rules are presentation, covered by smoke and the kitchen sink.
- **Two new automated checks guard the design-system contract.**
  - `scripts/token-contrast.mjs` exits 1 when a gating token pair drops below its threshold; it runs in the `ci` job.
  - The ESLint guard fails on literal colours and arbitrary values in the view files.

### Integration Tests:

- **Smoke**, in CI on the production build:
  - Phase 1 adds the kitchen-sink 404 and the recurrence-field checks.
  - Phase 2 rewrites the bare dashboard step and the weak pending-invite step, and adds the layout-order, header, invite-placement and error-placement steps.
  - All existing row, member, leaderboard and dialog helpers stay.
- **Playwright**, locally against the production preview: `auth.setup.ts` (one Sign out), `seed.spec.ts` ("Signed in as") and `group-data-isolation.spec.ts` (`<h1>`, exact counts and title).

### Manual Testing Steps:

1. **Kitchen sink.** Open `/dev/dashboard-kitchen-sink` in dev. Walk every `?state=` page at 1280 px and at 375 px, and compare with `after-states-*`.
2. **Real dashboard as owner.** On a real local dashboard, as the owner:
   - add a weekly task through "Add a task";
   - Mark done, then Undo;
   - watch the leaderboard move;
   - copy the invite link;
   - rename the group.
3. **Real dashboard as member.** Join with the invite, then check that the row controls are quiet and that the settings card shows only "Leave group".
4. **Errors.** Trigger `?error=forbidden` and reload: the alert shows once.
5. **Failed load.** Stop PostgREST: the response is 503 with the error page. Start it again, and "Try again" works.
6. **Keyboard.** Use the keyboard only from the header to the footer.

## Performance Considerations

- **Server work.** `loadDashboard` makes no new reads.
- **Client additions.** The page adds one small inline script (`replaceState`). `Badge` and `NativeSelect` render statically or inside existing islands, and the new island props are small strings or booleans.
- **Kitchen-sink cost in production.** The kitchen sink and its fixtures are dev-only. The fixtures are built only when the route renders in dev, so a production request to it costs only the 404.
- **CPU.** The CPU of `/dashboard` has been unmeasured since S-04, and this change does not add server work to it.

## Migration Notes

- **Database.** No migrations and no data changes. Rollback is a revert of the phase PR plus `npx wrangler rollback`.
- **S-12 (`refactor-opportunities`).**
  - Its phase 1 edits the `loadDashboard` call that this plan leaves untouched.
  - Its manual step 1.6 (`plan.md:110`) expects 200 for a failed load. After S-11 the status is 503 with the same "Something went wrong" message, so that step needs "503".
  - The handoff is recorded in `change.md` and as a note in S-12's plan (Phase 2), and in `deployment-plan.md` (Phase 3).
- **S-13 (`checkoff-grid`)** inherits:
  - the `--success` pair for done cells;
  - the smoke helpers;
  - the row structure: one `<li>` per task, no nested `<li>`.

## References

- Research and charges: `context/changes/dashboard-ui/research.md` (C1–C5, D1–D5, §7 test bindings, §8 gate)
- Change notes and pre-audit: `context/changes/dashboard-ui/change.md`
- "Before" screenshots: `context/changes/dashboard-ui/screenshots/before-*.png`
- Preset and the previous token change: `context/archive/2026-09-25-ui-styles-audit/` (`plan-brief.md`, `charges.md`, `tokens-source/`)
- Dev-only page pattern: `src/pages/dev/signin-kitchen-sink.astro:5-8`
- Link-button pattern in `.astro`: `src/pages/index.astro:13-19`
- Header slot: `src/components/site/SiteHeader.astro:11-13`, used by `src/layouts/PublicLayout.astro:16-18`
- Smoke helpers: `scripts/smoke.mjs:125-338`, steps `:632-636`, `:750-789`, `:1799`
- S-12 overlap: `context/changes/refactor-opportunities/plan.md:46,80,110`
- Audit G4/G5/B1/B3: `context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md`
- Glossary: `context/domain/glossary.md`
- Lessons: `context/foundation/lessons.md` (branch per phase, impl review before push, outcomes in smoke, release path)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Design-system groundwork

#### Automated

- [x] 1.1 Lint passes with the view-file literal guard — d52fa40
- [x] 1.2 Guard rejects a literal in a view file — d52fa40
- [x] 1.3 Literal scan of the view files prints nothing — d52fa40
- [x] 1.4 Token contrast gate passes — d52fa40
- [x] 1.5 Astro check passes — d52fa40
- [x] 1.6 Production build passes — d52fa40
- [x] 1.7 Vitest suite passes — d52fa40
- [x] 1.8 Smoke passes against the production preview with no existing expectation edited — d52fa40
- [x] 1.9 Playwright suite passes against the production preview — d52fa40
- [x] 1.10 Moved and removed files are not referenced — d52fa40
- [x] 1.11 No heading is nested in a card title — d52fa40
- [ ] 1.12 CI jobs ci, smoke and integration pass on the PR

#### Manual

- [x] 1.13 Public pages before and after reviewed — d52fa40
- [x] 1.14 Kitchen sink shows all 11 states in dev, screenshots committed — d52fa40
- [x] 1.15 A task added in the browser keeps its recurrence — d52fa40
- [x] 1.16 Focus ring visible from the keyboard — d52fa40

### Phase 2: The dashboard view and its states

#### Automated

- [ ] 2.1 Lint passes
- [ ] 2.2 Literal scan of the view files prints nothing
- [ ] 2.3 Token contrast gate passes
- [ ] 2.4 Astro check passes
- [ ] 2.5 Production build passes
- [ ] 2.6 Vitest suite passes
- [ ] 2.7 Smoke passes against the production preview with the rewritten and new dashboard steps
- [ ] 2.8 Playwright suite passes against the production preview
- [ ] 2.9 Removed pieces and old wording are gone
- [ ] 2.10 CI jobs ci, smoke and integration pass on the PR

#### Manual

- [ ] 2.11 Every cell of the 7-state matrix is shown or N/A with its reason
- [ ] 2.12 Layout reads in the main-loop order on desktop and phone
- [ ] 2.13 A failed load answers 503 with the error page
- [ ] 2.14 An action error shows once and leaves the address
- [ ] 2.15 Keyboard and screen-reader pass
- [ ] 2.16 Pending invite is a single decision
- [ ] 2.17 Charges, deferrals and handoffs recorded in change.md

### Phase 3: Production release and records

#### Automated

- [ ] 3.1 Release runs succeed for both phase merges

#### Manual

- [ ] 3.2 Production dashboard checked on desktop and phone
- [ ] 3.3 Production public pages checked
- [ ] 3.4 Release recorded in deployment-plan.md
