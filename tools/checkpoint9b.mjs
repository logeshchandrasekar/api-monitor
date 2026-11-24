// Checkpoint 9b in one command: everything CI runs on a fresh clone, then the load check, then the browser journey.
//
//   docker compose up -d db          (Postgres on 5433, with the api_monitor_test database)
//   npm run checkpoint:9b            (about 8 minutes; commit your work first, the fresh-clone step tests committed code only)
//
// Set CI_DB_PORT if your Postgres is not on 5433. The browser step needs `npx playwright install chromium` once.
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = (title, command) => {
  console.log(`\n=== ${title}\n    $ ${command}`);
  execSync(command, { cwd: root, stdio: "inherit" });
};
const results = [];
const attempt = (title, fn) => {
  try {
    fn();
    results.push([title, true]);
  } catch {
    results.push([title, false]);
  }
};

attempt(
  "CI steps pass on a fresh clone (format, types, tests with coverage thresholds, lint, build)",
  () => run("CI on a fresh clone", "npm run ci:local"),
);

attempt("Load check: 200 monitors at 30 s, scheduler keeps up, memory stable", () => {
  console.log("\n=== Load check");
  const flaky = spawn(process.execPath, ["tools/flaky-api/server.js"], {
    cwd: root,
    stdio: "ignore",
  });
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); // let the flaky API start
    run("Load check", "npm run loadcheck -w server -- --seconds 150");
  } finally {
    flaky.kill();
  }
});

attempt("Browser journey passes with no console errors", () =>
  run("End-to-end journey", "npm run e2e"),
);

console.log("\n=== Checkpoint 9b");
for (const [title, ok] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${title}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);