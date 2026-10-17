// risk: the installable app (S-17) — its service worker registers and controls the page, but caches nothing after
// sign-in (PRD Non-Goals: no offline mode, no page cache). If the worker cached a signed-in page, another user of the
// device or a signed-out visitor could see it; if it never registered, the browser would not offer to install the app.
// The update path (a release taking over an open page) is decided by `isUpdate` in src/lib/pwa/register.ts, covered by
// tests/unit/pwa-register.test.ts, and shown on the kitchen sink's `update-notice` state; whether Playwright can route
// the browser's own fetch of sw.js is undocumented, so no update is simulated here.
// Runs on both projects: the worker is the same on mobile-chromium, and nothing here depends on the viewport.
import { test, expect } from "@playwright/test";

test("risk S-17: the service worker controls the signed-in page and caches nothing", async ({ page }) => {
  const first = await page.goto("/dashboard");
  expect(first?.ok()).toBe(true);

  // Registered with the whole app as its scope.
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/");

  // After a reload the worker controls the page (it claimed it on activate anyway).
  const reloaded = await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // Nothing is cached, and the controlled page's own response still comes from the network.
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  expect(reloaded?.fromServiceWorker()).toBe(false);
  const again = await page.goto("/dashboard");
  expect(again?.fromServiceWorker()).toBe(false);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);

  // A first install is not an update: the new-version message stays hidden.
  await expect(page.getByRole("status").filter({ hasText: "A new version of StreakBoard is available." })).toBeHidden();
});
