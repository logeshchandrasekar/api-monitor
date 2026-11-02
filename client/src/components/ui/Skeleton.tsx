import { cn } from "../../utils/cn";

/** A grey pulsing block. Size it with className: <Skeleton className="h-4 w-32" /> */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-subtle", className)} />;
}
