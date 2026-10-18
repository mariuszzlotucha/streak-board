# StreakBoard on iPhone: installing from the dashboard card and getting a reminder

> For a group member with an iPhone. It takes about 10 minutes, plus waiting for 20:00. The owner has no iPhone, so this is the only way to learn whether the install card works on iOS. For each step, write "works" or a short note on what you saw (a screenshot helps too) and send the results to the owner.

You need: an iPhone with Safari and iOS 16.4 or later, and a StreakBoard account (e-mail and password, or Google) that is in the group and takes part in at least one daily task. For the optional step 7, ask the owner for an invite link in a messenger.

## Steps

1. **Sign in in Safari.** Open `https://streakboard.app` in Safari and sign in.
   - Expected: you land on the dashboard.
   - Result:
2. **The card.** Look under the page heading.
   - Expected: a card "Install StreakBoard" with the line "Reminders on iPhone and iPad work only from the installed app.", the steps "Tap Share, then Add to Home Screen. Open StreakBoard from the icon, sign in again, and turn on reminders in Settings." and a "Not now" button. Do not tap "Not now": it hides the card on this iPhone for good.
   - Result:
3. **Follow the card.** Tap Share (the square with an arrow), then "Add to Home Screen" and "Add".
   - Expected: a green icon with a white flame, named "StreakBoard", appears on the Home Screen.
   - Result:
4. **Open from the icon and sign in again.** Tap the icon. The app has its own sign-in, separate from Safari, so sign in once more.
   - Expected: the app opens full screen, without the Safari address bar, and after sign-in shows the dashboard with no "Install StreakBoard" card.
   - Result:
5. **Turn on reminders.** In the app, tap "Settings". In the "Reminders" card, tap "Turn on" and allow notifications when the iPhone asks.
   - Expected: the card says "Reminders are on for this device." and the Reminders card shows no "Install StreakBoard" block.
   - Result:
6. **The 20:00 reminder.** On a day when you have not yet checked off your daily task, leave it unchecked until after 20:00 (Warsaw time).
   - Expected: shortly after 20:00 a notification "StreakBoard" arrives with "Still to do today:" and the task's name. Tapping it opens StreakBoard. Write the time it arrived.
   - Result:
7. **Optional: a link from a messenger.** In Messenger, Instagram or WhatsApp, tap the invite link from the owner so it opens inside the messenger (not in Safari). If you get to the dashboard there, look at the card.
   - Expected: the card says "Open this page in Safari to install StreakBoard." Write which messenger you used and what the card said (or that you could not get to the dashboard there).
   - Result:

## What to report back

- The result of each step, with screenshots of the card in Safari (step 2) and of the notification (step 6).
- Your iPhone model and iOS version (Settings → General → About).
- Anything that looked wrong or confusing, in your own words.

## For the owner

Copy the results into `context/changes/deployment/deployment-plan.md` (Phase 24) and tick plan rows 3.4 (steps 1-5, and step 6 for the reminder) and 3.5 (step 7, iPhone side) in `context/changes/install-promotion/plan.md`. This check does not repeat the S-17 iPhone check (`context/archive/2026-10-17-installable-pwa/ios-check.md`: Google sign-in, an invite pasted into "Join with code" and a check-off in the installed app); if the member has not done it yet, both fit in one sitting.
