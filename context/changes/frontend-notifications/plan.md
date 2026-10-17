# Frontend toast notifications Implementation Plan

## Overview

Add one shared toast to the signed-in app. A successful action shows a short confirmation that hides on its own, and a rejected action on the dashboard shows its existing error message as a toast that stays until it is closed. Today a successful action redirects to a bare `/dashboard` with no feedback at all.

## Current State Analysis

- Every groups/tasks route ends a success with `context.redirect("/dashboard")` (`src/pages/api/groups/{create,join,rename,leave,remove-member,delete,transfer}.ts`, `src/pages/api/tasks/{create,update,delete,join,leave}.ts`); `src/pages/api/account/nickname.ts` ends on `/dashboard` (first save) or `/settings` (change). Check-off and uncheck redirect elsewhere and are left out.
- Failures redirect to `/dashboard?error=<code>`; `loadDashboard` (`src/lib/dashboard-data.ts:61`) resolves the code through `resolveGroupError` / `resolveTaskError` into a fixed message, and `DashboardView.astro:54-58` renders it as an inline `Alert` (`role="alert"`). The join-cookie flow sets the same `data.error` at load time (`dashboard-data.ts:149-169`).
- `src/components/site/ClearErrorParam.astro` strips `?error=` with an `is:inline` script whose SHA-256 sits in `astro.config.mjs:39` (`security.csp.scriptDirective.hashes`), checked by `tests/unit/csp-hash.test.ts`.
- `src/components/site/UpdateNotice.astro` is a fixed bottom `role="status"` panel: the visual pattern to follow, and the element the toast must not cover.
- Smoke (`scripts/smoke.mjs`) keeps `role="alert"` for errors only and finds alert text with `alertMessage()` (`data-slot="alert-description"`, line 166).
- `/settings` shows no action error (its actions redirect to `/dashboard`); it is a success target only (nickname change).

## Desired End State

- After create/join/rename/leave/remove-member/delete/transfer a group, create/update/delete/join/leave a task, or save a nickname, the landing page shows a `role="status"` toast with a fixed message; it hides after about 5 s or on its close button, and a reload does not show it again.
- Every dashboard `data.error` outside the load-failed page (action `?error=` codes, the invite-cookie errors `already_in_group`/`invalid_code` at `dashboard-data.ts:149-154`, and the failed task load at `dashboard-data.ts:169`) shows as a toast with the same text, `role="alert"`, staying until closed; the inline alert is gone.
- Unknown `?notice=` codes render nothing. The kitchen sink shows both toast states; smoke and screenshots pass.

### Key Discoveries:

- Fixed-message mapping pattern: `src/lib/group-errors.ts`, `src/lib/task-errors.ts` (`resolve*` returns `null` for unknown codes, never reflects input).
- CSP: any change to an `is:inline` script text changes its hash (`astro.config.mjs:39`).
- No literals rule: toast styling must use tokens only (ESLint on `src/components/site/`).

## What We're NOT Doing

- No toast for check-off/uncheck, for `dismiss-owner-notice`, or for account deletion (`/?account=deleted` keeps its status line).
- Auth (`/auth/*`) and nickname-form field errors stay inline; the "dashboard/settings didn't load" pages stay as they are.
- No new dependency (no sonner), no React island, no cookie, no new tokens unless the token check demands one.
- No change to the existing `?error=` codes or their messages.

## Implementation Approach

Server-rendered Astro component fed by a query code, mirroring the `?error=` pattern: routes append `?notice=<code>`, the page resolves it to fixed text, the toast renders in the HTML, and one small inline script handles auto-hide, close and stripping `notice`/`error` from the address.

## Critical Implementation Details

- **CSP hash**: only `is:inline` scripts need a hand-kept hash. The Toast uses a plain `<script>` (Astro bundles and hashes it, as in `Layout.astro:59`); only the widened `ClearErrorParam` script changes its SHA-256 in `astro.config.mjs`, with `tests/unit/csp-hash.test.ts` in the same commit. CSP is only observable on `npm run build && npm run preview`.
- **Error toasts never auto-hide**: only `role="status"` toasts get the timer; an error stays until closed.

