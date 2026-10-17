// risk: the Content-Security-Policy (S-18) — Astro computes it, the middleware sends it as Report-Only. A policy that
// missed something the app needs (a script hash, the Supabase origin the auth forms post to) would show as
// `[Report Only]` console messages now and break those pages once the policy is enforced.
// "Continue with Google" is not clicked: it leaves for the network. form-action is checked in the header instead.
import { test, expect, type Page } from "@playwright/test";

function watchReportOnly(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Report Only")) messages.push(message.text());
  });
  return messages;
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("risk S-18: the sign-in page sends the policy as Report-Only with the Supabase origin in form-action", async ({
    page,
  }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    expect(supabaseUrl, "SUPABASE_URL comes from .env or the CI job").toBeTruthy();
    const messages = watchReportOnly(page);

    const response = await page.goto("/auth/signin");
    expect(response?.ok()).toBe(true);
    if (!response) throw new Error("no response for /auth/signin");
    const headers = await response.allHeaders();
    expect(headers["content-security-policy"]).toBeUndefined();
    const policy = headers["content-security-policy-report-only"] ?? "";
    const formAction = policy
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("form-action "));
    expect(formAction?.split(/\s+/)).toEqual(
      expect.arrayContaining(["'self'", "https://accounts.google.com", new URL(supabaseUrl).origin]),
    );

    await page.goto("/");
    await page.waitForLoadState("load");
    expect(messages).toEqual([]);
  });
});

test("risk S-18: the signed-in pages log no Report-Only violation", async ({ page }) => {
  const messages = watchReportOnly(page);

  for (const path of ["/dashboard", "/settings"]) {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    expect(response?.headers()["content-security-policy-report-only"]).toBeTruthy();
    await page.waitForLoadState("load");
  }

  expect(messages).toEqual([]);
});
