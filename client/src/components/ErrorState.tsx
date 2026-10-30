import { CircleAlert } from "lucide-react";
import { getErrorMessage } from "../utils/errors";
import { cn } from "../utils/ui";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  /** Explicit text. If omitted, it is derived from `error`. */
  message?: string;
  error?: unknown;
  /** Shows a "Try again" button (usually the query's refetch) */
  onRetry?: () => void;
  className?: string;
}

/** What a page or card shows when its data could not be loaded. */
export function ErrorState({
  title = "Something went wrong",
  message,
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const text = message ?? (error !== undefined ? getErrorMessage(error) : "Please try again.");
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-red-300 px-6 py-10 text-center dark:border-red-900/60",
        className,
      )}
    >
      <CircleAlert className="size-9 text-down" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-5">
          Try again
        </Button>
      )}
    </div>
  );
}
