import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ChecksTable } from "../components/monitors/ChecksTable";
import { IncidentHistory } from "../components/monitors/IncidentHistory";
import { MonitorActions } from "../components/monitors/MonitorActions";
import { AnalyticsSection } from "../components/monitors/AnalyticsSection";
import { StatusBadge } from "../components/StatusBadge";
import { ButtonLink } from "../components/ui/ButtonLink";
import { Card } from "../components/ui/Card";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useMonitor, useMonitorStats } from "../hooks/useMonitors";
import { useNow } from "../hooks/useNow";
import { ApiError } from "../services/api";
import { formatPercent } from "../utils/format";
import { getDisplayStatus } from "../utils/status";
import { formatDateTime, formatInterval, formatMs, formatRelative } from "../utils/time";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

export function MonitorDetailPage() {
  const { id = "" } = useParams();
  const now = useNow();
  const monitor = useMonitor(id);
  const uptime = useMonitorStats(id, "24h"); // shares its cache entry with the statistics card while it shows 24 h
  useDocumentTitle(monitor.data?.name ?? "Monitor");

  if (monitor.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-36" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (monitor.isError) {
    const notFound = monitor.error instanceof ApiError && monitor.error.status === 404;
    return (
      <ErrorState
        className="mt-6"
        title={notFound ? "Monitor not found" : "Could not load the monitor"}
        error={monitor.error}
        onRetry={notFound ? undefined : () => void monitor.refetch()}
        retrying={monitor.isFetching}
      />
    );
  }

  const m = monitor.data;
  const display = getDisplayStatus(m);
  const waiting = display === "pending";

  return (
    <>
      <Link
        to="/monitors"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Monitors
      </Link>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{m.name}</h1>
              <StatusBadge status={display} />
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
              <span className="font-medium">{m.method}</span>
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-w-0 items-center gap-1 hover:underline"
              >
                <span className="truncate">{m.url}</span>
                <ExternalLink className="size-3.5 shrink-0" aria-label="opens in a new tab" />
              </a>
            </p>
            {display === "healthy" && m.failStreak > 0 && (
              <p className="mt-2 text-sm text-degraded-ink">
                {m.failStreak} failed {m.failStreak === 1 ? "check" : "checks"} in a row so far. The
                status changes if it continues.
              </p>
            )}
          </div>
          <MonitorActions id={m.id} name={m.name} isPaused={m.isPaused} />
        </div>

        {waiting ? (
          <p className="mt-5 text-sm text-fg-muted">
            Waiting for first check. Use Check now to try the endpoint straight away.
          </p>
        ) : (
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Response time">{formatMs(m.lastResponseTimeMs)}</Fact>
            <Fact label="Last status code">{m.lastStatusCode ?? "—"}</Fact>
            <Fact label="Uptime 24 h">{formatPercent(uptime.data?.uptimePct ?? null)}</Fact>
            <Fact label="Last checked">
              <span title={formatDateTime(m.lastCheckedAt)}>
                {formatRelative(m.lastCheckedAt, now)}
              </span>
            </Fact>
            <Fact label="Next check">
              {m.isPaused ? "Paused" : formatRelative(m.nextCheckAt, now)}
            </Fact>
            <Fact label="Interval">{formatInterval(m.intervalSec)}</Fact>
          </dl>
        )}
      </Card>

      <div className="space-y-6">
        <AnalyticsSection monitorId={m.id} thresholdMs={m.responseThresholdMs} />
        <IncidentHistory monitorId={m.id} now={now} />
        <ChecksTable monitorId={m.id} now={now} />
        <div className="flex justify-end">
          <ButtonLink to={`/monitors/${m.id}/edit`} variant="ghost" size="sm">
            Edit settings
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
