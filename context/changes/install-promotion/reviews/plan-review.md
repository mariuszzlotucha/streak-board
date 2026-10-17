<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Install Promotion (S-19)

- **Plan**: `context/changes/install-promotion/plan.md`
- **Mode**: Deep (codebase checks done locally, no sub-agent)
- **Date**: 2026-10-18
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

- Paths: 9/9 ✓.
- Symbols: 3/3 ✓ (`startServiceWorker`, `fixedState`, `remindersState`).
- brief↔plan ✓.
- Progress↔Phases ✓ (16 rows).
- Smoke binds no reminders or install text (grep of `scripts/smoke.mjs`).
- `scripts/ui-screenshots.mjs:387` collects kitchen-sink states from the page's `?state=` links, so new states are picked up.

## Findings

### F1 — Settings kitchen-sink states need a SettingsView pass-through

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — §3 Settings placement, §4 Kitchen sink
- **Detail**: `RemindersCard` is rendered only from `SettingsView.astro:85-88`, which passes `remindersState` → `fixedState`. Without a new `SettingsView` prop the `settings-install-*` states cannot pin the offer, and `SettingsView.astro` was not among the changed files.
- **Fix**: Add `SettingsView.astro` to §3 with an optional `installOffer` prop passed through `RemindersCard` to `InstallPrompt`.
- **Decision**: FIXED (Fix in plan)

### F2 — The reason and the "See how below" pointer are not true everywhere

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — §1 Island copy, §3 RemindersToggle text
- **Detail**: "Reminders need the installed app" holds only on iOS; Android and desktop Chromium push without installing. The `unsupported` text "See how below" would point at nothing when the inline block renders nothing (installed app with no VAPID key, `usePushReminders.ts:27`).
- **Fix**: Make the reason per offer, and keep the `unsupported` text free of a pointer.
- **Decision**: FIXED (Fix in plan)
