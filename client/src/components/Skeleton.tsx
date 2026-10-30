import { cn } from "../utils/ui";

/** A grey pulsing block that stands in for content while it loads. Size it with className (h-6 w-32). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-slate-200 dark:bg-slate-800", className)}
    />
  );
}
