# Install Promotion (S-19) — Plan Brief

> Full plan: `context/changes/install-promotion/plan.md`
> Frame brief: `context/changes/install-promotion/frame.md`
> Research: `context/changes/install-promotion/research.md`

## What & Why

> **The real problem**: on no device does anything tell the user that StreakBoard can be installed, how, and what it gives them, because the S-17 assumption that the browser would suggest it by itself did not hold even on Android.

On iPhone it matters most: reminders work only from the installed app. A friend's first try showed that nobody finds the hint hidden in Settings.

## Starting Point

- The only install wording is the reminders switch's `unsupported` sentence in Settings.
- Nothing detects installed mode.
- Chrome's automatic prompt needs a service-worker `fetch` handler, which the app deliberately does not have; menu install works.
- iOS has no install API at all.

## Desired End State

- In a browser, the dashboard shows an "Install StreakBoard" card with the steps for that platform and the reason (reminders); "Not now" hides it for good on that device.
- Settings' Reminders card always shows the same steps.
- Chrome and Edge get an "Install app" button when the browser allows it, otherwise "menu ⋮ → Install app".
- A messenger's built-in browser gets "open in Safari or Chrome".
- The installed app shows nothing.

## Key Decisions Made

| Decision                 | Choice                                                                               | Why (1 sentence)                                                         | Source      |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------- |
| Scope                    | All platforms, all users                                                             | Android Chrome also showed no prompt; owner: "all devices"               | Frame       |
| Placement                | Dashboard card + Settings Reminders card                                             | Reaches daily users; Settings stays the permanent place with the reason  | Plan        |
| Dismissal                | "Not now" for good on the device (localStorage)                                      | Not pushy; still findable in Settings; needs one privacy-policy sentence | Plan        |
| Chromium                 | Button if `beforeinstallprompt` fires, else menu instruction                         | Works either way without the fetch handler S-17 refused                  | Plan        |
| In-app browsers          | Detect known ones, say "open in Safari/Chrome"                                       | The friend's case; iOS steps would not work there                        | Plan        |
| Service worker           | Unchanged, no `fetch` handler                                                        | Keeps the S-17 and PRD Non-Goals decision                                | Research    |
| Reason copy              | Per offer: iOS "reminders only from the installed app", others "open it like an app" | Push works without installing on Android and desktop Chromium            | Plan review |
| iOS third-party browsers | Steps plus "for reminders, add it from Safari"                                       | Push from their Home Screen icons is not established                     | Research    |

## Scope

**In scope:**

- detection module and unit tests;
- `InstallPrompt` island on the dashboard and in Settings;
- kitchen-sink states and screenshots;
- privacy-policy sentence, README and CLAUDE.md;
- e2e spec with an iPhone user agent;
- release and device checks.

**Out of scope:**

- landing-page promotion;
- re-showing after "Not now";
- a `fetch` handler or caching;
- Firefox desktop install;
- the iOS status-bar overlap;
- server or database changes.

## Architecture / Approach

`src/lib/pwa/install.ts` classifies the browser. The order is installed → in-app → iOS → captured prompt → Chromium menu → macOS Safari → none, using an injectable environment like `push.ts`. It also owns the captured `beforeinstallprompt`, which the layout script listens for on every page, and the dismissal flag.

One React island, `InstallPrompt` (`card` | `inline`), renders the offer after hydration and nothing on the server. That keeps the smoke-bound HTML stable; the kitchen sink pins offers through `fixedOffer`.

## Phases at a Glance

| Phase                        | What it delivers                                                   | Key risk                                                                                               |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1. Install detection         | Classifier, prompt capture, dismissal flag, unit tests             | User-agent tokens for in-app browsers are incomplete                                                   |
| 2. Promotion in the app      | Island on dashboard and Settings, kitchen sink, privacy, docs, e2e | Copy and layout at phone width; collision with the toast or the update notice                          |
| 3. Release and device checks | Production release; Android, desktop and iPhone results recorded   | `beforeinstallprompt` may not fire without a fetch handler; the iPhone check depends on a group member |

**Prerequisites:** S-16 and S-17 released (done); this planning branch merged; the #189 release approved, so production is current.
**Estimated effort:** ~1–2 sessions for Phases 1–2 (one goal run); Phase 3 waits for devices.

## Open Risks & Assumptions

- If Chromium never fires `beforeinstallprompt` here, Chrome and Edge users get only the menu instruction. That is accepted by the owner, and Phase 3 records which case holds.
- The iPhone path (install → sign in again → reminders) is still unverified on a real device; S-17's iOS check is open.
- iPadOS detection relies on Macintosh plus touch points; a wrong guess shows the macOS or iOS steps on the other.

## Success Criteria (Summary)

- A new member on any phone or computer sees how to install StreakBoard and why, without opening Settings.
- After "Not now" the dashboard stays clean on that device, while Settings still explains it.
- Nobody sees the promotion inside the installed app.
