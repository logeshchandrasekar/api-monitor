import { ErrorState } from "./ErrorState";
import { Spinner } from "./Spinner";

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <Spinner className="size-8 text-indigo-600 dark:text-indigo-400" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function FullScreenError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <ErrorState
        className="max-w-md"
        title="Can't reach the server"
        message="We couldn't check your session. Check your connection and try again."
        onRetry={onRetry}
      />
    </div>
  );
}
