import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { StatsRange } from "../../types/api";
import {
  describeBucket,
  formatAxisTick,
  formatBucketLabel,
  niceCeil,
  timeTicks,
  type ChartPoint,
} from "../../utils/analytics";
import { formatMs } from "../../utils/time";
import { ChartLegend } from "./ChartLegend";

function ChartTooltip({ active, payload, bucketSec }: TooltipContentProps & { bucketSec: number }) {
  const p = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="max-w-60 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{formatBucketLabel(p.t, bucketSec)}</p>
      <p className="mt-1 text-fg-muted">{describeBucket(p)}</p>
      {p.avgMs !== null && (
        <p className="mt-1">
          Average <span className="font-medium">{formatMs(p.avgMs)}</span>
          {p.p95Ms !== null && <span className="text-fg-muted"> · p95 {formatMs(p.p95Ms)}</span>}
          {p.maxMs !== null && <span className="text-fg-muted"> · max {formatMs(p.maxMs)}</span>}
        </p>
      )}
    </div>
  );
}

/**
 * Average and p95 response time per bucket, with the monitor's own "slow" threshold as a dashed line.
 * A bucket without an answer (an outage, a paused monitor) leaves a HOLE in the lines (connectNulls is
 * false) instead of a line that dives to 0 ms. The p95 line is what shows a spike that the average hides.
 * Colours are CSS variables, so the light and dark themes both work without extra code.
 */
export function ResponseTimeChart({
  points,
  startMs,
  endMs,
  range,
  bucketSec,
  thresholdMs,
}: {
  points: ChartPoint[];
  startMs: number;
  endMs: number;
  range: StatsRange;
  bucketSec: number;
  thresholdMs: number;
}) {
  return (
    <div>
      <div
        className="h-56 w-full sm:h-64"
        role="img"
        aria-label="Response time over the selected range"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[startMs, endMs]}
              ticks={timeTicks(startMs, endMs, range)}
              tickFormatter={(ms: number) => formatAxisTick(ms, range)}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              stroke="var(--line)"
              minTickGap={48}
            />
            <YAxis
              width={60}
              tickFormatter={(v: number) => formatMs(v)}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              stroke="var(--line)"
              domain={[0, (dataMax: number) => niceCeil(Math.max(dataMax, thresholdMs) * 1.05)]}
            />
            <Tooltip content={(props) => <ChartTooltip {...props} bucketSec={bucketSec} />} />
            <ReferenceLine y={thresholdMs} stroke="var(--degraded)" strokeDasharray="5 4" />
            <Line
              dataKey="p95Ms"
              stroke="var(--fg-muted)"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="avgMs"
              stroke="var(--brand)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          { label: "Average", kind: "line", className: "bg-brand" },
          { label: "p95 (95 % were faster)", kind: "dash", className: "border-fg-muted" },
          {
            label: `Slow above ${formatMs(thresholdMs)}`,
            kind: "dash",
            className: "border-degraded",
          },
        ]}
      />
    </div>
  );
}
