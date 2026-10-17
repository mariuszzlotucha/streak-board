import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { loadDashboard, participantsResolver, type DashboardInput } from "@/lib/dashboard-data";
import { groupErrorMessage } from "@/lib/group-errors";
import type { GroupMember, MyGroup } from "@/lib/groups";
import type { ReportContext } from "@/lib/log";
import type { createClient } from "@/lib/supabase";
import type { GroupTask } from "@/lib/tasks";

vi.mock("@/lib/groups", () => ({ getMyGroup: vi.fn(), listGroupMembers: vi.fn(), previewGroup: vi.fn() }));
vi.mock("@/lib/tasks", () => ({ listGroupTasks: vi.fn(), listTaskParticipants: vi.fn() }));
vi.mock("@/lib/checkoffs", () => ({ listCheckoffPeriods: vi.fn() }));
vi.mock("@/lib/grid-rules", () => ({ buildGrids: vi.fn() }));
vi.mock("@/lib/join-code", () => ({ peekJoinCode: vi.fn(), clearJoinCode: vi.fn() }));
vi.mock("@/lib/leaderboard-rules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/leaderboard-rules")>()),
  buildBoard: vi.fn(),
  groupPeriodsByEnrolment: vi.fn(() => new Map()),
  rankStandings: vi.fn(),
}));

const groups = await import("@/lib/groups");
const tasksLib = await import("@/lib/tasks");
const checkoffs = await import("@/lib/checkoffs");
const joinCode = await import("@/lib/join-code");
const rules = await import("@/lib/leaderboard-rules");
const gridRules = await import("@/lib/grid-rules");

type Supabase = NonNullable<ReturnType<typeof createClient>>;

const supabase = {} as Supabase;
const cookies = {} as AstroCookies;
const user = { id: "u-owner", email: "owner@example.com" } as User;
const group: MyGroup = {
  id: "g-1",
  name: "Runners",
  join_code: "abc",
  owner_id: "u-owner",
  owner_notice_pending: false,
};
const members: GroupMember[] = [
  { user_id: "u-owner", nickname: "Owner", joined_at: "2026-09-28T08:00:00Z", is_owner: true },
  { user_id: "u-2", nickname: "Two", joined_at: "2026-09-29T08:00:00Z", is_owner: false },
  { user_id: "u-3", nickname: null, joined_at: "2026-09-30T08:00:00Z", is_owner: false },
];
const task: GroupTask = { id: "t-1", title: "Run", recurrence: "daily", created_by: "u-owner" };
const board = { totals: [], viewerTasks: new Map() } as unknown as ReturnType<typeof rules.buildBoard>;
const grids = new Map() as ReturnType<typeof gridRules.buildGrids>;
const log: ReportContext = { route: "/dashboard", userId: "u-owner", ray: "ray-1" };

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return { createSupabase: () => supabase, cookies, user, errorParam: null, log, ...overrides };
}

