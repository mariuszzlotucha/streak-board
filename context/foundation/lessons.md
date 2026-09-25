# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Write commit messages in English only

- **Context**: Any commit created during implementation, including per-phase commits and the epilogue commit, and any commit message proposed to the user.
- **Problem**: Commit subjects derived from Polish plan or phase titles end up in Polish or mixed-language, so the git history is inconsistent.
- **Rule**: Always write commit messages (subject and body) entirely in English; translate phase titles from the plan instead of copying them, and never mix languages within a message.
- **Applies to**: implement, impl-review
