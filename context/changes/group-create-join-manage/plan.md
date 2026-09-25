# Group create / join / manage (S-01) Implementation Plan

## Overview

Build the app layer for groups on top of the finished F-01 schema: a signed-in user creates a group or joins one by invite link/code, sees the group and its members on `/dashboard`, and manages it (owner: rename, remove a member, delete the group; member: leave). Two small SQL functions are added so the UI can show member emails and the group name before joining. Covers PRD FR-002 and FR-003 plus two agreed extras (member leave, rename); the login part of FR-001 is served by the existing email+password flow.

## Current State Analysis

- The database side of joining/creating/removing is done: `groups`, `group_members`, owner auto-join trigger, `join_group(p_join_code)` RPC, RLS and column grants (`supabase/migrations/20260925003350_create_groups_and_group_members.sql`, `…20260925011727_harden_group_rls.sql`). Write contract: INSERT only `{name, owner_id}`, UPDATE only `name`, join only via `rpc('join_group')`, a member leaves by deleting their own `group_members` row, the owner cannot delete their own row.
- The app layer has nothing for groups: no pages, no `/api/groups`, no helper in `src/lib`. `src/types.ts` (generated) exists but nothing imports it and `createClient` is untyped (`src/lib/supabase.ts:5-19`).
- `/dashboard` is a static "welcome + sign out" glass card (`src/pages/dashboard.astro:1-27`); the auth pages use shadcn `Card` on `bg-muted` (`src/pages/auth/signin.astro:14-31`).
- No source exposes member identity: `group_members` has only `user_id`; no profiles table. A non-member cannot read `groups`, and `join_group` returns only the id, so the group name cannot be shown before joining.
- The middleware redirects unauthenticated requests to `/auth/signin` for any prefix in `PROTECTED_ROUTES` (`src/middleware.ts:4,19-23`), including `/api/*`, and drops the original URL.
- Forms are native `<form method="POST">` React islands; the API answers with a 302 and an error code that a page maps back to a fixed message (`src/pages/api/auth/signin.ts:6-31`, `src/lib/auth-errors.ts`, `src/components/auth/SignInForm.tsx:41-50`). No fetch/JSON precedent.
- shadcn components present: alert, button, card, input, label. No `alert-dialog` (`components.json`: style `radix-maia`, `radix-ui` already a dependency).
- `scripts/smoke.mjs` uses one global cookie jar and one user (`scripts/smoke.mjs:7-42`); CI runs it against local Supabase. `supabase/checks/rls-scenarios.sql` is a manual SQL regression that expects specific SQLSTATEs.

## Desired End State

A signed-in user with no group sees a create-group form, a manual "join with code" field, and — if they arrived through an invite link — a card "Join <group name>?". After creating or joining, `/dashboard` shows the group name, a copyable invite link, the member list (email, Owner/You markers) and role-appropriate actions: the owner can rename the group, remove any other member and delete the group; a regular member can leave. Destructive actions ask for confirmation in an `AlertDialog`. Everything works at 375 px width. Verified by lint, `astro check`, build, the extended smoke test (two users), the extended RLS scenarios, and a manual browser pass per phase.

### Key Discoveries:

- Join is already an RPC that raises `P0002` (unknown code) and `23505` (already in a group) (`…011727_harden_group_rls.sql:56-82`); the app only calls it and maps the errors.
- RLS turns a forbidden DELETE/UPDATE into "0 rows affected", not an error (`rls-scenarios.sql` `expect_rows(..., 0, …)` cases), so API routes must use `.select()` and treat an empty result as `forbidden`.
- `groups.name` CHECK trims only `' \t\r\n'` and counts characters (`…011727_harden_group_rls.sql:88-89`); the app must validate with the same set and code-point length.
- Join codes are 12 hex characters for new groups but 8 for groups created before hardening (`…011727_harden_group_rls.sql:91-93`); validation must not assume a fixed length.
- Cookie precedent for carrying state across a redirect: `auth_email` (`src/lib/auth-email.ts:3-30`); `delete()` must repeat the cookie path.
- The dashboard is already the post-login landing page (`src/pages/api/auth/signin.ts:24`), so a join cookie set before login is consumed naturally after login.

