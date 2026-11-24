// Checkpoint 9c in one command: the new list features, then the browser journey and the accessibility pass.
//
//   npm run checkpoint:9c            (about 8 minutes; needs the database and `npx playwright install chromium` once)
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const results = [];
function attempt(title, command) {
  console.log(`\n=== ${title}\n    $ ${command}`);
  try {
    execSync(command, { cwd: root, stdio: "inherit" });
    results.push([title, true]);
  } catch {
    results.push([title, false]);
  }
}

attempt("Server: search, tag filter, sort and the tag list", "npm test -w server -- monitors.list");
attempt("Client: list controls, tags input and form (all client tests)", "npm run test:client");
attempt("Browser journey, including search, tags and sort", "npm run e2e");
attempt(
  "Accessibility and responsive pass (light and dark, phone, tablet and laptop)",
  "npm run e2e:a11y",
);

console.log("\n=== Checkpoint 9c");
for (const [title, ok] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${title}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);