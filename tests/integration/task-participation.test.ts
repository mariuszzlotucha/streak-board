import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  adminParticipants,
  adminTask,
  anonClient,
  createGroupAs,
  createTaskAs,
  createTestUser,
  deleteTestUser,
  joinGroupAs,
  joinTaskAs,
  type TestGroup,
  type TestUser,
} from "../helpers/supabase";

// Expectations come from the PRD (Access Control, FR-006): a member joins or
// leaves tasks of their own group, the creator is enrolled automatically, every
// member sees who participates, and leaving the group ends the participation.

const PERMISSION_DENIED = "42501";
const UNIQUE_VIOLATION = "23505";

const sorted = (...ids: string[]) => [...ids].sort();

describe("task participation", () => {
  let a: TestUser; // owner of GA
  let c: TestUser; // creator of the task, member of GA
  let m: TestUser; // other member of GA
  let b: TestUser; // owner of GB
  let x: TestUser; // outsider, no group
  let ga: TestGroup;
  let taskId: string;

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
    await createGroupAs(b, "Group B");
    taskId = await createTaskAs(c, ga.id, "Water the plants", "daily");
  });

  describe("joining", () => {
    it("the creator is enrolled automatically through the client insert path", async () => {
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("M joins C's task and every member then sees both participants", async () => {
      const { error } = await joinTaskAs(m, taskId);
      expect(error).toBeNull();
      expect(await adminParticipants(taskId)).toEqual(sorted(c.id, m.id));

      for (const user of [a, c, m]) {
        const { data, error: readError } = await user.client
          .from("task_participants")
          .select("user_id")
          .eq("task_id", taskId);
        expect(readError).toBeNull();
        expect(data?.map((row) => row.user_id).sort()).toEqual(sorted(c.id, m.id));
      }
    });

    it("joining twice fails with 23505 and leaves one row", async () => {
      expect((await joinTaskAs(m, taskId)).error).toBeNull();
      const { error } = await joinTaskAs(m, taskId);
      expect(error?.code).toBe(UNIQUE_VIOLATION);
      expect(await adminParticipants(taskId)).toEqual(sorted(c.id, m.id));
    });

    it("M cannot enrol another user (42501)", async () => {
      const { error } = await m.client.from("task_participants").insert({ task_id: taskId, user_id: a.id });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("B, X and the anonymous client cannot join GA's task (42501)", async () => {
      for (const outsider of [b, x]) {
        const { error } = await joinTaskAs(outsider, taskId);
        expect(error?.code).toBe(PERMISSION_DENIED);
      }
      const { error: anonError } = await anonClient()
        .from("task_participants")
        .insert({ task_id: taskId, user_id: a.id });
      expect(anonError?.code).toBe(PERMISSION_DENIED);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });
  });

  describe("visibility", () => {
    it("B and X read no participants of GA's task; the anonymous client is denied", async () => {
      for (const outsider of [b, x]) {
        const { data, error } = await outsider.client.from("task_participants").select("user_id").eq("task_id", taskId);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
      const { data, error } = await anonClient().from("task_participants").select("user_id");
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect(data).toBeNull();
    });
  });

  describe("leaving", () => {
    it("M leaves and removes only their own row; C stays enrolled", async () => {
      await joinTaskAs(m, taskId);

      const { data, error } = await m.client.from("task_participants").delete().eq("task_id", taskId).select("user_id");
      expect(error).toBeNull();
      expect(data).toEqual([{ user_id: m.id }]);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("A (group owner), M and X delete 0 rows of C's participation", async () => {
      await joinTaskAs(m, taskId);

      for (const user of [a, m, x]) {
        const { data, error } = await user.client
          .from("task_participants")
          .delete()
          .eq("task_id", taskId)
          .eq("user_id", c.id)
          .select("user_id");
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
      expect(await adminParticipants(taskId)).toEqual(sorted(c.id, m.id));
    });

    it("the creator can leave their own task; the task remains", async () => {
      const { data, error } = await c.client.from("task_participants").delete().eq("task_id", taskId).select("user_id");
      expect(error).toBeNull();
      expect(data).toEqual([{ user_id: c.id }]);
      expect(await adminParticipants(taskId)).toEqual([]);
      expect(await adminTask(taskId)).not.toBeNull();
    });
  });

  describe("column grants", () => {
    it("UPDATE is denied (42501) and leaves the row untouched", async () => {
      const { error } = await c.client
        .from("task_participants")
        .update({ user_id: m.id })
        .eq("task_id", taskId)
        .select("user_id");
      expect(error?.code).toBe(PERMISSION_DENIED);

      const { error: joinedAtError } = await c.client
        .from("task_participants")
        .update({ joined_at: new Date().toISOString() })
        .eq("task_id", taskId);
      expect(joinedAtError?.code).toBe(PERMISSION_DENIED);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("joined_at cannot be sent on insert (42501)", async () => {
      const { error } = await m.client
        .from("task_participants")
        .insert({ task_id: taskId, user_id: m.id, joined_at: new Date().toISOString() });
      expect(error?.code).toBe(PERMISSION_DENIED);
    });
  });

  describe("group departure", () => {
    it("M leaving the group clears M's participation in GA's tasks only", async () => {
      await joinTaskAs(m, taskId);
      const other = await createTaskAs(a, ga.id, "Other task", "once");
      await joinTaskAs(m, other);

      const { error } = await m.client.from("group_members").delete().eq("user_id", m.id);
      expect(error).toBeNull();

      expect(await adminParticipants(taskId)).toEqual([c.id]);
      expect(await adminParticipants(other)).toEqual([a.id]);
    });

    it("being removed by the owner clears the participation as well", async () => {
      await joinTaskAs(m, taskId);

      const { data, error } = await a.client.from("group_members").delete().eq("user_id", m.id).select("user_id");
      expect(error).toBeNull();
      expect(data).toEqual([{ user_id: m.id }]);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("C (creator) leaving the group drops C from their own task", async () => {
      await joinTaskAs(m, taskId);

      const { error } = await c.client.from("group_members").delete().eq("user_id", c.id);
      expect(error).toBeNull();
      expect(await adminParticipants(taskId)).toEqual([m.id]);
      expect(await adminTask(taskId)).not.toBeNull();
    });
  });

  describe("after leaving the group", () => {
    it("an ex-member reads no participants and cannot join a task of the former group (42501)", async () => {
      await joinTaskAs(m, taskId);
      const { error: leaveError } = await m.client.from("group_members").delete().eq("user_id", m.id);
      expect(leaveError).toBeNull();

      const { data, error } = await m.client.from("task_participants").select("user_id").eq("task_id", taskId);
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { error: joinError } = await joinTaskAs(m, taskId);
      expect(joinError?.code).toBe(PERMISSION_DENIED);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("a removed member loses their participation and is not re-enrolled when they return", async () => {
      await joinTaskAs(m, taskId);
      await a.client.from("group_members").delete().eq("user_id", m.id);
      expect(await adminParticipants(taskId)).toEqual([c.id]);

      await joinGroupAs(m, ga.joinCode);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("a participation row left behind by the join/leave race is seen by the group but not by the ex-member", async () => {
      // The row the accepted race can leave: planted with the service role because the cleanup trigger cannot be raced here.
      await m.client.from("group_members").delete().eq("user_id", m.id);
      const { error: plantError } = await adminClient()
        .from("task_participants")
        .insert({ task_id: taskId, user_id: m.id });
      expect(plantError).toBeNull();

      const { data: groupView } = await c.client.from("task_participants").select("user_id").eq("task_id", taskId);
      expect(groupView?.map((row) => row.user_id).sort()).toEqual(sorted(c.id, m.id));

      const { data: exMemberView } = await m.client.from("task_participants").select("user_id").eq("task_id", taskId);
      expect(exMemberView).toEqual([]);

      const { data: removed, error } = await m.client
        .from("task_participants")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", m.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(removed).toEqual([]);
      expect(await adminParticipants(taskId)).toEqual(sorted(c.id, m.id));
    });

    it("the creator who left and returned is not silently re-enrolled", async () => {
      await c.client.from("group_members").delete().eq("user_id", c.id);
      await joinGroupAs(c, ga.joinCode);
      expect(await adminParticipants(taskId)).toEqual([]);
    });
  });

  describe("cascades", () => {
    it("deleting the task removes its participants", async () => {
      await joinTaskAs(m, taskId);

      const { error } = await c.client.from("tasks").delete().eq("id", taskId);
      expect(error).toBeNull();
      expect(await adminParticipants(taskId)).toEqual([]);
    });

    it("deleting an account that created a task and still participates removes its rows without error", async () => {
      const d = await createTestUser();
      await joinGroupAs(d, ga.joinCode);
      const dTaskId = await createTaskAs(d, ga.id, "Feed the cat", "daily");
      await joinTaskAs(m, dTaskId);
      await joinTaskAs(d, taskId);
      expect(await adminParticipants(dTaskId)).toEqual(sorted(d.id, m.id));
      expect(await adminParticipants(taskId)).toEqual(sorted(c.id, d.id));

      await deleteTestUser(d);

      expect(await adminTask(dTaskId)).toBeNull();
      expect(await adminParticipants(dTaskId)).toEqual([]);
      expect(await adminParticipants(taskId)).toEqual([c.id]);
    });

    it("deleting the group removes the participants of its tasks without error", async () => {
      await joinTaskAs(m, taskId);

      const { data, error } = await a.client.from("groups").delete().eq("id", ga.id).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([{ id: ga.id }]);
      expect(await adminParticipants(taskId)).toEqual([]);

      const { count } = await adminClient()
        .from("task_participants")
        .select("*", { count: "exact", head: true })
        .eq("task_id", taskId);
      expect(count).toBe(0);
    });
  });
});
