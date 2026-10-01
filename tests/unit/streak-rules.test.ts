/**
 * Oracle for the period and streak rules (S-04, FR-008/FR-009, test-plan risk #4).
 *
 * Every expected value in this file is derived by hand from the two sources below and written here before the
 * implementation existed. None of it comes from running the code (oracle problem), so a wrong rule cannot make its
 * own tests pass.
 *
 * PRD, prd.md:97: for every day/period in which the user does the assigned task, the streak of that task grows by
 * one; for every missed day/period it falls by less than its full state (it does not reset completely); the sum of
 * a user's streaks decides the position in the group's leaderboard.
 *
 * Beyond the PRD: it only says that a miss costs "less than the full state". The plan fixes the numbers (halve, round
 * down), so a streak of 1 falls to 0 after one miss while a streak of 2 or more never resets in one miss. The rows
 * that rely on this are decayStreak(1, 1) = 0, "checked only yesterday, shown the day after today" and every "two
 * misses" row.
 *
 * Plan decisions (context/changes/checkoff-and-leaderboard/plan.md, "Decisions fixed by the planning interview"):
 *   - a day is the calendar date in Europe/Warsaw, so the 23-hour and 25-hour DST days are ordinary days; a week runs
 *     from Monday and is keyed by the date of its Monday
 *   - a period is open while it is the current one and closed afterwards; only a closed period without a check-off
 *     is missed
 *   - over the checked periods in order, value = decay(value, missed) + 1, where decay(v, m) = floor(v / 2^m)
 *   - `once`: 1 when any check-off exists, otherwise 0; it never decays
 *
 * Oracle table. Warsaw is UTC+2 (CEST) from the last Sunday of March and UTC+1 (CET) from the last Sunday of
 * October; 2026-10-01 is a Thursday.
 *
 *   Day boundary     2026-10-01T21:59:59Z = 23:59:59 CEST -> day 2026-10-01; 22:00:00Z = 00:00:00 CEST -> 2026-10-02
 *                    2026-01-14T22:59:59Z = 23:59:59 CET  -> day 2026-01-14; 23:00:00Z = 00:00:00 CET  -> 2026-01-15
 *   23-hour day      2026-03-29 runs from 2026-03-28T23:00:00Z to 2026-03-29T21:59:59Z; 22:00:00Z is 2026-03-30
 *   25-hour day      2026-10-25 runs from 2026-10-24T22:00:00Z to 2026-10-25T22:59:59Z; 23:00:00Z is 2026-10-26
 *   Week boundary    Sun 2026-10-04 23:30 Warsaw (21:30Z) -> week of Mon 2026-09-28
 *                    Mon 2026-10-05 00:30 Warsaw (22:30Z, the UTC date is still Sunday) -> week of Mon 2026-10-05
 *   Year boundary    Thu 2026-12-31 and Sun 2027-01-03 -> week of Mon 2026-12-28; Mon 2027-01-04 -> itself
 *   Days between     calendar days between two dates, DST days included: 03-28 -> 03-30 is 2, 10-24 -> 10-26 is 2,
 *                    12-31 -> 01-02 is 2, 2028-02-28 -> 03-01 is 2 (a leap year); weekly: days / 7, 14 days is 2 weeks
 *   Decay            floor(6/2) = 3, floor(6/4) = 1, floor(1/2) = 0, floor(30/16) = 1, floor(30/32) = 0;
 *                    no missed period keeps the value, 0 stays 0
 *                    large values: (2^53 - 1) / 2^52 is just under 2 -> 1; (2^53 - 1) / 2^53 is just under 1 -> 0
 *   Daily streak     checked Mon 09-28, Tue 09-29, Wed 09-30 (values 1, 2, 3), shown on
 *                      Wed 3 | Thu 3 (Thursday is still open) | Fri floor(3/2) = 1 | Sat floor(3/4) = 0
 *                    checked Mon-Thu (4), Fri missed, Sat checked: floor(4/2) + 1 = 3
 *   Weekly streak    checked in the weeks of Mon 09-14, 09-21, 09-28 (values 1, 2, 3), shown in
 *                      week 09-28 3 | open week 10-05 3 | week 10-12 floor(3/2) = 1 | week 10-19 floor(3/4) = 0
 *   Snapshot         base = the value right after the last checked period before the current one, and whether the
 *                    current period is checked: Mon-Wed shown on Wed is { base 2 at Tue 09-29, checked }, shown on
 *                    Thu { base 3 at Wed 09-30, not checked }
 *   With a tick      the decayed base plus 1, so the value without a tick plus 1: Mon-Wed shown on Fri is
 *                    floor(3/2) = 1 without and 2 with a tick; the optimistic table lists each history by hand
 *   once             0 without a check-off; 1 with one or several; it never decays
 */
