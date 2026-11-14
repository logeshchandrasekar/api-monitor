import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { registerAgent } from "./helpers.js";

describe("GET /api/dashboard/summary avgResponseMs24h", () => {
  it("is null while nothing has answered", async () => {
    const agent = await registerAgent("avg-none@example.com");
    const res = await agent.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body.avgResponseMs24h).toBeNull();
  });

  it("averages the answered scheduled checks only", async () => {
    const agent = await registerAgent("avg@example.com");
    const created = await agent
      .post("/api/monitors")
      .send({ name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 });
    expect(created.status).toBe(201);
    const monitorId = created.body.monitor.id as string;

    const check = (
      outcome: "SUCCESS" | "FAILURE",
      ms: number | null,
      minutesAgo: number,
      trigger: "SCHEDULED" | "MANUAL" = "SCHEDULED",
    ) =>
      prisma.check.create({
        data: {
          monitorId,
          trigger,
          outcome,
          failureType: outcome === "FAILURE" ? "TIMEOUT" : null,
          statusCode: outcome === "FAILURE" ? null : 200,
          responseTimeMs: ms,
          checkedAt: new Date(Date.now() - minutesAgo * 60_000),
        },
      });

    await check("SUCCESS", 100, 1);
    await check("SUCCESS", 300, 2);
    await check("FAILURE", null, 3); // no timing: must not pull the average down
    await check("SUCCESS", 9_000, 4, "MANUAL"); // manual checks never count
    await check("SUCCESS", 5_000, 30 * 60); // older than 24 h

    const res = await agent.get("/api/dashboard/summary");
    expect(res.body.avgResponseMs24h).toBe(200);
  });
});
