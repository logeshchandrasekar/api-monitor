// Automated Checkpoint 6 check: the Phase 6 API contract as the BROWSER sees it (through the Vite proxy).
//   terminal 1:  npm run dev                      (server on 4000, client on 5173)
//   terminal 2:  npm run checkpoint:6 -w client
// Creates a throw-away account; the auth limiter allows 10 failed attempts per 15 minutes per IP, this script uses none.
const BASE = process.env.CLIENT_URL ?? "http://localhost:5173";
const API = `${BASE}/api`;

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

try {
  const health = await fetch(`${API}/health`);
  if (health.status !== 200) throw new Error("proxy");
} catch {
  console.error(`\nCannot reach ${API}/health. Is "npm run dev" running?`);
  process.exit(1);
}

const s = new Session();
const reg = await s.call("POST", "/auth/register", {
  name: "CP6",
  email: `cp6-${Date.now()}@example.com`,
  password: "correct-horse-battery",
});
check("register answers 201", reg.status === 201, `${reg.status} ${reg.text.slice(0, 120)}`);

// ---- limits (the decision from Phase 5) --------------------------------------------------------
const limits = await s.call("GET", "/users/me/limits");
const L = limits.json?.limits ?? {};
check(
  "GET /users/me/limits answers every field the form needs",
  [
    "plan",
    "maxMonitors",
    "monitorCount",
    "minIntervalSec",
    "allowedIntervalsSec",
    "maxTimeoutMs",
    "retentionDays",
  ].every((k) => k in L),
  `keys: ${Object.keys(L).join(", ")}`,
);
check(
  "FREE plan: 5 monitors, 300 s minimum, no 60 s interval",
  L.maxMonitors === 5 && L.minIntervalSec === 300 && !L.allowedIntervalsSec?.includes(60),
);

// ---- create, headers are masked ------------------------------------------------------------------
const target = { name: "CP6 monitor", url: "https://8.8.8.8/health", intervalSec: 300 };
const created = await s.call("POST", "/monitors", {
  ...target,
  headers: [
    { name: "Authorization", value: "Bearer super-secret-token" },
    { name: "Accept", value: "application/json" },
  ],
});
check(
  "create answers 201",
  created.status === 201,
  `${created.status} ${created.text.slice(0, 160)}`,
);
const id = created.json?.monitor?.id;
check("the response never contains the secret", !created.text.includes("super-secret-token"));
const auth = created.json?.monitor?.headers?.find((h) => h.name === "Authorization");
check(
  "Authorization comes back as { value: null, sensitive: true }",
  auth?.value === null && auth?.sensitive === true,
  JSON.stringify(auth),
);

// ---- edit with keepExisting: the secret survives without the browser ever holding it ------------
const edited = await s.call("PATCH", `/monitors/${id}`, {
  ...target,
  name: "CP6 renamed",
  headers: [
    { name: "Authorization", keepExisting: true },
    { name: "Accept", value: "application/json" },
  ],
});
check(
  "edit with keepExisting answers 200",
  edited.status === 200,
  `${edited.status} ${edited.text.slice(0, 160)}`,
);
check(
  "the saved Authorization header is still there, still masked",
  edited.json?.monitor?.headers?.some(
    (h) => h.name === "Authorization" && h.value === null && h.sensitive,
  ),
);

// ---- list: uptime24h on every item -------------------------------------------------------------------
const list = await s.call("GET", "/monitors");
const item = list.json?.items?.[0] ?? {};
// In development the scheduler checks a new monitor within seconds, so the value can already be a number: both are correct
check(
  "list items have uptime24h: null (no scheduled check yet) or a percentage from 0 to 100",
  "uptime24h" in item &&
    (item.uptime24h === null ||
      (typeof item.uptime24h === "number" && item.uptime24h >= 0 && item.uptime24h <= 100)),
  JSON.stringify(item.uptime24h),
);
check(
  "list answers { items, nextCursor }",
  Array.isArray(list.json?.items) && "nextCursor" in (list.json ?? {}),
);

// ---- stats -----------------------------------------------------------------------------------------------
const stats = await s.call("GET", `/monitors/${id}/stats?range=24h`);
const st = stats.json?.stats ?? {};
check(
  "stats answer 200; uptimePct is null exactly when totalChecks is 0, otherwise a percentage (0 = every check failed)",
  stats.status === 200 &&
    (st.totalChecks === 0
      ? st.uptimePct === null
      : typeof st.uptimePct === "number" && st.uptimePct >= 0 && st.uptimePct <= 100),
  stats.text.slice(0, 160),
);
const tooLong = await s.call("GET", `/monitors/${id}/stats?range=30d`);
check(
  "30 d on FREE is refused with RANGE_NOT_ALLOWED (403)",
  tooLong.status === 403 && tooLong.json?.error?.code === "RANGE_NOT_ALLOWED",
  `${tooLong.status} ${tooLong.text.slice(0, 120)}`,
);

// ---- pause / resume / duplicate / delete (body-less POSTs must not be 415) ------------------------------
const paused = await s.call("POST", `/monitors/${id}/pause`);
check(
  "pause answers 200 and isPaused",
  paused.status === 200 && paused.json?.monitor?.isPaused === true,
  `${paused.status}`,
);
const resumed = await s.call("POST", `/monitors/${id}/resume`);
check(
  "resume answers 200 and back to PENDING",
  resumed.status === 200 && resumed.json?.monitor?.status === "PENDING",
  `${resumed.status}`,
);
const copy = await s.call("POST", `/monitors/${id}/duplicate`);
check(
  "duplicate answers 201 and ends with (copy)",
  copy.status === 201 && /\(copy\)$/.test(copy.json?.monitor?.name ?? ""),
  `${copy.status}`,
);

// ---- plan limit: monitor #6 on FREE ---------------------------------------------------------------------
for (let n = 0; n < 3; n++) await s.call("POST", "/monitors", { ...target, name: `filler ${n}` });
const sixth = await s.call("POST", "/monitors", { ...target, name: "number six" });
check(
  "monitor #6 on FREE: 403 MONITOR_LIMIT_REACHED with a readable message",
  sixth.status === 403 &&
    sixth.json?.error?.code === "MONITOR_LIMIT_REACHED" &&
    /upgrade/i.test(sixth.json?.error?.message ?? ""),
  `${sixth.status} ${sixth.text.slice(0, 160)}`,
);

// ---- SSRF message is a field error ------------------------------------------------------------------------
const blocked = await s.call("POST", "/monitors", {
  ...target,
  name: "blocked",
  url: "http://169.254.169.254/latest",
});
check(
  "a private address is a 400 with a field error on url",
  blocked.status === 400 && JSON.stringify(blocked.json?.error?.details ?? "").includes('"url"'),
  `${blocked.status} ${blocked.text.slice(0, 160)}`,
);

// ---- incidents -----------------------------------------------------------------------------------------------
const incidents = await s.call("GET", "/incidents");
check(
  "GET /incidents answers { items, nextCursor }",
  incidents.status === 200 && Array.isArray(incidents.json?.items),
);

const del = await s.call("DELETE", `/monitors/${id}`);
check("delete answers 204", del.status === 204, `${del.status}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
