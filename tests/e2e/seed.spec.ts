// Seed test: the pattern every generated E2E test copies. Protects risk #5 of context/foundation/test-plan.md
// (sign-in stops working: the gate lets a signed-out visitor through, or the real form never reaches the dashboard).
// Locators are role/label based, the test names its risk, waits are on state (URL, visible text, hydration), and
// the test is independent: it signs in itself instead of relying on another test.
import { test, expect } from "@playwright/test";
import { waitForHydration } from "./helpers";

// The risk is the signed-out path, so this test opts out of the session saved by auth.setup.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test("risk #5: a signed-out visitor is sent to sign-in and a real sign-in lands on the dashboard", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
  }

  // The gate: a protected page does not render for a signed-out visitor.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // The real form, once it has hydrated (typing earlier is lost, and the submit must not be retried blindly).
  await waitForHydration(page);
  await page.getByLabel("Email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The business outcome: the visitor is signed in as this user, not just somewhere other than the sign-in page.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();

  // Nothing to clean up: no data was created. Do not sign out here: signing out is global for this user and would
  // revoke the session every other spec loads from playwright/.auth/user.json.
});
