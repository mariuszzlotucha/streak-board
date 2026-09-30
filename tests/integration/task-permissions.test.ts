import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  adminTask,
  createGroupAs,
  createTaskAs,
  createTestUser,
  joinGroupAs,
  type TestGroup,
  type TestUser,
} from "../helpers/supabase";

// Expectations come from the PRD (Access Control, FR-005): every member sees a
// group's tasks, but only the task's creator edits its title or deletes it.
// A creator who left the group keeps the task visible to the group but cannot
// manage it until they are back in the group.

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const TITLE = "Water the plants";

describe("creator-only task permissions", () => {
  let a: TestUser; // owner of GA
  let c: TestUser; // creator of the task, member of GA
  let m: TestUser; // other member of GA
  let x: TestUser; // outsider, no group
  let ga: TestGroup;
  let taskId: string;

  beforeAll(async () => {
    a = await createTestUser();
    c = await createTestUser();
    m = await createTestUser();
    x = await createTestUser();
  });

  beforeEach(async () => {
    ga = await createGroupAs(a, "Group A");
    await joinGroupAs(c, ga.joinCode);
    await joinGroupAs(m, ga.joinCode);
    taskId = await createTaskAs(c, ga.id, TITLE, "daily");
  });

  async function expectTaskUntouched() {
    expect(await adminTask(taskId)).toEqual({
      id: taskId,
      group_id: ga.id,
      created_by: c.id,
      title: TITLE,
      recurrence: "daily",
    });
  }

  describe("creator control", () => {
    it("C retitles the task, then deletes it", async () => {
      const { data: updated, error } = await c.client
        .from("tasks")
        .update({ title: "Water the herbs" })
        .eq("id", taskId)
        .select("id");
      expect(error).toBeNull();
      expect(updated).toEqual([{ id: taskId }]);
      expect((await adminTask(taskId))?.title).toBe("Water the herbs");

      const { data: deleted, error: deleteError } = await c.client.from("tasks").delete().eq("id", taskId).select("id");
      expect(deleteError).toBeNull();
      expect(deleted).toEqual([{ id: taskId }]);
      expect(await adminTask(taskId)).toBeNull();
    });
  });

  describe("non-creators cannot manage the task", () => {
    it("A (group owner), M and X update 0 rows; C's update works (control)", async () => {
      for (const user of [a, m, x]) {
        const { data, error } = await user.client
          .from("tasks")
          .update({ title: "Hijacked" })
          .eq("id", taskId)
          .select("id");
        expect(error).toBeNull();
        expect(data).toEqual([]);
        await expectTaskUntouched();
      }

      const { data: allowed, error } = await c.client
        .from("tasks")
        .update({ title: "Renamed by C" })
        .eq("id", taskId)
        .select("id");
      expect(error).toBeNull();
      expect(allowed).toEqual([{ id: taskId }]);
    });

    it("A (group owner), M and X delete 0 rows; C's delete works (control)", async () => {
      for (const user of [a, m, x]) {
        const { data, error } = await user.client.from("tasks").delete().eq("id", taskId).select("id");
        expect(error).toBeNull();
        expect(data).toEqual([]);
        await expectTaskUntouched();
      }

      const { data: allowed, error } = await c.client.from("tasks").delete().eq("id", taskId).select("id");
      expect(error).toBeNull();
      expect(allowed).toEqual([{ id: taskId }]);
      expect(await adminTask(taskId)).toBeNull();
    });
  });

  describe("creator cannot rewrite protected columns", () => {
    it("C cannot change recurrence, group_id, created_by or id (42501); retitling works (control)", async () => {
      const attempts = [
        { recurrence: "weekly" },
        { group_id: randomUUID() },
        { created_by: m.id },
        { id: randomUUID() },
      ] as const;

      for (const change of attempts) {
        const { data, error } = await c.client.from("tasks").update(change).eq("id", taskId).select("id");
        expect(error?.code).toBe(PERMISSION_DENIED);
        expect(data).toBeNull();
        await expectTaskUntouched();
      }

      const { data: allowed, error } = await c.client
        .from("tasks")
        .update({ title: "Renamed by C" })
        .eq("id", taskId)
        .select("id");
      expect(error).toBeNull();
      expect(allowed).toEqual([{ id: taskId }]);
    });
  });

  describe("a creator who left the group", () => {
    it("manages 0 rows while away, the group still sees the task, and manages it again after rejoining", async () => {
      const admin = adminClient();
      const { error: leaveError } = await admin
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", c.id);
      expect(leaveError).toBeNull();

      const { data: update, error: updateError } = await c.client
        .from("tasks")
        .update({ title: "Sneaky" })
        .eq("id", taskId)
        .select("id");
      expect(updateError).toBeNull();
      expect(update).toEqual([]);

      const { data: del, error: deleteError } = await c.client.from("tasks").delete().eq("id", taskId).select("id");
      expect(deleteError).toBeNull();
      expect(del).toEqual([]);
      await expectTaskUntouched();

      const { error: insertError } = await c.client
        .from("tasks")
        .insert({ group_id: ga.id, created_by: c.id, title: "Left but still writing", recurrence: "once" });
      expect(insertError?.code).toBe(PERMISSION_DENIED);

      const { data: seen, error: seenError } = await m.client.from("tasks").select("id").eq("id", taskId);
      expect(seenError).toBeNull();
      expect(seen).toEqual([{ id: taskId }]);

      await joinGroupAs(c, ga.joinCode);
      const { data: back, error: backError } = await c.client
        .from("tasks")
        .update({ title: "Back again" })
        .eq("id", taskId)
        .select("id");
      expect(backError).toBeNull();
      expect(back).toEqual([{ id: taskId }]);
    });
  });

  describe("cascades", () => {
    it("deleting the group deletes its tasks", async () => {
      const { data, error } = await a.client.from("groups").delete().eq("id", ga.id).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([{ id: ga.id }]);
      expect(await adminTask(taskId)).toBeNull();
    });
  });

  describe("data validation", () => {
    it("rejects an empty, whitespace-only or 81-character title; 80 characters is accepted (control)", async () => {
      for (const title of ["", "   ", "\t\n", "x".repeat(81)]) {
        const { error } = await c.client
          .from("tasks")
          .insert({ group_id: ga.id, created_by: c.id, title, recurrence: "once" });
        expect(error?.code).toBe(CHECK_VIOLATION);

        const { error: updateError } = await c.client.from("tasks").update({ title }).eq("id", taskId);
        expect(updateError?.code).toBe(CHECK_VIOLATION);
      }
      await expectTaskUntouched();

      const ok = await createTaskAs(c, ga.id, "x".repeat(80), "once");
      expect(await adminTask(ok)).not.toBeNull();
    });

    it("rejects a recurrence outside once/daily/weekly; each allowed value works (control)", async () => {
      for (const recurrence of ["monthly", "Daily", ""]) {
        const { error } = await c.client
          .from("tasks")
          .insert({ group_id: ga.id, created_by: c.id, title: "Bad recurrence", recurrence });
        expect(error?.code).toBe(CHECK_VIOLATION);
      }

      for (const recurrence of ["once", "daily", "weekly"]) {
        const created = await createTaskAs(c, ga.id, `Task ${recurrence}`, recurrence);
        expect((await adminTask(created))?.recurrence).toBe(recurrence);
      }
    });
  });
});
