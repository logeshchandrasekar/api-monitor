import { Link } from "react-router";
import type { Incident } from "../types/api";
import { cn } from "../utils/cn";
import { RESOLUTION_LABEL } from "../utils/labels";
import { formatDateTime, formatDuration, formatRelative } from "../utils/time";
import { IncidentTypeBadge } from "./Badges";

/**
 * One incident in a list. Ongoing incidents are highlighted (red edge, "Ongoing" with a live duration).
 * `showMonitor` is off on a monitor's own page, where the monitor is already the heading.
 */
export function IncidentRow({
  incident,
  now,
  showMonitor = true,
}: {
  incident: Incident;
  now: number;
  showMonitor?: boolean;
}) {
  return (
    <li>
      <Link
        to={`/incidents/${incident.id}`}
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-1.5 border-l-4 px-4 py-3 hover:bg-subtle",
          incident.ongoing ? "border-l-down bg-down-soft/40" : "border-l-transparent",
        )}
      >
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            {showMonitor && <span className="font-medium">{incident.monitorName}</span>}
            <IncidentTypeBadge type={incident.type} />
            {incident.ongoing && (
              <span className="text-xs font-semibold uppercase tracking-wide text-down-ink">
                Ongoing
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-muted">{incident.reason}</p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-xs text-fg-muted">Started</dt>
            <dd title={formatDateTime(incident.startedAt)}>
              {formatRelative(incident.startedAt, now)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">{incident.ongoing ? "Lasting" : "Duration"}</dt>
            <dd>{formatDuration(incident.durationSec)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Outcome</dt>
            <dd>{incident.resolution ? RESOLUTION_LABEL[incident.resolution] : "Not resolved"}</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}