## What We're NOT Doing

- No profiles table / display names (members are identified by email).
- No invite code rotation, expiry, multiple codes, rate limiting, or ownership transfer (all listed as out of scope by the F-01 and hardening plans).
- No `?next=` return-to mechanism and no changes to the auth forms or auth API routes.
- No OAuth/passwordless login (roadmap open question; email+password stays).
- No multi-group per user (PRD Non-Goal) and no handling of what a leaving/removed member's tasks become (that belongs to S-02/S-03).
- No account-deletion flow (`groups.owner_id` is `ON DELETE RESTRICT`).
- No fetch/JSON client-side data layer, no toasts, no Playwright/e2e runner.
- No push of the new migration to a production Supabase project; that stays a separate deliberate step (`context/changes/deployment/deployment-plan.md`). Until then the feature works locally only.
- No changes to `Topbar.astro` or the landing page.

## Implementation Approach

Server-rendered `/dashboard` is the single group hub; all mutations are native form POSTs to `/api/groups/*` that redirect back to `/dashboard` (optionally with `?error=<code>`), matching the auth pattern. Authorization stays in Postgres (RLS + the existing RPC); the app never uses a service-role key and never trusts a `group_id` from the client — it derives the caller's group from their own membership. Join links are `/join/<code>`: a public route that stores the normalized code in a short-lived httpOnly cookie and redirects to `/dashboard`, which (after sign-in if needed) shows the confirm card.

Delivery follows `context/foundation/lessons.md`: every phase is cut from a fresh `master` on branch `s-01/group-create-join-manage/phase-<N>`, ends with a PR opened via `gh pr create`, English commit messages. Each phase is a working vertical increment. The planning artifacts (`context/changes/group-create-join-manage/`) and the roadmap status change are committed to `master` and pushed before phase 1 starts (per `context/foundation/lessons.md`), so phase branches contain only implementation changes; each phase stages only the files from its own file lists, so unrelated edits are never swept in.

An invite link is recoverable: the join code is stable, so a user whose `join_code` cookie is gone (for example after confirming a sign-up e-mail in another browser or after more than an hour) re-opens the link or pastes it into the "join with code" field.

## Critical Implementation Details

- **Dialog is portaled out of the form.** Radix `AlertDialog` renders its content in a portal, so the confirm button is not a DOM descendant of the `<form>`. `ConfirmAction` must render the `<form id=…>` next to the dialog and give the confirm button `type="submit"` with the `form="<id>"` attribute; nesting the button inside the form would not submit.
- **RLS "not allowed" is an empty result, not an error.** For rename, remove-member, delete-group and leave, chain `.select("id")` and map `length === 0` to the `forbidden` error code.
- **Cookie deletion needs the same options.** `join_code` is set with `path: "/"`; `cookies.delete` must pass the same path or the browser keeps it.

## Phase 1: Database functions for member list and join preview

### Overview

Add the two SQL functions the UI needs, cover them with RLS scenarios, and refresh generated types. No app behavior changes yet.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_group_member_list_and_preview.sql` (timestamp taken at implementation time; it must sort after `20260925011727`)

**Intent**: Give members a way to read the email/owner flag of their group's members, and give a signed-in user with a join code a way to read the group name before joining, without opening `auth.users` or `groups` to clients.

**Contract**:

- `public.list_group_members(p_group_id uuid) returns table (user_id uuid, email text, joined_at timestamptz, is_owner boolean)` — `security definer`, `stable`, `set search_path = ''`. Returns rows only if `public.is_group_member(p_group_id)` is true for the caller, otherwise an empty set. Ordered owner first, then `joined_at`. `is_owner` is `groups.owner_id = group_members.user_id`; `email` comes from `auth.users`, cast to `text`.
- `public.preview_group(p_join_code text) returns text` — `security definer`, `stable`, `set search_path = ''`. Returns the group `name` for an exact `join_code` match, `null` otherwise (no exception, so the UI can render "invalid invite" without error handling).
- Both: `revoke execute … from public, anon; grant execute … to authenticated;` (same conventions as `join_group`). No table/policy/grant changes.

#### 2. RLS scenario checks

**File**: `supabase/checks/rls-scenarios.sql`

**Intent**: Extend the manual regression with a new section for the two functions, using the file's existing helpers and specific SQLSTATEs.

**Contract**: scenarios that assert: owner and member each see both members with correct `is_owner` and non-null email; a non-member gets 0 rows; a user of another group gets 0 rows; `anon` gets `42501` on both functions; `preview_group` returns the name for the right code and `NULL` for an unknown and for an empty code; after a group is deleted `preview_group` returns `NULL`. Each scenario builds its own users so the tested rule is the only possible cause.

#### 3. Generated types

**File**: `src/types.ts`

**Intent**: Regenerate so `Database["public"]["Functions"]` includes both functions.

**Contract**: `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts` (the file is lint-excluded and generated; do not hand-edit).

#### 4. Docs

**Files**: `CLAUDE.md` (line 23), `AGENTS.md` (line 23), `README.md` (`### RLS scenario checks`)

