// Pure rule for the evening reminder run (S-16). Like `streak-rules.ts` it takes the instant as an argument, so the
// rule is testable with fixed dates; the Warsaw calendar comes from `periodKeyFor`, so the two cannot drift.
import { APP_TIME_ZONE, periodKeyFor, type PeriodKey } from "@/lib/streak-rules";

/** The Warsaw hour at which reminders go out; the two UTC crons (18:00 and 19:00) cover CEST and CET. */
export const REMINDER_HOUR = 20;

export type ReminderRun = { due: false } | { due: true; today: PeriodKey; week: PeriodKey | null };

const warsawHourAndWeekday = /* @__PURE__ */ new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

/**
 * Whether a run at this instant should act, and the periods it covers: the Warsaw day for daily tasks, and on Sunday
 * also the Warsaw week (its Monday) for weekly tasks. `once` tasks are never covered.
 */
export function reminderRun(now: Date): ReminderRun {
  let hour = -1;
  let weekday = "";
  for (const part of warsawHourAndWeekday.formatToParts(now)) {
    if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "weekday") weekday = part.value;
  }
  if (hour !== REMINDER_HOUR) return { due: false };
  return {
    due: true,
    today: periodKeyFor("daily", now),
    week: weekday === "Sun" ? periodKeyFor("weekly", now) : null,
  };
}
