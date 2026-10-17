// Pure check-off grid rules shared by the dashboard (server) and the grid island (browser). Keep this file free of
// server-only imports and of `Date.now()`: `now` is injected, so tests use fixed instants. Period arithmetic comes from
// `streak-rules.ts`, so the grid and the streak beside it never disagree about a day or a week.
import { normalisePeriod, periodKeyFor, recentPeriods, type PeriodKey } from "@/lib/streak-rules";
import type { TaskRecurrence } from "@/lib/task-rules";

/** How many periods the grid shows per recurrence, ending with the current one. */
export const GRID_HORIZON = { daily: 7, weekly: 4 } as const;

/**
 * `done`: a check-off exists for the period. `open`: the current period without one. `notJoined`: a closed period
 * before the participant's join period without one. `missed`: any other closed period without one.
 */
export type CellState = "done" | "missed" | "open" | "notJoined";

export interface GridRow {
  userId: string;
  nickname: string | null;
  isYou: boolean;
  /** One cell per entry of `TaskGrid.periods`, in the same order. */
  cells: CellState[];
}

export interface TaskGrid {
  /** Ascending, the last one is the current period; `once` has only the current period. */
  periods: PeriodKey[];
  rows: GridRow[];
}

/** A participation row of one task: who takes part and since when (an ISO timestamp, `task_participants.joined_at`). */
export interface GridParticipation {
  userId: string;
  joinedAt: string;
}

/** Each member, task and participant id appears once (they are primary keys in the database). */
export interface GridInput {
  members: readonly { user_id: string; nickname: string | null }[];
  tasks: readonly { id: string; recurrence: TaskRecurrence }[];
  /** Task id -> its participations, in the order the rows are shown. */
  participations: ReadonlyMap<string, readonly GridParticipation[]>;
  /** Task id -> user id -> check-off periods (`groupPeriodsByEnrolment`). */
  periodsByEnrolment: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  viewerId: string;
  now: Date;
}

function cellsOf(
  recurrence: "daily" | "weekly",
  periods: readonly PeriodKey[],
  keys: readonly string[],
  joinPeriod: PeriodKey,
): CellState[] {
  const current = periods[periods.length - 1];
  // Keys after the current period wait for their period; they never fall inside the horizon anyway.
  const done = new Set(keys.map((key) => normalisePeriod(recurrence, key)));
  return periods.map((period) => {
    if (done.has(period)) return "done";
    if (period === current) return "open";
    return period < joinPeriod ? "notJoined" : "missed";
  });
}

/**
 * The grid of every task, by task id. Rows follow the participation order and skip participants who are not members
 * (a leftover row of someone who left). A check-off counts even before the join period (`done` beats `notJoined`);
 * the join period itself is an ordinary period.
 */
export function buildGrids({
  members,
  tasks,
  participations,
  periodsByEnrolment,
  viewerId,
  now,
}: GridInput): Map<string, TaskGrid> {
  const nicknames = new Map(members.map((member) => [member.user_id, member.nickname]));
  const grids = new Map<string, TaskGrid>();

  for (const task of tasks) {
    const { recurrence } = task;
    const currentPeriod = periodKeyFor(recurrence, now);
    const periods =
      recurrence === "once" ? [currentPeriod] : recentPeriods(recurrence, currentPeriod, GRID_HORIZON[recurrence]);
    const enrolments = periodsByEnrolment.get(task.id);
    const rows: GridRow[] = [];
    for (const { userId, joinedAt } of participations.get(task.id) ?? []) {
      if (!nicknames.has(userId)) continue;
      const keys = enrolments?.get(userId) ?? [];
      const cells: CellState[] =
        recurrence === "once"
          ? [keys.length > 0 ? "done" : "open"]
          : cellsOf(recurrence, periods, keys, periodKeyFor(recurrence, new Date(joinedAt)));
      rows.push({ userId, nickname: nicknames.get(userId) ?? null, isYou: userId === viewerId, cells });
    }
    grids.set(task.id, { periods, rows });
  }
  return grids;
}
