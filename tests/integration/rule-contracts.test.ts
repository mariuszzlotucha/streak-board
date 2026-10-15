import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeGroupName, normalizeJoinCode } from "@/lib/group-rules";
import { TASK_RECURRENCES, normalizeRecurrence, normalizeTaskTitle } from "@/lib/task-rules";
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

// Contract tests for the rules that exist twice, in the TypeScript normalisers and in the database (the CHECKs
// groups_name_length, tasks_title_length and tasks_recurrence_allowed, the join_code default and join_group). Each
// boundary input goes through both sides, so drift on either side turns red. The database side uses the real insert
// path of a signed-in client, the way the routes write: the normalised value when TS accepts, the raw input when it
// rejects.
//
// Cleanup: accepted cases go through createGroupAs/createTaskAs, which track the group for afterEach(cleanupGroups)
// (an owner can own only one group, hence one accepted group name per `it`). Rejected cases use a raw insert, because
// nothing is created; an untracked group would make afterAll(cleanupUsers) fail on `owner_id ... on delete restrict`.

const CHECK_VIOLATION = "23514";
const NO_DATA_FOUND = "P0002";
const UNTRANSLATABLE_CHARACTER = "22P05";

const NBSP = String.fromCodePoint(0x00a0);
const EM_SPACE = String.fromCodePoint(0x2003);
const VT = String.fromCodePoint(0x000b);
const FF = String.fromCodePoint(0x000c);
const NUL = String.fromCodePoint(0x0000);

const ASCII_80 = "a".repeat(80);
const EMOJI_80 = "😀".repeat(80);

// Inputs both sides accept, with the value TS hands to the database.
const ACCEPTED_NAMES: { label: string; input: string; normalized: string }[] = [
  { label: "NBSP", input: NBSP, normalized: NBSP },
  { label: "EM SPACE", input: EM_SPACE, normalized: EM_SPACE },
  { label: "VT", input: VT, normalized: VT },
  { label: "FF", input: FF, normalized: FF },
  { label: "one character", input: "a", normalized: "a" },
  { label: "80 ASCII", input: ASCII_80, normalized: ASCII_80 },
  { label: "80 emoji", input: EMOJI_80, normalized: EMOJI_80 },
  { label: "5 spaces + 80 characters + 2 tabs", input: `     ${ASCII_80}\t\t`, normalized: ASCII_80 },
];

// Inputs both sides reject; the raw input is what reaches the database.
const REJECTED_NAMES: { label: string; input: string }[] = [
  { label: "empty", input: "" },
  { label: "space", input: " " },
  { label: "tab", input: "\t" },
  { label: "CRLF", input: "\r\n" },
  { label: "81 ASCII", input: "a".repeat(81) },
  { label: "81 emoji", input: "😀".repeat(81) },
  { label: "5 spaces + 81 characters + 2 tabs", input: `     ${"a".repeat(81)}\t\t` },
];

