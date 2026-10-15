import { describe, expect, it } from "vitest";
import {
  MAX_TASK_TITLE_LENGTH,
  RECURRENCE_LABELS,
  TASK_RECURRENCES,
  groupParticipantsByTask,
  normalizeRecurrence,
  normalizeTaskTitle,
} from "@/lib/task-rules";

describe("RECURRENCE_LABELS", () => {
  it("labels each recurrence kind of the add-task select with its capitalised name", () => {
    // The select posts once/daily/weekly (README, Task routes) and shows each kind as a capitalised word
    expect(TASK_RECURRENCES).toEqual(["once", "daily", "weekly"]);
    expect(RECURRENCE_LABELS).toEqual({ once: "Once", daily: "Daily", weekly: "Weekly" });
  });
});

describe("normalizeTaskTitle", () => {
  it("returns the trimmed title", () => {
    expect(normalizeTaskTitle("  \tWater plants \r\n")).toBe("Water plants");
  });

  it("rejects non-strings, empty and whitespace-only input", () => {
    for (const input of [undefined, null, 42, {}, "", "   ", " \t\r\n "]) {
      expect(normalizeTaskTitle(input)).toBeNull();
    }
  });

  it("accepts 80 code points and rejects 81", () => {
    expect(MAX_TASK_TITLE_LENGTH).toBe(80);
    expect(normalizeTaskTitle("a".repeat(80))).toBe("a".repeat(80));
    expect(normalizeTaskTitle("a".repeat(81))).toBeNull();
  });

  it("counts code points, not UTF-16 units", () => {
    expect(normalizeTaskTitle("😀".repeat(80))).toBe("😀".repeat(80));
    expect(normalizeTaskTitle("😀".repeat(81))).toBeNull();
  });

  it("does not trim NBSP", () => {
    expect(normalizeTaskTitle(" ")).toBe(" ");
  });
});

describe("normalizeRecurrence", () => {
  it("accepts exactly once, daily and weekly", () => {
    for (const kind of ["once", "daily", "weekly"]) {
      expect(normalizeRecurrence(kind)).toBe(kind);
    }
  });

  it("rejects other casing, empty, unknown and non-string input", () => {
    for (const input of ["Daily", "WEEKLY", " once", "", "monthly", undefined, null, 1]) {
      expect(normalizeRecurrence(input)).toBeNull();
    }
  });
});

describe("groupParticipantsByTask", () => {
  it("returns an empty map for no rows", () => {
    expect(groupParticipantsByTask([]).size).toBe(0);
  });

  it("groups users under their task", () => {
    const map = groupParticipantsByTask([
      { task_id: "t1", user_id: "u1" },
      { task_id: "t2", user_id: "u2" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("t1")).toEqual(["u1"]);
    expect(map.get("t2")).toEqual(["u2"]);
    expect(map.get("t3")).toBeUndefined();
  });

  it("collects several users per task", () => {
    const map = groupParticipantsByTask([
      { task_id: "t1", user_id: "u1" },
      { task_id: "t1", user_id: "u2" },
      { task_id: "t1", user_id: "u3" },
    ]);
    expect(map.get("t1")).toEqual(["u1", "u2", "u3"]);
  });

  it("preserves row order within each task, interleaved with other tasks", () => {
    const map = groupParticipantsByTask([
      { task_id: "t1", user_id: "u3" },
      { task_id: "t2", user_id: "u9" },
      { task_id: "t1", user_id: "u1" },
      { task_id: "t2", user_id: "u5" },
      { task_id: "t1", user_id: "u2" },
    ]);
    expect(map.get("t1")).toEqual(["u3", "u1", "u2"]);
    expect(map.get("t2")).toEqual(["u9", "u5"]);
  });
});
