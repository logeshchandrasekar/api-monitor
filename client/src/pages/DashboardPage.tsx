import { Activity } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import { useAuth } from "../hooks/useAuth";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatNumber, formatPercent } from "../utils/format";
import { cn } from "../utils/ui";

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "down";
}) {
  return (
    <Card>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn("mt-1 text-3xl font-semibold tabular-nums", tone === "down" && "text-down")}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
    </Card>
  );
}

export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const { user } = useAuth();
  const summary = useDashboardSummary();
  const firstName = user?.name.trim().split(/\s+/)[0];

  let content: ReactNode;
  if (summary.isPending) {
    content = (
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-busy="true"
        aria-label="Loading summary"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-3 h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  } else if (summary.isError) {
    content = (
      <ErrorState
        title="Couldn't load your summary"
        error={summary.error}
        onRetry={() => void summary.refetch()}
      />
    );
  } else if (summary.data.monitors.total === 0) {
    content = (
      <EmptyState
        icon={Activity}
        title="No monitors yet"
        description="Once you add an API endpoint, its status, response time and incidents show up here. Creating monitors arrives in Phase 6."
      />
    );
  } else {
    const { monitors, uptime24h, checks24h, activeIncidentCount } = summary.data;
    content = (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monitors"
          value={formatNumber(monitors.total)}
          detail={`${monitors.healthy} healthy · ${monitors.degraded} degraded · ${monitors.down} down · ${monitors.paused} paused`}
        />
        <StatCard
          label="Uptime (24 h)"
          value={formatPercent(uptime24h)}
          detail={uptime24h === null ? "Waiting for the first scheduled check" : undefined}
        />
        <StatCard label="Checks (24 h)" value={formatNumber(checks24h)} />
        <StatCard
          label="Open incidents"
          value={formatNumber(activeIncidentCount)}
          tone={activeIncidentCount > 0 ? "down" : undefined}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="Your APIs at a glance."
      />
      {content}
    </>
  );
}
