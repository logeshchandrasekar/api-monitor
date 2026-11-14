import { Link } from "react-router";
import type { DashboardSummary } from "../types/api";
import { cn } from "../utils/cn";
import {
  DISPLAY_STATUSES,
  STATUS_LABEL,
  getOverallStatus,
  type DisplayStatus,
} from "../utils/status";

// Whole class names on purpose (Tailwind scans for complete strings)
const tones: Record<DisplayStatus, { box: string; dot: string }> = {
  healthy: { box: "border-healthy/30 bg-healthy-soft text-healthy-ink", dot: "bg-healthy" },
  degraded: { box: "border-degraded/30 bg-degraded-soft text-degraded-ink", dot: "bg-degraded" },
  down: { box: "border-down/30 bg-down-soft text-down-ink", dot: "bg-down" },
  paused: { box: "border-paused/30 bg-paused-soft text-paused-ink", dot: "bg-paused" },
  pending: { box: "border-pending/30 bg-pending-soft text-pending-ink", dot: "bg-pending" },
};

/**
 * The answer to "is everything fine?" at the top of the dashboard: one line that turns amber or red when
 * something is wrong, plus a count per state. Announced politely to screen readers when it changes.
 */
export function StatusBanner({ monitors }: { monitors: DashboardSummary["monitors"] }) {
  const overall = getOverallStatus(monitors);
  const tone = tones[overall.tone];
  const alerting = overall.tone === "down" || overall.tone === "degraded";

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "animate-rise flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border px-5 py-4",
        tone.box,
      )}
    >
      <span className="relative grid size-3 shrink-0 place-items-center" aria-hidden="true">
        {alerting && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              tone.dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex size-3 rounded-full", tone.dot)} />
      </span>

      <div className="min-w-0 flex-1 basis-64">
        <p className="text-lg font-semibold leading-tight">{overall.title}</p>
        <p className="mt-0.5 text-sm">{overall.detail}</p>
      </div>

      <ul className="flex flex-wrap items-center gap-1.5" aria-label="Monitors by state">
        {DISPLAY_STATUSES.filter((s) => monitors[s] > 0).map((s) => (
          <li
            key={s}
            className="data rounded-full bg-surface/70 px-2.5 py-1 text-xs font-medium text-fg"
          >
            {monitors[s]} {STATUS_LABEL[s].toLowerCase()}
          </li>
        ))}
      </ul>

      {overall.tone === "down" && (
        <Link to="/incidents" className="text-sm font-semibold underline-offset-2 hover:underline">
          View incidents
        </Link>
      )}
    </section>
  );
}
