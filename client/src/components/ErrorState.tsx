import { CircleAlert } from "lucide-react";
import { getErrorMessage } from "../utils/errors";
import { Button } from "./ui/Button";

type ErrorStateProps = {
  title?: string;
  /** Pass the caught error and the right message is picked, or pass `message` to write your own. */
  error?: unknown;
  message?: string;
  /** Shows a Retry button. */
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  error,
  message,
  onRetry,
  retrying,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`mx-auto flex max-w-md flex-col items-center rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-sm ${className ?? ""}`}
    >
      <div className="grid size-12 place-items-center rounded-full bg-down-soft text-down-ink">
        <CircleAlert className="size-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-fg-muted">{message ?? getErrorMessage(error)}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </div>
  );
}
