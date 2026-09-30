import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_TASK_TITLE_LENGTH, TASK_RECURRENCES, normalizeRecurrence, normalizeTaskTitle } from "@/lib/task-rules";

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

  it("matches the values allowed by the database CHECK", () => {
    const dir = "supabase/migrations";
    const file = readdirSync(dir).find((name) => name.endsWith("_create_tasks.sql"));
    expect(file).toBeDefined();
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    const check = /tasks_recurrence_allowed[\s\S]*?check\s*\(([^;]*?)\)\s*[,;)]/i.exec(sql);
    expect(check).not.toBeNull();
    const values = [...(check?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect([...values].sort()).toEqual([...TASK_RECURRENCES].sort());
  });
});
