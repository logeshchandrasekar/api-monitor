export const APP_NAME = "API Monitor";

/** Same-origin API prefix. In dev, Vite proxies it to Express; in production Vercel rewrites it (Phase 10). */
export const API_BASE = "/api";

/** Must match the key in the inline script in index.html. */
export const THEME_STORAGE_KEY = "am-theme";

/** UX-1 polling intervals. React Query pauses interval polling while the tab is hidden. */
export const POLL_DASHBOARD_MS = 30_000;
export const POLL_DETAIL_MS = 15_000;
