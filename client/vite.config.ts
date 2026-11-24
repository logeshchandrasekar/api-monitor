import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
  },
  test: {
    // Pure-logic tests run in Node. A component test opts in to a browser-like page with
    // `// @vitest-environment jsdom` on its first line.
    setupFiles: [resolve(process.cwd(), "src/test/setup.ts")],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/main.tsx",
        "src/pages/dev/**",
        "src/vite-env.d.ts",
      ],
      reporter: ["text-summary", "text", "html", "json-summary"],
      // Floors a few points under today's numbers (about 38 % statements). The client is covered by its logic tests,
      // these component tests and the end-to-end test; the floors only catch a real drop, not noise
      thresholds: { statements: 33, branches: 36, functions: 20, lines: 32 },
    },
  },
});
