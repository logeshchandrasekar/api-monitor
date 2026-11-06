/** One place for every React Query key. Phase 6 adds monitors, checks and incidents here. */
export const queryKeys = {
  /** The first segment "auth" is what AuthProvider keeps when it clears a user's cached data. */
  me: ["auth", "me"] as const,
  dashboardSummary: ["dashboard", "summary"] as const,

  limits: ["users", "limits"] as const,

  /** Everything under "monitors" is dropped by one invalidateQueries({ queryKey: queryKeys.monitors }). */
  monitors: ["monitors"] as const,
  monitorList: (status: string) => ["monitors", "list", status] as const,
  monitorOptions: ["monitors", "options"] as const,
  monitor: (id: string) => ["monitors", "detail", id] as const,
  monitorChecks: (id: string) => ["monitors", "checks", id] as const,
  monitorIncidents: (id: string) => ["monitors", "incidents", id] as const,
  monitorStats: (id: string, range: string) => ["monitors", "stats", id, range] as const,
  monitorAnalytics: (id: string, range: string) => ["monitors", "analytics", id, range] as const,

  incidents: ["incidents"] as const,
  incidentList: (status: string, monitorId: string) =>
    ["incidents", "list", status, monitorId] as const,
  incident: (id: string) => ["incidents", "detail", id] as const,
};
