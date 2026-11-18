import { PLAN_LIMITS, type PlanName } from "../config/plans.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

/** Rows deleted per statement (DAT-3): small enough that no single DELETE holds locks for long. */
export const RETENTION_BATCH_SIZE = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PLANS = Object.keys(PLAN_LIMITS) as PlanName[];

export type RetentionPlanResult = {
  plan: PlanName;
  retentionDays: number;
  cutoff: Date;
  /** Rows deleted, or in a dry run the number of rows that would be deleted. */
  rows: number;
  batches: number;
};

export type RetentionResult = {
  dryRun: boolean;
  totalRows: number;
  durationMs: number;
  plans: RetentionPlanResult[];
};

export type RetentionOptions = {
  now?: Date;
  batchSize?: number;
  /** Count what would be deleted and delete nothing. */
  dryRun?: boolean;
  /** Pause between batches so a big clean-up never monopolises the database. Tests pass 0. */
  pauseMs?: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Deletes the checks that are older than their owner's plan retention (DAT-3), in batches.
 * Only the `checks` table is touched: incidents are kept until the monitor goes, and notification
 * logs are not part of DAT-3. Safe to run twice or from two processes: each batch is one DELETE.
 */
export async function runRetention(opts: RetentionOptions = {}): Promise<RetentionResult> {
  const started = performance.now();
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? RETENTION_BATCH_SIZE;
  const dryRun = opts.dryRun ?? false;
  const pauseMs = opts.pauseMs ?? 50;
  const plans: RetentionPlanResult[] = [];

  for (const plan of PLANS) {
    const retentionDays = PLAN_LIMITS[plan].retentionDays;
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    let rows = 0;
    let batches = 0;

    if (dryRun) {
      const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM checks c
        JOIN monitors m ON m.id = c."monitorId"
        JOIN users u ON u.id = m."userId"
        WHERE u.plan = ${plan}::"Plan" AND c."checkedAt" < ${cutoff}`;
      rows = Number(row?.n ?? 0);
    } else {
      for (;;) {
        const deleted = await prisma.$executeRaw`
          DELETE FROM checks WHERE id IN (
            SELECT c.id FROM checks c
            JOIN monitors m ON m.id = c."monitorId"
            JOIN users u ON u.id = m."userId"
            WHERE u.plan = ${plan}::"Plan" AND c."checkedAt" < ${cutoff}
            LIMIT ${batchSize})`;
        rows += deleted;
        if (deleted > 0) batches++;
        if (deleted < batchSize) break;
        if (pauseMs > 0) await sleep(pauseMs);
      }
    }

    plans.push({ plan, retentionDays, cutoff, rows, batches });
    logger.info(
      { plan, retentionDays, cutoff: cutoff.toISOString(), rows, batches, dryRun },
      dryRun ? "retention dry run" : "retention: expired checks deleted",
    );
  }

  const totalRows = plans.reduce((sum, p) => sum + p.rows, 0);
  const durationMs = Math.round(performance.now() - started);
  logger.info({ totalRows, durationMs, dryRun }, "retention finished");
  return { dryRun, totalRows, durationMs, plans };
}

export type RetentionHandle = { stop: () => Promise<void> };

/**
 * Runs the retention job once shortly after boot and then every 24 hours, inside the API process
 * (switch it off with ENABLE_RETENTION=false when a separate worker takes over).
 * A failed run is logged and tried again at the next interval; it never stops the API.
 */
export function startRetention(
  opts: { intervalMs?: number; startDelayMs?: number; run?: () => Promise<unknown> } = {},
): RetentionHandle {
  const intervalMs = opts.intervalMs ?? DAY_MS;
  const run = opts.run ?? (() => runRetention());
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> | null = null;

  const schedule = (ms: number) => {
    if (stopped) return;
    timer = setTimeout(runOnce, ms);
  };

  function runOnce() {
    if (stopped || current) return;
    current = run()
      .then(() => undefined)
      .catch((err) => logger.error({ err }, "retention failed"))
      .finally(() => {
        current = null;
        schedule(intervalMs);
      });
  }

  schedule(opts.startDelayMs ?? 60_000);
  logger.info({ intervalMs }, "retention job scheduled");

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await current;
    },
  };
}