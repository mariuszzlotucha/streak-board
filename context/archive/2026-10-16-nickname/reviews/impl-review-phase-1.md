<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Nick zamiast e-maila (S-14 `nickname`)

- **Plan**: context/changes/nickname/plan.md
- **Scope**: Phase 1 of 2
- **Reviewed phases**: 1
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 5 observations

Reviewed: d8ae9ae (`feat(nickname): …(p1)`) and 4801c6e (Progress SHAs) against origin/master. All 15 planned changes are present. No change is MISSING, and none drifts in behaviour. Every extra is either a known adaptation from the run report or harmless. Key questions checked and found fine:

- A user without a nickname can't reach any protected page or action: the gate covers `/api/groups|tasks|account`, with only the nickname page and its route exempt.
- `set_nickname` writes only the caller's own row (`auth.uid()`, SECURITY DEFINER, `search_path ''`, no grant for anon).
- No other member's e-mail reaches the dashboard HTML or the island props: `listGroupMembers` copies exactly four fields, and smoke checks every 200 response.
- Every Supabase `{ error }` is reported, and no `?error=` value is ever reflected.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Success criteria, all re-run on HEAD 4801c6e on 2026-10-16:

- 1.1 guard: 0 violations
- 1.2 db reset + types:check: PASS
- 1.3 lint + build + astro check: 0 errors
- 1.4 unit: 448/448
- 1.5 npm test: 44 files, 809/809, first run
- 1.6 RLS: 323 assertions
- 1.7 smoke on preview: 266 PASS, 0 FAIL
- 1.8 Playwright: 13 passed
- 1.9 deps: no violations
- 1.10 mutation: 92 covered mutants, every one with `testsCompleted >= 1`, 91 killed, 1 equivalent survivor at nickname-errors.ts:27
- 1.11 screenshots: 38 PNGs, to the scratchpad so the committed set stays as it is

Manual rows 1.12–1.20 are pending; none is ticked, so nothing is ticked without evidence.

## Findings

### F1 — Privacy policy still says only an e-mail address is required

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/privacy/ProvidingData.astro:8
- **Detail**: "Do you have to give us your data" says "An e-mail address is needed to create an account; without it the service cannot work." A nickname is now required before any protected page. CLAUDE.md requires a data-model change to update the policy in the same change. The plan's item 15 lists WhoCanSee and WhatWeCollect but not this section, so the gap is in the plan, and the run carried it over.
- **Fix**: Extend the bullet: "An e-mail address is needed to create an account, and a nickname (2 to 24 characters) before you can use the dashboard; without them the service cannot work." `privacy.astro` is already dated 2026-10-16, so the date stays.
- **Decision**: FIXED (bullet rewritten as proposed)

