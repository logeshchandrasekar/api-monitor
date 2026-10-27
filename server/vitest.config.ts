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
  },
});
