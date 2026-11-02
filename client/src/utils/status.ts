import type { Monitor, MonitorStatus } from "../types/api";

/** The five states the UI shows (UX-1). The server has four statuses plus the isPaused flag. */
export type DisplayStatus = "healthy" | "degraded" | "down" | "paused" | "pending";

export const DISPLAY_STATUSES: DisplayStatus[] = [
  "healthy",
  "degraded",
  "down",
  "paused",
  "pending",
];

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  paused: "Paused",
  pending: "Pending",
};

export const STATUS_HINT: Record<DisplayStatus, string> = {
  healthy: "Responding normally",
  degraded: "Responding, but slower than the threshold",
  down: "Not responding or returning errors",
  paused: "Checks are paused",
  pending: "Waiting for first check",
};

/** Label and description displayed for each monitor status. */
export const STATUS_META: Record<DisplayStatus, { label: string; description: string }> = {
  healthy: {
    label: STATUS_LABEL.healthy,
    description: STATUS_HINT.healthy,
  },
  degraded: {
    label: STATUS_LABEL.degraded,
    description: STATUS_HINT.degraded,
  },
  down: {
    label: STATUS_LABEL.down,
    description: STATUS_HINT.down,
  },
  paused: {
    label: STATUS_LABEL.paused,
    description: STATUS_HINT.paused,
  },
  pending: {
    label: STATUS_LABEL.pending,
    description: STATUS_HINT.pending,
  },
};

/** Paused wins over everything: a paused monitor keeps its last status on the server but must show as paused. */
export function getDisplayStatus(monitor: Pick<Monitor, "status" | "isPaused">): DisplayStatus {
  if (monitor.isPaused) return "paused";
  return monitor.status.toLowerCase() as Lowercase<MonitorStatus>;
}
