import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { registerAgent, type Agent } from "./helpers.js";

const base = { name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 };

async function newMonitor(agent: Agent, name = "Prod API") {
  const res = await agent.post("/api/monitors").send({ ...base, name });
  expect(res.status).toBe(201);
  return res.body.monitor.id as string;
}

const ago = (ms: number) => new Date(Date.now() - ms);
const HOUR = 3_600_000;

type Row = {
  outcome: "SUCCESS" | "SLOW" | "FAILURE";
  trigger?: "SCHEDULED" | "MANUAL";
  responseTimeMs: number | null;
  at: Date;
};

const seed = (monitorId: string, rows: Row[]) =>
  prisma.check.createMany({
    data: rows.map((r) => ({
      monitorId,
      trigger: r.trigger ?? "SCHEDULED",
      outcome: r.outcome,
      failureType: r.outcome === "FAILURE" ? ("TIMEOUT" as const) : null,
      statusCode: r.outcome === "FAILURE" ? null : 200,
      responseTimeMs: r.responseTimeMs,
      errorMessage: r.outcome === "FAILURE" ? "The request timed out." : null,
      checkedAt: r.at,
    })),
  });

describe("GET /api/monitors/:id/stats", () => {
  it("a monitor with no checks has no uptime and no timings (not 0 %)", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    const res = await agent.get(`/api/monitors/${id}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      range: "24h",
      totalChecks: 0,
      successfulChecks: 0,
      slowChecks: 0,
      failedChecks: 0,
      uptimePct: null,
      avgResponseMs: null,
      minResponseMs: null,
      maxResponseMs: null,
    });
  });

  it("counts scheduled checks in the range only; slow counts as up; manual and older checks are ignored", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await seed(id, [
      { outcome: "SUCCESS", responseTimeMs: 100, at: ago(1 * HOUR) },
      { outcome: "SUCCESS", responseTimeMs: 200, at: ago(2 * HOUR) },
      { outcome: "SUCCESS", responseTimeMs: 300, at: ago(3 * HOUR) },
      { outcome: "SLOW", responseTimeMs: 900, at: ago(4 * HOUR) },
      { outcome: "FAILURE", responseTimeMs: null, at: ago(5 * HOUR) },
      { outcome: "FAILURE", trigger: "MANUAL", responseTimeMs: null, at: ago(1 * HOUR) }, // never counted
      { outcome: "FAILURE", responseTimeMs: null, at: ago(48 * HOUR) }, // outside 24 h
    ]);

    const res = await agent.get(`/api/monitors/${id}/stats?range=24h`);
    expect(res.body.stats).toMatchObject({
      totalChecks: 5,
      successfulChecks: 4,
      slowChecks: 1,
      failedChecks: 1,
      uptimePct: 80,
      avgResponseMs: 375,
      minResponseMs: 100,
      maxResponseMs: 900,
    });

    // 7 days now includes the old failure
    const week = await agent.get(`/api/monitors/${id}/stats?range=7d`);
    expect(week.body.stats).toMatchObject({ totalChecks: 6, failedChecks: 2 });
  });

  it("refuses a range longer than the plan's history, with a message that says so", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    const res = await agent.get(`/api/monitors/${id}/stats?range=30d`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RANGE_NOT_ALLOWED");
    expect(res.body.error.message).toMatch(/7 days/);
  });

  it("rejects an unknown range and someone else's monitor", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    expect((await agent.get(`/api/monitors/${id}/stats?range=1y`)).status).toBe(400);

    const other = await registerAgent("other@example.com");
    expect((await other.get(`/api/monitors/${id}/stats`)).status).toBe(404);
  });
});

describe("GET /api/monitors (uptime24h on every item)", () => {
  it("is the 24 h uptime per monitor, and null until a scheduled check exists", async () => {
    const agent = await registerAgent();
    const withChecks = await newMonitor(agent, "With checks");
    await newMonitor(agent, "Fresh");
    await seed(withChecks, [
      { outcome: "SUCCESS", responseTimeMs: 100, at: ago(1 * HOUR) },
      { outcome: "FAILURE", responseTimeMs: null, at: ago(2 * HOUR) },
    ]);

    const res = await agent.get("/api/monitors");
    const byName = Object.fromEntries(
      res.body.items.map((m: { name: string; uptime24h: number | null }) => [m.name, m.uptime24h]),
    );
    expect(byName).toEqual({ "With checks": 50, Fresh: null });
  });
});
