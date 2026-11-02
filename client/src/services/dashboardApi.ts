import type { DashboardSummary } from "../types/api";
import { api } from "./api";

export const dashboardApi = {
  getSummary: (signal?: AbortSignal) => api<DashboardSummary>("/dashboard/summary", { signal }),
};
