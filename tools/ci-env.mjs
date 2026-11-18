// Writes server/.env.test and server/.env for CI and for tools/ci-local.mjs: the example files with the database port
// set and fresh random secrets. Nothing secret is ever committed.
//   node tools/ci-env.mjs [dbPort]        (default 5432: the Postgres service GitHub starts for the job)
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const port = process.argv[2] ?? "5432";
const server = new URL("../server/", import.meta.url);
const hex = () => randomBytes(32).toString("hex");
const b64 = () => randomBytes(32).toString("base64");

function make(example, out, replacements) {
  let text = readFileSync(new URL(example, server), "utf8");
  for (const [pattern, value] of replacements) text = text.replace(pattern, value);
  writeFileSync(new URL(out, server), text.endsWith("\n") ? text : text + "\n");
  console.log(`wrote server/${out}`);
}

const common = [
  [/:5433\//g, `:${port}/`],
  [/^JWT_SECRET=.*$/m, () => `JWT_SECRET=${hex()}`],
  [/^ENCRYPTION_KEY=.*$/m, () => `ENCRYPTION_KEY=${b64()}`],
];

make(".env.test.example", ".env.test", common);
make(".env.example", ".env", [
  ...common,
  [/^ALLOW_PRIVATE_TARGETS=.*$/m, "ALLOW_PRIVATE_TARGETS=true"],
  [/^SCHEDULER_TICK_MS=.*$/m, "SCHEDULER_TICK_MS=2000"],
]);
