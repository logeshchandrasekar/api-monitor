// Starts the real API, drives a full session with secrets in every place a secret can go, then searches the
// log output for those secrets (SEC-2). Exit code 1 if any of them leaked.
//
//   npm run security:logscan -w server        (needs the database from server/.env; leaves no data behind)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createWriteStream, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4010;
const BASE = `http://localhost:${PORT}/api`;
const tag = randomBytes(4).toString("hex");
const secrets = {
  "account password": `Pw-${tag}-registered`,
  "wrong login password": `Pw-${tag}-wrongLogin`,
  "new password": `Pw-${tag}-newPassword`,
  "wrong delete password": `Pw-${tag}-wrongDelete`,
  "Authorization header on the monitor": `Bearer SECRET-${tag}-bearer`,
  "x-api-key header on the monitor": `KEY-${tag}-apikey`,
  "request body on the monitor": `BODY-${tag}-payload`,
};
const email = `logscan-${tag}@example.com`;
const logFile = join(tmpdir(), `logscan-${tag}.log`);

// A little API for the monitor to call, so the scheduler and the manual check both run for real
const target = createServer((req, res) => {
  req.resume();
  res.writeHead(200, { "content-type": "application/json" }).end("{}");
});
await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
const targetUrl = `http://127.0.0.1:${target.address().port}/ok`;

const out = createWriteStream(logFile);
const server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    LOG_LEVEL: "trace",
    ALLOW_PRIVATE_TARGETS: "true",
    ENABLE_SCHEDULER: "true",
    SCHEDULER_TICK_MS: "2000",
    ENABLE_RETENTION: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(out);
server.stderr.pipe(out);

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  return { res, json: await res.json().catch(() => null) };
}

let exitCode = 0;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {}
    if (i > 60) throw new Error("The API did not start. Is the database up? See " + logFile);
    await sleep(500);
  }

  const reg = await api("/auth/register", {
    method: "POST",
    body: { name: "Log Scan", email, password: secrets["account password"] },
  });
  const setCookie = reg.res.headers.get("set-cookie") ?? "";
  const session = setCookie.split(";")[0]; // am_session=<jwt>
  secrets["session cookie value"] = session.split("=")[1];
  const cookie = session;

  await api("/auth/login", {
    method: "POST",
    body: { email, password: secrets["wrong login password"] },
  });
  const login = await api("/auth/login", {
    method: "POST",
    body: { email, password: secrets["account password"] },
  });
  secrets["session cookie from login"] = (login.res.headers.get("set-cookie") ?? "")
    .split(";")[0]
    .split("=")[1];

  const created = await api("/monitors", {
    method: "POST",
    cookie,
    body: {
      name: "Log scan monitor",
      url: targetUrl,
      method: "POST",
      intervalSec: 10,
      headers: [
        { name: "Authorization", value: secrets["Authorization header on the monitor"] },
        { name: "x-api-key", value: secrets["x-api-key header on the monitor"] },
      ],
      body: JSON.stringify({ note: secrets["request body on the monitor"] }),
    },
  });
  if (created.res.status !== 201)
    throw new Error(
      `Could not create the monitor: ${created.res.status} ${JSON.stringify(created.json)}`,
    );
  const id = created.json.monitor.id;

  await api(`/monitors/${id}/check`, { method: "POST", cookie }); // manual check
  await api(`/monitors/${id}`, { cookie });
  await api(`/monitors/${id}`, { method: "PATCH", cookie, body: { name: "Log scan monitor 2" } });
  await api(`/monitors/${id}/alerts`, {
    method: "PUT",
    cookie,
    body: {
      notifyOnDown: true,
      notifyOnRecovery: true,
      notifyOnSlow: true,
      cooldownMinutes: 5,
      recipientEmail: null,
    },
  });
  await api(`/monitors/${id}/alerts/test`, { method: "POST", cookie }); // fails without a mail server: that error path is logged too
  await api("/users/me/password", {
    method: "POST",
    cookie,
    body: { currentPassword: secrets["account password"], newPassword: secrets["new password"] },
  });
  await api("/users/me", {
    method: "DELETE",
    cookie,
    body: { password: secrets["wrong delete password"] },
  });
  await sleep(6000); // give the scheduler time to run scheduled checks (a 10 s monitor is due within 1 s of creation)
  const del = await api("/users/me", {
    method: "DELETE",
    cookie,
    body: { password: secrets["new password"] },
  });
  if (del.res.status !== 204)
    throw new Error(`Cleanup failed: delete account answered ${del.res.status}`);
  await sleep(500);
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  exitCode = 2;
} finally {
  server.kill("SIGTERM");
  await sleep(1500);
  target.close();
  out.end();
}

if (exitCode === 0) {
  const log = readFileSync(logFile, "utf8");
  const lines = log.split("\n").filter(Boolean).length;
  const leaks = Object.entries(secrets).filter(([, value]) => value && log.includes(value));
  // Server-side secrets too: they must never be printed either
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const name of ["JWT_SECRET", "ENCRYPTION_KEY"]) {
    const value = env.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"))?.[1];
    if (value && log.includes(value)) leaks.push([name, value]);
  }

  console.log(`Scanned ${lines} log lines (${logFile})`);
  console.log(
    `Searched for ${Object.keys(secrets).length + 2} secrets: ${Object.keys(secrets).join(", ")}, JWT_SECRET, ENCRYPTION_KEY`,
  );
  console.log(
    `"[redacted]" appears ${log.split("[redacted]").length - 1} times (proof the redaction ran)`,
  );
  if (lines < 20 || !log.includes("[redacted]")) {
    console.error(
      "FAIL: the log is too short or has no redaction marker, so this scan proves nothing.",
    );
    exitCode = 2;
  } else if (leaks.length) {
    for (const [name] of leaks) console.error(`FAIL: ${name} appears in the logs`);
    exitCode = 1;
  } else {
    console.log("PASS: none of the secrets appear anywhere in the logs.");
  }
}
process.exit(exitCode);
