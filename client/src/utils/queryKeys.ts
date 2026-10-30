// One place for query keys, so a typo cannot create a second, separate cache entry.
// Phase 6 adds monitors, checks and incidents here.
export const queryKeys = {
  me: ["auth", "me"] as const,
  dashboardSummary: ["dashboard", "summary"] as const,
};
