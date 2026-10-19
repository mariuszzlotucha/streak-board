// Visual gate: captures the evidence of a UI change the same way in every phase (S-11 `dashboard-ui`).
// Run against a running `astro dev` (the kitchen sink is dev-only), into the change's own folder:
// OUT_DIR=context/changes/<change-id>/screenshots BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs <prefix> <set...>
// Sets: `public` (the public pages), `states` (every kitchen-sink state of `/dashboard` and `/settings`), `controls`
// (hover, focus-visible and the pending, failed and fallback states of representative controls). No baselines and no
// comparison: the PNG files are reviewed by a person. Exits 1 when a page does not answer 200, renders empty, throws, or
// logs a console error while it loads, when a listed control is missing, or when a loaded page, or a check-off grid's
// wrapper on it, scrolls sideways (at 360 px, the narrowest target width, as at the other viewports).

/* global document */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
// No default: the PNGs belong to the change under review, and a fixed folder would outlive that change's archive.
const OUT_DIR = process.env.OUT_DIR;
const KITCHEN_SINK = "/dev/dashboard-kitchen-sink";

const VIEWPORTS = {
  narrow: { width: 360, height: 800 },
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
};

const PUBLIC_PAGES = [
  ["landing", "/"],
  ["privacy", "/privacy"],
  ["signin", "/auth/signin"],
  ["signup", "/auth/signup"],
];

// Everything the Astro dev toolbar adds sits in this element; it is not part of the app.
const HIDE_DEV_TOOLBAR = "astro-dev-toolbar { display: none !important; }";
// Lets hover and focus transitions (`transition-all`) and the dialog's fade finish before the capture.
const SETTLE_MS = 300;

// --- Controls: the one list of what the `controls` set captures. -----------------------------------------------------
// `page` is the kitchen-sink state (or a path) the control is taken from; `control` finds it; `region` is what the PNG
// shows (by default the control's task row or card); `modes` are the states captured; `run` replaces the modes for a
// state that needs an open dialog or a held or failed request. Together they cover the "shot" cells of the 7-state
// matrix in the plan (Phase 2, change 12).

const inRow = (control) => control.locator("xpath=ancestor::li[1]");
const inCard = (control) => control.locator("xpath=ancestor::*[@data-slot='card'][1]");
const inHeader = (control) => control.locator("xpath=ancestor::header[1]");
const leaderboardCard = (control) =>
  control.page().getByRole("list", { name: "Leaderboard" }).locator("xpath=ancestor::*[@data-slot='card'][1]");
const markDone = (p) => p.getByRole("button", { name: /^Mark done / }).first();
const deleteGroup = (p) => p.getByRole("button", { name: "Delete group", exact: true });

