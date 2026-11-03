import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { POLL_DASHBOARD_MS } from "../config";
import { incidentsApi, type IncidentFilters } from "../services/incidentsApi";
import { queryKeys } from "../services/queryKeys";

export function useIncidentList(filters: IncidentFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.incidentList(filters.status ?? "", filters.monitorId ?? ""),
    queryFn: ({ pageParam, signal }) =>
      incidentsApi.list({ ...filters, cursor: pageParam, limit: 20 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: POLL_DASHBOARD_MS, // ongoing durations keep moving
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: queryKeys.incident(id),
    queryFn: ({ signal }) => incidentsApi.get(id, signal),
    refetchInterval: POLL_DASHBOARD_MS,
  });
}
