import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { POLL_DASHBOARD_MS, POLL_DETAIL_MS } from "../config";
import { monitorsApi } from "../services/monitorsApi";
import { queryKeys } from "../services/queryKeys";
import type { IncidentStatus, StatsRange } from "../types/api";

/** "" is every monitor; otherwise PENDING | HEALTHY | DEGRADED | DOWN | PAUSED. */
export type MonitorFilter = "" | "PENDING" | "HEALTHY" | "DEGRADED" | "DOWN" | "PAUSED";

/** The monitor list, 20 at a time ("Load more"). Polls every 30 s; React Query pauses polling while the tab is hidden. */
export function useMonitorList(status: MonitorFilter = "") {
  return useInfiniteQuery({
    queryKey: queryKeys.monitorList(status),
    queryFn: ({ pageParam, signal }) =>
      monitorsApi.list({ status: status || undefined, cursor: pageParam, limit: 20 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: POLL_DASHBOARD_MS,
  });
}

/** Up to 100 monitors for a "pick a monitor" dropdown. Not polled. */
export function useMonitorOptions() {
  return useQuery({
    queryKey: queryKeys.monitorOptions,
    queryFn: ({ signal }) => monitorsApi.list({ limit: 100 }, signal).then((p) => p.items),
    staleTime: 60_000,
  });
}

/** One monitor with its (masked) headers and body. Polls every 15 s (UX-1). */
export function useMonitor(id: string) {
  return useQuery({
    queryKey: queryKeys.monitor(id),
    queryFn: ({ signal }) => monitorsApi.get(id, signal),
    refetchInterval: POLL_DETAIL_MS,
  });
}

export function useMonitorChecks(id: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.monitorChecks(id),
    queryFn: ({ pageParam, signal }) =>
      monitorsApi.checks(id, { cursor: pageParam, limit: 20 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: POLL_DETAIL_MS,
  });
}

export function useMonitorIncidents(id: string, status?: IncidentStatus) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.monitorIncidents(id), status ?? "all"],
    queryFn: ({ pageParam, signal }) =>
      monitorsApi.incidents(id, { cursor: pageParam, limit: 10, status }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: POLL_DETAIL_MS,
  });
}

export function useMonitorStats(id: string, range: StatsRange) {
  return useQuery({
    queryKey: queryKeys.monitorStats(id, range),
    queryFn: ({ signal }) => monitorsApi.stats(id, range, signal),
    refetchInterval: POLL_DETAIL_MS,
  });
}
