import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
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
  timeTicks,
  uptimeDomain,
  uptimeTicks,
  type ChartPoint,
  type IncidentShade,
} from "../../utils/analytics";
import { formatPercent } from "../../utils/format";
import { ChartLegend } from "./ChartLegend";

function ChartTooltip({ active, payload, bucketSec }: TooltipContentProps & { bucketSec: number }) {
  const p = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="max-w-60 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{formatBucketLabel(p.t, bucketSec)}</p>
      <p className="mt-1">
        Uptime <span className="font-medium">{formatPercent(p.uptimePct)}</span>
      </p>
      <p className="text-fg-muted">{describeBucket(p)}</p>
    </div>
  );
}

/**
 * Uptime per bucket as a step area (each value holds until the next bucket), with incident periods shaded
 * behind it: red for DOWN, amber for DEGRADED. A bucket with no checks is a gap, not 0 %.
 * The Y axis is zoomed (see uptimeDomain) so a 99 % bucket is visibly different from a 100 % one.
 */
export function UptimeChart({
  points,
  startMs,
  endMs,
  range,
  bucketSec,
  shades,
}: {
  points: ChartPoint[];
  startMs: number;
  endMs: number;
  range: StatsRange;
  bucketSec: number;
  shades: IncidentShade[];
}) {
  const domain = uptimeDomain(points);
  return (
    <div>
      <div
        className="h-48 w-full sm:h-56"
        role="img"
        aria-label="Uptime per time bucket, with incidents shaded"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
              domain={domain}
              ticks={uptimeTicks(domain)}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              stroke="var(--line)"
            />
            <Tooltip content={(props) => <ChartTooltip {...props} bucketSec={bucketSec} />} />
            {shades.map((s) => (
              <ReferenceArea
                key={s.id}
                x1={s.x1}
                x2={s.x2}
                ifOverflow="hidden"
                fill={s.type === "DOWN" ? "var(--down)" : "var(--degraded)"}
                fillOpacity={0.22}
                stroke={s.type === "DOWN" ? "var(--down)" : "var(--degraded)"}
                strokeOpacity={0.5}
              />
            ))}
            <Area
              type="stepAfter"
              dataKey="uptimePct"
              stroke="var(--healthy)"
              strokeWidth={2}
              fill="var(--healthy)"
              fillOpacity={0.15}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          { label: "Uptime", kind: "line", className: "bg-healthy" },
          { label: "Down", kind: "box", className: "bg-down/30 ring-1 ring-down/50" },
          { label: "Degraded", kind: "box", className: "bg-degraded/30 ring-1 ring-degraded/50" },
        ]}
      />
    </div>
  );
}
