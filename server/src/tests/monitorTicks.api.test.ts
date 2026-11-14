import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { recentTicksFor } from "../services/stats.js";
import { registerAgent, type Agent } from "./helpers.js";

const base = { name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 };

async function newMonitor(agent: Agent, name = "Prod API") {
  const res = await agent.post("/api/monitors").send({ ...base, name });
  expect(res.status).toBe(201);
  return res.body.monitor.id as string;
}

const NOW = Date.UTC(2026, 10, 10, 12, 30, 0); // pinned clock: 12:30 UTC
const at = (hour: number, minute: number) => new Date(Date.UTC(2026, 10, 10, hour, minute, 0));

const check = (
  monitorId: string,
  outcome: "SUCCESS" | "SLOW" | "FAILURE",
  when: Date,
  trigger: "SCHEDULED" | "MANUAL" = "SCHEDULED",
) => ({
  monitorId,
  trigger,
  outcome,
  failureType: outcome === "FAILURE" ? ("TIMEOUT" as const) : null,
  statusCode: outcome === "FAILURE" ? null : 200,
  responseTimeMs: outcome === "FAILURE" ? null : 120,
  errorMessage: outcome === "FAILURE" ? "The request timed out." : null,
  checkedAt: when,
});

describe("recentTicksFor", () => {
  it("one tick per UTC hour: any failure is down, any slow is slow, manual checks are ignored", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    const idle = await newMonitor(agent, "Idle API");
    await prisma.check.createMany({
      data: [
        check(id, "SUCCESS", at(12, 10)), // current hour: up
        check(id, "SUCCESS", at(11, 5)), // 11:00 hour: one failure among successes -> down
        check(id, "FAILURE", at(11, 20)),
        check(id, "SUCCESS", at(10, 5)), // 10:00 hour: slow
        check(id, "SLOW", at(10, 40)),
        check(id, "FAILURE", at(9, 15), "MANUAL"), // manual: must not show
        check(id, "SUCCESS", at(12, 0)),
      ],
    });

    const ticks = await recentTicksFor([id, idle], NOW);
    const mine = ticks.get(id)!;
    expect(mine).toHaveLength(24);
    expect(mine[23]).toBe("up"); // 12:00
    expect(mine[22]).toBe("down"); // 11:00
    expect(mine[21]).toBe("slow"); // 10:00
    expect(mine[20]).toBe("none"); // 09:00: only a manual check
    expect(ticks.get(idle)).toEqual(Array(24).fill("none"));
  });

  it("an empty id list does no query and returns an empty map", async () => {
    expect((await recentTicksFor([], NOW)).size).toBe(0);
  });
});

describe("GET /api/monitors includes the tick strip", () => {
  it("every item has 24 ticks, and users only see their own monitors", async () => {
    const agent = await registerAgent("a@example.com");
    const other = await registerAgent("b@example.com");
    const id = await newMonitor(agent);
    await newMonitor(other, "Other user's monitor");
    await prisma.check.create({ data: check(id, "SUCCESS", new Date()) });

    const res = await agent.get("/api/monitors");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const recent = res.body.items[0].recent as string[];
    expect(recent).toHaveLength(24);
    expect(recent.every((t) => ["up", "slow", "down", "none"].includes(t))).toBe(true);
  });
});

describe("GET /api/monitors/:id includes the tick strip", () => {
  it("has 24 ticks, while the write routes return the plain monitor", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);

    const got = await agent.get(`/api/monitors/${id}`);
    expect(got.status).toBe(200);
    expect(got.body.monitor.recent).toEqual(Array(24).fill("none"));

    const paused = await agent.post(`/api/monitors/${id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.monitor.recent).toBeUndefined();
  });
});
