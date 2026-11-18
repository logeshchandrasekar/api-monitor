import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "../generated/prisma/client.js";
import { CLAIM_LIMIT, runTick, runTickDrain } from "../jobs/scheduler.js";
import { prisma } from "../lib/prisma.js";
import { createCheckRunner, type CheckRunner } from "../services/checkRunner.js";
import { registerAgent } from "./helpers.js";
import { startTestServer, type TestServer } from "./testServer.js";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

// A runner that never touches the network: the drain loop is what is under test
const instant: CheckRunner = async () => ({
  outcome: "SUCCESS",
  failureType: null,
  statusCode: 200,
  responseTimeMs: 5,
  errorMessage: null,
  checkedAt: new Date(),
});
const real = createCheckRunner({ allowPrivate: true });

async function seedMany(
  count: number,
  overrides: Partial<Prisma.MonitorUncheckedCreateInput> = {},
) {
  await registerAgent();
  const user = await prisma.user.findFirstOrThrow();
  await prisma.monitor.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      userId: user.id,
      name: `m${i}`,
      url: `${server.url}/ok?i=${i}`,
      intervalSec: 3600,
      timeoutMs: 2000,
      nextCheckAt: new Date(Date.now() - 5_000),
      ...overrides,
    })),
  });
}

describe("runTickDrain", () => {
  it("claims every due monitor in one pass when more than one batch is due", async () => {
    await seedMany(CLAIM_LIMIT * 2 + 7);
    const claimed = await runTickDrain(instant, { maxBatches: 10 });
    expect(claimed).toBe(CLAIM_LIMIT * 2 + 7);
    expect(await prisma.check.count()).toBe(CLAIM_LIMIT * 2 + 7);
    // Nothing is left that is due
    expect(await runTick(instant)).toBe(0);
  });

  it("maxBatches = 1 behaves exactly like the old single claim (50 per pass)", async () => {
    await seedMany(CLAIM_LIMIT + 10);
    expect(await runTickDrain(instant, { maxBatches: 1 })).toBe(CLAIM_LIMIT);
    expect(await runTick(instant)).toBe(10);
  });

  it("stops at maxBatches even when more is due, and the rest waits for the next tick", async () => {
    await seedMany(CLAIM_LIMIT * 3);
    expect(await runTickDrain(instant, { maxBatches: 2 })).toBe(CLAIM_LIMIT * 2);
    expect(await runTickDrain(instant, { maxBatches: 2 })).toBe(CLAIM_LIMIT);
  });

  it("a short batch ends the loop without another claim", async () => {
    await seedMany(3);
    expect(await runTickDrain(instant, { maxBatches: 10 })).toBe(3);
  });

  it("stops claiming new batches once told to stop (shutdown), after finishing the batch in hand", async () => {
    await seedMany(CLAIM_LIMIT * 2);
    let calls = 0;
    const claimed = await runTickDrain(instant, {
      maxBatches: 10,
      shouldStop: () => ++calls >= 1, // true from the second batch on
    });
    expect(claimed).toBe(CLAIM_LIMIT);
  });

  it("every monitor still gets exactly one check and a fresh nextCheckAt (nothing runs twice)", async () => {
    await seedMany(CLAIM_LIMIT + 20, { intervalSec: 3600 });
    await runTickDrain(real, { maxBatches: 10 });
    const perMonitor = await prisma.check.groupBy({ by: ["monitorId"], _count: true });
    expect(perMonitor).toHaveLength(CLAIM_LIMIT + 20);
    expect(perMonitor.every((g) => g._count === 1)).toBe(true);
    const due = await prisma.monitor.count({ where: { nextCheckAt: { lte: new Date() } } });
    expect(due).toBe(0);
  });
});
