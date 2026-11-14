import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import { Card } from "./ui/Card";

/** A number with a label. `tone` colours the number: use it only when the number means something (incidents > 0). */
export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "healthy" | "degraded" | "down";
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <p
        className={cn(
          "data mt-1.5 text-2xl font-semibold",
          tone === "healthy" && "text-healthy-ink",
          tone === "degraded" && "text-degraded-ink",
          tone === "down" && "text-down-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </Card>
  );
}
