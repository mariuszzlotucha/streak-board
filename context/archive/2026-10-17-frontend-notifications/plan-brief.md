# Frontend toast notifications — Plan Brief

> Full plan: `context/changes/frontend-notifications/plan.md`

## What & Why

Signed-in actions give no feedback on success: every groups/tasks route redirects to a bare `/dashboard`. This change adds one simple toast that confirms successful actions and also carries the dashboard's action errors.

## Starting Point

Errors already travel as `?error=<code>`, resolved to fixed messages and shown as an inline `role="alert"`; `ClearErrorParam` strips the code from the address. `UpdateNotice` is a fixed bottom `role="status"` panel the toast can follow visually.

## Desired End State

After a group, task or nickname action, the landing page shows a short confirmation that hides after ~5 s or on close and never repeats on reload. A rejected dashboard action shows its message in a toast that stays until closed.

## Key Decisions Made

| Decision    | Choice                                                            | Why (1 sentence)                                                      |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Messages    | Success and errors                                                | One feedback channel for actions.                                     |
| Transport   | `?notice=<code>` mapped to fixed text                             | Mirrors the proven `?error=` pattern; no input reflected, no cookie.  |
| Behaviour   | Astro component, auto-hide ~5 s + close; errors stay until closed | No dependency or island; an error that vanishes is easily missed.     |
| Actions     | All group/task/nickname actions except check-off/uncheck          | The grid already shows a check-off; a toast per tick is noise.        |
| Error scope | Every dashboard `data.error` outside the load-failed page         | Auth/nickname field errors and load-failed pages stay as page states. |

## Scope

**In scope:** `Toast.astro`, `src/lib/notices.ts`, `?notice=` on 13 success redirects, `/dashboard` and `/settings` rendering, dashboard error alert → toast, `ClearErrorParam` CSP hash, kitchen sink, smoke redirect asserts (~59), screenshots for review.

**Out of scope:** check-off/uncheck, owner-notice dismissal, account deletion line, auth and nickname form errors, sonner, new cookies, `?error=` code changes.

## Architecture / Approach

Route → redirect with `?notice=<code>` → page resolves via `resolveNotice` → server-rendered `Toast` → inline script hides it, handles close, and strips `notice`/`error` from the URL.

## Phases at a Glance

| Phase             | What it delivers                                              | Key risk                                                         |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Success toasts | Component, codes, success redirects, both pages, kitchen sink | ~59 exact smoke redirect asserts to update                       |
| 2. Error toasts   | Dashboard error alert moved into the toast                    | Toast must stay before the group `<h1>` for `alertBeforeHeading` |

**Prerequisites:** planning PR merged; local Supabase stack for `npm test` and smoke.
**Estimated effort:** one `/10x-goal-implement` run, both phases, one PR.

## Open Risks & Assumptions

- The fixed toast may overlap the update notice or controls on small screens; checked manually at phone width.
- The toast changes the captured kitchen-sink states; there are no baselines, so the owner reviews the PNGs.

## Success Criteria (Summary)

- Every in-scope action confirms itself once, without a reload repeating it.
- Dashboard errors read the same text, now in a toast that waits to be closed.
