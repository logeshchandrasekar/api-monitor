// Automated Checkpoint 3 check against a RUNNING dev server AND the flaky test API.
//   terminal 1:  npm run flaky
//   terminal 2:  npm run dev -w server      (ALLOW_PRIVATE_TARGETS=true, SCHEDULER_TICK_MS=2000 in server/.env)
//   terminal 3:  npm run checkpoint:3 -w server        (takes about 90 seconds)
const BASE = process.env.BASE_URL ?? "http://localhost:4000/api";
const FLAKY = process.env.FLAKY_URL ?? "http://localhost:4100";
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

// ---- preflight -----------------------------------------------------------------------------
try {
  const state = await fetch(`${FLAKY}/admin/state`).then((r) => r.json());
  if (state.mode !== "up") await fetch(`${FLAKY}/admin/up`, { method: "POST" });
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

// ---- setup: one user, four monitors with a 10 s interval -----------------------------------
const s = new Session();
const reg = await s.call("POST", "/auth/register", {
  name: "CP3",
  email: `cp3-${Date.now()}@example.com`,
  password: "correct-horse-battery",
});
if (reg.status !== 201) {
  console.error(`register failed: ${reg.status} ${reg.text}`);
  process.exit(1);
}

const make = async (name, url, extra = {}) => {
  const res = await s.call("POST", "/monitors", { name, url, intervalSec: 10, ...extra });
  if (res.status !== 201) {
    console.error(`could not create "${name}": ${res.status} ${res.text}`);
    console.error("Is ALLOW_PRIVATE_TARGETS=true in server/.env? Did you restart the server?");
    process.exit(1);
  }
  return res.json.monitor.id;
};
const okId = await make("cp3 ok", "http://localhost:4100/ok");
const slowId = await make("cp3 slow", "http://localhost:4100/slow?ms=2000", {
  responseThresholdMs: 1000,
});
const badId = await make("cp3 500", "http://localhost:4100/status/500");
const deadId = await make("cp3 dead port", "http://localhost:4199/");
const all = [okId, slowId, badId, deadId];

const checksOf = async (id, extra = "") =>
  (await s.call("GET", `/monitors/${id}/checks?limit=100${extra}`)).json?.items ?? [];
const scheduled = async (id) => (await checksOf(id)).filter((c) => c.trigger === "SCHEDULED");

// ---- 1. checks appear on their own ---------------------------------------------------------
console.log("\nWaiting up to 60 s for 3 scheduled checks per monitor...");
const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  const counts = await Promise.all(all.map(async (id) => (await scheduled(id)).length));
  if (counts.every((n) => n >= 3)) break;
  await sleep(2000);
}
const sched = Object.fromEntries(
  await Promise.all(all.map(async (id) => [id, await scheduled(id)])),
);
check(
  "every monitor produced at least 3 scheduled checks on its own",
  all.every((id) => sched[id].length >= 3),
  all.map((id) => sched[id].length).join("/"),
);

const times = sched[okId].map((c) => new Date(c.checkedAt).getTime()).sort((a, b) => a - b);
const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000);
const median = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : NaN;
check(
  `10 s monitor: checks are about 10 s apart (median ${median.toFixed(1)} s)`,
  median >= 8 && median <= 14,
);

// ---- 2. classification ---------------------------------------------------------------------
const all_ = (id, fn) => sched[id].length > 0 && sched[id].every(fn);
check(
  "/ok -> SUCCESS, status 200",
  all_(okId, (c) => c.outcome === "SUCCESS" && c.statusCode === 200),
);
check(
  "/slow?ms=2000 -> SLOW (up, but over the 1 s threshold)",
  all_(slowId, (c) => c.outcome === "SLOW" && c.failureType === null && c.responseTimeMs >= 1900),
);
check(
  "/status/500 -> FAILURE / UNEXPECTED_STATUS",
  all_(
    badId,
    (c) => c.outcome === "FAILURE" && c.failureType === "UNEXPECTED_STATUS" && c.statusCode === 500,
  ),
);
check(
  "dead port -> FAILURE / CONNECTION",
  all_(
    deadId,
    (c) => c.outcome === "FAILURE" && c.failureType === "CONNECTION" && c.statusCode === null,
  ),
);
const messages = all.flatMap((id) => sched[id].map((c) => c.errorMessage ?? ""));
check(
  "error messages are human-readable (no raw codes like ECONNREFUSED)",
  !messages.some((m) => /E[A-Z]{3,}|ERR_|UND_/.test(m)),
);

// ---- 3. manual check -----------------------------------------------------------------------
const before = (await s.call("GET", `/monitors/${okId}`)).json.monitor;
const manual = await s.call("POST", `/monitors/${okId}/check`);
check(
  "manual check -> 201 with trigger MANUAL and the result",
  manual.status === 201 &&
    manual.json?.check?.trigger === "MANUAL" &&
    manual.json?.check?.outcome === "SUCCESS",
  manual.text,
);
const after = (await s.call("GET", `/monitors/${okId}`)).json.monitor;
check(
  "manual check does not change status and is not copied onto the monitor",
  before.status === after.status && after.lastCheckedAt !== manual.json?.check?.checkedAt,
);
check(
  "manual check shows up in the check list",
  (await checksOf(okId)).some((c) => c.trigger === "MANUAL"),
);

// ---- 4. pause / resume ---------------------------------------------------------------------
await s.call("POST", `/monitors/${okId}/pause`);
await sleep(1500); // let a check that was already in flight finish
const pausedCount = (await scheduled(okId)).length;
console.log("\nMonitor paused. Waiting 22 s to prove nothing runs...");
await sleep(22_000);
check(
  "paused monitor: no new scheduled checks in 22 s",
  (await scheduled(okId)).length === pausedCount,
);

await s.call("POST", `/monitors/${okId}/resume`);
let resumed = false;
for (let i = 0; i < 6 && !resumed; i++) {
  await sleep(1500);
  resumed = (await scheduled(okId)).length > pausedCount;
}
check("resume: a new check runs immediately (within ~9 s)", resumed);

// ---- 5. manual-check rate limit (6 per minute per user), last because it uses the quota ----
let limited = null;
for (let i = 0; i < 8 && !limited; i++) {
  const r = await s.call("POST", `/monitors/${deadId}/check`);
  if (r.status === 429) limited = r;
}
check(
  "manual checks are rate limited (429 RATE_LIMITED)",
  limited?.json?.error?.code === "RATE_LIMITED",
  limited ? "" : "never got 429",
);

// ---- 6. ownership --------------------------------------------------------------------------
const other = new Session();
await other.call("POST", "/auth/register", {
  name: "CP3 b",
  email: `cp3b-${Date.now()}@example.com`,
  password: "correct-horse-battery",
});
check(
  "another user gets 404 on check and check list",
  (await other.call("POST", `/monitors/${okId}/check`)).status === 404 &&
    (await other.call("GET", `/monitors/${okId}/checks`)).status === 404,
);

console.log(
  failures === 0
    ? "\nAll automated checks passed. Now do the manual checks from the chapter (restart test, redirect test, Ctrl+C test)."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