/** The one printed report of a failure: the event, the request ids and the cause, as `reportError` writes them. */
function report(event: string, cause: Error) {
  return {
    level: "error",
    event,
    route: "/dashboard",
    userId: "u-owner",
    ray: "ray-1",
    error: { name: "Error", message: cause.message },
  };
}

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(groups.getMyGroup).mockResolvedValue(group);
  vi.mocked(groups.listGroupMembers).mockResolvedValue(members);
  vi.mocked(groups.previewGroup).mockResolvedValue(null);
  vi.mocked(tasksLib.listGroupTasks).mockResolvedValue([task]);
  vi.mocked(tasksLib.listTaskParticipants).mockResolvedValue([
    { task_id: "t-1", user_id: "u-owner", joined_at: "2026-10-01T08:00:00Z" },
  ]);
  vi.mocked(checkoffs.listCheckoffPeriods).mockResolvedValue([] as never);
  vi.mocked(joinCode.peekJoinCode).mockReturnValue(null);
  vi.mocked(rules.buildBoard).mockReturnValue(board);
  vi.mocked(gridRules.buildGrids).mockReset();
  vi.mocked(gridRules.buildGrids).mockReturnValue(grids);
  // A throwing implementation from the ranking test must not leak: clearAllMocks keeps a module mock's implementation.
  vi.mocked(rules.rankStandings).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("loadDashboard", () => {
  it("loads a healthy group with every section and the board", async () => {
    const data = await loadDashboard(input());
    expect(data).toMatchObject({
      error: null,
      group,
      members,
      tasks: [task],
      loadFailed: false,
      tasksFailed: false,
      participantsFailed: false,
      checkoffsFailed: false,
      board,
    });
    expect(data.grids).toBe(grids);
    expect(data.participantsByTask.get("t-1")).toEqual(["u-owner"]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("builds the grids from the board's instant and periods, with the participations and their join times", async () => {
    const periods = new Map([["t-1", new Map([["u-owner", ["2026-10-02"]]])]]);
    vi.mocked(rules.groupPeriodsByEnrolment).mockReturnValueOnce(periods);
    await loadDashboard(input());
    expect(rules.groupPeriodsByEnrolment).toHaveBeenCalledOnce();
    const boardInput = vi.mocked(rules.buildBoard).mock.calls[0][0];
    const gridInput = vi.mocked(gridRules.buildGrids).mock.calls[0][0];
    expect(gridInput).toEqual({
      members,
      tasks: [task],
      participations: new Map([["t-1", [{ userId: "u-owner", joinedAt: "2026-10-01T08:00:00Z" }]]]),
      periodsByEnrolment: periods,
      viewerId: "u-owner",
      now: boardInput.now,
    });
    expect(gridInput.periodsByEnrolment).toBe(boardInput.periodsByEnrolment);
    expect(gridInput.now).toBe(boardInput.now);
  });

  it("renders nothing failed when Supabase is not configured", async () => {
    const data = await loadDashboard(input({ createSupabase: () => null }));
    expect(data).toMatchObject({ group: null, loadFailed: false, error: null });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ends as loadFailed with one dashboard.load.failed report when creating the client throws", async () => {
    const cause = new Error("boom");
    const data = await loadDashboard(
      input({
        createSupabase: () => {
          throw cause;
        },
      }),
    );
    expect(data).toMatchObject({ loadFailed: true, error: groupErrorMessage("unknown"), group: null });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.load.failed", cause));
  });

  it("ends as loadFailed with one dashboard.load.failed report when the members read fails, keeping the group", async () => {
    const cause = Object.assign(new Error("down"), { code: "PGRST000", status: 503 });
    vi.mocked(groups.listGroupMembers).mockRejectedValue(cause);
    const data = await loadDashboard(input());
    expect(data).toMatchObject({
      loadFailed: true,
      error: groupErrorMessage("unknown"),
      members: [],
      board: null,
      grids: null,
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      ...report("dashboard.load.failed", cause),
      error: { code: "PGRST000", status: 503 },
    });
  });

  it("marks only the tasks as failed, shows the fixed message and reports dashboard.tasks.failed", async () => {
    const cause = new Error("down");
    vi.mocked(tasksLib.listGroupTasks).mockRejectedValue(cause);
    const data = await loadDashboard(input());
    expect(data).toMatchObject({
      tasksFailed: true,
      loadFailed: false,
      error: groupErrorMessage("unknown"),
      board: null,
      grids: null,
    });
    expect(data.members).toEqual(members);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.tasks.failed", cause));
  });

  it("keeps the error from the query parameter when the tasks fail", async () => {
    const cause = new Error("down");
    vi.mocked(tasksLib.listGroupTasks).mockRejectedValue(cause);
    const data = await loadDashboard(input({ errorParam: "forbidden" }));
    expect(data.error).toBe(groupErrorMessage("forbidden"));
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.tasks.failed", cause));
  });

  it("degrades the participants without computing the board and reports dashboard.participants.failed", async () => {
    const cause = new Error("down");
    vi.mocked(tasksLib.listTaskParticipants).mockRejectedValue(cause);
    const data = await loadDashboard(input());
    expect(data).toMatchObject({
      participantsFailed: true,
      checkoffsFailed: false,
      board: null,
      grids: null,
      error: null,
    });
    expect(rules.buildBoard).not.toHaveBeenCalled();
    expect(gridRules.buildGrids).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.participants.failed", cause));
  });

  it("degrades the scores when the check-offs fail and reports dashboard.checkoffs.failed", async () => {
    const cause = new Error("down");
    vi.mocked(checkoffs.listCheckoffPeriods).mockRejectedValue(cause);
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ checkoffsFailed: true, board: null, grids: null, loadFailed: false, error: null });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.checkoffs.failed", cause));
  });

  it("reports each of the three secondary reads once when all of them fail", async () => {
    const tasksCause = new Error("tasks down");
    const participantsCause = new Error("participants down");
    const checkoffsCause = new Error("check-offs down");
    vi.mocked(tasksLib.listGroupTasks).mockRejectedValue(tasksCause);
    vi.mocked(tasksLib.listTaskParticipants).mockRejectedValue(participantsCause);
    vi.mocked(checkoffs.listCheckoffPeriods).mockRejectedValue(checkoffsCause);
    const data = await loadDashboard(input());
    expect(data).toMatchObject({
      tasksFailed: true,
      participantsFailed: true,
      checkoffsFailed: true,
      loadFailed: false,
      board: null,
      grids: null,
    });
    expect(errorSpy).toHaveBeenCalledTimes(3);
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.tasks.failed", tasksCause));
    expect(errorSpy.mock.calls[1][0]).toMatchObject(report("dashboard.participants.failed", participantsCause));
    expect(errorSpy.mock.calls[2][0]).toMatchObject(report("dashboard.checkoffs.failed", checkoffsCause));
  });

  it("degrades the scores when computing the board throws, keeping members and tasks, and reports dashboard.leaderboard.failed", async () => {
    const cause = new Error("bad data");
    vi.mocked(rules.buildBoard).mockImplementation(() => {
      throw cause;
    });
    const data = await loadDashboard(input());
    expect(data).toMatchObject({
      checkoffsFailed: true,
      board: null,
      grids: null,
      loadFailed: false,
      members,
      tasks: [task],
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.leaderboard.failed", cause));
  });

  it("degrades the scores when ranking throws and reports dashboard.leaderboard.failed", async () => {
    const cause = new Error("bad rank");
    vi.mocked(rules.rankStandings).mockImplementation(() => {
      throw cause;
    });
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ checkoffsFailed: true, board: null, grids: null, loadFailed: false });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.leaderboard.failed", cause));
  });

  it("degrades the scores and the grids when building the grids throws and reports dashboard.leaderboard.failed", async () => {
    const cause = new Error("bad grid");
    vi.mocked(gridRules.buildGrids).mockImplementation(() => {
      throw cause;
    });
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ checkoffsFailed: true, board: null, grids: null, loadFailed: false, members });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject(report("dashboard.leaderboard.failed", cause));
  });

  it("drops a pending invite for a user already in a group", async () => {
    vi.mocked(joinCode.peekJoinCode).mockReturnValue("code-1");
    const data = await loadDashboard(input());
    expect(joinCode.clearJoinCode).toHaveBeenCalledWith(cookies);
    expect(data).toMatchObject({ error: groupErrorMessage("already_in_group"), pendingCode: null });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("drops an invalid pending invite", async () => {
    vi.mocked(groups.getMyGroup).mockResolvedValue(null);
    vi.mocked(joinCode.peekJoinCode).mockReturnValue("bad");
    const data = await loadDashboard(input());
    expect(joinCode.clearJoinCode).toHaveBeenCalledWith(cookies);
    expect(data).toMatchObject({ error: groupErrorMessage("invalid_code"), pendingCode: null });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("offers a valid pending invite without clearing it", async () => {
    vi.mocked(groups.getMyGroup).mockResolvedValue(null);
    vi.mocked(joinCode.peekJoinCode).mockReturnValue("good");
    vi.mocked(groups.previewGroup).mockResolvedValue("Runners");
    const data = await loadDashboard(input());
    expect(joinCode.clearJoinCode).not.toHaveBeenCalled();
    expect(data).toMatchObject({ error: null, pendingCode: "good", pendingGroupName: "Runners" });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("participantsResolver", () => {
  it("resolves nicknames, marks the viewer and names a member without one or a stale participant Unknown member", () => {
    const participantsOf = participantsResolver(
      new Map([["t-1", ["u-owner", "u-2", "u-3", "u-gone"]]]),
      members,
      "u-owner",
    );
    expect(participantsOf("t-1")).toEqual([
      { nickname: "Owner", isYou: true },
      { nickname: "Two", isYou: false },
      { nickname: rules.UNKNOWN_MEMBER, isYou: false },
      { nickname: rules.UNKNOWN_MEMBER, isYou: false },
    ]);
    expect(participantsOf("t-none")).toEqual([]);
  });
});
