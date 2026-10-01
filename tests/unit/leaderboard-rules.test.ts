/**
 * Oracle for the leaderboard (S-04, FR-009): grouping, ranking and the board built from rows.
 *
 * Every expected value is derived by hand from the plan's decisions (context/changes/checkoff-and-leaderboard/plan.md,
 * "Totals and positions") and from the streak oracle at the top of streak-rules.test.ts. None of it comes from running
 * the implementation.
 *
 * Totals and positions
 *   - a member's total is the sum of their task streaks; members are ranked by total, highest first
 *   - equal totals share the position and the next position is skipped: 5, 5, 3 -> 1, 1, 3; 7, 5, 5, 5, 3 -> 1, 2, 2, 2, 5
 *   - equal totals are listed alphabetically by e-mail, ignoring case; a missing e-mail counts as "Unknown member";
 *     the user id is the last resort. E-mails are compared lower-cased and by code unit, so the order is
 *     alice@ < bob@ < "unknown member" < zed@ (the plan leaves the direction of the case fold open)
 *   - every member is listed, with a total of 0 at least; a participant who is not a member is not
 *
 * Board example. now = 2026-10-02T10:00:00Z = Friday 12:00 in Warsaw (CEST), so the daily period is 2026-10-02 and
 * the weekly period is the week of Monday 2026-09-28. Members A, B, C; "ghost" takes part in T1 but is not a member.
 *
 *   T1 (daily)    A checked 09-28 .. 10-02, five in a row, today included                -> 5
 *                 B checked 09-29 and 09-30 (1, 2), missed 10-01 (floor(2/2) = 1), today open -> 1
 *                 ghost (not a member)                                                    -> ignored
 *   T2 (weekly)   A checked the weeks of 09-14, 09-21 and 09-28 (this week included)     -> 3
 *                 B takes part and never checked                                          -> 0
 *                 C checked the weeks of 09-07 and 09-14 (1, 2), missed 09-21 (floor(2/2) = 1), this week open -> 1
 *                 C does not take part in T1
 *   totals        A = 5 + 3 = 8, B = 1 + 0 = 1, C = 1  ->  positions A 1, B 2, C 2 (B before C by e-mail)
 *
 *   What each viewer's task rows need (the snapshot is the state before the current period):
 *     B, T1: base 2 at 09-30, not checked, period 2026-10-02    B, T2: no base, not checked, period 2026-09-28
 *     C, T2: base 2 at 09-14, not checked, period 2026-09-28    C has no T1 entry (not enrolled)
 */
import { describe, expect, it } from "vitest";
import { buildBoard, groupPeriodsByEnrolment, rankStandings, type StandingInput } from "@/lib/leaderboard-rules";
import { groupParticipantsByTask, type TaskRecurrence } from "@/lib/task-rules";

