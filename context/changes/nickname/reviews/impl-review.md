<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Nick zamiast e-maila (S-14 `nickname`)

- **Plan**: context/changes/nickname/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

This review covers 05fa72e..209656a on master: PR #150 (62204c7), PR #151 (a08916e) and the closeout PR #152 (209656a), plus the owner's ticks of rows 1.13–1.17. Both phase reports are fully triaged and nothing here repeats them.

- **Plan items.** All 18 planned items match: Phase 1 items 1–15 and Phase 2 items 1–3. The only extra is `ProvidingData.astro`, which came from the phase 1 review (F1).
- **Desired End State.** It is met:
  - Every protected path passes through the nickname gate.
  - The RPC returns `nickname` and no `email`.
  - The app contract carries no member e-mail address.
  - All four views and the remove dialog show the nickname, or "Unknown member".
  - `/settings` has the Account card.
  - The Google name is suggested; the owner verified this on production.
  - The documents say what the code does, apart from F1–F3 below.
- **Cross-phase coherence.**
  - Code, tests, smoke, RLS, README, CLAUDE.md, PRD, glossary and distillation have no wording left from the interim release-1 state.
  - "Keeps email" survives only in migration A's header and `-- compat:` line. Those are released history.
- **Security.** No path is left by which a member can read another member's e-mail address:
  - The only place an address is rendered is `AccountCard`, and it shows the viewer's own address.
  - Island props carry nickname and userId only.
  - Smoke `addressesNotShown` checks every 200 response from `/dashboard`, `/account/nickname` and `/settings`.
  - Both SECURITY DEFINER functions set `search_path ''`.
  - Migration B restores the revoke/grant pair.
  - The gate answers 503 when the nickname read fails.
  - Neither the route nor the gate logs the nickname.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Success criteria, re-run on HEAD 209656a (branch `s-14/nickname/full-review`) on 2026-10-16:

| Check                      | Result                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `guard:migrations`         | 0 violations. Both migrations are already on master, so the guard compared nothing. |
| `db reset` + `types:check` | PASS                                                                                |
| `lint` + `build`           | PASS                                                                                |
| `test:unit`                | 25 files, 452/452                                                                   |
| `npm test`                 | 44 files, 815/815                                                                   |
| `test:rls`                 | 326 assertions                                                                      |
| `deps`                     | no violations                                                                       |
| smoke on the preview       | 266 PASS, 0 FAIL                                                                    |
| Playwright, both projects  | 13 passed, with a seed account from `scripts/e2e-user.mjs` as in CI                 |

Rows 1.10 (mutation) and 1.11 (screenshots) were not re-run: `src/` changed after 28aefd6, where both were verified, only in a `groups.ts` comment and `types.ts`.

Manual rows: all 31 Progress rows are ticked. The owner's local checks 1.13–1.17 were ticked on this branch: "owner, 2026-10-16: checked, all ok".

## Findings

### F1 — Roadmap and open items still describe S-14 as unshipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:218; context/foundation/open-items.md:5,32,73
- **Detail**:
  - The roadmap's S-14 detail block still says `PRD refs: — (nowa funkcja; PRD nie zna nicka, FR do dopisania)`. Phase 1 F5 fixed only the table row (`:61`), and FR-010 exists (`prd.md:61`).
  - `open-items.md:5` lists S-14 as an open slice ("plan z 2026-10-16").
  - `open-items.md:32` says members "today" see each other's e-mail addresses ("to się zmienia").
  - `open-items.md:73` gives the next step as "scalenie PR-a planistycznego, potem `/goal`…".
  - Both releases are out, so the next session reading these files would be misled.
  - The roadmap status (`:61` `in-progress`, `:245` `planned`) is flipped by `/10x-archive`, so it is not part of this finding.
- **Fix**: Set roadmap `:218` PRD refs to `FR-010`. In `open-items.md`, drop S-14 from the open slices (`:5`), mark Q-05 resolved with the release dates (`:32`), and remove the stale next step (`:73`).
- **Decision**: FIXED (roadmap `:218` PRD refs → `FR-010 (nowa funkcja)`; open-items: S-13 is the only open slice and S-14 waits for its archive, Q-05 resolved with both release times, next step → `/10x-archive nickname`)

