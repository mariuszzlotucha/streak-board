import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDashboard, participantsResolver, type DashboardInput } from "@/lib/dashboard-data";
import { groupErrorMessage } from "@/lib/group-errors";
import type { GroupMember, MyGroup } from "@/lib/groups";
import type { createClient } from "@/lib/supabase";
import type { GroupTask } from "@/lib/tasks";

vi.mock("@/lib/groups", () => ({ getMyGroup: vi.fn(), listGroupMembers: vi.fn(), previewGroup: vi.fn() }));
vi.mock("@/lib/tasks", () => ({ listGroupTasks: vi.fn(), listTaskParticipants: vi.fn() }));
vi.mock("@/lib/checkoffs", () => ({ listCheckoffPeriods: vi.fn() }));
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

type Supabase = NonNullable<ReturnType<typeof createClient>>;

const supabase = {} as Supabase;
const cookies = {} as AstroCookies;
const user = { id: "u-owner", email: "owner@example.com" } as User;
const group: MyGroup = { id: "g-1", name: "Runners", join_code: "abc", owner_id: "u-owner" };
const members: GroupMember[] = [
  { user_id: "u-owner", email: "owner@example.com", is_owner: true },
  { user_id: "u-2", email: "two@example.com", is_owner: false },
] as GroupMember[];
const task: GroupTask = { id: "t-1", title: "Run", recurrence: "daily", created_by: "u-owner" };
const board = { totals: [], viewerTasks: new Map() } as unknown as ReturnType<typeof rules.buildBoard>;

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return { createSupabase: () => supabase, cookies, user, errorParam: null, ...overrides };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(groups.getMyGroup).mockResolvedValue(group);
  vi.mocked(groups.listGroupMembers).mockResolvedValue(members);
  vi.mocked(groups.previewGroup).mockResolvedValue(null);
  vi.mocked(tasksLib.listGroupTasks).mockResolvedValue([task]);
  vi.mocked(tasksLib.listTaskParticipants).mockResolvedValue([{ task_id: "t-1", user_id: "u-owner" }] as never);
  vi.mocked(checkoffs.listCheckoffPeriods).mockResolvedValue([] as never);
  vi.mocked(joinCode.peekJoinCode).mockReturnValue(null);
  vi.mocked(rules.buildBoard).mockReturnValue(board);
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
    expect(data.participantsByTask.get("t-1")).toEqual(["u-owner"]);
  });

  it("renders nothing failed when Supabase is not configured", async () => {
    const data = await loadDashboard(input({ createSupabase: () => null }));
    expect(data).toMatchObject({ group: null, loadFailed: false, error: null });
  });

  it("ends as loadFailed when creating the client throws", async () => {
    const data = await loadDashboard(
      input({
        createSupabase: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(data).toMatchObject({ loadFailed: true, error: groupErrorMessage("unknown"), group: null });
  });

  it("ends as loadFailed when the members read fails, keeping the group", async () => {
    vi.mocked(groups.listGroupMembers).mockRejectedValue(new Error("down"));
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ loadFailed: true, error: groupErrorMessage("unknown"), members: [], board: null });
  });

  it("marks only the tasks as failed and shows the fixed message", async () => {
    vi.mocked(tasksLib.listGroupTasks).mockRejectedValue(new Error("down"));
    const data = await loadDashboard(input());
    expect(data).toMatchObject({
      tasksFailed: true,
      loadFailed: false,
      error: groupErrorMessage("unknown"),
      board: null,
    });
    expect(data.members).toEqual(members);
  });

  it("keeps the error from the query parameter when the tasks fail", async () => {
    vi.mocked(tasksLib.listGroupTasks).mockRejectedValue(new Error("down"));
    const data = await loadDashboard(input({ errorParam: "forbidden" }));
    expect(data.error).toBe(groupErrorMessage("forbidden"));
  });

  it("degrades the participants without computing the board", async () => {
    vi.mocked(tasksLib.listTaskParticipants).mockRejectedValue(new Error("down"));
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ participantsFailed: true, checkoffsFailed: false, board: null, error: null });
    expect(rules.buildBoard).not.toHaveBeenCalled();
  });

  it("degrades the scores when the check-offs fail", async () => {
    vi.mocked(checkoffs.listCheckoffPeriods).mockRejectedValue(new Error("down"));
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ checkoffsFailed: true, board: null, loadFailed: false, error: null });
  });

  it("degrades the scores when computing the board throws, keeping members and tasks", async () => {
    vi.mocked(rules.buildBoard).mockImplementation(() => {
      throw new Error("bad data");
    });
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ checkoffsFailed: true, board: null, loadFailed: false, members, tasks: [task] });
  });

  it("degrades the scores when ranking throws", async () => {
    vi.mocked(rules.rankStandings).mockImplementation(() => {
      throw new Error("bad rank");
    });
    const data = await loadDashboard(input());
    expect(data).toMatchObject({ checkoffsFailed: true, board: null, loadFailed: false });
  });

  it("drops a pending invite for a user already in a group", async () => {
    vi.mocked(joinCode.peekJoinCode).mockReturnValue("code-1");
    const data = await loadDashboard(input());
    expect(joinCode.clearJoinCode).toHaveBeenCalledWith(cookies);
    expect(data).toMatchObject({ error: groupErrorMessage("already_in_group"), pendingCode: null });
  });

  it("drops an invalid pending invite", async () => {
    vi.mocked(groups.getMyGroup).mockResolvedValue(null);
    vi.mocked(joinCode.peekJoinCode).mockReturnValue("bad");
    const data = await loadDashboard(input());
    expect(joinCode.clearJoinCode).toHaveBeenCalledWith(cookies);
    expect(data).toMatchObject({ error: groupErrorMessage("invalid_code"), pendingCode: null });
  });

  it("offers a valid pending invite without clearing it", async () => {
    vi.mocked(groups.getMyGroup).mockResolvedValue(null);
    vi.mocked(joinCode.peekJoinCode).mockReturnValue("good");
    vi.mocked(groups.previewGroup).mockResolvedValue("Runners");
    const data = await loadDashboard(input());
    expect(joinCode.clearJoinCode).not.toHaveBeenCalled();
    expect(data).toMatchObject({ error: null, pendingCode: "good", pendingGroupName: "Runners" });
  });
});

describe("participantsResolver", () => {
  it("resolves e-mails, marks the viewer and names a stale participant Unknown member", () => {
    const participantsOf = participantsResolver(new Map([["t-1", ["u-owner", "u-gone"]]]), members, "u-owner");
    expect(participantsOf("t-1")).toEqual([
      { email: "owner@example.com", isYou: true },
      { email: rules.UNKNOWN_MEMBER, isYou: false },
    ]);
    expect(participantsOf("t-none")).toEqual([]);
  });
});
