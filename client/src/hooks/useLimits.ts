import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../services/queryKeys";
import { usersApi } from "../services/userApi";

/** The plan's limits and how many monitors are used. The server is the only place the plan table lives. */
export function useLimits() {
  return useQuery({
    queryKey: queryKeys.limits,
    queryFn: ({ signal }) => usersApi.getLimits(signal),
    staleTime: 60_000,
  });
}
