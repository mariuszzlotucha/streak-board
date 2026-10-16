// risk: a user deletes their own account (S-15) — seed: tests/e2e/seed.spec.ts
// What the control question guards: the dialog has to say what goes and what stays, and confirming has to delete the
// account in one step and end the session. If Cancel submitted, the account would be gone; if a member's tasks went with
// the account, the owner would lose them and everyone's progress; if the owner's successor did not reach the form, the
// group would be stuck without an owner (the confirm would end on `invalid_successor`); if a sole member's group
// survived, its invite would still work; if the session were not ended, the landing page would redirect to the dashboard.
import { test, expect, type Page } from "@playwright/test";
import { deleteAccountThroughSettings, signInThroughForm, waitForHydration } from "./helpers";
import {
  createGroupAs,
  createPersona,
  createTaskAs,
  deletePersonas,
  joinGroupAs,
  readJoinCode,
  uniqueToken,
  type Persona,
} from "./local-supabase";

// The risk is about specific accounts, deleted on purpose, so this test signs in as its own accounts instead of the
// shared session (whose seed account must never be deleted).
test.use({ storageState: { cookies: [], origins: [] } });

/** The landing page's confirmation (a status, not an error alert). */
function deletedNotice(page: Page) {
  return page.getByRole("status").filter({ hasText: "Your account has been deleted." });
}

/** The new owner's one-time notice on the dashboard. */
function ownerNotice(page: Page) {
  return page.getByRole("status").filter({ hasText: "You are now the owner of" });
}

/** The landing page, signed out: the deletion notice and the way back in. */
async function expectSignedOutWithNotice(page: Page): Promise<void> {
  await expect(deletedNotice(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep each other on track.", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  // The session is over: a protected page sends the visitor to sign in.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/signin$/);
}

/** The credentials of a deleted account no longer sign anyone in. */
async function expectSignInRefused(page: Page, persona: Persona): Promise<void> {
  await page.goto("/auth/signin");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(persona.email);
  await page.getByLabel("Password", { exact: true }).fill(persona.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/auth\/signin\?error=invalid_credentials$/);
}

test.describe("account deletion", () => {
  const personas: Persona[] = [];

  test.afterEach(async () => {
    // Accounts the flow deleted answer user_not_found, which the helper treats as done.
    await deletePersonas(personas.splice(0));
  });

  test("a member cancels, then deletes the account, and the member's task stays with the owner", async ({ page }) => {
    const ownerToken = uniqueToken("owner");
    const memberToken = uniqueToken("member");
    // The tokens locate this run's rows in the database if a cleanup ever fails.
    test.info().annotations.push({ type: "test-data", description: `${ownerToken}, ${memberToken}` });

    const owner = await createPersona(ownerToken);
    personas.push(owner);
    const groupName = `Group ${ownerToken}`;
    const groupId = await createGroupAs(owner, groupName);
    const member = await createPersona(memberToken);
    personas.push(member);
    await joinGroupAs(member, await readJoinCode(owner, groupId));
    const taskTitle = `Task ${memberToken}`;
    await createTaskAs(member, groupId, taskTitle);

    await signInThroughForm(page, member.email, member.password);
    await page.goto("/settings");
    await waitForHydration(page);

    // The dialog names the group and the owner who takes over the member's tasks, and asks for no successor; Cancel
    // keeps the account.
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Your account, nickname and check-offs are deleted right away.");
    await expect(dialog).toContainText(`You leave ${groupName}.`);
    await expect(dialog).toContainText(`pass to its owner, ${owner.nickname}.`);
    await expect(dialog.getByLabel("New owner")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${taskTitle}` })).toBeVisible();

    // Confirmed: signed out on the landing page, and the account no longer signs in.
    await deleteAccountThroughSettings(page);
    await expectSignedOutWithNotice(page);
    await expectSignInRefused(page, member);

    // The owner manages the task now, and the member is gone from the group.
    await signInThroughForm(page, owner.email, owner.password);
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${taskTitle}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Delete ${taskTitle}` })).toBeVisible();
    await expect(page.getByText(member.nickname, { exact: true })).toHaveCount(0);
  });

  test("an owner with a member must choose a successor, who takes over the group and the owner's tasks", async ({
    page,
  }) => {
    const ownerToken = uniqueToken("owner");
    const memberToken = uniqueToken("member");
    test.info().annotations.push({ type: "test-data", description: `${ownerToken}, ${memberToken}` });

    const owner = await createPersona(ownerToken);
    personas.push(owner);
    const groupName = `Group ${ownerToken}`;
    const groupId = await createGroupAs(owner, groupName);
    const member = await createPersona(memberToken);
    personas.push(member);
    await joinGroupAs(member, await readJoinCode(owner, groupId));
    const taskTitle = `Task ${ownerToken}`;
    await createTaskAs(owner, groupId, taskTitle);

    await signInThroughForm(page, owner.email, owner.password);
    await page.goto("/settings");
    await waitForHydration(page);

    // The dialog asks who takes over; without a choice the browser refuses the submit and nothing is posted.
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(dialog).toContainText(`Choose who takes over ${groupName}.`);
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // Chosen and confirmed: the owner is signed out and gone.
    await deleteAccountThroughSettings(page, member.nickname);
    await expectSignedOutWithNotice(page);
    await expectSignInRefused(page, owner);

    // The successor owns the group: the one-time notice, the owner's settings and the former owner's task.
    await signInThroughForm(page, member.email, member.password);
    await expect(ownerNotice(page)).toContainText(`You are now the owner of ${groupName}.`);
    await expect(page.getByRole("button", { name: `Edit ${taskTitle}` })).toBeVisible();
    await expect(page.getByText(owner.nickname, { exact: true })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Delete group" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave group" })).toHaveCount(0);
  });

  test("the sole member of a group deletes the account and the group goes with it", async ({ page }) => {
    const ownerToken = uniqueToken("owner");
    const otherToken = uniqueToken("other");
    test.info().annotations.push({ type: "test-data", description: `${ownerToken}, ${otherToken}` });

    const owner = await createPersona(ownerToken);
    personas.push(owner);
    const groupName = `Group ${ownerToken}`;
    const groupId = await createGroupAs(owner, groupName);
    const joinCode = await readJoinCode(owner, groupId);
    await createTaskAs(owner, groupId, `Task ${ownerToken}`);

    await signInThroughForm(page, owner.email, owner.password);
    await page.goto("/settings");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(dialog).toContainText(`Your group ${groupName} is deleted with all its tasks and check-offs.`);
    await expect(dialog.getByLabel("New owner")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await deleteAccountThroughSettings(page);
    await expectSignedOutWithNotice(page);

    // The group is gone: its invite code no longer joins anyone.
    const other = await createPersona(otherToken);
    personas.push(other);
    await expect(joinGroupAs(other, joinCode)).rejects.toThrow(/join_group failed/);
  });
});
