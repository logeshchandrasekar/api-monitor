import { Activity, Plus } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { IncidentRow } from "../components/IncidentRow";
import { LoadMore } from "../components/LoadMore";
import { MonitorList, MonitorListSkeleton } from "../components/monitors/MonitorList";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { StatusBanner } from "../components/StatusBanner";
import { ButtonLink } from "../components/ui/ButtonLink";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useMonitorList } from "../hooks/useMonitors";
import { useNow } from "../hooks/useNow";
import { formatNumber, formatPercent } from "../utils/format";
import { formatMs } from "../utils/time";

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
        description="Everything you monitor, refreshed every 30 seconds."
        actions={addButton}
      />

      {/* Is everything fine? One banner, then the three numbers that matter */}
      {summary.isPending && (
        <div aria-busy="true" className="space-y-4">
          <Skeleton className="h-19 rounded-xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-16" />
              </Card>
            ))}
          </div>
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
        <div className="space-y-4">
          {s.monitors.total > 0 && <StatusBanner monitors={s.monitors} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Uptime (24 h)"
              value={formatPercent(s.uptime24h)}
              hint={s.checks24h > 0 ? `${formatNumber(s.checks24h)} checks` : "No checks yet"}
            />
            <StatCard
              label="Avg response (24 h)"
              value={formatMs(s.avgResponseMs24h)}
              hint={s.avgResponseMs24h === null ? "No answers yet" : "Answered checks only"}
            />
            <StatCard
              label="Active incidents"
              value={s.activeIncidentCount}
              tone={s.activeIncidentCount > 0 ? "down" : undefined}
              hint={s.activeIncidentCount === 0 ? "Nothing is wrong right now" : undefined}
            />
          </div>
        </div>
      )}

      {/* Ongoing incidents */}
      {s && s.activeIncidents.length > 0 && (
        <Card
          className="mt-6"
          title="Ongoing incidents"
          action={
            <Link to="/incidents" className="text-sm font-medium text-brand-ink hover:underline">
              View all
            </Link>
          }
        >
          <ul className="-mx-5 -mb-5 -mt-5 divide-y divide-line">
            {" "}
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
