import type { Page } from "@playwright/test";

/**
 * Resolves once every Astro island on the page has hydrated. A React island (the sign-in form, the group forms) drops
 * input typed before it hydrates, and a submit that is not idempotent cannot be retried, so wait for this signal once,
 * then fill and submit. Verified on Astro 7 with `client:load` islands; a `client:visible` island below the fold keeps
 * its `ssr` attribute until it is scrolled into view, so do not call this on a page that has one.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}

/**
 * Signs in through the real form and waits for the dashboard. Only for a spec whose own, freshly created account is
 * part of the risk (a different identity than the shared session in playwright/.auth/user.json); every other spec
 * authenticates through that storageState instead.
 */
export async function signInThroughForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/signin");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(email);
  // exact: the "Show password" toggle button also carries the word in its accessible name.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}
