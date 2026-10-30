import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "../services/dashboard";
import { queryKeys } from "../utils/queryKeys";

/** UX-1: the dashboard polls every 30 s. TanStack Query pauses the interval while the tab is hidden. */
export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboardSummary,
    queryFn: ({ signal }) => getDashboardSummary(signal),
    refetchInterval: 30_000,
  });
}