## Phase 1: Success toasts

### Overview

The toast component, notice codes and success redirects for every in-scope action.

### Changes Required:

#### 1. Notice codes

**File**: `src/lib/notices.ts` (new), `tests/unit/notices.test.ts` (new)

**Intent**: Map each success code to a fixed English message, like the error resolvers.

**Contract**: `type NoticeCode` union (e.g. `group_created`, `group_joined`, `group_renamed`, `group_left`, `member_removed`, `group_deleted`, `ownership_transferred`, `task_created`, `task_updated`, `task_deleted`, `task_joined`, `task_left`, `nickname_saved`); `resolveNotice(code: string | null): string | null`, `null` for unknown or missing; `noticePath(path: string, code: NoticeCode): string` for routes.

#### 2. Toast component

**File**: `src/components/site/Toast.astro` (new)

**Intent**: Fixed bottom toast stacked above `UpdateNotice`, token-styled, with a close button; `variant: "success" | "error"`. Success is `role="status"` and auto-hides after ~5 s; error wraps the existing `Alert`/`AlertDescription` (keeping `data-slot="alert-description"`) and stays until closed.

**Contract**: Props `{ message: string; variant: "success" | "error"; visible?: boolean }` (the last for the kitchen sink); one plain (bundled) `<script>` handles the close button and the timer, so it needs no hash in `astro.config.mjs`.

#### 3. Address clearing and CSP

**File**: `src/components/site/ClearErrorParam.astro`, `astro.config.mjs`, `tests/unit/csp-hash.test.ts`

**Intent**: Strip `notice` as well as `error` so a reload does not repeat a toast; update its hash.

**Contract**: The script removes both parameters, keeps others and the hash; `scriptDirective.hashes` carries its new SHA-256.

#### 4. Routes

**File**: the success redirects of `src/pages/api/groups/{create,join,rename,leave,remove-member,delete,transfer}.ts`, `src/pages/api/tasks/{create,update,delete,join,leave}.ts`, `src/pages/api/account/nickname.ts`

**Intent**: Success redirects carry their notice code via `noticePath`; error redirects are unchanged.

**Contract**: e.g. `/dashboard?notice=task_created`; nickname: `/dashboard?notice=nickname_saved` or `/settings?notice=nickname_saved`. `tests/integration/data-routes.test.ts` gets a `noticeTarget(route, code)` helper next to `errorTarget` for its success `location` asserts.

#### 4a. Smoke redirects

**File**: `scripts/smoke.mjs`

**Intent**: About 59 steps assert `locationExact: "/dashboard"` or `"/settings"`; every one that follows an in-scope successful action becomes the exact notice path, so each step also asserts its own code (lesson "Smoke steps must assert outcomes"). Page GETs and check-off/uncheck steps keep their current target.

**Contract**: `locationExact: "/dashboard?notice=<code>"` per action step; plus one new step asserting the rendered success toast after creating a task.

#### 5. Pages and kitchen sink

**File**: `src/pages/dashboard.astro`, `src/pages/settings.astro`, `src/components/dashboard/{DashboardView,SettingsView}.astro`, `src/components/dev/dashboard-fixtures.ts`, `src/pages/dev/dashboard-kitchen-sink.astro`

**Intent**: Both pages resolve `notice` and render the success toast (and `ClearErrorParam`, which settings does not include yet); the kitchen sink gets a `notice-success` state.

**Contract**: Views take `notice: string | null`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint and token contrast pass: `npm run lint && node scripts/token-contrast.mjs`
- Build passes: `npm run build`
- Integration tests pass: `npm test`
- Smoke passes with a step asserting the success toast after creating a task: `npm run smoke`

#### Manual Verification:

- On `npm run preview`, creating a task shows the toast, it hides after ~5 s, close works, a reload shows no toast, and no CSP report appears
- The toast does not cover the update notice or page controls on a phone-width screen
- `?notice=bogus` shows nothing