**Intent**: Remove the stale statement that `src/types.ts` "is not yet created" and mention the two new functions in the RLS scenario description.

**Contract**: one-line edits only; stage no other changes in these files.

### Success Criteria:

#### Automated Verification:

- Local database resets and applies all migrations: `npx supabase db reset`
- RLS scenarios pass, including the new sections: `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql`
- Generated types contain both functions: `grep -E "list_group_members|preview_group" src/types.ts`
- Type check passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Migration SQL reviewed: both functions are SECURITY DEFINER with `search_path = ''` and executable by `authenticated` only

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Create a group and join it (link and code)

### Overview

End-to-end create and join: typed client, error/cookie/name helpers, `/join/<code>`, create and join endpoints, dashboard states for "no group" and a minimal "in a group", and a smoke test with two users.

### Changes Required:

#### 1. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Type the server client with the generated `Database` so group queries and RPC calls are checked.

**Contract**: `createServerClient<Database>(…)`; same signature `createClient(headers, cookies)`, still returns `null` when unconfigured. Existing auth routes and middleware must still type-check unchanged.

#### 2. Group error codes

**File**: `src/lib/group-errors.ts` (new)

**Intent**: Mirror `src/lib/auth-errors.ts` for group actions: a fixed code union, message table, mapping from Postgres SQLSTATE, and a resolver that drops unknown `?error=` values.

**Contract**: codes `not_configured | invalid_name | invalid_code | already_in_group | forbidden | unknown`; `toGroupErrorCode(error: { code?: string })` maps `23514→invalid_name`, `23505→already_in_group`, `P0002→invalid_code`, `42501→forbidden`, everything else `unknown`; `resolveGroupError(param: string | null): string | null` uses `Object.hasOwn` so a foreign value is never reflected.

#### 3. Join code helpers

**File**: `src/lib/join-code.ts` (new)

**Intent**: Normalize user-supplied codes and carry a pending invite across the sign-in redirect.

**Contract**: `normalizeJoinCode(input: unknown): string | null` — trim, lowercase, accept a pasted invite link by taking the last non-empty path segment, valid only if `^[0-9a-f]{1,64}$` (no fixed length: old groups have 8-character codes, new ones 12). Cookie helpers `rememberJoinCode(cookies, code)`, `peekJoinCode(cookies)`, `clearJoinCode(cookies)`; cookie `join_code`, `path: "/"`, `httpOnly`, `sameSite: "lax"`, `secure` in production, `maxAge: 3600`; `peekJoinCode` re-validates with `normalizeJoinCode`.

#### 4. Group helpers

**File**: `src/lib/groups.ts` (new)

**Intent**: One place for server-side group logic shared by the dashboard and the API routes.

**Contract**: `normalizeGroupName(input: unknown): string | null` — trims `[ \t\r\n]` from both ends (same set as the DB CHECK), returns `null` unless the length in code points (`[...name].length`) is 1–80. `getMyGroup(supabase): Promise<{ id: string; name: string; join_code: string; owner_id: string } | null>` — selects from `groups` with `.maybeSingle()`; RLS limits it to the caller's own group; throws on a Supabase error.

#### 5. Invite route

**File**: `src/pages/join/[code].astro` (new)

