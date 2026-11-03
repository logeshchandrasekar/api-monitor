import { Activity, Plus } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadMore } from "../components/LoadMore";
import { MonitorList, MonitorListSkeleton } from "../components/monitors/MonitorList";
import { PageHeader } from "../components/PageHeader";
import { ButtonLink } from "../components/ui/ButtonLink";
import { Select } from "../components/ui/Select";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useLimits } from "../hooks/useLimits";
import { useMonitorList, type MonitorFilter } from "../hooks/useMonitors";
import { useNow } from "../hooks/useNow";

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
  const [filter, setFilter] = useState<MonitorFilter>("");
  const { data: limits } = useLimits();
  const list = useMonitorList(filter);
  const monitors = list.data?.pages.flatMap((p) => p.items) ?? [];

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

      <div className="mb-4 w-full sm:w-56">
        <Select
          label="Show"
          value={filter}
          onChange={(e) => setFilter(e.target.value as MonitorFilter)}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>

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
        (filter === "" ? (
          <EmptyState
            icon={Activity}
            title="No monitors yet"
            description="Add the first API endpoint you want to watch."
            action={addButton}
          />
        ) : (
          <EmptyState title="No monitors match" description="Try another filter." />
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
