# Frame Brief: Task reminders (S-16, MS-02)

> The framing step before /10x-plan. It records what the problem *actually* is,
> kept separate from what was assumed at the start.

## Reported observation

Active daily users forget to check off a task they joined. They notice the next day,
when it is too late, and by then they had usually also forgotten the habit itself,
not just the tick.

## Initial framing (preserved)

- **Assumed cause / approach (roadmap S-16):** a missing reminder; people would come back to check off if the app prompted them about an unticked task in the current period.
- **Proposed direction:** a scheduled reminder about a joined task that is unticked in the current period. Channel, timing, consent and Worker scheduling were left open.
- **Pre-dispatch narrowing (owner, 2026-10-17):** the observation is "people forget to check off"; the group affected is active daily users; they use the app as an **installed PWA on the phone**.

## Dimension map

1. **Timing of the prompt**: nothing reaches the user before the period closes (the Warsaw day, or the Warsaw week) ← initial framing
2. **Deadline rigidity**: the habit was done, but a forgotten tick cannot be added later, so the loss comes from having no slack
3. **Channel reach**: a prompt that exists only inside the app never reaches someone who doesn't open it
4. **Habit vs. tick**: a reminder prompts *doing the habit*, not just recording it

## Hypothesis testing

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. No prompt before the period closes | Nothing sends anything today (roadmap Baseline: no `scheduled` handler, no push); owner: users realise "next day, too late" | STRONG |
| 2. Deadline rigidity (backfill would fix it) | `src/lib/checkoffs.ts:63` ticks only the period `now` falls in; RLS already allows period ≥ UTC today − 7 (`20261002090000_create_task_checkoffs.sql:63`). Owner: users "forgot the habit too", so a backfill would only record habits that never happened (PRD Non-Goals: trust-based) | NONE |
| 3. Channel: in-app vs. outside the app | Owner: active users, installed PWA. In-app alone fails the "never opened it that evening" case. `public/sw.js:2` already reserves `push` for S-16; S-17 is done, so iOS home-screen push is possible | STRONG (push fits) |
| 4. Habit vs. tick | Owner: "forgot the habit too", so the reminder is a habit nudge sent while there is still time to do it | STRONG |

## Narrowing signals

- "Next day, too late": the prompt must land **inside** the current period, early enough to act on.
- "Forgot the habit too": this rules out late check-off or a grace window as the fix; the reminder has to come *before* the deadline.
- "Installed PWA on the phone": the channel that reaches these users is the one on their phone outside the app; e-mail is a secondary candidate, in-app only is not enough.

## Cross-system convention

Habit trackers usually send one same-day push in the evening, only for unfinished habits, with
an opt-in and a settings toggle. The leading hypothesis matches this. The repo has already prepared for it
(`sw.js` comment, S-17 done before S-16, as the roadmap's push dependency requires).

## Reframed (or confirmed) problem statement

> **The actual problem to plan around is:** an active member gets no prompt
> **before the current Warsaw period closes** while their joined task is still unticked, so a forgotten habit turns
> into a missed period before they can act.

The initial framing holds. Narrowing sharpens it: the reminder is time-critical within the period
(not a digest, not a backfill), aimed at phones running the installed PWA, and only for tasks still
unticked at sending time. It does not target lapsed members (they were not the observation).

## Confidence

**MEDIUM.** The direction is clear and matches the code and the owner's answers, but the observation
comes from the owner's account of a small group, not from data. Still open for /10x-plan (owner decisions, not framing):
the exact send time (and the weekly-task rule, e.g. the last day of the week), opt-in vs. default on, and
an e-mail fallback for browsers without push.

## What changes for /10x-plan

Plan one same-period reminder for unticked joined tasks, delivered to the installed PWA (web push via
`public/sw.js`), with consent and a per-user toggle, and with account deletion and the privacy policy
updated in the same change. Out of scope: late check-off / grace windows and re-engaging lapsed users.

## References

- `public/sw.js:2`: push slot reserved for S-16
- `src/lib/checkoffs.ts:54-66`: check-off is limited to the current period
- `supabase/migrations/20261002090000_create_task_checkoffs.sql:8,63`: Warsaw periods; RLS window
- `context/foundation/roadmap.md`: S-16 Unknowns and Risk (Worker CPU limit, S-08 error contract, S-15 deletion)
- Research tasks: none (evidence read directly; two narrowing rounds with the owner)
