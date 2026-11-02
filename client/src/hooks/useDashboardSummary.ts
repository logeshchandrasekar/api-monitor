import { useQuery } from "@tanstack/react-query";
import { POLL_DASHBOARD_MS } from "../config";
import { dashboardApi } from "../services/dashboardApi";
import { queryKeys } from "../services/queryKeys";

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboardSummary,
    queryFn: ({ signal }) => dashboardApi.getSummary(signal),
    refetchInterval: POLL_DASHBOARD_MS, // UX-1: every 30 s; React Query pauses it while the tab is hidden
  });
}
