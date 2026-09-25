# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Write commit messages in English only

- **Context**: Any commit created during implementation, including per-phase commits and the epilogue commit, and any commit message proposed to the user.
- **Problem**: Commit subjects derived from Polish plan or phase titles end up in Polish or mixed-language, so the git history is inconsistent.
- **Rule**: Always write commit messages (subject and body) entirely in English; translate phase titles from the plan instead of copying them, and never mix languages within a message.
- **Applies to**: implement, impl-review

## Work every phase on its own branch and open a PR with gh

- **Context**: Starting, finishing and archiving any implementation phase (`/10x-implement`, `/10x-archive`); the repo remote is GitHub and the `gh` CLI is installed and authenticated.
- **Problem**: Phases committed straight to `master` cannot be reviewed on their own, cannot be reverted independently, and start from whatever local state happens to be checked out, which may be stale.
- **Rule**: Before every phase run `git checkout master && git pull --ff-only`, then create a new branch from the fresh `master`. Name it `<roadmap-id>/<change-id>/phase-<N>` using the ID and Change ID from the `## At a glance` table in `context/foundation/roadmap.md` (e.g. `s-01/group-create-join-manage/phase-1`, lowercase ID); for a change with no roadmap item use `<change-id>/phase-<N>`. After the phase commit ritual (green gates, manual confirmation, commit, SHA write-back) push the branch and open a PR against `master` with `gh pr create`, with an English title and body that summarise the phase and link the plan. Once the change is archived, delete its local phase branches (`git branch -d`, never `-D` on unmerged work; ask if a branch is not merged) after checking out and pulling `master`.
- **Applies to**: implement, archive