**Intent**: Public landing for invite links. Stores a valid code and sends the visitor to the dashboard, which is protected and therefore routes anonymous visitors through sign-in first.

**Contract**: `GET /join/<code>` → if `normalizeJoinCode` is valid, `rememberJoinCode`; always `Astro.redirect("/dashboard")` (302). `/join` is NOT added to `PROTECTED_ROUTES`.

#### 6. Middleware

**File**: `src/middleware.ts`

**Intent**: Require a session for group API calls.

**Contract**: add `"/api/groups"` to `PROTECTED_ROUTES` (`src/middleware.ts:4`); unauthenticated calls keep the existing 302 to `/auth/signin`.

#### 7. Create and join endpoints

**Files**: `src/pages/api/groups/create.ts`, `src/pages/api/groups/join.ts` (new)

**Intent**: Native-form POST handlers following `src/pages/api/auth/signin.ts` (try/catch, `not_configured` guard, redirect with error code).

**Contract**:

- `POST /api/groups/create` — form field `name`; invalid name → `/dashboard?error=invalid_name`; otherwise `supabase.from("groups").insert({ name, owner_id: user.id })` (only these two columns, per the write contract); success clears any pending `join_code` cookie and redirects `/dashboard`; errors via `toGroupErrorCode` (a second group surfaces as `already_in_group`).
- `POST /api/groups/join` — form field `code`; `normalizeJoinCode` null → `invalid_code`; otherwise `supabase.rpc("join_group", { p_join_code })`; the pending cookie is cleared on success, `invalid_code` and `already_in_group`; redirect `/dashboard` or `/dashboard?error=<code>`.
- `user` comes from `context.locals.user`; if it is missing, redirect to `/auth/signin`.

#### 8. Dashboard and forms

**Files**: `src/pages/dashboard.astro`, `src/components/groups/CreateGroupForm.tsx`, `src/components/groups/JoinGroupForm.tsx` (new)

**Intent**: Make `/dashboard` the group hub. Restyle it with shadcn `Card` on `bg-muted` like the auth pages, keeping the email and sign-out form.

**Contract**:

- Frontmatter loads `getMyGroup`. `?error=` is mapped with `resolveGroupError` and shown in a destructive `Alert`. The data loading (`getMyGroup`, and in Phase 3 `list_group_members`, plus `preview_group`) is wrapped in try/catch: on a Supabase error the page renders the same destructive `Alert` with the `unknown` message instead of a 500.
- No group: shows `CreateGroupForm` (single `FormField` `name`, client validation like `SignInForm` that counts code points with `[...name].length` (1–80) instead of a `maxLength` attribute, which counts UTF-16 units, `useFormSubmitting`, posts to `/api/groups/create`) and `JoinGroupForm` (field `code`, posts to `/api/groups/join`). If a valid pending code cookie exists, call `rpc("preview_group")`: a name → card "Join <name>?" with a plain POST form (hidden `code`) to `/api/groups/join`; `null` → clear the cookie and show the `invalid_code` message.
- In a group: shows the group name and the invite link `${Astro.url.origin}/join/${join_code}` as read-only text (the copy button and the rest arrive in Phase 3). If a pending code cookie exists it is cleared and the `already_in_group` message is shown.

#### 9. Smoke test with two users

**File**: `scripts/smoke.mjs`

**Intent**: Allow a second, independent session and cover create/join over HTTP.

**Contract**: `storeCookies` and `request` take a jar (default the current one) so user B has its own jar; user B signs up and signs in with `smoke-b-<timestamp>@example.com`. Note that with local `enable_confirmations = false` a successful signup already leaves a session in the jar (`scripts/smoke.mjs:20`), so the anonymous invite-link step must run on B's still-empty jar, before B signs up. New steps, inserted after "dashboard renders for signed-in user": anonymous `POST /api/groups/create` → 302 `/auth/signin`; A create with an empty name → 302 `/dashboard?error=invalid_name`; A create valid → 302 `/dashboard`, then dashboard body includes the group name and `/join/`; the join code is read from that body with a regex and kept for later steps; A creating a second group → `?error=already_in_group`; B, on an empty jar and before signing up, `GET /join/<code>` → 302 `/dashboard` with `Set-Cookie: join_code=`; B then signs up and signs in (the `join_code` cookie must survive both), and B's dashboard includes the group name from the preview; B join with a non-hex code → `?error=invalid_code`; B join with an unknown but valid-format code → `?error=invalid_code`; B join with A's code → 302 `/dashboard`; B joining again → `?error=already_in_group`. Steps for A's final sign-out stay last.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type check passes with the typed client: `npx astro check`
- Build passes: `npm run build`
- Smoke passes including the new create/join steps (built preview + local Supabase): `npm run smoke`

