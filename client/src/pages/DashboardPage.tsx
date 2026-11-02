import { Activity } from "lucide-react";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}

/** Phase 5 placeholder: four real numbers prove the data layer. Phase 6 replaces this page. */
export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const { data, isPending, isError, error, refetch, isFetching } = useDashboardSummary();

  return (
    <>
      <PageHeader title="Dashboard" description="The full dashboard arrives in Phase 6." />

      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          title="Could not load the dashboard"
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}

      {data &&
        (data.monitors.total === 0 ? (
          <EmptyState
            icon={Activity}
            title="No monitors yet"
            description="Creating monitors is the first thing Phase 6 adds. Your account is working."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Monitors" value={data.monitors.total} />
            <Stat label="Down" value={data.monitors.down} />
            <Stat label="Active incidents" value={data.activeIncidentCount} />
            <Stat
              label="Uptime (24 h)"
              value={data.uptime24h === null ? "—" : `${data.uptime24h}%`}
            />
          </div>
        ))}
    </>
  );
}
