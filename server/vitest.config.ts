import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const testEnv = dotenv.parse(readFileSync(".env.test"));

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    env: { ...testEnv, NODE_ENV: "test" },
    globalSetup: ["./src/tests/globalSetup.ts"],
    setupFiles: ["./src/tests/setup.ts"],
    fileParallelism: false, // all test files share one database
    testTimeout: 15_000,
    hookTimeout: 30_000,
    pool: "threads",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Generated code, the test helpers themselves, the demo seed and the one-off command line entry points
      exclude: [
        "src/generated/**",
        "src/tests/**",
        "src/**/*.test.ts",
        "src/seed/run.ts",
        "src/server.ts",
        "src/jobs/retentionCli.ts",
      ],
      reporter: ["text-summary", "text", "html", "json-summary"],
      // `npm run coverage` fails when a number drops below these. The floors are set a few points under what the
      // suite reaches today (94% lines) so ordinary changes do not trip them; the security-critical files are held much higher.
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 88,
        lines: 90,
        // State machine, crypto and analytics: every line, statement and function
        "src/services/stateMachine.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/services/analytics.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/services/stats.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/utils/crypto.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/utils/headers.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/utils/cookies.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/utils/uptime.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/utils/ticks.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // SSRF protection: every line, and nearly every statement and branch
        "src/utils/url-guard.ts": { statements: 97, branches: 95, functions: 100, lines: 100 },
        "src/utils/safeLookup.ts": { statements: 95, branches: 85, functions: 85, lines: 100 },
      },
    },
  },
});
