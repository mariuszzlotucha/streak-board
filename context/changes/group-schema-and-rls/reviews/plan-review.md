<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Schemat grup i RLS dla widoczności per-grupa

- **Plan**: context/changes/group-schema-and-rls/plan.md
- **Mode**: Deep
- **Date**: 2026-09-25
- **Verdict**: REVISE
- **Findings**: 2 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding

7/7 paths ✓, 3/3 facts ✓, brief↔plan ✓

## Findings

### F1 — Progress section under-counts Manual Verification items

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria / Progress
- **Detail**: `#### Manual Verification:` (plan.md:100-105) lists 6 distinct bullets, but `## Progress` (plan.md:153-157) only has 5 Manual items (1.5-1.9). Bullets at lines 104 (owner removes member / non-owner can't) and 105 (only owner updates/deletes group) are collapsed into the single Progress row 1.9. `/10x-implement` can't track two distinct checks as one line.
- **Fix**: Split Progress 1.9 into two rows — one for line 104, one for line 105 — renumbered 1.9 and 1.10.
- **Decision**: FIXED

### F2 — `npm run lint` will fail on the freshly generated src/types.ts

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Changes Required #2 / Automated Verification
- **Detail**: `eslint.config.js` wires `eslint-plugin-prettier/recommended` in, turning any Prettier formatting diff into an ESLint error. No `ignores` entry exists for `src/types.ts`. Raw `supabase gen types typescript` output isn't guaranteed to match this repo's Prettier config, so bare `npm run lint` (plan.md:95) will predictably fail on first run.
- **Fix**: Change the Phase 1 Contract to generate then format: `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`, and use that same command in Automated Verification.
- **Decision**: FIXED

### F3 — Owner account deletion cascades and destroys the whole group

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, Changes Required #1 (`groups.owner_id` contract)
- **Detail**: `groups.owner_id references auth.users(id) on delete cascade` means deleting the owner's `auth.users` row cascades through `groups` and `group_members`, destroying the entire group and every other member's membership. No account-deletion feature or FR exists yet, so this is currently undecided rather than a deliberate choice, and it's expensive to revisit once real group data exists.
- **Fix A ⭐ Recommended**: Change `groups.owner_id` FK to `ON DELETE RESTRICT`
  - Strength: An owner's account deletion can't silently wipe other members' data — forces an explicit transfer/delete-group step later.
  - Tradeoff: A future account-deletion feature needs its own "delete or transfer your group first" handling — not yet designed.
  - Confidence: MED — safer default for a cross-user cascade, but no deletion feature exists yet to stress-test this.
  - Blind spot: Whether Supabase Auth's own account-deletion flow (if ever used) surfaces a RESTRICT violation cleanly to the end user.
- **Fix B**: Keep `ON DELETE CASCADE`, document it as a deliberate accepted MVP consequence in Critical Implementation Details.
  - Strength: Zero extra schema complexity; matches the trust-based, no-soft-delete ethos already used elsewhere in this plan.
  - Tradeoff: A future account-deletion feature could ship without anyone noticing it destroys other users' group data.
  - Confidence: MED — fine for MVP scale, but a silent landmine later.
  - Blind spot: No PRD signal at all on how account deletion should behave.
- **Decision**: FIXED via Fix A

### F4 — RLS policies don't explicitly scope `TO authenticated`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, Changes Required #1 (RLS policy list)
- **Detail**: None of the six policies specify `TO authenticated`. They're safe today only because `auth.uid()` is NULL for the `anon` role and every `owner_id = auth.uid()` / `user_id = auth.uid()` comparison against NULL is never true — an implicit fallthrough, not a stated guarantee. The plan already calls out one non-obvious RLS behavior (the recursion pitfall) with the same rigor this deserves.
- **Fix**: Add `TO authenticated` explicitly to all six policies in the Contract, instead of relying on implicit NULL-comparison fallthrough for the `anon` role.
- **Decision**: FIXED
