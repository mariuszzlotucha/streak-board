import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminTask,
  anonClient,
  createGroupAs,
  createTaskAs,
  createTestUser,
  joinGroupAs,
  type TestGroup,
  type TestUser,
} from "../helpers/supabase";

// Expectations come from the PRD (Access Control, FR-004): tasks belong to a
// group; every member of that group sees them, nobody else does, and nobody
// can create a task in a group they do not belong to or in someone else's name.

const RLS_VIOLATION = "42501";

describe("task isolation between groups", () => {
  let a: TestUser; // owner of GA
  let m: TestUser; // member of GA
  let b: TestUser; // owner of GB
  let x: TestUser; // no group, ever
  let ga: TestGroup;
  let gb: TestGroup;
  let taskId: string; // created by A in GA

  beforeAll(async () => {
    a = await createTestUser();
    m = await createTestUser();
    b = await createTestUser();
    x = await createTestUser();
  });

  beforeEach(async () => {
    ga = await createGroupAs(a, "Group A");
    await joinGroupAs(m, ga.joinCode);
    gb = await createGroupAs(b, "Group B");
    taskId = await createTaskAs(a, ga.id, "Water the plants", "daily");
  });

  describe("positive controls: members see their group's tasks", () => {
    it("owner A and member M read GA's task", async () => {
      for (const user of [a, m]) {
        const { data, error } = await user.client.from("tasks").select("id, title, recurrence").eq("group_id", ga.id);
        expect(error).toBeNull();
        expect(data).toEqual([{ id: taskId, title: "Water the plants", recurrence: "daily" }]);
      }
    });

    it("B sees only GB's own tasks, never GA's", async () => {
      const bTaskId = await createTaskAs(b, gb.id, "B's task", "once");

      const { data, error } = await b.client.from("tasks").select("id");
      expect(error).toBeNull();
      expect(data?.map((row) => row.id)).toEqual([bTaskId]);
    });
  });

  describe("outsiders cannot read GA's tasks", () => {
    it("B and X get [] with no error while the task exists", async () => {
      expect(await adminTask(taskId)).not.toBeNull();

      for (const outsider of [b, x]) {
        const { data, error } = await outsider.client.from("tasks").select("id").eq("group_id", ga.id);
        expect(error).toBeNull();
        expect(data).toEqual([]);

        const { data: byId, error: byIdError } = await outsider.client.from("tasks").select("id").eq("id", taskId);
        expect(byIdError).toBeNull();
        expect(byId).toEqual([]);
      }
    });

    it("the anonymous client reads nothing while the task exists", async () => {
      expect(await adminTask(taskId)).not.toBeNull();

      const { data, error } = await anonClient().from("tasks").select("id");
      expect(error?.code).toBe(RLS_VIOLATION);
      expect(data).toBeNull();
    });
  });

  describe("nobody creates tasks outside their own group or in another's name", () => {
    it("B and X cannot insert a task into GA (42501); M can (control)", async () => {
      for (const outsider of [b, x]) {
        const { error } = await outsider.client
          .from("tasks")
          .insert({ group_id: ga.id, created_by: outsider.id, title: "Intruder", recurrence: "once" });
        expect(error?.code).toBe(RLS_VIOLATION);
      }

      const { data: intruders } = await a.client.from("tasks").select("id").eq("title", "Intruder");
      expect(intruders).toEqual([]);

      const created = await createTaskAs(m, ga.id, "Member task", "weekly");
      expect(await adminTask(created)).toMatchObject({ group_id: ga.id, created_by: m.id });
    });

    it("M cannot insert a task with created_by set to A (42501); own created_by works (control)", async () => {
      const { error } = await m.client
        .from("tasks")
        .insert({ group_id: ga.id, created_by: a.id, title: "Forged", recurrence: "once" });
      expect(error?.code).toBe(RLS_VIOLATION);

      const { data: forged } = await a.client.from("tasks").select("id").eq("title", "Forged");
      expect(forged).toEqual([]);

      const own = await createTaskAs(m, ga.id, "Not forged", "once");
      expect(await adminTask(own)).toMatchObject({ created_by: m.id });
    });

    it("the anonymous client cannot insert a task", async () => {
      const { error } = await anonClient()
        .from("tasks")
        .insert({ group_id: ga.id, created_by: a.id, title: "Anon task", recurrence: "once" });
      expect(error?.code).toBe(RLS_VIOLATION);

      const { data } = await a.client.from("tasks").select("id").eq("title", "Anon task");
      expect(data).toEqual([]);
    });
  });
});
