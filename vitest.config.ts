import { defineConfig } from "vitest/config";

// `vitest run` (`npm test`) runs both projects; `vitest run --project unit` (`npm run test:unit`) needs no stack.
// The e2e files (`*.spec.ts`, `*.setup.ts`) belong to Playwright and match neither project.
export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.ts", "./vitest.integration.config.ts"],
  },
});
