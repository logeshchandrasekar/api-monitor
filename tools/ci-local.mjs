// Runs the same steps as the "server" and "client" jobs in .github/workflows/ci.yml, on a FRESH CLONE of your
// committed code, so "CI is green on a fresh clone" can be checked before you push.
//
//   docker compose up -d db        (Postgres on port 5433; it creates the api_monitor_test database)
//   npm run ci:local
//
// Only committed files are tested: commit first. Set CI_DB_PORT if your Postgres is not on 5433, and
// CI_KEEP=1 to keep the temporary clone (its path is printed) when something fails.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.CI_DB_PORT ?? "5433";
const source = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const work = mkdtempSync(join(tmpdir(), "api-monitor-ci-"));
const repo = join(work, "repo");
const started = Date.now();

const run = (title, command, cwd = repo, env = {}) => {
  console.log(`\n==> ${title}\n    $ ${command}`);
  execSync(command, { cwd, stdio: "inherit", env: { ...process.env, CI: "true", ...env } });
};

try {
  const branch = execSync("git branch --show-current", {
    cwd: source,
    encoding: "utf8",
  }).trim();

  run(
    "Fresh clone of the committed code",
    `git -c core.autocrlf=false clone --quiet --branch "${branch}" "${source}" "${repo}"`,
    source,
  );
  run("Install exactly what the lockfile says", "npm ci");
  run("Generate the Prisma client", "npx prisma generate", join(repo, "server"), {
    DATABASE_URL: `postgresql://apimonitor:apimonitor@localhost:${port}/api_monitor_test?schema=public`,
  });
  run("Write the test environment", `node tools/ci-env.mjs ${port}`);
  run("Prettier", "npx prettier --check .");
  run("Server typecheck", "npm run typecheck -w server");
  run("Server tests with coverage (migrations run first)", "npm run coverage -w server");
  run("Client lint", "npm run lint -w client");
  run("Client typecheck", "npm run typecheck -w client");
  run("Client tests with coverage", "npm run coverage -w client");
  run("Client build", "npm run build -w client");
  console.log(`\nAll CI steps passed in ${Math.round((Date.now() - started) / 1000)} s.`);
} catch {
  console.error("\nA CI step failed (see above).");
  if (process.env.CI_KEEP) console.error(`The clone is kept at ${repo}`);
  process.exitCode = 1;
} finally {
  if (!process.env.CI_KEEP) rmSync(work, { recursive: true, force: true });
}
