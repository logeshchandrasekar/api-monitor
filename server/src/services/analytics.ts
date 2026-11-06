import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import type { AnalyticsQuery } from "../schemas/check.js";
import { uptimeOf } from "../utils/uptime.js";
import { RANGE_MS, assertRangeAllowed } from "./checks.js";
import { getMonitor, type Owner } from "./monitors.js";

export type AnalyticsRange = AnalyticsQuery["range"];

/** Width of one chart point per range (DAT-3). Gives 97, 169 and 121 points. */
export const BUCKET_SEC: Record<AnalyticsRange, number> = {
  "24h": 15 * 60,
  "7d": 60 * 60,
  "30d": 6 * 60 * 60,
};

/** Incidents drawn on the chart: more than this in one window is unreadable anyway. */
const MAX_INCIDENTS = 200;

/**
 * The JavaScript twin of the SQL below: date_bin(stride, instant, 1970-01-01 UTC) rounds an instant DOWN
 * to a multiple of the stride since the epoch. Buckets are therefore always on UTC clock boundaries
 * (00:00, 00:15, ... and 00:00, 06:00, 12:00, 18:00) whatever the database or server time zone is.
 */
export const bucketStartMs = (ms: number, bucketSec: number): number =>
  Math.floor(ms / (bucketSec * 1000)) * (bucketSec * 1000);

/** The slice of a Prisma client the two queries need: the real client and a transaction both fit it. */
export type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

export type BucketRow = {
  /** Bucket start as epoch milliseconds (see queryBuckets for why it is not a timestamp). */
  atMs: number;
  total: number;
  successful: number;
  slow: number;
  failed: number;
  avgMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

type StatsRow = {
  total: number;
  successful: number;
  slow: number;
  failed: number;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  p95Ms: number | null;
};

/**
 * The time series: ONE query. `grid` is every bucket start from the first to the last (generate_series),
 * `agg` is the checks grouped by bucket (date_bin), and the LEFT JOIN keeps buckets that have no checks
 * as rows of zeros and NULLs. The chart turns those into gaps instead of a line that dives to 0 ms (DAT-3).
 *
 * Rules shared with the stats: scheduled checks only (ENG-4), SLOW counts as successful, and the average
 * and p95 only see checks that got an answer (a timeout has no response time; SQL aggregates skip NULLs).
 * It uses the index on (monitorId, checkedAt DESC).
 *
 * The bucket start leaves SQL as epoch MILLISECONDS, not as a timestamp. The Postgres driver turns a raw
 * timestamptz into text in the session's time zone ("2026-11-04 17:15:00+05:30") and a client that reads
 * that carelessly shifts every point by the offset. A number cannot be misread, so the result is the same
 * whatever time zone the database server or session uses (a test runs it under four zones).
 */
export async function queryBuckets(
  db: Db,
  monitorId: string,
  from: Date,
  to: Date,
  bucketSec: number,
): Promise<BucketRow[]> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return db.$queryRaw<BucketRow[]>`
    WITH grid AS (
      SELECT generate_series(
        date_bin(make_interval(secs => ${bucketSec}::double precision), ${fromIso}::timestamptz, TIMESTAMPTZ '1970-01-01 00:00:00+00'),
        ${toIso}::timestamptz,
        make_interval(secs => ${bucketSec}::double precision)
      ) AS bucket
    ),
    agg AS (
      SELECT
        date_bin(make_interval(secs => ${bucketSec}::double precision), "checkedAt", TIMESTAMPTZ '1970-01-01 00:00:00+00') AS bucket,
        count(*)::int AS total,
        (count(*) FILTER (WHERE outcome <> 'FAILURE'))::int AS successful,
        (count(*) FILTER (WHERE outcome = 'SLOW'))::int AS slow,
        (count(*) FILTER (WHERE outcome = 'FAILURE'))::int AS failed,
        round(avg("responseTimeMs"))::int AS "avgMs",
        round(percentile_cont(0.95) WITHIN GROUP (ORDER BY "responseTimeMs"))::int AS "p95Ms",
        max("responseTimeMs") AS "maxMs"
      FROM checks
      WHERE "monitorId" = ${monitorId}
        AND trigger = 'SCHEDULED'
        AND "checkedAt" >= ${fromIso}::timestamptz
        AND "checkedAt" <= ${toIso}::timestamptz
      GROUP BY 1
    )
    SELECT
      (extract(epoch FROM grid.bucket) * 1000)::float8 AS "atMs",
      coalesce(agg.total, 0)::int AS "total",
      coalesce(agg.successful, 0)::int AS "successful",
      coalesce(agg.slow, 0)::int AS "slow",
      coalesce(agg.failed, 0)::int AS "failed",
      agg."avgMs", agg."p95Ms", agg."maxMs"
    FROM grid
    LEFT JOIN agg ON agg.bucket = grid.bucket
    ORDER BY grid.bucket`;
}

