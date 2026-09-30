<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Test rollout Phase 1 — runner, data isolation and permissions

- **Plan**: context/changes/testing-runner-data-isolation-and-permissions/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-09-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Rate-limit headroom (row 1.9) has no recorded note

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.9 / Phase 1 Manual Verification
- **Detail**: The plan asks for the headroom (`sign_in_sign_ups = 30` per 5 min, sign-ins per file) to be "recorded in the phase note". Row 1.9 is ticked, but the figures exist only in the chat and PR body, not in a file in the change folder.
- **Fix**: Add the figures (1 sign-in per user per file; foundation file creates 1 user; 30 per 5 min per IP) to `change.md` Notes.
- **Decision**: FIXED

### F2 — Alias path built from `URL.pathname`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: vitest.config.ts:5
- **Detail**: `new URL("./src", import.meta.url).pathname` stays percent-encoded, so a checkout path with spaces or non-ASCII characters would break the `@` alias. Works today (`@/types` is a type-only import, erased at runtime).
- **Fix**: Use `fileURLToPath(new URL("./src", import.meta.url))`.
- **Decision**: FIXED

## Evidence

- Plan vs diff: all 5 planned files present and matching intent; extra `tests/setup/constants.ts` (shared test e-mail prefix/password) is a small, justified addition. No app, schema or `src/types.ts` changes; no ESLint/tsconfig changes needed.
- Safety: local-host guard (`127.0.0.1`/`localhost`), all-or-none env vars, `supabase start` hint, teardown sweep limited to the `vitest-` prefix, groups deleted before users.
- Automated re-run at HEAD: `npm test` 1 passed, `npm run lint` clean; unreachable-stack and non-local-URL runs exit 1 with the expected messages (earlier in this phase); `astro check` and `build` clean.
- Manual rows 1.7–1.9 confirmed by the user.
