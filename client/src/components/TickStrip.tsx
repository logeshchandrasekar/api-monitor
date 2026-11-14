import type { Tick } from "../types/api";
import { cn } from "../utils/cn";
import { TICK_LABEL, summarizeTicks, tickStartMs } from "../utils/ticks";
import { formatHourRange } from "../utils/time";

// Whole class names on purpose (Tailwind scans for complete strings)
const TICK_STYLE: Record<Tick, string> = {
  up: "bg-healthy",
  slow: "bg-degraded",
  down: "bg-down",
  none: "bg-line",
};

/**
 * The last 24 hours of a monitor as small coloured ticks, oldest on the left. One tick is one hour: the worst
 * thing that happened in it. `now` comes from useNow() so the hover text names the right hours.
 * Colour is never the only signal: the whole strip is one image with a written summary, and every tick has a tooltip.
 */
export function TickStrip({
  ticks,
  now,
  className = "h-6",
}: {
  ticks: Tick[];
  now: number;
  /** Sets the height (default "h-6"). */
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={summarizeTicks(ticks)}
      className={cn("flex items-stretch gap-0.75", className)}
    >
      {ticks.map((tick, i) => (
        <span
          key={i}
          title={`${formatHourRange(tickStartMs(i, ticks.length, now))}: ${TICK_LABEL[tick]}`}
          className={cn(
            "min-w-0.75 flex-1 origin-bottom rounded-[3px] transition-transform duration-150 hover:scale-y-125",
            TICK_STYLE[tick],
          )}
        />
      ))}
    </div>
  );
}
