import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../generated/prisma/client.js";
import {
  claimDueNotifications,
  MAX_ATTEMPTS,
  retryDelayMs,
  runDispatchPass,
} from "../jobs/notificationDispatcher.js";
import { prisma } from "../lib/prisma.js";
import { applyCheckResult } from "../services/applyCheckResult.js";
import type { CheckResult } from "../services/checkRunner.js";
import * as notifications from "../services/notifications.js";
import { pauseMonitor } from "../services/monitors.js";
import { connectionRefused, StubEmail } from "./emailStub.js";
import { registerAgent } from "./helpers.js";

// ---- a fake clock: every check carries its own timestamp ----
const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const ok = (s: number): CheckResult => ({
  outcome: "SUCCESS",
  failureType: null,
  statusCode: 200,
  responseTimeMs: 120,
  errorMessage: null,
  checkedAt: at(s),
});
const slow = (s: number): CheckResult => ({ ...ok(s), outcome: "SLOW", responseTimeMs: 2500 });
const fail = (s: number): CheckResult => ({
  outcome: "FAILURE",
  failureType: "CONNECTION",
  statusCode: null,
  responseTimeMs: null,
  errorMessage: "Could not connect to the server. It may be down or refusing connections.",
  checkedAt: at(s),
});

async function seedMonitor(overrides: Partial<Prisma.MonitorUncheckedCreateInput> = {}) {
  let user = await prisma.user.findFirst();
  if (!user) {
    await registerAgent();
    user = await prisma.user.findFirstOrThrow();
  }
  // Created straight through Prisma, so it has NO alert rule yet: the engine must cope (ensureRule)
  return prisma.monitor.create({
    data: {
      userId: user.id,
      name: "Payments API",
      url: "https://8.8.8.8/health",
      intervalSec: 10,
      timeoutMs: 2000,
      nextCheckAt: new Date(Date.now() + 60_000),
      status: "HEALTHY",
      ...overrides,
    },
  });
}

const apply = async (monitorId: string, result: CheckResult) =>
  applyCheckResult(await prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } }), result);
const run = async (id: string, results: CheckResult[]) => {
  for (const r of results) await apply(id, r);
};
const logs = (monitorId: string) =>
  prisma.notificationLog.findMany({
    where: { monitorId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
const summary = async (monitorId: string) =>
  (await logs(monitorId)).map((l) => `${l.type}:${l.status}`);
/** Makes every queued row due now (skips the backoff wait). */
const makeDue = () =>
  prisma.notificationLog.updateMany({
    where: { status: "QUEUED" },
    data: { nextAttemptAt: new Date(0) },
  });

describe("what gets queued (ALT-1, ALT-2)", () => {
  it("one DOWN row for the whole incident, not one per failed check", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), fail(30), fail(40), fail(50)]);

    const rows = await logs(m.id);
    expect(rows).toHaveLength(1);
    const incident = await prisma.incident.findFirstOrThrow({ where: { monitorId: m.id } });
    expect(rows[0]).toMatchObject({
      type: "DOWN",
      status: "QUEUED",
      incidentId: incident.id,
      recipient: "user@example.com", // no recipient on the rule: the account's email
      attempts: 0,
    });
    expect(rows[0]!.eventAt.getTime()).toBe(at(20).getTime()); // the third failure opened it
  });

  it("nothing is queued before the threshold is reached", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10)]);
    expect(await logs(m.id)).toHaveLength(0);
  });

  it("the row is written in the same transaction as the incident: both exist or neither does", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    expect(await prisma.incident.count({ where: { monitorId: m.id } })).toBe(1);
    expect(await prisma.notificationLog.count({ where: { monitorId: m.id } })).toBe(1);
    // the rule was created on demand for a monitor that had none
    expect(await prisma.alertRule.count({ where: { monitorId: m.id } })).toBe(1);
  });

  it("a slow spell queues a DEGRADED alert, and its recovery", async () => {
    const m = await seedMonitor();
    // a slow spell ends only after a run of good checks (slowThreshold = 3), so one lucky answer is not "recovered"
    await run(m.id, [slow(0), slow(10), slow(20), ok(30)]);
    expect(await summary(m.id)).toEqual(["DEGRADED:QUEUED"]);
    await run(m.id, [ok(40), ok(50)]);
    expect(await summary(m.id)).toEqual(["DEGRADED:QUEUED", "RECOVERED:QUEUED"]);
  });

  it("DEGRADED replaced by DOWN: both alerts, and no 'recovered' for the degraded one", async () => {
    const m = await seedMonitor();
    await run(m.id, [slow(0), slow(10), slow(20), fail(30), fail(40), fail(50)]);
    expect(await summary(m.id)).toEqual(["DEGRADED:QUEUED", "DOWN:QUEUED"]);
    await apply(m.id, ok(60));
    expect(await summary(m.id)).toEqual(["DEGRADED:QUEUED", "DOWN:QUEUED", "RECOVERED:QUEUED"]);
    const recovered = (await logs(m.id)).find((l) => l.type === "RECOVERED")!;
    const downIncident = await prisma.incident.findFirstOrThrow({
      where: { monitorId: m.id, type: "DOWN" },
    });
    expect(recovered.incidentId).toBe(downIncident.id);
  });

  it("pausing a monitor with an open incident does not send a 'recovered'", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    await pauseMonitor(m.userId, m.id);
    expect(await summary(m.id)).toEqual(["DOWN:QUEUED"]);
  });

  it("the recipient on the rule wins over the account email", async () => {
    const m = await seedMonitor();
    await prisma.alertRule.create({
      data: { monitorId: m.id, recipientEmail: "oncall@example.com" },
    });
    await run(m.id, [fail(0), fail(10), fail(20)]);
    expect((await logs(m.id))[0]!.recipient).toBe("oncall@example.com");
  });
});

