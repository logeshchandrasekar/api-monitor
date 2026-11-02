import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Retry once for network and 5xx problems, never for 4xx: repeating a 404 or a 403 cannot change the answer
      retry: (failureCount, error) =>
        failureCount < 1 &&
        !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
    // A write that failed is never repeated behind the person's back
    mutations: { retry: 0 },
  },
});
