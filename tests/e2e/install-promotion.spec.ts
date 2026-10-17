// risk: S-19 install promotion — on iPhone, reminders work only from the installed app, and nothing but the app itself
// tells the user how to install it. If the offer is not classified from the browser, the iPhone visitor sees no card;
// if "Not now" is not kept on the device, the card comes back on every visit; if the Settings block honoured the
// dismissal, the one place that always explains installing would go blank. The classification of every other browser
// is covered by tests/unit/install.test.ts and shown on the kitchen sink's `install-*` states.
import { test, expect, type Page } from "@playwright/test";
import { signInThroughForm, waitForHydration } from "./helpers";
import { createGroupAs, createPersona, deletePersonas, uniqueToken, type Persona } from "./local-supabase";

// The local-storage key of "Not now" (src/lib/pwa/install.ts, named in the privacy policy).
const DISMISSED_KEY = "streakboard.install-dismissed";

function dismissedFlag(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), DISMISSED_KEY);
}

// Safari on an iPhone (iOS 17.5). Only the user agent matters to the classification: headless Chromium reports no
// installed display mode and no touch points, so the offer is `ios-safari`.
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// The dismissal lives in this browser context's local storage, so the test signs in as its own account in a clean
// context instead of the shared session.
test.use({ storageState: { cookies: [], origins: [] }, userAgent: IPHONE_SAFARI });

test.describe("risk S-19: install promotion on an iPhone", () => {
  const personas: Persona[] = [];

  test.afterEach(async () => {
    await deletePersonas(personas.splice(0));
  });

  test("the dashboard shows the iPhone steps until Not now, which survives a reload; Settings still shows them", async ({
    page,
  }) => {
    const token = uniqueToken("install");
    // The token locates this run's rows in the database if a cleanup ever fails.
    test.info().annotations.push({ type: "test-data", description: token });

    const persona = await createPersona(token);
    personas.push(persona);
    const groupName = `Group ${token}`;
    await createGroupAs(persona, groupName);

    await signInThroughForm(page, persona.email, persona.password);
    await waitForHydration(page);

    // Positive control first: the group's page rendered, so a missing card cannot mean a missing page.
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    const card = page.locator("[data-slot='card']").filter({
      has: page.getByRole("heading", { name: "Install StreakBoard", level: 2 }),
    });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Reminders on iPhone and iPad work only from the installed app.");
    expect(await dismissedFlag(page)).toBeNull();
    await expect(card).toContainText("Add to Home Screen");

    // "Not now" hides the card at once and for good on this device.
    await card.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("heading", { name: "Install StreakBoard" })).toHaveCount(0);
    // The island renders nothing on the server, so the heading check after the reload could run before it renders;
    // the stored flag is what keeps the card away, so assert it on both sides of the reload.
    expect(await dismissedFlag(page)).not.toBeNull();
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Install StreakBoard" })).toHaveCount(0);
    expect(await dismissedFlag(page)).not.toBeNull();

    // Settings keeps the instruction in the Reminders card, without a dismiss.
    await page.goto("/settings");
    await waitForHydration(page);
    const reminders = page.locator("[data-slot='card']").filter({
      has: page.getByRole("heading", { name: "Reminders", level: 2 }),
    });
    await expect(reminders.getByRole("heading", { name: "Install StreakBoard", level: 3 })).toBeVisible();
    await expect(reminders).toContainText("Add to Home Screen");
    await expect(reminders.getByRole("button", { name: "Not now" })).toHaveCount(0);
  });
});

// Instagram's browser on an iPhone: the in-app token wins over the iOS tokens, and on iOS only Safari leads to an app
// that can send reminders, so the step names Safari alone.
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0";

test.describe("risk S-19: install promotion in an iPhone app's browser", () => {
  test.use({ userAgent: IPHONE_INSTAGRAM });
  const personas: Persona[] = [];

  test.afterEach(async () => {
    await deletePersonas(personas.splice(0));
  });

  test("Settings sends the user to Safari, not to Chrome", async ({ page }) => {
    const token = uniqueToken("inapp");
    test.info().annotations.push({ type: "test-data", description: token });
    const persona = await createPersona(token);
    personas.push(persona);

    await signInThroughForm(page, persona.email, persona.password);
    await page.goto("/settings");
    await waitForHydration(page);
    const reminders = page.locator("[data-slot='card']").filter({
      has: page.getByRole("heading", { name: "Reminders", level: 2 }),
    });
    await expect(reminders.getByRole("heading", { name: "Install StreakBoard", level: 3 })).toBeVisible();
    await expect(reminders).toContainText("Reminders on iPhone and iPad work only from the installed app.");
    await expect(reminders).toContainText("Open this page in Safari to install StreakBoard.");
    await expect(reminders).not.toContainText("Chrome");
  });
});
