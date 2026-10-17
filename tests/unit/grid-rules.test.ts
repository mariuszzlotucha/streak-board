/**
 * Oracle for the check-off grid (S-13). Expected cells are derived by hand from the plan's rules
 * (context/changes/checkoff-grid/plan.md, Phase 1): done beats notJoined; the current period without a key is open; a
 * closed period before the Warsaw period of `joined_at` without a key is notJoined; any other closed period is missed;
 * keys after the current period are ignored. Warsaw is UTC+2 until 2026-10-25 03:00 CEST, then UTC+1; 2026-10-01 is a
 * Thursday, so 2026-10-12 and 2026-10-26 are Mondays.
 */
import { describe, expect, it } from "vitest";
import { buildGrids, GRID_HORIZON, type GridParticipation, type TaskGrid } from "@/lib/grid-rules";
import type { TaskRecurrence } from "@/lib/task-rules";

const ALICE = "user-alice";
const BOB = "user-bob";
const GONE = "user-gone";

function gridOf(
  recurrence: TaskRecurrence,
  now: string,
  participations: readonly GridParticipation[],
  periods: Record<string, readonly string[]> = {},
  viewerId = ALICE,
): TaskGrid {
  const grids = buildGrids({
    members: [
      { user_id: ALICE, nickname: "Alice" },
      { user_id: BOB, nickname: null },
    ],
    tasks: [{ id: "t1", recurrence }],
    participations: new Map([["t1", participations]]),
    periodsByEnrolment: new Map([["t1", new Map(Object.entries(periods))]]),
    viewerId,
    now: new Date(now),
  });
  const grid = grids.get("t1");
  if (!grid) throw new Error("no grid");
  return grid;
}

const EARLY = "2026-01-01T12:00:00Z";

describe("GRID_HORIZON", () => {
  it("shows 7 days and 4 weeks", () => {
    expect(GRID_HORIZON).toEqual({ daily: 7, weekly: 4 });
  });
});

describe("buildGrids, daily", () => {
  it("ends at the Warsaw day: 22:30Z in CEST is 00:30 of the next day, 21:30Z is still the same day", () => {
    const before = gridOf("daily", "2026-10-14T21:30:00Z", [{ userId: ALICE, joinedAt: EARLY }]);
    expect(before.periods).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]);
    const after = gridOf("daily", "2026-10-14T22:30:00Z", [{ userId: ALICE, joinedAt: EARLY }]);
    expect(after.periods.at(-1)).toBe("2026-10-15");
    expect(after.periods[0]).toBe("2026-10-09");
  });

  it("covers the DST change week as seven ordinary days", () => {
    const grid = gridOf("daily", "2026-10-27T10:00:00Z", [{ userId: ALICE, joinedAt: EARLY }], {
      [ALICE]: ["2026-10-25", "2026-10-26"],
    });
    expect(grid.periods).toEqual([
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
    expect(grid.rows[0].cells).toEqual(["missed", "missed", "missed", "missed", "done", "done", "open"]);
  });

  it("marks done, missed and open, collapses repeated keys and ignores a future key", () => {
    const grid = gridOf("daily", "2026-10-14T10:00:00Z", [{ userId: ALICE, joinedAt: EARLY }], {
      [ALICE]: ["2026-10-08", "2026-10-08", "2026-10-10", "2026-10-15"],
    });
    expect(grid.rows[0].cells).toEqual(["done", "missed", "done", "missed", "missed", "missed", "open"]);
  });

  it("shows the current day done when it has a key", () => {
    const grid = gridOf("daily", "2026-10-14T10:00:00Z", [{ userId: ALICE, joinedAt: EARLY }], {
      [ALICE]: ["2026-10-14"],
    });
    expect(grid.rows[0].cells.at(-1)).toBe("done");
  });

  it("marks days before the Warsaw join day notJoined, the join day itself missed, and a pre-join key done", () => {
    // 2026-10-10T22:30Z is 00:30 on 2026-10-11 in Warsaw, so the join day is 10-11, not the UTC date 10-10.
    const grid = gridOf("daily", "2026-10-14T10:00:00Z", [{ userId: ALICE, joinedAt: "2026-10-10T22:30:00Z" }], {
      [ALICE]: ["2026-10-09"],
    });
    expect(grid.rows[0].cells).toEqual(["notJoined", "done", "notJoined", "missed", "missed", "missed", "open"]);
  });

  it("shows the join day open when the participant joined today", () => {
    const grid = gridOf("daily", "2026-10-14T10:00:00Z", [{ userId: ALICE, joinedAt: "2026-10-14T08:00:00Z" }]);
    expect(grid.rows[0].cells).toEqual([
      "notJoined",
      "notJoined",
      "notJoined",
      "notJoined",
      "notJoined",
      "notJoined",
      "open",
    ]);
  });
});

