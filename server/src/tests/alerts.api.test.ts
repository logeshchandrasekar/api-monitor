import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { setEmailService } from "../services/email.js";
import { DEMO_EMAIL, seedDemo } from "../seed/seedDemo.js";
import { connectionRefused, StubEmail } from "./emailStub.js";
import { registerAgent, type Agent } from "./helpers.js";

const mail = new StubEmail();
beforeEach(() => {
  mail.sent = [];
  mail.failWith = null;
  setEmailService(mail);
});
afterEach(() => setEmailService(null));

const createMonitor = async (agent: Agent, name = "Payments API") => {
  const res = await agent
    .post("/api/monitors")
    .send({ name, url: "https://8.8.8.8/health", intervalSec: 300 });
  expect(res.status).toBe(201);
  return res.body.monitor.id as string;
};

const validRule = {
  notifyOnDown: true,
  notifyOnRecovery: false,
  notifyOnSlow: true,
  cooldownMinutes: 60,
  recipientEmail: "oncall@example.com",
};

describe("the rule is created with the monitor (8.1)", () => {
  it("a new monitor already has a rule with the defaults, before anyone asks for it", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    expect(await prisma.alertRule.count({ where: { monitorId: id } })).toBe(1);

    const res = await agent.get(`/api/monitors/${id}/alerts`);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toEqual({
      notifyOnDown: true,
      notifyOnRecovery: true,
      notifyOnSlow: true,
      cooldownMinutes: 30,
      recipientEmail: null,
      effectiveRecipient: "user@example.com",
    });
  });

  it("a duplicate keeps the original's settings", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    await agent.put(`/api/monitors/${id}/alerts`).send(validRule).expect(200);

    const copy = await agent.post(`/api/monitors/${id}/duplicate`);
    const res = await agent.get(`/api/monitors/${copy.body.monitor.id}/alerts`);
    expect(res.body.alerts).toMatchObject(validRule);
  });

  it("a monitor that somehow has no rule gets one when the settings are read", async () => {
    const agent = await registerAgent();
    const user = await prisma.user.findFirstOrThrow();
    const m = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: "Script made",
        url: "https://8.8.8.8",
        intervalSec: 300,
        nextCheckAt: new Date(),
      },
    });
    expect(await prisma.alertRule.count()).toBe(0);
    const res = await agent.get(`/api/monitors/${m.id}/alerts`);
    expect(res.status).toBe(200);
    expect(res.body.alerts.cooldownMinutes).toBe(30);
    expect(await prisma.alertRule.count()).toBe(1);
  });

  it("deleting the monitor deletes its rule and its notification history", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    await agent.post(`/api/monitors/${id}/alerts/test`).expect(200);
    expect(await prisma.notificationLog.count()).toBe(1);

    await agent.delete(`/api/monitors/${id}`).expect(204);
    expect(await prisma.alertRule.count()).toBe(0);
    expect(await prisma.notificationLog.count()).toBe(0);
  });

  it("the demo seed gives every demo monitor a rule", async () => {
    await seedDemo({ days: 1, nowMs: Date.UTC(2026, 10, 4, 12, 0, 0) });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    const monitors = await prisma.monitor.count({ where: { userId: user.id } });
    expect(monitors).toBe(4);
    expect(await prisma.alertRule.count({ where: { monitor: { userId: user.id } } })).toBe(4);
  }, 60_000);
});

describe("PUT /api/monitors/:id/alerts", () => {
  it("replaces the rule and returns it", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    const res = await agent.put(`/api/monitors/${id}/alerts`).send(validRule);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toEqual({ ...validRule, effectiveRecipient: "oncall@example.com" });

    const again = await agent.get(`/api/monitors/${id}/alerts`);
    expect(again.body.alerts).toMatchObject(validRule);
  });

  it("trims and lower-cases the recipient; null goes back to the account email", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    const saved = await agent
      .put(`/api/monitors/${id}/alerts`)
      .send({ ...validRule, recipientEmail: "  OnCall@Example.COM " });
    expect(saved.body.alerts.recipientEmail).toBe("oncall@example.com");

    const cleared = await agent
      .put(`/api/monitors/${id}/alerts`)
      .send({ ...validRule, recipientEmail: null });
    expect(cleared.body.alerts).toMatchObject({
      recipientEmail: null,
      effectiveRecipient: "user@example.com",
    });
  });

  it.each([
    ["cooldown of 0", { cooldownMinutes: 0 }, "cooldownMinutes"],
    ["cooldown over 24 h", { cooldownMinutes: 1441 }, "cooldownMinutes"],
    ["a fractional cooldown", { cooldownMinutes: 1.5 }, "cooldownMinutes"],
    ["a cooldown that is text", { cooldownMinutes: "30" }, "cooldownMinutes"],
    ["a checkbox that is text", { notifyOnDown: "yes" }, "notifyOnDown"],
    ["an invalid email", { recipientEmail: "not-an-email" }, "recipientEmail"],
    ["an empty email (send null instead)", { recipientEmail: "" }, "recipientEmail"],
    ["a missing field", { notifyOnSlow: undefined }, "notifyOnSlow"],
  ])("rejects %s with a field error and changes nothing", async (_name, patch, path) => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    const res = await agent.put(`/api/monitors/${id}/alerts`).send({ ...validRule, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    expect((await agent.get(`/api/monitors/${id}/alerts`)).body.alerts.cooldownMinutes).toBe(30);
  });
});

