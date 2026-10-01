import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // The rule must not depend on the host zone. A zone west of UTC with DST exposes local-time Date getters that
    // Warsaw (the dev box) and UTC (CI) hide.
    env: { TZ: "America/Los_Angeles" },
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
