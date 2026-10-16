// risk: the owner hands the group over to a member (S-15) — seed: tests/e2e/seed.spec.ts
// What the control question guards: the transfer dialog has to post the chosen member, and the role decides the
// controls on every request. If Cancel submitted, the owner would lose the group; if the select did not reach the form,
// the confirm would end on `invalid_successor` and the former owner would keep the owner's controls; if the notice
// were not stored or not cleared, the new owner would never see it, or see it forever.
import { test, expect, type Page } from "@playwright/test";
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

// The risk is about two specific accounts, so this test signs in as its own accounts instead of the shared session.
test.use({ storageState: { cookies: [], origins: [] } });

/** The owner's Remove control on the member's row of the Members card. */
function removeControl(page: Page, nickname: string) {
  return page.getByRole("button", { name: `Remove ${nickname} from the group` });
}

/** The new owner's one-time notice (a status, not an error alert). */
function ownerNotice(page: Page) {
  return page.getByRole("status").filter({ hasText: "You are now the owner of" });
}

test.describe("group ownership transfer", () => {
  const personas: Persona[] = [];

  test.afterEach(async () => {
    await deletePersonas(personas.splice(0));
  });

  test("the owner cancels, then hands the group to a member, who sees the notice once", async ({ page }) => {
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

    await signInThroughForm(page, owner.email, owner.password);
    await page.goto("/settings");
    await waitForHydration(page);

    // The dialog names the consequence, and Cancel keeps the group with its owner.
    await page.getByRole("button", { name: "Transfer ownership" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Transfer ownership?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`becomes the owner of ${groupName}`);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.goto("/dashboard");
    await expect(removeControl(page, member.nickname)).toBeVisible();

    // Without a chosen member the browser refuses the submit: the dialog stays and nothing is posted.
    await page.goto("/settings");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Transfer ownership" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Transfer ownership" }).click();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);

    // Chosen and confirmed: the former owner is a member, without the owner's controls and without the notice.
    await dialog.getByLabel("New owner").selectOption({ label: member.nickname });
    await dialog.getByRole("button", { name: "Transfer ownership" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    await expect(removeControl(page, member.nickname)).toHaveCount(0);
    await expect(ownerNotice(page)).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Leave group" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete group" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Transfer ownership" })).toHaveCount(0);

    // The new owner sees the notice and the owner's controls; "Got it" clears the notice for good.
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await signInThroughForm(page, member.email, member.password);
    await expect(ownerNotice(page)).toContainText(`You are now the owner of ${groupName}.`);
    await expect(removeControl(page, owner.nickname)).toBeVisible();
    await ownerNotice(page).getByRole("button", { name: "Got it" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    await expect(ownerNotice(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    await expect(ownerNotice(page)).toHaveCount(0);
    await expect(removeControl(page, owner.nickname)).toBeVisible();
  });
});
