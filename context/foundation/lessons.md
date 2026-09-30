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
- **Rule**: Before every phase run `git checkout master && git pull --ff-only`, then create a new branch from the fresh `master`. Name it `<roadmap-id>/<change-id>/phase-<N>` using the ID and Change ID from the `## At a glance` table in `context/foundation/roadmap.md` (e.g. `s-01/group-create-join-manage/phase-1`, lowercase ID); for a change with no roadmap item use `<change-id>/phase-<N>`. After the phase commit ritual (green gates, manual confirmation, commit, SHA write-back) push the branch and open a PR against `master` with `gh pr create`, with an English title and body that summarise the phase and link the plan. Before a full-plan `/10x-impl-review` run `git checkout master && git pull --ff-only` and review the code as it is on the fresh `master`; if a phase PR is still unmerged, stop and ask instead of reviewing a stale tree. Review fixes go on their own branch `<roadmap-id>/<change-id>/review-fix` cut from that fresh `master`, with a PR opened via `gh pr create`. Once the change is archived, delete its phase branches both locally (`git branch -d`, never `-D` on unmerged work; ask if a branch is not merged) and on GitHub (`git push origin --delete <branch>`) after checking out and pulling `master`. The archive commit goes through a PR too while `master` is protected (see "Archive through a PR while master requires status checks").
- **Applies to**: implement, impl-review, archive

## Run all planning skills on one planning branch and merge it before implementation

- **Context**: `/10x-research`, `/10x-new`, `/10x-plan` and `/10x-plan-review` for a change, before its first `/10x-implement` phase; covers everything they write under `context/changes/<change-id>/` (including `reviews/`) and the roadmap status edits.
- **Problem**: These skills commit nothing, so their artifacts stay uncommitted and get swept into the first phase branch and PR, mixing planning documents with code (the same failure as review F2 of group-rls-hardening), or, when committed straight to `master`, bypass review (and are rejected outright while `master` requires status checks).
- **Rule**: Before the first planning skill run `git checkout master && git pull --ff-only`, then create ONE planning branch `<roadmap-id>/<change-id>/plan` (lowercase ID from `roadmap.md`; `<change-id>/plan` for a change with no roadmap item) and run `/10x-new`, `/10x-research`, `/10x-plan` and `/10x-plan-review` on it, never on `master`. Commit all artifacts (and roadmap status edits) on that branch with an English message, push it and open a PR with `gh pr create`, showing the URL. Merge the PR and `git checkout master && git pull --ff-only` before starting `/10x-implement` phase 1, so every phase branch is cut from a `master` that already contains the plan. Delete the planning branch with the phase branches after archive.
- **Applies to**: research, plan, plan-review, implement

## Smoke steps must assert outcomes, not just the absence of errors

- **Context**: scripts/smoke.mjs:20-28 (and the join/create steps) — smoke steps added for a new feature, in particular anything involving cookies set or cleared by the server.
- **Problem**: The smoke test can pass without proving the core outcomes: `storeCookies` deletes only on `Max-Age=0`, but Astro's `cookies.delete` sends `Expires=1970` with value `deleted`, so cleared cookies stay in the jar and no step asserts they were cleared; no step checks the post-join dashboard state; the preview step checks only that the group name appears in the body, which an error banner would also satisfy; no foreign-Origin (403) or anonymous-path check; a missing regex match silently becomes "undefined".
- **Rule**: Every new smoke step must assert the outcome it exists for: the page state after the action, that a server-cleared cookie is really gone from the jar (treat a past `Expires` as deletion, not only `Max-Age=0`), and that a boundary rejects what it should (for example a foreign-Origin POST answers 403). A body check that a valid-looking error page would also satisfy is not enough; fail fast when a value later steps depend on is missing.
- **Applies to**: implement, impl-review, plan

## Always show the link to the current PR

