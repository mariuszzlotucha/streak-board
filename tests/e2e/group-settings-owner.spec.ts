// risk: test-plan.md #3 (the owner renames and deletes the group) — seed: tests/e2e/seed.spec.ts
// What the control question guards: the owner's settings actions have to reach the database and come back on the
// dashboard. If the rename is not saved, the old name stays in the h1; if the delete dialog's confirm does not submit
// (or the row is not deleted), the dashboard still shows the group after confirming.
import { test, expect } from "@playwright/test";
import { signInThroughForm, waitForHydration } from "./helpers";
import { createGroupAs, createPersona, deletePersonas, uniqueToken, type Persona } from "./local-supabase";

// The risk is about the owner's own group, so this test signs in as its own account instead of the shared session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("risk #3: group settings for the owner", () => {
  const personas: Persona[] = [];

  test.afterEach(async () => {
    // The flow deletes the group itself; the helper still removes it if the flow failed before that step.
    await deletePersonas(personas.splice(0));
  });

  test("the owner renames the group, cancels the delete dialog, and deleting lands on the no-group dashboard", async ({
    page,
  }) => {
    const token = uniqueToken("owner");
    // The token locates this run's rows in the database if a cleanup ever fails.
    test.info().annotations.push({ type: "test-data", description: token });

    const owner = await createPersona(token);
    personas.push(owner);
    const groupName = `Group ${token}`;
    await createGroupAs(owner, groupName);

    await signInThroughForm(page, owner.email, owner.password);
    await page.goto("/settings");
    await waitForHydration(page);

    // Rename through the form: the dashboard's h1 shows the new name.
    const renamedName = `Renamed ${token}`;
    await expect(page.getByRole("heading", { name: "Group settings", level: 2 })).toBeVisible();
    await page.getByLabel("Group name").fill(renamedName);
    await page.getByRole("button", { name: "Rename group" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: renamedName, level: 1 })).toBeVisible();

    // The delete dialog, cancelled: the group is still there.
    await page.goto("/settings");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Delete group" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete this group?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: renamedName, level: 1 })).toBeVisible();

    // Confirmed: the dashboard offers to start or join a group and no longer shows this one.
    await page.goto("/settings");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Delete group" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this group?" })
      .getByRole("button", { name: "Delete group" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: "Join with code" })).toBeVisible();
    await expect(page.getByRole("heading", { name: renamedName, level: 1 })).toHaveCount(0);
  });
});