const CONTROLS = [
  // Default (filled) buttons.
  { name: "mark-done", page: "owner", control: markDone, region: inRow, modes: ["hover", "focus"] },
  {
    // The add-task form is in view where the disclosure is open: no tasks yet.
    name: "add-task",
    page: "sole-member",
    control: (p) => p.getByRole("button", { name: "Add task", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    name: "join-group",
    page: "pending-invite",
    control: (p) => p.getByRole("button", { name: "Join group", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    name: "join-with-code",
    page: "no-group",
    control: (p) => p.getByRole("button", { name: "Join with code", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    // The sole member's Copy is the filled one: the invite is their next step.
    name: "copy-emphasis",
    page: "sole-member",
    control: (p) => p.getByRole("button", { name: "Copy", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  // Outline buttons.
  {
    name: "undo",
    page: "owner",
    control: (p) => p.getByRole("button", { name: /^Undo / }).first(),
    region: inRow,
    modes: ["hover", "focus"],
  },
  {
    name: "task-join",
    page: "owner",
    control: (p) => p.getByRole("button", { name: /^Join / }).first(),
    region: inRow,
    modes: ["hover", "focus"],
  },
  {
    name: "task-leave",
    page: "owner",
    control: (p) => p.getByRole("button", { name: /^Leave / }).first(),
    region: inRow,
    modes: ["hover", "focus"],
  },
  {
    name: "copy",
    page: "owner",
    control: (p) => p.getByRole("button", { name: "Copy", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    name: "sign-out",
    page: "owner",
    control: (p) => p.getByRole("banner").getByRole("button", { name: "Sign out" }),
    region: inHeader,
    modes: ["hover", "focus"],
  },
  {
    name: "rename-group",
    page: "settings-owner",
    control: (p) => p.getByRole("button", { name: "Rename group", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  // Ghost buttons: the quiet row triggers.
  {
    name: "task-edit",
    page: "owner",
    control: (p) => p.getByRole("button", { name: /^Edit / }).first(),
    region: inRow,
    modes: ["hover", "focus"],
  },
  {
    name: "task-delete",
    page: "owner",
    control: (p) =>
      p
        .getByRole("listitem")
        .getByRole("button", { name: /^Delete / })
        .first(),
    region: inRow,
    modes: ["hover", "focus"],
  },
  {
    name: "member-remove",
    page: "owner",
    control: (p) => p.getByRole("button", { name: /^Remove / }).first(),
    region: inRow,
    modes: ["hover", "focus"],
  },
  // Destructive buttons.
  { name: "delete-group", page: "settings-owner", control: deleteGroup, region: inCard, modes: ["hover", "focus"] },
  {
    name: "leave-group",
    page: "settings-member",
    control: (p) => p.getByRole("button", { name: "Leave group", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    // The dialog's destructive confirm under the pointer.
    name: "dialog-confirm-hover",
    page: "settings-owner",
    control: deleteGroup,
    region: () => null,
    run: async (page, control) => {
      await control.click();
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Delete group" }).hover();
    },
  },
  {
    // Opened from the keyboard, the dialog focuses Cancel; Tab moves the visible focus to the confirm button.
    name: "dialog-focus",
    page: "settings-owner",
    control: deleteGroup,
    region: () => null,
    run: async (page, control) => {
      await control.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      await page.keyboard.press("Tab");
      await dialog.getByRole("button", { name: "Delete group" }).and(page.locator(":focus")).waitFor();
    },
  },
  // The "Add a task" disclosure, closed.
  {
    name: "add-task-summary",
    page: "owner",
    control: (p) => p.locator("summary", { hasText: "Add a task" }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  // Fields.
  {
    name: "task-title-field",
    page: "sole-member",
    control: (p) => p.getByLabel("Task title"),
    region: inCard,
    modes: ["focus"],
  },
  {
    name: "recurrence-field",
    page: "sole-member",
    control: (p) => p.getByLabel("How often"),
    region: inCard,
    modes: ["focus"],
  },
  // Links.
  {
    name: "footer-link",
    page: "owner",
    control: (p) => p.getByRole("link", { name: "Privacy Policy" }),
    region: (control) => control.locator("xpath=ancestor::footer[1]"),
    modes: ["hover", "focus"],
  },
  {
    // The Main nav's link to the other page (the current one is the secondary button).
    name: "nav-link",
    page: "owner",
    control: (p) => p.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }),
    region: inHeader,
    modes: ["hover", "focus"],
  },
  {
    name: "header-link",
    page: "owner",
    control: (p) => p.getByRole("banner").getByRole("link", { name: "StreakBoard" }),
    region: inHeader,
    modes: ["hover", "focus"],
  },
  // Held and failed requests.
  {
    // The tap flips the row at once and dims the new button while the request is held.
    name: "checkoff-pending",
    page: "owner",
    control: markDone,
    region: inRow,
    run: async (page, control, row) => {
      const release = await holdRequests(page, "**/api/tasks/checkoff");
      await control.click();
      // In the tapped row, not anywhere on the page: the shot must show this row held.
      await row.waitForSelector('[aria-disabled="true"]');
      return release;
    },
  },
  {
    // The same held tap seen on the Leaderboard: the viewer's total moves before the server answers.
    name: "leaderboard-pending",
    page: "owner",
    control: markDone,
    region: leaderboardCard,
    run: async (page, control) => {
      const release = await holdRequests(page, "**/api/tasks/checkoff");
      await control.click();
      await page.locator('[aria-disabled="true"]').first().waitFor();
      return release;
    },
  },
  {
    // A server error rolls the row back and shows the message next to the control.
    name: "checkoff-failed",
    page: "owner",
    control: markDone,
    region: inRow,
    run: async (page, control) => {
      await page.route("**/api/tasks/checkoff", (route) => route.fulfill({ status: 500, body: "" }));
      await control.click();
      await page.getByText("Could not save. Try again.").waitFor();
    },
  },
  {
    // The confirm button shows its spinner and Cancel is disabled while the native POST is under way.
    name: "dialog-submitting",
    page: "settings-owner",
    control: deleteGroup,
    region: () => null,
    run: async (page, control) => {
      await control.click();
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      // The native POST is cancelled in the page (a held navigation would block every Playwright wait); the kitchen
      // sink cancels it too. The island's submit handler still runs, so the dialog shows exactly its submitting state.
      await page.evaluate("window.addEventListener('submit', (event) => event.preventDefault(), true)");
      await dialog.getByRole("button", { name: "Delete group" }).click();
      await dialog.getByRole("button", { name: "Cancel" }).and(page.locator("[disabled]")).waitFor();
    },
  },
  {
    // Without the Clipboard API the link is selected and the manual-copy hint appears.
    name: "copy-fallback",
    page: "owner",
    control: (p) => p.getByRole("button", { name: "Copy", exact: true }),
    region: inCard,
    run: async (page, control) => {
      await page.evaluate("Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })");
      await control.click();
      await page.getByText("Press Ctrl+C (or long-press) to copy the selected link.").waitFor();
    },
  },
];

// --- Helpers ------------------------------------------------------------------------------------------------------

const failures = [];

function fail(message) {
  failures.push(message);
  console.log(`FAIL  ${message}`);
}

// The kitchen-sink states whose tasks carry a check-off grid: each must show at least one (S-20).
const GRID_STATES = ["owner", "member", "long-text"];

function pathFor(target) {
  return target.startsWith("/") ? target : `${KITCHEN_SINK}?state=${encodeURIComponent(target)}`;
}

// Holds every request matching `pattern` until the returned function aborts them.
async function holdRequests(page, pattern) {
  const held = [];
  await page.route(pattern, (route) => {
    held.push(route);
  });
  return async () => {
    await page.unroute(pattern);
    await Promise.all(held.map((route) => route.abort().catch(() => undefined)));
  };
}

// Loads a page and waits until it is hydrated, its fonts are in and the dev toolbar is hidden. Null when it is not 200.
// An uncaught error on the page, or a console error while it loads and hydrates, fails the run: a hydration error would
// otherwise still yield a PNG. Console errors after `open` (a control's deliberately failed request) do not count.
// A page, or a check-off grid's wrapper, that scrolls sideways fails the run too (S-20): the S-13 contract is that
// nothing a phone shows is cut off.
async function open(context, target) {
  const page = await context.newPage();
  const url = BASE_URL + pathFor(target);
  const size = page.viewportSize();
  const where = `${url} at ${size?.width}×${size?.height}`;
  page.on("pageerror", (error) => fail(`${where}: uncaught ${error.message}`));
  const onConsole = (message) => {
    if (message.type() === "error") fail(`${where}: console error while loading: ${message.text()}`);
  };
  page.on("console", onConsole);
  const response = await page.goto(url, { waitUntil: "networkidle" });
  const status = response?.status();
  if (status !== 200) {
    fail(`${url} answered ${status ?? "nothing"}, expected 200`);
    await page.close();
    return null;
  }
  // A cold `astro dev` can answer an empty 200 while Vite re-optimizes its dependencies.
  if ((await page.locator("body > *").count()) === 0) {
    fail(`${where} rendered an empty page`);
    await page.close();
    return null;
  }
  await page.addStyleTag({ content: HIDE_DEV_TOOLBAR });
  // Astro removes the `ssr` attribute once an island has hydrated.
  await page.waitForFunction("!document.querySelector('astro-island[ssr]')");
  await page.evaluate("document.fonts.ready");
  const sideways = await page.evaluate(() => {
    const root = document.documentElement;
    const grids = [...document.querySelectorAll('table[aria-label^="Check-offs of "]')].map((table) => {
      const wrapper = table.parentElement;
      return [table.getAttribute("aria-label"), wrapper.scrollWidth - wrapper.clientWidth];
    });
    return { page: root.scrollWidth - root.clientWidth, count: grids.length, grids: grids.filter(([, by]) => by > 0) };
  });
  // A gate that finds no grid checks nothing: a renamed aria-label or a fixture without tasks would stay green.
  if (GRID_STATES.includes(target) && sideways.count === 0) fail(`${where}: no check-off grid found to measure`);
  if (sideways.page > 0) fail(`${where}: the page scrolls sideways by ${sideways.page}px`);
  for (const [label, by] of sideways.grids) fail(`${where}: the grid "${label}" scrolls sideways by ${by}px`);
  page.off("console", onConsole);
  return page;
}

async function capture(page, file, region) {
  await page.waitForTimeout(SETTLE_MS);
  const out = path.join(OUT_DIR, file);
  if (region) await region.screenshot({ path: out });
  else await page.screenshot({ path: out });
  console.log(`SHOT  ${out}`);
}

async function shootPages(context, prefix, set, viewport, pages) {
  for (const [name, target] of pages) {
    const page = await open(context, target);
    if (!page) continue;
    await page.screenshot({ path: path.join(OUT_DIR, `${prefix}-${set}-${name}-${viewport}.png`), fullPage: true });
    console.log(`SHOT  ${prefix}-${set}-${name}-${viewport}.png`);
    await page.close();
  }
}

// The kitchen sink's index links every state: it is the one list of state ids.
async function kitchenSinkStates(context) {
  const page = await open(context, KITCHEN_SINK);
  if (!page) return [];
  const hrefs = await page.locator('a[href*="?state="]').evaluateAll((links) => links.map((a) => a.href));
  await page.close();
  const ids = hrefs.map((href) => new URL(href).searchParams.get("state")).filter(Boolean);
  if (ids.length === 0) fail(`${KITCHEN_SINK} lists no states`);
  return ids;
}

async function shootControls(context, prefix, viewport) {
  for (const spec of CONTROLS) {
    const runs = spec.run ? [[null, spec.run]] : spec.modes.map((mode) => [mode, null]);
    for (const [mode, run] of runs) {
      const page = await open(context, spec.page);
      if (!page) continue;
      const control = spec.control(page);
      try {
        await control.waitFor({ state: "visible", timeout: 5000 });
      } catch {
        fail(`control "${spec.name}" not found on ${pathFor(spec.page)}`);
        await page.close();
        continue;
      }
      // Pinned before the action: a locator resolves again at capture time, and a tap that turns "Mark done" into
      // "Undo" would move `inRow(markDone)` to the next row.
      const region = await spec.region(control)?.elementHandle();
      if (region) await region.scrollIntoViewIfNeeded();
      let release;
      if (run) {
        release = await run(page, control, region);
      } else if (mode === "hover") {
        await control.hover();
      } else {
        // A key press first, so the programmatic focus matches :focus-visible as keyboard focus does.
        await page.keyboard.press("Shift");
        await control.focus();
      }
      const name = mode ? `${spec.name}-${mode}` : spec.name;
      await capture(page, `${prefix}-controls-${name}-${viewport}.png`, region);
      if (release) await release();
      await page.close();
    }
  }
}

// --- Main ---------------------------------------------------------------------------------------------------------

const [prefix, ...sets] = process.argv.slice(2);
const KNOWN_SETS = ["public", "states", "controls"];
if (!OUT_DIR || !prefix || sets.length === 0 || sets.some((set) => !KNOWN_SETS.includes(set))) {
  console.log(
    `Usage: OUT_DIR=context/changes/<change-id>/screenshots node scripts/ui-screenshots.mjs <prefix> <${KNOWN_SETS.join("|")}>...`,
  );
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    for (const set of sets) {
      if (set === "public") await shootPages(context, prefix, set, viewport, PUBLIC_PAGES);
      if (set === "states") {
        const states = await kitchenSinkStates(context);
        await shootPages(
          context,
          prefix,
          set,
          viewport,
          states.map((id) => [id, id]),
        );
      }
      if (set === "controls") await shootControls(context, prefix, viewport);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : "\nAll screenshots taken");
process.exit(failures.length ? 1 : 0);
