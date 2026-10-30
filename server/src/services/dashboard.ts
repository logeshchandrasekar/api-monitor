import { prisma } from "../lib/prisma.js";
import { incidentInclude } from "./incidents.js";

const DAY_MS = 86_400_000;

export async function getDashboardSummary(userId: string) {
  const since = new Date(Date.now() - DAY_MS);

  const [byStatus, outcomes, activeIncidentCount, activeIncidents] = await Promise.all([
    prisma.monitor.groupBy({
      by: ["status", "isPaused"],
      where: { userId },
      _count: { _all: true },
    }),
    // Uptime counts SCHEDULED checks only: manual checks must not skew it (ENG-4, DAT-3)
    prisma.check.groupBy({
      by: ["outcome"],
      where: { trigger: "SCHEDULED", checkedAt: { gte: since }, monitor: { userId } },
      _count: { _all: true },
    }),
    prisma.incident.count({ where: { status: "OPEN", monitor: { userId } } }),
    prisma.incident.findMany({
      where: { status: "OPEN", monitor: { userId } },
      include: incidentInclude,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 10,
    }),
  ]);

  // "Paused" is a flag, not a status: a paused monitor is counted only as paused
  const monitors = { total: 0, healthy: 0, degraded: 0, down: 0, pending: 0, paused: 0 };
  for (const row of byStatus) {
    const n = row._count._all;
    monitors.total += n;
    if (row.isPaused) monitors.paused += n;
    else if (row.status === "HEALTHY") monitors.healthy += n;
    else if (row.status === "DEGRADED") monitors.degraded += n;
    else if (row.status === "DOWN") monitors.down += n;
    else monitors.pending += n;
  }

  const count = (outcome: string) => outcomes.find((o) => o.outcome === outcome)?._count._all ?? 0;
  const up = count("SUCCESS") + count("SLOW"); // slow is "up but degraded" (DAT-3)
  const total = up + count("FAILURE");

  return {
    monitors,
    uptime24h: total === 0 ? null : Math.round((up / total) * 10_000) / 100, // percent, 2 decimals
    checks24h: total,
    activeIncidentCount,
    activeIncidents,
  };
}
