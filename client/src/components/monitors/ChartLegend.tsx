import { cn } from "../../utils/cn";

export type LegendItem = {
  label: string;
  /** line = solid line, dash = dashed line, box = a shaded area */
  kind: "line" | "dash" | "box";
  /** Tailwind classes that set the colour, e.g. "bg-brand" or "border-degraded". */
  className: string;
};

/** The key under a chart. Wraps onto several lines on a phone. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "inline-block",
              item.kind === "box" ? "size-3 rounded-[2px]" : "w-5",
              item.kind === "line" && "h-0.5 rounded-full",
              item.kind === "dash" && "h-0 border-t-2 border-dashed",
              item.className,
            )}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