describe("the three checkboxes", () => {
  it("'notify when down' off: no DOWN row, and so no recovery either", async () => {
    const m = await seedMonitor();
    await prisma.alertRule.create({ data: { monitorId: m.id, notifyOnDown: false } });
    await run(m.id, [fail(0), fail(10), fail(20), ok(30)]);
    expect(await logs(m.id)).toHaveLength(0);
  });

  it("'notify when slow' off: no DEGRADED row, but a DOWN still alerts", async () => {
    const m = await seedMonitor();
    await prisma.alertRule.create({ data: { monitorId: m.id, notifyOnSlow: false } });
    await run(m.id, [slow(0), slow(10), slow(20), ok(30)]);
    expect(await logs(m.id)).toHaveLength(0);
    await run(m.id, [fail(40), fail(50), fail(60)]);
    expect(await summary(m.id)).toEqual(["DOWN:QUEUED"]);
  });

  it("'notify on recovery' off: the DOWN alert is queued, the recovery is not", async () => {
    const m = await seedMonitor();
    await prisma.alertRule.create({ data: { monitorId: m.id, notifyOnRecovery: false } });
    await run(m.id, [fail(0), fail(10), fail(20), ok(30)]);
    expect(await summary(m.id)).toEqual(["DOWN:QUEUED"]);
  });
});

describe("cooldown (ALT-1)", () => {
  it("a second outage inside the cooldown is SUPPRESSED, says why, and gets no recovery", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), ok(120)]); // DOWN + RECOVERED
    await run(m.id, [fail(130), fail(140), fail(150), ok(200)]); // flapping, 2 minutes after the first alert

    expect(await summary(m.id)).toEqual(["DOWN:QUEUED", "RECOVERED:QUEUED", "DOWN:SUPPRESSED"]);
    const suppressed = (await logs(m.id))[2]!;
    expect(suppressed.note).toMatch(
      /^Cooldown: a DOWN alert for this monitor was already raised 2 min earlier \(cooldown is 30 min\)\.$/,
    );
  });

  it("after the cooldown a new outage alerts again", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), ok(120)]);
    await run(m.id, [fail(2000), fail(2010), fail(2020)]); // 2000 s after the first alert; the cooldown is 1800 s
    expect(await summary(m.id)).toEqual(["DOWN:QUEUED", "RECOVERED:QUEUED", "DOWN:QUEUED"]);
  });

  it("the cooldown length comes from the rule", async () => {
    const m = await seedMonitor();
    await prisma.alertRule.create({ data: { monitorId: m.id, cooldownMinutes: 1 } });
    await run(m.id, [fail(0), fail(10), fail(20), ok(30)]);
    await run(m.id, [fail(100), fail(110), fail(120)]); // 100 s later, the cooldown is 60 s
    expect(await summary(m.id)).toEqual(["DOWN:QUEUED", "RECOVERED:QUEUED", "DOWN:QUEUED"]);
  });

  it("is per type: a recent DOWN alert does not hold back a DEGRADED one", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), ok(30)]);
    await run(m.id, [slow(40), slow(50), slow(60)]);
    expect(await summary(m.id)).toEqual(["DOWN:QUEUED", "RECOVERED:QUEUED", "DEGRADED:QUEUED"]);
  });

  it("is per monitor: another monitor's recent alert does not count", async () => {
    const a = await seedMonitor({ name: "A" });
    const b = await seedMonitor({ name: "B" });
    await run(a.id, [fail(0), fail(10), fail(20)]);
    await run(b.id, [fail(30), fail(40), fail(50)]);
    expect(await summary(a.id)).toEqual(["DOWN:QUEUED"]);
    expect(await summary(b.id)).toEqual(["DOWN:QUEUED"]);
  });

  it("an alert that FAILED for good does not start a cooldown: nobody was told", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), ok(30)]);
    await prisma.notificationLog.updateMany({
      where: { monitorId: m.id, type: "DOWN" },
      data: { status: "FAILED" },
    });
    await run(m.id, [fail(100), fail(110), fail(120)]);
    expect((await summary(m.id)).at(-1)).toBe("DOWN:QUEUED");
  });
});