#### Manual Verification:

- A signed-in user without a group creates a group in the browser and sees its name and invite link on `/dashboard`
- A second account opens the invite link while signed out, signs in, sees the "Join <name>?" card and joins
- An unknown or malformed code (via link and via the manual field) shows a readable error and leaves no stale join card
- `/dashboard` is usable at 375 px width

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Group view, invite link, leave and rename

### Overview

Turn the minimal "in a group" state into the real group view: copyable invite link, member list, member leave, owner rename. Introduces the shared `AlertDialog` confirmation used again in Phase 4.

### Changes Required:

#### 1. AlertDialog component

**File**: `src/components/ui/alert-dialog.tsx` (new, generated)

**Intent**: Add the missing shadcn primitive for confirmations.

**Contract**: `npx shadcn@latest add alert-dialog` (style `radix-maia` from `components.json`); commit only the generated component and any dependency change it requires.

#### 2. Confirmation island

**File**: `src/components/groups/ConfirmAction.tsx` (new)

**Intent**: One reusable React island: a trigger button that opens an `AlertDialog`; confirming submits a native POST with hidden fields.

**Contract**: props `{ action: string; fields?: Record<string, string>; triggerLabel: string; title: string; description: string; confirmLabel: string; variant?: "destructive" | "outline" }`. Renders a `<form id method="POST" action>` with hidden inputs, and the confirm button is `type="submit"` with the `form` attribute pointing to that form id (see Critical Implementation Details). Uses `useFormSubmitting` to disable the button after submit. Cancel and Esc close the dialog without a request.

#### 3. Copyable invite link

**File**: `src/components/groups/CopyInviteLink.tsx` (new)

**Intent**: Show the invite link in a read-only input with a copy button.

**Contract**: props `{ url: string }`; `navigator.clipboard.writeText` with a fallback that selects the input text when the Clipboard API is unavailable; button label switches to "Copied" briefly. Hydrated with `client:load`.

#### 4. Rename form

**File**: `src/components/groups/RenameGroupForm.tsx` (new)

**Intent**: Owner-only form to change the group name.

**Contract**: props `{ name: string }`; same code-point validation (no `maxLength` attribute) and `FormField` pattern as `CreateGroupForm`; posts field `name` to `/api/groups/rename`.

#### 5. Rename and leave endpoints

**Files**: `src/pages/api/groups/rename.ts`, `src/pages/api/groups/leave.ts` (new)

**Intent**: Native-form handlers with the same shape as Phase 2 routes; the group is derived from the caller's membership, never from the request.

**Contract**:

- `POST /api/groups/rename` — `normalizeGroupName`, `getMyGroup`, then `update({ name }).eq("id", group.id).select("id")` (only the `name` column is grantable); empty result → `forbidden`; success → `/dashboard`.
- `POST /api/groups/leave` — `delete().eq("user_id", user.id).select("id")` on `group_members`; empty result (the owner, or no membership) → `forbidden`; success → `/dashboard`.

#### 6. Dashboard group view

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the minimal in-group state with the full view.

**Contract**: shows group name, `CopyInviteLink`, member list from `rpc("list_group_members", { p_group_id })` (email, "Owner" label, "You" marker for the current user), and for a non-owner a `ConfirmAction` to leave (`/api/groups/leave`). The owner sees `RenameGroupForm` and no leave control. The list is a semantic list that wraps cleanly at 375 px.

#### 7. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover the member view, rename and leave over HTTP.

