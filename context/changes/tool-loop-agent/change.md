---
change_id: tool-loop-agent
title: Modular ToolLoopAgent code reviewer with a reusable exported API
status: impl_reviewed
created: 2026-10-13
updated: 2026-10-14
archived_at: null
---

## Notes

I want to convert '/packages/code-reviewer' into well-organized, modular code review agent based on ai-sdk ToolLoopAgent. Use @claude/skills/ai-sdk/SKILL.md to understand its API. Extract structured output schemas into separate modules, as well as prompts. Make sure agent module is reusable and exports our reviewer so that we can run promptfoo evals on it in the future. Do not configure eval environment in this change.
