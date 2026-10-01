// Pure leaderboard logic shared by the dashboard (server) and the Leaderboard island (browser). Keep this file free of
// server-only imports (no `astro:env/server`, no Supabase client) so it is safe to bundle for the browser.
import { periodKeyFor, snapshotOf, streakValue, type PeriodKey, type StreakSnapshot } from "@/lib/streak-rules";
import type { TaskRecurrence } from "@/lib/task-rules";

/** A row of the `task_checkoff_periods` view: the sorted check-off periods of one enrolment (task and user). */
export interface EnrolmentPeriods {
  task_id: string;
  user_id: string;
  periods: readonly string[];
}

/** Check-off periods grouped by task id and then by user id. */
export function groupPeriodsByEnrolment(
  rows: readonly EnrolmentPeriods[],
): Map<string, Map<string, readonly string[]>> {
  const byTask = new Map<string, Map<string, readonly string[]>>();
  for (const { task_id, user_id, periods } of rows) {
    const byUser = byTask.get(task_id);
    if (byUser) byUser.set(user_id, periods);
    else byTask.set(task_id, new Map([[user_id, periods]]));
  }
  return byTask;
}

/** One member's line before ranking. */
export interface StandingInput {
  userId: string;
  email: string | null;
  total: number;
}

export interface Standing extends StandingInput {
  position: number;
  isYou: boolean;
}

/** What a member without an e-mail is called, both where the ranking sorts them and wherever the UI displays them. */
export const UNKNOWN_MEMBER = "Unknown member";

// Code-unit order, not `localeCompare`: the ranking must be the same on the server and in every browser locale.
const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Members ranked by total, highest first; equal totals share the position (`1 +` the number of strictly higher totals,
 * so 5, 5, 3 gives 1, 1, 3) and are listed by e-mail ignoring case (a missing e-mail sorts as "Unknown member"), then by
 * user id. The input is not changed.
 */
export function rankStandings(rows: readonly StandingInput[], viewerId: string): Standing[] {
  const ordered = rows
    .map((row) => ({ row, name: (row.email ?? UNKNOWN_MEMBER).toLowerCase() }))
    .sort(
      (a, b) =>
        b.row.total - a.row.total || compareCodeUnits(a.name, b.name) || compareCodeUnits(a.row.userId, b.row.userId),
    );
  const standings: Standing[] = [];
  for (const { row } of ordered) {
    const previous = standings.at(-1);
    const position = previous?.total === row.total ? previous.position : standings.length + 1;
    standings.push({ ...row, position, isYou: row.userId === viewerId });
  }
  return standings;
}

/**
 * The totals the Leaderboard island shows: each server total plus the user's net optimistic change (see
 * `checkoff-sync`). Users without a delta keep their total, so an empty store gives exactly the server's totals. The
 * input is not changed.
 */
export function applyDeltas(rows: readonly StandingInput[], deltas: ReadonlyMap<string, number>): StandingInput[] {
  return rows.map((row) => ({ ...row, total: row.total + (deltas.get(row.userId) ?? 0) }));
}

/** What the viewer's row of one task needs to render its control and to preview a tick or an undo. */
export interface ViewerTask {
  snapshot: StreakSnapshot;
  currentPeriod: PeriodKey;
}

/**
 * Each member, task and participant id appears once (they are primary keys in the database); a repeat would double a
 * total.
 */
export interface BoardInput {
  members: readonly { user_id: string; email: string | null }[];
  tasks: readonly { id: string; recurrence: TaskRecurrence }[];
  /** Task id -> ids of the users who take part in it (`groupParticipantsByTask`). */
  participantsByTask: ReadonlyMap<string, readonly string[]>;
  /** Task id -> user id -> check-off periods (`groupPeriodsByEnrolment`). */
  periodsByEnrolment: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  viewerId: string;
  now: Date;
}

export interface Board {
  /** Every member with their total, in member order; hand them to `rankStandings`. */
  totals: StandingInput[];
  /** The viewer's snapshot and current period for each task they take part in, by task id. */
  viewerTasks: Map<string, ViewerTask>;
}

/**
 * One member's total is the sum of their streaks over the tasks they take part in. Participants who are not members
 * (for example a leftover participation row of someone who left the group) are ignored. `now` is injected, so the
 * periods follow the Warsaw clock of the caller's instant and tests can use fixed dates.
 */
export function buildBoard({
  members,
  tasks,
  participantsByTask,
  periodsByEnrolment,
  viewerId,
  now,
}: BoardInput): Board {
  const totalByUser = new Map<string, number>(members.map((member) => [member.user_id, 0]));
  const viewerTasks = new Map<string, ViewerTask>();
  const currentPeriods = new Map<TaskRecurrence, PeriodKey>();

  for (const task of tasks) {
    let currentPeriod = currentPeriods.get(task.recurrence);
    if (currentPeriod === undefined) {
      currentPeriod = periodKeyFor(task.recurrence, now);
      currentPeriods.set(task.recurrence, currentPeriod);
    }
    const enrolments = periodsByEnrolment.get(task.id);
    for (const userId of participantsByTask.get(task.id) ?? []) {
      const total = totalByUser.get(userId);
      if (total === undefined) continue;
      const snapshot = snapshotOf(task.recurrence, enrolments?.get(userId) ?? [], currentPeriod);
      totalByUser.set(userId, total + streakValue(task.recurrence, snapshot, currentPeriod));
      if (userId === viewerId) viewerTasks.set(task.id, { snapshot, currentPeriod });
    }
  }

  return {
    totals: members.map(({ user_id, email }) => ({ userId: user_id, email, total: totalByUser.get(user_id) ?? 0 })),
    viewerTasks,
  };
}
