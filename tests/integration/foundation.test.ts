import { describe, expect, it } from "vitest";
import { adminClient, cleanupUsers, createGroupAs, createTestUser } from "../helpers/supabase";

describe("integration foundation", () => {
  it("creates a user and group, sees the group, and leaves nothing behind after cleanup", async () => {
    const user = await createTestUser();
    const group = await createGroupAs(user, "Foundation group");

    const { data: visible, error } = await user.client.from("groups").select("id");
    expect(error).toBeNull();
    expect(visible?.map((row) => row.id)).toEqual([group.id]);

    await cleanupUsers();

    const admin = adminClient();
    const { data: groups } = await admin.from("groups").select("id").eq("id", group.id);
    expect(groups).toEqual([]);
    const { data: lookup } = await admin.auth.admin.getUserById(user.id);
    expect(lookup.user).toBeNull();
  });
});
