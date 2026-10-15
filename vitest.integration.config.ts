import { defineConfig } from "vitest/config";
import { shared } from "./vitest.unit.config.ts";

// Real Supabase clients against the local stack: the global setup reads the URL and keys from `supabase status`.
export default defineConfig({
  resolve: shared.resolve,
  test: {
    ...shared.test,
    name: "integration",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/setup/global-setup.ts"],
  },
});