- **Context**: Every message that reports the state of a phase or review that has a pull request: after `gh pr create`, after pushing more commits to it, when asking how to proceed after a phase, and when starting or finishing a review of it.
- **Problem**: The PR is mentioned only by number (for example "PR #4") or not at all, so the user has to look it up on GitHub before reviewing or merging it.
- **Rule**: Whenever a phase or review has an open PR, include its full URL (the output of `gh pr create`, or `gh pr view --json url -q .url` for an existing one) in the message; when several PRs are relevant, list each URL with its phase.
- **Applies to**: implement, impl-review, archive

## End every planning session with the full list of commands the user has to run

- **Context**: The end of `/10x-frame`, `/10x-research`, `/10x-plan` and `/10x-plan-review` (and `/10x-new`), when the skill hands the change over to the next step.
- **Problem**: The closing message names only the next skill, so the user has to reconstruct the remaining steps (creating the planning branch, commit, push and PR of the planning artifacts, checkout of `master`, the first phase branch, manual setup such as `supabase link`) from the lessons and the plan, and misses one.
- **Rule**: Finish every planning session with one ordered, copy-pasteable list of every command the user still has to run before and for the next step: the git commands that commit and push the planning artifacts on the planning branch and open its PR (with the English commit message), then checkout and pull `master` after the merge, the branch creation for the next phase, any CLI or dashboard action the plan requires the user to do by hand (never one that needs credentials in the chat), and the next slash command with the change ID. Mark shell commands the user should run in the session with the `!` prefix, and say which of them Claude runs itself on request.
- **Applies to**: frame, research, plan, plan-review

## Close every slice with a production deploy and a production Supabase migration

- **Context**: Finishing any roadmap slice (`S-NN`) that reaches production: the last phase of `/10x-plan`, the end of `/10x-implement`, and `/10x-archive`. Deploys are a manual step and `supabase/` is not linked to the hosted project by default.
- **Problem**: A slice is archived as `done` while its migrations exist only in the local stack and its code is live (or not) without the matching schema. Signed-in users on production then get an error instead of the feature (S-01: the group tables were never confirmed on the hosted project), and nobody knows which environment is behind.
- **Rule**: Every slice plan ends with a closing step "production release": (1) `npx supabase migration list` against the linked hosted project, then `npx supabase db push` (it lists the pending migrations and asks for confirmation), done before the code that needs the schema goes live; (2) build and deploy the Worker (`npm run build && npx wrangler deploy`, or confirm that the Cloudflare build of `master` has finished); (3) a manual check of the slice's main flow on the production URL; (4) a note of the date, the applied migrations and the result in `context/changes/deployment/deployment-plan.md`. `/10x-archive` warns when this step is unchecked in `## Progress`. The user runs the credentialed commands (`supabase login`/`link`, `db push`, `wrangler secret put`) with the `!` prefix, never through pasted secrets; Claude prepares the command list, and reads the dry-run and the result.
- **Applies to**: plan, implement, archive
- **Superseded by**: "Close every slice by merging to master, approving the production release and checking the production URL" (below). The release is now automated; the manual steps above no longer apply.

## After every slice lands, show the production deploy and migration commands

- **Context**: Every message that reports a slice (`S-NN`) as implemented, merged or archived: the end of the last `/10x-implement` phase, after a phase PR is merged, the end of `/10x-impl-review` triage, and the end of `/10x-archive`. Complements "Close every slice with a production deploy and a production Supabase migration", which defines the step; this rule is about presenting it.
- **Problem**: The slice is reported as done and the production release is left implicit, so the user has to work out which commands to run, in what order and against which project (S-01: the migrations and the Supabase Site URL were still missing on production after the archive).
- **Rule**: Whenever a slice lands, end the message with the production release as one copy-pasteable command chained with `&&`, in a plain code block: no `!` prefix (the user runs it in their own terminal) and no `--dry-run`. Use `git checkout master && git pull --ff-only && npx supabase migration list && npx supabase db push && npm run build && npx wrangler deploy`; `db push` lists the pending migrations and asks for confirmation, which is the gate. The chain assumes the one-time `npx supabase login` and `npx supabase link --project-ref <ref>` were done in this checkout (the project ref is in `context/changes/deployment/deployment-plan.md`; it is not a secret, and after `link` the CLI reads it from `supabase/.temp/project-ref`, so the chain does not repeat it). Always keep the migration part in the chain, even for a slice without migrations (`db push` then just reports that the remote database is up to date); say which slice migrations are new (file names) or state explicitly that the slice has none. Follow the chain with the production URL and the manual checks for the slice's main flow, and remind the user to record the result in `context/changes/deployment/deployment-plan.md`. Never put credentials or the DB password in the message. Workers Builds may already have deployed `master` on push, in which case `wrangler deploy` only redeploys the same state; migrations must still go before the code that needs them.
- **Applies to**: implement, impl-review, archive
- **Superseded by**: "Close every slice by merging to master, approving the production release and checking the production URL" (below). The copy-pasteable manual chain is no longer the release path.