import { describe, expect, it } from "vitest";
import { decayStreak, periodKeyFor, periodsBetween, snapshotOf, streakValue } from "@/lib/streak-rules";
import type { TaskRecurrence } from "@/lib/task-rules";

describe("periodKeyFor", () => {
  it.each([
    // Warsaw midnight in summer (CEST) and in winter (CET)
    ["2026-10-01T21:59:59Z", "2026-10-01"],
    ["2026-10-01T22:00:00Z", "2026-10-02"],
    ["2026-01-14T22:59:59Z", "2026-01-14"],
    ["2026-01-14T23:00:00Z", "2026-01-15"],
    // The 23-hour day: clocks go 02:00 -> 03:00 on 2026-03-29
    ["2026-03-28T22:59:59Z", "2026-03-28"],
    ["2026-03-28T23:00:00Z", "2026-03-29"],
    ["2026-03-29T21:59:59Z", "2026-03-29"],
    ["2026-03-29T22:00:00Z", "2026-03-30"],
    // The 25-hour day: clocks go 03:00 -> 02:00 on 2026-10-25
    ["2026-10-24T21:59:59Z", "2026-10-24"],
    ["2026-10-24T22:00:00Z", "2026-10-25"],
    ["2026-10-25T22:59:59Z", "2026-10-25"],
    ["2026-10-25T23:00:00Z", "2026-10-26"],
  ])("daily: %s is the Warsaw day %s", (instant, expected) => {
    expect(periodKeyFor("daily", new Date(instant))).toBe(expected);
  });

  it("uses the daily key for a once task", () => {
    expect(periodKeyFor("once", new Date("2026-10-01T22:00:00Z"))).toBe("2026-10-02");
  });

  it.each([
    ["2026-09-28T10:00:00Z", "2026-09-28"], // a Monday is its own week key
    ["2026-09-30T10:00:00Z", "2026-09-28"], // Wednesday
    ["2026-10-04T21:30:00Z", "2026-09-28"], // Sunday 23:30 Warsaw: still the old week
    ["2026-10-04T22:30:00Z", "2026-10-05"], // Monday 00:30 Warsaw, while the UTC date is still Sunday
    ["2026-12-31T12:00:00Z", "2026-12-28"], // the year boundary
    ["2027-01-03T12:00:00Z", "2026-12-28"],
    ["2027-01-04T12:00:00Z", "2027-01-04"],
    ["2026-03-29T21:59:59Z", "2026-03-23"], // Sunday of the DST week, 23:59:59 CEST
    ["2026-03-29T22:00:00Z", "2026-03-30"], // Monday 00:00 CEST
  ])("weekly: %s belongs to the week of Monday %s", (instant, expected) => {
    expect(periodKeyFor("weekly", new Date(instant))).toBe(expected);
  });
});

describe("periodsBetween", () => {
  it.each<[TaskRecurrence, string, string, number]>([
    ["daily", "2026-09-30", "2026-09-30", 0],
    ["daily", "2026-03-28", "2026-03-30", 2], // across the 23-hour day: calendar days, not 24-hour spans
    ["daily", "2026-10-24", "2026-10-26", 2], // across the 25-hour day
    ["daily", "2026-12-31", "2027-01-02", 2], // across the year boundary
    ["daily", "2028-02-28", "2028-03-01", 2], // 2028 has a February 29th
    ["weekly", "2026-09-28", "2026-09-28", 0],
    ["weekly", "2026-09-14", "2026-09-28", 2], // 14 days = 2 weeks
    ["weekly", "2026-12-28", "2027-01-11", 2], // across the year boundary
  ])("%s: from %s to %s is %d periods", (recurrence, from, to, expected) => {
    expect(periodsBetween(recurrence, from, to)).toBe(expected);
  });
});

