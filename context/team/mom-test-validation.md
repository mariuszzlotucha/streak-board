# Mom Test Validation Plan

## Input Idea

`progress-drift`, the first candidate in `context/team/opportunity-map.md`: a read-only script that compares the 10x records (Progress rows in `plan.md`, roadmap status, deployment-plan phases) with git and GitHub, and prints each mismatch with a link. This plan tests whether the drift it would catch costs enough to justify building it. Nobody else runs this workflow, so the interview becomes a self-retrospective and the survey becomes a per-slice log.

## Hypotheses

- **User/role**: the owner, who merges PRs, approves releases and does the owner-only manual checks, and the AI agent sessions that write the records. No other user of this workflow is reachable (owner, 2026-10-12).
- **Friction**: the 10x records disagree with git and GitHub, and keeping them aligned costs follow-up commits and review findings.
- **Current workaround**: the agent writes follow-up commits (SHA write-back, CI ticks, close-outs); the impl review spots mismatches by reading; `/10x-status` checks drift inside the markdown (`change.md` status against Progress ticks and the archive folder); since 2026-10-12 a saved note says to tick a phase's CI row on the next branch or in the closing docs PR.
- **Risky assumptions**:
  1. The drift costs the owner something. The facts point the other way: the agent wrote all 42 bookkeeping commits, and S-11 took the owner almost no time.
  2. A script can see most of it. Only 5 of the 9 findings are mechanical, and two of those need prose matching.
  3. Someone runs the report and acts on it. A `lessons.md` rule is future intent, and several existing lessons exist because an earlier instruction was skipped (review steps labelled optional, `/10x-research` left out of command lists).
  4. The drift matters after the fact. Each of the 9 findings was fixed with a small doc edit or accepted as is.
  5. The bookkeeping can be cut. The 10x Progress convention requires the SHA suffix, and `/10x-status` builds its resume hint from it.
- **Evidence already present**:
  - 42 of the 254 non-merge commits only record SHAs, tick rows or close out a plan, and all 42 carry the agent's co-author trailer (232 of the 254 do).
  - 9 impl review findings about records across the 15 archived changes (the opportunity map said 10; one was UI copy that broke a glossary rule).
    - Mechanical (5): a CI row left unticked although the PR's checks were green (checkoff-and-leaderboard 6.2); CI rows ticked one phase late (dashboard-ui 1.12 and 2.10); a row claiming a merge that could not have happened yet (google-login 1.8); one deployment-plan phase number claimed by two plans (Phase 14); a cancelled release run left unrecorded (dashboard-ui).
    - Judgment (4): manual rows ticked on indirect or owner-reported evidence (custom-domain 1.8, custom-domain 4.7–4.11); a row contradicting its own record (google-login 1.4); a figure kept only in the chat (testing-runner 1.9).
  - None of the 9 records a wrong decision or a production problem. The one costly case on record, S-01 archived as done while its tables were never confirmed on the hosted project, predates the `release` job, which now applies migrations itself.
  - Owner answers (2026-10-12): the owner spotted the last wrong record personally; the owner's time on records in S-11 (PRs #101–#106) was "almost none — the agent did it".
  - Missing: how often the owner spots drift, what that costs, and any case that got past the review.

## Critique

- **Problem vs solution.** The map bundles two pains: the volume of bookkeeping (42 commits) and missed drift (9 findings). A read-only report addresses only the missed drift. The volume stays until the SHA write-back goes, and the 10x Progress convention requires it.
- **Future intent vs past behaviour.** "The skills will run it through a `lessons.md` rule" is a promise. In this repo, past instructions were skipped until they were restated.
- **What would prove it is not worth building.** The owner cannot name a recent case where drift cost time or misled anyone. Or the next two slices, with the CI-tick note in place, show at most one mechanical drift each.
- **Existing answers that may be enough.** The impl review (it found all 9), `/10x-status`, the CI-tick note of 2026-10-12, and a "records" check in the review, which costs no code.
- **Strong evidence to proceed.** Two or more recent cases where drift cost the owner a re-check, a separate PR or a wrong starting point, or mechanical drift that keeps appearing despite the note.
- **The map's replay is not part of this validation.** It needs the script to be built first, and reading the 9 findings already shows its ceiling: 5 of 9, two of them through fragile prose matching. It tests feasibility, not need.
- **Overall.** The opportunity map is well shaped, but its evidence shows frequency, not cost, and the owner's answers so far point to a low cost.

## Interview Guide

