import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { listGroupMembers } from "@/lib/groups";
import { getOwnNickname } from "@/lib/nicknames";
import {
  adminClient,
  anonClient,
  createGroupAs,
  createTestUser,
  joinGroupAs,
  type TestUser,
} from "../helpers/supabase";

// Expectations come from the S-14 plan (context/changes/nickname/plan.md, Phase 1, migration A): a nickname lives in
// public.nicknames, one row per account, written only through set_nickname (an upsert of the caller's own row), unique
// exactly as typed; a signed-in user reads only their own row; anon has no access; list_group_members adds the
// nickname of every member through a left join, NULL for a member without a row; and the app's listGroupMembers never
// passes on any other field. Since the second release (Phase 2, migration B) the RPC itself returns no e-mail column.

const UNIQUE_VIOLATION = "23505";
const RLS_VIOLATION = "42501";

/** A nickname no other account has: `<base>-<6 hex>` (at most 24 characters for a base of up to 17). */
const fresh = (base: string): string => `${base}-${randomUUID().replaceAll("-", "").slice(0, 6)}`;

async function adminNicknameOf(user: TestUser): Promise<string | null> {
  const { data, error } = await adminClient().from("nicknames").select("nickname").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(`adminNicknameOf failed: ${error.message}`);
  return data?.nickname ?? null;
}

async function adminDeleteNickname(user: TestUser): Promise<void> {
  const { error } = await adminClient().from("nicknames").delete().eq("user_id", user.id);
  if (error) throw new Error(`adminDeleteNickname failed: ${error.message}`);
}

describe("nicknames", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await createTestUser();
    b = await createTestUser();
  });

  describe("set_nickname", () => {
    it("creates the caller's own row, and a second call changes it", async () => {
      await adminDeleteNickname(a);
      expect(await adminNicknameOf(a)).toBeNull();

      const first = fresh("First");
      const created = await a.client.rpc("set_nickname", { p_nickname: first });
      expect(created.error).toBeNull();
      expect(await adminNicknameOf(a)).toBe(first);

      const second = fresh("Second");
      const changed = await a.client.rpc("set_nickname", { p_nickname: second });
      expect(changed.error).toBeNull();
      expect(await adminNicknameOf(a)).toBe(second);
      // Still one row: the change updated it in place.
      const { count, error } = await adminClient()
        .from("nicknames")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", a.id);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });

    it("refuses another account's nickname with 23505, leaving both rows as they were", async () => {
      const taken = fresh("Taken");
      expect((await a.client.rpc("set_nickname", { p_nickname: taken })).error).toBeNull();
      const before = await adminNicknameOf(b);

      const { error } = await b.client.rpc("set_nickname", { p_nickname: taken });
      expect(error?.code).toBe(UNIQUE_VIOLATION);
      expect(await adminNicknameOf(a)).toBe(taken);
      expect(await adminNicknameOf(b)).toBe(before);
    });

    it("accepts the same nickname in another case: uniqueness is exact", async () => {
      const lower = fresh("kasia");
      const upper = `K${lower.slice(1)}`;
      expect((await a.client.rpc("set_nickname", { p_nickname: lower })).error).toBeNull();

      const { error } = await b.client.rpc("set_nickname", { p_nickname: upper });
      expect(error).toBeNull();
      expect(await adminNicknameOf(a)).toBe(lower);
      expect(await adminNicknameOf(b)).toBe(upper);
    });

    it("is not executable by anon (42501)", async () => {
      const { error } = await anonClient().rpc("set_nickname", { p_nickname: fresh("Anon") });
      expect(error?.code).toBe(RLS_VIOLATION);
    });
  });

  describe("reading nicknames", () => {
    it("a user reads their own row and never another account's", async () => {
      const own = fresh("Own");
      expect((await a.client.rpc("set_nickname", { p_nickname: own })).error).toBeNull();
      expect(await adminNicknameOf(b)).not.toBeNull();

      expect(await getOwnNickname(a.client, a.id)).toBe(own);
      const { data, error } = await a.client.from("nicknames").select("user_id, nickname").eq("user_id", b.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
      const { data: all, error: allError } = await a.client.from("nicknames").select("user_id");
      expect(allError).toBeNull();
      expect(all).toEqual([{ user_id: a.id }]);
    });

    it("getOwnNickname answers null for an account without a row", async () => {
      const user = await createTestUser();
      await adminDeleteNickname(user);
      expect(await getOwnNickname(user.client, user.id)).toBeNull();
    });

    it("anon cannot read the table (42501)", async () => {
      const { data, error } = await anonClient().from("nicknames").select("nickname");
      expect(error?.code).toBe(RLS_VIOLATION);
      expect(data).toBeNull();
    });
  });

  describe("list_group_members", () => {
    it("returns each member's nickname, and NULL once a member has no row (left join keeps the member)", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      const group = await createGroupAs(owner, "Nickname group");
      await joinGroupAs(member, group.joinCode);

      const { data: listed, error } = await owner.client.rpc("list_group_members", { p_group_id: group.id });
      expect(error).toBeNull();
      expect((listed ?? []).map((row) => [row.user_id, row.nickname])).toEqual([
        [owner.id, owner.nickname],
        [member.id, member.nickname],
      ]);

      await adminDeleteNickname(member);
      const { data: after, error: afterError } = await owner.client.rpc("list_group_members", {
        p_group_id: group.id,
      });
      expect(afterError).toBeNull();
      expect((after ?? []).map((row) => [row.user_id, row.nickname])).toEqual([
        [owner.id, owner.nickname],
        [member.id, null],
      ]);
    });

    it("the raw RPC returns exactly is_owner, joined_at, nickname and user_id, and no value holds an address", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      const group = await createGroupAs(owner, "Nickname group");
      await joinGroupAs(member, group.joinCode);

      const { data: listed, error } = await owner.client.rpc("list_group_members", { p_group_id: group.id });
      expect(error).toBeNull();
      expect(listed).toHaveLength(2);
      for (const row of listed ?? []) {
        expect(Object.keys(row).sort()).toEqual(["is_owner", "joined_at", "nickname", "user_id"]);
        for (const value of Object.values(row)) expect(String(value)).not.toContain("@");
      }
    });

    it("listGroupMembers passes on exactly user_id, nickname, joined_at and is_owner (never the e-mail)", async () => {
      const owner = await createTestUser();
      const group = await createGroupAs(owner, "Nickname group");

      const members = await listGroupMembers(owner.client, group.id);
      expect(members).toHaveLength(1);
      expect(Object.keys(members[0])).toEqual(["user_id", "nickname", "joined_at", "is_owner"]);
      expect(members[0]).toMatchObject({ user_id: owner.id, nickname: owner.nickname, is_owner: true });
      expect(JSON.stringify(members)).not.toContain("@");
    });
  });
});
