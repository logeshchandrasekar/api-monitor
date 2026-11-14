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

type StatusCounts = {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  pending: number;
  paused: number;
};

/** The one-line answer to "is everything fine?" shown in the dashboard banner. `tone` picks the colours. */
export type OverallStatus = { tone: DisplayStatus; title: string; detail: string };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Worst state wins: down, then degraded. "All systems operational" needs at least one healthy monitor and no problems. */
export function getOverallStatus(c: StatusCounts): OverallStatus {
  if (c.down > 0) {
    return {
      tone: "down",
      title: `${c.down} ${plural(c.down, "monitor is", "monitors are")} down`,
      detail:
        c.degraded > 0
          ? `${c.degraded} more ${plural(c.degraded, "is", "are")} degraded.`
          : "Open an incident below for details.",
    };
  }
  if (c.degraded > 0) {
    return {
      tone: "degraded",
      title: `${c.degraded} ${plural(c.degraded, "monitor is", "monitors are")} degraded`,
      detail: "Still responding, but slower than the threshold.",
    };
  }
  if (c.total > 0 && c.paused === c.total) {
    return { tone: "paused", title: "All monitors are paused", detail: "No checks are running." };
  }
  if (c.healthy === 0) {
    return {
      tone: "pending",
      title: "Waiting for the first checks",
      detail: "Results appear after the first scheduled check.",
    };
  }
  const extras = [
    c.paused > 0 ? `${c.paused} paused` : "",
    c.pending > 0 ? `${c.pending} waiting for a first check` : "",
  ].filter(Boolean);
  return {
    tone: "healthy",
    title: "All systems operational",
    detail:
      [
        `${c.healthy} of ${c.total} ${plural(c.total, "monitor", "monitors")} healthy`,
        ...extras,
      ].join(", ") + ".",
  };
}
