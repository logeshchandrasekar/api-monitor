import { CircleCheck } from "lucide-react";
import { useMonitorIncidents } from "../../hooks/useMonitors";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { IncidentRow } from "../IncidentRow";
import { LoadMore } from "../LoadMore";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/** This monitor's incidents with duration and reason; each row links to the incident page. */
export function IncidentHistory({ monitorId, now }: { monitorId: string; now: number }) {
  const q = useMonitorIncidents(monitorId);
  const incidents = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card title="Incident history">
      {q.isPending && (
        <div aria-busy="true" className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {q.isError && (
        <ErrorState
          title="Could not load incidents"
          error={q.error}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      )}

      {q.data && incidents.length === 0 && (
        <EmptyState
          icon={CircleCheck}
          title="No incidents"
          description="An incident is recorded when this monitor fails or turns slow several checks in a row."
        />
      )}

      {incidents.length > 0 && (
        <>
          <ul className="-mx-5 -mb-5 divide-y divide-line border-t border-line">
            {incidents.map((i) => (
              <IncidentRow key={i.id} incident={i} now={now} showMonitor={false} />
            ))}
          </ul>
          <div className="pb-5" />
          <LoadMore
            hasNextPage={q.hasNextPage}
            loading={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          />
        </>
      )}
    </Card>
  );
}