describe("decayStreak", () => {
  it.each([
    [6, 1, 3], // floor(6 / 2)
    [6, 2, 1], // floor(6 / 4)
    [1, 1, 0], // floor(1 / 2): a streak of 1 does not survive a miss
    [30, 4, 1], // floor(30 / 16)
    [30, 5, 0], // floor(30 / 32)
    [5, 0, 5], // nothing missed keeps the value
    [0, 7, 0], // zero stays zero
    [Number.MAX_SAFE_INTEGER, 52, 1], // (2^53 - 1) / 2^52 = 1.99...
    [Number.MAX_SAFE_INTEGER, 53, 0], // (2^53 - 1) / 2^53 < 1
  ])("decayStreak(%d, %d) = %d", (value, missed, expected) => {
    expect(decayStreak(value, missed)).toBe(expected);
  });

  it("returns 0 for a huge number of missed periods without looping", () => {
    expect(decayStreak(5, Number.MAX_SAFE_INTEGER)).toBe(0);
  });
});

// The value a task shows on `current`, from its stored check-off keys: what the dashboard computes per enrolment.
const valueOn = (recurrence: TaskRecurrence, periods: readonly string[], current: string): number =>
  streakValue(recurrence, snapshotOf(recurrence, periods, current), current);

const MON_TO_WED = ["2026-09-28", "2026-09-29", "2026-09-30"];
const THREE_WEEKS = ["2026-09-14", "2026-09-21", "2026-09-28"]; // the Mondays of three consecutive weeks
const AUGUST_1_TO_10 = Array.from({ length: 10 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);

describe("streak value", () => {
  it.each<[string, readonly string[], string, number]>([
    ["checked Mon-Wed, shown on Wednesday", MON_TO_WED, "2026-09-30", 3],
    ["checked Mon-Wed, shown on Thursday: the open day is not missed", MON_TO_WED, "2026-10-01", 3],
    ["checked Mon-Wed, shown on Friday: Thursday was missed", MON_TO_WED, "2026-10-02", 1],
    ["checked Mon-Wed, shown on Saturday: two misses", MON_TO_WED, "2026-10-03", 0],
    [
      "checked Mon-Thu, Friday missed, Saturday checked",
      ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-03"],
      "2026-10-03",
      3,
    ],
    ["never checked", [], "2026-10-01", 0],
    ["checked only today", ["2026-10-01"], "2026-10-01", 1],
    ["checked only yesterday, shown today (open)", ["2026-09-30"], "2026-10-01", 1],
    ["checked only yesterday, shown the day after today", ["2026-09-30"], "2026-10-02", 0],
  ])("daily: %s", (_label, periods, current, expected) => {
    expect(valueOn("daily", periods, current)).toBe(expected);
  });

  it.each<[string, string, number]>([
    ["checked in weeks 1-3, shown in week 3", "2026-09-28", 3],
    ["shown in the open week 4", "2026-10-05", 3],
    ["shown in week 5: week 4 was missed", "2026-10-12", 1],
    ["shown in week 6: two misses", "2026-10-19", 0],
  ])("weekly: %s", (_label, current, expected) => {
    expect(valueOn("weekly", THREE_WEEKS, current)).toBe(expected);
  });

  it.each<[string, readonly string[], string, number]>([
    ["unchecked", [], "2026-10-01", 0],
    ["a check-off counts 1", ["2026-09-01"], "2026-10-01", 1],
    ["several rows still count 1", ["2026-09-01", "2026-09-02"], "2026-10-01", 1],
    ["and never decays", ["2026-09-01"], "2027-09-01", 1],
  ])("once: %s", (_label, periods, current, expected) => {
    expect(valueOn("once", periods, current)).toBe(expected);
  });

  describe("input hygiene", () => {
    it("gives the same result for unsorted and duplicate keys as for sorted unique ones", () => {
      const messy = [...MON_TO_WED].reverse().concat(MON_TO_WED);
      expect(snapshotOf("daily", messy, "2026-09-30")).toEqual(snapshotOf("daily", MON_TO_WED, "2026-09-30"));
      expect(valueOn("daily", messy, "2026-09-30")).toBe(3);
    });

    it("snaps weekly keys to their Monday", () => {
      // Wed of the week of 09-14, Tue of the week of 09-21 and Wed of the week of 09-28: three consecutive weeks
      expect(valueOn("weekly", ["2026-09-16", "2026-09-22", "2026-09-30"], "2026-09-28")).toBe(3);
    });

    it("gives the same result for unsorted weekly keys as for sorted ones", () => {
      const reversed = [...THREE_WEEKS].reverse();
      expect(snapshotOf("weekly", reversed, "2026-09-28")).toEqual(snapshotOf("weekly", THREE_WEEKS, "2026-09-28"));
      expect(valueOn("weekly", reversed, "2026-09-28")).toBe(3);
    });

    it("counts two keys of the same week once", () => {
      // Mon 09-21 and Wed 09-23 are one earlier week (1) and the checked current week 09-28 makes 2; counting both
      // earlier keys would give 3
      expect(valueOn("weekly", ["2026-09-21", "2026-09-23", "2026-09-28"], "2026-09-28")).toBe(2);
      // Two keys of the current week are one tick
      expect(valueOn("weekly", ["2026-09-28", "2026-09-30"], "2026-09-28")).toBe(1);
    });

    it("ignores keys after the current period until their period arrives", () => {
      const withFuture = [...MON_TO_WED, "2026-10-05"];
      // Thursday is open and unchecked, so the streak of 3 is not decayed yet and the future key adds nothing
      expect(valueOn("daily", withFuture, "2026-10-01")).toBe(3);
      expect(valueOn("daily", withFuture, "2026-09-30")).toBe(3);
      // On 10-05 the key is current: 3 decays over the four missed days 10-01..10-04 (floor(3 / 16) = 0), then +1
      expect(valueOn("daily", withFuture, "2026-10-05")).toBe(1);
      // The same for weeks: the week of 10-05 is open and unchecked, and the key of the week of 10-12 waits for it
      expect(valueOn("weekly", [...THREE_WEEKS, "2026-10-12"], "2026-10-05")).toBe(3);
    });

    it("does not change its input", () => {
      // A frozen array throws on an in-place sort or splice
      const unsorted = Object.freeze(["2026-09-30", "2026-09-29", "2026-09-29", "2026-09-28"]);
      expect(snapshotOf("daily", unsorted, "2026-09-30")).toEqual({
        base: { value: 2, period: "2026-09-29" },
        checked: true,
      });
    });
  });
});

describe("snapshotOf", () => {
  it.each<[string, TaskRecurrence, readonly string[], string, ReturnType<typeof snapshotOf>]>([
    [
      "is the state after the last closed checked period when today is checked",
      "daily",
      MON_TO_WED,
      "2026-09-30",
      { base: { value: 2, period: "2026-09-29" }, checked: true },
    ],
    [
      "keeps the last checked period as the base while today is open",
      "daily",
      MON_TO_WED,
      "2026-10-01",
      { base: { value: 3, period: "2026-09-30" }, checked: false },
    ],
    ["has no base without history", "daily", [], "2026-10-01", { base: null, checked: false }],
    [
      "uses the Monday of a stored weekly key as the base period",
      "weekly",
      ["2026-09-16"],
      "2026-09-28",
      { base: { value: 1, period: "2026-09-14" }, checked: false },
    ],
    [
      "is checked without a base for a once task with a check-off",
      "once",
      ["2026-09-01"],
      "2026-10-01",
      { base: null, checked: true },
    ],
    [
      "is unchecked without a base for a once task without one",
      "once",
      [],
      "2026-10-01",
      { base: null, checked: false },
    ],
  ])("%s", (_label, recurrence, periods, current, expected) => {
    expect(snapshotOf(recurrence, periods, current)).toEqual(expected);
  });
});

describe("optimistic preview", () => {
  // The island previews a tick or an undo with streakValue(..., checked) on the snapshot the server rendered. The
  // preview must equal the value the server computes after the change, so these rows are the full-history answers
  // without and with the current period, derived by hand.
  it.each<[string, TaskRecurrence, readonly string[], string, number, number]>([
    ["daily, nothing yet", "daily", [], "2026-10-01", 0, 1],
    ["daily, Mon-Wed checked, Thursday open", "daily", MON_TO_WED, "2026-10-01", 3, 4],
    ["daily, Mon-Wed checked, one miss", "daily", MON_TO_WED, "2026-10-02", 1, 2], // floor(3/2), floor(3/2) + 1
    ["daily, Mon-Wed checked, two misses", "daily", MON_TO_WED, "2026-10-03", 0, 1], // floor(3/4), floor(3/4) + 1
    [
      "daily, Mon-Thu checked, Friday missed, Saturday",
      "daily",
      ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"],
      "2026-10-03",
      2, // floor(4/2)
      3,
    ],
    [
      "daily, ten days in August, long gap",
      "daily",
      AUGUST_1_TO_10,
      "2026-10-01", // 52 days after 08-10: 51 misses, floor(10 / 2^51) = 0
      0,
      1,
    ],
    ["weekly, open week", "weekly", THREE_WEEKS, "2026-10-05", 3, 4],
    ["weekly, one miss", "weekly", THREE_WEEKS, "2026-10-12", 1, 2],
    ["weekly, two misses", "weekly", THREE_WEEKS, "2026-10-19", 0, 1],
    [
      "weekly, a gap inside the history",
      "weekly",
      // Four weeks in a row (4), the week of 08-31 missed (floor(4/2) = 2), then 09-07 checked (3)
      ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-09-07"],
      "2026-09-14",
      3,
      4,
    ],
  ])("%s", (_label, recurrence, before, current, without, withTick) => {
    const unchecked = snapshotOf(recurrence, before, current);
    const checked = snapshotOf(recurrence, [...before, current], current);
    // The base does not depend on whether the current period is ticked, so both snapshots preview alike
    for (const snapshot of [unchecked, checked]) {
      expect(streakValue(recurrence, snapshot, current, false)).toBe(without);
      expect(streakValue(recurrence, snapshot, current, true)).toBe(withTick);
    }
    // Without an override the snapshot shows its own state
    expect(streakValue(recurrence, unchecked, current)).toBe(without);
    expect(streakValue(recurrence, checked, current)).toBe(withTick);
  });

  it("previews a once task as 1 with a tick and 0 without, whatever its history", () => {
    for (const history of [[], ["2026-09-01"], ["2026-09-01", "2026-09-02"]]) {
      const snapshot = snapshotOf("once", history, "2026-10-01");
      expect(streakValue("once", snapshot, "2026-10-01", true)).toBe(1);
      expect(streakValue("once", snapshot, "2026-10-01", false)).toBe(0);
    }
  });

  it("agrees with a period-by-period simulation of the rule on generated histories", () => {
    const MS_PER_DAY = 86_400_000;
    const dayOf = (key: string): number =>
      Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / MS_PER_DAY;
    const keyOf = (day: number): string => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
    const mondayOf = (day: number): number => day - ((day + 3) % 7); // 1970-01-01 was a Thursday

    // A second, deliberately naive implementation straight from the rule text: walk every period from the first
    // check-off to the current one; a checked period adds 1, a closed unchecked period halves, the open one is left.
    const simulate = (recurrence: "daily" | "weekly", keys: readonly string[], current: string): number => {
      const checkedDays = new Set(keys.map((key) => (recurrence === "weekly" ? mondayOf(dayOf(key)) : dayOf(key))));
      const currentDay = dayOf(current);
      let value = 0;
      for (let day = Math.min(currentDay, ...checkedDays); day <= currentDay; day += recurrence === "weekly" ? 7 : 1) {
        if (checkedDays.has(day)) value += 1;
        else if (day < currentDay) value = Math.floor(value / 2);
      }
      return value;
    };

    let seed = 20261001;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const start = dayOf("2026-06-01");

    for (let run = 0; run < 2000; run++) {
      const recurrence = random() < 0.5 ? "daily" : "weekly";
      const density = recurrence === "daily" ? 0.55 : 0.12; // weekly keys are any day of the week, snapped to Monday
      const keys: string[] = [];
      for (let offset = 0; offset < 60; offset++) {
        if (random() < density) keys.push(keyOf(start + offset));
      }
      const currentDay = start + Math.floor(random() * 100);
      const current = keyOf(recurrence === "weekly" ? mondayOf(currentDay) : currentDay);
      const periodOf = (key: string): number => (recurrence === "weekly" ? mondayOf(dayOf(key)) : dayOf(key));
      const withoutCurrent = keys.filter((key) => periodOf(key) !== dayOf(current));
      const context = `${recurrence} ${current} [${keys.join(",")}]`;

      const snapshot = snapshotOf(recurrence, keys, current);
      expect(streakValue(recurrence, snapshot, current), `shown: ${context}`).toBe(simulate(recurrence, keys, current));
      const untick = streakValue(recurrence, snapshot, current, false);
      const tick = streakValue(recurrence, snapshot, current, true);
      expect(untick, `untick: ${context}`).toBe(simulate(recurrence, withoutCurrent, current));
      expect(tick, `tick: ${context}`).toBe(simulate(recurrence, [...withoutCurrent, current], current));
      expect(tick - untick, `delta: ${context}`).toBe(1); // what the island publishes for the Leaderboard
    }
  });
});
