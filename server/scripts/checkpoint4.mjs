// Automated Checkpoint 4 check against a RUNNING dev server AND the flaky test API.
//   terminal 1:  npm run flaky
//   terminal 2:  npm run dev -w server      (ALLOW_PRIVATE_TARGETS=true, SCHEDULER_TICK_MS=2000 in server/.env)
//   terminal 3:  npm run checkpoint:4 -w server        (takes 3-4 minutes)
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

async function waitFor(fn, timeoutMs, everyMs = 1000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(everyMs);
  }
  return false;
}

const flaky = (path) => fetch(FLAKY + path, { method: "POST" });

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

// ---- setup ---------------------------------------------------------------------------------
const s = new Session();
const reg = await s.call("POST", "/auth/register", {
  name: "CP4",
  email: `cp4-${Date.now()}@example.com`,
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
const A = await make("cp4 ok", "http://localhost:4100/ok");
const B = await make("cp4 slow", "http://localhost:4100/slow?ms=2000", {
  responseThresholdMs: 1000,
});

const monitor = async (id) => (await s.call("GET", `/monitors/${id}`)).json?.monitor;
const incidents = async (id) =>
  (await s.call("GET", `/monitors/${id}/incidents?limit=50`)).json?.items ?? [];
const openOf = (items) => items.filter((i) => i.status === "OPEN");

// ---- 1. healthy and degraded ---------------------------------------------------------------
console.log("\nWaiting for A to become HEALTHY and B to become DEGRADED (up to ~90 s)...");
check(
  "A: PENDING -> HEALTHY after its first good check",
  await waitFor(async () => (await monitor(A))?.status === "HEALTHY", 40_000),
);
check("A: no incident while healthy", (await incidents(A)).length === 0);

check(
  "B: three slow checks -> DEGRADED",
  await waitFor(async () => (await monitor(B))?.status === "DEGRADED", 90_000),
);
{
  const items = await incidents(B);
  check(
    "B: exactly one open DEGRADED incident",
    items.length === 1 && openOf(items)[0]?.type === "DEGRADED",
    JSON.stringify(items.map((i) => `${i.type}:${i.status}`)),
  );
}

// ---- 2. outage -----------------------------------------------------------------------------
console.log("\nflaky-api goes down (every request answers 503). Waiting for A to become DOWN...");
await flaky("/admin/down");
const seen = [];
const aDown = await waitFor(async () => {
  const m = await monitor(A);
  if (m) seen.push(`${m.status}/${m.failStreak}`);
  return m?.status === "DOWN";
}, 80_000);
check("A: DOWN after the third failed check", aDown);
check(
  "A: stayed HEALTHY after failed checks 1 and 2",
  seen.includes("HEALTHY/1") && seen.includes("HEALTHY/2"),
  [...new Set(seen)].join(" "),
);
{
  const items = await incidents(A);
  check(
    "A: exactly one incident opened, type DOWN, at least 3 failed checks",
    items.length === 1 &&
      items[0].type === "DOWN" &&
      items[0].status === "OPEN" &&
      items[0].failedChecks >= 3 &&
      items[0].failureType === "UNEXPECTED_STATUS",
    JSON.stringify(items),
  );
}

check(
  "B: DEGRADED -> DOWN as well",
  await waitFor(async () => (await monitor(B))?.status === "DOWN", 40_000),
);
{
  const items = await incidents(B);
  const degraded = items.find((i) => i.type === "DEGRADED");
  check(
    "B: the DEGRADED incident was closed and exactly one incident (DOWN) is open",
    degraded?.status === "RESOLVED" &&
      openOf(items).length === 1 &&
      openOf(items)[0].type === "DOWN",
    JSON.stringify(items.map((i) => `${i.type}:${i.status}`)),
  );
}

console.log("\nStill down for 12 s: the same incident must keep counting, not duplicate...");
await sleep(12_000);
{
  const items = await incidents(A);
  check(
    "A: still ONE incident, now with at least 4 failed checks",
    items.length === 1 && items[0].failedChecks >= 4,
    JSON.stringify(items.map((i) => i.failedChecks)),
  );
}

// ---- 3. recovery ---------------------------------------------------------------------------
console.log("\nflaky-api comes back. Waiting for recovery...");
await flaky("/admin/up");
check(
  "A: one good check -> HEALTHY",
  await waitFor(async () => (await monitor(A))?.status === "HEALTHY", 40_000),
);
{
  const items = await incidents(A);
  const i = items[0];
  check(
    "A: incident resolved as RECOVERED with a sensible duration",
    items.length === 1 &&
      i.status === "RESOLVED" &&
      i.resolution === "RECOVERED" &&
      i.ongoing === false &&
      i.durationSec >= 10 &&
      i.durationSec <= 400,
    JSON.stringify(i),
  );
}
check(
  "B: DOWN + slow success -> DEGRADED again",
  await waitFor(async () => (await monitor(B))?.status === "DEGRADED", 40_000),
);
{
  const items = await incidents(B);
  const down = items.find((i) => i.type === "DOWN");
  check(
    "B: the DOWN incident is resolved and a new DEGRADED one is the only open one",
    down?.status === "RESOLVED" &&
      openOf(items).length === 1 &&
      openOf(items)[0].type === "DEGRADED",
    JSON.stringify(items.map((i) => `${i.type}:${i.status}`)),
  );
}

// ---- 4. manual checks do not move state ----------------------------------------------------
{
  const before = { status: (await monitor(B)).status, incidents: (await incidents(B)).length };
  for (let i = 0; i < 3; i++) await s.call("POST", `/monitors/${B}/check`);
  const after = { status: (await monitor(B)).status, incidents: (await incidents(B)).length };
  check(
    "manual checks change neither status nor incidents",
    before.status === after.status && before.incidents === after.incidents,
    JSON.stringify({ before, after }),
  );
}

// ---- 5. pause and resume -------------------------------------------------------------------
{
  const paused = await s.call("POST", `/monitors/${B}/pause`);
  const items = await incidents(B);
  check(
    "pause: the open incident is resolved with PAUSED",
    paused.status === 200 &&
      openOf(items).length === 0 &&
      items.some((i) => i.resolution === "PAUSED"),
    JSON.stringify(items.map((i) => `${i.type}:${i.resolution}`)),
  );
  const resumed = await s.call("POST", `/monitors/${B}/resume`);
  check(
    "resume: state is PENDING again",
    resumed.json?.monitor?.status === "PENDING" && resumed.json?.monitor?.isPaused === false,
  );
}

// ---- 6. global endpoints and ownership -----------------------------------------------------
{
  const all = await s.call("GET", "/incidents?limit=100");
  check(
    "GET /incidents lists incidents of both monitors",
    all.status === 200 && new Set(all.json?.items?.map((i) => i.monitorId)).size === 2,
  );
  const one = await s.call("GET", `/incidents/${all.json.items[0].id}`);
  check(
    "GET /incidents/:id works for the owner",
    one.status === 200 && one.json?.incident?.id === all.json.items[0].id,
  );

  const summary = (await s.call("GET", "/dashboard/summary")).json;
  check(
    "dashboard summary: 2 monitors, uptime is a percentage, active incident count matches",
    summary?.monitors?.total === 2 &&
      typeof summary.uptime24h === "number" &&
      summary.uptime24h >= 0 &&
      summary.uptime24h <= 100 &&
      summary.activeIncidentCount === summary.activeIncidents.length,
    JSON.stringify(summary),
  );

  const other = new Session();
  await other.call("POST", "/auth/register", {
    name: "CP4 b",
    email: `cp4b-${Date.now()}@example.com`,
    password: "correct-horse-battery",
  });
  check(
    "another user gets 404 on your incident and your monitor's incidents, and an empty list",
    (await other.call("GET", `/incidents/${all.json.items[0].id}`)).status === 404 &&
      (await other.call("GET", `/monitors/${A}/incidents`)).status === 404 &&
      (await other.call("GET", "/incidents")).json?.items?.length === 0,
  );
}

await flaky("/admin/up");
console.log(
  failures === 0
    ? "\nAll automated checks passed. Now do the two-worker and restart checks from the chapter."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
