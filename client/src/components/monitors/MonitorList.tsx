import { Link } from "react-router";
import type { MonitorListItem } from "../../types/api";
import { formatPercent } from "../../utils/format";
import { getDisplayStatus } from "../../utils/status";
import { formatDateTime, formatMs, formatRelative } from "../../utils/time";
import { StatusBadge } from "../StatusBadge";
import { TickStrip } from "../TickStrip";

function MonitorRow({ monitor, now }: { monitor: MonitorListItem; now: number }) {
  const display = getDisplayStatus(monitor);
  const waiting = display === "pending"; // brand new, or just resumed or edited: no scheduled check yet

  return (
    <li>
      <Link
        to={`/monitors/${monitor.id}`}
        className="grid items-center gap-x-6 gap-y-3 px-4 py-3.5 transition-colors hover:bg-subtle sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]"
      >
        {/* Who: name, then method and URL as data */}
        <div className="min-w-0">
          <p className="truncate font-medium">{monitor.name}</p>
          <p className="data truncate text-xs text-fg-muted">
            <span className="font-medium">{monitor.method}</span> {monitor.url}
          </p>
          {monitor.tags.length > 0 && (
            <ul aria-label="Tags" className="mt-1.5 flex flex-wrap gap-1">
              {monitor.tags.slice(0, 3).map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-fg-muted"
                >
                  {tag}
                </li>
              ))}
              {monitor.tags.length > 3 && (
                <li className="px-1 py-0.5 text-[11px] text-fg-muted">
                  +{monitor.tags.length - 3}
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Last 24 hours at a glance */}
        <div className="min-w-0">
          {waiting ? (
            <p className="text-sm text-fg-muted">Waiting for first check</p>
          ) : (
            <>
              <TickStrip ticks={monitor.recent} now={now} />
              <div
                aria-hidden="true"
                className="mt-1 flex justify-between text-[11px] text-fg-muted"
              >
                <span>24 h ago</span>
                <span>now</span>
              </div>
            </>
          )}
        </div>

        {/* Now: state, response time and uptime, last check */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:min-w-40 sm:flex-col sm:items-end sm:gap-1">
          <StatusBadge status={display} size="sm" />
          {!waiting && (
            <>
              <p className="data text-xs">
                {formatMs(monitor.lastResponseTimeMs)}
                <span className="text-fg-muted"> · {formatPercent(monitor.uptime24h)}</span>
              </p>
              <p className="text-xs text-fg-muted" title={formatDateTime(monitor.lastCheckedAt)}>
                checked {formatRelative(monitor.lastCheckedAt, now)}
              </p>
            </>
          )}
          {/* The status is still HEALTHY after one failed check; say so instead of looking calm */}
          {display === "healthy" && monitor.failStreak > 0 && (
            <span className="text-xs text-degraded-ink">
              {monitor.failStreak} failed {monitor.failStreak === 1 ? "check" : "checks"}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/** The monitor list used by the Dashboard and the Monitors page. `now` comes from useNow() so "3 min ago" keeps counting. */
export function MonitorList({ monitors, now }: { monitors: MonitorListItem[]; now: number }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
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
        <li key={i} className="flex items-center gap-6 px-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded-md bg-subtle" />
            <div className="h-3 w-56 max-w-full animate-pulse rounded-md bg-subtle" />
          </div>
          <div className="hidden h-6 flex-1 animate-pulse rounded-md bg-subtle sm:block" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-subtle" />
        </li>
      ))}
    </ul>
  );
}
