import type { ReactNode } from "react";
import { Link } from "react-router";
import type { MonitorListItem } from "../../types/api";
import { formatPercent } from "../../utils/format";
import { getDisplayStatus } from "../../utils/status";
import { formatDateTime, formatMs, formatRelative } from "../../utils/time";
import { StatusBadge } from "../StatusBadge";

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-16">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function MonitorRow({ monitor, now }: { monitor: MonitorListItem; now: number }) {
  const display = getDisplayStatus(monitor);
  const waiting = display === "pending"; // brand new, or just resumed or edited: no scheduled check yet

  return (
    <li>
      <Link
        to={`/monitors/${monitor.id}`}
        className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 hover:bg-subtle"
      >
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate font-medium">{monitor.name}</p>
          <p className="truncate text-sm text-fg-muted">
            {monitor.method} {monitor.url}
          </p>
        </div>

        <div className="flex w-32 flex-col items-start gap-1">
          <StatusBadge status={display} size="sm" />
          {/* The status is still HEALTHY after one failed check; say so instead of looking calm */}
          {display === "healthy" && monitor.failStreak > 0 && (
            <span className="text-xs text-degraded-ink">
              {monitor.failStreak} failed {monitor.failStreak === 1 ? "check" : "checks"}
            </span>
          )}
        </div>

        {waiting ? (
          <p className="w-full text-sm text-fg-muted sm:w-auto sm:min-w-72">
            Waiting for first check
          </p>
        ) : (
          <dl className="flex gap-5">
            <Metric label="Response">{formatMs(monitor.lastResponseTimeMs)}</Metric>
            <Metric label="Uptime 24 h">{formatPercent(monitor.uptime24h)}</Metric>
            <Metric label="Last checked">
              <span title={formatDateTime(monitor.lastCheckedAt)}>
                {formatRelative(monitor.lastCheckedAt, now)}
              </span>
            </Metric>
          </dl>
        )}
      </Link>
    </li>
  );
}

/** The monitor list used by the Dashboard and the Monitors page. `now` comes from useNow() so "3 min ago" keeps counting. */
export function MonitorList({ monitors, now }: { monitors: MonitorListItem[]; now: number }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      {monitors.map((m) => (
        <MonitorRow key={m.id} monitor={m} now={now} />
      ))}
    </ul>
  );
}

export function MonitorListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading monitors"
      className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface"
    >
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded-md bg-subtle" />
            <div className="h-3 w-64 max-w-full animate-pulse rounded-md bg-subtle" />
          </div>
          <div className="h-6 w-20 animate-pulse rounded-full bg-subtle" />
        </li>
      ))}
    </ul>
  );
}
