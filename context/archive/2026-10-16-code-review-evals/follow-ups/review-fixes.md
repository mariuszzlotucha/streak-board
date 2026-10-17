# Review follow-ups: code-review-evals

## From the full-plan impl review (`reviews/impl-review.md`)

### For the PR description (F10 and the review fixes)

- **Row 2.4 adaptation (F10).** The plan's command `npx prettier --check packages/code-reviewer README.md context/foundation context/changes/code-review-evals` exits 1 only on `context/foundation/infrastructure.md` and `shape-notes.md`, which have been unformatted since 2026-09-16/18 and are untouched by this change. Every changed file passes, and that is what row 2.4 names. The two files are left to a separate docs change.
- **Review fixes:**
  - F1: the eval provider refuses case paths inside `.git`, and `base`/`head` values that are not full SHAs.
  - F2: the binary check tries every split at " and ", without a regular expression.
  - F3 and F7: the evals README follows the capped procedure, with the measured costs and the npm advisories.
  - F4 and F5: tests for `report.ts` and for where the lockfiles' packages come from.
  - F6: the workflow-step harness refuses `git`, `npx` and `curl` and uses a temporary `HOME`.
  - F8 and F9: wording.
- **Deliberate attack data.** The plan's Critical Implementation Details require this note: `packages/code-reviewer/evals/cases/` holds deliberate test data with planted attacks, which the gate's diff leaves out. A `fail` on this PR is settled by the process in README `## CI`.

## From the ai-review of PR #159 (run 38982178978, three `minor` findings)

Fixed on `code-review-evals/review-fix`, the first code PR after the merge (plan row 2.7):

- `review-with-session.ts` lacked the CLI's binary check. It now rejects a diff that shows a source file as binary before any call, with exit 4, through `hiddenBinaryPaths`, which `agent.ts` now exports (re-exported by `index.ts`) for callers of `createReviewer`.
- `buildCaseInput` silently preferred `vars.files` when `base` or `head` came with it. It now refuses such a case.
- `hasBinaryExtension` drops only the closing quote of a quoted path. A comment now says why the opening one never reaches the extension.

The prompt, the model, the tools and the verdict binding are unchanged, so no eval session is due (lesson "Run the eval suite, old against new, before shipping a reviewer change").
