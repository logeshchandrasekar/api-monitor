import { prisma } from "../lib/prisma.js";
import type { StatsQuery } from "../schemas/check.js";
import { RANGE_MS, assertRangeAllowed } from "./checks.js";
import { getMonitor, type Owner } from "./monitors.js";

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Same rule as the dashboard (ENG-4, DAT-3): only SCHEDULED checks count, and SLOW is "up but degraded".
 * A manual "Check now" must never move an uptime figure.
 */
function uptimeOf(up: number, total: number): number | null {
  return total === 0 ? null : round2((up / total) * 100);
}

/** Uptime over the last 24 h for many monitors in ONE query (the monitor list shows it per row). */
export async function uptime24hFor(monitorIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (monitorIds.length === 0) return out;

  const rows = await prisma.check.groupBy({
    by: ["monitorId", "outcome"],
    where: {
      monitorId: { in: monitorIds },
      trigger: "SCHEDULED",
      checkedAt: { gte: new Date(Date.now() - DAY_MS) },
    },
    _count: { _all: true },
  });

  const totals = new Map<string, { up: number; total: number }>();
  for (const row of rows) {
    const t = totals.get(row.monitorId) ?? { up: 0, total: 0 };
    t.total += row._count._all;
    if (row.outcome !== "FAILURE") t.up += row._count._all;
    totals.set(row.monitorId, t);
  }
  for (const id of monitorIds) {
    const t = totals.get(id);
    out.set(id, t ? uptimeOf(t.up, t.total) : null);
  }
  return out;
}

export async function getMonitorStats(owner: Owner, monitorId: string, query: StatsQuery) {
  await getMonitor(owner.id, monitorId); // 404 if it is not yours (SEC-4)
  assertRangeAllowed(owner.plan, query.range); // 403 RANGE_NOT_ALLOWED beyond the plan's history

  const where = {
    monitorId,
    trigger: "SCHEDULED" as const,
    checkedAt: { gte: new Date(Date.now() - RANGE_MS[query.range]) },
  };

  const [byOutcome, timing] = await Promise.all([
    prisma.check.groupBy({ by: ["outcome"], where, _count: { _all: true } }),
    // Only checks that got an answer have a response time (a timeout has none)
    prisma.check.aggregate({
      where: { ...where, responseTimeMs: { not: null } },
      _avg: { responseTimeMs: true },
      _min: { responseTimeMs: true },
      _max: { responseTimeMs: true },
    }),
  ]);

  const count = (outcome: string) => byOutcome.find((o) => o.outcome === outcome)?._count._all ?? 0;
  const slow = count("SLOW");
  const failed = count("FAILURE");
  const successful = count("SUCCESS") + slow; // "successful" = the endpoint answered as expected, slow or not
  const total = successful + failed;

  return {
    range: query.range,
    totalChecks: total,
    successfulChecks: successful,
    slowChecks: slow, // a subset of successfulChecks
    failedChecks: failed,
    uptimePct: uptimeOf(successful, total),
    avgResponseMs:
      timing._avg.responseTimeMs === null ? null : Math.round(timing._avg.responseTimeMs),
    minResponseMs: timing._min.responseTimeMs,
    maxResponseMs: timing._max.responseTimeMs,
  };
}
