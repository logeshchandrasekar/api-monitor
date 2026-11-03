import { Activity, Plus } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { IncidentRow } from "../components/IncidentRow";
import { LoadMore } from "../components/LoadMore";
import { MonitorList, MonitorListSkeleton } from "../components/monitors/MonitorList";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { ButtonLink } from "../components/ui/ButtonLink";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useMonitorList } from "../hooks/useMonitors";
import { useNow } from "../hooks/useNow";
import { formatPercent } from "../utils/format";

export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const now = useNow();
  const summary = useDashboardSummary();
  const list = useMonitorList();
  const monitors = list.data?.pages.flatMap((p) => p.items) ?? [];
  const s = summary.data;

  const addButton = (
    <ButtonLink to="/monitors/new">
      <Plus className="size-4" aria-hidden="true" />
      Add monitor
    </ButtonLink>
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything you monitor, updated every 30 seconds."
        actions={addButton}
      />

      {/* Summary cards */}
      {summary.isPending && (
        <div aria-busy="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-3 h-8 w-12" />
            </Card>
          ))}
        </div>
      )}
      {summary.isError && (
        <ErrorState
          title="Could not load the summary"
          error={summary.error}
          onRetry={() => void summary.refetch()}
          retrying={summary.isFetching}
        />
      )}
      {s && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Monitors"
            value={s.monitors.total}
            hint={`${s.monitors.paused} paused, ${s.monitors.pending} pending`}
          />
          <StatCard
            label="Healthy"
            value={s.monitors.healthy}
            tone={s.monitors.healthy > 0 ? "healthy" : undefined}
          />
          <StatCard
            label="Degraded"
            value={s.monitors.degraded}
            tone={s.monitors.degraded > 0 ? "degraded" : undefined}
          />
          <StatCard
            label="Down"
            value={s.monitors.down}
            tone={s.monitors.down > 0 ? "down" : undefined}
          />
          <StatCard
            label="Uptime (24 h)"
            value={formatPercent(s.uptime24h)}
            hint={s.checks24h > 0 ? `${s.checks24h} checks` : "No checks yet"}
          />
          <StatCard
            label="Active incidents"
            value={s.activeIncidentCount}
            tone={s.activeIncidentCount > 0 ? "down" : undefined}
          />
        </div>
      )}

      {/* Ongoing incidents */}
      {s && s.activeIncidents.length > 0 && (
        <Card
          className="mt-6"
          title="Ongoing incidents"
          action={
            <Link to="/incidents" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          }
        >
          <ul className="-mx-5 -mb-5 divide-y divide-line border-t border-line">
            {s.activeIncidents.slice(0, 5).map((i) => (
              <IncidentRow key={i.id} incident={i} now={now} />
            ))}
          </ul>
          <div className="pb-5" />
        </Card>
      )}

      {/* Monitors */}
      <h2 className="mb-3 mt-8 text-base font-semibold">Monitors</h2>
      {list.isPending && <MonitorListSkeleton />}
      {list.isError && (
        <ErrorState
          title="Could not load your monitors"
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      )}
      {list.data && monitors.length === 0 && (
        <EmptyState
          icon={Activity}
          title="No monitors yet"
          description="Add the first API endpoint you want to watch. It is checked automatically and you are told when it fails."
          action={addButton}
        />
      )}
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
