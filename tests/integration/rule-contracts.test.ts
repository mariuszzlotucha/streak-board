import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeGroupName, normalizeJoinCode } from "@/lib/group-rules";
import { BLANK_NICKNAME_RANGES, FORBIDDEN_NICKNAME_RANGES, normalizeNickname } from "@/lib/nickname-rules";
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
  uniqueName,
} from "../helpers/supabase";

// Contract tests for the rules that exist twice, in the TypeScript normalisers and in the database (the CHECKs
// groups_name_length, tasks_title_length, tasks_recurrence_allowed, nicknames_nickname_length,
// nicknames_nickname_trimmed and nicknames_nickname_visible, the join_code default and join_group). Each
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
const ASCII_24 = "n".repeat(24);
const EMOJI_24 = "🙂".repeat(24);

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
      group = await createGroupAs(owner, uniqueName("Contract group"));
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
      group = await createGroupAs(owner, uniqueName("Contract group"));
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

  // set_nickname is the routes' write path: an upsert of the caller's own row, so one user tries every value in turn.
  // The values are unlikely to clash with another account's nickname (test users get `vt-<hex>`), and the rows go with
  // the users (cascade).
  describe("nickname: normalizeNickname and nicknames_nickname_length/trimmed/visible", () => {
    async function adminNicknameOf(user: TestUser): Promise<string | null> {
      const { data, error } = await adminClient().from("nicknames").select("nickname").eq("user_id", user.id).single();
      if (error) throw new Error(`adminNicknameOf failed: ${error.message}`);
      return data.nickname;
    }

    it("both accept 2 characters, 24 ASCII, 24 emoji, NBSP with a letter, joiners, blanks inside and the padded 24", async () => {
      const accepted = [
        { label: "2 characters", input: "ab", normalized: "ab" },
        { label: "24 ASCII", input: ASCII_24, normalized: ASCII_24 },
        { label: "24 emoji", input: EMOJI_24, normalized: EMOJI_24 },
        { label: "NBSP + letter", input: `${NBSP}a`, normalized: `${NBSP}a` },
        { label: "ZWJ emoji sequence", input: "👩‍💻 Ada", normalized: "👩‍💻 Ada" },
        { label: "5 spaces + 24 characters + 2 tabs", input: `     ${ASCII_24}\t\t`, normalized: ASCII_24 },
        // Every blank range endpoint between two letters: allowed, it just does not count as visible.
        ...BLANK_NICKNAME_RANGES.flat().map((codePoint) => {
          const input = `a${String.fromCodePoint(codePoint)}b`;
          return { label: `blank U+${codePoint.toString(16)} inside`, input, normalized: input };
        }),
      ];
      for (const { label, input, normalized } of accepted) {
        expect(normalizeNickname(input), label).toBe(normalized);

        const { error } = await owner.client.rpc("set_nickname", { p_nickname: normalized });
        expect(error, label).toBeNull();
        expect(await adminNicknameOf(owner), label).toBe(normalized);
      }
    });

    it("both reject empty, 1 character, 25 ASCII, 25 emoji and the padded 25 (23514)", async () => {
      const before = await adminNicknameOf(joiner);
      const rejected = [
        { label: "empty", input: "" },
        { label: "1 character", input: "a" },
        { label: "25 ASCII", input: "n".repeat(25) },
        { label: "25 emoji", input: "🙂".repeat(25) },
        { label: "5 spaces + 25 characters + 2 tabs", input: `     ${"n".repeat(25)}\t\t` },
        { label: "NBSP twice", input: `${NBSP}${NBSP}` },
        { label: "EM SPACE twice", input: `${EM_SPACE}${EM_SPACE}` },
        { label: "Hangul filler twice", input: "ㅤㅤ" },
        { label: "RLO override inside", input: "ab‮cd" },
        // Every forbidden range endpoint between two letters (U+0000 is below: Postgres text cannot hold NUL).
        ...FORBIDDEN_NICKNAME_RANGES.flat()
          .filter((codePoint) => codePoint !== 0)
          .map((codePoint) => ({
            label: `forbidden U+${codePoint.toString(16)}`,
            input: `a${String.fromCodePoint(codePoint)}b`,
          })),
        // Every blank range endpoint on its own, twice: nothing visible.
        ...BLANK_NICKNAME_RANGES.flat()
          .filter((codePoint) => codePoint !== 0x20)
          .map((codePoint) => {
            const char = String.fromCodePoint(codePoint);
            return { label: `blank U+${codePoint.toString(16)} twice`, input: `${char}${char}` };
          }),
      ];
      for (const { label, input } of rejected) {
        expect(normalizeNickname(input), label).toBeNull();

        const { error } = await joiner.client.rpc("set_nickname", { p_nickname: input });
        expect(error?.code, label).toBe(CHECK_VIOLATION);
      }
      expect(await adminNicknameOf(joiner)).toBe(before);
    });

    it("TS rejects NUL, which the database refuses before any CHECK (22P05)", async () => {
      expect(normalizeNickname(`a${NUL}b`)).toBeNull();
      const { error } = await joiner.client.rpc("set_nickname", { p_nickname: `a${NUL}b` });
      expect(error?.code).toBe(UNTRANSLATABLE_CHARACTER);
    });
  });

  describe("join code: normalizeJoinCode, the join_code default and join_group", () => {
    it("a generated code is lowercase hex that normalizes to itself, also inside an invite link", async () => {
      const group = await createGroupAs(owner, uniqueName("Contract group"));

      expect(group.joinCode).toMatch(/^[0-9a-f]+$/);
      expect(normalizeJoinCode(group.joinCode)).toBe(group.joinCode);
      expect(normalizeJoinCode(`https://streak.example/join/${group.joinCode}?utm=x#top`)).toBe(group.joinCode);
    });

    it("join_group accepts the normalized code for a second user", async () => {
      const group = await createGroupAs(owner, uniqueName("Contract group"));
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
