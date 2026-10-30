import type { Monitor } from "../types/api";

/** The five states a person sees. "paused" wins over the stored status: it is a flag, not a status. */
export type DisplayStatus = "healthy" | "degraded" | "down" | "paused" | "pending";

export interface StatusMeta {
  label: string;
  description: string;
  /** Tailwind classes for the badge (colour tokens come from index.css) */
  badge: string;
  dot: string;
}

export const STATUS_META: Record<DisplayStatus, StatusMeta> = {
  healthy: {
    label: "Healthy",
    description: "Responding normally",
    badge: "bg-healthy/10 text-healthy ring-healthy/25",
    dot: "bg-healthy",
  },
  degraded: {
    label: "Degraded",
    description: "Responding, but slower than the threshold",
    badge: "bg-degraded/10 text-degraded ring-degraded/25",
    dot: "bg-degraded",
  },
  down: {
    label: "Down",
    description: "Not responding correctly",
    badge: "bg-down/10 text-down ring-down/25",
    dot: "bg-down",
  },
  paused: {
    label: "Paused",
    description: "Checks are paused",
    badge: "bg-paused/10 text-paused ring-paused/25",
    dot: "bg-paused",
  },
  pending: {
    label: "Pending",
    description: "Waiting for first check",
    badge: "bg-pending/10 text-pending ring-pending/25",
    dot: "bg-pending",
  },
};

export function getDisplayStatus(monitor: Pick<Monitor, "status" | "isPaused">): DisplayStatus {
  if (monitor.isPaused) return "paused";
  switch (monitor.status) {
    case "HEALTHY":
      return "healthy";
    case "DEGRADED":
      return "degraded";
    case "DOWN":
      return "down";
    case "PENDING":
      return "pending";
  }
}
