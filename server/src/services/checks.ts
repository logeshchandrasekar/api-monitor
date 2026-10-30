import { PLAN_LIMITS } from "../config/plans.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { CHECK_RANGES, type ListChecksQuery } from "../schemas/check.js";
import { decrypt } from "../utils/crypto.js";
import { AppError } from "../utils/errors.js";
import { decryptHeaders } from "../utils/headers.js";
import { createLimiter } from "../utils/limiter.js";
import { applyCheckResult } from "./applyCheckResult.js";
import {
  defaultRunner,
  type CheckInput,
  type CheckResult,
  type CheckRunner,
} from "./checkRunner.js";
import { getMonitor, type MonitorRow, type Owner } from "./monitors.js";

/** Global outbound cap (SEC-5): scheduled and manual checks share these 10 slots. */
export const OUTBOUND_CONCURRENCY = 10;
const outbound = createLimiter(OUTBOUND_CONCURRENCY);

let activeRunner: CheckRunner = defaultRunner;
/** Tests only: swap the HTTP runner so API tests never touch the network. Pass null to restore. */
export function setCheckRunner(runner: CheckRunner | null) {
  activeRunner = runner ?? defaultRunner;
}

/** Monitors with a manual check running right now (one in flight per monitor, SEC-5). */
const manualInFlight = new Set<string>();

function toInput(m: MonitorRow): CheckInput {
  return {
    url: m.url,
    method: m.method,
    headers: decryptHeaders(m.headersEnc),
    body: m.bodyEnc ? decrypt(m.bodyEnc) : null,
    expectedStatus: m.expectedStatus,
    followRedirects: m.followRedirects,
    timeoutMs: m.timeoutMs,
    responseThresholdMs: m.responseThresholdMs,
  };
}

/**
 * Runs one check through the concurrency limiter. The runner turns every network problem into a result,
 * so an exception here means a bug or unreadable stored settings. It still becomes a FAILURE row
 * instead of crashing the caller.
 */
async function measure(m: MonitorRow, run: CheckRunner): Promise<CheckResult> {
  try {
    return await outbound.run(() => run(toInput(m)));
  } catch (err) {
    logger.error({ err, monitorId: m.id }, "check could not be executed");
    return {
      outcome: "FAILURE",
      failureType: "OTHER",
      statusCode: null,
      responseTimeMs: null,
      errorMessage: "The check could not be completed.",
      checkedAt: new Date(),
    };
  }
}

const checkData = (monitorId: string, trigger: "SCHEDULED" | "MANUAL", r: CheckResult) => ({
  monitorId,
  trigger,
  outcome: r.outcome,
  failureType: r.failureType,
  statusCode: r.statusCode,
  responseTimeMs: r.responseTimeMs,
  errorMessage: r.errorMessage,
  checkedAt: r.checkedAt,
});

const insertCheck = (monitorId: string, trigger: "SCHEDULED" | "MANUAL", r: CheckResult) =>
  prisma.check.create({ data: checkData(monitorId, trigger, r) });

export type CheckRow = Awaited<ReturnType<typeof insertCheck>>;

/**
 * A scheduled check: run, then handed to applyCheckResult, which stores it, advances the status
 * state machine and opens/closes incidents in one transaction (Phase 4). Never throws.
 */
export async function executeScheduledCheck(
  m: MonitorRow,
  run: CheckRunner = activeRunner,
): Promise<void> {
  const result = await measure(m, run);
  try {
    const { applied } = await applyCheckResult(m, result); // m carries the stateEpoch it was claimed with
    if (!applied) {
      logger.debug(
        { monitorId: m.id },
        "check result discarded: monitor was deleted, paused or edited while it ran",
      );
    }
  } catch (err) {
    logger.error({ err, monitorId: m.id }, "could not apply check result");
  }
}

/**
 * "Check now" (ENG-4). Stored with trigger MANUAL and deliberately NOT written to the monitor row:
 * `status`, streaks and the `last*` columns only ever reflect scheduled checks, so spamming this
 * button cannot create incidents or skew uptime.
 */
export async function runManualCheck(
  userId: string,
  monitorId: string,
  run: CheckRunner = activeRunner,
): Promise<CheckRow> {
  const monitor = await getMonitor(userId, monitorId); // 404 if it is not yours (SEC-4)
  if (manualInFlight.has(monitor.id)) {
    throw new AppError(409, "CHECK_IN_PROGRESS", "A check is already running for this monitor.");
  }
  manualInFlight.add(monitor.id);
  try {
    return await insertCheck(monitor.id, "MANUAL", await measure(monitor, run));
  } finally {
    manualInFlight.delete(monitor.id);
  }
}

const DAY_MS = 86_400_000;
const RANGE_MS: Record<(typeof CHECK_RANGES)[number], number> = {
  "1h": 3_600_000,
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

export async function listChecks(owner: Owner, monitorId: string, query: ListChecksQuery) {
  await getMonitor(owner.id, monitorId); // ownership first (SEC-4)

  const retentionDays = PLAN_LIMITS[owner.plan].retentionDays;
  if (query.range && RANGE_MS[query.range] > retentionDays * DAY_MS) {
    throw new AppError(
      403,
      "RANGE_NOT_ALLOWED",
      `The ${owner.plan} plan keeps ${retentionDays} days of history. Choose a shorter range or upgrade.`,
    );
  }

  const rows = await prisma.check.findMany({
    where: {
      monitorId,
      ...(query.range ? { checkedAt: { gte: new Date(Date.now() - RANGE_MS[query.range]) } } : {}),
    },
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: BigInt(query.cursor) }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id.toString() ?? null) : null };
}
