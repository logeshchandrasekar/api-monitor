// Automated Checkpoint 9a check against a RUNNING dev server (data lifecycle and security).
//   terminal 1:  npm run dev -w server          (server/.env needs ALLOW_PRIVATE_TARGETS=true and SCHEDULER_TICK_MS=2000)
//   terminal 2:  npm run checkpoint:9a -w server   (takes about 30 seconds)
//
// It uses the real API for accounts and the real database for seeding old rows, so it needs the same
// server/.env as the dev server. Everything it creates is deleted again.
import { createServer } from "node:http";

// The server's own logger would print every retention line here, so quiet it before it loads
process.env.LOG_LEVEL = "warn";
const { prisma } = await import("../src/lib/prisma.ts");
const { runRetention } = await import("../src/jobs/retention.ts");

const BASE = process.env.BASE_URL ?? "http://localhost:4000/api";
const DAY = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.random().toString(36).slice(2, 8);
const PASSWORD = "correct-horse-battery";

class Session {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
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
    return { status: res.status, json, headers: res.headers };
  }
}

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : extra ? `  -> ${extra}` : ""}`);
};
const step = (title) => console.log(`\n--- ${title}`);

async function newUser(label, plan = "FREE") {
  const s = new Session();
  const email = `cp9a-${label}-${tag}@example.com`;
  const r = await s.call("POST", "/auth/register", {
    name: `Checkpoint ${label}`,
    email,
    password: PASSWORD,
  });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`);
  if (plan !== "FREE") await prisma.user.update({ where: { email }, data: { plan } });
  return { s, email, id: r.json.user.id };
}

async function monitorFor(user, name, url = "https://8.8.8.8/health") {
  const r = await user.s.call("POST", "/monitors", { name, url, intervalSec: 300 });
  if (r.status !== 201)
    throw new Error(`create monitor failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.monitor.id;
}

const addChecks = (monitorId, ages) =>
  prisma.check.createMany({
    data: ages.map((d) => ({
      monitorId,
      trigger: "SCHEDULED",
      outcome: "SUCCESS",
      statusCode: 200,
      responseTimeMs: 100,
      checkedAt: new Date(Date.now() - d * DAY),
    })),
  });
const agesOf = async (monitorId) =>
  (await prisma.check.findMany({ where: { monitorId } }))
    .map((c) => Math.round((Date.now() - c.checkedAt.getTime()) / DAY))
    .sort((a, b) => a - b);

const created = [];
try {
  step("Retention removes only expired checks");
  const free = await newUser("free");
  const pro = await newUser("pro", "PRO");
  created.push(free, pro);
  const freeMonitor = await monitorFor(free, "free monitor");
  const proMonitor = await monitorFor(pro, "pro monitor");
  await addChecks(freeMonitor, [0, 1, 6, 8, 20, 40]);
  await addChecks(proMonitor, [0, 8, 29, 31, 60]);

  const dry = await runRetention({ dryRun: true });
  const dryFree = dry.plans.find((p) => p.plan === "FREE").rows;
  check(
    "dry run counts the expired rows and deletes nothing",
    dryFree >= 3 && (await prisma.check.count({ where: { monitorId: freeMonitor } })) === 6,
    `FREE would delete ${dryFree}`,
  );

  await runRetention({ pauseMs: 0 });
  const freeLeft = await agesOf(freeMonitor);
  const proLeft = await agesOf(proMonitor);
  check(
    "Free keeps 7 days (ages 0, 1, 6)",
    JSON.stringify(freeLeft) === "[0,1,6]",
    JSON.stringify(freeLeft),
  );
  check(
    "Pro keeps 30 days (ages 0, 8, 29)",
    JSON.stringify(proLeft) === "[0,8,29]",
    JSON.stringify(proLeft),
  );
  check(
    "the monitors themselves are untouched",
    (await prisma.monitor.count({ where: { id: { in: [freeMonitor, proMonitor] } } })) === 2,
  );

  step("Account deletion");
  const victim = await newUser("victim");
  const bystander = await newUser("bystander");
  created.push(victim, bystander);
  const victimMonitor = await monitorFor(victim, "victim monitor");
  const bystanderMonitor = await monitorFor(bystander, "bystander monitor");
  await addChecks(victimMonitor, [0, 1, 2]);
  await addChecks(bystanderMonitor, [0, 1, 2]);

  const wrong = await victim.s.call("DELETE", "/users/me", { password: "definitely-wrong" });
  check(
    "a wrong password is refused with 400 INVALID_PASSWORD",
    wrong.status === 400 && wrong.json?.error?.code === "INVALID_PASSWORD",
    String(wrong.status),
  );
  check(
    "...and the account is still there",
    (await victim.s.call("GET", "/auth/me")).status === 200,
  );

  const del = await victim.s.call("DELETE", "/users/me", { password: PASSWORD });
  check("the right password deletes the account (204)", del.status === 204, String(del.status));
  check(
    "the session cookie is cleared",
    (del.headers.getSetCookie?.() ?? []).some((c) => c.startsWith("am_session=;")),
  );
  check(
    "the old session no longer works (401)",
    (await victim.s.call("GET", "/auth/me")).status === 401,
  );
  const relog = await new Session().call("POST", "/auth/login", {
    email: victim.email,
    password: PASSWORD,
  });
  check("logging in again fails", relog.status === 401);
  check(
    "its monitors and checks are gone",
    (await prisma.monitor.count({ where: { userId: victim.id } })) === 0 &&
      (await prisma.check.count({ where: { monitorId: victimMonitor } })) === 0,
  );
  check(
    "the other user's data is untouched",
    (await prisma.check.count({ where: { monitorId: bystanderMonitor } })) === 3 &&
      (await bystander.s.call("GET", "/auth/me")).status === 200,
  );

  step("Scheduler keeps up with more than 50 due monitors");
  const load = await newUser("load", "PRO");
  created.push(load);
  const target = createServer((req, res) => {
    req.resume();
    res.writeHead(200).end("ok");
  });
  await new Promise((r) => target.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${target.address().port}/ok`;
  await prisma.monitor.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      userId: load.id,
      name: `load ${i}`,
      url,
      intervalSec: 3600,
      timeoutMs: 2000,
      nextCheckAt: new Date(Date.now() - 5000),
    })),
  });
  let checked = 0;
  for (let i = 0; i < 30 && checked < 120; i++) {
    await sleep(1000);
    checked = await prisma.monitor.count({
      where: { userId: load.id, lastCheckedAt: { not: null } },
    });
  }
  target.close();
  check("all 120 due monitors were checked within 30 s", checked === 120, `${checked} of 120`);
} catch (err) {
  failures++;
  console.error("FAIL  checkpoint could not finish:", err instanceof Error ? err.message : err);
} finally {
  step("Cleaning up");
  for (const u of created) await prisma.user.deleteMany({ where: { id: u.id } });
  await prisma.$disconnect();
}

console.log(
  failures === 0
    ? "\nCheckpoint 9a: all checks passed."
    : `\nCheckpoint 9a: ${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
