import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  adminMemberIds,
  anonClient,
  createGroupAs,
  createTestUser,
  joinGroupAs,
  type TestGroup,
  type TestUser,
} from "../helpers/supabase";

// Expectations come from the PRD (Access Control, FR-003): a group is a private
// shared space; only its members see it, only its creator manages it, and
// outsiders (other groups' users, users without a group, anonymous clients)
// can neither read nor change it.

const GA_NAME = "Group A";
const RLS_VIOLATION = "42501";

describe("cross-group data isolation", () => {
  let a: TestUser; // owner of GA
  let a2: TestUser; // member of GA
  let b: TestUser; // owner of GB
  let c: TestUser; // no group, ever
  let ga: TestGroup;
  let gb: TestGroup;

  beforeAll(async () => {
    a = await createTestUser();
    a2 = await createTestUser();
    b = await createTestUser();
    c = await createTestUser();
  });

  beforeEach(async () => {
    ga = await createGroupAs(a, GA_NAME);
    await joinGroupAs(a2, ga.joinCode);
    gb = await createGroupAs(b, "Group B");
  });

  async function adminGroupA() {
    const { data, error } = await adminClient().from("groups").select("id, name").eq("id", ga.id);
    expect(error).toBeNull();
    return data;
  }

  const adminMemberIdsOfA = () => adminMemberIds(ga.id);

  describe("positive controls: members see their own group", () => {
    it("owner A and member A2 read GA and its members", async () => {
      for (const user of [a, a2]) {
        const { data: groups, error } = await user.client.from("groups").select("id, name").eq("id", ga.id);
        expect(error).toBeNull();
        expect(groups).toEqual([{ id: ga.id, name: GA_NAME }]);

        const { data: members, error: membersError } = await user.client
          .from("group_members")
          .select("user_id")
          .eq("group_id", ga.id);
        expect(membersError).toBeNull();
        expect((members ?? []).map((row) => row.user_id).sort()).toEqual([a.id, a2.id].sort());

        const { data: listed, error: listError } = await user.client.rpc("list_group_members", {
          p_group_id: ga.id,
        });
        expect(listError).toBeNull();
        expect((listed ?? []).map((row) => row.email).sort()).toEqual([a.email, a2.email].sort());
      }
    });

    it("member A2 sees GA only, never GB", async () => {
      const { data, error } = await a2.client.from("groups").select("id");
      expect(error).toBeNull();
      expect(data?.map((row) => row.id)).toEqual([ga.id]);
      expect(data?.map((row) => row.id)).not.toContain(gb.id);
    });
  });

  describe("outsiders cannot read GA", () => {
    it("B and C get no GA row from a filtered select on groups (GA exists, B sees only GB)", async () => {
      expect(await adminGroupA()).toEqual([{ id: ga.id, name: GA_NAME }]);

      for (const outsider of [b, c]) {
        const { data, error } = await outsider.client.from("groups").select("id, name").eq("id", ga.id);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    });

    it("unfiltered select on groups returns only the caller's own group (B) or nothing (C)", async () => {
      const { data: bRows, error: bError } = await b.client.from("groups").select("id");
      expect(bError).toBeNull();
      expect(bRows?.map((row) => row.id)).toEqual([gb.id]);

      const { data: cRows, error: cError } = await c.client.from("groups").select("id");
      expect(cError).toBeNull();
      expect(cRows).toEqual([]);
    });

    it("B and C get no rows from group_members of GA (members exist)", async () => {
      expect(await adminMemberIdsOfA()).toEqual([a.id, a2.id].sort());

      for (const outsider of [b, c]) {
        const { data, error } = await outsider.client.from("group_members").select("user_id").eq("group_id", ga.id);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    });

    it("B and C get an empty set from list_group_members(GA); no emails leak", async () => {
      // Control: a member gets the emails for the very same call.
      const { data: asMember, error: memberError } = await a.client.rpc("list_group_members", {
        p_group_id: ga.id,
      });
      expect(memberError).toBeNull();
      expect(asMember).toHaveLength(2);

      for (const outsider of [b, c]) {
        const { data, error } = await outsider.client.rpc("list_group_members", { p_group_id: ga.id });
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    });
  });

  describe("outsiders cannot change GA", () => {
    it("owner A can rename GA (control), B's update of GA's name affects 0 rows", async () => {
      const { data: denied, error } = await b.client
        .from("groups")
        .update({ name: "Hijacked by B" })
        .eq("id", ga.id)
        .select("id");
      expect(error).toBeNull();
      expect(denied).toEqual([]);
      expect(await adminGroupA()).toEqual([{ id: ga.id, name: GA_NAME }]);

      const { data: allowed, error: ownerError } = await a.client
        .from("groups")
        .update({ name: "Renamed by A" })
        .eq("id", ga.id)
        .select("id");
      expect(ownerError).toBeNull();
      expect(allowed).toEqual([{ id: ga.id }]);
      expect(await adminGroupA()).toEqual([{ id: ga.id, name: "Renamed by A" }]);
    });

    it("B's delete of GA affects 0 rows; GA and its memberships survive", async () => {
      const { data, error } = await b.client.from("groups").delete().eq("id", ga.id).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);

      expect(await adminGroupA()).toEqual([{ id: ga.id, name: GA_NAME }]);
      expect(await adminMemberIdsOfA()).toEqual([a.id, a2.id].sort());
    });

    it("B cannot insert itself into GA's group_members (42501); C can join GA only via its join code (control)", async () => {
      // No .select(): asking for the row back would need SELECT visibility and could mask the INSERT policy.
      const { data, error } = await b.client.from("group_members").insert({ group_id: ga.id, user_id: b.id });
      expect(error?.code).toBe(RLS_VIOLATION);
      expect(data).toBeNull();
      expect(await adminMemberIdsOfA()).toEqual([a.id, a2.id].sort());

      // Control: the sanctioned path (join_group with GA's code) does work for a user without a group.
      const joinedGroupId = await joinGroupAs(c, ga.joinCode);
      expect(joinedGroupId).toBe(ga.id);
      expect(await adminMemberIdsOfA()).toEqual([a.id, a2.id, c.id].sort());
    });

    it("C (no group) cannot create a group owned by A (42501); creating its own group works (control)", async () => {
      // No .select(): RETURNING needs SELECT visibility, which C lacks, and would fail even if the INSERT policy were open.
      const { data, error } = await c.client.from("groups").insert({ name: "Forged", owner_id: a.id });
      expect(error?.code).toBe(RLS_VIOLATION);
      expect(data).toBeNull();

      const { data: forged, error: adminError } = await adminClient().from("groups").select("id").eq("owner_id", a.id);
      expect(adminError).toBeNull();
      expect(forged?.map((row) => row.id)).toEqual([ga.id]);

      // Control: the same insert with C's own id succeeds, so the denial above came from RLS.
      const own = await createGroupAs(c, "C's own group");
      expect(own.id).not.toBe(ga.id);
    });
  });

  describe("anonymous client", () => {
    it("reads nothing from groups or group_members while the data exists", async () => {
      expect(await adminGroupA()).toEqual([{ id: ga.id, name: GA_NAME }]);
      expect(await adminMemberIdsOfA()).toHaveLength(2);

      const anon = anonClient();
      const { data: groups, error: groupsError } = await anon.from("groups").select("id");
      expect(groupsError?.code ?? null).toSatisfy((code: string | null) => code === null || code === RLS_VIOLATION);
      expect(groups ?? []).toEqual([]);

      const { data: members, error: membersError } = await anon.from("group_members").select("user_id");
      expect(membersError?.code ?? null).toSatisfy((code: string | null) => code === null || code === RLS_VIOLATION);
      expect(members ?? []).toEqual([]);
    });

    it("cannot insert into groups", async () => {
      const { data, error } = await anonClient().from("groups").insert({ name: "Anon group", owner_id: a.id });
      expect(error).not.toBeNull();
      expect(data).toBeNull();

      const { data: byName, error: adminError } = await adminClient()
        .from("groups")
        .select("id")
        .eq("name", "Anon group");
      expect(adminError).toBeNull();
      expect(byName).toEqual([]);
    });

    it("is rejected by join_group, list_group_members and preview_group (members can call them, control)", async () => {
      // Controls: the same calls succeed for an authenticated member.
      const { data: preview, error: previewError } = await a.client.rpc("preview_group", {
        p_join_code: ga.joinCode,
      });
      expect(previewError).toBeNull();
      expect(preview).toBe(GA_NAME);
      const { data: listed, error: listError } = await a.client.rpc("list_group_members", { p_group_id: ga.id });
      expect(listError).toBeNull();
      expect(listed).toHaveLength(2);

      const anon = anonClient();
      const join = await anon.rpc("join_group", { p_join_code: ga.joinCode });
      expect(join.error).not.toBeNull();
      expect(join.data).toBeNull();

      const list = await anon.rpc("list_group_members", { p_group_id: ga.id });
      expect(list.error).not.toBeNull();
      expect(list.data).toBeNull();

      const previewAnon = await anon.rpc("preview_group", { p_join_code: ga.joinCode });
      expect(previewAnon.error).not.toBeNull();
      expect(previewAnon.data).toBeNull();

      expect(await adminMemberIdsOfA()).toEqual([a.id, a2.id].sort());
    });
  });
});
