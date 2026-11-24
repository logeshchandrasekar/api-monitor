import type { MonitorFilter, MonitorListQuery } from "../hooks/useMonitors";

/** The ways to order the monitor list, as the person sees them. "newest" is the server's own order. */
export const SORT_OPTIONS = [
  { id: "newest", label: "Newest first", sort: undefined, order: undefined },
  { id: "oldest", label: "Oldest first", sort: "created", order: "asc" },
  { id: "name-asc", label: "Name, A to Z", sort: "name", order: "asc" },
  { id: "name-desc", label: "Name, Z to A", sort: "name", order: "desc" },
  { id: "status", label: "Worst status first", sort: "status", order: "asc" },
  { id: "checked", label: "Recently checked", sort: "lastChecked", order: "desc" },
  { id: "slowest", label: "Slowest first", sort: "responseTime", order: "desc" },
  { id: "fastest", label: "Fastest first", sort: "responseTime", order: "asc" },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]["id"];

/** Everything the monitor page lets you change. It lives in the address bar, so a refresh or a shared link keeps it. */
export type MonitorListView = { q: string; status: MonitorFilter; tag: string; sort: SortId };

export const DEFAULT_VIEW: MonitorListView = { q: "", status: "", tag: "", sort: "newest" };

const STATUSES: MonitorFilter[] = ["PENDING", "HEALTHY", "DEGRADED", "DOWN", "PAUSED"];

/** Reads the address bar. Anything unknown or too long falls back to the default instead of breaking the page. */
export function parseView(params: URLSearchParams): MonitorListView {
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "";
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    status: (STATUSES as string[]).includes(status) ? (status as MonitorFilter) : "",
    tag: (params.get("tag") ?? "").slice(0, 30),
    sort: SORT_OPTIONS.some((o) => o.id === sort) ? (sort as SortId) : "newest",
  };
}

/** Writes the address bar, leaving out everything that is still the default. */
export function viewToParams(view: MonitorListView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.q.trim()) params.set("q", view.q.trim());
  if (view.status) params.set("status", view.status);
  if (view.tag) params.set("tag", view.tag);
  if (view.sort !== "newest") params.set("sort", view.sort);
  return params;
}

/** What to ask the server for. "newest" sends no sort at all, which keeps the server's original fast path. */
export function viewToQuery(view: MonitorListView): MonitorListQuery {
  const option = SORT_OPTIONS.find((o) => o.id === view.sort)!;
  return {
    status: view.status,
    q: view.q.trim() || undefined,
    tag: view.tag || undefined,
    sort: option.sort,
    order: option.order,
  };
}

/** Anything that narrows the list. The sort order does not count: it hides nothing. */
export const hasActiveFilters = (view: MonitorListView) =>
  Boolean(view.q.trim() || view.status || view.tag);