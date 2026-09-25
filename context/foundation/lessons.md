# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Write commit messages in English only

- **Context**: Any commit created during implementation, including per-phase commits and the epilogue commit, and any commit message proposed to the user.
- **Problem**: Commit subjects derived from Polish plan or phase titles end up in Polish or mixed-language, so the git history is inconsistent.
- **Rule**: Always write commit messages (subject and body) entirely in English; translate phase titles from the plan instead of copying them, and never mix languages within a message.
- **Applies to**: implement, impl-review

## Work every phase on its own branch and open a PR with gh

- **Context**: Starting, finishing, reviewing and archiving any implementation phase (`/10x-implement`, `/10x-impl-review`, `/10x-archive`); the repo remote is GitHub and the `gh` CLI is installed and authenticated.
- **Problem**: Phases committed straight to `master` cannot be reviewed on their own, cannot be reverted independently, and start from whatever local state happens to be checked out, which may be stale.
- **Rule**: Before every phase run `git checkout master && git pull --ff-only`, then create a new branch from the fresh `master`. Name it `<roadmap-id>/<change-id>/phase-<N>` using the ID and Change ID from the `## At a glance` table in `context/foundation/roadmap.md` (e.g. `s-01/group-create-join-manage/phase-1`, lowercase ID); for a change with no roadmap item use `<change-id>/phase-<N>`. After the phase commit ritual (green gates, manual confirmation, commit, SHA write-back) push the branch and open a PR against `master` with `gh pr create`, with an English title and body that summarise the phase and link the plan. Before a full-plan `/10x-impl-review` run `git checkout master && git pull --ff-only` and review the code as it is on the fresh `master`; if a phase PR is still unmerged, stop and ask instead of reviewing a stale tree. Review fixes go on their own branch `<roadmap-id>/<change-id>/review-fix` cut from that fresh `master`, with a PR opened via `gh pr create`. Once the change is archived, delete its phase branches both locally (`git branch -d`, never `-D` on unmerged work; ask if a branch is not merged) and on GitHub (`git push origin --delete <branch>`) after checking out and pulling `master`. The archive commit itself is made directly on `master` (archiving is not a phase, so no branch or PR) and must be pushed (`git push origin master`) right after it is created.
- **Applies to**: implement, impl-review, archive

## Run planning skills on master and commit their artifacts before implementation

- **Context**: `/10x-research`, `/10x-new`, `/10x-plan` and `/10x-plan-review` for a change, before its first `/10x-implement` phase; covers everything they write under `context/changes/<change-id>/` (including `reviews/`) and the roadmap status edits.
- **Problem**: These skills commit nothing, so their artifacts stay uncommitted and get swept into the first phase branch and PR, mixing planning documents with code (the same failure as review F2 of group-rls-hardening), or are lost from `master` if the phase is abandoned.
- **Rule**: Run the planning skills on `master` (after `git pull --ff-only`), then commit all resulting artifacts to `master` with an English message and push it before starting `/10x-implement` phase 1, so every phase branch is cut from a `master` that already contains the plan.
- **Applies to**: research, plan, plan-review, implement
