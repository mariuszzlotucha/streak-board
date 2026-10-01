# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.63.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:4321
- port: 4321 (detected from the Astro preview default: no server.port in astro.config.mjs and no --port in the preview script, README and CI use it too; detected default 4321, override with E2E_PORT)
- web server command: npm run build && npm run preview -- --port 4321 (the config passes E2E_PORT when set); reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects risk #5: sign-in stops working (the gate lets a signed-out visitor through, or the real form never reaches the dashboard)
- browser CLI: playwright-cli, command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-01
