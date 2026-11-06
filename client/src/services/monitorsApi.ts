import type {
  Check,
  Incident,
  IncidentStatus,
  MonitorDetail,
  MonitorInput,
  MonitorAnalytics,
  MonitorListItem,
  MonitorStats,
  Paginated,
  StatsRange,
} from "../types/api";
import { api } from "./api";

type Page = { cursor?: string; limit?: number };

export const monitorsApi = {
  /** status: PENDING | HEALTHY | DEGRADED | DOWN | PAUSED, or empty for all. */
  list: (query: Page & { status?: string }, signal?: AbortSignal) =>
    api<Paginated<MonitorListItem>>("/monitors", { query, signal }),

  get: (id: string, signal?: AbortSignal) =>
    api<{ monitor: MonitorDetail }>(`/monitors/${id}`, { signal }).then((r) => r.monitor),

  create: (input: MonitorInput) =>
    api<{ monitor: MonitorDetail }>("/monitors", { method: "POST", body: input }).then(
      (r) => r.monitor,
    ),

  update: (id: string, input: MonitorInput) =>
    api<{ monitor: MonitorDetail }>(`/monitors/${id}`, { method: "PATCH", body: input }).then(
      (r) => r.monitor,
    ),

  remove: (id: string) => api(`/monitors/${id}`, { method: "DELETE" }),

  pause: (id: string) =>
    api<{ monitor: MonitorDetail }>(`/monitors/${id}/pause`, { method: "POST" }).then(
      (r) => r.monitor,
    ),

  resume: (id: string) =>
    api<{ monitor: MonitorDetail }>(`/monitors/${id}/resume`, { method: "POST" }).then(
      (r) => r.monitor,
    ),

  duplicate: (id: string) =>
    api<{ monitor: MonitorDetail }>(`/monitors/${id}/duplicate`, { method: "POST" }).then(
      (r) => r.monitor,
    ),

  /** "Check now": a MANUAL check. It never changes the monitor's status or opens an incident. */
  checkNow: (id: string) =>
    api<{ check: Check }>(`/monitors/${id}/check`, { method: "POST" }).then((r) => r.check),

  checks: (id: string, query: Page, signal?: AbortSignal) =>
    api<Paginated<Check>>(`/monitors/${id}/checks`, { query, signal }),

  incidents: (id: string, query: Page & { status?: IncidentStatus }, signal?: AbortSignal) =>
    api<Paginated<Incident>>(`/monitors/${id}/incidents`, { query, signal }),

  stats: (id: string, range: StatsRange, signal?: AbortSignal) =>
    api<{ stats: MonitorStats }>(`/monitors/${id}/stats`, { query: { range }, signal }).then(
      (r) => r.stats,
    ),

  /** Statistics, chart series and incident periods in one request (Phase 7). */
  analytics: (id: string, range: StatsRange, signal?: AbortSignal) =>
    api<{ analytics: MonitorAnalytics }>(`/monitors/${id}/analytics`, {
      query: { range },
      signal,
    }).then((r) => r.analytics),
};
