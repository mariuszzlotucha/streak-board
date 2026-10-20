// risk: test-plan.md #4 (the streak shown after a tick) — seed: tests/e2e/seed.spec.ts
// What the control question guards: a tap on "Mark done" flips the row and the Leaderboard at once (optimistic), then
// the server has to record the check-off so the same state comes back after a reload; Undo has to take it back the same
// way. If the request never reaches the database, the row looks right until the reload, where the assertions go red.
// The spec asserts function, not latency: test-plan §7 keeps the immediacy requirement out of tests.
import { test, expect, type Locator, type Page } from "@playwright/test";
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

/**
 * The viewer's cell for today in the row's check-off grid, found by its screen-reader label ("Nick, Fri 17 Oct: done").
 * A fresh participant joined today, so every earlier cell reads "not joined" and only today's cell can be open or done.
 */
function viewerCell(page: Page, title: string, nickname: string, state: "open" | "done") {
  return taskRow(page, title)
    .getByRole("table", { name: `Check-offs of ${title}` })
    .getByText(new RegExp(`^${escapeRegExp(nickname)}, [^:]+: ${state}$`));
}

/**
 * The streak figure of the row: the element right after the "Streak" label. The period header of the grid holds bare
 * day numbers ("1" on the 1st-7th of a month), so the figure is never found by its text alone.
 */
function streakOf(row: Locator) {
  return row.getByText("Streak", { exact: true }).locator("xpath=following-sibling::span[1]");
}

/**
 * The marked column header of the row's grid (S-21): exactly one header carries `aria-current`, it is the last column
 * header, and its text ends with the screen-reader word of a daily task.
 */
async function expectCurrentHeader(row: Locator, title: string) {
  const table = row.getByRole("table", { name: `Check-offs of ${title}` });
  const marked = table.locator('th[aria-current="true"]');
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveText(/today$/);
  await expect(table.locator('thead th[scope="col"]').last()).toHaveAttribute("aria-current", "true");
}

/**
 * The layout contract of S-20, checked at each project's own width (1280 and 412 px): neither the page nor the task
 * row's grid wrapper scrolls sideways. The wrapper is the table's parent.
 */
async function expectNoSidewaysScroll(page: Page, title: string) {
  // The Outfit font changes the widths: measure with it loaded, as the screenshot gate does.
  await page.evaluate(() => document.fonts.ready);
  const pageOverrun = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverrun, "the page scrolls sideways").toBe(0);
  const wrapper = taskRow(page, title)
    .getByRole("table", { name: `Check-offs of ${title}` })
    .locator("..");
  const wrapperOverrun = await wrapper.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(wrapperOverrun, "the check-off grid scrolls sideways").toBe(0);
}

/**
 * The viewer's Leaderboard line: position, nickname, the "You" badge and the total, each in its own element. Members
 * are listed by nickname, never by e-mail address.
 */