**Contract**: after B has joined — B's dashboard body includes A's email; B `POST /api/groups/rename` → 302 `/dashboard?error=forbidden`; A rename → 302 `/dashboard` and A's dashboard shows the new name; A `POST /api/groups/leave` → `?error=forbidden`; B leave → 302 `/dashboard` and B's dashboard again shows the create form; B joins again with the same code (needed for Phase 4).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes including the member view, rename and leave steps: `npm run smoke`

#### Manual Verification:

- The invite link copies to the clipboard in the browser and the button confirms it
- The member list shows emails with Owner and You markers
- The leave dialog keeps the group on Cancel/Esc and leaves it on Confirm
- The owner sees rename and no leave button; renaming to an empty or 81-character name shows an error
- The group view is usable at 375 px width

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Owner actions — remove member and delete group

### Overview

Add the two destructive owner actions (FR-003) using the Phase 3 confirmation island, and document the new routes.

### Changes Required:

#### 1. Remove-member and delete-group endpoints

**Files**: `src/pages/api/groups/remove-member.ts`, `src/pages/api/groups/delete.ts` (new)

**Intent**: Owner-only handlers; authorization is RLS, the app only forwards the request and maps an empty result to `forbidden`.

**Contract**:

- `POST /api/groups/remove-member` — form field `user_id`, validated as a UUID (otherwise `forbidden`) and rejected with `forbidden` when it equals the caller's own id (the `group_members_delete_self` policy would otherwise let a non-owner delete their own row through this route; leaving is the separate `/leave` action); `getMyGroup`, then `delete().eq("group_id", group.id).eq("user_id", userId).select("id")` on `group_members`; empty result (caller is not the owner, target is not a member, or target is the owner) → `forbidden`; success → `/dashboard`.
- `POST /api/groups/delete` — `getMyGroup`, then `delete().eq("id", group.id).select("id")` on `groups`; empty result → `forbidden`; success → `/dashboard` (memberships disappear through the cascade).

#### 2. Owner controls on the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Show the owner-only controls.

**Contract**: for the owner, each member row except their own has a `ConfirmAction` "Remove" (`/api/groups/remove-member`, hidden `user_id`, email in the dialog text); a separate "Delete group" `ConfirmAction` (`/api/groups/delete`, destructive) states that all members lose the group. Non-owners see none of these controls.

#### 3. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover authorization and the two destructive flows.

**Contract**: B `POST /api/groups/remove-member` with A's (the owner's) `user_id` → `?error=forbidden`; B with B's own `user_id` → `?error=forbidden` and B is still a member (the route refuses it, it does not act as leave); B `POST /api/groups/delete` → `?error=forbidden`; A removes B → 302 `/dashboard`, then B's dashboard shows the create form; B joining with the old code again succeeds (removal does not burn the code) and A deletes the group → 302 `/dashboard`, A's dashboard shows the create form, B's dashboard shows the create form, and joining with the old code → `?error=invalid_code`. A `remove-member` with a non-UUID `user_id` → `?error=forbidden`.

#### 4. Docs

**File**: `README.md`

**Intent**: Document the new routes and the two-user smoke test next to the existing auth routes.

**Contract**: extend the routes section with `/join/<code>` and `/api/groups/*`, note that they follow the same `PROTECTED_ROUTES` rule (except `/join`), and update the smoke test description to mention groups.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes including authorization, remove-member and delete-group steps: `npm run smoke`

#### Manual Verification:

- The owner removes a member through the dialog and the removed user's next page load shows no group
- The owner deletes the group through the dialog and every former member loses it
- A non-owner sees no remove or delete controls
- The owner controls are usable at 375 px width

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

There is no test runner (CLAUDE.md, Commands); verification uses the tools the repo already has.

### Unit Tests:

- None (no runner). Pure helpers (`normalizeJoinCode`, `normalizeGroupName`, `toGroupErrorCode`) are exercised through the smoke test's malformed-code and empty-name cases.

### Integration Tests:

- `supabase/checks/rls-scenarios.sql`: the two new functions (member-only visibility, anon denied, preview by code, `NULL` for unknown). Run manually after Phase 1; it is not in CI.
- `scripts/smoke.mjs` with two sessions (runs in CI): anonymous protection of group APIs, create, duplicate-group rejection, invite-link cookie, preview, join (valid, malformed, unknown, already member), member view, rename and leave authorization, remove-member, delete-group.

