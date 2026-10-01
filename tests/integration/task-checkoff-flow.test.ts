import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkOff, listCheckoffPeriods, uncheck } from "@/lib/checkoffs";
import type { EnrolmentPeriods } from "@/lib/leaderboard-rules";
import { periodKeyFor } from "@/lib/streak-rules";
import { getTask, type GroupTask } from "@/lib/tasks";
import {
  adminCheckoffs,
  adminClient,
  anonClient,
  checkOffAs,
  clearOfUtcMidnight,
  createGroupAs,
  createTaskAs,
  createTestUser,
  joinGroupAs,
  joinTaskAs,
  type TestGroup,
  type TestUser,
  utcDay,
} from "../helpers/supabase";

// Expectations come from the PRD (US-01, FR-008) and the settled terms of the S-04 plan, not from the code under
// test: a member who takes part in a task ticks the current period, a repeated tick changes nothing, undo removes the
// caller's own ticks of the current period (every tick of a `once` task) and nobody else's, a denial is `forbidden`,
// and leaving the task erases the history. The data layer runs here with real user clients against the local stack.

const DAY_MS = 86_400_000;

const sorted = (...keys: string[]) => [...keys].sort();

// The date `days` after a `YYYY-MM-DD` key, by plain epoch arithmetic (not the code under test).
const addDays = (key: string, days: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const byUser = (rows: readonly EnrolmentPeriods[]) => [...rows].sort((p, q) => p.user_id.localeCompare(q.user_id));

describe("task check-off flow", () => {
  let a: TestUser; // owner of GA and member; takes part in the task only where a test says so
  let c: TestUser; // creator of the task (enrolled automatically), member of GA
  let m: TestUser; // other member of GA
  let b: TestUser; // owner of GB
  let x: TestUser; // outsider, no group
  let ga: TestGroup;
  let taskId: string;
  let task: GroupTask; // the daily task of C, as the routes read it

  // "<user id>:<period>" for every check-off of a task, read with the service role (RLS does not apply).
  const stored = async (id = taskId) => (await adminCheckoffs(id)).map((row) => `${row.user_id}:${row.period}`).sort();
  const tick = (user: TestUser, period: string) => `${user.id}:${period}`;

  // The task as a route reads it: with the caller's own client.
  const taskAs = async (user: TestUser, id: string): Promise<GroupTask> => {
    const found = await getTask(user.client, id);
    if (!found) throw new Error(`task ${id} is not visible to ${user.id}`);
    return found;
  };

  // A row planted with the service role, for periods the insert policy would refuse.
  const plant = async (user: TestUser, id: string, period: string) => {
    const { error } = await adminClient().from("task_checkoffs").insert({ task_id: id, user_id: user.id, period });
    expect(error).toBeNull();
  };

  beforeAll(async () => {
    a = await createTestUser();
    c = await createTestUser();
    m = await createTestUser();
    b = await createTestUser();
    x = await createTestUser();
  });

  beforeEach(async () => {
    await clearOfUtcMidnight();
    ga = await createGroupAs(a, "Group A");
    await joinGroupAs(c, ga.joinCode);
    await joinGroupAs(m, ga.joinCode);
    await createGroupAs(b, "Group B");
    taskId = await createTaskAs(c, ga.id, "Water the plants", "daily");
    task = await taskAs(c, taskId);
  });

  describe("checking off", () => {
    it("an enrolled member ticks: ok with the period of the instant, and the row is stored", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);

      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await stored()).toEqual([tick(c, period)]);
    });

    it("ticks the period of the instant it is given, not of the clock", async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS);
      const period = periodKeyFor("daily", threeDaysAgo);
      expect(period).not.toBe(periodKeyFor("daily", new Date()));

      expect(await checkOff(c.client, c.id, task, threeDaysAgo)).toEqual({ kind: "ok", period });
      expect(await stored()).toEqual([tick(c, period)]);
    });

    it("a weekly task is ticked on the Monday of the week", async () => {
      const weekly = await taskAs(c, await createTaskAs(c, ga.id, "Weekly review", "weekly"));
      const now = new Date();
      const monday = periodKeyFor("weekly", now);
      // 1 is a Monday in getUTCDay: the oracle needs no app code.
      expect(new Date(`${monday}T00:00:00Z`).getUTCDay()).toBe(1);

      expect(await checkOff(c.client, c.id, weekly, now)).toEqual({ kind: "ok", period: monday });
      expect(await stored(weekly.id)).toEqual([tick(c, monday)]);
    });

    it("a repeated tick is ok with the same period and leaves one row", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);

      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await stored()).toEqual([tick(c, period)]);
    });
  });

  describe("who may check off", () => {
    it("a member who has not joined the task is forbidden (23503) until they join", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);

      // The policy lets the row through (A is a member of GA); the foreign key to the participation rejects it.
      expect(await checkOff(a.client, a.id, task, now)).toEqual({ kind: "forbidden" });
      expect(await stored()).toEqual([]);

      expect((await joinTaskAs(a, taskId)).error).toBeNull();
      expect(await checkOff(a.client, a.id, task, now)).toEqual({ kind: "ok", period });
      expect(await stored()).toEqual([tick(a, period)]);
    });

    it("outsiders and the anonymous client are forbidden (42501)", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });

      for (const outsider of [b, x]) {
        expect(await checkOff(outsider.client, outsider.id, task, now)).toEqual({ kind: "forbidden" });
      }
      expect(await checkOff(anonClient(), c.id, task, now)).toEqual({ kind: "forbidden" });
      expect(await stored()).toEqual([tick(c, period)]);
    });

    it("a member who left the task is forbidden (23503) until they join again", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);
      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      expect(await checkOff(m.client, m.id, task, now)).toEqual({ kind: "ok", period });

      const { error } = await m.client.from("task_participants").delete().eq("task_id", taskId);
      expect(error).toBeNull();
      // Leaving erased M's row too, and the stale task object a tab still holds cannot bring a tick back.
      expect(await checkOff(m.client, m.id, task, now)).toEqual({ kind: "forbidden" });
      expect(await stored()).toEqual([]);

      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      expect(await checkOff(m.client, m.id, task, now)).toEqual({ kind: "ok", period });
    });

    it("a task that no longer exists is forbidden (42501)", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);

      expect(await checkOff(c.client, c.id, { ...task, id: randomUUID() }, now)).toEqual({ kind: "forbidden" });
      expect(await stored()).toEqual([]);
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
    });

    it("a failure that is not a denial is unknown, for the tick and for the undo", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);

      // Postgres rejects the id itself (22P02), which no mapping claims.
      const broken: GroupTask = { ...task, id: "not-a-uuid" };
      expect((await checkOff(c.client, c.id, broken, now)).kind).toBe("unknown");
      expect((await uncheck(c.client, c.id, broken, now)).kind).toBe("unknown");

      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
    });
  });

  describe("undoing", () => {
    it("a daily task is undone for the current day only, and only for the caller", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);
      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await checkOff(m.client, m.id, task, now)).toEqual({ kind: "ok", period });
      // The Warsaw day is the UTC day or the one after, so the UTC day before is never the current period.
      expect((await checkOffAs(c, taskId, utcDay(-1))).error).toBeNull();

      expect(await uncheck(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await stored()).toEqual(sorted(tick(c, utcDay(-1)), tick(m, period)));

      // Nothing left to remove: a quiet ok again, and nothing else changes.
      expect(await uncheck(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await stored()).toEqual(sorted(tick(c, utcDay(-1)), tick(m, period)));
    });

    it("a weekly task is undone for the whole current week and for that week only", async () => {
      const weekly = await taskAs(c, await createTaskAs(c, ga.id, "Weekly review", "weekly"));
      // Yesterday's instant: the Tuesday after its Monday is then never later than UTC tomorrow, the end of the window.
      const now = new Date(Date.now() - DAY_MS);
      const monday = periodKeyFor("weekly", now);
      expect(await checkOff(c.client, c.id, weekly, now)).toEqual({ kind: "ok", period: monday });
      // A row on another day of the week reaches the table through the API like any other (the policy allows the day).
      expect((await checkOffAs(c, weekly.id, addDays(monday, 1))).error).toBeNull();
      // The week's last day and its neighbours, the Sunday before and the Monday after: planted, as they may lie
      // outside the window.
      await plant(c, weekly.id, addDays(monday, 6));
      await plant(c, weekly.id, addDays(monday, -1));
      await plant(c, weekly.id, addDays(monday, 7));

      expect(await uncheck(c.client, c.id, weekly, now)).toEqual({ kind: "ok", period: monday });
      expect(await stored(weekly.id)).toEqual(sorted(tick(c, addDays(monday, -1)), tick(c, addDays(monday, 7))));

      expect(await uncheck(c.client, c.id, weekly, now)).toEqual({ kind: "ok", period: monday });
      expect(await stored(weekly.id)).toEqual(sorted(tick(c, addDays(monday, -1)), tick(c, addDays(monday, 7))));
    });

    it("a once task is undone for every row of the caller, whatever its day", async () => {
      const once = await taskAs(c, await createTaskAs(c, ga.id, "Book the dentist", "once"));
      const now = new Date();
      const period = periodKeyFor("once", now);
      expect((await joinTaskAs(m, once.id)).error).toBeNull();
      expect(await checkOff(c.client, c.id, once, now)).toEqual({ kind: "ok", period });
      expect(await checkOff(m.client, m.id, once, now)).toEqual({ kind: "ok", period });
      await plant(c, once.id, utcDay(-30));
      expect(await stored(once.id)).toHaveLength(3);

      expect(await uncheck(c.client, c.id, once, now)).toEqual({ kind: "ok", period });
      expect(await stored(once.id)).toEqual([tick(m, period)]);

      expect(await uncheck(c.client, c.id, once, now)).toEqual({ kind: "ok", period });
      expect(await stored(once.id)).toEqual([tick(m, period)]);
    });

    it("cannot remove another user's check-offs; the anonymous client is forbidden (42501)", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });

      // The filter names C, yet RLS limits the delete to the caller's own rows: zero rows, a quiet ok.
      for (const other of [a, m, b, x]) {
        expect(await uncheck(other.client, c.id, task, now)).toEqual({ kind: "ok", period });
      }
      expect(await uncheck(anonClient(), c.id, task, now)).toEqual({ kind: "forbidden" });
      expect(await stored()).toEqual([tick(c, period)]);

      expect(await uncheck(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await stored()).toEqual([]);
    });
  });

  describe("reading the periods", () => {
    it("members read one entry per enrolment with the periods in ascending order", async () => {
      const now = new Date();
      const today = periodKeyFor("daily", now);
      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      // Inserted out of order on purpose: the order comes from the view, not from the insertion.
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period: today });
      expect((await checkOffAs(c, taskId, utcDay(-2))).error).toBeNull();
      expect((await checkOffAs(c, taskId, utcDay(-1))).error).toBeNull();
      expect((await checkOffAs(m, taskId, utcDay(-1))).error).toBeNull();
      const expected = byUser([
        { task_id: taskId, user_id: c.id, periods: [utcDay(-2), utcDay(-1), today] },
        { task_id: taskId, user_id: m.id, periods: [utcDay(-1)] },
      ]);

      // A is the group owner and has not joined the task: membership alone is enough to read.
      for (const member of [a, c, m]) {
        expect(byUser(await listCheckoffPeriods(member.client))).toEqual(expected);
      }
    });

    it("B and X read nothing; the anonymous client is denied (42501)", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await listCheckoffPeriods(c.client)).toEqual([{ task_id: taskId, user_id: c.id, periods: [period] }]);

      for (const outsider of [b, x]) {
        expect(await listCheckoffPeriods(outsider.client)).toEqual([]);
      }
      await expect(listCheckoffPeriods(anonClient())).rejects.toMatchObject({ code: "42501" });
    });

    it("a tick and an undo show up in the read, and an enrolment without ticks has no entry", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);
      expect(await listCheckoffPeriods(c.client)).toEqual([]);

      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await listCheckoffPeriods(c.client)).toEqual([{ task_id: taskId, user_id: c.id, periods: [period] }]);

      expect(await uncheck(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await listCheckoffPeriods(c.client)).toEqual([]);
    });
  });

  describe("leaving", () => {
    it("leaving the task erases the leaver's check-offs; the others' stay and a rejoin brings nothing back", async () => {
      const now = new Date();
      const period = periodKeyFor("daily", now);
      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      expect(await checkOff(c.client, c.id, task, now)).toEqual({ kind: "ok", period });
      expect(await checkOff(m.client, m.id, task, now)).toEqual({ kind: "ok", period });
      expect(await listCheckoffPeriods(c.client)).toHaveLength(2);

      const { error } = await m.client.from("task_participants").delete().eq("task_id", taskId);
      expect(error).toBeNull();
      expect(await stored()).toEqual([tick(c, period)]);
      expect(await listCheckoffPeriods(c.client)).toEqual([{ task_id: taskId, user_id: c.id, periods: [period] }]);

      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      expect(await stored()).toEqual([tick(c, period)]);
      expect(await listCheckoffPeriods(m.client)).toEqual([{ task_id: taskId, user_id: c.id, periods: [period] }]);
    });
  });
});
