import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import { listCheckoffPeriods } from "@/lib/checkoffs";
import type { createClient } from "@/lib/supabase";
import { groupErrorMessage, resolveGroupError } from "@/lib/group-errors";
import { getMyGroup, listGroupMembers, previewGroup, type GroupMember, type MyGroup } from "@/lib/groups";
import { clearJoinCode, peekJoinCode } from "@/lib/join-code";
import {
  buildBoard,
  groupPeriodsByEnrolment,
  rankStandings,
  UNKNOWN_MEMBER,
  type Board,
} from "@/lib/leaderboard-rules";
import { resolveTaskError } from "@/lib/task-errors";
import { groupParticipantsByTask } from "@/lib/task-rules";
import { listGroupTasks, listTaskParticipants, type GroupTask } from "@/lib/tasks";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export interface DashboardInput {
  /** Called inside the load's try, so a throw while creating the client ends as `loadFailed` like any other. */
  createSupabase: () => Supabase | null;
  cookies: AstroCookies;
  user: User | null;
  /** The `error` query parameter, resolved to a fixed group or task message. */
  errorParam: string | null;
}

export interface DashboardData {
  error: string | null;
  group: MyGroup | null;
  members: GroupMember[];
  tasks: GroupTask[];
  participantsByTask: Map<string, string[]>;
  pendingCode: string | null;
  pendingGroupName: string | null;
  loadFailed: boolean;
  tasksFailed: boolean;
  participantsFailed: boolean;
  checkoffsFailed: boolean;
  /** Set only when tasks, participants and check-offs all loaded and the board could be computed. */
  board: Board | null;
}

export async function loadDashboard({
  createSupabase,
  cookies,
  user,
  errorParam,
}: DashboardInput): Promise<DashboardData> {
  const data: DashboardData = {
    error: resolveGroupError(errorParam) ?? resolveTaskError(errorParam),
    group: null,
    members: [],
    tasks: [],
    participantsByTask: new Map(),
    pendingCode: null,
    pendingGroupName: null,
    loadFailed: false,
    tasksFailed: false,
    participantsFailed: false,
    checkoffsFailed: false,
    board: null,
  };

  try {
    const supabase = createSupabase();
    if (supabase) {
      const group = await getMyGroup(supabase);
      data.group = group;
      if (group) {
        // The four reads do not depend on each other (RLS scopes each to the caller's group), so they run concurrently.
        const [membersResult, tasksResult, participantsResult, checkoffsResult] = await Promise.allSettled([
          listGroupMembers(supabase, group.id),
          listGroupTasks(supabase, group.id),
          listTaskParticipants(supabase),
          listCheckoffPeriods(supabase),
        ]);
        // Members are essential: a failure takes the outer catch (`loadFailed`), as when it was awaited on its own.
        if (membersResult.status === "rejected") throw membersResult.reason;
        data.members = membersResult.value;
        if (tasksResult.status === "fulfilled") {
          data.tasks = tasksResult.value;
        } else {
          // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
          console.error("Loading the tasks failed", tasksResult.reason);
          data.tasksFailed = true;
        }
        // Participants and check-offs are secondary: a failure (or the row cap) degrades the rows, it must not hide task
        // management. When the tasks failed the Tasks card is hidden and these results go unused.
        if (participantsResult.status === "fulfilled") {
          data.participantsByTask = groupParticipantsByTask(participantsResult.value);
        } else {
          // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed note
          console.error("Loading the task participants failed", participantsResult.reason);
          data.participantsFailed = true;
        }
        if (checkoffsResult.status === "rejected") {
          // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed note
          console.error("Loading the check-offs failed", checkoffsResult.reason);
          data.checkoffsFailed = true;
        } else if (user && !data.tasksFailed && !data.participantsFailed) {
          // The slice's riskiest code gets its own try/catch: a throw degrades the scores like a failed read and must not
          // reach the outer catch, which would hide Members and group management.
          try {
            const computed = buildBoard({
              members: data.members,
              tasks: data.tasks,
              participantsByTask: data.participantsByTask,
              periodsByEnrolment: groupPeriodsByEnrolment(checkoffsResult.value),
              viewerId: user.id,
              now: new Date(),
            });
            // The Leaderboard ranks again on render; ranking here first keeps a throw inside this try.
            rankStandings(computed.totals, user.id);
            data.board = computed;
          } catch (boardError) {
            // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed note
            console.error("Computing the leaderboard failed", boardError);
            data.checkoffsFailed = true;
          }
        }
      }
      const code = peekJoinCode(cookies);
      if (code) {
        if (group) {
          // Already in a group: the pending invite cannot be used.
          clearJoinCode(cookies);
          data.error = groupErrorMessage("already_in_group");
        } else {
          const name = await previewGroup(supabase, code);
          if (name === null) {
            clearJoinCode(cookies);
            data.error = groupErrorMessage("invalid_code");
          } else {
            data.pendingCode = code;
            data.pendingGroupName = name;
          }
        }
      }
    }
  } catch (loadError) {
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Loading the dashboard failed", loadError);
    data.error = groupErrorMessage("unknown");
    data.loadFailed = true;
  }

  // A failed task load hides only the Tasks card (not an empty list); members, rename and delete still render.
  if (data.tasksFailed && !data.error) data.error = groupErrorMessage("unknown");
  return data;
}

export interface TaskParticipant {
  email: string;
  isYou: boolean;
}

/**
 * Participants of each task, by e-mail; someone without a matching member row (e.g. a stale participation) is
 * "Unknown member".
 */
export function participantsResolver(
  participantsByTask: Map<string, string[]>,
  members: GroupMember[],
  viewerId: string | undefined,
): (taskId: string) => TaskParticipant[] {
  const emailByUserId = new Map(members.map((member) => [member.user_id, member.email]));
  return (taskId) =>
    (participantsByTask.get(taskId) ?? []).map((userId) => ({
      email: emailByUserId.get(userId) ?? UNKNOWN_MEMBER,
      isYou: userId === viewerId,
    }));
}
