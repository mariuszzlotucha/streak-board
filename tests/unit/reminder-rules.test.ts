/**
 * Oracle for the reminder run rule (S-16, plan Phase 1). Expected values are derived by hand: Warsaw is UTC+1 (CET)
 * in winter and UTC+2 (CEST) from 2026-03-29 01:00Z until 2026-10-25 01:00Z; 2026-10-01 is a Thursday.
 *
 *   Winter Wed 2026-01-14   18:00Z = 19:00 CET skip | 19:00Z = 20:00 CET due, today 01-14, no week
 *   Summer Wed 2026-07-15   18:00Z = 20:00 CEST due, today 07-15, no week | 19:00Z = 21:00 CEST skip
 *   Sat 2026-10-03          18:00Z = 20:00 CEST due, no week
 *   Sun 2026-10-04          18:00Z = 20:00 CEST due, week of Mon 2026-09-28
 *   Sun 2026-03-29 (spring) 18:00Z = 20:00 CEST due, week of Mon 2026-03-23 | 19:00Z = 21:00 skip
 *   Sun 2026-10-25 (autumn) 18:00Z = 19:00 CET skip | 19:00Z = 20:00 CET due, week of Mon 2026-10-19
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { reminderRun } from "@/lib/reminder-rules";
import { runReminders } from "@/lib/reminders/run";

const at = (iso: string) => new Date(iso);

describe("reminderRun", () => {
  it.each([
    ["winter 18:00Z", "2026-01-14T18:00:00Z", { due: false }],
    ["winter 19:00Z", "2026-01-14T19:00:00Z", { due: true, today: "2026-01-14", week: null }],
    ["summer 18:00Z", "2026-07-15T18:00:00Z", { due: true, today: "2026-07-15", week: null }],
    ["summer 19:00Z", "2026-07-15T19:00:00Z", { due: false }],
    ["Saturday", "2026-10-03T18:00:00Z", { due: true, today: "2026-10-03", week: null }],
    ["Sunday", "2026-10-04T18:00:00Z", { due: true, today: "2026-10-04", week: "2026-09-28" }],
    ["spring DST day 18:00Z", "2026-03-29T18:00:00Z", { due: true, today: "2026-03-29", week: "2026-03-23" }],
    ["spring DST day 19:00Z", "2026-03-29T19:00:00Z", { due: false }],
    ["autumn DST day 18:00Z", "2026-10-25T18:00:00Z", { due: false }],
    ["autumn DST day 19:00Z", "2026-10-25T19:00:00Z", { due: true, today: "2026-10-25", week: "2026-10-19" }],
  ])("%s", (_name, iso, expected) => {
    expect(reminderRun(at(iso))).toEqual(expected);
  });

  it("acts anywhere inside the Warsaw hour 20 and not a second before or after it", () => {
    expect(reminderRun(at("2026-01-14T18:59:59Z"))).toEqual({ due: false });
    expect(reminderRun(at("2026-01-14T19:59:59Z")).due).toBe(true);
    expect(reminderRun(at("2026-01-14T20:00:00Z"))).toEqual({ due: false });
  });
});

describe("runReminders", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a skipped run and returns not due", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(runReminders({}, at("2026-01-14T18:00:00Z"))).resolves.toEqual({ due: false });
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ event: "reminders.run.skipped" }));
  });

  it("logs a started run with its periods", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(runReminders({}, at("2026-10-04T18:00:00Z"))).resolves.toEqual({
      due: true,
      today: "2026-10-04",
      week: "2026-09-28",
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "reminders.run.started", today: "2026-10-04", week: "2026-09-28" }),
    );
  });
});
