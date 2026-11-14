// Automated Checkpoint 8.5 check: the one API change of the UI overhaul, the 24-hour tick strip ("recent"),
// as the BROWSER sees it (through the Vite proxy), plus the public pages.
//   terminal 1:  npm run db:up && npm run seed:demo && npm run dev
//   terminal 2:  npm run checkpoint:85 -w client
// Creates a throw-away account; the auth limiter allows 10 failed attempts per 15 minutes per IP, this script uses none.
const BASE = process.env.CLIENT_URL ?? "http://localhost:5173";
const API = `${BASE}/api`;
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@apimonitor.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-123";
const TICKS = ["up", "slow", "down", "none"];

class Session {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
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
const validStrip = (x) => Array.isArray(x) && x.length === 24 && x.every((t) => TICKS.includes(t));

try {
  const health = await fetch(`${API}/health`);
  if (health.status !== 200) throw new Error("proxy");
} catch {
  console.error(`\nCannot reach ${API}/health. Is "npm run dev" running?`);
  process.exit(1);
}

// ---- a brand-new monitor: 24 empty ticks, on the list and on the detail route ----------------------
const s = new Session();
const reg = await s.call("POST", "/auth/register", {
  name: "CP85",
  email: `cp85-${Date.now()}@example.com`,
  password: "correct-horse-battery",
});
check("register answers 201", reg.status === 201, `${reg.status} ${reg.text.slice(0, 120)}`);

const created = await s.call("POST", "/monitors", {
  name: "CP85 monitor",
  url: "https://8.8.8.8/health",
  intervalSec: 300,
});
const id = created.json?.monitor?.id;
check(
  "create answers 201 and does NOT carry the strip",
  created.status === 201 && !("recent" in created.json.monitor),
);

const list = await s.call("GET", "/monitors");
const item = list.json?.items?.[0];
check(
  "GET /monitors: every item has exactly 24 valid ticks",
  validStrip(item?.recent),
  JSON.stringify(item?.recent),
);
check("a new monitor has no data in any hour", item?.recent?.every((t) => t === "none") === true);

const detail = await s.call("GET", `/monitors/${id}`);
check("GET /monitors/:id has the same 24 ticks", validStrip(detail.json?.monitor?.recent));

const paused = await s.call("POST", `/monitors/${id}/pause`);
check(
  "pause returns the plain monitor (no strip)",
  paused.status === 200 && !("recent" in paused.json.monitor),
);

// ---- the demo data: real checks fill the strip ------------------------------------------------------
const demo = new Session();
const login = await demo.call("POST", "/auth/login", {
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (login.status !== 200) {
  console.log(`SKIP  demo checks: could not log in as ${DEMO_EMAIL} (run "npm run seed:demo")`);
} else {
  const dl = await demo.call("GET", "/monitors?limit=100");
  const items = dl.json?.items ?? [];
  check(
    "demo list: every item has a valid strip",
    items.length > 0 && items.every((m) => validStrip(m.recent)),
  );
  check(
    "demo monitors are not scheduled, so their next check is parked far ahead (the 'Not scheduled' case)",
    items.every((m) => Date.parse(m.nextCheckAt) - Date.now() > 2 * 86_400_000),
  );

  // the dashboard's "Avg response (24 h)" tile
  const summary = await demo.call("GET", "/dashboard/summary");
  const avg = summary.json?.avgResponseMs24h;
  check(
    "summary has avgResponseMs24h: a whole number of ms (or null when nothing answered)",
    summary.status === 200 && (avg === null || Number.isInteger(avg)),
    String(avg),
  );
  check(
    "the demo data answered, so the average is a positive number",
    Number.isInteger(avg) && avg > 0,
    String(avg),
  );
}

// ---- public pages: the landing page is plain HTML shell, the API stays private ---------------------
const home = await fetch(BASE + "/");
check("GET / answers 200 for anyone", home.status === 200);
check(
  "GET /welcome (the landing page for everybody) answers 200",
  (await fetch(BASE + "/welcome")).status === 200,
);
const anon = await new Session().call("GET", "/monitors");
check("the API still answers 401 without a session", anon.status === 401);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
