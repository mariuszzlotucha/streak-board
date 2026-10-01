import { test as setup, expect } from "@playwright/test";
import { waitForHydration } from "./helpers";

const authFile = "playwright/.auth/user.json";

setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
  }

  await page.goto("/auth/signin");
  // Signing in twice changes nothing, but typing into a form that has not hydrated is lost, so wait for it once.
  await waitForHydration(page);
  await page.getByLabel("Email").fill(username);
  // exact: the "Show password" toggle button also carries the word in its accessible name.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/dashboard");
  // Only a signed-in user sees the sign-out button.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
