// risk: test-plan.md #3 (only the owner manages the group; a member can only leave) — seed: tests/e2e/seed.spec.ts
// What the control question guards: the settings page decides from the viewer's role which controls to render. If the
// member sees the owner's rename form or Delete button, the negative assertions go red; if leaving does not remove the
// membership, the member still sees the group afterwards.
import { test, expect } from "@playwright/test";
import { signInThroughForm, waitForHydration } from "./helpers";
import {
  createGroupAs,
  createPersona,
  deletePersonas,
  joinGroupAs,
  readJoinCode,
  uniqueToken,
  type Persona,
} from "./local-supabase";

// The risk is about a member's view, so this test signs in as its own account instead of the shared session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("risk #3: group settings for a member", () => {
  const personas: Persona[] = [];

  test.afterEach(async () => {
    await deletePersonas(personas.splice(0));
  });

  test("a member sees only Leave group, can cancel the dialog, and leaving lands on the no-group dashboard", async ({
    page,
  }) => {
    const token = uniqueToken("owner");
    const memberToken = uniqueToken("member");
    // The tokens locate this run's rows in the database if a cleanup ever fails.
    test.info().annotations.push({ type: "test-data", description: `${token}, ${memberToken}` });

    const owner = await createPersona(token);
    personas.push(owner);
    const groupName = `Group ${token}`;
    const groupId = await createGroupAs(owner, groupName);
    const member = await createPersona(memberToken);
    personas.push(member);
    await joinGroupAs(member, await readJoinCode(owner, groupId));

    await signInThroughForm(page, member.email, member.password);
    await page.goto("/settings");
    await waitForHydration(page);

    // Positive control first: the member's own control is there, so "no owner controls" cannot mean "nothing rendered".
    await expect(page.getByRole("heading", { name: "Group settings", level: 2 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave group" })).toBeVisible();
    // The risk assertion: none of the owner's controls render for a member.
    await expect(page.getByRole("button", { name: "Delete group" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rename group" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Transfer ownership" })).toHaveCount(0);
    await expect(page.getByLabel("Group name")).toHaveCount(0);

    // The dialog names the consequence, and Cancel keeps the membership.
    await page.getByRole("button", { name: "Leave group" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Leave this group?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("your streaks and check-off history in its tasks will be lost");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();

    // Confirming leaves: the dashboard offers to join a group again and no longer shows this one.
    await page.goto("/settings");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Leave group" }).click();
    await page
      .getByRole("alertdialog", { name: "Leave this group?" })
      .getByRole("button", { name: "Leave group" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: "Join with code" })).toBeVisible();
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toHaveCount(0);
  });
});
