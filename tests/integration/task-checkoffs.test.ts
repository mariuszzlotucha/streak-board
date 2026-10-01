import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminCheckoffs,
  adminClient,
  anonClient,
  checkOffAs,
  createGroupAs,
  createTaskAs,
  createTestUser,
  deleteTestUser,
  joinGroupAs,
  joinTaskAs,
  type TestGroup,
  type TestUser,
  utcDay,
} from "../helpers/supabase";

// Expectations come from the PRD (Access Control, FR-008, US-01) and the settled terms of the S-04 plan, not from the
// policies in the migration: a member who takes part in a task checks off their own realisation of the current period,
// everybody in the group sees every check-off, outsiders neither read nor write, and leaving a task or the group erases
// the user's check-offs for it.

const PERMISSION_DENIED = "42501";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

const sorted = (...keys: string[]) => [...keys].sort();

// The insert window moves at UTC midnight. A test that straddles it would see its edge periods change verdict, so one
// that starts within a few seconds of midnight waits for the new day first.
async function clearOfUtcMidnight(): Promise<void> {
  const untilMidnight = 86_400_000 - (Date.now() % 86_400_000);
  if (untilMidnight < 5_000) await new Promise((resolve) => setTimeout(resolve, untilMidnight + 100));
}

describe("task check-offs", () => {
  let a: TestUser; // owner of GA and member; takes part in the task only where a test says so
  let c: TestUser; // creator of the task (enrolled automatically), member of GA
  let m: TestUser; // other member of GA
  let b: TestUser; // owner of GB
  let x: TestUser; // outsider, no group
  let ga: TestGroup;
  let gb: TestGroup;
  let taskId: string;
  let today: string;
  let yesterday: string;
  let twoDaysAgo: string;

  // "<user id>:<period>" for every check-off of a task, read with the service role (RLS does not apply).
  const stored = async (id = taskId) => (await adminCheckoffs(id)).map((row) => `${row.user_id}:${row.period}`).sort();
  const tick = (user: TestUser, period: string) => `${user.id}:${period}`;

  beforeAll(async () => {
    a = await createTestUser();
    c = await createTestUser();
    m = await createTestUser();
    b = await createTestUser();
    x = await createTestUser();
  });

  beforeEach(async () => {
    ga = await createGroupAs(a, "Group A");
    await joinGroupAs(c, ga.joinCode);
    await joinGroupAs(m, ga.joinCode);
    gb = await createGroupAs(b, "Group B");
    taskId = await createTaskAs(c, ga.id, "Water the plants", "daily");
    // Every test except the window test uses periods between six days back and tomorrow, which stay valid if UTC
    // midnight passes mid-test; the window test waits out the last seconds before midnight instead.
    today = utcDay(0);
    yesterday = utcDay(-1);
    twoDaysAgo = utcDay(-2);
  });

  describe("checking off", () => {
    it("an enrolled member checks off and the row is stored", async () => {
      const { error } = await checkOffAs(c, taskId, today);
      expect(error).toBeNull();
      expect(await stored()).toEqual([tick(c, today)]);
    });

    it("another period inside the window adds a row", async () => {
      expect((await checkOffAs(c, taskId, today)).error).toBeNull();
      expect((await checkOffAs(c, taskId, yesterday)).error).toBeNull();
      expect(await stored()).toEqual(sorted(tick(c, today), tick(c, yesterday)));
    });

    it("checking off the same period twice fails with 23505 and leaves one row", async () => {
      expect((await checkOffAs(c, taskId, today)).error).toBeNull();
      const { error } = await checkOffAs(c, taskId, today);
      expect(error?.code).toBe(UNIQUE_VIOLATION);
      expect(await stored()).toEqual([tick(c, today)]);
    });
  });

  describe("who may check off", () => {
    it("M cannot check off in C's name (42501), but can for themselves once enrolled", async () => {
      await joinTaskAs(m, taskId);

      const forged = await m.client.from("task_checkoffs").insert({ task_id: taskId, user_id: c.id, period: today });
      expect(forged.error?.code).toBe(PERMISSION_DENIED);
      expect(await stored()).toEqual([]);

      expect((await checkOffAs(m, taskId, today)).error).toBeNull();
      expect(await stored()).toEqual([tick(m, today)]);
    });

    it("A, a member who has not joined the task, cannot check off (23503) until they join", async () => {
      // The policy lets the row through (A is a member of GA); the foreign key to the participation rejects it.
      const { error } = await checkOffAs(a, taskId, today);
      expect(error?.code).toBe(FOREIGN_KEY_VIOLATION);
      expect(await stored()).toEqual([]);

      expect((await joinTaskAs(a, taskId)).error).toBeNull();
      expect((await checkOffAs(a, taskId, today)).error).toBeNull();
      expect(await stored()).toEqual([tick(a, today)]);
    });

    it("B, X and the anonymous client cannot check off a task of GA (42501)", async () => {
      expect((await checkOffAs(c, taskId, today)).error).toBeNull();

      for (const outsider of [b, x]) {
        const { error } = await checkOffAs(outsider, taskId, today);
        expect(error?.code).toBe(PERMISSION_DENIED);
      }
      const { error: anonError } = await anonClient()
        .from("task_checkoffs")
        .insert({ task_id: taskId, user_id: c.id, period: yesterday });
      expect(anonError?.code).toBe(PERMISSION_DENIED);
      expect(await stored()).toEqual([tick(c, today)]);
    });

    it("a task that does not exist cannot be checked off (42501)", async () => {
      const { error } = await checkOffAs(c, randomUUID(), today);
      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it("an ex-member whose participation row survived the join/leave race cannot check off (42501)", async () => {
      await joinTaskAs(m, taskId);
      const { error: leaveError } = await m.client.from("group_members").delete().eq("user_id", m.id);
      expect(leaveError).toBeNull();
      // The row the accepted race can leave: planted with the service role because the cleanup trigger cannot be raced here.
      const { error: plantError } = await adminClient()
        .from("task_participants")
        .insert({ task_id: taskId, user_id: m.id });
      expect(plantError).toBeNull();

      const { error } = await checkOffAs(m, taskId, today);
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect(await stored()).toEqual([]);

      expect((await checkOffAs(c, taskId, today)).error).toBeNull();
    });
  });

  describe("period window", () => {
    it("accepts 7 days back and tomorrow (UTC) and rejects anything outside (42501)", async () => {
      await clearOfUtcMidnight();

      for (const offset of [-7, 1]) {
        expect((await checkOffAs(c, taskId, utcDay(offset))).error).toBeNull();
      }
      for (const offset of [-8, 2, -30, 30]) {
        const { error } = await checkOffAs(c, taskId, utcDay(offset));
        expect(error?.code).toBe(PERMISSION_DENIED);
      }
      expect(await stored()).toEqual(sorted(tick(c, utcDay(-7)), tick(c, utcDay(1))));
    });
  });

  describe("column grants", () => {
    // TRUNCATE is denied as well, but PostgREST has no route for it, so that case lives only in rls-scenarios.sql.
    it("checked_at cannot be sent on insert (42501)", async () => {
      const { error } = await c.client
        .from("task_checkoffs")
        .insert({ task_id: taskId, user_id: c.id, period: today, checked_at: new Date().toISOString() });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect(await stored()).toEqual([]);
    });

    it("UPDATE is denied (42501) and leaves the row untouched", async () => {
      expect((await checkOffAs(c, taskId, today)).error).toBeNull();

      const { error } = await c.client
        .from("task_checkoffs")
        .update({ period: yesterday })
        .eq("task_id", taskId)
        .select("period");
      expect(error?.code).toBe(PERMISSION_DENIED);

      const { error: checkedAtError } = await c.client
        .from("task_checkoffs")
        .update({ checked_at: new Date().toISOString() })
        .eq("task_id", taskId);
      expect(checkedAtError?.code).toBe(PERMISSION_DENIED);
      expect(await stored()).toEqual([tick(c, today)]);
    });
  });

  describe("visibility", () => {
    // "<user id>:<period>" for every check-off the user can read, with no filter at all.
    const readableBy = async (user: TestUser) => {
      const { data, error } = await user.client.from("task_checkoffs").select("user_id, period");
      expect(error).toBeNull();
      return (data ?? []).map((row) => `${row.user_id}:${row.period}`).sort();
    };

    it("every member of GA reads all check-offs of the group's tasks; B, X and the anonymous client read none", async () => {
      await joinTaskAs(m, taskId);
      await checkOffAs(c, taskId, today);
      await checkOffAs(m, taskId, today);
      await checkOffAs(m, taskId, yesterday);
      const everything = sorted(tick(c, today), tick(m, today), tick(m, yesterday));

      // A is the group owner and has not joined the task: membership alone is enough to read.
      for (const member of [a, c, m]) {
        expect(await readableBy(member)).toEqual(everything);
      }
      for (const outsider of [b, x]) {
        expect(await readableBy(outsider)).toEqual([]);
      }
      const { data, error } = await anonClient().from("task_checkoffs").select("user_id");
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect(data).toBeNull();
    });

    it("a member of GA does not read the check-offs of GB's task, and B reads only their own group's", async () => {
      const bTask = await createTaskAs(b, gb.id, "Read a book", "daily");
      await checkOffAs(b, bTask, today);
      await checkOffAs(c, taskId, today);

      for (const member of [a, c, m]) {
        expect(await readableBy(member)).toEqual([tick(c, today)]);
      }
      expect(await readableBy(b)).toEqual([tick(b, today)]);
    });

    it("an ex-member no longer reads the check-offs of the former group", async () => {
      await joinTaskAs(m, taskId);
      await checkOffAs(c, taskId, today);
      expect(await readableBy(m)).toEqual([tick(c, today)]);

      const { error } = await m.client.from("group_members").delete().eq("user_id", m.id);
      expect(error).toBeNull();
      expect(await readableBy(m)).toEqual([]);
    });
  });

  describe("undoing", () => {
    it("a member deletes only their own check-offs, one period or all of a task's, never someone else's", async () => {
      await joinTaskAs(m, taskId);
      await checkOffAs(c, taskId, today);
      await checkOffAs(c, taskId, yesterday);
      await checkOffAs(m, taskId, today);

      const { data: one, error } = await c.client
        .from("task_checkoffs")
        .delete()
        .eq("task_id", taskId)
        .eq("period", today)
        .select("user_id, period");
      expect(error).toBeNull();
      expect(one).toEqual([{ user_id: c.id, period: today }]);
      expect(await stored()).toEqual(sorted(tick(c, yesterday), tick(m, today)));

      // The filter names only the task, yet M's row stays: RLS limits the delete to the caller's own rows.
      const { data: rest, error: restError } = await c.client
        .from("task_checkoffs")
        .delete()
        .eq("task_id", taskId)
        .select("period");
      expect(restError).toBeNull();
      expect(rest).toEqual([{ period: yesterday }]);
      expect(await stored()).toEqual([tick(m, today)]);
    });

    it("A (group owner), M, B and X delete 0 rows of C's check-offs; the anonymous client is denied (42501)", async () => {
      await joinTaskAs(m, taskId);
      await checkOffAs(c, taskId, today);
      await checkOffAs(m, taskId, today);

      for (const user of [a, m, b, x]) {
        const { data, error } = await user.client
          .from("task_checkoffs")
          .delete()
          .eq("task_id", taskId)
          .eq("user_id", c.id)
          .select("period");
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
      const { error: anonError } = await anonClient().from("task_checkoffs").delete().eq("task_id", taskId);
      expect(anonError?.code).toBe(PERMISSION_DENIED);
      expect(await stored()).toEqual(sorted(tick(c, today), tick(m, today)));
    });
  });

  describe("task_checkoff_periods view", () => {
    // The periods array of every enrolment of one task that the user can read, keyed by user id.
    const periodsOf = async (user: TestUser, id = taskId) => {
      const { data, error } = await user.client
        .from("task_checkoff_periods")
        .select("user_id, periods")
        .eq("task_id", id);
      expect(error).toBeNull();
      const byUser: Record<string, string[] | null> = {};
      // The generated view columns are nullable; a null id would show up as a mismatch under the "" key.
      for (const row of data ?? []) byUser[row.user_id ?? ""] = row.periods;
      return byUser;
    };

    it("members read one row per enrolment with the periods in ascending order", async () => {
      await joinTaskAs(m, taskId);
      // Inserted out of order on purpose: the order comes from the view, not from the insertion.
      for (const period of [today, twoDaysAgo, yesterday]) await checkOffAs(c, taskId, period);
      await checkOffAs(m, taskId, yesterday);
      const expected = { [c.id]: [twoDaysAgo, yesterday, today], [m.id]: [yesterday] };

      // A is the group owner and has not joined the task: membership alone is enough to read.
      for (const member of [a, c, m]) {
        expect(await periodsOf(member)).toEqual(expected);
      }
    });

    it("B and X read no rows through the view; the anonymous client is denied (42501)", async () => {
      await checkOffAs(c, taskId, today);
      expect(await periodsOf(c)).toEqual({ [c.id]: [today] });

      for (const outsider of [b, x]) {
        expect(await periodsOf(outsider)).toEqual({});
      }
      const { data, error } = await anonClient().from("task_checkoff_periods").select("task_id");
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect(data).toBeNull();
    });

    it("lists only the caller's own group's enrolments when nothing filters the read", async () => {
      const bTask = await createTaskAs(b, gb.id, "Read a book", "daily");
      await checkOffAs(b, bTask, today);
      await checkOffAs(c, taskId, today);

      const enrolmentsReadBy = async (user: TestUser) => {
        const { data, error } = await user.client.from("task_checkoff_periods").select("task_id, user_id");
        expect(error).toBeNull();
        return (data ?? []).map((row) => `${row.task_id}:${row.user_id}`).sort();
      };
      for (const member of [a, c, m]) {
        expect(await enrolmentsReadBy(member)).toEqual([`${taskId}:${c.id}`]);
      }
      expect(await enrolmentsReadBy(b)).toEqual([`${bTask}:${b.id}`]);
    });
  });

  describe("cascades", () => {
    it("leaving the task erases the leaver's check-offs; the others' stay and a rejoin brings nothing back", async () => {
      await joinTaskAs(m, taskId);
      await checkOffAs(c, taskId, today);
      await checkOffAs(m, taskId, today);
      await checkOffAs(m, taskId, yesterday);
      expect(await stored()).toHaveLength(3);

      const { error } = await m.client.from("task_participants").delete().eq("task_id", taskId);
      expect(error).toBeNull();
      expect(await stored()).toEqual([tick(c, today)]);

      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      expect(await stored()).toEqual([tick(c, today)]);
    });

    it("leaving the group erases the leaver's check-offs in the group's tasks; the others' stay", async () => {
      const other = await createTaskAs(a, ga.id, "Other task", "daily");
      await joinTaskAs(m, taskId);
      await joinTaskAs(m, other);
      await checkOffAs(c, taskId, today);
      await checkOffAs(m, taskId, today);
      await checkOffAs(m, other, today);
      await checkOffAs(a, other, today);

      const { error } = await m.client.from("group_members").delete().eq("user_id", m.id);
      expect(error).toBeNull();

      expect(await stored(taskId)).toEqual([tick(c, today)]);
      expect(await stored(other)).toEqual([tick(a, today)]);
    });

    it("being removed by the owner erases the removed member's check-offs", async () => {
      await joinTaskAs(m, taskId);
      await checkOffAs(c, taskId, today);
      await checkOffAs(m, taskId, today);

      const { data, error } = await a.client.from("group_members").delete().eq("user_id", m.id).select("user_id");
      expect(error).toBeNull();
      expect(data).toEqual([{ user_id: m.id }]);
      expect(await stored()).toEqual([tick(c, today)]);
    });

    it("deleting the task erases its check-offs and leaves the other tasks' alone", async () => {
      const other = await createTaskAs(a, ga.id, "Other task", "daily");
      await checkOffAs(c, taskId, today);
      await checkOffAs(a, other, today);

      const { error } = await c.client.from("tasks").delete().eq("id", taskId);
      expect(error).toBeNull();
      expect(await stored(taskId)).toEqual([]);
      expect(await stored(other)).toEqual([tick(a, today)]);
    });

    it("deleting the group erases the check-offs of its tasks without error", async () => {
      await joinTaskAs(m, taskId);
      await checkOffAs(c, taskId, today);
      await checkOffAs(m, taskId, today);

      const { data, error } = await a.client.from("groups").delete().eq("id", ga.id).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([{ id: ga.id }]);
      expect(await stored()).toEqual([]);
    });

    it("deleting an account erases its check-offs, in its own tasks and in the others'", async () => {
      const d = await createTestUser();
      await joinGroupAs(d, ga.joinCode);
      const dTaskId = await createTaskAs(d, ga.id, "Feed the cat", "daily");
      await joinTaskAs(d, taskId);
      await checkOffAs(d, taskId, today);
      await checkOffAs(d, dTaskId, today);
      await checkOffAs(c, taskId, today);
      expect(await stored(taskId)).toEqual(sorted(tick(c, today), tick(d, today)));

      await deleteTestUser(d);

      expect(await stored(taskId)).toEqual([tick(c, today)]);
      expect(await stored(dTaskId)).toEqual([]);
    });
  });
});