Adapted for a single user: a 25-minute self-retrospective in one sitting, with `git log`, the S-11 PRs (#101–#106) and the plan files open.

- Answer only from something you can open: a commit, a PR, a plan row, a chat log. Write "don't know" when there is no trace.
- Write each answer before reading the next question, and do the whole retrospective before thinking about the script.
- If the tool is ever shared, the same questions work for another developer who brings their last plan and its PRs.

Questions not to ask yourself:

```text
Instead of: Would a drift report save me time?
Ask:        When did I last open GitHub to check a Progress row, and what did I do next?
Why:        shows whether the check happens at all, and what it costs when it does

Instead of: Would I run the script before every archive?
Ask:        When did I last run /10x-status, and what did I do with its output?
Why:        behaviour with the drift checker you already have predicts behaviour with a new one

Instead of: Is records drift a real problem?
Ask:        Which records did I correct in the last slice, who noticed each one, and how long did each take?
Why:        turns a yes/no opinion into a countable list
```

1. **Context warm-up (3 min)**
   1. How many slices did you close in the last month, and which steps of each did you do yourself rather than the agent?
      - Follow-up: which of those steps do you do every time without thinking?
   2. When did you last open a plan's Progress section yourself, and what were you looking for?
2. **Recent story (7 min)** 3. Walk through the last wrong record you spotted yourself: what were you doing when you noticed, and which file and row was it?
   - Follow-ups: what did you open to check it? What did you do next?
   4. What happened between noticing it and the fix: who fixed it, on which branch or PR, and how long had it been wrong?
3. **Current workaround (5 min)** 5. In S-11 (PRs #101–#106), who ticked each CI row, when, and on which branch? Where did you look to confirm that CI had passed? 6. When did you last run `/10x-status`, and what did you do with its output?
   - Follow-up: if never, what told you where a change stood?
4. **Cost (5 min)** 7. In the last three slices, did a wrong record make you or the agent start from the wrong place, redo a step or open an extra PR? Which one, and how long did it take from noticing to the merged fix? 8. Take the last review finding about records you remember. What did it cost you in reading, deciding and merging?
5. **Existing alternatives (2 min)** 9. Besides the review, what tells you today that GitHub and the plan agree: the PR page, Actions, a habit, or nothing?
6. **Decision signal (3 min)** 10. On 2026-10-12 you saved a note about CI ticks riding the next branch. What made that case worth a note when the earlier ones were not? 11. The last time you turned a recurring chore in this repo into a script (smoke, token contrast, screenshots), what tipped it?
7. **Closing ask** 12. Keep the per-slice log below for the next two slices, with the PR links.

## Survey

Adapted for a single user: a per-slice log, filled in within two minutes of archiving each of the next two slices. Record each slice under a `### <slice ID>` heading in the Log section at the end of this file.

1. **Screen:** did this slice go through plan → phase PRs → archive with a Progress table? Yes / No (if No, skip the log for this slice)
2. Records wrong at any point during the slice (rows, SHAs, statuses, deployment-plan entries): 0 / 1 / 2–3 / 4+
3. Who noticed them first? (any that apply) the review / me / `/10x-status` / the agent unprompted / nobody until after the merge
4. My own time on records this slice: under 5 min / 5–20 min / 20–60 min / over 60 min
5. Did a wrong record cause a wrong starting point, a redone step or an extra PR? No / Once / More than once
6. Commits or PRs made to correct a wrong record (not the routine SHA write-back): 0 / 1–2 / 3–5 / 6+
7. Did I run `/10x-status` this slice? No / Yes, and acted on it / Yes, nothing to act on
8. **Open:** the most recent wrong record: which file and row, how it surfaced, and what fixing it took.
9. **Open:** did anything about records get past the review and show up after the merge?

## Decision Criteria

Read after the log covers two slices.

- **Proceed**: at least two wrong records get past the review (the owner or nobody noticed them first), at least one costs 10 minutes or more, a wrong starting point or an extra PR, and they are of the mechanical kind: a CI row against its checks, a SHA not on master, a phase-number clash, an unrecorded release run. Continue with `/10x-shape` → `/10x-prd` → `/10x-roadmap`.
- **Narrow scope**: the drift that persists is a single class, most likely CI-on-PR rows. Check only that class (a few lines comparing each phase PR's checks with its CI row before the closing docs PR), not the full reconciler; small enough for one change through `/10x-new`.
- **Do not build yet**: the owner's time on records stays under 5 minutes per slice, and no wrong record misleads anyone or costs an extra PR. S-11 already looks like this.
- **Try existing tool/process first**: the review or `/10x-status` catches the drift before the merge, or the drift is the CI-tick timing case that the note of 2026-10-12 covers. Keep the note, and run `/10x-status` before `/10x-archive` if one more guard is wanted.

**Current read (2026-10-12): do not build yet**, provisional until the log covers two slices. The review, `/10x-status` and the CI-tick note cover what S-11 showed.

## Log

### S-12 (`refactor-opportunities`, archived 2026-10-15)

PRs: [#125](https://github.com/mariuszzlotucha/streak-board/pull/125) (Phases 1–5 in one goal run, plus the impl-review fixes), [#126](https://github.com/mariuszzlotucha/streak-board/pull/126) (guard follow-up), [#128](https://github.com/mariuszzlotucha/streak-board/pull/128) (archive), [#129](https://github.com/mariuszzlotucha/streak-board/pull/129) (deployment-plan Phase 15 and the Manual ticks). Logged 2026-10-15 by the agent from the session's own trace, with the owner's answers to questions 4 and 7.

1. **Screen:** Yes. Plan → one implementation PR (the owner chose a single `/10x-goal-implement` run over the plan's per-phase releases) → archive, with a Progress table.
2. **Records wrong at any point:** 0. The impl review's 7 findings (2 warnings, 5 observations) were all about code and docs (the guard's comment stripping and ordering, the coverage guard's directory list, README wording), none about a Progress row, SHA, status or deployment-plan entry. The Phase 15 skeleton in the deployment plan held `TBD` placeholders by design and was filled in #129.
3. **Who noticed first:** nobody had anything to notice. The CI rows 2.10 and 5.8 were ticked in the closing docs PR (#129), as the note of 2026-10-12 says, so the "CI tick rides the next branch" case did not recur as drift.
4. **Owner's own time on records:** under 5 min. The owner's time went to starting the goal run, supervising it, merging the four PRs, approving the release, the hosted privilege query and the production check; no record was written or corrected by the owner (owner, 2026-10-15).
5. **Wrong starting point, redone step or extra PR:** No.
6. **Correction commits or PRs:** 0. The routine bookkeeping was the goal run's per-phase SHA write-back, the archive commit (#128) and the closing docs PR (#129).
7. **`/10x-status` run:** No (owner, 2026-10-15).
8. **Most recent wrong record:** none in this slice.
9. **Got past the review:** nothing about records. One caveat for the next reading: the guard's `ai-review` check timed out three times on #126 before passing; that was CI flakiness, not a records issue, and it cost the owner a status question and the agent a re-run and PR #127.

### S-10 (`test-coverage`, archived 2026-10-16)

PRs: [#133](https://github.com/mariuszzlotucha/streak-board/pull/133) (the six plan phases and the review fixes, in one goal run), [#134](https://github.com/mariuszzlotucha/streak-board/pull/134) (closeout: the CI rows, the `e2e` release prerequisite and the ruleset facts), [#135](https://github.com/mariuszzlotucha/streak-board/pull/135) (archive), and this PR, which also fixes the Backlog Handoff rows of S-10 and S-12. Logged 2026-10-16 by the agent from the session's own trace, with the owner's answers to questions 4 and 7.

1. **Screen:** Yes. Plan → one implementation PR (the owner chose one goal run over the plan's per-phase PRs) → closeout PR → archive PR, with a Progress table.
2. **Records wrong at any point:** 2. The plan's tag SHA `30c01bb` was stale (the deployed commit was `fb62d74`), caught before the tag was pushed. The Backlog Handoff rows of S-10 and S-12 still said "ready" after their archives, fixed in this PR.
3. **Who noticed first:** the agent, both times: the stale SHA while confirming the deployed commit, the Backlog rows while checking the roadmap after the archive. The owner did not report either.
4. **Owner's own time on records:** under 5 min (owner, 2026-10-16).
5. **Wrong starting point, redone step or extra PR:** No wrong starting point and no redone record step. One extra PR: the archive commit could not go to `master` directly, so it went through #135.
6. **Correction commits or PRs:** 1 (`659e7ae`, a comment reworded after an ai-review minor). The owner also decided one plan deviation, `e2e` as a prerequisite of `release` (`cf52ebc`), after a claude-review note; it is recorded in the deployment plan, not as a records correction.
7. **`/10x-status` run:** No (owner, 2026-10-16).
8. **Most recent wrong record:** the Backlog Handoff rows of S-10 and S-12, found after the archive. No skill or check reads that table: the archive skill updates the At a glance row, the item and the Done list only.
9. **Got past the review:** the same Backlog rows, which no review or check reads. The stale SHA was caught before anything used it.
