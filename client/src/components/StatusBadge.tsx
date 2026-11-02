import { STATUS_HINT, STATUS_LABEL, type DisplayStatus } from "../utils/status";
import { cn } from "../utils/cn";

// Full class names on purpose: Tailwind finds classes by scanning for whole strings, so never build them as `bg-${x}`
const styles: Record<DisplayStatus, { dot: string; badge: string }> = {
  healthy: { dot: "bg-healthy", badge: "bg-healthy-soft text-healthy-ink" },
  degraded: { dot: "bg-degraded", badge: "bg-degraded-soft text-degraded-ink" },
  down: { dot: "bg-down", badge: "bg-down-soft text-down-ink" },
  paused: { dot: "bg-paused", badge: "bg-paused-soft text-paused-ink" },
  pending: { dot: "bg-pending", badge: "bg-pending-soft text-pending-ink" },
};

/**
 * The one way a monitor's state is shown anywhere in the app (UX-1). Pass getDisplayStatus(monitor),
 * so a paused monitor shows "Paused" and a brand-new one shows "Pending" (tooltip: "Waiting for first check").
 * Colour is never the only signal: the label is always written out.
 */
export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: DisplayStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = styles[status];
  return (
    <span
      title={STATUS_HINT[status]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        s.badge,
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", s.dot)} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
