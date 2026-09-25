<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Group create / join / manage (S-01)

- **Plan**: context/changes/group-create-join-manage/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical 2 warnings 4 observations

Note: Phase 3 was reviewed after its commit (`c5fd44b`, SHA record `ffcf88c`) on `s-01/group-create-join-manage/phase-3`; PR #5 (https://github.com/mariuszzlotucha/streak-board/pull/5) is open and not yet merged. All manual items 3.5-3.9 are ticked in Progress on the user's explicit confirmation. Automated criteria re-run in this review on a fresh build (the preview was restarted so it served it): `npm run lint` clean, `npx astro check` 0 errors/warnings/hints, `npm run build` passes, `npm run smoke` all 47 steps passed (two users). After triage (F1-F6 fixed, unstaged): `npm run lint`, `npx astro check` and `npm run build` clean, `npm run smoke` 48/48. F6 was found while verifying F2, after the two reviewers had reported.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Drift review: every planned item (1-7) is MATCH, nothing is MISSING. Additions beyond the letter of the plan, all support code or polish: Cancel disabled while submitting and a spinner on the confirm button; default `variant="destructive"`; select-all on focus, a `manual` status hint and an `aria-label` in `CopyInviteLink`; the rename input prefilled with the current name; a member-count subtitle and an "Unknown member" fallback for a NULL email; smoke helpers (`escapeRegExp`, `groupHeading`, `memberRow`, `NO_ERROR_ALERT`), a `bodyMatches` runner assertion and four extra smoke steps (name unchanged after the rejected rename, empty-name rename, owner keeps the group after the rejected leave, B sees the renamed group after rejoining). The confirm button is a plain `Button` rather than `AlertDialogAction` (documented at `ConfirmAction.tsx:67-68`; the plan asks for exactly `type="submit"` plus `form`). Nothing from Phase 4 or the "NOT doing" list; `package.json` and the lockfile are unchanged. Verified clean by the security pass: no `set:html`/`innerHTML`; `?error=` still goes through the fixed map; Astro `checkOrigin` covers both new routes; `leave.ts` deletes only the caller's own row and its `.eq("user_id", user.id)` filter is load-bearing (without it `group_members_delete_by_group_owner` would let an owner delete every other member), while the owner's own row is protected by the not-owner clause of `group_members_delete_self`; `rename.ts` can only change `groups.name` of the caller's own group; `useFormSubmitting` resets on `pageshow` and after 15 s; `useId` is unique per island; `join_code` handling is unchanged.

## Findings

