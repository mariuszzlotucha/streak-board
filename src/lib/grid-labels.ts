// Text of the check-off grid: column headers, the period in a cell's screen-reader label, and the state words. Pure and
// free of server-only imports (the viewer's live cell renders it in the browser too). Period keys are Warsaw calendar
// dates ("2026-10-13"), so they are formatted as UTC dates: no time zone can shift the day.
import type { CellState } from "@/lib/grid-rules";
import type { PeriodKey } from "@/lib/streak-rules";
import type { TaskRecurrence } from "@/lib/task-rules";

const WEEKDAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function partsOf(key: PeriodKey) {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { day, month: MONTHS[month - 1], weekday };
}

/**
 * The column header as lines: ["Mo", "13"] (daily), ["13 Oct"] (weekly), ["Done"] (once). The lines are short enough for
 * a 28 px (daily) or 48 px (weekly, once) column at `text-xs`; the screen-reader label of a cell is `periodName`.
 */
export function periodHeader(recurrence: TaskRecurrence, key: PeriodKey): readonly string[] {
  if (recurrence === "once") return ["Done"];
  const { day, month, weekday } = partsOf(key);
  return recurrence === "daily" ? [WEEKDAYS_SHORT[weekday], String(day)] : [`${day} ${month}`];
}

/** The period as a cell label names it: "Mon 13 Oct" (daily), "week from 13 Oct" (weekly), null (once). */
export function periodName(recurrence: TaskRecurrence, key: PeriodKey): string | null {
  if (recurrence === "once") return null;
  const { day, month, weekday } = partsOf(key);
  return recurrence === "daily" ? `${WEEKDAYS[weekday]} ${day} ${month}` : `week from ${day} ${month}`;
}

export const CELL_STATE_LABELS: Record<CellState, string> = {
  done: "done",
  missed: "missed",
  open: "open",
  notJoined: "not joined",
};

/** The part of a cell label before the state: "Kasia, Mon 13 Oct" (or "Kasia" for a `once` task). */
export function cellLabelPrefix(name: string, recurrence: TaskRecurrence, key: PeriodKey): string {
  const period = periodName(recurrence, key);
  return period === null ? name : `${name}, ${period}`;
}

/** The full screen-reader label of a cell: "Kasia, Mon 13 Oct: done". */
export function cellLabel(prefix: string, state: CellState): string {
  return `${prefix}: ${CELL_STATE_LABELS[state]}`;
}
