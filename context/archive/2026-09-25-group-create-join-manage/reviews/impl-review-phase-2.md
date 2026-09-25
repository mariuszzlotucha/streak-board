<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Group create / join / manage (S-01)

- **Plan**: context/changes/group-create-join-manage/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical 2 warnings 5 observations

Note: Phase 2 was reviewed after its commit (`c80cf77`, SHA record `71c85e9`) on `s-01/group-create-join-manage/phase-2`; PR #4 is open and not yet merged. All manual items 2.5-2.8 are ticked in Progress on the user's explicit confirmation. Automated criteria re-run in this review: `npm run lint` clean, `npx astro check` 0 errors/warnings/hints, `npm run build` passes, `npm run smoke` all steps passed (two users).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Drift review: every planned item is MATCH. Accepted adaptations: invite route is `src/pages/join/[code].ts` (not `.astro`, ESLint crash on top-level redirect), extra exports (`MAX_GROUP_NAME_LENGTH`, `MyGroup`, `GroupMember`, `groupErrorMessage`), typed `previewGroup`/`listGroupMembers` helpers (phase 1 follow-up F2), `locationExact` in smoke. Nothing from phases 3-4 or the "NOT doing" list. Verified clean by the security pass: middleware path normalization (`//api/groups/...` and encoded variants still hit the protected prefix), handlers re-check `locals.user`, Astro `checkOrigin` default covers the form POSTs, no XSS/open redirect, cookie flags and delete path, no server-only code in the client bundle.

## Findings

### F1 — Dashboard shows create/join forms when loading the group failed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:43-47
- **Detail**: If `getMyGroup` or `previewGroup` throws (transient Supabase/network error), `group` stays `null`, so the page renders the "Create a group" and "Join a group" cards under the "Something went wrong" alert. A user who is already in a group looks like they have none; a submit then fails with `already_in_group`. RLS and the unique constraints prevent data corruption, so the effect is misleading UI only. The plan asked for "the same destructive Alert instead of a 500", which is met, but not for hiding the forms.
- **Fix**: Track `loadFailed` in the catch block and render the create/join cards only when `!group && !loadFailed`; the alert stays.
- **Decision**: FIXED — `loadFailed` flag and `showGroupForms` gate in `src/pages/dashboard.astro` (unstaged on `s-01/group-create-join-manage/phase-2`; gates not yet re-run).

### F2 — Smoke test can pass without proving the core outcomes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:20-28 (and the join/create steps)
- **Detail**: (1) `storeCookies` deletes a cookie only on `Max-Age=0`, but Astro's `cookies.delete` sends `Expires=1970` with value `deleted`, so `join_code=deleted` stays in the jar; no step asserts that `join_code` is cleared after join, failed join or create. (2) After "join with the invite code succeeds" no step checks that B's dashboard now shows "Your group" and the group name, or that "Join <name>?" is gone. (3) "dashboard previews the pending invite" checks only `bodyIncludes: groupName`, which would also pass on an error banner plus the name. (4) Nothing asserts that a foreign-Origin POST is rejected (403) or that `//api/groups/create` without a session redirects. (5) A missing invite-code regex match becomes the string "undefined" in later steps. (6) Requests with a `cookie:` override still store Set-Cookie into A's jar.
- **Fix**: Treat a past `Expires` as deletion in `storeCookies`; assert `setCookie: "join_code=deleted"` on the join/create steps; add a B dashboard step after joining with `bodyIncludes: ["Your group", groupName]` and `bodyExcludes: "Join "`; add a pre-join B assertion with `bodyExcludes: "/join/"`; add a foreign-Origin POST expecting 403 and a `//api/groups/create` anonymous check; fail fast if `joinCode` is undefined; skip `storeCookies` for `cookie:` overrides.
  - Strength: Turns the smoke test into a real regression guard for the exact rules this phase introduces.
  - Tradeoff: More steps to maintain; a foreign-Origin case must send a different `Origin` header.
  - Confidence: HIGH — the cookie format was checked in `astro/dist/core/cookies/cookies.js` and the jar code above.
  - Blind spot: The foreign-Origin 403 depends on Astro's default `checkOrigin` staying on.
