// Live checks for a deployed API Monitor (Phase 10). It creates ONE throwaway account, tries what a stranger
// would try, and deletes the account again. Safe to run as often as you like (mind REGISTER_LIMIT_PER_HOUR).
//
//   node tools/checkpoint10.mjs https://your-app.vercel.app
//   node tools/checkpoint10.mjs https://your-app.vercel.app https://your-api.onrender.com
//
// The second address is optional: it also checks the API's own public address (CORS, headers).
// Exit code 0 = every check passed, 1 = something failed, 2 = bad usage.

const base = (process.argv[2] ?? process.env.BASE_URL ?? "").replace(/\/+$/, "");
const direct = (process.argv[3] ?? process.env.API_URL ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node tools/checkpoint10.mjs https://your-app.vercel.app [https://your-api.onrender.com]");
  process.exit(2);
}
const https = base.startsWith("https://");
if (!https) console.log("Note: not an https address, so the HTTPS-only checks are skipped.\n");

let failed = 0;
const pass = (name) => console.log(`  ✓ ${name}`);
const fail = (name, detail = "") => {
  failed++;
  console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
};
const check = (condition, name, detail) => (condition ? pass(name) : fail(name, detail));
const section = (title) => console.log(`\n${title}`);

async function call(method, path, { body, rawBody, cookie, headers = {}, root = base } = {}) {
  const res = await fetch(root + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : rawBody,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON: fine */
  }
  return { status: res.status, headers: res.headers, text, json, setCookie: res.headers.getSetCookie() };
}

const stamp = Date.now();
const email = `checkpoint10-${stamp}@example.com`;
const password = "correct-horse-battery-10";
let cookie = "";

