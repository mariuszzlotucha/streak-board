// risk: test-plan.md #2 — a member of one group sees the groups, members or tasks of another
// seed: tests/e2e/seed.spec.ts
// What the control question guards: the dashboard reads the caller's group with an unfiltered `select … maybeSingle()`,
// so only RLS keeps another group out of the rendered page. If that isolation breaks, Bravo's page either shows
// Alpha's data or fails to render Bravo's own group, and one of the assertions below goes red.
import { test, expect } from "@playwright/test";
import { signInThroughForm } from "./helpers";
import {
  createGroupAs,
  createPersona,
  createTaskAs,
  deletePersonas,
  uniqueToken,
  type Persona,
} from "./local-supabase";

// The risk is about a different user's view, so this test signs in as its own account instead of the shared session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("risk #2: group data isolation", () => {
  const personas: Persona[] = [];

  test.afterEach(async () => {
    await deletePersonas(personas.splice(0));
  });

  test("a member of group Bravo sees only Bravo's group, members and tasks, never Alpha's", async ({ page }) => {
    const alpha = uniqueToken("alpha");
    const bravo = uniqueToken("bravo");
    // The tokens locate this run's rows in the database if a cleanup ever fails.
    test.info().annotations.push({ type: "test-data", description: `${alpha}, ${bravo}` });

    // Two users, each owning a group with one task. The accounts are pushed right after creation so cleanup sees them.
    const alphaOwner = await createPersona(alpha);
    personas.push(alphaOwner);
    const alphaGroup = await createGroupAs(alphaOwner, `Group ${alpha}`);
    await createTaskAs(alphaOwner, alphaGroup, `Task ${alpha}`);

    const bravoOwner = await createPersona(bravo);
    personas.push(bravoOwner);
    const bravoGroup = await createGroupAs(bravoOwner, `Group ${bravo}`);
    await createTaskAs(bravoOwner, bravoGroup, `Task ${bravo}`);

    // Bravo signs in through the real form and lands on the dashboard.
    await signInThroughForm(page, bravoOwner.email, bravoOwner.password);

    // Positive control: the page rendered Bravo's own data, so "no Alpha rows" cannot mean "nothing rendered".
    await expect(page.getByRole("heading", { name: `Group ${bravo}`, level: 1 })).toBeVisible();
    await expect(page.getByText(`Task ${bravo}`, { exact: true })).toBeVisible();
    // Exactly one member and one task: a leaked row from Alpha's group would push either count to 2.
    await expect(page.getByText("1 member", { exact: true })).toBeVisible();
    await expect(page.getByText("1 task", { exact: true })).toBeVisible();

    // The business outcome: nothing of Alpha's (group name, owner email, task title) is on Bravo's page.
    await expect(page.getByText(alpha)).toHaveCount(0);
  });
});
