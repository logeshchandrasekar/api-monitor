import { useMemo } from "react";
import { ErrorState } from "../components/ErrorState";
import { MonitorForm } from "../components/monitors/MonitorForm";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui/Alert";
import { Skeleton } from "../components/ui/Skeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useLimits } from "../hooks/useLimits";
import { useCreateMonitor } from "../hooks/useMonitorMutations";
import { newFormValues } from "../utils/monitorForm";

export function MonitorNewPage() {
  useDocumentTitle("Add monitor");
  const limits = useLimits();
  const create = useCreateMonitor();
  const initial = useMemo(
    () => (limits.data ? newFormValues(limits.data.allowedIntervalsSec) : null),
    [limits.data],
  );

  return (
    <>
      <PageHeader title="Add monitor" description="Choose what to check and how often." />

      {limits.isPending && (
        <div aria-busy="true" className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
        </div>
      )}
      {limits.isError && (
        <ErrorState
          title="Could not load your plan"
          error={limits.error}
          onRetry={() => void limits.refetch()}
          retrying={limits.isFetching}
        />
      )}

      {limits.data && initial && (
        <>
          {limits.data.monitorCount >= limits.data.maxMonitors && (
            <Alert tone="info" className="mb-4">
              You are using {limits.data.monitorCount} of {limits.data.maxMonitors} monitors on the{" "}
              {limits.data.plan} plan. Saving will be refused until you delete one or upgrade.
            </Alert>
          )}
          <MonitorForm
            initial={initial}
            limits={limits.data}
            submitLabel="Create monitor"
            cancelTo="/monitors"
            onSubmit={(payload) => create.mutate(payload)}
            pending={create.isPending}
            error={create.error}
            onEdit={create.reset}
          />
        </>
      )}
    </>
  );
}