## Always include /10x-research in the command list for a new slice

- **Context**: Whenever the user asks for the commands (or the workflow) for a new slice or change, and at the end of `/10x-frame` and `/10x-new`, when the next steps are listed.
- **Problem**: `/10x-research` was shown only as an optional extra or left out, so the user has to ask for it separately and may skip a research step that the plan depends on (for example the recurrence model of S-02, which drives the streak logic of S-04).
- **Rule**: Always list `/10x-research <change-id>` as a regular, numbered step in the copy-pasteable command list for a new slice, right after `/10x-new` and before `/10x-plan`, in the order `/10x-new`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, git commit, push and PR of the artifacts from the planning branch (merged, then `master` pulled), then the `/10x-implement` phases. Do not label it optional; the user decides whether to run it.
- **Applies to**: frame, research, plan, plan-review

## Archive through a PR while master requires status checks

- **Context**: `/10x-archive` and the cleanup after it, in a repo whose `master` ruleset requires a status check (here `integration`, ruleset "master protection" on `mariuszzlotucha/streak-board`).
- **Problem**: The archive commit was made on local `master` and `git push origin master` was rejected (`GH013: Required status check "integration" is expected`), leaving `master` ahead of the remote, and the `&&` cleanup chain stopped before deleting the phase branches.
- **Rule**: Make the archive commit, then move it off `master`: create `<change-id>/archive` from it, reset local `master` to `origin/master` (`git branch -f master origin/master`), push the branch and open a PR with `gh pr create`, showing the PR URL. Only after that PR is merged, pull `master` and delete the phase, `review-fix` and `archive` branches locally (`git branch -d`) and on GitHub (`git push origin --delete`). Never bypass the ruleset. If the repo has no required checks on `master`, the archive commit may still be pushed directly.
- **Applies to**: archive, impl-review

## Close every slice by merging to master, approving the production release and checking the production URL

- **Context**: Finishing any roadmap slice (`S-NN`) that reaches production: the last phase of `/10x-plan`, the end of `/10x-implement`, and `/10x-archive`. Since `release-automation-and-auth-hardening`, the `release` job in `.github/workflows/ci.yml` applies migrations (`supabase db push`) and then deploys the Worker; it waits for approval in the GitHub `production` environment.
- **Problem**: The old manual release rules told the agent to hand the user `db push` and `wrangler deploy` commands. Following them now would bypass the gated workflow, race it, or deploy code without the approval gate, and a slice can still be archived as `done` without anyone having looked at production.
- **Rule**: A slice is closed by (1) merging its PR to `master`, (2) approving the `release` run in the `production` environment on GitHub after checking `supabase/migrations/` in the merge commit for new migrations (a failed release is fixed by re-running the failed jobs), and (3) a manual check of the slice's main flow on the production URL. Note the date, the applied migrations and the result in `context/changes/deployment/deployment-plan.md`. Do not propose manual `db push` or `wrangler deploy` chains as the normal path. Migrations must stay backward compatible with the currently deployed code; code rolls back with `npx wrangler rollback`, schema does not.
- **Applies to**: plan, implement, impl-review, archive

