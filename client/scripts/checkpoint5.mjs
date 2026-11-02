// Automated Checkpoint 5 check: the API as the BROWSER sees it (through the Vite proxy).
//   terminal 1:  npm run dev                      (server on 4000, client on 5173)
//   terminal 2:  npm run checkpoint:5 -w client
// The auth limiter allows 10 failed attempts per 15 minutes per IP; one run uses 2, so avoid more than ~4 runs in a row.
const BASE = process.env.CLIENT_URL ?? "http://localhost:5173";
const API = `${BASE}/api`;

class Session {
  cookie = "";
  lastSetCookie = "";
  async call(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie?.()[0];
    if (setCookie) {
      this.lastSetCookie = setCookie;
      this.cookie = setCookie.split(";")[0];
    }
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
  check(
    "proxy: GET /api/health through the Vite dev server answers 200",
    health.status === 200,
    `status ${health.status}`,
  );
  if (health.status !== 200) throw new Error("proxy");
} catch {
  console.error(
    `\nCannot reach ${API}/health. Is "npm run dev" running, and does client/vite.config.ts proxy /api to http://localhost:4000?`,
  );
  process.exit(1);
}

const s = new Session();
const email = `cp5-${Date.now()}@example.com`;
const password = "correct-horse-battery";

// ---- register ------------------------------------------------------------------------------
const reg = await s.call("POST", "/auth/register", { name: "CP5", email, password });
check(
  "register answers 201 with { user }",
  reg.status === 201 && reg.json?.user?.email === email,
  `${reg.status} ${reg.text.slice(0, 120)}`,
);
const u = reg.json?.user ?? {};
check(
  "user has the fields the client type expects (id, email, name, plan, createdAt)",
  ["id", "email", "name", "plan", "createdAt"].every((k) => k in u),
  `keys: ${Object.keys(u).join(", ")}`,
);
check(
  "session cookie am_session is httpOnly and SameSite=Lax",
  /^am_session=/.test(s.lastSetCookie) &&
    /httponly/i.test(s.lastSetCookie) &&
    /samesite=lax/i.test(s.lastSetCookie),
  s.lastSetCookie,
);

// ---- me / update ---------------------------------------------------------------------------
const me = await s.call("GET", "/auth/me");
check(
  "GET /auth/me with the cookie returns { user } for the same account",
  me.status === 200 && me.json?.user?.email === email,
  `${me.status} ${me.text.slice(0, 120)}`,
);

const rename = await s.call("PATCH", "/users/me", { name: "CP5 renamed" });
const me2 = await s.call("GET", "/auth/me");
check(
  "PATCH /users/me { name } works and /auth/me shows the new name",
  rename.status === 200 && me2.json?.user?.name === "CP5 renamed",
  `${rename.status} ${rename.text.slice(0, 120)}`,
);

// ---- password: exact field names the Settings form sends -----------------------------------
const wrong = await s.call("POST", "/users/me/password", {
  currentPassword: "definitely-wrong-123",
  newPassword: "another-long-password",
});
check(
  "wrong current password is 400 INVALID_CURRENT_PASSWORD (never 401)",
  wrong.status === 400 && wrong.json?.error?.code === "INVALID_CURRENT_PASSWORD",
  `${wrong.status} ${wrong.text.slice(0, 160)}  (if this is VALIDATION_ERROR, the field names differ: fix usersApi.changePassword)`,
);

// ---- logout, then 401 ----------------------------------------------------------------------
const out = await s.call("POST", "/auth/logout");
check("logout answers 2xx", out.status >= 200 && out.status < 300, `${out.status}`);
const gone = await s.call("GET", "/auth/me");
check(
  "after logout /auth/me is 401 with the standard { error: { code, message } } shape",
  gone.status === 401 &&
    typeof gone.json?.error?.code === "string" &&
    typeof gone.json?.error?.message === "string",
  `${gone.status} ${gone.text.slice(0, 120)}`,
);

// ---- errors the forms must display ---------------------------------------------------------
const bad = await new Session().call("POST", "/auth/login", {
  email,
  password: "not-the-password",
});
check(
  "wrong password at login is 401 with a message",
  bad.status === 401 && typeof bad.json?.error?.message === "string",
  `${bad.status} ${bad.text.slice(0, 120)}`,
);

const invalid = await new Session().call("POST", "/auth/register", {
  name: "",
  email: "not-an-email",
  password: "1",
});
check(
  "invalid register is 400 with error.details",
  invalid.status === 400 && invalid.json?.error?.details !== undefined,
  `${invalid.status} ${invalid.text.slice(0, 160)}`,
);
console.log(
  `      details shape the register form will see: ${JSON.stringify(invalid.json?.error?.details)?.slice(0, 200)}`,
);

const dup = await new Session().call("POST", "/auth/register", { name: "CP5", email, password });
check(
  "registering the same email again is rejected (the form shows it under Email)",
  dup.status === 409 || dup.status === 400,
  `${dup.status} ${dup.text.slice(0, 120)}`,
);

// ---- log back in ---------------------------------------------------------------------------
const again = await s.call("POST", "/auth/login", { email, password });
check(
  "login with the right password works",
  again.status === 200 && again.json?.user?.email === email,
  `${again.status}`,
);

console.log(
  failures === 0
    ? "\nAll automated checks passed. Now do the manual checks in the chapter."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
