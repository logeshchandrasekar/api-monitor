import { Activity, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadMore } from "../components/LoadMore";
import { MonitorList, MonitorListSkeleton } from "../components/monitors/MonitorList";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { ButtonLink } from "../components/ui/ButtonLink";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useLimits } from "../hooks/useLimits";
import { useMonitorList, useMonitorTags, type MonitorFilter } from "../hooks/useMonitors";
import { useNow } from "../hooks/useNow";
import {
  DEFAULT_VIEW,
  SORT_OPTIONS,
  hasActiveFilters,
  parseView,
  viewToParams,
  viewToQuery,
  type MonitorListView,
  type SortId,
} from "../utils/monitorListView";

const FILTERS: { value: MonitorFilter; label: string }[] = [
  { value: "", label: "All monitors" },
  { value: "HEALTHY", label: "Healthy" },
  { value: "DEGRADED", label: "Degraded" },
  { value: "DOWN", label: "Down" },
  { value: "PAUSED", label: "Paused" },
  { value: "PENDING", label: "Pending" },
];

export function MonitorsPage() {
  useDocumentTitle("Monitors");
  const now = useNow();
  const { data: limits } = useLimits();

  // The address bar is the source of truth, so a refresh, the back button and a shared link all keep the filters
  const [params, setParams] = useSearchParams();
  const view = parseView(params);
  const change = (patch: Partial<MonitorListView>) =>
    setParams(viewToParams({ ...view, ...patch }), { replace: true });

  // The search box answers every key at once and asks the server once per pause
  const [searchText, setSearchText] = useState(view.q);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debouncedSearch !== view.q) {
      setParams(viewToParams({ ...view, q: debouncedSearch }), { replace: true });
    }
    // Only the pause in typing should write to the address bar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const list = useMonitorList(viewToQuery(view));
  const tags = useMonitorTags().data ?? [];
  const monitors = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = hasActiveFilters(view);

  function clearFilters() {
    setSearchText("");
    setParams(viewToParams({ ...DEFAULT_VIEW, sort: view.sort }), { replace: true });
  }

  const addButton = (
    <ButtonLink to="/monitors/new">
      <Plus className="size-4" aria-hidden="true" />
      Add monitor
    </ButtonLink>
  );

  return (
    <>
      <PageHeader
        title="Monitors"
        description={
          limits
            ? `${limits.monitorCount} of ${limits.maxMonitors} monitors used on the ${limits.plan} plan`
            : undefined
        }
        actions={addButton}
      />

      <search aria-label="Find monitors" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="relative col-span-2 lg:col-span-1">
          <Input
            label="Search"
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Name, URL or tag"
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            className="pl-9"
          />
          <Search
            className="pointer-events-none absolute bottom-3 left-3 size-4 text-fg-muted"
            aria-hidden="true"
          />
        </div>
        <Select
          label="Show"
          value={view.status}
          onChange={(e) => change({ status: e.target.value as MonitorFilter })}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        {(tags.length > 0 || view.tag) && (
          <Select label="Tag" value={view.tag} onChange={(e) => change({ tag: e.target.value })}>
            <option value="">All tags</option>
            {/* A tag in the address bar that no monitor has any more still shows, so it can be seen and cleared */}
            {view.tag && !tags.some((t) => t.name === view.tag) && (
              <option value={view.tag}>{view.tag}</option>
            )}
            {tags.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </Select>
        )}
        <Select
          label="Sort by"
          value={view.sort}
          onChange={(e) => change({ sort: e.target.value as SortId })}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </search>

      {filtered && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-fg-muted">
            {list.data
              ? monitors.length === 0
                ? "No monitors match."
                : `${monitors.length}${list.hasNextPage ? " or more" : ""} ${monitors.length === 1 ? "monitor matches" : "monitors match"}.`
              : "Searching…"}
          </p>
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X className="size-4" aria-hidden="true" />
            Clear filters
          </Button>
        </div>
      )}

      {list.isPending && <MonitorListSkeleton />}
      {list.isError && (
        <ErrorState
          title="Could not load your monitors"
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      )}
      {list.data &&
        monitors.length === 0 &&
        (!filtered ? (
          <EmptyState
            icon={Activity}
            title="No monitors yet"
            description="Add the first API endpoint you want to watch."
            action={addButton}
          />
        ) : (
          <EmptyState
            title="No monitors match"
            description="Try a different search, or clear the filters to see everything."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ))}
      {monitors.length > 0 && (
        <>
          <MonitorList monitors={monitors} now={now} />
          <LoadMore
            hasNextPage={list.hasNextPage}
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}