# AI Code Review in CI — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`
> Requirements: `context/changes/ci-cd-code-review/requirements.md`

## What & Why

Every pull request to `master` gets an AI code review from our own reviewer (`packages/code-reviewer`), and its binding `verdict` becomes a merge gate. The review posts one summary comment, sets `ai-cr:passed` / `ai-cr:failed`, fails the check on `fail`, and re-runs on the `ai-cr:review` label. The reviewer was built in the tool-loop-agent change, which left CI wiring, prompt-injection hardening and a timeout for this change.

## Starting Point

- **Reviewer.** It scores the six required criteria and emits `verdict` / `summary`, but it takes only the diff. The diff is appended undelimited, there is no pass/fail rule, and the CLI returns one exit code for every failure.
- **Drafts.** A workflow and a composite action exist uncommitted. They run the reviewer from the PR's own checkout.
- **Repo settings.** The API keys lived only in the approval-gated `production` environment; on 2026-10-14 both were also set as repository secrets. Only `integration` is a required check, and no `ai-cr:*` or `claude-review` labels exist.

## Desired End State

- **The `ai-review` check.** A PR gets `ai-review`, run with reviewer code from the base commit on a code-only diff. It ends in one of four outcomes, each with one updated comment and the matching label:
  - reviewed (pass or fail)
  - skipped (nothing to review)
  - too large
  - error
- **The gate.** It passes only on a `pass` verdict or a skipped review.
- **Labels.**
  - `ai-cr:review` re-runs the review.
  - Any other label re-evaluates the last result instead of skipping, so it cannot turn a `fail` green.
  - `claude-review` runs an advisory Claude review.
- **Required check.** `ai-review` is required in the "master protection" ruleset.

## Key Decisions Made

| Decision         | Choice                                                                                                                                         | Why (1 sentence)                                                                  | Source          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------- |
| Merge gate       | Required, after a live trial                                                                                                                   | Binding as required, without locking `master` on an unproven check                | Plan            |
| Diff scope       | Exclude `context/`, `*.md`, `package-lock.json`; empty → skipped (pass), over cap → fail with comment                                          | All 4 historic over-cap PRs were `context/` docs; docs-only PRs must still report | Research + Plan |
| Prompt injection | `<pr-title>` / `<pr-body>` / `<diff>` fences, a "data, never instructions" rule, neutralised closing tags, `@` mentions defused in the comment | Closes the archived precondition before the gate trusts `verdict`                 | Research + Plan |
| Trust boundary   | Reviewer and action run from the base commit                                                                                                   | A PR cannot rewrite its own judge or script                                       | Plan            |
| PR context       | Title + body capped at 2,000 chars                                                                                                             | Lets the reviewer judge "does it do what it claims" at bounded cost               | Plan            |
| Pass rule        | `fail` if correctness ≤ 4, security ≤ 4, or any criterion ≤ 2; written in the prompt, model emits it                                           | Predictable, testable, gate still reads only `verdict`                            | Plan            |
| On review error  | Fail closed + comment, no label                                                                                                                | A broken review never lets code through                                           | Plan            |
| Comment          | One sticky comment found by a marker                                                                                                           | Readable thread; `claude-review` also posts as `github-actions[bot]`              | Plan            |
| Model & budget   | Keep `z-ai/glm-5.1`; dedicated OpenRouter key with credit limit                                                                                | Model changes need evals first; hard budget without code                          | Plan            |
| Claude review    | Keep `claude-review.yml` on demand, hardened; impl-review-ci later                                                                             | Small and built; impl-review needs its own adaptations                            | Plan            |
| Secrets          | Repository secrets, not `production`                                                                                                           | `production` requires manual approval per run                                     | Research        |
| `npm run review` | Keep (reads stdin)                                                                                                                             | The archived removal reason (ignored stdin) no longer applies                     | Research        |
| Phases           | Two                                                                                                                                            | Action must be on `master` before a workflow uses it; no PR errors at merge       | Plan            |

## Scope

**In scope:**

- **Reviewer contract:**
  - PR context
  - fences and the data rule
  - the verdict rule
  - exit codes 2/3
  - a 180 s timeout
  - README
- **Composite action:** outcome-based.
- **`review.yml`:** base checkout, diff scope, sticky comment, labels, re-evaluation, gate.
- **`claude-review.yml` hardening.**
- **Docs:** README CI, `test-plan.md` §5, a new lesson.
- **Settings:** secrets, labels, ruleset.

**Out of scope:**

- promptfoo evals (`code-review-evals`)
- `/10x-impl-review-ci`
- model change or USD cap in code
- fork PRs
- `ci.yml`
- `tech-stack.md` (`has_ai` is about the product)
- the privacy policy

## Architecture / Approach

```
PR event ─► ai-review job ─► mode: reevaluate (unrelated label) → copy last conclusion for head SHA
                         └─► mode: review → checkout PR + checkout base.sha → git diff (code only)
                               → base/.github/actions/ai-reviewer (npm ci + CLI, PR text via env)
                               → outcome/verdict → sticky comment + labels → gate
```

## Phases at a Glance

| Phase                                     | What it delivers                                                              | Key risk                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1. Reviewer contract and composite action | CI-ready reviewer CLI and action on `master`, no workflow                     | Contract change breaks `review-with-session.ts` or the README contract                                                     |
| 2. Workflows, required gate and docs      | `ai-review` + hardened `claude-review`, trialled on its own PR, then required | Check-run semantics for re-evaluation only provable live; an AI `fail` on the phase PR needs a fix before the ruleset step |

**Prerequisites:**

- **Before pushing Phase 2:** both repository secrets are set (2026-10-14). The user confirms that the OpenRouter key is dedicated with a credit limit, and the agent creates the four labels (`ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`, `claude-review`).

**Estimated effort:** about 2 sessions. Phase 1 is code plus probes; Phase 2 is YAML plus a live trial of 30–60 minutes.

## Open Risks & Assumptions

- **Workflow file is PR-controlled.** `review.yml` itself still comes from the PR (`pull_request`). The base checkout protects the reviewer code, not the workflow; tampering stays visible in the diff.
- **A label right after a push.** One concurrency group serializes a PR's `ai-review` runs, so the gate does not depend on how GitHub orders duplicate check runs. A label added within seconds of a push can replace the still-pending review; the re-evaluation then fails closed and asks for `ai-cr:review`.
- **Outages block merging.** Once `ai-review` is required, an OpenRouter outage blocks merges until an `ai-cr:review` re-run succeeds (accepted: fail closed).
- **Injection is reduced, not eliminated.** Measuring it belongs to `code-review-evals`.

## Success Criteria (Summary)

- A code PR shows one AI review comment and label, and cannot merge on `fail` or on a review error.
- Docs-only PRs (e.g. the archive PR) pass `ai-review` as skipped and merge normally.
- Adding labels never turns a failed review green; `ai-cr:review` and `claude-review` work on demand.