**Implementation Note**: After this phase's automated verification passes, continue with Phase 2; the manual rows remain the closing checklist.

---

## Phase 2: Error toasts

### Overview

Move the dashboard action-error alert into the error toast.

### Changes Required:

#### 1. Dashboard error rendering

**File**: `src/components/dashboard/DashboardView.astro`

**Intent**: Render `error` (in the loaded state) through `Toast` with `variant="error"` in the place of the inline `Alert` (top of `<main>`, before the group `<h1>`, positioned fixed by CSS), so smoke's `alertBeforeHeading` (`scripts/smoke.mjs:509`) holds unchanged; the load-failed page keeps its heading. The success toast sits in the same place.

**Contract**: The same message text, `role="alert"`, `data-slot="alert-description"`; no inline alert remains for action errors.

#### 2. Smoke, fixtures and screenshots

**File**: `scripts/smoke.mjs`, `src/components/dev/dashboard-fixtures.ts`

**Intent**: Keep smoke's error assertions passing unchanged, update the `action-error` fixture description, and capture the changed states for review: `OUT_DIR=context/changes/frontend-notifications/screenshots BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs toast states` against `astro dev` (no baselines exist; the owner reviews the PNGs, and the `states` set picks up `notice-success` from the kitchen-sink index).

**Contract**: Smoke invariant "`role="alert"` only for errors" still holds.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint passes: `npm run lint`
- Integration tests pass: `npm test`
- Smoke passes, including an error step that asserts the toast text: `npm run smoke`
- E2E specs pass: `npx playwright test`

#### Manual Verification:

- A rejected action (e.g. join with an invalid code) shows an error toast that stays until closed
- The captured `action-error` and `notice-success` PNGs look right in light and dark mode
- CI passes on the PR

---

## Testing Strategy

### Unit Tests:

- `resolveNotice`: every code, `null` input, unknown code, a code with extra characters.
- `noticePath`: appends to a path without a query.
- CSP hash test covers the changed script.

### Integration Tests:

- Route tests assert the new `Location` with `?notice=` on success and unchanged `?error=` on failure.

### Manual Testing Steps:

1. Create, rename and delete a group; each shows its toast once.
2. Change the nickname from `/settings`; the toast shows on `/settings`.
3. Join with an invalid code; the error toast stays until closed.

## Performance Considerations

None: one server-rendered element and a few lines of inline script.

## Migration Notes

No schema change. Code rolls back with `npx wrangler rollback`.

## References

- Error mapping pattern: `src/lib/group-errors.ts`, `src/lib/dashboard-data.ts:61`
- Visual pattern: `src/components/site/UpdateNotice.astro`
- Address clearing: `src/components/site/ClearErrorParam.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Success toasts

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — baff283
- [x] 1.2 Lint and token contrast pass: `npm run lint && node scripts/token-contrast.mjs` — baff283
- [x] 1.3 Build passes: `npm run build` — baff283
- [x] 1.4 Integration tests pass: `npm test` — baff283
- [x] 1.5 Smoke passes with a step asserting the success toast after creating a task: `npm run smoke` — baff283

#### Manual

- [ ] 1.6 On `npm run preview`, creating a task shows the toast, it hides after ~5 s, close works, a reload shows no toast, and no CSP report appears
- [ ] 1.7 The toast does not cover the update notice or page controls on a phone-width screen
- [ ] 1.8 `?notice=bogus` shows nothing

### Phase 2: Error toasts

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — 5994172
- [x] 2.2 Lint passes: `npm run lint` — 5994172
- [x] 2.3 Integration tests pass: `npm test` — 5994172
- [x] 2.4 Smoke passes, including an error step that asserts the toast text: `npm run smoke` — 5994172
- [x] 2.5 E2E specs pass: `npx playwright test` — 5994172

#### Manual

- [ ] 2.6 A rejected action (e.g. join with an invalid code) shows an error toast that stays until closed
- [ ] 2.7 The captured `action-error` and `notice-success` PNGs look right in light and dark mode
- [ ] 2.8 CI passes on the PR
