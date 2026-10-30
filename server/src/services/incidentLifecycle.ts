import type { Incident, Prisma } from "../generated/prisma/client.js";
import type { IncidentType } from "./stateMachine.js";

export type Tx = Prisma.TransactionClient;

/** The value stored in Incident.openKey while an incident is OPEN (unique: one open incident per monitor and type). */
export const openKeyOf = (monitorId: string, type: IncidentType) => `${monitorId}:${type}`;

export const secondsBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

/**
 * Takes the monitor's row lock for the rest of the transaction. Everything that changes a monitor's
 * state (a check result, a pause, an edit) starts with this, so they can never interleave.
 */
export async function lockMonitor(tx: Tx, monitorId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM monitors WHERE id = ${monitorId} FOR UPDATE`;
}

/** Resolves every open incident of a monitor because it was paused or its configuration changed (ENG-5). */
export async function resolveOpenIncidents(
  tx: Tx,
  monitorId: string,
  resolution: "PAUSED" | "CONFIG_CHANGED",
  at: Date,
): Promise<Incident[]> {
  await lockMonitor(tx, monitorId);
  const open = await tx.incident.findMany({ where: { monitorId, status: "OPEN" } });
  const resolved: Incident[] = [];
  for (const incident of open) {
    resolved.push(
      await tx.incident.update({
        where: { id: incident.id },
        data: {
          status: "RESOLVED",
          resolution,
          resolvedAt: at,
          durationSec: secondsBetween(incident.startedAt, at),
          openKey: null,
        },
      }),
    );
  }
  return resolved;
}
