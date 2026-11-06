// Automated Checkpoint 7 check: the analytics endpoint as the BROWSER sees it (through the Vite proxy),
// on the demo data from `npm run seed:demo`, plus the plan, validation and ownership rules.
//   terminal 1:  npm run db:up && npm run seed:demo && npm run dev
//   terminal 2:  npm run checkpoint:7 -w client
const BASE = process.env.CLIENT_URL ?? "http://localhost:5173";
const API = `${BASE}/api`;
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@apimonitor.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-123";

class Session {
  cookie = "";
  async call(method, path, body) {
    const started = performance.now();
    const res = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const ms = Math.round(performance.now() - started);
    const setCookie = res.headers.getSetCookie?.()[0];
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, ms };
  }
}

let failures = 0;
function check(label, ok, extra = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : extra ? `  -> ${extra}` : ""}`);
}
const round2 = (n) => Math.round(n * 100) / 100;

try {
  if ((await fetch(`${API}/health`)).status !== 200) throw new Error("proxy");
} catch {
  console.error(`\nCannot reach ${API}/health. Is "npm run dev" running?`);
  process.exit(1);
}

// ---- 1. The demo user -------------------------------------------------------------------------------------
console.log("\n== Demo data (7.1)");
const demo = new Session();
const login = await demo.call("POST", "/auth/login", {
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (login.status !== 200) {
  console.error(`Cannot log in as ${DEMO_EMAIL} (${login.status}). Run "npm run seed:demo" first.`);
  process.exit(1);
}
check(
  "the demo user is on the PRO plan",
  login.json?.user?.plan === "PRO",
  JSON.stringify(login.json?.user),
);

const list = await demo.call("GET", "/monitors");
const monitors = list.json?.items ?? [];
const byName = Object.fromEntries(monitors.map((m) => [m.name, m]));
check(
  "four demo monitors exist",
  ["Payments API", "Auth Service", "Search API", "Reports Export"].every((n) => byName[n]),
  monitors.map((m) => m.name).join(", "),
);

// ---- 2. The contract, on every range, on every demo monitor -----------------------------------------------
console.log("\n== Analytics endpoint (7.2)");
const SHAPE = { "24h": [900, 97], "7d": [3600, 169], "30d": [21_600, 121] };
let shownSql = false;

for (const m of monitors) {
  for (const [range, [bucketSec, count]] of Object.entries(SHAPE)) {
    const res = await demo.call("GET", `/monitors/${m.id}/analytics?range=${range}`);
    const a = res.json?.analytics;
    const tag = `${m.name} ${range}`;
    if (res.status !== 200 || !a) {
      check(`${tag}: 200`, false, `${res.status} ${res.text.slice(0, 140)}`);
      continue;
    }
    check(
      `${tag}: ${count} points of ${bucketSec / 60} min`,
      a.bucketSec === bucketSec && a.series.length === count,
      `${a.series.length} points`,
    );

    const times = a.series.map((p) => Date.parse(p.at));
    check(
      `${tag}: points are consecutive and on UTC boundaries`,
      times.every(
        (t, i) =>
          t % (bucketSec * 1000) === 0 && (i === 0 || t - times[i - 1] === bucketSec * 1000),
      ),
    );

    const sum = (k) => a.series.reduce((acc, p) => acc + p[k], 0);
    const s = a.stats;
    check(
      `${tag}: the series adds up to the statistics`,
      sum("total") === s.totalChecks &&
        sum("successful") === s.successfulChecks &&
        sum("slow") === s.slowChecks &&
        sum("failed") === s.failedChecks,
      `series ${sum("total")}/${sum("successful")}/${sum("slow")}/${sum("failed")} vs stats ${s.totalChecks}/${s.successfulChecks}/${s.slowChecks}/${s.failedChecks}`,
    );
    check(
      `${tag}: successful + failed = total`,
      s.successfulChecks + s.failedChecks === s.totalChecks,
    );
    check(
      `${tag}: uptime = successful / total`,
      s.totalChecks > 0 && s.uptimePct === round2((s.successfulChecks / s.totalChecks) * 100),
      `${s.uptimePct}`,
    );
    check(
      `${tag}: min <= average <= max and min <= p95 <= max`,
      s.minMs <= s.avgMs && s.avgMs <= s.maxMs && s.minMs <= s.p95Ms && s.p95Ms <= s.maxMs,
      JSON.stringify(s),
    );
    check(
      `${tag}: empty buckets are gaps, never zeros`,
      a.series.every((p) =>
        p.total === 0
          ? p.uptimePct === null && p.avgMs === null && p.p95Ms === null
          : p.uptimePct !== null,
      ),
    );

    // Same numbers as the Phase 6 stats endpoint (a different code path), allowing for the clock moving
    const old = await demo.call("GET", `/monitors/${m.id}/stats?range=${range}`);
    const o = old.json?.stats;
    check(
      `${tag}: agrees with /stats`,
      !!o &&
        Math.abs(o.totalChecks - s.totalChecks) <= 2 &&
        Math.abs((o.uptimePct ?? 0) - (s.uptimePct ?? 0)) <= 0.15,
      `stats ${o?.totalChecks}/${o?.uptimePct} vs analytics ${s.totalChecks}/${s.uptimePct}`,
    );

    if (range === "30d") {
      // The performance target of the phase: ~45k checks per monitor in under 500 ms (measured end to end)
      if (s.totalChecks > 40_000) {
        const again = await demo.call("GET", `/monitors/${m.id}/analytics?range=30d`);
        check(
          `${tag}: ${s.totalChecks} checks answered in ${again.ms} ms (< 500 ms)`,
          again.ms < 500,
          `${again.ms} ms`,
        );
      }
      if (!shownSql) {
        shownSql = true;
        console.log(
          `\n      Manual SQL check for ${m.name} 30d (paste into psql, compare with the cards):`,
        );
        console.log(`      SELECT count(*) AS total,`);
        console.log(
          `             round(100.0 * count(*) FILTER (WHERE outcome <> 'FAILURE') / count(*), 2) AS uptime_pct,`,
        );
        console.log(
          `             round(percentile_cont(0.95) WITHIN GROUP (ORDER BY "responseTimeMs")) AS p95_ms`,
        );
        console.log(`      FROM checks WHERE "monitorId" = '${m.id}' AND trigger = 'SCHEDULED'`);
        console.log(`        AND "checkedAt" >= '${a.from}' AND "checkedAt" <= '${a.to}';`);
        console.log(
          `      -- the API said: total ${s.totalChecks}, uptime ${s.uptimePct}, p95 ${s.p95Ms}\n`,
        );
      }
    }
  }
}

// ---- 3. The seeded story is visible -----------------------------------------------------------------------
console.log("\n== Believable data (7.1, checkpoint)");
const pay = await demo.call("GET", `/monitors/${byName["Payments API"]?.id}/analytics?range=30d`);
const pa = pay.json?.analytics;
check(
  "Payments API shows its two outages as DOWN incidents",
  pa?.incidents.filter((i) => i.type === "DOWN").length === 2,
  JSON.stringify(pa?.incidents?.map((i) => i.type)),
);
check(
  "Payments API shows slow spells as DEGRADED incidents",
  (pa?.incidents.filter((i) => i.type === "DEGRADED").length ?? 0) >= 2,
);
check(
  "the incident count card matches the shaded incidents",
  pa?.stats.totalIncidents === pa?.incidents.length,
  `${pa?.stats.totalIncidents} vs ${pa?.incidents.length}`,
);
check(
  "outages show up as buckets with failures",
  (pa?.series.filter((p) => p.failed > 0).length ?? 0) >= 2,
);
check(
  "the p95 line rises above the average somewhere (spikes the average hides)",
  (pa?.series.filter((p) => p.p95Ms !== null && p.avgMs !== null && p.p95Ms > p.avgMs).length ??
    0) > 10,
);

// ---- 4. Plan, validation and ownership --------------------------------------------------------------------
console.log("\n== Plan rules, validation, ownership");
const stamp = Date.now();
const register = async (tag) => {
  const s = new Session();
  const res = await s.call("POST", "/auth/register", {
    name: `CP7 ${tag}`,
    email: `cp7-${tag}-${stamp}@example.com`,
    password: "correct-horse-battery",
  });
  check(`register ${tag}`, res.status === 201, `${res.status} ${res.text.slice(0, 100)}`);
  return s;
};
const free = await register("free");
const created = await free.call("POST", "/monitors", {
  name: "CP7 monitor",
  url: "https://8.8.8.8/health",
  intervalSec: 300,
});
const id = created.json?.monitor?.id;

const empty = await free.call("GET", `/monitors/${id}/analytics?range=24h`);
const ea = empty.json?.analytics;
check(
  "FREE: a monitor with no checks gives a full series of gaps and null statistics",
  empty.status === 200 &&
    ea?.series.length === 97 &&
    ea.series.every((p) => p.total === 0 && p.uptimePct === null) &&
    ea.stats.uptimePct === null &&
    ea.stats.p95Ms === null &&
    ea.stats.totalChecks === 0,
);
check(
  "FREE: 7d is allowed",
  (await free.call("GET", `/monitors/${id}/analytics?range=7d`)).status === 200,
);
const thirty = await free.call("GET", `/monitors/${id}/analytics?range=30d`);
check(
  "FREE: 30d is a 403 RANGE_NOT_ALLOWED with a clear plan message",
  thirty.status === 403 &&
    thirty.json?.error?.code === "RANGE_NOT_ALLOWED" &&
    /FREE plan keeps 7 days/.test(thirty.json?.error?.message ?? ""),
  `${thirty.status} ${thirty.text.slice(0, 160)}`,
);
console.log(`      message: "${thirty.json?.error?.message}"`);
check(
  "1h is a 400 (the analytics buckets start at 24h)",
  (await free.call("GET", `/monitors/${id}/analytics?range=1h`)).status === 400,
);
check(
  "an unknown range is a 400",
  (await free.call("GET", `/monitors/${id}/analytics?range=1y`)).status === 400,
);
check(
  "a malformed id is a 400 (API-1)",
  (await free.call("GET", `/monitors/not-a-uuid/analytics`)).status === 400,
);
check(
  "an unknown id is a 404",
  (await free.call("GET", `/monitors/00000000-0000-4000-8000-000000000000/analytics`)).status ===
    404,
);

const other = await register("other");
check(
  "another user's monitor is a 404 (SEC-4)",
  (await other.call("GET", `/monitors/${id}/analytics`)).status === 404,
);
check(
  "no session is a 401",
  (await new Session().call("GET", `/monitors/${id}/analytics`)).status === 401,
);

const manual = await free.call("POST", `/monitors/${id}/check`);
if (manual.status === 200 || manual.status === 201) {
  const after = await free.call("GET", `/monitors/${id}/analytics?range=24h`);
  check(
    "a manual Check now never appears in the analytics",
    after.json?.analytics?.stats.totalChecks === 0,
  );
}
await free.call("DELETE", `/monitors/${id}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
