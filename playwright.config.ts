import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local secrets (E2E_USERNAME, E2E_PASSWORD) come from the gitignored .env, which also points the build at the local
// Supabase stack. In CI the file is absent and the variables come from the job.
if (existsSync(".env")) process.loadEnvFile(".env");

// 4321 is the Astro preview default (no server.port in astro.config.mjs, no --port in the preview script; README and CI
// use it too). E2E_PORT overrides it when that port is taken on this machine.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `list` prints to the terminal; the HTML report must not open on failure, it would block a run started by an agent.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + preview (the workerd runtime, as in CI), on the port above.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Astro 7 moves `astro preview` into a background daemon when it detects an agent; the npm process would exit and
    // Playwright would report "Process from config.webServer exited early".
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
