import { afterEach, describe, expect, it, vi } from "vitest";
import { startRetention, runRetention, RETENTION_BATCH_SIZE } from "../jobs/retention.js";
import { prisma } from "../lib/prisma.js";
import { registerAgent } from "./helpers.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-15T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

async function userWithMonitor(email: string, plan: "FREE" | "PRO") {
  await registerAgent(email, plan);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const monitor = await prisma.monitor.create({
    data: {
      userId: user.id,
      name: `monitor of ${email}`,
      url: "https://example.com/",
      intervalSec: 300,
      nextCheckAt: new Date("2099-01-01T00:00:00Z"),
    },
  });
  return { user, monitor };
}

const addChecks = (monitorId: string, agesInDays: number[]) =>
  prisma.check.createMany({
    data: agesInDays.map((d) => ({
      monitorId,
      trigger: "SCHEDULED" as const,
      outcome: "SUCCESS" as const,
      statusCode: 200,
      responseTimeMs: 120,
      checkedAt: ago(d),
    })),
  });

const keptAges = async (monitorId: string) =>
  (await prisma.check.findMany({ where: { monitorId }, select: { checkedAt: true } }))
    .map((c) => Math.round((NOW.getTime() - c.checkedAt.getTime()) / DAY))
    .sort((a, b) => a - b);

describe("runRetention (DAT-3)", () => {
  it("removes only checks older than each plan's retention (Free 7 days, Pro 30 days)", async () => {
    const free = await userWithMonitor("free@example.com", "FREE");
    const pro = await userWithMonitor("pro@example.com", "PRO");
    await addChecks(free.monitor.id, [0, 1, 6, 8, 20, 90]);
    await addChecks(pro.monitor.id, [0, 8, 29, 31, 60, 90]);

    const result = await runRetention({ now: NOW, pauseMs: 0 });

    expect(await keptAges(free.monitor.id)).toEqual([0, 1, 6]);
    expect(await keptAges(pro.monitor.id)).toEqual([0, 8, 29]);
    expect(result.dryRun).toBe(false);
    expect(result.totalRows).toBe(6);
    const byPlan = Object.fromEntries(result.plans.map((p) => [p.plan, p]));
    expect(byPlan.FREE).toMatchObject({ retentionDays: 7, rows: 3, batches: 1 });
    expect(byPlan.PRO).toMatchObject({ retentionDays: 30, rows: 3, batches: 1 });
    expect(byPlan.TEAM).toMatchObject({ retentionDays: 30, rows: 0, batches: 0 });
  });

  it("deletes in batches and reports every batch", async () => {
    const { monitor } = await userWithMonitor("batches@example.com", "FREE");
    await addChecks(monitor.id, [
      ...Array.from({ length: 25 }, (_, i) => 10 + i), // 25 expired
      1,
      2, // 2 to keep
    ]);

    const result = await runRetention({ now: NOW, batchSize: 10, pauseMs: 0 });

    const free = result.plans.find((p) => p.plan === "FREE")!;
    expect(free.rows).toBe(25);
    expect(free.batches).toBe(3); // 10 + 10 + 5
    expect(await keptAges(monitor.id)).toEqual([1, 2]);
  });

  it("a second run right after finds nothing to do", async () => {
    const { monitor } = await userWithMonitor("again@example.com", "FREE");
    await addChecks(monitor.id, [1, 30, 40]);
    await runRetention({ now: NOW, pauseMs: 0 });
    const second = await runRetention({ now: NOW, pauseMs: 0 });
    expect(second.totalRows).toBe(0);
    expect(await keptAges(monitor.id)).toEqual([1]);
  });

  it("never touches incidents, notification logs, monitors or other tables", async () => {
    const { monitor } = await userWithMonitor("keeps@example.com", "FREE");
    await addChecks(monitor.id, [100]);
    const incident = await prisma.incident.create({
      data: {
        monitorId: monitor.id,
        type: "DOWN",
        status: "RESOLVED",
        reason: "Timed out",
        startedAt: ago(100),
        resolvedAt: ago(99),
        resolution: "RECOVERED",
      },
    });
    await prisma.notificationLog.create({
      data: {
        monitorId: monitor.id,
        incidentId: incident.id,
        type: "DOWN",
        status: "SENT",
        recipient: "keeps@example.com",
        eventAt: ago(100),
        createdAt: ago(100),
      },
    });

    await runRetention({ now: NOW, pauseMs: 0 });

    expect(await prisma.check.count()).toBe(0);
    expect(await prisma.incident.count()).toBe(1);
    expect(await prisma.notificationLog.count()).toBe(1);
    expect(await prisma.monitor.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("applies the plan of the monitor's owner, so a user who upgrades keeps more history", async () => {
    const { user, monitor } = await userWithMonitor("upgrade@example.com", "FREE");
    await addChecks(monitor.id, [3, 12, 25]);
    await prisma.user.update({ where: { id: user.id }, data: { plan: "PRO" } });
    await runRetention({ now: NOW, pauseMs: 0 });
    expect(await keptAges(monitor.id)).toEqual([3, 12, 25]);
  });

  it("dry run counts what would go and deletes nothing", async () => {
    const { monitor } = await userWithMonitor("dry@example.com", "FREE");
    await addChecks(monitor.id, [1, 20, 21, 22]);
    const result = await runRetention({ now: NOW, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.plans.find((p) => p.plan === "FREE")!.rows).toBe(3);
    expect(await prisma.check.count()).toBe(4);
  });

  it("uses a batch size of 5,000 by default (DAT-3)", () => {
    expect(RETENTION_BATCH_SIZE).toBe(5000);
  });

  it("works with an empty database", async () => {
    const result = await runRetention({ now: NOW, pauseMs: 0 });
    expect(result.totalRows).toBe(0);
  });
});

describe("startRetention", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs after the start delay, then once per interval, and stops cleanly", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = startRetention({ intervalMs: 1000, startDelayMs: 100, run });

    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    await handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("a failing run is logged and tried again later, it never throws", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined);
    const handle = startRetention({ intervalMs: 1000, startDelayMs: 10, run });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await handle.stop();
  });

  it("stop waits for a run that is already in progress", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const handle = startRetention({ intervalMs: 1000, startDelayMs: 10, run });
    await vi.advanceTimersByTimeAsync(10);

    let stopped = false;
    const stopping = handle.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(50);
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
  });
});
