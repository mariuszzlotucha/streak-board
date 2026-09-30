import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  adminMemberIds,
  createGroupAs,
  createTestUser,
  joinGroupAs,
  type TestGroup,
  type TestUser,
} from "../helpers/supabase";

// Expectations come from the PRD (Access Control, FR-003): the group creator
// manages the group (renames it, deletes it, removes members); every other
// member is an equal, and outsiders have no say. A regular member may leave.
// The creator stays in the group and leaves it only by deleting it.

const GA_NAME = "Group A";
const PERMISSION_DENIED = "42501";

describe("creator-only group permissions", () => {
  let a: TestUser; // owner of GA
  let m: TestUser; // member of GA
  let m2: TestUser; // member of GA
  let x: TestUser; // outsider, no group
  let ga: TestGroup;

  beforeAll(async () => {
    a = await createTestUser();
    m = await createTestUser();
    m2 = await createTestUser();
    x = await createTestUser();
  });

  beforeEach(async () => {
    ga = await createGroupAs(a, GA_NAME);
    await joinGroupAs(m, ga.joinCode);
    await joinGroupAs(m2, ga.joinCode);
  });

  async function adminGroupA() {
    const { data, error } = await adminClient().from("groups").select("id, name, owner_id, join_code").eq("id", ga.id);
    expect(error).toBeNull();
    return data;
  }

  const adminMemberIdsOfA = () => adminMemberIds(ga.id);

  const allMembers = () => [a.id, m.id, m2.id].sort();

  async function expectGaUntouched() {
    expect(await adminGroupA()).toEqual([{ id: ga.id, name: GA_NAME, owner_id: a.id, join_code: ga.joinCode }]);
    expect(await adminMemberIdsOfA()).toEqual(allMembers());
  }

  describe("owner control", () => {
    it("A renames GA, removes M2, and deletes GA (memberships cascade)", async () => {
      const { data: renamed, error: renameError } = await a.client
        .from("groups")
        .update({ name: "Renamed by A" })
        .eq("id", ga.id)
        .select("id");
      expect(renameError).toBeNull();
      expect(renamed).toEqual([{ id: ga.id }]);
      expect((await adminGroupA())?.[0]?.name).toBe("Renamed by A");

      const { data: removed, error: removeError } = await a.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", m2.id)
        .select("user_id");
      expect(removeError).toBeNull();
      expect(removed).toEqual([{ user_id: m2.id }]);
      expect(await adminMemberIdsOfA()).toEqual([a.id, m.id].sort());

      const { data: deleted, error: deleteError } = await a.client.from("groups").delete().eq("id", ga.id).select("id");
      expect(deleteError).toBeNull();
      expect(deleted).toEqual([{ id: ga.id }]);
      expect(await adminGroupA()).toEqual([]);
      expect(await adminMemberIdsOfA()).toEqual([]);
    });
  });

  describe("non-owners cannot rename GA", () => {
    it("M's and X's update of GA's name affects 0 rows; A's rename works (control)", async () => {
      for (const user of [m, x]) {
        const { data, error } = await user.client
          .from("groups")
          .update({ name: "Renamed by outsider" })
          .eq("id", ga.id)
          .select("id");
        expect(error).toBeNull();
        expect(data).toEqual([]);
        await expectGaUntouched();
      }

      const { data: allowed, error } = await a.client
        .from("groups")
        .update({ name: "Renamed by A" })
        .eq("id", ga.id)
        .select("id");
      expect(error).toBeNull();
      expect(allowed).toEqual([{ id: ga.id }]);
      expect((await adminGroupA())?.[0]?.name).toBe("Renamed by A");
    });
  });

  describe("non-owners cannot delete GA", () => {
    it("M's delete of GA affects 0 rows; GA and all memberships survive; A's delete works (control)", async () => {
      const { data, error } = await m.client.from("groups").delete().eq("id", ga.id).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      await expectGaUntouched();

      const { data: allowed, error: ownerError } = await a.client.from("groups").delete().eq("id", ga.id).select("id");
      expect(ownerError).toBeNull();
      expect(allowed).toEqual([{ id: ga.id }]);
      expect(await adminGroupA()).toEqual([]);
      expect(await adminMemberIdsOfA()).toEqual([]);
    });
  });

  describe("non-owners cannot remove other members", () => {
    it("M removing M2 affects 0 rows; M2 stays a member; A removing M2 works (control)", async () => {
      const { data, error } = await m.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", m2.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      await expectGaUntouched();

      const { data: allowed, error: ownerError } = await a.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", m2.id)
        .select("user_id");
      expect(ownerError).toBeNull();
      expect(allowed).toEqual([{ user_id: m2.id }]);
      expect(await adminMemberIdsOfA()).toEqual([a.id, m.id].sort());
    });

    it("X removing anyone in GA affects 0 rows; A removing M works (control)", async () => {
      for (const victim of [a, m, m2]) {
        const { data, error } = await x.client
          .from("group_members")
          .delete()
          .eq("group_id", ga.id)
          .eq("user_id", victim.id)
          .select("user_id");
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
      // Also an unfiltered-by-user delete of the whole group's rows.
      const { data: sweep, error: sweepError } = await x.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .select("user_id");
      expect(sweepError).toBeNull();
      expect(sweep).toEqual([]);
      await expectGaUntouched();

      const { data: allowed, error } = await a.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", m.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(allowed).toEqual([{ user_id: m.id }]);
      expect(await adminMemberIdsOfA()).toEqual([a.id, m2.id].sort());
    });
  });

  describe("owner cannot rewrite protected columns", () => {
    it("A cannot change owner_id, join_code or id of GA (42501); state unchanged; renaming works (control)", async () => {
      const attempts = [{ owner_id: m.id }, { join_code: `forged-${randomUUID()}` }, { id: randomUUID() }] as const;

      for (const change of attempts) {
        const { data, error } = await a.client.from("groups").update(change).eq("id", ga.id).select("id");
        expect(error?.code).toBe(PERMISSION_DENIED);
        expect(data).toBeNull();
        await expectGaUntouched();
      }

      const { data: allowed, error } = await a.client
        .from("groups")
        .update({ name: "Renamed by A" })
        .eq("id", ga.id)
        .select("id");
      expect(error).toBeNull();
      expect(allowed).toEqual([{ id: ga.id }]);
    });
  });

  describe("owner stays in the group", () => {
    it("A cannot remove or leave their own membership (0 rows); still owner and member; M leaving works (control)", async () => {
      const { data, error } = await a.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", a.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      await expectGaUntouched();

      // Control: the same own-row delete succeeds for a regular member.
      const { data: left, error: leaveError } = await m.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", m.id)
        .select("user_id");
      expect(leaveError).toBeNull();
      expect(left).toEqual([{ user_id: m.id }]);
      expect(await adminMemberIdsOfA()).toEqual([a.id, m2.id].sort());
    });
  });

  describe("members can leave", () => {
    it("M leaves via own row but cannot delete M2's row; A is unaffected", async () => {
      const { data: denied, error: deniedError } = await m.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", m2.id)
        .select("user_id");
      expect(deniedError).toBeNull();
      expect(denied).toEqual([]);
      await expectGaUntouched();

      const { data: left, error } = await m.client
        .from("group_members")
        .delete()
        .eq("group_id", ga.id)
        .eq("user_id", m.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(left).toEqual([{ user_id: m.id }]);
      expect(await adminMemberIdsOfA()).toEqual([a.id, m2.id].sort());
      expect((await adminGroupA())?.[0]?.owner_id).toBe(a.id);
    });
  });
});