### Manual Testing Steps:

1. Sign up, create a group, copy the invite link.
2. In a private window open the link, sign up/sign in as a second user, confirm the "Join <name>?" card names the group, join.
3. As the second user try rename, remove, delete (controls absent) and leave (confirm dialog, Cancel then Confirm).
4. As the owner remove the second user, delete the group, and confirm the old link now shows the invalid-invite message.
5. Repeat the main flows at 375 px width.

## Performance Considerations

The dashboard does up to three small queries per load (`groups` select, `list_group_members`, optionally `preview_group`); at the target scale (a group of friends) no caching is needed. `list_group_members` joins `auth.users` only for one group's rows.

## Migration Notes

One new additive migration (two functions, no table changes), so no data migration. The F-01 and hardening migrations stay untouched (archived, immutable). Pushing it to the production Supabase project is a separate manual step and not part of this plan; the app's group features require it in any environment where they are used.

## References

- Related research: `context/changes/group-create-join-manage/research.md`
- Write contract for groups: `context/archive/2026-09-25-group-rls-hardening/plan.md`
- Final policies and RPC: `supabase/migrations/20260925011727_harden_group_rls.sql:56-152`
- API route pattern: `src/pages/api/auth/signin.ts:6-31`
- Error-code pattern: `src/lib/auth-errors.ts`
- Cookie carry pattern: `src/lib/auth-email.ts:3-30`
- Middleware: `src/middleware.ts:4,19-23`
- Smoke harness: `scripts/smoke.mjs:7-42,104-108`
- Conventions and branch/PR rules: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database functions for member list and join preview

#### Automated

- [x] 1.1 Local database resets and applies all migrations: `npx supabase db reset`
- [x] 1.2 RLS scenarios pass, including the new sections: `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql`
- [x] 1.3 Generated types contain both functions: `grep -E "list_group_members|preview_group" src/types.ts`
- [x] 1.4 Type check passes: `npx astro check`
- [x] 1.5 Linting passes: `npm run lint`

#### Manual

- [x] 1.6 Migration SQL reviewed: both functions are SECURITY DEFINER with `search_path = ''` and executable by `authenticated` only

### Phase 2: Create a group and join it (link and code)

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Type check passes with the typed client: `npx astro check`
- [ ] 2.3 Build passes: `npm run build`
- [ ] 2.4 Smoke passes including the new create/join steps (built preview + local Supabase): `npm run smoke`

#### Manual

- [ ] 2.5 A signed-in user without a group creates a group in the browser and sees its name and invite link on `/dashboard`
- [ ] 2.6 A second account opens the invite link while signed out, signs in, sees the "Join <name>?" card and joins
- [ ] 2.7 An unknown or malformed code (via link and via the manual field) shows a readable error and leaves no stale join card
- [ ] 2.8 `/dashboard` is usable at 375 px width

### Phase 3: Group view, invite link, leave and rename

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Type check passes: `npx astro check`
- [ ] 3.3 Build passes: `npm run build`
- [ ] 3.4 Smoke passes including the member view, rename and leave steps: `npm run smoke`

#### Manual

- [ ] 3.5 The invite link copies to the clipboard in the browser and the button confirms it
- [ ] 3.6 The member list shows emails with Owner and You markers
- [ ] 3.7 The leave dialog keeps the group on Cancel/Esc and leaves it on Confirm
- [ ] 3.8 The owner sees rename and no leave button; renaming to an empty or 81-character name shows an error
- [ ] 3.9 The group view is usable at 375 px width

### Phase 4: Owner actions — remove member and delete group

#### Automated

- [ ] 4.1 Linting passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 Build passes: `npm run build`
- [ ] 4.4 Smoke passes including authorization, remove-member and delete-group steps: `npm run smoke`

#### Manual

- [ ] 4.5 The owner removes a member through the dialog and the removed user's next page load shows no group
- [ ] 4.6 The owner deletes the group through the dialog and every former member loses it
- [ ] 4.7 A non-owner sees no remove or delete controls
- [ ] 4.8 The owner controls are usable at 375 px width
