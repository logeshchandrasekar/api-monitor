import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import type { CheckRunner } from "../services/checkRunner.js";
import { executeScheduledCheck } from "../services/checks.js";
import type { MonitorRow } from "../services/monitors.js";

export const CLAIM_LIMIT = 50;

/**
 * Claims due monitors and moves their `nextCheckAt` forward in ONE transaction (ENG-1).
 *
 *  - FOR UPDATE SKIP LOCKED: a second caller (another tick, another process) skips rows this
 *    transaction holds instead of waiting, so no monitor is claimed twice.
 *  - nextCheckAt is advanced BEFORE the check runs, so a crash mid-check cannot cause a re-run
 *    and a slow check cannot overlap itself.
 *  - It advances from now(), not from the old nextCheckAt. After downtime a monitor runs once
 *    and resumes its normal rhythm; missed intervals are gaps, not a burst of catch-up checks.
 */
export async function claimDueMonitors(limit = CLAIM_LIMIT): Promise<MonitorRow[]> {
  return prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM monitors
      WHERE "isPaused" = false AND "nextCheckAt" <= now()
      ORDER BY "nextCheckAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    if (due.length === 0) return [];

    const ids = due.map((row) => row.id);
    await tx.$executeRaw`
      UPDATE monitors
      SET "nextCheckAt" = now() + ("intervalSec" * interval '1 second')
      WHERE id = ANY(${ids})`;

    return tx.monitor.findMany({ where: { id: { in: ids } } });
  });
}

/** One scheduler pass: claim, run everything claimed (through the shared limiter), store results. */
export async function runTick(run?: CheckRunner): Promise<number> {
  const monitors = await claimDueMonitors();
  // allSettled: one check blowing up never stops the others (or the loop)
  const results = await Promise.allSettled(monitors.map((m) => executeScheduledCheck(m, run)));
  results.forEach((r, i) => {
    if (r.status === "rejected") logger.error({ err: r.reason, monitorId: monitors[i]?.id }, "scheduled check crashed");
  });
  return monitors.length;
}

export type SchedulerHandle = { stop: (waitMs?: number) => Promise<void> };

export function startScheduler(opts: { tickMs?: number; run?: CheckRunner } = {}): SchedulerHandle {
  const tickMs = opts.tickMs ?? env.SCHEDULER_TICK_MS;
  let stopped = false;
  let current: Promise<void> | null = null;

  const tick = () => {
    if (stopped || current) return; // never overlap: a long tick simply delays the next one
    current = runTick(opts.run)
      .then((n) => {
        if (n > 0) logger.debug({ claimed: n }, "scheduler tick");
      })
      .catch((err) => logger.error({ err }, "scheduler tick failed")) // the loop must survive a DB hiccup
      .finally(() => {
        current = null;
      });
  };

  tick(); // right away: after a restart, overdue monitors resume immediately
  const timer = setInterval(tick, tickMs);
  logger.info({ tickMs }, "scheduler started");

  return {
    async stop(waitMs = 10_000) {
      stopped = true;
      clearInterval(timer);
      if (!current) return;
      const timedOut = await Promise.race([
        current.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), waitMs).unref()),
      ]);
      if (timedOut) logger.warn("scheduler stopped while checks were still running");
    },
  };
}