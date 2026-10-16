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

/**
 * The nickname an E2E account gets: the local part of its address, cut to the 24 characters a nickname may have. The
 * seed account's row is written with the same rule by scripts/e2e-user.mjs (CI) or chosen through the page by
 * auth.setup.ts (a local seed account from before S-14), so seed.spec.ts can expect it.
 */
export function nicknameFor(email: string): string {
  return email.split("@")[0].slice(0, 24);
}

/** Chooses a nickname on the first-choice page (`/account/nickname`) and waits for the dashboard. */
export async function chooseNickname(page: Page, nickname: string): Promise<void> {
  await waitForHydration(page);
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard");
}

/**
 * On the settings page: opens "Delete account", chooses the successor when given (an owner with other members has to),
 * confirms, and waits for the landing page the deleted account ends on. The account is gone afterwards, so a spec's
 * cleanup has to tolerate it (`deletePersonas` treats `user_not_found` as done).
 */
export async function deleteAccountThroughSettings(page: Page, successor?: string): Promise<void> {
  await page.goto("/settings");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
  if (successor !== undefined) {
    await dialog.getByLabel("New owner").selectOption({ label: successor });
  }
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("account") === "deleted");
}