### F1 — Smoke steps stay green with broken or mis-marked controls

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:228-236 and 259-267 (runner at :321, :330)
- **Detail**: Rename and leave are exercised only by direct POSTs, and the new dashboard steps assert presence with checks that a broken page also satisfies (accepted lesson: smoke steps must assert outcomes). (1) `bodyIncludes: "Leave group"` (:232) is matched by the card heading `<h2>Leave group</h2>` (dashboard.astro:136), and `"Rename group"` (:263) by the heading at dashboard.astro:123. Deleting `<ConfirmAction>` or `<RenameGroupForm>` from its card, mistyping `action="/api/groups/leav"`, or renaming the field (`name="name"`, RenameGroupForm.tsx:42) leaves every step green, while members can no longer leave or the owner's form answers `invalid_name` on every submit. (2) The invite URL is rendered twice, in the input's `value` and in the `astro-island` `props` attribute, so a `CopyInviteLink` that renders nothing still satisfies the `/join/` check and the invite-code regex (step at :159); nothing proves the copy control exists. (3) `memberRow` proves a badge sits on the expected row, not that it is absent from the other one: `member.user_id === user?.id` replaced by `true`, or a truthy `member.is_owner`, still passes every marker assertion. Confirmed against the running preview with a fresh owner and member: "Leave group" occurs 4 times on the member's page (heading, two island props, trigger button) and the invite URL twice on the owner's.
- **Fix**: Add a `bodyNotMatches` mirror of `bodyMatches` to the runner. On the member-list step add `bodyMatches: /<form[^>]*action="\/api\/groups\/leave"/`, `bodyIncludes: 'aria-label="Invite link"'` and `bodyNotMatches: [memberRow(email, "You"), memberRow(emailB, "Owner")]`; on the owner step add `/<form[^>]*action="\/api\/groups\/rename"/`, `/<input[^>]*name="name"/`, the same `aria-label` check and `bodyNotMatches: [memberRow(emailB, "You"), memberRow(emailB, "Owner")]`.
  - Strength: Each assertion targets what the component actually renders (form action, input name, the input's `aria-label`) instead of text that a heading or the serialised props also contain. Run against the real dashboards: every positive check matches the correct markup and every negative check correctly does not.
  - Tradeoff: Couples the smoke test to a few markup details (`action`, `name`, `aria-label`); `[^>]*` keeps it independent of attribute order.
  - Confidence: HIGH — checked against the actual server-rendered HTML, not only the source.
  - Blind spot: Not break-checked: nobody has yet deliberately broken each control to watch the new steps fail.
- **Decision**: FIXED via the proposed fix — `scripts/smoke.mjs`: `bodyNotMatches` runner assertion, `formPostingTo` helper and `INVITE_INPUT`; the member-list and owner dashboard steps now assert the rendered leave/rename form action, the `name` input, the invite input's `aria-label`, and that the Owner/You badges are absent from the other row (unstaged on `s-01/group-create-join-manage/phase-3`). Lint and prettier clean, smoke 47/47. Break-checked with 7 temporary source mutations (mistyped leave action, `ConfirmAction` removed, `RenameGroupForm` removed, rename field renamed, `CopyInviteLink` rendering nothing, You badge on every row, Owner badge on every row): the previous smoke stayed green for all 7, the new one failed the expected step(s) for all 7; sources restored with `git checkout`, clean build passes.

### F2 — Members card shows "0 members" when the member list failed to load

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:31,55,89-96
- **Detail**: `members = await listGroupMembers(...)` (:31) shares one try/catch with `getMyGroup`. If the RPC fails after the group was loaded (migration `20260925161234` not applied in that Supabase project, since the push is a manual step; a statement timeout; a network blip), the catch sets `loadFailed` and the error alert, but `group` is already set and `members` is still `[]`. `loadFailed` only gates `showGroupForms` (:61); the Members card is gated on `group` alone (:89). The page then shows the group card and a Members card reading "0 members" (served as "0members", see F6) with an empty list and no Owner/You badges under the "Something went wrong" alert, so a group that contains at least the viewer looks empty. Same class as Phase 2 F1 (misleading UI after a failed load), reintroduced by the new query. Side effect: the same throw skips the pending-invite block (:33-49), so a stale `join_code` cookie is neither previewed nor cleared on that request; it self-heals on the next load.
- **Fix**: Render the Members card only when the load succeeded: `{group && !loadFailed && (` at :89 (for a user in a group, `loadFailed` can only come from the member list); the alert stays and Rename/Leave keep working.
- **Decision**: FIXED via the proposed fix, in the named-flag form that mirrors `showGroupForms` — `src/pages/dashboard.astro`: `const showMembers = group !== null && !loadFailed;` gates the Members card (unstaged on `s-01/group-create-join-manage/phase-3`). Lint, `astro check` and build clean, smoke 47/47. Verified by simulating a failing `listGroupMembers` (temporary throw in `src/lib/groups.ts`, restored with `git checkout`): the old page rendered the Members card with an empty list and the count; the fixed page renders the error alert, the group card and the Rename/Leave controls but no Members card.

### F3 — Leaving twice ends on a "not allowed" alert

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/groups/leave.ts:25-27
- **Detail**: An empty delete result maps both "the owner" and "no membership" to `forbidden`, as the plan specifies. A member who has already left (in another tab, after Back restores a page whose dialog is live because `useFormSubmitting` resets on `pageshow`, or by a second click after the 15 s pending timeout while the first request is still in flight) confirms Leave again, gets an empty result and lands on the create/join forms under "You are not allowed to do that.", although the leave succeeded.
- **Fix**: On an empty result call `getMyGroup(supabase)`: `null` means the caller is already out, so redirect to `/dashboard` silently; otherwise keep `forbidden` (the owner). One extra query, only on the failure path.
- **Decision**: FIXED via the proposed fix — `src/pages/api/groups/leave.ts`: on an empty result the route calls `getMyGroup`; `null` (already out) redirects to `/dashboard` silently, otherwise `forbidden` (the owner). `scripts/smoke.mjs`: new step "leaving again after having left is not an error" (unstaged on `s-01/group-create-join-manage/phase-3`). Verified red/green: with only the step added, smoke failed just that step (`302 /dashboard?error=forbidden`); after the fix lint, `astro check` and build are clean and smoke passes 48/48, including the unchanged "leave by the owner is rejected".

### F4 — Copy confirmation not announced; manual hint vanishes in 2 s

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/groups/CopyInviteLink.tsx:16-24,54-61
- **Detail**: On success only the button label and icon change to "Copied"; the `role="status"` paragraph (:59-61) stays empty, so a screen reader is not told the link was copied. The `manual` fallback shares the 2 s reset (:16-24), so "Press Ctrl+C (or long-press) to copy the selected link." vanishes after 2 s; on plain `http://<LAN-IP>` (no secure context) the text stays selected but the hint is gone before it can be read.
- **Fix**: Put "Link copied" into the existing status paragraph for `copied`, and give `manual` a longer reset (or keep it until the next click).
- **Decision**: FIXED via the proposed fix, keeping the hint until the next click — `src/components/groups/CopyInviteLink.tsx`: a `STATUS_TEXT` lookup puts "Link copied" into the existing `role="status"` paragraph, and only the `copied` status auto-resets (2 s) (unstaged on `s-01/group-create-join-manage/phase-3`). Lint, `astro check` and build clean, smoke 48/48. Client-only behaviour with no browser test runner, so the click-to-copy flow still needs a quick manual look.

### F5 — CLAUDE.md and AGENTS.md still describe the pre-groups routes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:9,11 (same lines in AGENTS.md)
- **Detail**: Both files say `PROTECTED_ROUTES` is currently `["/dashboard"]` (:9) and list only `src/pages/api/auth/{signin,signup,signout}.ts` as API endpoints (:11). `src/middleware.ts:4` now protects `["/dashboard", "/api/groups"]` (Phase 2) and the app has `/api/groups/{create,join,rename,leave}` plus `/join/[code]` (Phases 2-3). Phase 4's docs step covers only `README.md`, so nothing in the plan corrects these agent-facing files (Phase 1 did fix their `src/types.ts` line). A plan gap rather than a Phase 3 deviation.
- **Fix**: Queue for Phase 4: extend its docs step with one-line edits to `CLAUDE.md` and `AGENTS.md` (the current `PROTECTED_ROUTES` value; add `src/pages/api/groups/*` and `src/pages/join/[code].ts` to the endpoint and page lists).
- **Decision**: FIXED via the proposed fix, as a queued follow-up — section "For Phase 4 (from the Phase 3 review, F5)" added to `context/changes/group-create-join-manage/follow-ups/review-fixes.md`. `CLAUDE.md` and `AGENTS.md` themselves are not edited yet; that happens with Phase 4's docs step, and the plan is untouched.

### F6 — Member count renders without a space ("2members")

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:98
- **Detail**: `{members.length} {members.length === 1 ? "member" : "members"}` is served as `1member` / `2members`: Astro drops the single space between two adjacent expressions (checked in the served HTML of the healthy build: `<div data-slot="card-description" …>2members</div>`). It shows on every dashboard load. Neither manual check 3.6 (emails with Owner and You markers) nor the smoke test (no assertion on the count) caught it. Found while verifying F2, after the first review pass, so the two reviewers did not report it.
- **Fix**: Build the text in one expression, `` {`${members.length} ${members.length === 1 ? "member" : "members"}`} ``, and assert `"2 members"` in the member-list smoke step so it cannot regress.
- **Decision**: FIXED via the proposed fix — `src/pages/dashboard.astro`: the count is one template-literal expression (`eslint --fix` moved the description onto one line to satisfy prettier); `scripts/smoke.mjs`: the member-list step asserts `"2 members"` (unstaged on `s-01/group-create-join-manage/phase-3`). Verified red/green: with the assertion added and the old text still served, smoke failed only the member-list step (46/47); after the fix lint, `astro check`, build and smoke are clean (47/47) and the served text is "1 member" / "2 members".
