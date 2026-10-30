import { emitIncidentEvents, type IncidentEvent } from "../lib/incidentEvents.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import type { CheckResult } from "./checkRunner.js";
import { lockMonitor, openKeyOf, secondsBetween } from "./incidentLifecycle.js";
import { assertNever, evaluate, type IncidentType } from "./stateMachine.js";

/** What a check carries from the moment the scheduler claimed it: which monitor, and which "version" of it. */
export type Claim = { id: string; stateEpoch: number };

export type ApplyResult = { applied: boolean; events: IncidentEvent[] };

function reasonFor(
  type: IncidentType,
  ctx: {
    failStreak: number;
    slowStreak: number;
    responseThresholdMs: number;
    errorMessage: string | null;
  },
): string {
  if (type === "DOWN") {
    const base = `${ctx.failStreak} failed checks in a row.`;
    return ctx.errorMessage ? `${base} Last error: ${ctx.errorMessage}` : base;
  }
  return ctx.slowStreak <= 1
    ? `The service is answering again but slowly: response time is above ${ctx.responseThresholdMs} ms.`
    : `Response time stayed above ${ctx.responseThresholdMs} ms for ${ctx.slowStreak} checks in a row.`;
}

/**
 * Stores one SCHEDULED check result and runs the state machine, in ONE transaction:
 * check row, monitor counters/status/last* columns, incidents. Events are emitted only after the commit.
 *
 * Returns { applied: false } and stores NOTHING when the result is stale: the monitor was deleted,
 * paused, or edited/resumed (epoch changed) while the check was running. Such a result describes
 * something that no longer exists and must not open incidents or move the new state.
 *
 * Manual checks never come through here (ENG-4).
 */
export async function applyCheckResult(claim: Claim, result: CheckResult): Promise<ApplyResult> {
  const emitted = await prisma.$transaction(async (tx) => {
    // Serialise with every other writer of this monitor's state (other workers, pause, edit)
    await lockMonitor(tx, claim.id);
    const m = await tx.monitor.findUnique({ where: { id: claim.id } });
    if (!m || m.isPaused || m.stateEpoch !== claim.stateEpoch) return null;

    const { next, events } = evaluate(m, result);

    await tx.check.create({
      data: {
        monitorId: m.id,
        trigger: "SCHEDULED",
        outcome: result.outcome,
        failureType: result.failureType,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        errorMessage: result.errorMessage,
        checkedAt: result.checkedAt,
      },
    });

    const out: IncidentEvent[] = [];
    for (const event of events) {
      switch (event.kind) {
        case "CLOSE": {
          const open = await tx.incident.findUnique({
            where: { openKey: openKeyOf(m.id, event.type) },
          });
          if (!open) {
            // The state said "incident open" but there is none (data from before Phase 4, or a manual edit). Do not crash the check.
            logger.warn({ monitorId: m.id, type: event.type }, "no open incident to close");
            break;
          }
          const closed = await tx.incident.update({
            where: { id: open.id },
            data: {
              status: "RESOLVED",
              resolution: "RECOVERED",
              resolvedAt: result.checkedAt,
              durationSec: secondsBetween(open.startedAt, result.checkedAt),
              openKey: null,
            },
          });
          out.push({ type: "INCIDENT_RESOLVED", incident: closed, escalated: event.escalated });
          break;
        }
        case "OPEN": {
          // If the unique openKey is ever violated, the transaction fails loudly instead of creating a duplicate
          const incident = await tx.incident.create({
            data: {
              monitorId: m.id,
              type: event.type,
              reason: reasonFor(event.type, {
                failStreak: next.failStreak,
                slowStreak: next.slowStreak,
                responseThresholdMs: m.responseThresholdMs,
                errorMessage: result.errorMessage,
              }),
              failureType: event.type === "DOWN" ? result.failureType : null,
              failedChecks: event.type === "DOWN" ? next.failStreak : next.slowStreak,
              startedAt: result.checkedAt,
              openKey: openKeyOf(m.id, event.type),
            },
          });
          out.push({ type: "INCIDENT_OPENED", incident });
          break;
        }
        case "COUNT":
          await tx.incident.updateMany({
            where: { openKey: openKeyOf(m.id, event.type) },
            data: { failedChecks: { increment: 1 } },
          });
          break;
        default:
          assertNever(event);
      }
    }

    await tx.monitor.update({
      where: { id: m.id },
      data: {
        status: next.status,
        failStreak: next.failStreak,
        slowStreak: next.slowStreak,
        okStreak: next.okStreak,
        lastCheckedAt: result.checkedAt,
        lastStatusCode: result.statusCode,
        lastResponseTimeMs: result.responseTimeMs,
        lastStatusChangeAt: next.status !== m.status ? result.checkedAt : m.lastStatusChangeAt,
      },
    });
    return out;
  });

  if (emitted === null) return { applied: false, events: [] };

  for (const e of emitted) {
    logger.info(
      { incidentId: e.incident.id, monitorId: e.incident.monitorId, incidentType: e.incident.type },
      e.type === "INCIDENT_OPENED" ? "incident opened" : "incident resolved",
    );
  }
  emitIncidentEvents(emitted); // only now that the transaction has committed
  return { applied: true, events: emitted };
}
