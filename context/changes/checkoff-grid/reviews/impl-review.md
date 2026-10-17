<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Checkoff Grid (S-13)

- **Plan**: context/changes/checkoff-grid/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Grid reveals each member's join period; privacy policy silent

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/grid-rules.ts:58-61, src/components/privacy/WhoCanSee.astro
- **Detail**: "Not joined" cells let every group member infer the day/week another member joined a task (no timestamp reaches the HTML). The plan excluded a WhoCanSee change because "the grid does not show the join date as a date", but CLAUDE.md requires the policy to state who sees what; the inferred join period is a new visible fact.
- **Fix A ⭐ Recommended**: Add one sentence to WhoCanSee: members see, per task, the recent days/weeks each participant marked done and which of them came before they joined.
  - Strength: Policy matches the product; one sentence, no code.
  - Tradeoff: Touches a file the plan excluded; smoke may bind policy text (check).
  - Confidence: HIGH — fact is visible in every grid.
  - Blind spot: Owner may consider it already covered.
- **Fix B**: Accept as covered by the existing sentence and record the reasoning in the plan.
  - Strength: No change.
  - Tradeoff: Policy stays implicit about a derivable fact.
  - Confidence: MED — depends on the owner's reading.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A: sentence added to WhoCanSee.astro)

### F2 — Grid failure is logged as a leaderboard failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/dashboard-data.ts:114-139
- **Detail**: Per plan, buildGrids runs inside the board try/catch; a grid throw drops the leaderboard too and reports `dashboard.leaderboard.failed`, misleading in logs. Behaviour is as planned.
- **Fix**: Add a comment at the try stating the event covers both board and grids (keep the coupling the plan chose).
- **Decision**: FIXED (comment at the board/grids try)

### F3 — snapshotOf does not use the new normalisePeriod

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/streak-rules.ts:113-131
- **Detail**: Both snap weekly keys identically today, but two copies of the rule can drift; the plan wanted one shared helper.
- **Fix**: Have snapshotOf call normalisePeriod for its weekly snap.
- **Decision**: FIXED (shared private periodDayOf used by snapshotOf and normalisePeriod)

### F4 — Misleading future-key comment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/grid-rules.ts:~57
- **Detail**: Comment says future keys never fall inside the horizon; a weekly key later in the current week lands in the current period (correct, matches the streak).
- **Fix**: Reword the comment to say future days count only within the current week, like the streak.
- **Decision**: FIXED (comment reworded)
