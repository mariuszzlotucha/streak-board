// risk: test-plan.md #4 (the streak shown after a tick) — seed: tests/e2e/seed.spec.ts
// What the control question guards: a tap on "Mark done" flips the row and the Leaderboard at once (optimistic), then
// the server has to record the check-off so the same state comes back after a reload; Undo has to take it back the same
// way. If the request never reaches the database, the row looks right until the reload, where the assertions go red.
// The spec asserts function, not latency: test-plan §7 keeps the immediacy requirement out of tests.
import { test, expect, type Page } from "@playwright/test";
import { signInThroughForm, waitForHydration } from "./helpers";
import {
  createGroupAs,
  createPersona,
  createTaskAs,
  deletePersonas,
  uniqueToken,
  type Persona,
} from "./local-supabase";

// The risk needs a task of its own on a fresh account, so this test signs in as its own persona.
test.use({ storageState: { cookies: [], origins: [] } });

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The task's row on the dashboard: the only list item that carries the title. */
function taskRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({ hasText: title });
}

/** The viewer's Leaderboard line: position, e-mail, the "You" badge and the total, each in its own element. */
function expectViewerTotal(page: Page, email: string, total: number) {
  const row = page
    .getByRole("list", { name: "Leaderboard" })
    .getByRole("listitem")
    .filter({ has: page.getByText("You", { exact: true }) });
  // The viewer is the only member, so the position is always 1; the total is the last number on the line.
  return expect(row).toHaveText(new RegExp(`^1\\s*${escapeRegExp(email)}\\s*You\\s*${total}$`));
}

test.describe("risk #4: check-off round trip", () => {
  const personas: Persona[] = [];

  test.afterEach(async () => {
    await deletePersonas(personas.splice(0));
  });

  test("a tick shows streak 1 and total 1, survives a reload, and an undo takes both back to 0", async ({ page }) => {
    const token = uniqueToken("tick");
    // The token locates this run's rows in the database if a cleanup ever fails.
    test.info().annotations.push({ type: "test-data", description: token });

    // One member, one daily task. The creator is enrolled as a participant by the database trigger, and the check-off
    // control renders only for a participant.
    const owner = await createPersona(token);
    personas.push(owner);
    const groupId = await createGroupAs(owner, `Group ${token}`);
    const title = `Task ${token}`;
    await createTaskAs(owner, groupId, title);

    await signInThroughForm(page, owner.email, owner.password);
    // The control and the Leaderboard are React islands: before hydration the form would post and reload the page.
    await waitForHydration(page);
    const row = taskRow(page, title);

    // Positive control: the row starts unticked at streak 0 and the viewer's total is 0.
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).toBeVisible();
    await expect(row.getByText("0", { exact: true })).toBeVisible();
    await expectViewerTotal(page, owner.email, 0);

    // Tick: the row and the board move without a reload.
    await row.getByRole("button", { name: `Mark done ${title}` }).click();
    await expect(row.getByText("Done today", { exact: true })).toBeVisible();
    await expect(row.getByText("1", { exact: true })).toBeVisible();
    await expectViewerTotal(page, owner.email, 1);

    // The reload must not race the save: the control keeps the button `aria-disabled` until the server has answered.
    await expect(row.getByRole("button", { name: `Undo ${title}` })).not.toHaveAttribute("aria-disabled", "true");
    // The risk assertion: the server recorded the check-off, so the reloaded page shows the same streak and total.
    await page.reload();
    await expect(row.getByText("Done today", { exact: true })).toBeVisible();
    await expect(row.getByText("1", { exact: true })).toBeVisible();
    await expectViewerTotal(page, owner.email, 1);

    // Undo: back to 0, without a reload and then across one.
    await waitForHydration(page);
    await row.getByRole("button", { name: `Undo ${title}` }).click();
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).toBeVisible();
    await expect(row.getByText("0", { exact: true })).toBeVisible();
    await expectViewerTotal(page, owner.email, 0);

    await expect(row.getByRole("button", { name: `Mark done ${title}` })).not.toHaveAttribute("aria-disabled", "true");
    await page.reload();
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).toBeVisible();
    await expect(row.getByText("0", { exact: true })).toBeVisible();
    await expectViewerTotal(page, owner.email, 0);
  });
});
