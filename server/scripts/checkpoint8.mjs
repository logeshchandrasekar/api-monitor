// Automated Checkpoint 8 check against a RUNNING dev server, the flaky test API AND Mailpit.
//   terminal 1:  docker compose --profile mail up -d mailpit      (SMTP on 1025, UI and API on http://localhost:8025)
//   terminal 2:  npm run flaky
//   terminal 3:  ALERT_RETRY_BASE_MS=1000 DISPATCH_TICK_MS=1000 npm run dev -w server
//                (server/.env needs ALLOW_PRIVATE_TARGETS=true and SCHEDULER_TICK_MS=2000, as in Phase 4;
//                 the two variables above make retries take seconds instead of 12 minutes)
//   terminal 4:  npm run checkpoint:8 -w server        (takes about 6 minutes)
//
// It stops and starts Mailpit by itself with `docker compose`. Set MAILPIT_STOP / MAILPIT_START to other
// commands if you run Mailpit some other way.
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:4000/api";
const FLAKY = process.env.FLAKY_URL ?? "http://localhost:4100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const STOP = process.env.MAILPIT_STOP ?? "docker compose --profile mail stop mailpit";
const START = process.env.MAILPIT_START ?? "docker compose --profile mail start mailpit";
const REPO_ROOT = new URL("../../", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie?.()[0];
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }
}

