import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import {
  adminCheckoffs,
  adminClient,
  adminMemberIds,
  adminParticipants,
  adminTask,
  anonClient,
  checkOffAs,
  createGroupAs,
  createTaskAs,
  createTestUser,
  joinGroupAs,
  joinTaskAs,
  type TestUser,
  utcDay,
} from "../helpers/supabase";

// Expectations come from the S-15 plan (context/changes/account-deletion/plan.md, Phase 1): deleting an account takes
// the person's data (account, nickname, membership, own participation and check-offs, security log entries) but not
// the data other people use. The group of an owner with other members passes to the successor the owner chooses (with
// the new owner's notice pending); an owner who is the group's only member deletes the group with the account. The
// tasks the account created stay in their groups with everyone's progress and pass to the group's owner, also in a
// group the account had left. A missing or invalid successor (P0003) changes nothing.

const PERMISSION_DENIED = "42501";
const INVALID_SUCCESSOR = "P0003";

async function adminUserExists(user: TestUser): Promise<boolean> {
  const { error } = await adminClient().auth.admin.getUserById(user.id);
  if (error?.code === "user_not_found") return false;
  if (error) throw new Error(`adminUserExists failed: ${error.message}`);
  return true;
}

async function adminNicknameCount(user: TestUser): Promise<number> {
  const { count, error } = await adminClient()
    .from("nicknames")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (error) throw new Error(`adminNicknameCount failed: ${error.message}`);
  return count ?? 0;
}

async function adminRowsOf(table: "group_members" | "task_participants" | "task_checkoffs", user: TestUser) {
  const { count, error } = await adminClient()
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (error) throw new Error(`adminRowsOf(${table}) failed: ${error.message}`);
  return count ?? 0;
}

async function adminGroup(groupId: string) {
  const { data, error } = await adminClient()
    .from("groups")
    .select("owner_id, owner_notice_pending")
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(`adminGroup failed: ${error.message}`);
  return data;
}

// The security log entries the user is the actor of (every password sign-in writes a `login` entry), read through
// GoTrue's admin audit endpoint: PostgREST does not expose the auth schema. The endpoint searches by actor name (the
// e-mail address); the actor id makes the match exact.
async function auditEntriesOf(user: TestUser): Promise<number> {
  const key = inject("supabaseServiceRoleKey");
  const url = new URL("/auth/v1/admin/audit", inject("supabaseUrl"));
  url.searchParams.set("query", `author:${user.email}`);
  url.searchParams.set("per_page", "100");
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`auditEntriesOf failed: HTTP ${response.status}`);
  const rows = (await response.json()) as { payload?: { actor_id?: string } }[];
  return rows.filter((row) => row.payload?.actor_id === user.id).length;
}

const tick = (user: TestUser, period: string) => `${user.id}:${period}`;
const stored = async (taskId: string) =>
  (await adminCheckoffs(taskId)).map((row) => `${row.user_id}:${row.period}`).sort();