describe("access rules (SEC-4, API-1)", () => {
  it("another user's monitor is a 404 on every alert route, and nothing changes", async () => {
    const owner = await registerAgent("owner@example.com");
    const id = await createMonitor(owner);
    const other = await registerAgent("other@example.com");

    expect((await other.get(`/api/monitors/${id}/alerts`)).status).toBe(404);
    expect((await other.put(`/api/monitors/${id}/alerts`).send(validRule)).status).toBe(404);
    expect((await other.post(`/api/monitors/${id}/alerts/test`)).status).toBe(404);
    expect((await other.get(`/api/monitors/${id}/notifications`)).status).toBe(404);

    expect(mail.sent).toHaveLength(0);
    expect((await owner.get(`/api/monitors/${id}/alerts`)).body.alerts.cooldownMinutes).toBe(30);
  });

  it("needs a login", async () => {
    const res = await request(createApp()).get(
      "/api/monitors/0b9d3f0e-5c9a-4a52-9c52-0a1e7d1a0001/alerts",
    );
    expect(res.status).toBe(401);
  });

  it("a malformed id is a 400, not a database error", async () => {
    const agent = await registerAgent();
    expect((await agent.get("/api/monitors/nope/alerts")).status).toBe(400);
    expect((await agent.put("/api/monitors/nope/alerts").send(validRule)).status).toBe(400);
    expect((await agent.post("/api/monitors/nope/alerts/test")).status).toBe(400);
    expect((await agent.get("/api/monitors/nope/notifications")).status).toBe(400);
  });
});

describe("POST /api/monitors/:id/alerts/test", () => {
  it("sends a real email to the account address and logs it as SENT", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    const res = await agent.post(`/api/monitors/${id}/alerts/test`);

    expect(res.status).toBe(200);
    expect(res.body.notification).toMatchObject({
      type: "TEST",
      status: "SENT",
      recipient: "user@example.com",
      attempts: 1,
      incidentId: null,
    });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: "user@example.com",
      subject: "[TEST] Alerts for Payments API",
    });
    expect(mail.sent[0]!.text).toContain(`/monitors/${id}`);
  });

  it("goes to the recipient on the rule", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    await agent.put(`/api/monitors/${id}/alerts`).send(validRule);
    await agent.post(`/api/monitors/${id}/alerts/test`).expect(200);
    expect(mail.sent[0]!.to).toBe("oncall@example.com");
  });

  it("when the mail server is unreachable: 502, a safe message, and a FAILED row in the history", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    mail.failWith = connectionRefused();

    const res = await agent.post(`/api/monitors/${id}/alerts/test`);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({
      code: "EMAIL_SEND_FAILED",
      message: "Could not send the test email. Could not reach the mail server.",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|1025|ECONNREFUSED/);

    const history = await agent.get(`/api/monitors/${id}/notifications`);
    expect(history.body.items[0]).toMatchObject({
      type: "TEST",
      status: "FAILED",
      error: "Could not reach the mail server.",
    });
  });

  it("is limited to 5 per 10 minutes per user", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    for (let i = 0; i < 5; i++) await agent.post(`/api/monitors/${id}/alerts/test`).expect(200);
    const res = await agent.post(`/api/monitors/${id}/alerts/test`);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(mail.sent).toHaveLength(5);
  });
});

describe("GET /api/monitors/:id/notifications", () => {
  it("lists newest first and pages with a cursor", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    for (let i = 0; i < 5; i++) {
      await prisma.notificationLog.create({
        data: {
          monitorId: id,
          type: "TEST",
          status: "SENT",
          recipient: `r${i}@example.com`,
          eventAt: new Date(),
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        },
      });
    }
    const first = await agent.get(`/api/monitors/${id}/notifications?limit=2`);
    expect(first.body.items.map((n: { recipient: string }) => n.recipient)).toEqual([
      "r4@example.com",
      "r3@example.com",
    ]);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await agent.get(
      `/api/monitors/${id}/notifications?limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items.map((n: { recipient: string }) => n.recipient)).toEqual([
      "r2@example.com",
      "r1@example.com",
    ]);
    const last = await agent.get(
      `/api/monitors/${id}/notifications?limit=2&cursor=${second.body.nextCursor}`,
    );
    expect(last.body.items).toHaveLength(1);
    expect(last.body.nextCursor).toBeNull();
  });

  it("is empty for a monitor that never alerted, and rejects a bad limit", async () => {
    const agent = await registerAgent();
    const id = await createMonitor(agent);
    expect((await agent.get(`/api/monitors/${id}/notifications`)).body).toEqual({
      items: [],
      nextCursor: null,
    });
    expect((await agent.get(`/api/monitors/${id}/notifications?limit=101`)).status).toBe(400);
  });

  it("only shows this monitor's rows", async () => {
    const agent = await registerAgent();
    const a = await createMonitor(agent, "A");
    const b = await createMonitor(agent, "B");
    await agent.post(`/api/monitors/${a}/alerts/test`).expect(200);
    expect((await agent.get(`/api/monitors/${b}/notifications`)).body.items).toHaveLength(0);
    expect((await agent.get(`/api/monitors/${a}/notifications`)).body.items).toHaveLength(1);
  });
});
