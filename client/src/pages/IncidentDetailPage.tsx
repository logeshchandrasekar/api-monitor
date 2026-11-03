import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { IncidentStatusBadge, IncidentTypeBadge } from "../components/Badges";
import { ErrorState } from "../components/ErrorState";
import { ButtonLink } from "../components/ui/ButtonLink";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useIncident } from "../hooks/useIncidents";
import { ApiError } from "../services/api";
import { FAILURE_LABEL, RESOLUTION_LABEL } from "../utils/labels";
import { formatDateTime, formatDuration } from "../utils/time";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function IncidentDetailPage() {
  const { id = "" } = useParams();
  const q = useIncident(id);
  useDocumentTitle(q.data ? `${q.data.monitorName} incident` : "Incident");

  if (q.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <ErrorState
        className="mt-6"
        title={notFound ? "Incident not found" : "Could not load the incident"}
        error={q.error}
        onRetry={notFound ? undefined : () => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }

  const i = q.data;
  return (
    <>
      <Link
        to="/incidents"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Incidents
      </Link>
      <Card
        title={i.monitorName}
        description={i.reason}
        action={
          <ButtonLink to={`/monitors/${i.monitorId}`} variant="secondary" size="sm">
            Open monitor
          </ButtonLink>
        }
      >
        <dl className="-my-3 divide-y divide-line">
          <Row label="Status">
            <span className="inline-flex flex-wrap items-center gap-2">
              <IncidentStatusBadge status={i.status} />
              <IncidentTypeBadge type={i.type} />
            </span>
          </Row>
          <Row label="Started">{formatDateTime(i.startedAt)}</Row>
          <Row label="Resolved">
            {i.resolvedAt ? formatDateTime(i.resolvedAt) : "Still ongoing"}
          </Row>
          <Row label={i.ongoing ? "Lasting" : "Duration"}>{formatDuration(i.durationSec)}</Row>
          <Row label="Failed checks">{i.failedChecks}</Row>
          <Row label="Cause">{i.failureType ? FAILURE_LABEL[i.failureType] : "Slow responses"}</Row>
          <Row label="How it ended">
            {i.resolution ? RESOLUTION_LABEL[i.resolution] : "Not resolved yet"}
          </Row>
        </dl>
      </Card>
    </>
  );
}