### F2 — Deferred candidates from the plan are recorded nowhere

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/nickname/plan.md:54; context/foundation/open-items.md
- **Detail**:
  - "What We're NOT Doing" calls DB-level enforcement that a member has a nickname a "kandydat do osobnej zmiany po wydaniu 2". Without it, a direct `join_group` call through PostgREST adds a member who shows as "Unknown member".
  - The phase 1 F3 blind spot (look-alike letters, no confusables check) is also unrecorded.
  - Both would be lost when the change is archived.
- **Fix**: Add one deferred entry to `open-items.md` covering both. Trigger: an "Unknown member" in a group whose members all signed in after 2026-10-16, or a reported impersonating nickname.
- **Decision**: FIXED (open-items §4: new deferred S-14 line for nickname enforcement and confusables with its trigger; the OPP-6/7/8 line notes that `POST /api/account/nickname`, the 14th data route, met its trigger on 2026-10-16, and leaves the decision to the owner)

### F3 — README's RLS paragraph omits the visible-character rule

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:216
- **Detail**:
  - The paragraph lists the nickname rules as "unique exactly as typed, 2 to 24 characters and trimmed".
  - It leaves out `nicknames_nickname_visible` (phase 1 F3 Fix A), which RLS asserts.
  - The README route row and the glossary already mention that rule.
- **Fix**: Add "with visible characters only (no control or format characters)" to that list.
- **Decision**: FIXED (README:216 lists the visible-character rule)

### F4 — e2e nickname assertions would also pass if the e-mail address were shown

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/seed.spec.ts:32; tests/e2e/invite-join.spec.ts:84,86
- **Detail**:
  - Every e2e nickname is a substring of the same account's address:
    - A persona's nickname is `token` and its address is `e2e-${token}@example.test`.
    - `nicknameFor` takes the local part of the address.
  - The assertions match substrings:
    - `getByText(\`Signed in as ${nickname}\`)`has no`exact`.
    - `filter({ hasText: memberToken })` and `filter({ hasText: owner.nickname })` would match a row that shows the address.
  - So the specs, edited to prove "members are named by nickname", do not prove it.
  - Smoke still guards the contract. `checkoff-round-trip` is unaffected because its regex is anchored.
- **Fix**:
  - In `seed.spec.ts`, add `expect(page.getByRole("main")).not.toContainText("@")`.
  - In `invite-join.spec.ts`, add the same check on the dashboard after joining.
- **Decision**: FIXED (`expect(page.getByRole("main")).not.toContainText("@")` after the outcome in `seed.spec.ts` and `invite-join.spec.ts`; break-check: with the address added to the "Signed in as" line in `AppLayout.astro`, both specs went red on the new line while the nickname assertions still passed; layout restored; full Playwright on a fresh build 13 passed)

### F5 — Two middleware `toBeNull` assertions cannot fail

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/middleware.test.ts:41,216,287
- **Detail**:
  - `buildContext` seeds `locals: { user: null, nickname: null }`.
  - So `expect(context.locals.nickname).toBeNull()` passes in the "reach %s without a nickname" test and the public-page test whether or not the middleware's reset (`src/middleware.ts:22`) runs.
  - In Astro, `locals` starts without the key.
  - The other assertions in those tests (`from` not called, `maybeSingle` called once) are real.
- **Fix**: In those two tests, seed `context.locals.nickname = "stale"` before calling the middleware, so `toBeNull` proves the reset.
- **Decision**: FIXED (both tests seed `context.locals.nickname = "stale"` before the call; break-check: without the reset at `src/middleware.ts:22` the public-page test went red, 1 failed / 21 passed; restored, 22/22)

### F6 — Progress row 2.11 cites the wrong commit

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/nickname/plan.md:503
- **Detail**:
  - Row 2.11 ("Zapis wydania 2 w `deployment-plan.md` Phase 18") ends with `— a08916e`.
  - The release 2 record was written in 40d0f1e, the closeout PR #152 (merge 209656a), as the plan required.
  - Rows 1.19, 1.20, 2.7–2.10 cite the release they verify, and that is right for them.
- **Fix**: Change the evidence on 2.11 to `— 40d0f1e`.
- **Decision**: FIXED (row 2.11 cites 40d0f1e)
