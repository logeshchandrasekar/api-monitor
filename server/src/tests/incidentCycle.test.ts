import { describe, expect, it } from "vitest";
import { runTick } from "../jobs/scheduler.js";
import { prisma } from "../lib/prisma.js";
import type { CheckResult } from "../services/checkRunner.js";
import { registerAgent } from "./helpers.js";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const good = (s: number): CheckResult => ({
  outcome: "SUCCESS",
  failureType: null,
  statusCode: 200,
  responseTimeMs: 90,
  errorMessage: null,
  checkedAt: at(s),
});
const bad = (s: number): CheckResult => ({
  outcome: "FAILURE",
  failureType: "UNEXPECTED_STATUS",
  statusCode: 500,
  responseTimeMs: 40,
  errorMessage: "Expected status 200 but received 500.",
  checkedAt: at(s),
});

describe("full cycle through the real scheduler path, with a scripted clock", () => {
  it("healthy -> down after 3 failures -> incident open -> recovery -> incident resolved with the right duration", async () => {
    const agent = await registerAgent();
    const created = await agent
      .post("/api/monitors")
      .send({ name: "Cycle", url: "https://8.8.8.8/health", intervalSec: 300 });
    const id: string = created.body.monitor.id;

    /** Makes the monitor due, then lets the real tick claim it and apply a scripted result. */
    const tick = async (result: CheckResult) => {
      await prisma.monitor.update({
        where: { id },
        data: { nextCheckAt: new Date(Date.now() - 1000) },
      });
      expect(await runTick(async () => result)).toBe(1);
    };
    const state = async () => (await agent.get(`/api/monitors/${id}`)).body.monitor;
    const incidents = async () => (await agent.get(`/api/monitors/${id}/incidents`)).body.items;

    expect((await state()).status).toBe("PENDING");

    await tick(good(0));
    expect(await state()).toMatchObject({ status: "HEALTHY", failStreak: 0, lastStatusCode: 200 });

    await tick(bad(10));
    await tick(bad(20));
    expect(await state()).toMatchObject({ status: "HEALTHY", failStreak: 2 }); // not down yet, and nothing hidden: failStreak shows
    expect(await incidents()).toHaveLength(0);

    await tick(bad(30)); // the third consecutive failure
    expect(await state()).toMatchObject({ status: "DOWN", failStreak: 3 });
    expect(await incidents()).toHaveLength(1);
    expect((await incidents())[0]).toMatchObject({
      type: "DOWN",
      status: "OPEN",
      ongoing: true,
      failureType: "UNEXPECTED_STATUS",
      failedChecks: 3,
    });

    await tick(bad(40)); // still down: same incident, one more failed check
    expect(await incidents()).toHaveLength(1);
    expect((await incidents())[0].failedChecks).toBe(4);

    await tick(good(130)); // back up 100 s after the incident started (t = 30)
    expect(await state()).toMatchObject({ status: "HEALTHY", failStreak: 0 });
    const [incident] = await incidents();
    expect(incident).toMatchObject({
      status: "RESOLVED",
      ongoing: false,
      resolution: "RECOVERED",
      durationSec: 100,
    });
    expect(new Date(incident.startedAt).getTime()).toBe(at(30).getTime());
    expect(new Date(incident.resolvedAt).getTime()).toBe(at(130).getTime());

    const summary = (await agent.get("/api/dashboard/summary")).body;
    expect(summary.monitors).toMatchObject({ total: 1, healthy: 1, down: 0 });
    expect(summary.activeIncidentCount).toBe(0);
  });
});
