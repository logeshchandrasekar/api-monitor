import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "../generated/prisma/client.js";
import { claimDueMonitors, runTick, startScheduler } from "../jobs/scheduler.js";
import { prisma } from "../lib/prisma.js";
import { createCheckRunner, type CheckRunner } from "../services/checkRunner.js";
import { closedPort, startTestServer, type TestServer } from "./testServer.js";
import { registerAgent } from "./helpers.js";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

const runner = createCheckRunner({ allowPrivate: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Inserts a monitor straight into the database (the API would refuse 127.0.0.1 and 1-second intervals). */
async function seedMonitor(overrides: Partial<Prisma.MonitorUncheckedCreateInput> = {}) {
  let user = await prisma.user.findFirst();
  if (!user) {
    await registerAgent();
    user = await prisma.user.findFirstOrThrow();
  }
  return prisma.monitor.create({
    data: {
      userId: user.id,
      name: "seeded",
      url: `${server.url}/ok`,
      intervalSec: 10,
      timeoutMs: 2000,
      nextCheckAt: new Date(Date.now() - 1000), // due
      ...overrides,
    },
  });
}

const checksOf = (monitorId: string) =>
  prisma.check.findMany({ where: { monitorId }, orderBy: { id: "asc" } });

describe("runTick", () => {
  it("runs a due monitor once, stores the check and the monitor's last* columns, and schedules the next run", async () => {
    const m = await seedMonitor();
    expect(await runTick(runner)).toBe(1);

    const [check] = await checksOf(m.id);
    expect(check).toMatchObject({
      trigger: "SCHEDULED",
      outcome: "SUCCESS",
      statusCode: 200,
      failureType: null,
    });
    expect(typeof check!.id).toBe("bigint");

    const after = await prisma.monitor.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.lastStatusCode).toBe(200);
    expect(after.lastCheckedAt).not.toBeNull();
    expect(after.lastResponseTimeMs).not.toBeNull();
    const untilNext = after.nextCheckAt.getTime() - Date.now();
    expect(untilNext).toBeGreaterThan(8_000);
    expect(untilNext).toBeLessThanOrEqual(10_500);

    // Immediately again: nothing is due, so no second check
    expect(await runTick(runner)).toBe(0);
    expect(await checksOf(m.id)).toHaveLength(1);
  });

  it("never runs a paused monitor", async () => {
    const m = await seedMonitor({ isPaused: true });
    expect(await runTick(runner)).toBe(0);
    expect(await checksOf(m.id)).toHaveLength(0);
  });

  it("does not run a monitor that is not due yet", async () => {
    const m = await seedMonitor({ nextCheckAt: new Date(Date.now() + 60_000) });
    expect(await runTick(runner)).toBe(0);
    expect(await checksOf(m.id)).toHaveLength(0);
  });

  it("records failures with their type and clears the response columns", async () => {
    const wrongStatus = await seedMonitor({ name: "500", url: `${server.url}/status/500` });
    const dead = await seedMonitor({
      name: "dead",
      url: `http://127.0.0.1:${await closedPort()}/`,
    });
    await runTick(runner);

    expect((await checksOf(wrongStatus.id))[0]).toMatchObject({
      outcome: "FAILURE",
      failureType: "UNEXPECTED_STATUS",
      statusCode: 500,
    });
    const [deadCheck] = await checksOf(dead.id);
    expect(deadCheck).toMatchObject({
      outcome: "FAILURE",
      failureType: "CONNECTION",
      statusCode: null,
    });
    const deadAfter = await prisma.monitor.findUniqueOrThrow({ where: { id: dead.id } });
    expect(deadAfter).toMatchObject({ lastStatusCode: null, lastResponseTimeMs: null });
    expect(deadAfter.lastCheckedAt).not.toBeNull();
  });

  it("records SLOW checks", async () => {
    const m = await seedMonitor({ url: `${server.url}/slow?ms=200`, responseThresholdMs: 50 });
    await runTick(runner);
    expect((await checksOf(m.id))[0]).toMatchObject({ outcome: "SLOW", failureType: null });
  });

  it("an overdue monitor runs once, not once per missed interval (no catch-up burst)", async () => {
    const m = await seedMonitor({ nextCheckAt: new Date(Date.now() - 3_600_000) }); // an hour overdue
    expect(await runTick(runner)).toBe(1);
    expect(await runTick(runner)).toBe(0);
    expect(await checksOf(m.id)).toHaveLength(1);
  });

  it("one crashing check does not stop the others", async () => {
    const good = await seedMonitor({ name: "good" });
    const bad = await seedMonitor({ name: "bad", url: `${server.url}/boom` });
    const flaky: CheckRunner = (input) => {
      if (input.url.endsWith("/boom")) throw new Error("runner exploded");
      return runner(input);
    };
    expect(await runTick(flaky)).toBe(2);
    expect((await checksOf(good.id))[0]?.outcome).toBe("SUCCESS");
    expect((await checksOf(bad.id))[0]).toMatchObject({
      outcome: "FAILURE",
      failureType: "OTHER",
      errorMessage: "The check could not be completed.",
    });
  });

  it("a monitor deleted while its check is running is ignored", async () => {
    const m = await seedMonitor();
    const deleting: CheckRunner = async (input) => {
      await prisma.monitor.delete({ where: { id: m.id } });
      return runner(input);
    };
    await expect(runTick(deleting)).resolves.toBe(1);
    expect(await prisma.check.count()).toBe(0);
  });
});

describe("claimDueMonitors", () => {
  it("claims each due monitor exactly once even when several ticks race", async () => {
    for (let i = 0; i < 20; i++) await seedMonitor({ name: `m${i}` });

    const batches = await Promise.all([8, 8, 8, 8].map((limit) => claimDueMonitors(limit)));
    const ids = batches.flat().map((m) => m.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20); // nobody got the same monitor twice

    // ...and every one of them has been moved into the future
    const stillDue = await prisma.monitor.count({ where: { nextCheckAt: { lte: new Date() } } });
    expect(stillDue).toBe(0);
  });

  it("respects the limit and drains the rest on the next call", async () => {
    for (let i = 0; i < 5; i++) await seedMonitor({ name: `m${i}` });
    expect(await claimDueMonitors(3)).toHaveLength(3);
    expect(await claimDueMonitors(3)).toHaveLength(2);
    expect(await claimDueMonitors(3)).toHaveLength(0);
  });

  it("does not advance nextCheckAt of monitors it did not claim", async () => {
    const paused = await seedMonitor({ isPaused: true });
    const before = paused.nextCheckAt;
    await claimDueMonitors();
    const after = await prisma.monitor.findUniqueOrThrow({ where: { id: paused.id } });
    expect(after.nextCheckAt.getTime()).toBe(before.getTime());
  });
});

describe("startScheduler", () => {
  it("keeps checking on its own, and stop() halts it", async () => {
    const m = await seedMonitor({ intervalSec: 1 });
    const handle = startScheduler({ tickMs: 100, run: runner });
    await sleep(2300);
    await handle.stop();
    const count = (await checksOf(m.id)).length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(4);

    await sleep(1300); // would have produced another check if it were still running
    expect(await checksOf(m.id)).toHaveLength(count);
  });

  it("stop() waits for a check that is still running and stores its result", async () => {
    const m = await seedMonitor();
    const slowRunner: CheckRunner = async (input) => {
      await sleep(400);
      return runner(input);
    };
    const handle = startScheduler({ tickMs: 5_000, run: slowRunner });
    await sleep(100); // the first tick has claimed the monitor and the check is in flight
    expect(await checksOf(m.id)).toHaveLength(0);
    await handle.stop(5_000);
    expect(await checksOf(m.id)).toHaveLength(1);
  });
});
