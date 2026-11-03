import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { IncidentRow } from "../components/IncidentRow";
import { LoadMore } from "../components/LoadMore";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/ui/Select";
import { Skeleton } from "../components/ui/Skeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useIncidentList } from "../hooks/useIncidents";
import { useMonitorOptions } from "../hooks/useMonitors";
import { useNow } from "../hooks/useNow";
import type { IncidentStatus } from "../types/api";

export function IncidentsPage() {
  useDocumentTitle("Incidents");
  const now = useNow();
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [monitorId, setMonitorId] = useState("");
  const monitors = useMonitorOptions();
  const list = useIncidentList({ status: status || undefined, monitorId: monitorId || undefined });
  const incidents = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = status !== "" || monitorId !== "";

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Every outage and slowdown across your monitors, newest first."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as IncidentStatus | "")}
        >
          <option value="">All</option>
          <option value="OPEN">Ongoing</option>
          <option value="RESOLVED">Resolved</option>
        </Select>
        <Select label="Monitor" value={monitorId} onChange={(e) => setMonitorId(e.target.value)}>
          <option value="">All monitors</option>
          {monitors.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>

      {list.isPending && (
        <div aria-busy="true" className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}
      {list.isError && (
        <ErrorState
          title="Could not load incidents"
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      )}
      {list.data && incidents.length === 0 && (
        <EmptyState
          icon={CircleCheck}
          title={filtered ? "No incidents match" : "No incidents"}
          description={
            filtered
              ? "Try other filters."
              : "Nothing has failed. Incidents appear here when a monitor goes down or turns slow."
          }
        />
      )}
      {incidents.length > 0 && (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            {incidents.map((i) => (
              <IncidentRow key={i.id} incident={i} now={now} />
            ))}
          </ul>
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
