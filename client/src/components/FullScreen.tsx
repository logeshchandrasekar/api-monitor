import { ErrorState } from "./ErrorState";
import { Spinner } from "./ui/Spinner";

export function FullScreenSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas text-fg-muted">
      <Spinner className="size-8" label={label} />
    </div>
  );
}

export function FullScreenError({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <ErrorState
        title="Cannot reach the server"
        message="We could not check your session. Make sure the API is running, then try again."
        onRetry={onRetry}
        retrying={retrying}
      />
    </div>
  );
}