/** The whole-range numbers: same WHERE as the series, so the two always add up. */
async function queryStats(db: Db, monitorId: string, from: Date, to: Date): Promise<StatsRow> {
  const rows = await db.$queryRaw<StatsRow[]>`
    SELECT
      count(*)::int AS "total",
      (count(*) FILTER (WHERE outcome <> 'FAILURE'))::int AS "successful",
      (count(*) FILTER (WHERE outcome = 'SLOW'))::int AS "slow",
      (count(*) FILTER (WHERE outcome = 'FAILURE'))::int AS "failed",
      round(avg("responseTimeMs"))::int AS "avgMs",
      min("responseTimeMs") AS "minMs",
      max("responseTimeMs") AS "maxMs",
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY "responseTimeMs"))::int AS "p95Ms"
    FROM checks
    WHERE "monitorId" = ${monitorId}
      AND trigger = 'SCHEDULED'
      AND "checkedAt" >= ${from.toISOString()}::timestamptz
      AND "checkedAt" <= ${to.toISOString()}::timestamptz`;
  // An aggregate without GROUP BY always returns exactly one row
  return rows[0]!;
}

/**
 * Statistics, a chart series and the incident periods for one monitor and range (Phase 7).
 *
 * The window is [now - range, now], the same one /stats uses, so the numbers agree with the rest of the
 * app. The oldest bucket can therefore be partly outside the window and holds fewer checks (its start is
 * rounded down to the bucket boundary); the newest bucket is still filling. `nowMs` is a parameter so tests
 * can use a fixed clock.
 */
export async function getMonitorAnalytics(
  owner: Owner,
  monitorId: string,
  query: AnalyticsQuery,
  nowMs: number = Date.now(),
) {
  const monitor = await getMonitor(owner.id, monitorId); // 404 if it is not yours (SEC-4)
  assertRangeAllowed(owner.plan, query.range); // 403 RANGE_NOT_ALLOWED beyond the plan's history

  const to = new Date(nowMs);
  const from = new Date(nowMs - RANGE_MS[query.range]);
  const bucketSec = BUCKET_SEC[query.range];

  const [buckets, stats, incidents, totalIncidents] = await Promise.all([
    queryBuckets(prisma, monitorId, from, to, bucketSec),
    queryStats(prisma, monitorId, from, to),
    // Every incident that overlaps the window, for shading the chart
    prisma.incident.findMany({
      where: {
        monitorId,
        startedAt: { lte: to },
        OR: [{ resolvedAt: null }, { resolvedAt: { gte: from } }],
      },
      orderBy: { startedAt: "asc" },
      take: MAX_INCIDENTS,
    }),
    // "Total incidents" counts the ones that STARTED in the window
    prisma.incident.count({ where: { monitorId, startedAt: { gte: from, lte: to } } }),
  ]);

  return {
    range: query.range,
    bucketSec,
    from: from.toISOString(),
    to: to.toISOString(),
    stats: {
      currentMs: monitor.lastResponseTimeMs, // the last scheduled check, same as the monitor header
      avgMs: stats.avgMs,
      minMs: stats.minMs,
      maxMs: stats.maxMs,
      p95Ms: stats.p95Ms,
      uptimePct: uptimeOf(stats.successful, stats.total),
      totalChecks: stats.total,
      successfulChecks: stats.successful, // includes slow ones
      slowChecks: stats.slow,
      failedChecks: stats.failed,
      totalIncidents,
    },
    series: buckets.map((b) => ({
      at: new Date(b.atMs).toISOString(),
      total: b.total,
      successful: b.successful,
      slow: b.slow,
      failed: b.failed,
      uptimePct: uptimeOf(b.successful, b.total),
      avgMs: b.avgMs,
      p95Ms: b.p95Ms,
      maxMs: b.maxMs,
    })),
    incidents: incidents.map((i) => ({
      id: i.id,
      type: i.type,
      status: i.status,
      startedAt: i.startedAt.toISOString(),
      resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    })),
  };
}
