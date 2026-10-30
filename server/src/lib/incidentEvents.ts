import { EventEmitter } from "node:events";
import type { Incident } from "../generated/prisma/client.js";
import { logger } from "./logger.js";

export type IncidentEvent =
  | { type: "INCIDENT_OPENED"; incident: Incident }
  | {
      type: "INCIDENT_RESOLVED";
      incident: Incident;
      /** true when a DEGRADED incident was closed only because the monitor went DOWN: do not send a "recovered" alert */
      escalated: boolean;
    };

const bus = new EventEmitter();
bus.setMaxListeners(20);

/** Subscribe to incident events. Returns an unsubscribe function. A listener that throws or rejects never affects the check pipeline. */
export function onIncidentEvent(
  listener: (event: IncidentEvent) => void | Promise<void>,
): () => void {
  const safe = (event: IncidentEvent) => {
    try {
      const result = listener(event);
      if (result instanceof Promise) {
        result.catch((err: unknown) =>
          logger.error({ err, event: event.type }, "incident listener failed"),
        );
      }
    } catch (err) {
      logger.error({ err, event: event.type }, "incident listener failed");
    }
  };
  bus.on("incident", safe);
  return () => {
    bus.off("incident", safe);
  };
}

export function emitIncidentEvents(events: IncidentEvent[]): void {
  for (const event of events) bus.emit("incident", event);
}
