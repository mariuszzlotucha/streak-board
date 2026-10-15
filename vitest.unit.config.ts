import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Settings both Vitest projects share. The unit project is also Stryker's config (`vitest.configFile` in
 * stryker.config.json), so this file stays a complete, standalone config.
 */
export const shared = {
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node" as const,
    // The rule must not depend on the host zone. A zone west of UTC with DST exposes local-time Date getters that
    // Warsaw (the dev box) and UTC (CI) hide.
    env: { TZ: "America/Los_Angeles" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
};

// Pure rules and mappers: no global setup, so it runs without the local Supabase stack (`npm run test:unit`).
export default defineConfig({
  resolve: shared.resolve,
  test: {
    ...shared.test,
    name: "unit",
    include: ["tests/unit/**/*.test.ts"],
  },
});
