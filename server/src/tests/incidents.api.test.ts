import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { applyCheckResult } from "../services/applyCheckResult.js";
import type { CheckResult } from "../services/checkRunner.js";
import { setCheckRunner } from "../services/checks.js";
import { registerAgent, type Agent } from "./helpers.js";

// Literal public IP: creating a monitor never needs DNS
const base = { name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 };

async function newMonitor(agent: Agent, overrides: Record<string, unknown> = {}) {
  const res = await agent.post("/api/monitors").send({ ...base, ...overrides });
  expect(res.status).toBe(201);
  return res.body.monitor.id as string;
}

const monitorOf = (id: string) => prisma.monitor.findUniqueOrThrow({ where: { id } });
const incidentsOf = (monitorId: string) =>
  prisma.incident.findMany({ where: { monitorId }, orderBy: { startedAt: "asc" } });
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

const seedOpen = (
  monitorId: string,
  type: "DOWN" | "DEGRADED",
  startedAt: Date,
  extra: Partial<Prisma.IncidentUncheckedCreateInput> = {},
) =>
  prisma.incident.create({
    data: {
      monitorId,
      type,
      reason: "seed",
      failedChecks: 3,
      startedAt,
      openKey: `${monitorId}:${type}`,
      ...extra,
    },
  });

const seedResolved = (
  monitorId: string,
  startedAt: Date,
  durationSec: number,
  type: "DOWN" | "DEGRADED" = "DOWN",
) =>
  prisma.incident.create({
    data: {
      monitorId,
      type,
      status: "RESOLVED",
      resolution: "RECOVERED",
      reason: "seed",
      failedChecks: 3,
      startedAt,
      resolvedAt: new Date(startedAt.getTime() + durationSec * 1000),
      durationSec,
    },
  });

const failResult = (): CheckResult => ({
  outcome: "FAILURE",
  failureType: "CONNECTION",
  statusCode: null,
  responseTimeMs: null,
  errorMessage: "Could not connect to the server. It may be down or refusing connections.",
  checkedAt: new Date(),
});

afterEach(() => setCheckRunner(null));

describe("pause, edit and resume (ENG-5)", () => {
  async function downMonitor(agent: Agent) {
    const id = await newMonitor(agent);
    await prisma.monitor.update({ where: { id }, data: { status: "DOWN", failStreak: 3 } });
    await seedOpen(id, "DOWN", ago(90));
    return id;
  }

  it("pause resolves open incidents with PAUSED and bumps the epoch; repeating it changes nothing more", async () => {
    const agent = await registerAgent();
    const id = await downMonitor(agent);

    expect((await agent.post(`/api/monitors/${id}/pause`)).status).toBe(200);
    const [incident] = await incidentsOf(id);
    expect(incident).toMatchObject({ status: "RESOLVED", resolution: "PAUSED", openKey: null });
    expect(incident!.durationSec).toBeGreaterThanOrEqual(89);
    expect(incident!.durationSec).toBeLessThanOrEqual(95);
    expect(await monitorOf(id)).toMatchObject({ isPaused: true, stateEpoch: 1 });

    await agent.post(`/api/monitors/${id}/pause`);
    expect((await monitorOf(id)).stateEpoch).toBe(1);
  });

  it("resume resets the state to PENDING and bumps the epoch again", async () => {
    const agent = await registerAgent();
    const id = await downMonitor(agent);
    await agent.post(`/api/monitors/${id}/pause`);
    const res = await agent.post(`/api/monitors/${id}/resume`);
    expect(res.body.monitor).toMatchObject({ isPaused: false, status: "PENDING", failStreak: 0 });
    expect((await monitorOf(id)).stateEpoch).toBe(2);
  });

  it("a material edit resolves incidents with CONFIG_CHANGED and resets state; a cosmetic edit touches nothing", async () => {
    const agent = await registerAgent();
    const id = await downMonitor(agent);

    await agent.patch(`/api/monitors/${id}`).send({ name: "Renamed", tags: ["x"] });
    expect((await incidentsOf(id))[0]!.status).toBe("OPEN");
    expect(await monitorOf(id)).toMatchObject({ status: "DOWN", stateEpoch: 0 });

    const res = await agent.patch(`/api/monitors/${id}`).send({ url: "https://1.1.1.1/new" });
    expect(res.status).toBe(200);
    expect((await incidentsOf(id))[0]).toMatchObject({
      status: "RESOLVED",
      resolution: "CONFIG_CHANGED",
      openKey: null,
    });
    expect(await monitorOf(id)).toMatchObject({ status: "PENDING", failStreak: 0, stateEpoch: 1 });
  });

  it("a check that was already running when the monitor was paused or edited is discarded", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    const claimed = await monitorOf(id); // the scheduler claimed this version

    await agent.post(`/api/monitors/${id}/pause`);
    const r = await applyCheckResult(claimed, failResult());
    expect(r.applied).toBe(false);
    expect(await prisma.check.count({ where: { monitorId: id } })).toBe(0);
    expect(await incidentsOf(id)).toHaveLength(0);
  });
});