describe("a recovery only follows an alert that was raised", () => {
  it("if the DOWN alert FAILED before the recovery, the recovery is SUPPRESSED and says so", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    await prisma.notificationLog.updateMany({
      where: { monitorId: m.id },
      data: { status: "FAILED" },
    });
    await apply(m.id, ok(100));
    const recovered = (await logs(m.id)).find((l) => l.type === "RECOVERED")!;
    expect(recovered.status).toBe("SUPPRESSED");
    expect(recovered.note).toMatch(/could not be delivered/);
  });

  it("the recovery is held back while its alert is still being retried, then goes out second", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), ok(120)]);
    const mail = new StubEmail();

    mail.failWith = connectionRefused();
    await runDispatchPass(mail); // DOWN fails once; RECOVERED is claimed too but must wait
    expect(mail.sent).toHaveLength(0);
    expect(await summary(m.id)).toEqual(["DOWN:QUEUED", "RECOVERED:QUEUED"]);

    mail.failWith = null; // the mail server is back
    await makeDue();
    await runDispatchPass(mail);
    await makeDue();
    await runDispatchPass(mail);
    expect(mail.sent.map((s) => s.subject)).toEqual([
      "[DOWN] Payments API is down",
      "[RECOVERED] Payments API is back after 1 min 40 s",
    ]);
  });

  it("if the alert ends up FAILED, the waiting recovery is SUPPRESSED instead of sent", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), ok(120)]);
    const mail = new StubEmail();
    mail.failWith = connectionRefused();
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      await makeDue();
      await runDispatchPass(mail);
    }
    expect(mail.sent).toHaveLength(0);
    expect(await summary(m.id)).toEqual(["DOWN:FAILED", "RECOVERED:SUPPRESSED"]);
  });
});

