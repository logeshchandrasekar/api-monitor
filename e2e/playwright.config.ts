import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

// One browser test that walks the whole product the way a person would: sign up, add a monitor, watch it
// get checked, pause and resume it, change a setting, delete things, sign out and in, delete the account.
//
//   npm run e2e                       starts the API and the client itself (or reuses ones that are already running)
//   PW_CHROMIUM_PATH=/path/to/chrome  uses a Chromium you already have instead of the one Playwright downloads
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI
    ? [["github"], ["html", { open: "never", outputFolder: "../playwright-report" }]]
    : "list",
  outputDir: "../test-results",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev -w server",
      cwd: "..", // the repository root (the config lives in e2e/)
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !CI,
      timeout: 90_000,
      // The server must be allowed to check localhost (the test monitors the API itself) and tick quickly
      env: { ALLOW_PRIVATE_TARGETS: "true", SCHEDULER_TICK_MS: "2000", NODE_ENV: "development" },
    },
    {
      command: "npm run dev -w client",
      cwd: "..",
      url: "http://localhost:5173",
      reuseExistingServer: !CI,
      timeout: 90_000,
    },
  ],
});