- **Decision**: FIXED + ACCEPTED-AS-RULE: `<Title — to be filled in>` (lessons.md entry saved with placeholder title, Rule and Applies-to). Smoke now treats a past `Expires` as cookie deletion, ignores Set-Cookie on `cookie:`-override requests, asserts `join_code=deleted` on create/join steps, checks B's dashboard before and after joining, rejects a foreign-Origin POST (403) and exits early when the invite code is missing. The proposed `//api/groups/create` step was dropped: it answered 403 (not the assumed 302) and could not tell a middleware redirect from a handler redirect. Lint and smoke re-run green (unstaged; the new assertions were not break-checked).

### F3 — Sign-out leaves the pending invite cookie behind

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signout.ts, src/lib/join-code.ts:26-32
- **Detail**: `join_code` lives up to an hour and survives sign-out. On a shared browser the next user with no group sees "Join <name>?" for someone else's invite. Low risk (preview plus a confirm button, join POST is Origin-checked), but it leaks a group name.
- **Fix**: Call `clearJoinCode` in the sign-out route (a phase-2-touching change to an auth route, which the plan said not to modify, so decide explicitly).
- **Decision**: FIXED — `clearJoinCode(context.cookies)` added to `src/pages/api/auth/signout.ts` (explicit exception to the plan's "no changes to auth API routes"; unstaged).

### F4 — Middleware prefix match is a fragile primitive

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:4,19
- **Detail**: `startsWith(route)` also matches `/dashboardfoo` and `/api/groupsX`; a future public route such as `/api/groups-public` would be silently protected. Safe today (over-matching errs toward protection).
- **Fix**: Match `pathname === r || pathname.startsWith(r + "/")`.
- **Decision**: FIXED — segment-safe match in `src/middleware.ts` (unstaged).

### F5 — Garbage in the join form discards the pending invite

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/groups/join.ts:16-19
- **Detail**: An unparseable submitted code clears the `join_code` cookie, dropping the invite the dashboard was previewing. Client validation makes this mostly unreachable. The plan lists clearing on success, `invalid_code` and `already_in_group`; a null `normalizeJoinCode` result is redirected as `invalid_code`, so this is within the plan's letter.
- **Fix**: Do not clear the cookie when `normalizeJoinCode` returns null; clear only on the RPC outcomes.
- **Decision**: SKIPPED — current behaviour follows the plan's wording and is nearly unreachable from the UI.

### F6 — Islands import validators from modules that also hold server-only code

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/groups.ts, src/lib/join-code.ts (imported by CreateGroupForm.tsx, JoinGroupForm.tsx)
- **Detail**: The client bundle is clean today only because `groups.ts` imports `createClient` as a type. Turning it into a value import would pull `astro:env/server` into the islands. The repo precedent is `src/lib/auth-rules.ts`, which keeps shared constants apart from server code.
- **Fix**: Move `normalizeGroupName`, `MAX_GROUP_NAME_LENGTH` and `normalizeJoinCode` into a pure `src/lib/group-rules.ts` imported by both islands and server code.
- **Decision**: FIXED — new `src/lib/group-rules.ts`; `groups.ts` and `join-code.ts` no longer hold the validators; `create.ts`, `join.ts`, `CreateGroupForm.tsx`, `JoinGroupForm.tsx` and `join-code.ts` import from it (unstaged; gates not yet re-run).

### F7 — Client and server disagree on what an empty group name is

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/groups/CreateGroupForm.tsx:15, src/lib/groups.ts:25-31
- **Detail**: The form uses JS `String.trim()` (also trims NBSP and other Unicode spaces) while `normalizeGroupName` and the DB CHECK trim only space, tab, CR, LF. An NBSP-only name is "required" in the browser but accepted by the server. Names with bidi/zero-width characters are accepted and shown in the "Join <name>?" card (escaped, so cosmetic/spoofing only).
- **Fix**: Use `normalizeGroupName` for the emptiness check in the form so client and server agree; rejecting control/format characters in the DB CHECK is a separate, optional hardening.
- **Decision**: FIXED — `trimGroupName` added to `src/lib/group-rules.ts` and used by `normalizeGroupName` and by the emptiness check in `CreateGroupForm.tsx` (unstaged). Rejecting control/format/bidi characters in the DB CHECK stays an optional later hardening.
