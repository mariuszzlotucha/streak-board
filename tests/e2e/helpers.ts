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