describe("groupPeriodsByEnrolment", () => {
  it("returns an empty map for no rows", () => {
    expect(groupPeriodsByEnrolment([]).size).toBe(0);
  });

  it("groups the periods under their task and then their user", () => {
    const map = groupPeriodsByEnrolment([
      { task_id: "t1", user_id: "u1", periods: ["2026-09-28", "2026-09-29"] },
      { task_id: "t1", user_id: "u2", periods: ["2026-09-30"] },
      { task_id: "t2", user_id: "u1", periods: ["2026-10-01"] },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("t1")?.get("u1")).toEqual(["2026-09-28", "2026-09-29"]);
    expect(map.get("t1")?.get("u2")).toEqual(["2026-09-30"]);
    expect(map.get("t2")?.get("u1")).toEqual(["2026-10-01"]);
    expect(map.get("t2")?.get("u2")).toBeUndefined();
    expect(map.get("t3")).toBeUndefined();
  });
});

const row = (userId: string, email: string | null, total: number): StandingInput => ({ userId, email, total });

describe("rankStandings", () => {
  it("shares a position between equal totals and skips the next (5, 5, 3 -> 1, 1, 3)", () => {
    const ranked = rankStandings(
      [row("u3", "carol@example.com", 3), row("u2", "bob@example.com", 5), row("u1", "alice@example.com", 5)],
      "u1",
    );
    expect(ranked.map((r) => [r.email, r.total, r.position])).toEqual([
      ["alice@example.com", 5, 1],
      ["bob@example.com", 5, 1],
      ["carol@example.com", 3, 3],
    ]);
  });

  it("counts only strictly higher totals for the position (7, 5, 5, 5, 3 -> 1, 2, 2, 2, 5)", () => {
    const ranked = rankStandings(
      [
        row("u1", "a@example.com", 3),
        row("u2", "b@example.com", 5),
        row("u3", "c@example.com", 7),
        row("u4", "d@example.com", 5),
        row("u5", "e@example.com", 5),
      ],
      "u1",
    );
    expect(ranked.map((r) => [r.userId, r.position])).toEqual([
      ["u3", 1],
      ["u2", 2],
      ["u4", 2],
      ["u5", 2],
      ["u1", 5],
    ]);
  });

  it("puts everybody at position 1 when all totals are 0", () => {
    const ranked = rankStandings([row("u2", "b@example.com", 0), row("u1", "a@example.com", 0)], "u1");
    expect(ranked.map((r) => r.position)).toEqual([1, 1]);
  });

  it("flags only the viewer's own row", () => {
    const ranked = rankStandings([row("u1", "a@example.com", 2), row("u2", "b@example.com", 1)], "u2");
    expect(ranked.map((r) => [r.userId, r.isYou])).toEqual([
      ["u1", false],
      ["u2", true],
    ]);
  });

  it("orders equal totals by e-mail ignoring case, a missing e-mail as 'Unknown member', then by user id", () => {
    const ranked = rankStandings(
      [
        row("u5", "zed@example.com", 2),
        row("u4", "Bob@example.com", 2),
        row("u3", null, 2),
        row("u2", "alice@example.com", 2),
        row("u1", "bob@example.com", 2),
      ],
      "u1",
    );
    // alice, then both bobs (the same e-mail ignoring case: user id u1 before u4), then "unknown member", then zed
    expect(ranked.map((r) => r.userId)).toEqual(["u2", "u1", "u4", "u3", "u5"]);
  });

  it("orders by code units, not by locale, and folds case downwards", () => {
    // '2' (0x32) sorts before '@' (0x40); localeCompare says the opposite
    const byCodeUnit = rankStandings([row("u1", "john@example.com", 1), row("u2", "john2@example.com", 1)], "u1");
    expect(byCodeUnit.map((r) => r.userId)).toEqual(["u2", "u1"]);
    // The plan leaves the fold direction open; the implementation lower-cases, so '_' (0x5F) sorts before 'n' (0x6E)
    const byFold = rankStandings([row("u1", "johnny@x.io", 1), row("u2", "john_smith@x.io", 1)], "u1");
    expect(byFold.map((r) => r.userId)).toEqual(["u2", "u1"]);
  });

  it("does not change its input", () => {
    const input = [row("u2", "b@example.com", 1), row("u1", "a@example.com", 2)];
    const copy = structuredClone(input);
    rankStandings(input, "u1");
    expect(input).toEqual(copy);
  });
});

describe("buildBoard", () => {
  const NOW = new Date("2026-10-02T10:00:00Z"); // Friday 12:00 in Warsaw: daily period 2026-10-02, week of 2026-09-28
  const members = [
    { user_id: "user-a", email: "alice@example.com" },
    { user_id: "user-b", email: "bob@example.com" },
    { user_id: "user-c", email: "carol@example.com" },
  ];
  const tasks: { id: string; recurrence: TaskRecurrence }[] = [
    { id: "t1", recurrence: "daily" },
    { id: "t2", recurrence: "weekly" },
  ];
  const participantsByTask = groupParticipantsByTask([
    { task_id: "t1", user_id: "user-a" },
    { task_id: "t1", user_id: "user-b" },
    { task_id: "t1", user_id: "ghost" },
    { task_id: "t2", user_id: "user-a" },
    { task_id: "t2", user_id: "user-b" },
    { task_id: "t2", user_id: "user-c" },
  ]);
  const periodsByEnrolment = groupPeriodsByEnrolment([
    {
      task_id: "t1",
      user_id: "user-a",
      periods: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"],
    },
    { task_id: "t1", user_id: "user-b", periods: ["2026-09-29", "2026-09-30"] },
    { task_id: "t1", user_id: "ghost", periods: ["2026-09-28", "2026-09-29", "2026-09-30"] },
    { task_id: "t2", user_id: "user-a", periods: ["2026-09-14", "2026-09-21", "2026-09-28"] },
    { task_id: "t2", user_id: "user-c", periods: ["2026-09-07", "2026-09-14"] },
  ]);
  const boardFor = (viewerId: string) =>
    buildBoard({ members, tasks, participantsByTask, periodsByEnrolment, viewerId, now: NOW });

  it("sums every member's task streaks", () => {
    expect(boardFor("user-b").totals).toEqual([
      { userId: "user-a", email: "alice@example.com", total: 8 },
      { userId: "user-b", email: "bob@example.com", total: 1 },
      { userId: "user-c", email: "carol@example.com", total: 1 },
    ]);
  });

  it("keeps the members' order in totals, whatever the totals are", () => {
    const reversed = buildBoard({
      members: [...members].reverse(),
      tasks,
      participantsByTask,
      periodsByEnrolment,
      viewerId: "user-a",
      now: NOW,
    });
    expect(reversed.totals.map((r) => [r.userId, r.total])).toEqual([
      ["user-c", 1],
      ["user-b", 1],
      ["user-a", 8],
    ]);
  });

  it("ranks the example as A first and B and C sharing second place", () => {
    const ranked = rankStandings(boardFor("user-b").totals, "user-b");
    expect(ranked.map((r) => [r.userId, r.position, r.isYou])).toEqual([
      ["user-a", 1, false],
      ["user-b", 2, true],
      ["user-c", 2, false],
    ]);
  });

  it("does not list a participant who is not a member", () => {
    const { totals } = boardFor("user-a");
    expect(totals.map((r) => r.userId)).toEqual(["user-a", "user-b", "user-c"]);
  });

  it("lists a member who takes part in no task with a total of 0", () => {
    const board = buildBoard({
      members: [...members, { user_id: "user-d", email: null }],
      tasks,
      participantsByTask,
      periodsByEnrolment,
      viewerId: "user-a",
      now: NOW,
    });
    expect(board.totals.at(-1)).toEqual({ userId: "user-d", email: null, total: 0 });
  });

  it("gives the viewer a snapshot and the current period for each task they take part in", () => {
    const { viewerTasks } = boardFor("user-b");
    expect([...viewerTasks.keys()].sort()).toEqual(["t1", "t2"]);
    expect(viewerTasks.get("t1")).toEqual({
      snapshot: { base: { value: 2, period: "2026-09-30" }, checked: false },
      currentPeriod: "2026-10-02",
    });
    expect(viewerTasks.get("t2")).toEqual({
      snapshot: { base: null, checked: false },
      currentPeriod: "2026-09-28",
    });
  });

  it("has no entry for a task the viewer does not take part in", () => {
    const { viewerTasks } = boardFor("user-c");
    expect([...viewerTasks.keys()]).toEqual(["t2"]);
    expect(viewerTasks.get("t2")).toEqual({
      snapshot: { base: { value: 2, period: "2026-09-14" }, checked: false },
      currentPeriod: "2026-09-28",
    });
  });

  it("takes the period from the Warsaw clock, not the UTC date", () => {
    // 2026-10-04T22:30:00Z is Monday 00:30 in Warsaw while the UTC date is still Sunday: a new day and a new week
    const board = buildBoard({
      members: [{ user_id: "user-a", email: "alice@example.com" }],
      tasks: [
        { id: "t1", recurrence: "daily" },
        { id: "t2", recurrence: "weekly" },
        { id: "t3", recurrence: "once" },
      ],
      participantsByTask: new Map([
        ["t1", ["user-a"]],
        ["t2", ["user-a"]],
        ["t3", ["user-a"]],
      ]),
      periodsByEnrolment: groupPeriodsByEnrolment([
        { task_id: "t2", user_id: "user-a", periods: ["2026-09-28"] },
        { task_id: "t3", user_id: "user-a", periods: ["2026-09-01"] },
      ]),
      viewerId: "user-a",
      now: new Date("2026-10-04T22:30:00Z"),
    });
    expect(board.viewerTasks.get("t1")?.currentPeriod).toBe("2026-10-05");
    expect(board.viewerTasks.get("t2")?.currentPeriod).toBe("2026-10-05");
    expect(board.viewerTasks.get("t3")).toEqual({
      snapshot: { base: null, checked: true },
      currentPeriod: "2026-10-05",
    });
    // t1: nothing checked = 0; t2: the old week was checked and the new one is open = 1; t3: once, checked = 1
    expect(board.totals).toEqual([{ userId: "user-a", email: "alice@example.com", total: 2 }]);
  });

  it("scales linearly with the stored periods (scale guard)", () => {
    const MS_PER_DAY = 86_400_000;
    const today = Date.UTC(2026, 9, 2) / MS_PER_DAY; // 2026-10-02
    const scaleMembers = Array.from({ length: 5 }, (_, i) => ({ user_id: `user-${i}`, email: `user${i}@example.com` }));
    const scaleTasks: { id: string; recurrence: TaskRecurrence }[] = ["t1", "t2", "t3"].map((id) => ({
      id,
      recurrence: "daily",
    }));
    // 5 members x 3 daily tasks = 15 enrolments, each with `length` consecutive checked days ending today
    const boardOf = (length: number) => {
      const days = Array.from({ length }, (_, i) =>
        new Date((today - (length - 1) + i) * MS_PER_DAY).toISOString().slice(0, 10),
      );
      const enrolments = scaleMembers.flatMap((member) =>
        scaleTasks.map((task) => ({ task_id: task.id, user_id: member.user_id, periods: days })),
      );
      const input = {
        members: scaleMembers,
        tasks: scaleTasks,
        participantsByTask: groupParticipantsByTask(enrolments),
        periodsByEnrolment: groupPeriodsByEnrolment(enrolments),
        viewerId: "user-0",
        now: NOW,
      };
      return () => buildBoard(input);
    };
    const medianMs = (run: () => unknown): number => {
      const runs: number[] = [];
      for (let i = 0; i < 5; i++) {
        const started = performance.now();
        run();
        runs.push(performance.now() - started);
      }
      return runs.sort((a, b) => a - b)[2];
    };

    // 730 days in a row ending today is a streak of 730 per task, so every member totals 3 x 730
    expect(boardOf(730)().totals.map((r) => r.total)).toEqual([2190, 2190, 2190, 2190, 2190]);

    // The cost must grow linearly: 8x the periods costs about 8x the time (a quadratic scan about 64x). Both timings
    // come from the same machine, so the check does not depend on its speed and the bound can be tight.
    const small = boardOf(1000);
    const large = boardOf(8000);
    medianMs(small); // warm up both paths
    medianMs(large);
    expect(medianMs(large) / medianMs(small)).toBeLessThan(24);
  });
});
