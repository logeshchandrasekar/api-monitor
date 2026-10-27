// Automated Checkpoint 2 check against a RUNNING dev server (npm run dev -w server).
// Usage: npm run checkpoint:2        (override with BASE_URL=http://localhost:4000/api)
const BASE = process.env.BASE_URL ?? "http://localhost:4000/api";

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

const stamp = Date.now();
const password = "correct-horse-battery";
const register = async (tag) => {
  const s = new Session();
  const res = await s.call("POST", "/auth/register", {
    name: `CP2 ${tag}`,
    email: `cp2-${tag}-${stamp}@example.com`,
    password,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${res.text}`);
  return s;
};

const secret = "Bearer cp2-secret-token-123";
const monitor = {
  name: "Checkpoint monitor",
  url: "https://8.8.8.8/health",
  method: "POST",
  intervalSec: 300,
  headers: [
    { name: "Authorization", value: secret },
    { name: "X-Env", value: "test" },
  ],
  body: '{"ping":true}',
};

const a = await register("a");
const b = await register("b");

// 1. CRUD
const created = await a.call("POST", "/monitors", monitor);
check("create monitor -> 201", created.status === 201, created.text);
const id = created.json?.monitor?.id;
check("new monitor is PENDING", created.json?.monitor?.status === "PENDING");
check(
  "response never contains the Authorization value",
  !created.text.includes("cp2-secret-token-123"),
);
check(
  "Authorization is flagged sensitive, X-Env is visible",
  created.json?.monitor?.headers?.[0]?.sensitive === true &&
    created.json?.monitor?.headers?.[1]?.value === "test",
);

const fetched = await a.call("GET", `/monitors/${id}`);
check(
  "GET detail never leaks the secret",
  fetched.status === 200 && !fetched.text.includes("cp2-secret-token-123"),
);
const list = await a.call("GET", "/monitors");
check(
  "list contains the monitor",
  list.json?.items?.some((m) => m.id === id),
);

const renamed = await a.call("PATCH", `/monitors/${id}`, {
  name: "Renamed",
  headers: [
    { name: "Authorization", keepExisting: true },
    { name: "X-Env", value: "test" },
  ],
});
check("PATCH with keepExisting -> 200", renamed.status === 200, renamed.text);
check("pause", (await a.call("POST", `/monitors/${id}/pause`)).json?.monitor?.isPaused === true);
check("resume", (await a.call("POST", `/monitors/${id}/resume`)).json?.monitor?.isPaused === false);
const dup = await a.call("POST", `/monitors/${id}/duplicate`);
check(
  "duplicate -> 201 with (copy) name",
  dup.status === 201 && dup.json?.monitor?.name.endsWith("(copy)"),
);

// 2. Ownership
for (const [label, method, path] of [
  ["GET", "GET", `/monitors/${id}`],
  ["PATCH", "PATCH", `/monitors/${id}`],
  ["DELETE", "DELETE", `/monitors/${id}`],
  ["pause", "POST", `/monitors/${id}/pause`],
  ["duplicate", "POST", `/monitors/${id}/duplicate`],
]) {
  const res = await b.call(method, path, method === "PATCH" ? { name: "hacked" } : undefined);
  check(`other user cannot ${label} it -> 404`, res.status === 404, String(res.status));
}
check("other user's list is empty", (await b.call("GET", "/monitors")).json?.items?.length === 0);

// 3. SSRF
for (const url of [
  "http://localhost:3000",
  "http://127.0.0.1",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.5",
  "http://192.168.1.1",
  "http://[::1]/",
  "http://2130706433",
  "http://0x7f.1",
  "http://[::ffff:127.0.0.1]/",
  "ftp://8.8.8.8",
  "http://user:pass@8.8.8.8",
]) {
  const res = await a.call("POST", "/monitors", { ...monitor, url });
  check(
    `rejects ${url}`,
    res.status === 400 && ["BLOCKED_TARGET", "INVALID_URL"].includes(res.json?.error?.code),
    `${res.status} ${res.json?.error?.code}`,
  );
}

// 4. Plan limit (FREE = 5; the original and its copy already count as 2)
let last;
for (let i = 0; i < 4; i++)
  last = await a.call("POST", "/monitors", { ...monitor, name: `Filler ${i}` });
check(
  "6th monitor on FREE -> 403 MONITOR_LIMIT_REACHED",
  last?.status === 403 && last.json?.error?.code === "MONITOR_LIMIT_REACHED",
  `${last?.status} ${last?.json?.error?.code}`,
);

// 5. Plan intervals
const tooFast = await b.call("POST", "/monitors", { ...monitor, intervalSec: 60 });
check(
  "60 s interval on FREE -> INTERVAL_NOT_ALLOWED",
  tooFast.json?.error?.code === "INTERVAL_NOT_ALLOWED",
);

console.log(
  failures === 0
    ? "\nAll checks passed. Now run the manual SQL check from the chapter."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
