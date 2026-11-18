import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { registerAgent, type Agent } from "./helpers.js";

const PASSWORD = "correct-horse-battery"; // what registerAgent uses

/** One monitor with a check, an incident (and its notification) and the default alert rule. */
async function populate(agent: Agent, label: string) {
  const res = await agent
    .post("/api/monitors")
    .send({ name: `${label} API`, url: "https://8.8.8.8/health", intervalSec: 300, tags: [label] });
  expect(res.status).toBe(201);
  const monitorId: string = res.body.monitor.id;
  await prisma.check.createMany({
    data: [1, 2, 3].map((n) => ({
      monitorId,
      trigger: "SCHEDULED" as const,
      outcome: "SUCCESS" as const,
      statusCode: 200,
      responseTimeMs: 100,
      checkedAt: new Date(Date.now() - n * 60_000),
    })),
  });
  const incident = await prisma.incident.create({
    data: {
      monitorId,
      type: "DOWN",
      reason: "Timed out",
      startedAt: new Date(),
      openKey: `${monitorId}:DOWN`,
    },
  });
  await prisma.notificationLog.create({
    data: {
      monitorId,
      incidentId: incident.id,
      type: "DOWN",
      recipient: `${label}@example.com`,
      eventAt: new Date(),
    },
  });
  return monitorId;
}

const TABLES = [
  "users",
  "monitors",
  "checks",
  "incidents",
  "alert_rules",
  "notification_logs",
] as const;

async function counts() {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
    out[t] = Number(row!.n);
  }
  return out;
}

describe("DELETE /api/users/me", () => {
  it("deletes the account and everything it owns, and leaves other users alone", async () => {
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    await populate(a, "a");
    const bMonitor = await populate(b, "b");

    expect(await counts()).toEqual({
      users: 2,
      monitors: 2,
      checks: 6,
      incidents: 2,
      alert_rules: 2,
      notification_logs: 2,
    });

    const res = await a.delete("/api/users/me").send({ password: PASSWORD });
    expect(res.status).toBe(204);

    // Every table lost exactly user A's rows (the cascade reaches checks, incidents, rules and notification logs)
    expect(await counts()).toEqual({
      users: 1,
      monitors: 1,
      checks: 3,
      incidents: 1,
      alert_rules: 1,
      notification_logs: 1,
    });
    expect(await prisma.user.findUnique({ where: { email: "a@example.com" } })).toBeNull();
    expect(await prisma.monitor.findMany({ select: { id: true } })).toEqual([{ id: bMonitor }]);
    // B can still use the API
    expect((await b.get("/api/monitors")).body.items).toHaveLength(1);
  });

  it("clears the session cookie, and the old session no longer works", async () => {
    const a = await registerAgent("gone@example.com");
    const res = await a.delete("/api/users/me").send({ password: PASSWORD });
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(
      cookies.some((c) => c.startsWith("am_session=;") && /expires=Thu, 01 Jan 1970/i.test(c)),
    ).toBe(true);

    expect((await a.get("/api/auth/me")).status).toBe(401);
    // Deleting twice is a plain 401, not an error
    expect((await a.delete("/api/users/me").send({ password: PASSWORD })).status).toBe(401);

    const login = await request(createApp())
      .post("/api/auth/login")
      .send({ email: "gone@example.com", password: PASSWORD });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("the same email can register again afterwards, as a brand new empty account", async () => {
    const a = await registerAgent("again@example.com");
    await populate(a, "old");
    await a.delete("/api/users/me").send({ password: PASSWORD });

    const again = await registerAgent("again@example.com");
    expect((await again.get("/api/monitors")).body.items).toEqual([]);
  });

  it("a wrong password is a 400 (not 401) and deletes nothing", async () => {
    const a = await registerAgent("keep@example.com");
    await populate(a, "keep");
    const before = await counts();

    const res = await a.delete("/api/users/me").send({ password: "not-the-password" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_PASSWORD");
    expect(await counts()).toEqual(before);
    expect((await a.get("/api/auth/me")).status).toBe(200); // still logged in
  });

  it("needs a password in the body", async () => {
    const a = await registerAgent("nopass@example.com");
    for (const body of [{}, { password: "" }, { password: 123 }, { password: "x".repeat(129) }]) {
      const res = await a.delete("/api/users/me").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.user.count()).toBe(1);
  });

  it("needs a session", async () => {
    await registerAgent("someone@example.com");
    const res = await request(createApp()).delete("/api/users/me").send({ password: PASSWORD });
    expect(res.status).toBe(401);
    expect(await prisma.user.count()).toBe(1);
  });

  it("rejects a body that is not JSON (CSRF rule now covers DELETE)", async () => {
    const a = await registerAgent("csrf@example.com");
    const res = await a
      .delete("/api/users/me")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(`password=${PASSWORD}`);
    expect(res.status).toBe(415);
    expect(await prisma.user.count()).toBe(1);
  });

  it("DELETE routes that take no body still work without one (monitor delete)", async () => {
    const a = await registerAgent("nobody@example.com");
    const created = await a
      .post("/api/monitors")
      .send({ name: "x", url: "https://8.8.8.8/", intervalSec: 300 });
    expect((await a.delete(`/api/monitors/${created.body.monitor.id}`)).status).toBe(204);
    // ...and with the {} body the frontend sends
    const second = await a
      .post("/api/monitors")
      .send({ name: "y", url: "https://8.8.8.8/", intervalSec: 300 });
    expect((await a.delete(`/api/monitors/${second.body.monitor.id}`).send({})).status).toBe(204);
  });
});