function expectViewerTotal(page: Page, nickname: string, total: number) {
  const row = page
    .getByRole("list", { name: "Leaderboard" })
    .getByRole("listitem")
    .filter({ has: page.getByText("You", { exact: true }) });
  // The viewer is the only member, so the position is always 1; the total is the last number on the line.
  return expect(row).toHaveText(new RegExp(`^1\\s*${escapeRegExp(nickname)}\\s*You\\s*${total}$`));
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
    await expect(streakOf(row)).toHaveText("0");
    await expectViewerTotal(page, owner.nickname, 0);
    await expect(viewerCell(page, title, owner.nickname, "open")).toBeAttached();
    await expectCurrentHeader(row, title);
    await expectNoSidewaysScroll(page, title);

    // Tick: the row, the grid cell and the board move without a reload.
    await row.getByRole("button", { name: `Mark done ${title}` }).click();
    await expect(row.getByText("Done today", { exact: true })).toBeVisible();
    await expect(streakOf(row)).toHaveText("1");
    await expectViewerTotal(page, owner.nickname, 1);
    await expect(viewerCell(page, title, owner.nickname, "done")).toBeAttached();

    // The reload must not race the save: the control keeps the button `aria-disabled` until the server has answered.
    await expect(row.getByRole("button", { name: `Undo ${title}` })).not.toHaveAttribute("aria-disabled", "true");
    // The risk assertion: the server recorded the check-off, so the reloaded page shows the same streak and total.
    await page.reload();
    await expectCurrentHeader(row, title);
    await expect(row.getByText("Done today", { exact: true })).toBeVisible();
    await expect(streakOf(row)).toHaveText("1");
    await expectViewerTotal(page, owner.nickname, 1);
    await expect(viewerCell(page, title, owner.nickname, "done")).toBeAttached();

    // Undo: back to 0, without a reload and then across one.
    await waitForHydration(page);
    await row.getByRole("button", { name: `Undo ${title}` }).click();
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).toBeVisible();
    await expect(streakOf(row)).toHaveText("0");
    await expectViewerTotal(page, owner.nickname, 0);
    await expect(viewerCell(page, title, owner.nickname, "open")).toBeAttached();

    await expect(row.getByRole("button", { name: `Mark done ${title}` })).not.toHaveAttribute("aria-disabled", "true");
    await page.reload();
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).toBeVisible();
    await expect(streakOf(row)).toHaveText("0");
    await expectViewerTotal(page, owner.nickname, 0);
  });

  test("a failed save rolls the row, the grid cell and the board back", async ({ page }) => {
    const token = uniqueToken("tickfail");
    test.info().annotations.push({ type: "test-data", description: token });

    const owner = await createPersona(token);
    personas.push(owner);
    const groupId = await createGroupAs(owner, `Group ${token}`);
    const title = `Task ${token}`;
    await createTaskAs(owner, groupId, title);

    await signInThroughForm(page, owner.email, owner.password);
    await waitForHydration(page);
    const row = taskRow(page, title);
    await expect(viewerCell(page, title, owner.nickname, "open")).toBeAttached();

    // The server fails the save; the response is held until the optimistic state has been asserted.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let requests = 0;
    await page.route("**/api/tasks/checkoff", async (route) => {
      requests += 1;
      await held;
      await route.fulfill({ status: 500, body: "" });
    });

    await row.getByRole("button", { name: `Mark done ${title}` }).click();
    await expect(viewerCell(page, title, owner.nickname, "done")).toBeAttached();
    release();

    // Rollback: the button, the streak, the cell and the board return to their unticked state.
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).toBeVisible();
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).not.toHaveAttribute("aria-disabled", "true");
    await expect(streakOf(row)).toHaveText("0");
    await expect(viewerCell(page, title, owner.nickname, "open")).toBeAttached();
    await expectViewerTotal(page, owner.nickname, 0);
    // The server answered, so the failure is final: no second attempt (it would double the server's log line).
    await expect(row.getByRole("alert")).toHaveText("Could not save. Try again.");
    expect(requests).toBe(1);
  });

  test("an aborted request is retried and the tick converges", async ({ page }) => {
    const token = uniqueToken("tickretry");
    test.info().annotations.push({ type: "test-data", description: token });

    const owner = await createPersona(token);
    personas.push(owner);
    const groupId = await createGroupAs(owner, `Group ${token}`);
    const title = `Task ${token}`;
    await createTaskAs(owner, groupId, title);

    await signInThroughForm(page, owner.email, owner.password);
    await waitForHydration(page);
    const row = taskRow(page, title);
    await expect(viewerCell(page, title, owner.nickname, "open")).toBeAttached();

    // The connection drops on the first attempt; the second one reaches the real server.
    let requests = 0;
    await page.route("**/api/tasks/checkoff", async (route) => {
      requests += 1;
      if (requests === 1) await route.abort("connectionfailed");
      else await route.fallback();
    });

    await row.getByRole("button", { name: `Mark done ${title}` }).click();
    await expect(row.getByRole("button", { name: `Undo ${title}` })).not.toHaveAttribute("aria-disabled", "true");

    // The retry saved it: nothing rolled back, no message, and exactly two attempts were made.
    expect(requests).toBe(2);
    await expect(row.getByText("Done today", { exact: true })).toBeVisible();
    await expect(viewerCell(page, title, owner.nickname, "done")).toBeAttached();
    await expect(row.getByRole("alert")).toHaveCount(0);

    // The risk assertion: the server has the row.
    await page.reload();
    await expect(row.getByText("Done today", { exact: true })).toBeVisible();
    await expect(streakOf(row)).toHaveText("1");
    await expect(viewerCell(page, title, owner.nickname, "done")).toBeAttached();
  });

  test("two aborted attempts roll back and send the code", async ({ page }) => {
    const token = uniqueToken("tickabort");
    test.info().annotations.push({ type: "test-data", description: token });

    const owner = await createPersona(token);
    personas.push(owner);
    const groupId = await createGroupAs(owner, `Group ${token}`);
    const title = `Task ${token}`;
    await createTaskAs(owner, groupId, title);

    await signInThroughForm(page, owner.email, owner.password);
    await waitForHydration(page);
    const row = taskRow(page, title);
    await expect(viewerCell(page, title, owner.nickname, "open")).toBeAttached();

    // Stub only the check-off route: the client-error route is the real one, and its 204 is enough.
    let requests = 0;
    await page.route("**/api/tasks/checkoff", async (route) => {
      requests += 1;
      await route.abort("connectionfailed");
    });
    // Started before the click: a beacon shows in the request log as a `ping`.
    const beacon = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/client-errors");

    await row.getByRole("button", { name: `Mark done ${title}` }).click();

    const report = await beacon;
    expect(report.method()).toBe("POST");
    expect(report.postData()).toBe("checkoff_failed");
    expect(requests).toBe(2);

    await expect(row.getByRole("alert")).toHaveText("Could not save. Try again.");
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).toBeVisible();
    await expect(row.getByRole("button", { name: `Mark done ${title}` })).not.toHaveAttribute("aria-disabled", "true");
    await expect(streakOf(row)).toHaveText("0");
    await expect(viewerCell(page, title, owner.nickname, "open")).toBeAttached();
    await expectViewerTotal(page, owner.nickname, 0);
  });
});