describe("manual checks stay out of the state machine (ENG-4)", () => {
  it("failing manual checks create no incident and do not move the monitor", async () => {
    setCheckRunner(async () => failResult());
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await prisma.monitor.update({ where: { id }, data: { status: "HEALTHY" } });

    for (let i = 0; i < 4; i++)
      expect((await agent.post(`/api/monitors/${id}/check`)).status).toBe(201);
    expect(await monitorOf(id)).toMatchObject({
      status: "HEALTHY",
      failStreak: 0,
      lastCheckedAt: null,
    });
    expect(await incidentsOf(id)).toHaveLength(0);
    expect(await prisma.check.count({ where: { monitorId: id, trigger: "MANUAL" } })).toBe(4);
  });
});

describe("GET /api/monitors/:id/incidents", () => {
  it("lists newest first with a cursor, and shows a live duration for an open incident", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await seedResolved(id, ago(7200), 600);
    await seedResolved(id, ago(5400), 300);
    await seedOpen(id, "DOWN", ago(120));

    const first = await agent.get(`/api/monitors/${id}/incidents?limit=2`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items[0]).toMatchObject({
      status: "OPEN",
      ongoing: true,
      monitorId: id,
      monitorName: "Prod API",
      type: "DOWN",
    });
    expect(first.body.items[0].durationSec).toBeGreaterThanOrEqual(119); // live: started 120 s ago
    expect(first.body.items[1]).toMatchObject({
      status: "RESOLVED",
      ongoing: false,
      durationSec: 300,
      resolution: "RECOVERED",
    });
    expect(first.body.items[0]).not.toHaveProperty("openKey");

    const second = await agent.get(
      `/api/monitors/${id}/incidents?limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].durationSec).toBe(600);
    expect(second.body.nextCursor).toBeNull();
  });

  it("filters by status and type", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await seedResolved(id, ago(7200), 600, "DEGRADED");
    await seedOpen(id, "DOWN", ago(60));
    const types = async (q: string) =>
      (await agent.get(`/api/monitors/${id}/incidents?${q}`)).body.items.map(
        (i: { type: string }) => i.type,
      );
    expect(await types("status=OPEN")).toEqual(["DOWN"]);
    expect(await types("status=RESOLVED")).toEqual(["DEGRADED"]);
    expect(await types("type=DEGRADED")).toEqual(["DEGRADED"]);
  });

  it("is 404 for someone else's monitor and for an unknown one; 400 for bad input (SEC-4)", async () => {
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    const id = await newMonitor(a);
    await seedOpen(id, "DOWN", ago(60));
    expect((await b.get(`/api/monitors/${id}/incidents`)).status).toBe(404);
    expect(
      (await a.get("/api/monitors/00000000-0000-4000-8000-000000000000/incidents")).status,
    ).toBe(404);
    expect((await a.get(`/api/monitors/${id}/incidents?status=NOPE`)).status).toBe(400);
    expect((await a.get(`/api/monitors/${id}/incidents?limit=0`)).status).toBe(400);
  });
});

describe("GET /api/incidents and /api/incidents/:id", () => {
  it("returns only your own incidents, across monitors, and filters by monitorId/status", async () => {
    const a = await registerAgent("a@example.com", "PRO");
    const b = await registerAgent("b@example.com");
    const a1 = await newMonitor(a, { name: "A1" });
    const a2 = await newMonitor(a, { name: "A2" });
    const b1 = await newMonitor(b, { name: "B1" });
    await seedOpen(a1, "DOWN", ago(300));
    await seedResolved(a2, ago(3600), 120);
    await seedOpen(b1, "DOWN", ago(60));

    const names = async (agent: Agent, q = "") =>
      (await agent.get(`/api/incidents${q}`)).body.items.map(
        (i: { monitorName: string }) => i.monitorName,
      );
    expect(await names(a)).toEqual(["A1", "A2"]); // newest first, and never B1
    expect(await names(a, `?monitorId=${a2}`)).toEqual(["A2"]);
    expect(await names(a, "?status=OPEN")).toEqual(["A1"]);
    expect(await names(b)).toEqual(["B1"]);
    expect(await names(b, `?monitorId=${a1}`)).toEqual([]); // someone else's monitorId: empty, no leak
  });

  it("GET /api/incidents/:id: yours is 200, someone else's is 404, a bad id is 400", async () => {
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    const id = await newMonitor(a);
    const incident = await seedOpen(id, "DOWN", ago(60));

    const ok = await a.get(`/api/incidents/${incident.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.incident).toMatchObject({
      id: incident.id,
      type: "DOWN",
      ongoing: true,
      monitorName: "Prod API",
    });
    expect((await b.get(`/api/incidents/${incident.id}`)).status).toBe(404);
    expect((await a.get("/api/incidents/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await a.get("/api/incidents/not-a-uuid")).status).toBe(400);
  });

  it("rejects anonymous requests", async () => {
    const app = createApp();
    expect((await request(app).get("/api/incidents")).status).toBe(401);
    expect(
      (await request(app).get("/api/incidents/00000000-0000-4000-8000-000000000000")).status,
    ).toBe(401);
    expect((await request(app).get("/api/dashboard/summary")).status).toBe(401);
  });
});

describe("GET /api/dashboard/summary", () => {
  it("is all zeros with null uptime for a brand new user", async () => {
    const agent = await registerAgent();
    const res = await agent.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      monitors: { total: 0, healthy: 0, degraded: 0, down: 0, pending: 0, paused: 0 },
      uptime24h: null,
      checks24h: 0,
      activeIncidentCount: 0,
      activeIncidents: [],
    });
  });

  it("counts monitors by status (paused only as paused), lists active incidents, and computes 24 h uptime from scheduled checks only", async () => {
    const a = await registerAgent("a@example.com", "PRO");
    const b = await registerAgent("b@example.com");
    const healthy = await newMonitor(a, { name: "healthy" });
    const down = await newMonitor(a, { name: "down" });
    const degraded = await newMonitor(a, { name: "degraded" });
    await newMonitor(a, { name: "pending" });
    const paused = await newMonitor(a, { name: "paused" });
    await prisma.monitor.update({ where: { id: healthy }, data: { status: "HEALTHY" } });
    await prisma.monitor.update({ where: { id: down }, data: { status: "DOWN" } });
    await prisma.monitor.update({ where: { id: degraded }, data: { status: "DEGRADED" } });
    await prisma.monitor.update({
      where: { id: paused },
      data: { status: "HEALTHY", isPaused: true },
    });
    await seedOpen(down, "DOWN", ago(600));
    await seedOpen(degraded, "DEGRADED", ago(60));
    await seedResolved(healthy, ago(9000), 100);

    const check = (
      monitorId: string,
      outcome: "SUCCESS" | "SLOW" | "FAILURE",
      over: Partial<Prisma.CheckUncheckedCreateInput> = {},
    ) => ({
      monitorId,
      trigger: "SCHEDULED" as const,
      outcome,
      statusCode: 200,
      responseTimeMs: 100,
      checkedAt: ago(600),
      ...over,
    });
    await prisma.check.createMany({
      data: [
        check(healthy, "SUCCESS"),
        check(healthy, "SUCCESS"),
        check(healthy, "SUCCESS"),
        check(healthy, "SLOW"), // up, but slow: still counts as up
        check(healthy, "FAILURE"),
        check(healthy, "FAILURE", { trigger: "MANUAL" }), // manual: ignored
        check(healthy, "SUCCESS", { checkedAt: ago(2 * 86_400) }), // older than 24 h: ignored
      ],
    });
    // another user's failing check must not leak into this user's numbers
    const bMonitor = await newMonitor(b);
    await prisma.check.create({ data: check(bMonitor, "FAILURE") });

    const res = await a.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body.monitors).toEqual({
      total: 5,
      healthy: 1,
      degraded: 1,
      down: 1,
      pending: 1,
      paused: 1,
    });
    expect(res.body.checks24h).toBe(5);
    expect(res.body.uptime24h).toBe(80); // (3 success + 1 slow) / 5
    expect(res.body.activeIncidentCount).toBe(2);
    expect(res.body.activeIncidents.map((i: { type: string }) => i.type)).toEqual([
      "DEGRADED",
      "DOWN",
    ]); // newest first
    expect(res.body.activeIncidents[0]).toMatchObject({ monitorName: "degraded", ongoing: true });
  });
});
