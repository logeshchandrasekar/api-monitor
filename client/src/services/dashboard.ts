import type { DashboardSummary } from "../types/api";
import { api } from "./api";

export function getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  return api.get<DashboardSummary>("/dashboard/summary", { signal });
}
