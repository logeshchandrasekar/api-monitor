import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ChecksTable } from "../components/monitors/ChecksTable";
import { IncidentHistory } from "../components/monitors/IncidentHistory";
import { MonitorActions } from "../components/monitors/MonitorActions";
import { AlertSettings } from "../components/monitors/AlertSettings";
import { AnalyticsSection } from "../components/monitors/AnalyticsSection";
import { NotificationHistory } from "../components/monitors/NotificationHistory";
import { StatusBadge } from "../components/StatusBadge";
import { TickStrip } from "../components/TickStrip";
import { Card } from "../components/ui/Card";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useMonitor, useMonitorStats } from "../hooks/useMonitors";
import { useNow } from "../hooks/useNow";
import { ApiError } from "../services/api";
import { formatPercent } from "../utils/format";
import { getDisplayStatus } from "../utils/status";
import {
  formatDateTime,
  formatInterval,
  formatMs,
  formatNextCheck,
  formatRelative,
} from "../utils/time";

/** One of the three big numbers in the header. */
function Key({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="data mt-1 text-3xl font-semibold">{children}</dd>
    </div>
  );
}

/** A small label and value on one line, for the details that matter less. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="data font-medium">{children}</dd>
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
            <p className="data mt-1.5 flex min-w-0 items-center gap-2 text-sm text-fg-muted">
              <span className="font-medium">{m.method}</span>
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-w-0 items-center gap-1 hover:text-fg hover:underline"
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
          <>
            <div className="mt-6 grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-10">
              <dl className="flex flex-wrap gap-x-10 gap-y-4">
                <Key label="Response time">{formatMs(m.lastResponseTimeMs)}</Key>
                <Key label="Uptime (24 h)">{formatPercent(uptime.data?.uptimePct ?? null)}</Key>
                <Key label="Status code">{m.lastStatusCode ?? "—"}</Key>
              </dl>
              {m.recent && (
                <div className="min-w-0">
                  <TickStrip ticks={m.recent} now={now} className="h-9" />
                  <div
                    aria-hidden="true"
                    className="mt-1 flex justify-between text-[11px] text-fg-muted"
                  >
                    <span>24 h ago</span>
                    <span>now</span>
                  </div>
                </div>
              )}
            </div>

            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-xs">
              <Fact label="Last checked">
                <span title={formatDateTime(m.lastCheckedAt)}>
                  {formatRelative(m.lastCheckedAt, now)}
                </span>
              </Fact>
              <Fact label="Next check">
                {m.isPaused ? "Paused" : formatNextCheck(m.nextCheckAt, now)}
              </Fact>
              <Fact label="Every">{formatInterval(m.intervalSec)}</Fact>
              <Fact label="Timeout">{formatMs(m.timeoutMs)}</Fact>
              <Fact label="Slow above">{formatMs(m.responseThresholdMs)}</Fact>
            </dl>
          </>
        )}
      </Card>

      {/* Charts first. The rarely used panels (alerts, notifications) go last. */}
      <div className="space-y-6">
        <AnalyticsSection monitorId={m.id} thresholdMs={m.responseThresholdMs} />
        <IncidentHistory monitorId={m.id} now={now} />
        <ChecksTable monitorId={m.id} now={now} />
        <AlertSettings monitorId={m.id} />
        <NotificationHistory monitorId={m.id} now={now} />
      </div>
    </>
  );
}
