import type {
  AnalyticsIncident,
  AnalyticsPoint,
  IncidentType,
  Plan,
  StatsRange,
} from "../types/api";

/** The ranges the selector offers. `days` is compared with the plan's history (PlanLimits.retentionDays). */
export const ANALYTICS_RANGES: { value: StatsRange; label: string; days: number }[] = [
  { value: "24h", label: "Last 24 hours", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
];

/** A range is locked when it is longer than the history the plan keeps (FREE: 7 days). */
export function isRangeLocked(range: StatsRange, retentionDays: number | undefined): boolean {
  if (retentionDays === undefined) return false; // limits not loaded yet: do not lock anything
  const days = ANALYTICS_RANGES.find((r) => r.value === range)!.days;
  return days > retentionDays;
}

/** The sentence shown instead of the charts when the plan does not cover the range. */
export function planNotice(plan: Plan, retentionDays: number): string {
  return `Your ${plan} plan keeps ${retentionDays} ${retentionDays === 1 ? "day" : "days"} of history, so this range is not available. Upgrade to PRO to see the last 30 days.`;
}

/** A point with its time as a number: the charts use a real time axis, so gaps and spacing are honest. */
export type ChartPoint = AnalyticsPoint & { t: number };

export const toChartPoints = (points: AnalyticsPoint[]): ChartPoint[] =>
  points.map((p) => ({ ...p, t: Date.parse(p.at) }));

/** A line needs a few filled buckets before it means anything. */
export const MIN_BUCKETS_WITH_DATA = 2;

export const hasEnoughData = (points: AnalyticsPoint[]): boolean =>
  points.filter((p) => p.total > 0).length >= MIN_BUCKETS_WITH_DATA;

/**
 * Y range of the uptime chart. Uptime sits near 100 % almost always, so a 0-100 axis would flatten every
 * dip into the top edge. Zoom to the nearest 5 below the lowest bucket (95-100 when nothing ever failed),
 * but fall back to 0-100 when something really broke (below 50 %).
 */
export function uptimeDomain(points: AnalyticsPoint[]): [number, number] {
  const values = points.map((p) => p.uptimePct).filter((v): v is number => v !== null);
  if (values.length === 0) return [0, 100];
  const min = Math.min(...values);
  if (min < 50) return [0, 100];
  return [Math.max(0, Math.floor((min - 2) / 5) * 5), 100];
}

export type IncidentShade = {
  id: string;
  type: IncidentType;
  x1: number;
  x2: number;
  open: boolean;
};

/**
 * Turns incidents into [x1, x2] spans on the chart's time axis: clamped to the visible window, an open
 * incident runs to the right edge, and a span too narrow to see (an 11-minute outage on a 30-day chart)
 * is widened to `minShare` of the width so it can still be found. Incidents outside the window are dropped.
 */
export function incidentShades(
  incidents: AnalyticsIncident[],
  fromMs: number,
  toMs: number,
  minShare = 0.006,
): IncidentShade[] {
  const minSpan = (toMs - fromMs) * minShare;
  const shades: IncidentShade[] = [];
  for (const i of incidents) {
    const start = Date.parse(i.startedAt);
    const end = i.resolvedAt ? Date.parse(i.resolvedAt) : toMs;
    if (end < fromMs || start > toMs) continue;
    const x1 = Math.max(start, fromMs);
    const x2 = Math.min(Math.max(end, x1 + minSpan), toMs);
    shades.push({
      id: i.id,
      type: i.type,
      x1: Math.min(x1, x2 - minSpan),
      x2,
      open: i.resolvedAt === null,
    });
  }
  return shades.sort((a, b) => a.x1 - b.x1);
}

const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayAndClock = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Tick label on the time axis: the clock for 24 h, the date for longer ranges. */
export const formatAxisTick = (ms: number, range: StatsRange): string =>
  range === "24h" ? clock.format(ms) : day.format(ms);

/** Tooltip title for one bucket: "Nov 4, 12:00 - 12:15". Times are in the viewer's own time zone. */
export const formatBucketLabel = (ms: number, bucketSec: number): string =>
  `${dayAndClock.format(ms)} - ${clock.format(ms + bucketSec * 1000)}`;

/** Sentence for the tooltip and for screen readers: "3 of 4 checks succeeded (1 slow, 1 failed)". */
export function describeBucket(
  p: Pick<AnalyticsPoint, "total" | "successful" | "slow" | "failed">,
): string {
  if (p.total === 0) return "No checks ran";
  const base = `${p.successful} of ${p.total} ${p.total === 1 ? "check" : "checks"} succeeded`;
  const extras: string[] = [];
  if (p.slow > 0) extras.push(`${p.slow} slow`);
  if (p.failed > 0) extras.push(`${p.failed} failed`);
  return extras.length > 0 ? `${base} (${extras.join(", ")})` : base;
}

/**
 * Y ticks for the uptime axis. Left alone, Recharts spreads 5 ticks evenly over the zoomed range and rounds
 * the labels (85-100 becomes 97, 93, 89: wrong). Pick round steps instead.
 */
export function uptimeTicks([low, high]: [number, number]): number[] {
  const span = high - low;
  const step = span <= 5 ? 1 : span <= 10 ? 2 : span <= 20 ? 5 : span <= 50 ? 10 : 25;
  const ticks: number[] = [];
  for (let v = Math.ceil(low / step) * step; v <= high; v += step) ticks.push(v);
  return ticks;
}

/**
 * X ticks on the time axis, at the viewer's local clock: every 4 hours for 24 h, every midnight for 7 d,
 * every 5th midnight for 30 d. Automatic ticks land at noon AND midnight and label both with the same date.
 */
export function timeTicks(startMs: number, endMs: number, range: StatsRange): number[] {
  const ticks: number[] = [];
  const d = new Date(startMs);
  if (range === "24h") {
    d.setMinutes(0, 0, 0);
    while (d.getTime() < startMs || d.getHours() % 4 !== 0) d.setHours(d.getHours() + 1);
    for (; d.getTime() <= endMs; d.setHours(d.getHours() + 4)) ticks.push(d.getTime());
    return ticks;
  }
  const stepDays = range === "7d" ? 1 : 5;
  d.setHours(0, 0, 0, 0);
  if (d.getTime() < startMs) d.setDate(d.getDate() + 1);
  for (; d.getTime() <= endMs; d.setDate(d.getDate() + stepDays)) ticks.push(d.getTime());
  return ticks;
}

/**
 * Rounds up to a "nice" axis maximum (1, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten), so the
 * response-time axis ends on a round number (1 s) instead of 880 ms and its ticks come out round.
 */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / power;
  const step = [1, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => mantissa <= s + 1e-9)!;
  return step * power;
}
