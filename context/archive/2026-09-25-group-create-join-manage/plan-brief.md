# Group create / join / manage (S-01) — Plan Brief

> Full plan: `context/changes/group-create-join-manage/plan.md`
> Research: `context/changes/group-create-join-manage/research.md`

## What & Why

Let a signed-in user create a group, join one through an invite link or code, and manage it (owner: rename, remove a member, delete the group; member: leave). This is PRD FR-002/FR-003 and the first vertical step toward the check-off loop: tasks (S-02+) live inside a group.

## Starting Point

The database already does the hard part: `groups`/`group_members`, RLS and a `join_group(code)` RPC from F-01 and the hardening change. The app has no group pages, routes or helpers; `/dashboard` is an empty welcome card, and no source exposes member emails or a group name before joining.

## Desired End State

`/dashboard` is the group hub. Without a group: create form, join-by-code field, and a "Join <name>?" card when an invite link was opened. With a group: name, copyable invite link, member list (email, Owner/You), and role-based actions with `AlertDialog` confirmation. Works at 375 px.

## Key Decisions Made

| Decision          | Choice                                                                      | Why                                                                   | Source      |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------- |
| Join mechanism    | Existing `join_group` RPC, app only maps `P0002`/`23505`                    | Already built and reviewed; no new trust surface                      | Research    |
| Authorization     | RLS only, no service-role key; group id derived from membership             | Keeps the F-01 guardrail as the single source of truth                | Research    |
| Invite link       | Public `/join/<code>` sets a 1 h httpOnly cookie, redirects to `/dashboard` | Survives sign-in without touching the auth forms/APIs                 | Plan (user) |
| Member identity   | New SQL function `list_group_members` returns emails to group members       | Owner must recognise whom to remove; no profiles table needed         | Plan (user) |
| Join preview      | New SQL function `preview_group(code)` returns the name or `NULL`           | User sees what they join; reveals nothing beyond what joining reveals | Plan (user) |
| Extra scope       | Member leave + owner rename                                                 | Without leave a member is stuck in one group forever                  | Plan (user) |
| Confirmations     | shadcn `AlertDialog` submitting a native form                               | Consistent UI, keeps the POST-and-redirect pattern                    | Plan (user) |
| Verification      | Extended two-user smoke + new RLS scenarios                                 | Reuses the repo's only tools; smoke already runs in CI                | Plan (user) |
| Forbidden actions | RLS "0 rows" is mapped to a `forbidden` code                                | RLS denies silently, so the app must check the result                 | Plan        |

## Scope

**In scope:** create, join (link + manual code), member list, invite link copy, leave, rename, remove member, delete group, one migration with two functions, extended smoke and RLS checks.

**Out of scope:** profiles/display names, code rotation/expiry/rate limit, ownership transfer, `?next=` redirects, OAuth/passwordless, multi-group, task handling on leave/removal (S-02/S-03), pushing the migration to production.

## Architecture / Approach

Server-rendered dashboard plus native-form POSTs to `/api/groups/*` that redirect back with an optional `?error=<code>`, copying the auth pattern. Postgres enforces permissions; the app derives the caller's group from their own membership and treats an empty RLS result as `forbidden`. New React islands only where interactivity is needed (forms, copy, confirm dialog).

## Phases at a Glance

| Phase              | What it delivers                                                                      | Key risk                                                            |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. DB functions    | `list_group_members`, `preview_group`, RLS scenarios, regenerated types               | Leaking emails outside the group                                    |
| 2. Create and join | Typed client, `/join/<code>`, create/join endpoints, dashboard states, two-user smoke | Invite cookie edge cases (stale code, already in a group)           |
| 3. Group view      | Copy link, member list, leave, rename, `AlertDialog` island                           | Dialog is portaled outside the `<form>`; needs the `form` attribute |
| 4. Owner actions   | Remove member, delete group, README                                                   | Silent RLS denials treated as success                               |

**Prerequisites:** local Supabase running (`npx supabase start`), Docker for the RLS scenario script, F-01 and hardening migrations applied (done).
**Estimated effort:** ~4 sessions across 4 phases, each on its own branch and PR (`s-01/group-create-join-manage/phase-<N>`).

## Open Risks & Assumptions

- The new migration is not pushed to production here; until it is, the group features work only on local/CI databases.
- Group emails are visible to all group members (accepted for a friends-only MVP); `join_group`/`preview_group` still have no rate limit (48-bit code is the only gate, already accepted).
- Astro's default CSRF origin check for form POSTs is assumed to pass (same-origin forms; smoke sends `Origin`), not yet exercised for new routes.
- An owner cannot leave without deleting the group; removed/leaving members' future task data is deferred to S-02/S-03.
- If a new user confirms a sign-up e-mail after more than an hour or in another browser, the invite cookie is gone; the code is stable, so re-opening the link (or pasting it into the join field) recovers.
- The dashboard shows an `unknown` error alert instead of a 500 when a group query fails; the remove-member route refuses the caller's own id (leaving is a separate action).

## Success Criteria (Summary)

- A second user can join through an invite link (also when signed out first) and both see the same group and members.
- Only the owner can rename, remove members and delete; a member can leave; forbidden attempts end in an error message, never a silent success.
- `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke` and the RLS scenario script pass.
