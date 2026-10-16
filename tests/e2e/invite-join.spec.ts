// risk: test-plan.md #6 (invite code in the cookie) and #2 (the member sees the joined group) — seed: tests/e2e/seed.spec.ts
// What the control question guards: an invite link opened while signed out has to survive the sign-in redirect and the
// sign-up (the code lives in a cookie), then turn into a membership the new member actually sees. If
// the cookie is lost, the dashboard never asks "Join <group>?"; if the join does not land, the group page never shows
// two members.
import { test, expect } from "@playwright/test";
import { chooseNickname, waitForHydration } from "./helpers";
import {
  createGroupAs,
  createPersona,
  deleteAccountsByEmail,
  deletePersonas,
  readJoinCode,
  uniqueToken,
  type Persona,
} from "./local-supabase";

// The risk is the signed-out invite path and a brand-new account, so this test opts out of the shared session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("risk #6 and #2: an invite link joins a new member to the group", () => {
  const personas: Persona[] = [];
  const signedUpEmails: string[] = [];

  test.afterEach(async () => {
    // Both cleanups run and both are checked, in this order: the owner (and the group, with the membership) first,
    // then the account the form created. A failure of the first still lets the second run, so neither account leaks.
    try {
      await deletePersonas(personas.splice(0));
    } finally {
      await deleteAccountsByEmail(signedUpEmails.splice(0));
    }
  });

  test("a signed-out invite link survives sign-up, and joining shows the group with both members", async ({ page }) => {
    const token = uniqueToken("invite");
    const memberToken = uniqueToken("joiner");
    // The tokens locate this run's rows in the database if a cleanup ever fails.
    test.info().annotations.push({ type: "test-data", description: `${token}, ${memberToken}` });

    const owner = await createPersona(token);
    personas.push(owner);
    const groupName = `Group ${token}`;
    const groupId = await createGroupAs(owner, groupName);
    const code = await readJoinCode(owner, groupId);

    // The invite link, opened signed out: the code is remembered and the gate sends the visitor to sign-in.
    await page.goto(`/join/${code}`);
    await expect(page).toHaveURL(/\/auth\/signin$/);

    // A new account through the real sign-up form. Local Supabase auto-confirms, so sign-up also signs the account in;
    // the handler still ends on the confirm-email page (asserted by URL: the heading differs between dev and preview).
    const memberEmail = `e2e-${memberToken}@example.test`;
    const memberPassword = "E2e-joiner-123!";
    // Pushed before the submit, so an account the form created is removed even if the assertions below fail.
    signedUpEmails.push(memberEmail);
    await page.goto("/auth/signup");
    await waitForHydration(page);
    await page.getByLabel("Email").fill(memberEmail);
    // exact: the "Show password" toggle buttons also carry the word in their accessible names.
    await page.getByLabel("Password", { exact: true }).fill(memberPassword);
    await page.getByLabel("Confirm password", { exact: true }).fill(memberPassword);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/auth\/confirm-email$/);

    // Already signed in by the auto-confirmed sign-up (the sign-in form is not reachable, and signing out would clear the
    // invite cookie by design), the new member opens the dashboard. A new account has no nickname yet, so the real gate
    // sends it to the nickname page first; the invite cookie has to survive that step too.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/account\/nickname$/);
    await expect(page.getByRole("heading", { name: "Choose your nickname", level: 1 })).toBeVisible();
    await chooseNickname(page, memberToken);

    // The risk assertion: the cookie carried the code across account creation, so the dashboard asks about this group.
    await expect(page.getByRole("heading", { name: `Join ${groupName}?`, level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Join group", exact: true }).click();

    // The business outcome: the new member is in the group and sees it, with both members listed.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    await expect(page.getByText("2 members", { exact: true })).toBeVisible();
    // The new member's row carries the "You" badge (in the Members card and on the Leaderboard; one is enough) and the
    // owner's row the "Owner" badge, which only the Members card renders. Members are listed by nickname.
    const memberRows = page.getByRole("listitem").filter({ hasText: memberToken });
    await expect(memberRows.filter({ has: page.getByText("You", { exact: true }) }).first()).toBeVisible();
    const ownerRows = page.getByRole("listitem").filter({ hasText: owner.nickname });
    await expect(ownerRows.filter({ has: page.getByText("Owner", { exact: true }) })).toBeVisible();
    // Each nickname is part of its account's address, so the row filters above would also match addresses: pin that
    // none is shown.
    await expect(page.getByRole("main")).not.toContainText("@");
  });
});
