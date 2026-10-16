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
 *   - equal totals are listed alphabetically by nickname, ignoring case; a missing nickname counts as "Unknown member";
 *     the user id is the last resort (S-14). Nicknames are compared lower-cased and by code unit, so the order is
 *     Alice < Bob < "unknown member" < Zed, and "Kasia" and "kasia" (two different nicknames) are ordered by user id
 *     (the plan leaves the direction of the case fold open)
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
 *   totals        A = 5 + 3 = 8, B = 1 + 0 = 1, C = 1  ->  positions A 1, B 2, C 2 (B before C by nickname)
 *
 *   What each viewer's task rows need (the snapshot is the state before the current period):
 *     B, T1: base 2 at 09-30, not checked, period 2026-10-02    B, T2: no base, not checked, period 2026-09-28
 *     C, T2: base 2 at 09-14, not checked, period 2026-09-28    C has no T1 entry (not enrolled)
 */
import { describe, expect, it } from "vitest";
import {
  applyDeltas,
  buildBoard,
  groupPeriodsByEnrolment,
  rankStandings,
  type StandingInput,
} from "@/lib/leaderboard-rules";
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

const row = (userId: string, nickname: string | null, total: number): StandingInput => ({ userId, nickname, total });

describe("rankStandings", () => {
  it("shares a position between equal totals and skips the next (5, 5, 3 -> 1, 1, 3)", () => {
    const ranked = rankStandings([row("u3", "Carol", 3), row("u2", "Bob", 5), row("u1", "Alice", 5)], "u1");
    expect(ranked.map((r) => [r.nickname, r.total, r.position])).toEqual([
      ["Alice", 5, 1],
      ["Bob", 5, 1],
      ["Carol", 3, 3],
    ]);
  });

  it("counts only strictly higher totals for the position (7, 5, 5, 5, 3 -> 1, 2, 2, 2, 5)", () => {
    const ranked = rankStandings(
      [row("u1", "Aa", 3), row("u2", "Bb", 5), row("u3", "Cc", 7), row("u4", "Dd", 5), row("u5", "Ee", 5)],
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
    const ranked = rankStandings([row("u2", "Bb", 0), row("u1", "Aa", 0)], "u1");
    expect(ranked.map((r) => r.position)).toEqual([1, 1]);
  });

  it("flags only the viewer's own row", () => {
    const ranked = rankStandings([row("u1", "Aa", 2), row("u2", "Bb", 1)], "u2");
    expect(ranked.map((r) => [r.userId, r.isYou])).toEqual([
      ["u1", false],
      ["u2", true],
    ]);
  });

  it("orders equal totals by nickname ignoring case, a missing nickname as 'Unknown member', then by user id", () => {
    const ranked = rankStandings(
      [row("u5", "Zed", 2), row("u4", "Bob", 2), row("u3", null, 2), row("u2", "alice", 2), row("u1", "bob", 2)],
      "u1",
    );
    // alice, then both bobs (the same nickname ignoring case: user id u1 before u4), then "unknown member", then Zed
    expect(ranked.map((r) => r.userId)).toEqual(["u2", "u1", "u4", "u3", "u5"]);
  });

  it("orders 'Kasia' and 'kasia' (two different nicknames) by user id, whatever the input order", () => {
    // Lower-cased, both are "kasia": only the user id tells them apart, so the capital letter decides nothing
    const upper = row("u2", "Kasia", 3);
    const lower = row("u1", "kasia", 3);
    expect(rankStandings([upper, lower], "u1").map((r) => [r.userId, r.nickname, r.position])).toEqual([
      ["u1", "kasia", 1],
      ["u2", "Kasia", 1],
    ]);
    expect(rankStandings([lower, upper], "u1").map((r) => r.userId)).toEqual(["u1", "u2"]);
  });

  it("sorts a missing nickname exactly where 'Unknown member' would sort", () => {
    // "unknown member" lower-cased: after "Unknowm" ('m' < 'n' at the sixth letter), before "Unknown members"
    const ranked = rankStandings([row("u1", "Unknown members", 1), row("u2", null, 1), row("u3", "Unknowm", 1)], "u1");
    expect(ranked.map((r) => [r.userId, r.nickname])).toEqual([
      ["u3", "Unknowm"],
      ["u2", null],
      ["u1", "Unknown members"],
    ]);
  });

  it("orders two members without a nickname by user id, whatever the input order", () => {
    // Both sort as "Unknown member", so the user id is the last resort (the rankStandings comment): u1 before u2
    // from either input order, never the order the rows happened to arrive in
    const u1 = row("u1", null, 4);
    const u2 = row("u2", null, 4);
    expect(rankStandings([u1, u2], "u1").map((r) => [r.userId, r.position])).toEqual([
      ["u1", 1],
      ["u2", 1],
    ]);
    expect(rankStandings([u2, u1], "u1").map((r) => [r.userId, r.position])).toEqual([
      ["u1", 1],
      ["u2", 1],
    ]);
  });

  it("orders by code units, not by locale, and folds case downwards", () => {
    // '2' (0x32) sorts before '_' (0x5F); localeCompare puts punctuation before digits, so it says the opposite
    const byCodeUnit = rankStandings([row("u1", "Kasia_", 1), row("u2", "Kasia2", 1)], "u1");
    expect(byCodeUnit.map((r) => r.userId)).toEqual(["u2", "u1"]);
    // The plan leaves the fold direction open; the implementation lower-cases, so '_' (0x5F) sorts before 'n' (0x6E)
    // (upper-cased, 'N' (0x4E) would sort before '_')
    const byFold = rankStandings([row("u1", "Johnny", 1), row("u2", "John_Smith", 1)], "u1");
    expect(byFold.map((r) => r.userId)).toEqual(["u2", "u1"]);
  });

  it("does not change its input", () => {
    const input = [row("u2", "Bb", 1), row("u1", "Aa", 2)];
    const copy = structuredClone(input);
    rankStandings(input, "u1");
    expect(input).toEqual(copy);
  });
});

describe("buildBoard", () => {
  const NOW = new Date("2026-10-02T10:00:00Z"); // Friday 12:00 in Warsaw: daily period 2026-10-02, week of 2026-09-28
  const members = [
    { user_id: "user-a", nickname: "Alice" },
    { user_id: "user-b", nickname: "Bob" },
    { user_id: "user-c", nickname: "Carol" },
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
      { userId: "user-a", nickname: "Alice", total: 8 },
      { userId: "user-b", nickname: "Bob", total: 1 },
      { userId: "user-c", nickname: "Carol", total: 1 },
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
      members: [...members, { user_id: "user-d", nickname: null }],
      tasks,
      participantsByTask,
      periodsByEnrolment,
      viewerId: "user-a",
      now: NOW,
    });
    expect(board.totals.at(-1)).toEqual({ userId: "user-d", nickname: null, total: 0 });
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
      members: [{ user_id: "user-a", nickname: "Alice" }],
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
    expect(board.totals).toEqual([{ userId: "user-a", nickname: "Alice", total: 2 }]);
  });

  it("scales linearly with the stored periods (scale guard)", () => {
    const MS_PER_DAY = 86_400_000;
    const today = Date.UTC(2026, 9, 2) / MS_PER_DAY; // 2026-10-02
    const scaleMembers = Array.from({ length: 5 }, (_, i) => ({ user_id: `user-${i}`, nickname: `User ${i}` }));
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

/**
 * Optimistic totals (S-04, Phase 5): the Leaderboard island shows `server total + net delta` and ranks that, so a tap
 * re-ranks the board at once. The delta is correct when it ranks exactly like totals recomputed from the full history.
 *
 * World: one daily task, all three members take part, now = 2026-10-02T10:00:00Z = Friday in Warsaw, so the open
 * period is 2026-10-02 (not missed). Hand-derived values:
 *   A checked 09-30 and 10-01 -> 2     B checked 10-01 -> 1     C checked nothing -> 0
 *   positions: A 1, B 2, C 3
 *   C ticks today: 0 -> 1                       -> A 2, B 1, C 1 -> positions 1, 2, 2 (B and C share, bob before carol)
 *   B ticks today: 10-01 and 10-02 = 2          -> A 2, B 2, C 0 -> positions 1, 1, 3 (alice before bob)
 *   A had ticked today (3) and undoes: 3 -> 2   -> the starting world again
 */
describe("applyDeltas", () => {
  const NOW = new Date("2026-10-02T10:00:00Z");
  const members = [
    { user_id: "user-a", nickname: "Alice" },
    { user_id: "user-b", nickname: "Bob" },
    { user_id: "user-c", nickname: "Carol" },
  ];
  const START = { "user-a": ["2026-09-30", "2026-10-01"], "user-b": ["2026-10-01"], "user-c": [] as string[] };
  const totalsFor = (periods: Record<string, string[]>): StandingInput[] =>
    buildBoard({
      members,
      tasks: [{ id: "t1", recurrence: "daily" }],
      participantsByTask: new Map([["t1", ["user-a", "user-b", "user-c"]]]),
      periodsByEnrolment: groupPeriodsByEnrolment(
        Object.entries(periods).map(([user_id, userPeriods]) => ({ task_id: "t1", user_id, periods: userPeriods })),
      ),
      viewerId: "user-a",
      now: NOW,
    }).totals;
  const positions = (rows: StandingInput[], viewerId: string) =>
    rankStandings(rows, viewerId).map((r) => [r.userId, r.total, r.position]);

  it("ranks a base total plus the viewer's delta like totals recomputed from the full history", () => {
    const base = totalsFor(START);
    expect(positions(base, "user-c")).toEqual([
      ["user-a", 2, 1],
      ["user-b", 1, 2],
      ["user-c", 0, 3],
    ]);

    const cTicks = applyDeltas(base, new Map([["user-c", 1]]));
    expect(positions(cTicks, "user-c")).toEqual([
      ["user-a", 2, 1],
      ["user-b", 1, 2],
      ["user-c", 1, 2],
    ]);
    expect(positions(cTicks, "user-c")).toEqual(positions(totalsFor({ ...START, "user-c": ["2026-10-02"] }), "user-c"));

    const bTicks = applyDeltas(base, new Map([["user-b", 1]]));
    expect(positions(bTicks, "user-b")).toEqual([
      ["user-a", 2, 1],
      ["user-b", 2, 1],
      ["user-c", 0, 3],
    ]);
    expect(positions(bTicks, "user-b")).toEqual(
      positions(totalsFor({ ...START, "user-b": ["2026-10-01", "2026-10-02"] }), "user-b"),
    );
  });

  it("returns to the starting ranking when a tick is rolled back or undone", () => {
    const base = totalsFor(START);
    // A rollback publishes the opposite delta, so the net is 0 (the store keeps the zero entry)
    expect(applyDeltas(base, new Map([["user-c", 0]]))).toEqual(base);

    // A had already ticked today (3); undoing it is -1 and equals the world without that tick
    const aHadTicked = totalsFor({ ...START, "user-a": ["2026-09-30", "2026-10-01", "2026-10-02"] });
    expect(aHadTicked.find((r) => r.userId === "user-a")?.total).toBe(3);
    expect(applyDeltas(aHadTicked, new Map([["user-a", -1]]))).toEqual(base);
  });

  it("changes only the listed user's total, ignores users who are not listed and does not change its input", () => {
    const base = totalsFor(START);
    const copy = structuredClone(base);

    // B ticks (1 -> 2); "nobody" is not a member, so that entry must not appear anywhere
    const result = applyDeltas(
      base,
      new Map([
        ["user-b", 1],
        ["nobody", 5],
      ]),
    );

    expect(Object.fromEntries(result.map((row) => [row.userId, row.total]))).toEqual({
      "user-a": 2,
      "user-b": 2,
      "user-c": 0,
    });
    expect(result).toHaveLength(base.length);
    expect(applyDeltas(base, new Map())).toEqual(base);
    expect(base).toEqual(copy);
  });
});
