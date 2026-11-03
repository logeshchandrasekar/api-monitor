import { useState } from "react";
import { useLimits } from "../../hooks/useLimits";
import { useMonitorStats } from "../../hooks/useMonitors";
import type { StatsRange } from "../../types/api";
import { formatPercent, formatNumber } from "../../utils/format";
import { formatMs } from "../../utils/time";
import { ErrorState } from "../ErrorState";
import { Card } from "../ui/Card";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";

const RANGES: { value: StatsRange; label: string; days: number }[] = [
  { value: "24h", label: "Last 24 hours", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
];

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tracking-tight">{value}</dd>
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

/** Response-time and check numbers for one range. Charts come in Phase 7. Only ranges the plan keeps history for are offered. */
export function StatsCard({
  monitorId,
  currentMs,
}: {
  monitorId: string;
  currentMs: number | null;
}) {
  const [range, setRange] = useState<StatsRange>("24h");
  const { data: limits } = useLimits();
  const stats = useMonitorStats(monitorId, range);

  const available = RANGES.filter((r) => !limits || r.days <= limits.retentionDays);

  return (
    <Card
      title="Statistics"
      description="Scheduled checks only. A manual Check now never counts here."
      action={
        <div className="w-44">
          <Select
            label="Range"
            value={range}
            onChange={(e) => setRange(e.target.value as StatsRange)}
          >
            {available.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      }
    >
      {stats.isPending && (
        <div aria-busy="true" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}

      {stats.isError && (
        <ErrorState
          title="Could not load statistics"
          error={stats.error}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
        />
      )}

      {stats.data &&
        (stats.data.totalChecks === 0 ? (
          <p className="text-sm text-fg-muted">
            No scheduled checks in this range yet. Statistics appear after the first check runs.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Figure label="Uptime" value={formatPercent(stats.data.uptimePct)} />
            <Figure
              label="Current response"
              value={formatMs(currentMs)}
              hint="last scheduled check"
            />
            <Figure label="Average response" value={formatMs(stats.data.avgResponseMs)} />
            <Figure
              label="Fastest / slowest"
              value={`${formatMs(stats.data.minResponseMs)} / ${formatMs(stats.data.maxResponseMs)}`}
            />
            <Figure label="Total checks" value={formatNumber(stats.data.totalChecks)} />
            <Figure
              label="Successful"
              value={formatNumber(stats.data.successfulChecks)}
              hint={
                stats.data.slowChecks > 0
                  ? `${formatNumber(stats.data.slowChecks)} of them slow`
                  : undefined
              }
            />
            <Figure label="Failed" value={formatNumber(stats.data.failedChecks)} />
          </dl>
        ))}
    </Card>
  );
}