### F2 — Until release 2, any member can still read other members' e-mail addresses through the RPC

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261016162551_add_nicknames.sql:79,87; src/components/privacy/WhoCanSee.astro:9-10
- **Detail**: After release 1, the policy says other members "do not see your e-mail address". That is true in the app's HTML. But `list_group_members` still returns `u.email` to every member who calls PostgREST directly with their own token and the API key. The key is a server-only secret here, so this is hard to do, and the plan accepts the window on purpose (it is the reason for two releases). Its only limit is how soon Phase 2 ships.
- **Fix**: Keep the window short: once release 1 is approved and the tag has moved, run Phase 2 next, before S-13. Note the window, with its dates, in deployment-plan Phase 18.
- **Decision**: FIXED (ordering note added to the plan's Phase 2 overview)

### F3 — Nicknames accept invisible and control characters

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/nickname-rules.ts; supabase/migrations/20261016162551_add_nicknames.sql:30-31
- **Detail**:
  - Only space, tab, CR and LF are trimmed, and uniqueness is literal. So a nickname of two NBSPs (accepted on purpose by the plan's rule-contract cases), two zero-width spaces or RTL-override characters is valid. It renders as a blank or misleading name in the member list and on the leaderboard, and look-alike letters can imitate another member.
  - Not verified on the stack: a NUL character passes `normalizeNickname`, but Postgres rejects it (22P05). The route would map that to `unknown` and log it at error level, so any user could trigger error-level logs at will. `rename` and `normalizeGroupName` share this, so it is not new.
  - Migration A is not released yet, so changing its CHECK now costs one file. After release, it needs a new migration.
- **Fix A**: Reject Unicode `Cc` and `Cf` characters and all-whitespace values, both in `normalizeNickname` and in a new CHECK in migration A, before release.
  - Strength: Closes blank names, bidi spoofing and the NUL log path in one rule, while the migration is still editable. The rule-contracts test pins the TS and SQL sides together.
  - Tradeoff: Goes beyond the approved plan (its rule-contract cases expect NBSP×2 to be accepted). Means new contract cases, RLS and unit changes, and re-running every gate.
  - Confidence: MED — the Postgres regex classes for `Cf` need care (`[[:cntrl:]]` covers `Cc` only), and they must match the JS `\p{Cc}\p{Cf}` exactly.
  - Blind spot: Look-alike letters (Cyrillic "а") stay possible; only a confusables check would catch them.
- **Fix B ⭐ Recommended**: Accept for now and record it as a follow-up in `open-items.md`, with the trigger "a blank or impersonating nickname reported".
  - Strength: Keeps the approved plan and the green gates. The risk sits inside small groups where members know each other, and the owner already chose literal uniqueness.
  - Tradeoff: A later fix needs its own migration and has to deal with nicknames that already exist.
  - Confidence: HIGH — matches the owner's earlier decisions on uniqueness and the plan's NBSP case.
  - Blind spot: The NUL / 22P05 path was not reproduced.
- **Decision**: FIXED (Fix A).
  - **TypeScript** (`src/lib/nickname-rules.ts`):
    - `FORBIDDEN_NICKNAME_RANGES` covers Unicode Cc and Cf except ZWNJ and ZWJ, so emoji ZWJ sequences and ZWNJ scripts still work.
    - `BLANK_NICKNAME_RANGES` covers spaces, separators, joiners, Hangul fillers, the braille blank and variation selectors.
    - `isVisibleNickname` is called from `normalizeNickname`. The patterns are built per call, because a memo hid runtime mutants.
  - **Database**: migration A gains the CHECK `nicknames_nickname_visible`, with the same ranges as explicit escapes. Migration A is unreleased, so it is edited in place.
  - **Form**: `NicknameForm` shows "Nickname must use visible characters, without control or format characters". The server message stays as it is, because smoke pins it.
  - **Tests**:
    - A unit test pins the forbidden list to the runtime's `\p{Cc}\p{Cf}` over every code point, so a Unicode update that adds a format character fails it.
    - `rule-contracts` sends every range endpoint through both sides, and pins NUL to 22P05 with TS rejecting it first.
    - RLS gains 3 cases (326 assertions).
  - **Deviates from the approved plan**: item 11 accepted NBSP×2, which is now rejected.
  - **Verification**:
    - Break-check: dropping the forbidden test turned 4 tests red.
    - Mutation of `nickname-rules`: 83 mutants, 82 killed, 1 equivalent, all with `testsCompleted >= 1`. Recorded in `mutation-baseline.md`.
    - Glossary and README route row updated.

### F4 — The plan's mutation command and line ranges are wrong, and the baseline row was not updated in place

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/nickname/plan.md:241,328; context/foundation/mutation-baseline.md
- **Detail**: The plan's command repeats `--mutate`, and Stryker keeps only the last value, which mutates 1 of 288 files. `leaderboard-rules.ts:49-63` is now 52-66. The run used one comma-separated `--mutate` (recorded as an adaptation). Instead of updating the S-10 `leaderboard-rules` row as planned, it added a separate "S-14 re-run" table, which is the right call: a narrowed run can't replace a whole-module row. The plan text still has the broken command for anyone re-running it.
- **Fix**: Correct the command on plan lines 241 and 328 to `--mutate "src/lib/nickname-rules.ts,src/lib/nickname-errors.ts,src/lib/nicknames.ts,src/lib/leaderboard-rules.ts:52-66"`, with a one-line note on the baseline table.
- **Decision**: FIXED (plan lines 241 and 328 corrected; the baseline already explains the separate S-14 table)

### F5 — Stale or inaccurate documentation references

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md (smoke paragraph, mutation paragraph:399); context/foundation/roadmap.md:61; context/domain/01-domain-distillation.md:64,66,86,87,178,190,191,242; src/pages/dev/dashboard-kitchen-sink.astro:20-22
- **Detail**:
  - README, smoke paragraph: the Account card is listed under "for the owner", but smoke checks the card only for user A before A has a group (smoke.mjs:891).
  - README, mutation paragraph: `nicknames.ts` is listed among modules "without I/O", but it queries Supabase through a client passed in.
  - roadmap S-14, PRD refs column: "PRD nie zna nicka", but FR-010 now exists.
  - The distillation cites `leaderboard-rules.ts` lines that moved by 3, for example W-06 `:39`, which is now `:42`, and N-18 `:44-48`, which is now `:47-66`.
  - The kitchen-sink header comment says "the states of both pages" (there are now three), and line 22 is 191 characters long.
- **Fix**: Correct each reference in place: README wording, the roadmap PRD refs set to `FR-010`, the distillation line numbers moved +3, and the comment rewrapped to say "the three pages".
- **Decision**: FIXED.
  - README: the Account card moved to the no-group step for user A, and the mutation paragraph says the modules do no I/O of their own (`auth-state` and `nicknames` take a client).
  - roadmap S-14 PRD refs: `FR-010 (nowa funkcja)`.
  - Distillation: 6 references moved to the current lines (:42, :47-51, :52, :106-108, :106-136, :110).
  - Kitchen-sink comment rewrapped, and it now says "the three pages".

### F6 — e2e-user.mjs leaves an orphaned auth user when the nickname insert fails

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/e2e-user.mjs:96-101
- **Detail**: If the nickname insert fails, the script throws after `admin.auth.admin.createUser` and leaves the user behind. Its sibling `createPersona` (tests/e2e/local-supabase.ts:110-114) deletes the user in the same case. The impact is low, because the CI stack is thrown away and the script refuses non-local hosts.
- **Fix**: Before throwing, call `admin.auth.admin.deleteUser(data.user.id)`, as `createPersona` does.
- **Decision**: FIXED (the user is deleted before the throw)
