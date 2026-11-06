import { Suspense, lazy, useMemo, useState } from "react";
import { useLimits } from "../../hooks/useLimits";
import { useMonitorAnalytics } from "../../hooks/useMonitors";
import type { MonitorAnalytics, StatsRange } from "../../types/api";
import {
  ANALYTICS_RANGES,
  hasEnoughData,
  incidentShades,
  isRangeLocked,
  planNotice,
  toChartPoints,
} from "../../utils/analytics";
import { cn } from "../../utils/cn";
import { formatNumber, formatPercent } from "../../utils/format";
import { formatMs } from "../../utils/time";
import { ErrorState } from "../ErrorState";
import { Alert } from "../ui/Alert";
import { Card } from "../ui/Card";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";

// Recharts is the biggest dependency of the app. Loading the charts on demand keeps it out of the first
// page load: only a monitor page with enough data downloads it.
const ResponseTimeChart = lazy(() =>
  import("./ResponseTimeChart").then((m) => ({ default: m.ResponseTimeChart })),
);
const UptimeChart = lazy(() => import("./UptimeChart").then((m) => ({ default: m.UptimeChart })));

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tracking-tight">{value}</dd>
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

function StatGrid({ data }: { data: MonitorAnalytics }) {
  const s = data.stats;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      <Figure label="Uptime" value={formatPercent(s.uptimePct)} />
      <Figure label="Current response" value={formatMs(s.currentMs)} hint="last scheduled check" />
      <Figure label="Average response" value={formatMs(s.avgMs)} />
      <Figure label="p95 response" value={formatMs(s.p95Ms)} hint="95 % of checks were faster" />
      <Figure label="Fastest / slowest" value={`${formatMs(s.minMs)} / ${formatMs(s.maxMs)}`} />
      <Figure label="Total checks" value={formatNumber(s.totalChecks)} />
      <Figure
        label="Successful"
        value={formatNumber(s.successfulChecks)}
        hint={s.slowChecks > 0 ? `${formatNumber(s.slowChecks)} of them slow` : undefined}
      />
      <Figure label="Failed" value={formatNumber(s.failedChecks)} />
      <Figure
        label="Incidents"
        value={formatNumber(s.totalIncidents)}
        hint="started in this range"
      />
    </dl>
  );
}

function Charts({ data, thresholdMs }: { data: MonitorAnalytics; thresholdMs: number }) {
  const points = useMemo(() => toChartPoints(data.series), [data.series]);
  const startMs = points[0]!.t;
  const endMs = Date.parse(data.to);
  const shades = useMemo(
    () => incidentShades(data.incidents, startMs, endMs),
    [data.incidents, startMs, endMs],
  );

  if (!hasEnoughData(data.series)) {
    return (
      <p className="text-sm text-fg-muted">
        Not enough data for charts yet. They appear once checks have run in at least two time slots
        ({data.bucketSec / 60 >= 60 ? `${data.bucketSec / 3600} h` : `${data.bucketSec / 60} min`}{" "}
        each).
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-2 text-sm font-medium">Response time</h3>
        <Suspense fallback={<Skeleton className="h-56 sm:h-64" />}>
          <ResponseTimeChart
            points={points}
            startMs={startMs}
            endMs={endMs}
            range={data.range}
            bucketSec={data.bucketSec}
            thresholdMs={thresholdMs}
          />
        </Suspense>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-medium">Uptime</h3>
        <Suspense fallback={<Skeleton className="h-48 sm:h-56" />}>
          <UptimeChart
            points={points}
            startMs={startMs}
            endMs={endMs}
            range={data.range}
            bucketSec={data.bucketSec}
            shades={shades}
          />
        </Suspense>
      </section>
    </div>
  );
}

/**
 * The statistics cards and both charts of the monitor detail page, for one range chosen in the card's
 * header. All of it comes from one request (GET /monitors/:id/analytics). A range longer than the plan's
 * history stays selectable but shows a plan message and makes no request.
 */
export function AnalyticsSection({
  monitorId,
  thresholdMs,
}: {
  monitorId: string;
  thresholdMs: number;
}) {
  const [range, setRange] = useState<StatsRange>("24h");
  const { data: limits } = useLimits();
  const locked = isRangeLocked(range, limits?.retentionDays);
  const analytics = useMonitorAnalytics(monitorId, range, !locked);

  return (
    <Card
      title="Statistics and charts"
      description="Scheduled checks only. A manual Check now never counts here."
    >
      <div className="mb-6 max-w-xs">
        <Select
          label="Range"
          value={range}
          onChange={(e) => setRange(e.target.value as StatsRange)}
        >
          {ANALYTICS_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
              {isRangeLocked(r.value, limits?.retentionDays) ? " (PRO)" : ""}
            </option>
          ))}
        </Select>
      </div>

      {locked && limits && <Alert>{planNotice(limits.plan, limits.retentionDays)}</Alert>}

      {!locked && analytics.isPending && (
        <div aria-busy="true" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
          <Skeleton className="h-56 sm:h-64" />
        </div>
      )}

      {!locked && analytics.isError && (
        <ErrorState
          title="Could not load statistics and charts"
          error={analytics.error}
          onRetry={() => void analytics.refetch()}
          retrying={analytics.isFetching}
        />
      )}

      {!locked &&
        analytics.data &&
        (analytics.data.stats.totalChecks === 0 ? (
          <p className="text-sm text-fg-muted">
            No scheduled checks in this range yet. Statistics and charts appear after the first
            check runs.
          </p>
        ) : (
          <div
            className={cn(
              "space-y-8 transition-opacity",
              analytics.isPlaceholderData && "opacity-60",
            )}
          >
            <StatGrid data={analytics.data} />
            <Charts data={analytics.data} thresholdMs={thresholdMs} />
          </div>
        ))}
    </Card>
  );
}