describe("rules duplicated in SQL and TS", () => {
  let owner: TestUser;
  let joiner: TestUser;

  beforeAll(async () => {
    owner = await createTestUser();
    joiner = await createTestUser();
  });

  async function adminGroupNameOf(groupId: string): Promise<string> {
    const { data, error } = await adminClient().from("groups").select("name").eq("id", groupId).single();
    if (error) throw new Error(`adminGroupNameOf failed: ${error.message}`);
    return data.name;
  }

  async function adminGroupsOf(user: TestUser): Promise<string[]> {
    const { data, error } = await adminClient().from("groups").select("id").eq("owner_id", user.id);
    if (error) throw new Error(`adminGroupsOf failed: ${error.message}`);
    return data.map((row) => row.id);
  }

  describe("group name: normalizeGroupName and groups_name_length", () => {
    for (const { label, input, normalized } of ACCEPTED_NAMES) {
      it(`both accept ${label}`, async () => {
        expect(normalizeGroupName(input)).toBe(normalized);

        const group = await createGroupAs(owner, normalized);
        expect(await adminGroupNameOf(group.id)).toBe(normalized);
      });
    }

    it("both reject empty, space, tab, CRLF, 81 ASCII, 81 emoji and the padded 81 (23514)", async () => {
      for (const { label, input } of REJECTED_NAMES) {
        expect(normalizeGroupName(input), label).toBeNull();

        const { data, error } = await owner.client.from("groups").insert({ name: input, owner_id: owner.id });
        expect(error?.code, label).toBe(CHECK_VIOLATION);
        expect(data, label).toBeNull();
      }
      expect(await adminGroupsOf(owner)).toEqual([]);
    });

    // Known drift, pinned as it is and not fixed: TS keeps a NUL character, PostgREST cannot pass it to Postgres and
    // answers HTTP 400 with 22P05 before any CHECK runs. Rejecting NUL in normalizeGroupName changes behaviour and is a
    // separate change; when that is done this test turns red and becomes an equivalence row above.
    it("known drift: TS accepts a NUL character, PostgREST rejects it with 400 and 22P05", async () => {
      const input = `Team${NUL}A`;
      expect(normalizeGroupName(input)).toBe(input);

      const { data, error, status } = await owner.client.from("groups").insert({ name: input, owner_id: owner.id });
      expect(status).toBe(400);
      expect(error?.code).toBe(UNTRANSLATABLE_CHARACTER);
      expect(data).toBeNull();
      expect(await adminGroupsOf(owner)).toEqual([]);
    });
  });

  describe("task title: normalizeTaskTitle and tasks_title_length", () => {
    let group: TestGroup;

    beforeEach(async () => {
      group = await createGroupAs(owner, "Contract group");
    });

    async function rawTaskInsert(title: string) {
      return owner.client.from("tasks").insert({ group_id: group.id, created_by: owner.id, title, recurrence: "once" });
    }

    async function adminTaskCount(): Promise<number> {
      const { count, error } = await adminClient()
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("group_id", group.id);
      if (error) throw new Error(`adminTaskCount failed: ${error.message}`);
      return count ?? 0;
    }

    it("both accept NBSP, 80 emoji and the padded 80", async () => {
      const accepted = [
        { input: NBSP, normalized: NBSP },
        { input: EMOJI_80, normalized: EMOJI_80 },
        { input: `     ${ASCII_80}\t\t`, normalized: ASCII_80 },
      ];
      for (const { input, normalized } of accepted) {
        expect(normalizeTaskTitle(input)).toBe(normalized);

        const taskId = await createTaskAs(owner, group.id, normalized, "once");
        expect((await adminTask(taskId))?.title).toBe(normalized);
      }
    });

    it("both reject 81 emoji and the padded 81 (23514)", async () => {
      for (const input of ["😀".repeat(81), `     ${"a".repeat(81)}\t\t`]) {
        expect(normalizeTaskTitle(input)).toBeNull();

        const { data, error } = await rawTaskInsert(input);
        expect(error?.code).toBe(CHECK_VIOLATION);
        expect(data).toBeNull();
      }
      expect(await adminTaskCount()).toBe(0);
    });

    // Same known drift as for the group name; see there.
    it("known drift: TS accepts a NUL character, PostgREST rejects it with 400 and 22P05", async () => {
      const input = `Water${NUL}plants`;
      expect(normalizeTaskTitle(input)).toBe(input);

      const { data, error, status } = await rawTaskInsert(input);
      expect(status).toBe(400);
      expect(error?.code).toBe(UNTRANSLATABLE_CHARACTER);
      expect(data).toBeNull();
      expect(await adminTaskCount()).toBe(0);
    });
  });

  describe("recurrence: normalizeRecurrence and tasks_recurrence_allowed", () => {
    let group: TestGroup;

    beforeEach(async () => {
      group = await createGroupAs(owner, "Contract group");
    });

    it("both accept once, daily and weekly", async () => {
      expect([...TASK_RECURRENCES].sort()).toEqual(["daily", "once", "weekly"]);
      for (const recurrence of ["once", "daily", "weekly"]) {
        expect(normalizeRecurrence(recurrence)).toBe(recurrence);

        const taskId = await createTaskAs(owner, group.id, `Task ${recurrence}`, recurrence);
        expect((await adminTask(taskId))?.recurrence).toBe(recurrence);
      }
    });

    it("both reject monthly, Daily, an empty string and a padded once (23514)", async () => {
      for (const recurrence of ["monthly", "Daily", "", " once"]) {
        expect(normalizeRecurrence(recurrence), JSON.stringify(recurrence)).toBeNull();

        const { data, error } = await owner.client
          .from("tasks")
          .insert({ group_id: group.id, created_by: owner.id, title: "Bad recurrence", recurrence });
        expect(error?.code, JSON.stringify(recurrence)).toBe(CHECK_VIOLATION);
        expect(data, JSON.stringify(recurrence)).toBeNull();
      }
    });
  });

  describe("join code: normalizeJoinCode, the join_code default and join_group", () => {
    it("a generated code is lowercase hex that normalizes to itself, also inside an invite link", async () => {
      const group = await createGroupAs(owner, "Contract group");

      expect(group.joinCode).toMatch(/^[0-9a-f]+$/);
      expect(normalizeJoinCode(group.joinCode)).toBe(group.joinCode);
      expect(normalizeJoinCode(`https://streak.example/join/${group.joinCode}?utm=x#top`)).toBe(group.joinCode);
    });

    it("join_group accepts the normalized code for a second user", async () => {
      const group = await createGroupAs(owner, "Contract group");
      const code = normalizeJoinCode(`https://streak.example/join/${group.joinCode.toUpperCase()}/?x=1#y`);
      expect(code).toBe(group.joinCode);
      if (code === null) throw new Error("unreachable: the generated code normalizes to itself");

      expect(await joinGroupAs(joiner, code)).toBe(group.id);
    });

    it("join_group answers P0002 for an unknown well-formed code", async () => {
      const unknown = randomUUID().replaceAll("-", "").slice(0, 12);
      expect(normalizeJoinCode(unknown)).toBe(unknown);

      const { data, error } = await joiner.client.rpc("join_group", { p_join_code: unknown });
      expect(error?.code).toBe(NO_DATA_FOUND);
      expect(data).toBeNull();
    });
  });
});
