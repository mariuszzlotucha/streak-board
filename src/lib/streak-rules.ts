// Pure period and streak rules shared by the server and the React islands. Keep this file free of server-only imports
// and of `Date.now()`: every function receives the instant, so the rule is testable with fixed dates and the
// optimistic island previews a tick with exactly the code the server runs.
import type { TaskRecurrence } from "@/lib/task-rules";

/** The one zone of the app (the S-02 and S-04 plans exclude a per-group or per-user timezone). */
export const APP_TIME_ZONE = "Europe/Warsaw";

/** A calendar date as `YYYY-MM-DD`: the Warsaw day, or for weekly tasks the date of the Monday that starts the week. */
export type PeriodKey = string;

const MS_PER_DAY = 86_400_000;

// The key is assembled from `formatToParts`, not from a locale-shaped string, so it does not depend on locale data.
// `@__PURE__` lets a bundler drop the formatter from browser chunks that never call `periodKeyFor` (the island only
// previews values).
const warsawDate = /* @__PURE__ */ new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Days since 1970-01-01 of a `YYYY-MM-DD` key. UTC arithmetic, so a 23-hour or 25-hour DST day is just a day. */
function dayNumberOf(key: PeriodKey): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / MS_PER_DAY;
}

function keyOfDayNumber(day: number): PeriodKey {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The Monday of the week that contains the day (1970-01-01 was a Thursday). */
function mondayOf(day: number): number {
  return day - ((((day + 3) % 7) + 7) % 7);
}

/**
 * The period an instant falls in: the Warsaw calendar date for `daily` (and `once`, informationally), the date of the
 * Monday that starts the Warsaw calendar week for `weekly`.
 */
export function periodKeyFor(recurrence: TaskRecurrence, at: Date): PeriodKey {
  let year = "";
  let month = "";
  let day = "";
  for (const part of warsawDate.formatToParts(at)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  const key = `${year}-${month}-${day}`;
  return recurrence === "weekly" ? keyOfDayNumber(mondayOf(dayNumberOf(key))) : key;
}

/**
 * Whole periods from `from` to `to` (`to >= from`), both period keys of the same recurrence: calendar days for `daily`
 * (and `once`), weeks for `weekly`.
 */
export function periodsBetween(recurrence: TaskRecurrence, from: PeriodKey, to: PeriodKey): number {
  const days = dayNumberOf(to) - dayNumberOf(from);
  return recurrence === "weekly" ? Math.floor(days / 7) : days;
}

/**
 * The streak left after missing `missedPeriods` closed periods: `floor(value / 2^missedPeriods)`, so every miss halves
 * it, rounded down (6 -> 3 -> 1 -> 0). The only place that holds the decay value; the PRD only says a miss costs less
 * than the full state.
 */
export function decayStreak(value: number, missedPeriods: number): number {
  if (value <= 0) return 0;
  if (missedPeriods <= 0) return value;
  // A streak is a safe integer (below 2^53), so 53 misses leave nothing: return early instead of computing 2 ** huge.
  if (missedPeriods >= 53) return 0;
  return Math.floor(value / 2 ** missedPeriods);
}

/** Everything the rule needs from a task's history, small enough to hand to the browser. */
export interface StreakSnapshot {
  /** The streak right after the last checked period before the current one, or null when there is none. */
  base: { value: number; period: PeriodKey } | null;
  /** Whether the current period itself is checked. */
  checked: boolean;
}

/**
 * Folds the stored check-off keys of one enrolment into a snapshot for `currentPeriod`. Weekly keys snap to their
 * Monday, repeats collapse and keys after the current period wait for their period. `once`: no base, checked when any
 * key exists. Keys are valid `YYYY-MM-DD` dates, as PostgREST emits a Postgres `date`; a malformed key throws or
 * yields NaN.
 *
 * It runs for every enrolment on every dashboard load, so it is linear over integer day numbers: each key is parsed
 * once into an array of days (the same loop notes whether the input is ascending), that array is sorted only when it
 * is not (the database view returns it ascending) and the fold needs no per-key `Date`, no `Set` and no copy of the
 * string array. Keeping the array lets the fold stop at the first future key even when the input was unsorted.
 */
export function snapshotOf(
  recurrence: TaskRecurrence,
  periods: readonly PeriodKey[],
  currentPeriod: PeriodKey,
): StreakSnapshot {
  if (recurrence === "once") return { base: null, checked: periods.length > 0 };

  const weekly = recurrence === "weekly";
  const days: number[] = [];
  let previous = -Infinity;
  let ascending = true;
  for (const key of periods) {
    const parsed = dayNumberOf(key);
    const day = weekly ? mondayOf(parsed) : parsed;
    if (day < previous) ascending = false;
    previous = day;
    days.push(day);
  }
  if (!ascending) days.sort((a, b) => a - b);

  const current = dayNumberOf(currentPeriod);
  const step = weekly ? 7 : 1;
  let value = 0;
  let baseDay: number | null = null;
  let checked = false;
  for (const day of days) {
    if (day > current) break;
    if (day === current) {
      checked = true;
      break;
    }
    if (day === baseDay) continue;
    value = baseDay === null ? 1 : decayStreak(value, (day - baseDay) / step - 1) + 1;
    baseDay = day;
  }
  return { base: baseDay === null ? null : { value, period: keyOfDayNumber(baseDay) }, checked };
}

/**
 * The streak a task shows for `currentPeriod`: the base decayed for the closed periods missed since, plus one when the
 * current period is checked. Passing `checked` is how the island previews a tick or an undo with the same code.
 */
export function streakValue(
  recurrence: TaskRecurrence,
  snapshot: StreakSnapshot,
  currentPeriod: PeriodKey,
  checked = snapshot.checked,
): number {
  if (recurrence === "once") return checked ? 1 : 0;
  const decayed =
    snapshot.base === null
      ? 0
      : decayStreak(snapshot.base.value, periodsBetween(recurrence, snapshot.base.period, currentPeriod) - 1);
  return checked ? decayed + 1 : decayed;
}
