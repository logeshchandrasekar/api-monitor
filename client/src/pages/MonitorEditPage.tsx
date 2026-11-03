import { useParams } from "react-router";
import { ErrorState } from "../components/ErrorState";
import { MonitorForm } from "../components/monitors/MonitorForm";
import { PageHeader } from "../components/PageHeader";
import { ButtonLink } from "../components/ui/ButtonLink";
import { Skeleton } from "../components/ui/Skeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useLimits } from "../hooks/useLimits";
import { useUpdateMonitor } from "../hooks/useMonitorMutations";
import { useMonitor } from "../hooks/useMonitors";
import { formFromMonitor } from "../utils/monitorForm";

export function MonitorEditPage() {
  const { id = "" } = useParams();
  useDocumentTitle("Edit monitor");
  const monitor = useMonitor(id);
  const limits = useLimits();
  const update = useUpdateMonitor(id);

  if (monitor.isPending || limits.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (monitor.isError || limits.isError) {
    const failed = monitor.isError ? monitor : limits;
    return (
      <ErrorState
        title="Could not load the monitor"
        error={failed.error}
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
        className="mt-6"
      />
    );
  }

  return (
    <>
      <PageHeader
        title={`Edit ${monitor.data.name}`}
        description="Changing the URL, method, headers, body, expected status or redirect setting restarts the checks from scratch and closes open incidents."
        actions={
          <ButtonLink to={`/monitors/${id}`} variant="ghost">
            Back to monitor
          </ButtonLink>
        }
      />
      {/* key: the form copies its starting values once, so a background refetch never overwrites what is being typed */}
      <MonitorForm
        key={monitor.data.id}
        initial={formFromMonitor(monitor.data)}
        limits={limits.data}
        submitLabel="Save changes"
        cancelTo={`/monitors/${id}`}
        onSubmit={(payload) => update.mutate(payload)}
        pending={update.isPending}
        error={update.error}
        onEdit={update.reset}
      />
    </>
  );
}
