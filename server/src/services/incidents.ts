import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import type { ListIncidentsQuery, ListMonitorIncidentsQuery } from "../schemas/incident.js";
import { AppError } from "../utils/errors.js";
import { getMonitor } from "./monitors.js";

export const incidentInclude = { monitor: { select: { id: true, name: true } } } as const;
export type IncidentRow = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

/**
 * Ownership is part of the query (SEC-4): an incident belongs to you if its MONITOR belongs to you.
 * Someone else's incident simply is not found.
 */
export async function listIncidents(userId: string, query: ListIncidentsQuery) {
  const rows = await prisma.incident.findMany({
    where: {
      monitor: { userId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.monitorId ? { monitorId: query.monitorId } : {}),
    },
    include: incidentInclude,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export async function listMonitorIncidents(
  userId: string,
  monitorId: string,
  query: ListMonitorIncidentsQuery,
) {
  await getMonitor(userId, monitorId); // 404 if the monitor is not yours
  return listIncidents(userId, { ...query, monitorId });
}

export async function getIncident(userId: string, id: string): Promise<IncidentRow> {
  const incident = await prisma.incident.findFirst({
    where: { id, monitor: { userId } },
    include: incidentInclude,
  });
  if (!incident) throw new AppError(404, "NOT_FOUND", "Incident not found.");
  return incident;
}
