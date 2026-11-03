import type { Incident, IncidentStatus, Paginated } from "../types/api";
import { api } from "./api";

export type IncidentFilters = { status?: IncidentStatus; monitorId?: string };

export const incidentsApi = {
  list: (query: IncidentFilters & { cursor?: string; limit?: number }, signal?: AbortSignal) =>
    api<Paginated<Incident>>("/incidents", { query, signal }),

  get: (id: string, signal?: AbortSignal) =>
    api<{ incident: Incident }>(`/incidents/${id}`, { signal }).then((r) => r.incident),
};
