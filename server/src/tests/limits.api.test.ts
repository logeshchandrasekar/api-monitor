import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { registerAgent } from "./helpers.js";

const base = { name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 };

describe("GET /api/users/me/limits", () => {
  it("requires a login", async () => {
    const res = await request(createApp()).get("/api/users/me/limits");
    expect(res.status).toBe(401);
  });

  it("FREE: 5 monitors, 5 minute minimum, 7 days of history, and the usage counter moves", async () => {
    const agent = await registerAgent();
    const before = await agent.get("/api/users/me/limits");
    expect(before.status).toBe(200);
    expect(before.body.limits).toMatchObject({
      plan: "FREE",
      maxMonitors: 5,
      monitorCount: 0,
      minIntervalSec: 300,
      retentionDays: 7,
    });
    expect(before.body.limits.allowedIntervalsSec).toContain(300);
    expect(before.body.limits.allowedIntervalsSec).not.toContain(60);

    await agent.post("/api/monitors").send(base).expect(201);
    const after = await agent.get("/api/users/me/limits");
    expect(after.body.limits.monitorCount).toBe(1);
  });

  it("PRO may check every minute and keeps 30 days", async () => {
    const agent = await registerAgent("pro@example.com", "PRO");
    const res = await agent.get("/api/users/me/limits");
    expect(res.body.limits).toMatchObject({ plan: "PRO", maxMonitors: 50, retentionDays: 30 });
    expect(res.body.limits.allowedIntervalsSec).toContain(60);
  });
});