describe("buildGrids, weekly", () => {
  it("lists 4 Mondays and counts a Wednesday key for its week", () => {
    const grid = gridOf("weekly", "2026-10-14T10:00:00Z", [{ userId: ALICE, joinedAt: EARLY }], {
      [ALICE]: ["2026-09-23", "2026-10-07", "2026-10-21"],
    });
    expect(grid.periods).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(grid.rows[0].cells).toEqual(["done", "missed", "done", "open"]);
  });

  it("uses the Warsaw week of joined_at: Sunday 22:30Z in CEST is Monday 00:30", () => {
    // 2026-10-04T22:30Z is Mon 2026-10-05 00:30 Warsaw, so the join week is 10-05.
    const grid = gridOf("weekly", "2026-10-14T10:00:00Z", [{ userId: ALICE, joinedAt: "2026-10-04T22:30:00Z" }]);
    expect(grid.rows[0].cells).toEqual(["notJoined", "notJoined", "missed", "open"]);
    const earlier = gridOf("weekly", "2026-10-14T10:00:00Z", [{ userId: ALICE, joinedAt: "2026-10-04T21:30:00Z" }]);
    expect(earlier.rows[0].cells).toEqual(["notJoined", "missed", "missed", "open"]);
  });
});

describe("buildGrids, once", () => {
  it("has one period, done when any key exists and open otherwise", () => {
    const grid = gridOf(
      "once",
      "2026-10-14T10:00:00Z",
      [
        { userId: ALICE, joinedAt: "2026-10-14T08:00:00Z" },
        { userId: BOB, joinedAt: EARLY },
      ],
      { [ALICE]: ["2026-09-01"] },
    );
    expect(grid.periods).toEqual(["2026-10-14"]);
    expect(grid.rows.map((row) => row.cells)).toEqual([["done"], ["open"]]);
  });
});

describe("buildGrids, rows", () => {
  it("keeps participation order, skips a non-member and flags the viewer", () => {
    const grid = gridOf(
      "daily",
      "2026-10-14T10:00:00Z",
      [
        { userId: BOB, joinedAt: EARLY },
        { userId: GONE, joinedAt: EARLY },
        { userId: ALICE, joinedAt: EARLY },
      ],
      {},
      BOB,
    );
    expect(grid.rows.map(({ userId, nickname, isYou }) => ({ userId, nickname, isYou }))).toEqual([
      { userId: BOB, nickname: null, isYou: true },
      { userId: ALICE, nickname: "Alice", isYou: false },
    ]);
  });

  it("gives a task without participations or enrolments an empty row list and still its periods", () => {
    const grids = buildGrids({
      members: [{ user_id: ALICE, nickname: "Alice" }],
      tasks: [
        { id: "t1", recurrence: "weekly" },
        { id: "t2", recurrence: "daily" },
      ],
      participations: new Map([["t2", [{ userId: ALICE, joinedAt: EARLY }]]]),
      periodsByEnrolment: new Map(),
      viewerId: ALICE,
      now: new Date("2026-10-14T10:00:00Z"),
    });
    expect(grids.get("t1")).toEqual({
      periods: ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"],
      rows: [],
    });
    expect(grids.get("t2")?.rows[0].cells).toEqual([
      "missed",
      "missed",
      "missed",
      "missed",
      "missed",
      "missed",
      "open",
    ]);
  });
});
