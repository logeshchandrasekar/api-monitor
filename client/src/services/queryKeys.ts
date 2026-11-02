/** One place for every React Query key. Phase 6 adds monitors, checks and incidents here. */
export const queryKeys = {
  /** The first segment "auth" is what AuthProvider keeps when it clears a user's cached data. */
  me: ["auth", "me"] as const,
  dashboardSummary: ["dashboard", "summary"] as const,
};