describe("the dispatcher", () => {
  it("sends a queued alert once, with the facts and a link, and marks it SENT", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    const mail = new StubEmail();

    expect(await runDispatchPass(mail)).toBe(1);
    expect(mail.sent).toHaveLength(1);
    const email = mail.sent[0]!;
    expect(email.to).toBe("user@example.com");
    expect(email.subject).toBe("[DOWN] Payments API is down");
    expect(email.text).toContain("https://8.8.8.8/health");
    expect(email.text).toContain(`http://localhost:5173/monitors/${m.id}`);
    expect(email.text).toContain("3 failed checks in a row");

    const [row] = await logs(m.id);
    expect(row).toMatchObject({ status: "SENT", attempts: 1, error: null });
    expect(row!.sentAt).toBeInstanceOf(Date);

    expect(await runDispatchPass(mail)).toBe(0); // nothing left
    expect(mail.sent).toHaveLength(1);
  });

  it("the recovery email carries the incident's duration", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20), ok(120)]);
    const mail = new StubEmail();
    await runDispatchPass(mail); // claims both; sends the DOWN alert, holds the recovery back behind it
    expect(mail.sent).toHaveLength(1);
    await makeDue(); // one dispatcher tick later
    await runDispatchPass(mail); // now the recovery goes out
    expect(mail.sent.map((s) => s.subject)).toEqual([
      "[DOWN] Payments API is down",
      "[RECOVERED] Payments API is back after 1 min 40 s",
    ]);
    expect(mail.sent[1]!.text).toContain("Down for: 1 min 40 s");
  });

  it("a failing mail server: retries with backoff, then FAILED, and the checks are unaffected", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    const mail = new StubEmail();
    mail.failWith = connectionRefused();

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      await runDispatchPass(mail);
      const [row] = await logs(m.id);
      expect(row).toMatchObject({ status: "QUEUED", attempts: attempt });
      // backed off: the next attempt is in the future by about retryDelayMs(attempt)
      const wait = row!.nextAttemptAt.getTime() - Date.now();
      expect(wait).toBeGreaterThan(retryDelayMs(attempt) - 5000);
      expect(wait).toBeLessThanOrEqual(retryDelayMs(attempt));
      expect(await runDispatchPass(mail)).toBe(0); // not due yet: no hammering
      await makeDue();
    }

    await runDispatchPass(mail); // the last allowed attempt
    const [row] = await logs(m.id);
    expect(row).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    expect(row!.error).toBe("Could not reach the mail server."); // the safe sentence...
    expect(row!.error).not.toMatch(/127\.0\.0\.1|1025|ECONNREFUSED/); // ...never the raw error
    expect(await runDispatchPass(mail)).toBe(0);

    // the check pipeline never noticed
    const monitor = await prisma.monitor.findUniqueOrThrow({ where: { id: m.id } });
    expect(monitor.status).toBe("DOWN");
    await apply(m.id, fail(30));
    expect(await prisma.check.count({ where: { monitorId: m.id } })).toBe(4);
  });

  it("a send that fails once and then works ends up SENT with two attempts", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    const mail = new StubEmail();
    mail.failWith = connectionRefused();
    await runDispatchPass(mail);
    mail.failWith = null;
    await makeDue();
    await runDispatchPass(mail);
    expect((await logs(m.id))[0]).toMatchObject({ status: "SENT", attempts: 2, error: null });
    expect(mail.sent).toHaveLength(1);
  });

  it("two dispatchers running at the same moment send the email once", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    const mail = new StubEmail();
    await Promise.all([runDispatchPass(mail), runDispatchPass(mail), runDispatchPass(mail)]);
    expect(mail.sent).toHaveLength(1);
  });

  it("a claimed row stays invisible until its lease runs out (a crash mid-send is retried, not lost)", async () => {
    const m = await seedMonitor();
    await run(m.id, [fail(0), fail(10), fail(20)]);
    const first = await claimDueNotifications();
    expect(first).toHaveLength(1);
    expect(await claimDueNotifications()).toEqual([]); // leased
    await makeDue(); // the lease expires (the process that took it died)
    expect(await claimDueNotifications()).toEqual(first);
  });
});

describe("email trouble never loses a check (ALT-2)", () => {
  it("if queueing the alert blows up, the check, the incident and the new status are still stored", async () => {
    const m = await seedMonitor();
    // A real database error inside the transaction: without the savepoint it would poison the whole thing
    const spy = vi.spyOn(notifications, "enqueueOpened").mockImplementation(async (tx) => {
      await tx.$executeRaw`SELECT 1/0`;
    });
    try {
      await run(m.id, [fail(0), fail(10), fail(20)]);
    } finally {
      spy.mockRestore();
    }

    const monitor = await prisma.monitor.findUniqueOrThrow({ where: { id: m.id } });
    expect(monitor.status).toBe("DOWN");
    expect(await prisma.check.count({ where: { monitorId: m.id } })).toBe(3);
    expect(await prisma.incident.count({ where: { monitorId: m.id, status: "OPEN" } })).toBe(1);
    expect(await logs(m.id)).toHaveLength(0);

    // and the transaction machinery is healthy afterwards: the recovery is stored and queues nothing for a missing alert
    await apply(m.id, ok(100));
    expect((await prisma.monitor.findUniqueOrThrow({ where: { id: m.id } })).status).toBe(
      "HEALTHY",
    );
  });
});
