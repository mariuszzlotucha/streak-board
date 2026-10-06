<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Google login

- **Plan**: context/changes/google-login/plan.md
- **Scope**: Phase 1 of 2
- **Reviewed phases**: 1
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

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

- Diff scope: one commit, `4a816ae`, four files, all documents: `context/changes/deployment/deployment-plan.md` (Phase 12 section), `context/changes/google-login/plan.md` (Progress rows only), `context/changes/google-login/change.md` (status and date), `context/foundation/roadmap.md` (S-07 status, `updated`, table re-aligned by Prettier). No file under `src/`, `tests/`, `scripts/` or `.github/`. Every planned file is in the diff and nothing unplanned is.
- Automated rows re-run in this review: 1.1 (`302` to `https://accounts.google.com/`, `client_id=` present, `redirect_uri` equal to the Supabase callback) and 1.2 (`prettier --check` passes on all four changed files).
- Secret scan of the added lines: no Client ID value, no `GOCSPX` secret, no e-mail address. The only matches are the words `client_id=` in the check description and in the Progress row.
- Phase 12 follows the plan contract: heading, `**Status: in progress**`, dated bullets, and an "owner-reported" tag on every row only the owner can see. It sits after Phase 11 and before "Verification checklist".
- The branch `s-07/google-login/phase-1` is local only (only the merged planning branch exists on the remote), as the lessons require until this review is triaged.
- The `plan.md` SHA write-back (rows 1.1 to 1.8 carry `4a816ae`) is still uncommitted and goes into the review commit.

## Findings

### F1 — Row 1.8 is ticked before its merge condition can be checked

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/google-login/plan.md:299
- **Detail**: Row 1.8 reads "committed on the Phase 1 branch ...; its merge to `master` is verified when the Phase 2 branch is cut". The commit part is proven by the diff. The merge part cannot be true yet: the branch is not pushed. The tick is correct under the plan's own wording, but nothing yet makes the Phase 2 start verify it.
- **Fix**: At the Phase 2 cut, after the merge and `git pull --ff-only`, check that `4a816ae` (or its merge) is in `master`; if it is not, untick 1.8.
- **Decision**: FIXED — no file change; the check is queued for the start of Phase 2 (after the Phase 1 PR is merged and `master` is pulled)

### F2 — The "Confirm email on" consequence is a source reading recorded as a fact

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deployment/deployment-plan.md (Phase 12, first bullet)
- **Detail**: The bullet says that with "Confirm email" on, the accepted-risk case the plan describes for "off" is not in effect. The value "on" is owner-reported and fine. The consequence rests on the GoTrue v2.196.0 source reading in `research.md` (section 5, the unconfirmed-account and "Confirm email off" bullets), which no live run has confirmed. A deployment record should not state an untested inference as production fact.
- **Fix**: Add "(by the source reading in the `google-login` research, not tested live)" to that sentence.
- **Decision**: FIXED — the sentence in the Phase 12 first bullet now ends "by the source reading in the `google-login` research (GoTrue v2.196.0), not tested live"