let failures = 0;
function check(label, ok, extra = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : extra ? `  -> ${extra}` : ""}`);
}
function step(title) {
  console.log(`\n--- ${title}`);
}

async function waitFor(fn, timeoutMs, everyMs = 1000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(everyMs);
  }
  return false;
}

const flaky = (path) => fetch(FLAKY + path, { method: "POST" });

// ---- Mailpit -------------------------------------------------------------------------------
async function mailpitMessages() {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  return (await res.json()).messages ?? [];
}
/** Messages whose subject mentions this monitor's unique name. */
async function mailsFor(name) {
  return (await mailpitMessages()).filter((m) => m.Subject.includes(name));
}
async function mailBody(id) {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const m = await res.json();
  return { text: m.Text ?? "", html: m.HTML ?? "", to: (m.To ?? []).map((t) => t.Address) };
}
const run = (cmd) => execSync(cmd, { cwd: REPO_ROOT, stdio: "pipe" });

// Same wording as server/src/services/alertTemplates.ts
function formatDuration(totalSec) {
  const sec = Math.max(0, Math.round(totalSec));
  const units = [
    ["d", Math.floor(sec / 86400)],
    ["h", Math.floor((sec % 86400) / 3600)],
    ["min", Math.floor((sec % 3600) / 60)],
    ["s", sec % 60],
  ];
  const parts = units.filter(([, n]) => n > 0).slice(0, 2);
  return parts.length === 0 ? "0 s" : parts.map(([u, n]) => `${n} ${u}`).join(" ");
}

// ---- preflight -----------------------------------------------------------------------------
try {
  await flaky("/admin/up");
} catch {
  console.error(`Cannot reach the flaky API at ${FLAKY}. Start it with: npm run flaky`);
  process.exit(1);
}
try {
  await fetch(`${BASE}/monitors`);
} catch {
  console.error(`Cannot reach the API at ${BASE}. Start it with: npm run dev -w server`);
  process.exit(1);
}
try {
  await fetch(`${MAILPIT}/api/v1/messages?limit=1`);
} catch {
  console.error(
    `Cannot reach Mailpit at ${MAILPIT}. Start it with: docker compose --profile mail up -d mailpit`,
  );
  process.exit(1);
}
await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" }); // an empty inbox, so every count below is exact

// ---- setup ---------------------------------------------------------------------------------
const tag = Date.now().toString(36).toUpperCase();
const email = `cp8-${tag.toLowerCase()}@example.com`;
const s = new Session();
const reg = await s.call("POST", "/auth/register", {
  name: "CP8",
  email,
  password: "correct-horse-battery",
});
if (reg.status !== 201) {
  console.error(`register failed: ${reg.status} ${reg.text}`);
  process.exit(1);
}

async function makeMonitor(suffix) {
  const name = `CP8-${tag}-${suffix}`;
  const r = await s.call("POST", "/monitors", {
    name,
    url: `${FLAKY}/ok`,
    intervalSec: 10,
    timeoutMs: 3000,
  });
  if (r.status !== 201) {
    console.error(`create monitor failed: ${r.status} ${r.text}`);
    process.exit(1);
  }
  return { id: r.json.monitor.id, name };
}
const getMonitor = async (m) => (await s.call("GET", `/monitors/${m.id}`)).json.monitor;
const history = async (m) =>
  (await s.call("GET", `/monitors/${m.id}/notifications?limit=50`)).json.items;
const statusIs = (m, status) => async () => (await getMonitor(m)).status === status;

const A = await makeMonitor("A"); // all defaults
const B = await makeMonitor("B"); // "notify when down" unchecked below
const C = await makeMonitor("C"); // resumed later: the mail server comes back during retries
const D = await makeMonitor("D"); // resumed later: the mail server stays away until the alert FAILS
await s.call("POST", `/monitors/${C.id}/pause`);
await s.call("POST", `/monitors/${D.id}/pause`);

step("1. Settings and the test email");
const defaults = await s.call("GET", `/monitors/${A.id}/alerts`);
check(
  "a new monitor has the default rule (all on, 30 min cooldown, account email)",
  defaults.status === 200 &&
    defaults.json.alerts.notifyOnDown &&
    defaults.json.alerts.notifyOnRecovery &&
    defaults.json.alerts.notifyOnSlow &&
    defaults.json.alerts.cooldownMinutes === 30 &&
    defaults.json.alerts.recipientEmail === null &&
    defaults.json.alerts.effectiveRecipient === email,
  defaults.text,
);
const bad = await s.call("PUT", `/monitors/${A.id}/alerts`, {
  ...defaults.json.alerts,
  cooldownMinutes: 0,
});
check(
  "an invalid rule is a 400 with a field error",
  bad.status === 400 && bad.json.error.code === "VALIDATION_ERROR",
);

const putB = await s.call("PUT", `/monitors/${B.id}/alerts`, {
  notifyOnDown: false,
  notifyOnRecovery: true,
  notifyOnSlow: true,
  cooldownMinutes: 30,
  recipientEmail: null,
});
check(
  "unchecking 'notify when down' on monitor B is saved",
  putB.status === 200 && putB.json.alerts.notifyOnDown === false,
);

const test = await s.call("POST", `/monitors/${A.id}/alerts/test`);
check(
  "Send test email answers 200 SENT",
  test.status === 200 && test.json.notification.status === "SENT",
  test.text,
);
check(
  "the test email arrives in Mailpit, addressed to the account",
  await waitFor(async () => (await mailsFor(A.name)).length === 1, 10_000),
);
const testMail = (await mailsFor(A.name))[0];
check(
  "its subject says TEST",
  testMail?.Subject === `[TEST] Alerts for ${A.name}`,
  testMail?.Subject,
);
if (testMail)
  check("it went to the account email", (await mailBody(testMail.ID)).to.includes(email));
await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });

check(
  "A and B are HEALTHY after their first check",
  await waitFor(
    async () => (await statusIs(A, "HEALTHY")()) && (await statusIs(B, "HEALTHY")()),
    30_000,
  ),
);

// ---- outage 1 -------------------------------------------------------------------------------
step("2. Outage 1: exactly one DOWN email for A, none for B (box unchecked)");
await flaky("/admin/down?mode=503");
check("A goes DOWN after 3 failed checks", await waitFor(statusIs(A, "DOWN"), 90_000));
check(
  "one DOWN email arrives for A",
  await waitFor(async () => (await mailsFor(A.name)).length >= 1, 20_000),
);
const down = (await mailsFor(A.name))[0];
check(
  "its subject is [DOWN] ... is down",
  down?.Subject === `[DOWN] ${A.name} is down`,
  down?.Subject,
);
if (down) {
  const body = await mailBody(down.ID);
  check(
    "it names the endpoint, the reason and links to the monitor",
    body.text.includes(`${FLAKY}/ok`) &&
      body.text.includes("3 failed checks in a row") &&
      body.text.includes(`/monitors/${A.id}`),
    body.text,
  );
  check(
    "it contains no query string, header or secret wording",
    !/authorization|cookie|api[_-]?key/i.test(body.text + body.html),
  );
}
console.log("      (waiting 30 s: at least three more failed checks happen)");
await sleep(30_000);
const stillOne = await mailsFor(A.name);
check(
  "still exactly ONE email for A after more failed checks (once per incident, not per check)",
  stillOne.length === 1,
  `${stillOne.length} emails`,
);
const aDown = (await history(A)).filter((n) => n.type === "DOWN");
check(
  "A's history has one DOWN row, SENT",
  aDown.length === 1 && aDown[0].status === "SENT" && aDown[0].attempts === 1,
  JSON.stringify(aDown),
);
check(
  "B is DOWN too, but unchecked means no email and no history row",
  (await getMonitor(B)).status === "DOWN" &&
    (await mailsFor(B.name)).length === 0 &&
    (await history(B)).length === 0,
);

// ---- recovery -------------------------------------------------------------------------------
step("3. Recovery: exactly one RECOVERED email with the right duration");
await flaky("/admin/up");
check("A is HEALTHY again", await waitFor(statusIs(A, "HEALTHY"), 60_000));
check(
  "a RECOVERED email arrives for A",
  await waitFor(async () => (await mailsFor(A.name)).length >= 2, 25_000),
);
const aMails = await mailsFor(A.name);
const rec = aMails.find((m) => m.Subject.startsWith("[RECOVERED]"));
check(
  "exactly two emails for A in total (DOWN, RECOVERED)",
  aMails.length === 2,
  aMails.map((m) => m.Subject).join(" | "),
);
const incident = (await s.call("GET", `/monitors/${A.id}/incidents`)).json.items[0];
check(
  "the incident is RECOVERED with a duration",
  incident?.status === "RESOLVED" &&
    incident.resolution === "RECOVERED" &&
    incident.durationSec > 0,
  JSON.stringify(incident),
);
if (rec && incident) {
  const wording = formatDuration(incident.durationSec);
  check(
    `the recovery email says it was down for ${wording}`,
    rec.Subject === `[RECOVERED] ${A.name} is back after ${wording}`,
    rec.Subject,
  );
  check(
    "its text has a 'Down for' line",
    (await mailBody(rec.ID)).text.includes(`Down for: ${wording}`),
  );
}
check(
  "B (no DOWN alert was sent) gets no recovery email either",
  (await mailsFor(B.name)).length === 0,
);

// ---- flapping -------------------------------------------------------------------------------
step("4. Flapping: the cooldown suppresses the repeat");
await flaky("/admin/down?mode=503");
check("A goes DOWN again", await waitFor(statusIs(A, "DOWN"), 90_000));
check(
  "its history shows a SUPPRESSED DOWN row that mentions the cooldown",
  await waitFor(
    async () =>
      (await history(A)).some(
        (n) => n.type === "DOWN" && n.status === "SUPPRESSED" && /Cooldown/.test(n.note ?? ""),
      ),
    15_000,
  ),
);
await flaky("/admin/up");
check("A is HEALTHY again", await waitFor(statusIs(A, "HEALTHY"), 60_000));
await sleep(8000);
const afterFlap = await mailsFor(A.name);
check(
  "still exactly two emails for A: no second DOWN, no second RECOVERED",
  afterFlap.length === 2,
  afterFlap.map((m) => m.Subject).join(" | "),
);
check(
  "the suppressed outage has no RECOVERED row",
  (await history(A)).filter((n) => n.type === "RECOVERED").length === 1,
);

// ---- mail server stops, then comes back during the retries ------------------------------------
step("5. Mailpit stopped during an incident: the checks go on and the email is retried");
await s.call("POST", `/monitors/${C.id}/resume`);
check("C is HEALTHY", await waitFor(statusIs(C, "HEALTHY"), 30_000));
run(STOP);
await flaky("/admin/down?mode=503");
check("C goes DOWN", await waitFor(statusIs(C, "DOWN"), 90_000));
check(
  "C's DOWN alert is being retried (QUEUED, attempts >= 1, a safe error sentence)",
  await waitFor(async () => {
    const row = (await history(C)).find((n) => n.type === "DOWN");
    return (
      row &&
      row.status === "QUEUED" &&
      row.attempts >= 1 &&
      row.error === "Could not reach the mail server."
    );
  }, 40_000),
);
const before = (await getMonitor(C)).lastCheckedAt;
await sleep(12_000);
check("checks keep running while mail is down", (await getMonitor(C)).lastCheckedAt !== before);
run(START);
console.log("      (Mailpit is back; waiting for the retry)");
check(
  "the retry succeeds: the row becomes SENT with attempts >= 2",
  await waitFor(async () => {
    const row = (await history(C)).find((n) => n.type === "DOWN");
    return row && row.status === "SENT" && row.attempts >= 2;
  }, 60_000),
);
check(
  "Mailpit holds exactly one DOWN email for C",
  (await mailsFor(C.name)).filter((m) => m.Subject.startsWith("[DOWN]")).length === 1,
);
await flaky("/admin/up");
check(
  "C recovers and the RECOVERED email arrives",
  (await waitFor(statusIs(C, "HEALTHY"), 60_000)) &&
    (await waitFor(
      async () => (await mailsFor(C.name)).some((m) => m.Subject.startsWith("[RECOVERED]")),
      25_000,
    )),
);

// ---- mail server stays away until the alert fails ---------------------------------------------
step("6. Mailpit away for good: the alert ends FAILED, the recovery is not sent");
await s.call("POST", `/monitors/${D.id}/resume`);
check("D is HEALTHY", await waitFor(statusIs(D, "HEALTHY"), 30_000));
run(STOP);
await flaky("/admin/down?mode=503");
check("D goes DOWN", await waitFor(statusIs(D, "DOWN"), 90_000));
check(
  "D's DOWN alert is marked FAILED after 4 attempts, with a safe error",
  await waitFor(async () => {
    const row = (await history(D)).find((n) => n.type === "DOWN");
    return (
      row &&
      row.status === "FAILED" &&
      row.attempts === 4 &&
      row.error === "Could not reach the mail server."
    );
  }, 120_000),
);
check(
  "D is still DOWN and its incident is recorded",
  (await getMonitor(D)).status === "DOWN" &&
    (await s.call("GET", `/monitors/${D.id}/incidents`)).json.items.length === 1,
);
run(START);
await flaky("/admin/up");
check("D recovers", await waitFor(statusIs(D, "HEALTHY"), 60_000));
check(
  "its recovery is SUPPRESSED, and says the alert was never delivered",
  await waitFor(
    async () =>
      (await history(D)).some(
        (n) =>
          n.type === "RECOVERED" &&
          n.status === "SUPPRESSED" &&
          /not delivered|could not be delivered/.test(n.note ?? ""),
      ),
    20_000,
  ),
);
await sleep(3000);
check("Mailpit holds no email for D", (await mailsFor(D.name)).length === 0);

await flaky("/admin/up");
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