## Skills run the git and gh commands themselves

- **Context**: Every 10x skill that produces or changes files or commits for a change: `/10x-new`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, `/10x-tdd`, `/10x-impl-review` and `/10x-archive`, and every message that lists the commands for a slice.
- **Problem**: The branch, commit, push and `gh pr create` steps are left to the user, or shown as separate `git ...` lines between the slash commands, so the command plan is long and the user has to run (or forget) git steps that the skill can do itself.
- **Rule**: The skill fires the git and `gh` commands itself as part of its own run: checkout and pull `master`, create the branch named by the branch rules, stage by explicit path, commit in English, push, open the PR with `gh pr create` and show its full URL, and, after the user has merged, pull `master` and delete the merged branches. The skill asks the user only to merge the PR and to approve the `production` release. A command plan for a slice lists the slash commands and the user's own actions (merge, approve, production check) only; it does not list `git` or `gh` lines as steps the user runs.
- **Applies to**: new, research, plan, plan-review, implement, tdd, impl-review, archive

## Review skill commands are mandatory, not optional

- **Context**: Any command plan, workflow or next-steps list for a slice or change, and the end of `/10x-plan` and `/10x-implement`: the steps `/10x-plan-review` (after `/10x-plan`) and `/10x-impl-review` (after the last phase).
- **Problem**: `/10x-plan-review` was labelled "optional" in command plans and could be skipped, so a plan went to implementation unreviewed and the user had to ask for it again.
- **Rule**: Always list `/10x-plan-review <change-id>` and `/10x-impl-review <change-id>` as regular numbered steps, never as optional, and do not mark either with "(optional)" or offer to skip it. A change is not ready for `/10x-implement` or `/10x-tdd` until its plan review has run, and not ready for `/10x-archive` until the full-plan impl review has run. `/10x-archive` warns when `reviews/plan-review.md` or `reviews/impl-review.md` is missing.
- **Applies to**: frame, new, research, plan, plan-review, implement, tdd, impl-review, archive

## Run /10x-impl-review after every phase and ship it in the phase PR

- **Context**: The end of every implementation phase (`/10x-implement`, `/10x-tdd`), after the green gates and manual confirmation and before the phase PR is merged; covers the phase-scoped review report `context/changes/<change-id>/reviews/impl-review-phase-N.md` and the fixes from its triage.
- **Problem**: The review ran only once, after the last phase, so findings in early phases surfaced late, after their PRs were merged and released, and the report and its fixes ended up outside the phase that caused them (or were skipped).
- **Rule**: After every phase, run `/10x-impl-review <change-id> phase N` on the phase branch before merging; treat it as a mandatory step of the phase, not an optional one. Triage its findings, commit the review report, the fixes and the `change.md` status change on the same phase branch, and push them to the open phase PR so the PR shows the review result. Merge only after the review is triaged. The full-plan `/10x-impl-review <change-id>` after the last phase stays mandatory as well (see "Review skill commands are mandatory, not optional").
- **Applies to**: implement, tdd, impl-review

## Push the phase branch and open its PR only after the phase impl review is triaged

- **Context**: The end of every implementation phase (`/10x-implement`, `/10x-tdd`): the order of phase commit, `/10x-impl-review <change-id> phase N`, `git push` and `gh pr create`. Refines "Run /10x-impl-review after every phase and ship it in the phase PR", which had the PR opened first and the review pushed to it afterwards.
- **Problem**: Pushing the branch and opening the PR before the review means the PR first shows unreviewed code, CI runs on it, and the review report and fixes arrive as extra commits on an already-published branch.
- **Rule**: After the phase commit and SHA write-back, keep the branch local. Run `/10x-impl-review <change-id> phase N`, triage its findings, and commit the review report, the fixes and the `change.md` status change on the same branch. Only then `git push` the branch and open the PR with `gh pr create`, so its first version already contains the reviewed phase. Never push the branch or open the PR before the review is triaged.
- **Applies to**: implement, tdd, impl-review
