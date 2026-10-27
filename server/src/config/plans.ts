import { env } from "./env.js";

export type PlanName = "FREE" | "PRO" | "TEAM";

export interface PlanLimits {
  maxMonitors: number;
  minIntervalSec: number;
  retentionDays: number;
  maxTimeoutMs: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  FREE: { maxMonitors: 5, minIntervalSec: 300, retentionDays: 7, maxTimeoutMs: 30_000 },
  PRO: { maxMonitors: 50, minIntervalSec: 60, retentionDays: 30, maxTimeoutMs: 30_000 },
  TEAM: { maxMonitors: 50, minIntervalSec: 60, retentionDays: 30, maxTimeoutMs: 30_000 }, // until Teams exist
};

export const STANDARD_INTERVALS_SEC = [60, 300, 600, 900, 1800, 3600, 21_600, 43_200, 86_400];

// Handy for watching state changes locally. Never offered in production.
export const DEV_INTERVALS_SEC = [10, 30];

export function allowedIntervals(plan: PlanName, nodeEnv: string = env.NODE_ENV): number[] {
  const standard = STANDARD_INTERVALS_SEC.filter((s) => s >= PLAN_LIMITS[plan].minIntervalSec);
  return nodeEnv === "production" ? standard : [...DEV_INTERVALS_SEC, ...standard];
}

export function formatInterval(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${sec / 60} min`;
  return `${sec / 3600} h`;
}
