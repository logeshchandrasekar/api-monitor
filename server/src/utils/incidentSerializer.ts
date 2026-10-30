import type { IncidentRow } from "../services/incidents.js";
import { secondsBetween } from "../services/incidentLifecycle.js";

/**
 * Public shape of an incident. For an open incident `durationSec` is the live value (so far)
 * and `ongoing` is true; for a resolved one it is the stored final duration.
 */
export function serializeIncident(i: IncidentRow, now = new Date()) {
  return {
    id: i.id,
    monitorId: i.monitorId,
    monitorName: i.monitor.name,
    type: i.type,
    status: i.status,
    ongoing: i.status === "OPEN",
    reason: i.reason,
    failureType: i.failureType,
    failedChecks: i.failedChecks,
    startedAt: i.startedAt,
    resolvedAt: i.resolvedAt,
    resolution: i.resolution,
    durationSec: i.durationSec ?? secondsBetween(i.startedAt, i.resolvedAt ?? now),
  };
}