describe("account deletion", () => {
  describe("a member deletes their account", () => {
    it("removes the person's data; their tasks pass to the owner with everyone else's progress", async () => {
      const today = utcDay(0);
      const a = await createTestUser(); // owner
      const c = await createTestUser(); // other member, creator of a task
      const d = await createTestUser(); // the member who deletes their account
      const ga = await createGroupAs(a, "Group A");
      await joinGroupAs(c, ga.joinCode);
      await joinGroupAs(d, ga.joinCode);

      const cTask = await createTaskAs(c, ga.id, "Water the plants", "daily");
      const dTask = await createTaskAs(d, ga.id, "Feed the cat", "daily");
      expect((await joinTaskAs(d, cTask)).error).toBeNull();
      expect((await joinTaskAs(c, dTask)).error).toBeNull();
      for (const [user, task] of [
        [d, cTask],
        [d, dTask],
        [c, cTask],
        [c, dTask],
      ] as const) {
        expect((await checkOffAs(user, task, today)).error).toBeNull();
      }
      expect(await auditEntriesOf(d)).toBeGreaterThan(0);

      const { error } = await d.client.rpc("delete_own_account", {});
      expect(error).toBeNull();

      expect(await adminUserExists(d)).toBe(false);
      expect(await adminNicknameCount(d)).toBe(0);
      expect(await adminRowsOf("group_members", d)).toBe(0);
      expect(await adminRowsOf("task_participants", d)).toBe(0);
      expect(await adminRowsOf("task_checkoffs", d)).toBe(0);
      expect(await auditEntriesOf(d)).toBe(0);

      // The task stays in the group, managed by the owner, with the other member's participation and check-off.
      expect(await adminTask(dTask)).toMatchObject({ id: dTask, group_id: ga.id, created_by: a.id });
      expect(await adminParticipants(dTask)).toEqual([c.id]);
      expect(await stored(dTask)).toEqual([tick(c, today)]);
      expect(await stored(cTask)).toEqual([tick(c, today)]);

      // The group and its owner are untouched; the owner gets no notice for tasks alone.
      expect(await adminGroup(ga.id)).toEqual({ owner_id: a.id, owner_notice_pending: false });
      expect(await adminMemberIds(ga.id)).toEqual([a.id, c.id].sort());
      expect(await adminUserExists(a)).toBe(true);
    });

    it("tasks in a group the account had left pass to that group's owner", async () => {
      const a = await createTestUser(); // owner of GA
      const b = await createTestUser(); // owner of GB
      const d = await createTestUser();
      const ga = await createGroupAs(a, "Group A");
      const gb = await createGroupAs(b, "Group B");

      await joinGroupAs(d, ga.joinCode);
      const leftBehind = await createTaskAs(d, ga.id, "Left behind", "once");
      const { error: leaveError } = await d.client.from("group_members").delete().eq("user_id", d.id);
      expect(leaveError).toBeNull();
      await joinGroupAs(d, gb.joinCode);
      const current = await createTaskAs(d, gb.id, "Current task", "once");

      const { error } = await d.client.rpc("delete_own_account", {});
      expect(error).toBeNull();

      expect(await adminUserExists(d)).toBe(false);
      expect(await adminTask(leftBehind)).toMatchObject({ group_id: ga.id, created_by: a.id });
      expect(await adminTask(current)).toMatchObject({ group_id: gb.id, created_by: b.id });
    });

    it("an account without a group is deleted; a successor it sends is ignored", async () => {
      const lone = await createTestUser();
      const other = await createTestUser();

      const { error } = await lone.client.rpc("delete_own_account", { p_successor: other.id });
      expect(error).toBeNull();
      expect(await adminUserExists(lone)).toBe(false);
      expect(await adminUserExists(other)).toBe(true);
    });
  });

  describe("an owner with other members deletes their account", () => {
    it("the chosen member takes over the group (notice pending) and the owner's tasks; everyone keeps their progress", async () => {
      const today = utcDay(0);
      const a = await createTestUser(); // owner who deletes the account
      const m = await createTestUser(); // successor
      const m2 = await createTestUser();
      const ga = await createGroupAs(a, "Group A");
      await joinGroupAs(m, ga.joinCode);
      await joinGroupAs(m2, ga.joinCode);

      const aTask = await createTaskAs(a, ga.id, "Owner's task", "daily");
      const m2Task = await createTaskAs(m2, ga.id, "Member's task", "daily");
      expect((await joinTaskAs(m, aTask)).error).toBeNull();
      expect((await checkOffAs(a, aTask, today)).error).toBeNull();
      expect((await checkOffAs(m, aTask, today)).error).toBeNull();
      expect((await checkOffAs(m2, m2Task, today)).error).toBeNull();

      const { error } = await a.client.rpc("delete_own_account", { p_successor: m.id });
      expect(error).toBeNull();

      expect(await adminUserExists(a)).toBe(false);
      expect(await adminGroup(ga.id)).toEqual({ owner_id: m.id, owner_notice_pending: true });
      expect(await adminMemberIds(ga.id)).toEqual([m.id, m2.id].sort());
      expect(await adminTask(aTask)).toMatchObject({ group_id: ga.id, created_by: m.id });
      expect(await adminTask(m2Task)).toMatchObject({ created_by: m2.id });
      // The successor manages the task; it does not become a participant on top of what they chose.
      expect(await adminParticipants(aTask)).toEqual([m.id]);
      expect(await stored(aTask)).toEqual([tick(m, today)]);
      expect(await stored(m2Task)).toEqual([tick(m2, today)]);
    });

    it("without a successor, with an outsider or with themselves as successor it fails (P0003) and changes nothing", async () => {
      const today = utcDay(0);
      const a = await createTestUser();
      const m = await createTestUser();
      const outsider = await createTestUser();
      const ga = await createGroupAs(a, "Group A");
      await joinGroupAs(m, ga.joinCode);
      const aTask = await createTaskAs(a, ga.id, "Owner's task", "daily");
      expect((await checkOffAs(a, aTask, today)).error).toBeNull();
      const auditBefore = await auditEntriesOf(a);
      expect(auditBefore).toBeGreaterThan(0);

      for (const args of [{}, { p_successor: outsider.id }, { p_successor: a.id }, { p_successor: randomUUID() }]) {
        const { error } = await a.client.rpc("delete_own_account", args);
        expect(error?.code).toBe(INVALID_SUCCESSOR);

        expect(await adminUserExists(a)).toBe(true);
        expect(await adminNicknameCount(a)).toBe(1);
        expect(await adminGroup(ga.id)).toEqual({ owner_id: a.id, owner_notice_pending: false });
        expect(await adminMemberIds(ga.id)).toEqual([a.id, m.id].sort());
        expect(await adminTask(aTask)).toMatchObject({ created_by: a.id });
        expect(await stored(aTask)).toEqual([tick(a, today)]);
        expect(await auditEntriesOf(a)).toBe(auditBefore);
      }
    });
  });

  describe("the owner who is the group's only member deletes their account", () => {
    it("the group, its tasks and their check-offs go with the account", async () => {
      const today = utcDay(0);
      const s = await createTestUser();
      const gs = await createGroupAs(s, "Solo group");
      const task = await createTaskAs(s, gs.id, "Solo task", "daily");
      expect((await checkOffAs(s, task, today)).error).toBeNull();

      const { error } = await s.client.rpc("delete_own_account", {});
      expect(error).toBeNull();

      expect(await adminUserExists(s)).toBe(false);
      expect(await adminGroup(gs.id)).toBeNull();
      expect(await adminTask(task)).toBeNull();
      expect(await stored(task)).toEqual([]);
    });
  });

  describe("who may call the functions", () => {
    it("the anonymous client cannot call delete_own_account (42501)", async () => {
      const { error } = await anonClient().rpc("delete_own_account", {});
      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it("a signed-in user cannot call delete_account, not even for their own id (42501); the account stays", async () => {
      const u = await createTestUser();
      const victim = await createTestUser();

      for (const target of [u, victim]) {
        const { error } = await u.client.rpc("delete_account", { p_user_id: target.id });
        expect(error?.code).toBe(PERMISSION_DENIED);
        expect(await adminUserExists(target)).toBe(true);
      }
    });
  });
});
