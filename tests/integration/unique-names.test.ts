import { beforeAll, describe, expect, it } from "vitest";
import { toGroupErrorCode } from "@/lib/group-errors";
import { toTaskErrorCode } from "@/lib/task-errors";
import {
  createGroupAs,
  createTaskAs,
  createTestUser,
  joinGroupAs,
  type TestUser,
  uniqueName,
} from "../helpers/supabase";

// Expectations come from the migration unique_names: a task title is unique within its group, a group name across the
// app, both trimmed of space, tab, CR and LF and compared without regard to letter case. The real PostgREST error of
// each violation goes through the app's mapper, which is what tells a taken name from "already in a group".

const UNIQUE_VIOLATION = "23505";

describe("unique task titles within a group", () => {
  let a: TestUser; // owner of GA
  let m: TestUser; // member of GA
  let b: TestUser; // owner of GB

  beforeAll(async () => {
    a = await createTestUser();
    m = await createTestUser();
    b = await createTestUser();
  });

  it("refuses another member's title in another case and spacing, and the mapper names it title_taken", async () => {
    const ga = await createGroupAs(a, uniqueName("Group A"));
    await joinGroupAs(m, ga.joinCode);
    await createTaskAs(a, ga.id, "Łódź run", "daily");

    const { error } = await m.client
      .from("tasks")
      .insert({ group_id: ga.id, created_by: m.id, title: " ŁÓDŹ RUN\t", recurrence: "weekly" });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
    expect(toTaskErrorCode(error ?? {})).toBe("title_taken");
  });

  it("allows the same title in another group", async () => {
    const ga = await createGroupAs(a, uniqueName("Group A"));
    const gb = await createGroupAs(b, uniqueName("Group B"));
    await createTaskAs(a, ga.id, "Read a book", "daily");

    await expect(createTaskAs(b, gb.id, "Read a book", "daily")).resolves.toEqual(expect.any(String));
  });

  it("refuses a rename to another task's title, but lets a task change only its case", async () => {
    const ga = await createGroupAs(a, uniqueName("Group A"));
    await createTaskAs(a, ga.id, "Water plants", "daily");
    const other = await createTaskAs(a, ga.id, "Feed the cat", "daily");

    const taken = await a.client.from("tasks").update({ title: "water plants" }).eq("id", other).select("id");
    expect(taken.error?.code).toBe(UNIQUE_VIOLATION);
    expect(toTaskErrorCode(taken.error ?? {})).toBe("title_taken");

    const recased = await a.client.from("tasks").update({ title: "FEED THE CAT" }).eq("id", other).select("id");
    expect(recased.error).toBeNull();
    expect(recased.data).toEqual([{ id: other }]);
  });

  it("frees a title once its task is deleted", async () => {
    const ga = await createGroupAs(a, uniqueName("Group A"));
    const first = await createTaskAs(a, ga.id, "Fix the shelf", "once");
    expect((await a.client.from("tasks").delete().eq("id", first)).error).toBeNull();

    await expect(createTaskAs(a, ga.id, "Fix the shelf", "once")).resolves.toEqual(expect.any(String));
  });
});

describe("unique group names across the app", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await createTestUser();
    b = await createTestUser();
  });

  it("refuses another group's name in another case and spacing, and the mapper names it name_taken", async () => {
    const name = uniqueName("Crew");
    await createGroupAs(a, name);

    const { error } = await b.client.from("groups").insert({ name: `  ${name.toUpperCase()} `, owner_id: b.id });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
    expect(toGroupErrorCode(error ?? {})).toBe("name_taken");
  });

  it("refuses a rename to another group's name, but lets a group change only its case", async () => {
    const taken = uniqueName("Crew");
    await createGroupAs(a, taken);
    const own = uniqueName("Club");
    const gb = await createGroupAs(b, own);

    const clash = await b.client.from("groups").update({ name: taken.toLowerCase() }).eq("id", gb.id).select("id");
    expect(clash.error?.code).toBe(UNIQUE_VIOLATION);
    expect(toGroupErrorCode(clash.error ?? {})).toBe("name_taken");

    const recased = await b.client.from("groups").update({ name: own.toUpperCase() }).eq("id", gb.id).select("id");
    expect(recased.error).toBeNull();
    expect(recased.data).toEqual([{ id: gb.id }]);
  });

  it("still names a second group with a free name already_in_group", async () => {
    await createGroupAs(a, uniqueName("Crew"));

    const { error } = await a.client.from("groups").insert({ name: uniqueName("Second"), owner_id: a.id });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
    expect(toGroupErrorCode(error ?? {})).toBe("already_in_group");
  });
});
