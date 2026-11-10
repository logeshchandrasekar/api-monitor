import { BellOff, Mail } from "lucide-react";
import { Link } from "react-router";
import { useMonitorNotifications } from "../../hooks/useAlerts";
import { describeNotification } from "../../utils/alerts";
import { formatDateTime, formatRelative } from "../../utils/time";
import { NotificationStatusBadge, NotificationTypeBadge } from "../Badges";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { LoadMore } from "../LoadMore";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/** What was emailed, held back (cooldown) or failed for this monitor. The newest row is at the top. */
export function NotificationHistory({ monitorId, now }: { monitorId: string; now: number }) {
  const q = useMonitorNotifications(monitorId);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  // `now` ticks every 30 s, so a row created after the last tick would read "in 5 s". Nothing here is in the future.
  const ago = (iso: string) => formatRelative(iso, Math.max(now, new Date(iso).getTime()));

  return (
    <Card title="Notification history">
      {q.isPending && (
        <div aria-busy="true" className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {q.isError && (
        <ErrorState
          title="Could not load the notification history"
          error={q.error}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      )}

      {q.data && rows.length === 0 && (
        <EmptyState
          icon={BellOff}
          title="No notifications yet"
          description="An email is sent when this monitor goes down, gets slow or recovers. Use Send test email above to check that it reaches you."
        />
      )}

      {rows.length > 0 && (
        <>
          <ul className="-mx-5 -mb-5 -mt-5 divide-y divide-line">
            {rows.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-5 py-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex flex-wrap items-center gap-2">
                    <NotificationTypeBadge type={n.type} />
                    <NotificationStatusBadge status={n.status} />
                    {n.incidentId && (
                      <Link
                        to={`/incidents/${n.incidentId}`}
                        className="text-xs text-fg-muted underline hover:text-fg"
                      >
                        View incident
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{describeNotification(n)}</p>
                </div>
                <time
                  dateTime={n.createdAt}
                  title={formatDateTime(n.createdAt)}
                  className="text-sm text-fg-muted"
                >
                  {ago(n.createdAt)}
                </time>
              </li>
            ))}
          </ul>
          <div className="pb-5" />
          <LoadMore
            hasNextPage={q.hasNextPage}
            loading={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          />
        </>
      )}
    </Card>
  );
}
