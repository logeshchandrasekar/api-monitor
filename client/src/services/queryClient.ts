import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false; // a 4xx will not fix itself
        return failureCount < 1; // one retry for network blips and 5xx
      },
    },
    mutations: { retry: false },
  },
});