try {
  section("1. The site and the API answer");
  const health = await call("GET", "/api/health");
  check(health.status === 200, "GET /api/health is 200", `got ${health.status}: ${health.text.slice(0, 120)}`);
  check(health.json?.status === "ok" && health.json?.db === "up", "health says status ok and database up", health.text.slice(0, 120));
  check(
    (health.headers.get("cache-control") ?? "").includes("no-store"),
    "API answers carry Cache-Control: no-store",
    `Cache-Control was "${health.headers.get("cache-control")}"`,
  );
  check(!health.headers.get("x-powered-by"), "X-Powered-By is hidden");
  check(Boolean(health.headers.get("x-content-type-options")), "Helmet headers are present (X-Content-Type-Options)");
  if (https) check(Boolean(health.headers.get("strict-transport-security")), "HSTS is sent");

  const home = await call("GET", "/");
  check(home.status === 200 && home.text.includes('id="root"'), "the landing page loads (/)", `status ${home.status}`);
  const deep = await call("GET", "/monitors");
  check(deep.status === 200 && deep.text.includes('id="root"'), "a deep link loads the app (SPA fallback, /monitors)", `status ${deep.status}`);

  section("2. What a stranger can and cannot do");
  const unknown = await call("GET", "/api/does-not-exist");
  check(unknown.status === 404 && typeof unknown.json?.error?.code === "string", "unknown API path: JSON 404 in the standard shape", `status ${unknown.status}`);
  const text = await call("POST", "/api/auth/login", { rawBody: "hello", headers: { "content-type": "text/plain" } });
  check(text.status === 415, "a non-JSON body is refused with 415", `status ${text.status}`);
  const noSession = await call("GET", "/api/auth/me");
  check(noSession.status === 401, "no cookie: /api/auth/me is 401", `status ${noSession.status}`);
  const evil = await call("OPTIONS", "/api/monitors", {
    headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
  });
  check(evil.headers.get("access-control-allow-origin") !== "https://evil.example", "CORS does not allow another website's origin", `allow-origin was "${evil.headers.get("access-control-allow-origin")}"`);
  if (direct) {
    const d = await call("GET", "/api/health", { root: direct, headers: { origin: "https://evil.example" } });
    check(d.status === 200, "the API's own address answers health", `status ${d.status}`);
    check(d.headers.get("access-control-allow-origin") !== "https://evil.example", "…and does not allow another origin there either");
  }

  section("3. Sign up and the session cookie");
  const reg = await call("POST", "/api/auth/register", { body: { name: "Checkpoint 10", email, password } });
  if (reg.status !== 201) {
    fail("sign up", `status ${reg.status} ${reg.json?.error?.code ?? ""}: ${reg.json?.error?.message ?? reg.text.slice(0, 120)}`);
    console.log("\nCannot continue without an account. (429 = REGISTER_LIMIT_PER_HOUR, 403 = MAX_USERS reached.)");
    throw new Error("no account");
  }
  pass("sign up (201)");
  const set = reg.setCookie.find((c) => c.startsWith("am_session=")) ?? "";
  check(set !== "", "the am_session cookie is set");
  check(/;\s*HttpOnly/i.test(set), "cookie is HttpOnly (JavaScript cannot read it)");
  check(/;\s*SameSite=Lax/i.test(set), "cookie is SameSite=Lax");
  if (https) check(/;\s*Secure/i.test(set), "cookie is Secure (HTTPS only)");
  check(!/;\s*Domain=/i.test(set), "cookie is host-only (no Domain attribute): first-party on the site's own address");
  cookie = set.split(";")[0];
  const me = await call("GET", "/api/auth/me", { cookie });
  check(me.status === 200 && me.json?.user?.email === email, "the cookie logs you in (/api/auth/me)", `status ${me.status}`);

  section("4. SSRF: addresses the server must refuse to visit");
  const forbidden = [
    "http://localhost",
    "http://localhost:4000/api/health",
    "http://127.0.0.1",
    "http://[::1]",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/",
    "http://2130706433",
    "http://0x7f.1",
    "http://017700000001",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://100.64.0.1",
    "http://[::ffff:127.0.0.1]",
    "http://[::ffff:7f00:1]",
    "http://user:pass@example.com",
    "file:///etc/passwd",
    "ftp://example.com",
  ];
  for (const url of forbidden) {
    const res = await call("POST", "/api/monitors", { cookie, body: { name: "ssrf probe", url, intervalSec: 300 } });
    const code = res.json?.error?.code;
    if (res.status === 400 && (code === "BLOCKED_TARGET" || code === "INVALID_URL")) {
      pass(`${url}  →  400 ${code}`);
    } else {
      fail(`${url}  was NOT refused`, `status ${res.status} ${res.text.slice(0, 120)}`);
      const id = res.json?.monitor?.id ?? res.json?.id;
      if (id) await call("DELETE", `/api/monitors/${id}`, { cookie });
    }
  }

  section("5. A real monitor from the live server (outbound traffic works)");
  const created = await call("POST", "/api/monitors", {
    cookie,
    body: { name: "Checkpoint 10 self-check", url: `${base}/api/health`, intervalSec: 300 },
  });
  const monitorId = created.json?.monitor?.id ?? created.json?.id;
  check(created.status === 201 && Boolean(monitorId), "a monitor on a public address is accepted", `status ${created.status} ${created.text.slice(0, 160)}`);
  if (monitorId) {
    const manual = await call("POST", `/api/monitors/${monitorId}/check`, { cookie, body: {} });
    const result = manual.json?.check;
    check(
      manual.status === 201 && result?.outcome === "SUCCESS" && result?.statusCode === 200,
      "Check now succeeds: the server reached the internet, resolved DNS and spoke TLS",
      `status ${manual.status} ${manual.text.slice(0, 200)}`,
    );
    if (result?.responseTimeMs != null) console.log(`      (answered in ${result.responseTimeMs} ms)`);
    const other = await call("GET", `/api/monitors/${monitorId}`);
    check(other.status === 401, "the same monitor without the cookie is 401");
    const gone = await call("DELETE", `/api/monitors/${monitorId}`, { cookie });
    check(gone.status === 204 || gone.status === 200, "the monitor can be deleted", `status ${gone.status}`);
  }
} catch (error) {
  if (error?.message !== "no account") {
    failed++;
    console.log(`\n  ✗ the script stopped: ${error?.message ?? error}`);
  }
} finally {
  if (cookie) {
    section("Cleanup");
    const del = await call("DELETE", "/api/users/me", { cookie, body: { password } }).catch((e) => ({ status: 0, text: String(e) }));
    check(del.status === 204 || del.status === 200, "the throwaway account is deleted", `status ${del.status} ${del.text?.slice(0, 120)}`);
    const after = await call("GET", "/api/auth/me", { cookie }).catch(() => ({ status: 0 }));
    check(after.status === 401, "its cookie no longer works");
  }
}

console.log(`\n${failed === 0 ? "All checks passed." : `${failed} check(s) FAILED.`}`);
process.exit(failed === 0 ? 0 : 1);