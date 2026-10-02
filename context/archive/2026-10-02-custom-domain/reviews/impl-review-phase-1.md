<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Custom domain Implementation Plan

- **Plan**: context/changes/custom-domain/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

Mode: the diff is documentation only (4 files, commit `0b15b59` on `s-06/custom-domain/phase-1`, plus the uncommitted SHA write-back in `plan.md`), so the review was done inline without sub-agents. Plan-adherence, scope and pattern checks were made by reading the diff against the Phase 1 block; the security, performance and data-safety scan has nothing to apply to (no code, config, schema or secrets changed).

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

Automated criteria re-run on 2026-10-02 after the commit:

| Row | Command                                                              | Result                                                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1.1 | `curl` `https://streakboard.app/`                                    | `200`                                                        |
| 1.2 | `curl` `/auth/signin`                                                | `200`                                                        |
| 1.3 | `curl` `/dashboard`                                                  | `302 https://streakboard.app/auth/signin`                    |
| 1.4 | `curl` `/auth/callback`                                              | `302 https://streakboard.app/auth/signin?error=link_expired` |
| 1.5 | `curl` old host                                                      | `/` `200`, `/dashboard` `302`                                |
| 1.6 | `npx prettier --check context/changes/deployment/deployment-plan.md` | passes                                                       |

The certificate claim in Phase 10 was re-checked with `openssl s_client`: `CN=streakboard.app`, issuer Google Trust Services `WE1`, `notAfter` Dec 31 2026. Manual rows 1.7 to 1.9: 1.7 rests on the owner's DNS listing (4 of 200 records, one apex record created by the Custom Domain, three Resend records under `mail.`); 1.8 rests on the owner's Domains & Routes listing plus the live `200` over valid TLS; 1.9 is visible in the diff.

Scope: the four changed files are the plan's `deployment-plan.md` (Phase 1 change 3) and the bookkeeping that `/10x-implement` requires on entry (`change.md` to `implementing`, roadmap S-06 to `in-progress`, Progress rows). Nothing under `src/`, `supabase/`, `tests/`, `wrangler.jsonc` or `ci.yml` changed, as the "not doing" list requires. Lessons checked: English commit message, branch `s-06/custom-domain/phase-1` cut from `origin/master`, explicit-path staging, branch kept local until this review is triaged.

## Findings

### F1 — Phase 10 says the missing MX record is intentional

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md (Phase 10, DNS state bullet)
- **Detail**: The bullet says "`www` has no record and the apex has no MX; both are intentionally left alone." The plan puts `www` out of scope (until S-09) but never decides anything about MX or inbound e-mail for the apex, and the dashboard even warns that mail to `@streakboard.app` cannot be received. The word "intentionally" records a decision nobody made.
- **Fix**: Reword to "both are outside this change" so the record states what the plan says and not more.
- **Decision**: FIXED (Fix now): reworded to "both are outside this change" in deployment-plan.md Phase 10

### F2 — Manual row 1.8 is ticked without a visible status in the panel

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/custom-domain/plan.md, row 1.8
- **Detail**: Row 1.8 says the entry "shows active in the dashboard with its certificate issued". The owner's pasted panel text lists `streakboard.app` under Custom Domains and Routes (Production) but shows no status field, so "active" was inferred from behaviour (`200` over a valid Google Trust Services certificate), not read from the panel. The inference is sound, and Phase 10 claims only what was measured, but the row is ticked on indirect evidence.
- **Fix**: None needed; accept and keep Phase 10 worded as it is (it states the certificate and the responses, not a panel status).
- **Decision**: SKIPPED: accepted as is; the live 200 over a valid certificate shows the domain works, and Phase 10 states only what was measured

### F3 — Roadmap table re-padded by the formatting hook

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md ("At a glance" table, 12 lines)
- **Detail**: The meaningful change is two words (`planning` to `in-progress` in the S-06 row and block). `in-progress` is wider than the other statuses, so the pre-commit `prettier --write` re-padded every row of the table (12 lines of whitespace-only diff). `roadmap.md` is edited by parallel slices, so a second branch that touches the table will conflict on those rows. The padding is inherent to the status word, and any later commit of the file would re-pad it again, so reverting would not help.
- **Fix**: Accept; the PR that merges second resolves the conflict, as the plan's Migration Notes already say.
- **Decision**: SKIPPED: accepted as is; the padding comes from the status word, and the PR that merges second resolves any conflict (plan Migration Notes)
