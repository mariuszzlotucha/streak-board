// Visual gate: captures the evidence of a UI change the same way in every phase (S-11 `dashboard-ui`).
// Run against a running `astro dev` (the kitchen sink is dev-only): BASE_URL=http://localhost:4321 node scripts/ui-screenshots.mjs <prefix> <set...>
// Sets: `public` (the public pages), `states` (every kitchen-sink state), `controls` (hover, focus-visible and the
// pending, failed and fallback states of representative controls). No baselines and no comparison: the PNG files are
// reviewed by a person. Exits 1 when a page does not answer 200, renders empty, throws, or logs a console error while it
// loads, or when a listed control is missing.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const OUT_DIR = process.env.OUT_DIR ?? "context/changes/dashboard-ui/screenshots";
const KITCHEN_SINK = "/dev/dashboard-kitchen-sink";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
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
// state that needs a held or failed request. Phase 2 adds the controls that only exist after it (see its plan).

const inRow = (control) => control.locator("xpath=ancestor::li[1]");
const inCard = (control) => control.locator("xpath=ancestor::*[@data-slot='card'][1]");

const CONTROLS = [
  {
    name: "mark-done",
    page: "owner",
    control: (p) => p.getByRole("button", { name: /^Mark done / }).first(),
    region: inRow,
    modes: ["hover", "focus"],
  },
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
  {
    name: "copy",
    page: "owner",
    control: (p) => p.getByRole("button", { name: "Copy", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    name: "add-task",
    page: "owner",
    control: (p) => p.getByRole("button", { name: "Add task", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    name: "rename-group",
    page: "owner",
    control: (p) => p.getByRole("button", { name: "Rename group", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    name: "delete-group",
    page: "owner",
    control: (p) => p.getByRole("button", { name: "Delete group", exact: true }),
    region: inCard,
    modes: ["hover", "focus"],
  },
  {
    name: "task-title-field",
    page: "owner",
    control: (p) => p.getByLabel("Task title"),
    region: inCard,
    modes: ["focus"],
  },
  {
    name: "recurrence-field",
    page: "owner",
    control: (p) => p.locator("#new-task-recurrence"),
    region: inCard,
    modes: ["focus"],
  },
  {
    name: "footer-link",
    page: "owner",
    control: (p) => p.getByRole("link", { name: "Privacy Policy" }),
    region: (control) => control.locator("xpath=ancestor::footer[1]"),
    modes: ["hover", "focus"],
  },
  {
    name: "header-link",
    page: "/auth/signin",
    control: (p) => p.getByRole("banner").getByRole("link", { name: "StreakBoard" }),
    region: (control) => control.locator("xpath=ancestor::header[1]"),
    modes: ["hover", "focus"],
  },
  {
    // The tap flips the row at once and dims the new button while the request is held.
    name: "checkoff-pending",
    page: "owner",
    control: (p) => p.getByRole("button", { name: /^Mark done / }).first(),
    region: inRow,
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
    control: (p) => p.getByRole("button", { name: /^Mark done / }).first(),
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
    page: "owner",
    control: (p) => p.getByRole("button", { name: "Delete group", exact: true }),
    region: () => null,
    run: async (page, control) => {
      await control.click();
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      // The native POST is cancelled in the page (a held navigation would block every Playwright wait); the island's
      // submit handler still runs, so the dialog shows exactly its submitting state.
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
      const region = spec.region(control);
      if (region) await region.scrollIntoViewIfNeeded();
      let release;
      if (run) {
        release = await run(page, control);
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
if (!prefix || sets.length === 0 || sets.some((set) => !KNOWN_SETS.includes(set))) {
  console.log(`Usage: node scripts/ui-screenshots.mjs <prefix> <${KNOWN_SETS.join("|")}>...`);
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
