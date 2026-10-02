import type { EnrolmentPeriods } from "@/lib/leaderboard-rules";
import { reportError, reportInfo } from "@/lib/log";
import { periodKeyFor, type PeriodKey } from "@/lib/streak-rules";
import type { createClient } from "@/lib/supabase";
import { POSTGREST_MAX_ROWS, type GroupTask } from "@/lib/tasks";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

/**
 * The sorted check-off periods of every enrolment the caller can see (RLS limits the view to the caller's group), as
 * the leaderboard logic consumes them. Throws on a Supabase error, or when the result may have been cut off by the
 * row cap.
 */
export async function listCheckoffPeriods(supabase: Supabase): Promise<EnrolmentPeriods[]> {
  const { data, error } = await supabase.from("task_checkoff_periods").select("task_id, user_id, periods");
  if (error) throw error;
  if (data.length >= POSTGREST_MAX_ROWS) {
    throw new Error("Check-off periods may be truncated by the PostgREST row cap");
  }
  // The generated view columns are nullable; a GROUP BY over key columns never yields null, so a null row is dropped.
  const rows: EnrolmentPeriods[] = [];
  for (const { task_id, user_id, periods } of data) {
    if (task_id !== null && user_id !== null && periods !== null) rows.push({ task_id, user_id, periods });
  }
  return rows;
}

export type CheckoffOutcome =
  { kind: "ok"; period: PeriodKey } | { kind: "forbidden" } | { kind: "unknown"; error: unknown };

/**
 * Maps a failed write to an outcome: 23503 is a missing enrolment, 42501 an RLS refusal (other group, gone task). The
 * error is still in scope here and the `forbidden` outcome carries none, so the signal is reported at this point: 42501
 * is unexpected (an error line), 23503 is a stale request (an info line). Other codes are reported by the route.
 */
function failureOutcome(
  action: "checkoff" | "uncheck",
  error: { code?: string },
  status: number,
  ids: { userId: string; taskId: string },
): CheckoffOutcome {
  if (error.code === "42501") {
    reportError(`${action}.forbidden`, error, { ...ids, status });
    return { kind: "forbidden" };
  }
  if (error.code === "23503") {
    reportInfo(`${action}.not_enrolled`, ids);
    return { kind: "forbidden" };
  }
  return { kind: "unknown", error };
}

/**
 * Ticks the task for the period `now` falls in. Already ticked (23505) is an idempotent no-op. Not enrolled, or left
 * the task meanwhile, is `forbidden`.
 */
export async function checkOff(
  supabase: Supabase,
  userId: string,
  task: GroupTask,
  now: Date,
): Promise<CheckoffOutcome> {
  const period = periodKeyFor(task.recurrence, now);
  const { error, status } = await supabase.from("task_checkoffs").insert({ task_id: task.id, user_id: userId, period });
  if (error && error.code !== "23505") return failureOutcome("checkoff", error, status, { userId, taskId: task.id });
  return { kind: "ok", period };
}

/** The date `days` after a `YYYY-MM-DD` key. UTC arithmetic, so a DST day is just a day. */
function addDays(key: PeriodKey, days: number): PeriodKey {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Undoes the caller's tick for the period `now` falls in: the one day of a `daily` task, the whole week of a `weekly`
 * one, every row of a `once` task. Nothing to delete is a quiet ok (idempotent). Only the caller's own rows can match
 * (RLS).
 */
export async function uncheck(
  supabase: Supabase,
  userId: string,
  task: GroupTask,
  now: Date,
): Promise<CheckoffOutcome> {
  const period = periodKeyFor(task.recurrence, now);
  let rows = supabase.from("task_checkoffs").delete().eq("task_id", task.id).eq("user_id", userId);
  if (task.recurrence === "daily") {
    rows = rows.eq("period", period);
  } else if (task.recurrence === "weekly") {
    // The whole week, not just its Monday: `snapshotOf` snaps any weekly key to its Monday, so a row on another day of
    // the week (the API accepts any day inside the window) would keep the week "Done" after the undo.
    rows = rows.gte("period", period).lte("period", addDays(period, 6));
  }
  const { data, error, status } = await rows.select("period");
  if (error) return failureOutcome("uncheck", error, status, { userId, taskId: task.id });
  if (data.length === 0) reportInfo("uncheck.nothing_removed", { userId, taskId: task.id });
  return { kind: "ok", period };
}
