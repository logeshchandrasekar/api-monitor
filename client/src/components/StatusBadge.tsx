import { STATUS_META, type DisplayStatus } from "../utils/status";
import { cn } from "../utils/ui";

/**
 * The status pill. The text is always shown next to the colour, so the status never depends on colour
 * alone (colour-blind users, greyscale prints). The description appears as a tooltip.
 * For a monitor use: <StatusBadge status={getDisplayStatus(monitor)} />
 */
export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta.badge,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
