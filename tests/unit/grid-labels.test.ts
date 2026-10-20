/**
 * The check-off grid's text (S-20): the visible column header is short lines that fit a 28 px (daily) or 48 px (weekly,
 * once) column; the screen-reader labels smoke and e2e bind stay as they are. Period keys are Warsaw calendar dates.
 * 2026-10-05 is a Monday, so 2026-10-05..11 run Mo..Su.
 */
import { describe, expect, it } from "vitest";
import { cellLabel, cellLabelPrefix, currentPeriodWord, periodHeader, periodName } from "@/lib/grid-labels";

describe("periodHeader", () => {
  it("gives a daily header as the weekday over the day number, for every weekday", () => {
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
    expect(week.map((key) => periodHeader("daily", key))).toEqual([
      ["Mo", "5"],
      ["Tu", "6"],
      ["We", "7"],
      ["Th", "8"],
      ["Fr", "9"],
      ["Sa", "10"],
      ["Su", "11"],
    ]);
  });

  it("writes a one-digit day without a leading zero and a two-digit day whole", () => {
    expect(periodHeader("daily", "2026-10-05")).toEqual(["Mo", "5"]);
    expect(periodHeader("daily", "2026-10-30")).toEqual(["Fr", "30"]);
  });

  it("follows the calendar over a month and a year boundary", () => {
    expect(periodHeader("daily", "2026-09-30")).toEqual(["We", "30"]);
    expect(periodHeader("daily", "2026-10-01")).toEqual(["Th", "1"]);
    expect(periodHeader("daily", "2026-12-31")).toEqual(["Th", "31"]);
    expect(periodHeader("daily", "2027-01-01")).toEqual(["Fr", "1"]);
  });

  it("gives a weekly header as the first day of the week on one line", () => {
    expect(periodHeader("weekly", "2026-09-14")).toEqual(["14 Sep"]);
    expect(periodHeader("weekly", "2026-10-05")).toEqual(["5 Oct"]);
    expect(periodHeader("weekly", "2026-12-28")).toEqual(["28 Dec"]);
    expect(periodHeader("weekly", "2027-01-04")).toEqual(["4 Jan"]);
  });

  it("gives a once header as the word Done, whatever the key", () => {
    expect(periodHeader("once", "2026-10-05")).toEqual(["Done"]);
    expect(periodHeader("once", "once")).toEqual(["Done"]);
  });

  it("keeps every line inside the width budget of its column, on every day of a year", () => {
    const days = Array.from({ length: 366 }, (_, index) => new Date(Date.UTC(2028, 0, 1 + index)));
    for (const date of days) {
      const key = date.toISOString().slice(0, 10);
      const daily = periodHeader("daily", key);
      expect(daily).toHaveLength(2);
      for (const line of daily) expect(line.length).toBeLessThanOrEqual(2);
      const weekly = periodHeader("weekly", key);
      expect(weekly).toHaveLength(1);
      expect(weekly[0].length).toBeLessThanOrEqual(6);
    }
  });
});

describe("currentPeriodWord", () => {
  it("names the current period for a daily and a weekly task and none for a once task", () => {
    expect(currentPeriodWord("daily")).toBe("today");
    expect(currentPeriodWord("weekly")).toBe("this week");
    expect(currentPeriodWord("once")).toBeNull();
  });
});

describe("the screen-reader labels do not change with the header", () => {
  it("names a daily and a weekly period in full and a once task by no period", () => {
    expect(periodName("daily", "2026-10-05")).toBe("Mon 5 Oct");
    expect(periodName("daily", "2026-10-11")).toBe("Sun 11 Oct");
    expect(periodName("weekly", "2026-09-14")).toBe("week from 14 Sep");
    expect(periodName("once", "2026-10-05")).toBeNull();
  });

  it("builds the cell label as name, period and state", () => {
    expect(cellLabel(cellLabelPrefix("Kasia", "daily", "2026-10-05"), "done")).toBe("Kasia, Mon 5 Oct: done");
    expect(cellLabel(cellLabelPrefix("Kasia", "weekly", "2026-10-05"), "missed")).toBe(
      "Kasia, week from 5 Oct: missed",
    );
    expect(cellLabel(cellLabelPrefix("Kasia", "once", "2026-10-05"), "open")).toBe("Kasia: open");
    expect(cellLabel("Kasia, Mon 5 Oct", "notJoined")).toBe("Kasia, Mon 5 Oct: not joined");
  });
});
