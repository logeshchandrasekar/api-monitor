import { useMonitorChecks } from "../../hooks/useMonitors";
import { FAILURE_LABEL } from "../../utils/labels";
import { formatDateTime, formatMs, formatRelative } from "../../utils/time";
import { ManualTag, OutcomeBadge } from "../Badges";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { LoadMore } from "../LoadMore";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/** Recent checks, newest first, 20 at a time. Manual checks carry a tag. The table scrolls inside its card, never the page. */
export function ChecksTable({ monitorId, now }: { monitorId: string; now: number }) {
  const q = useMonitorChecks(monitorId);
  const checks = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card title="Recent checks">
      {q.isPending && (
        <div aria-busy="true" className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      )}

      {q.isError && (
        <ErrorState
          title="Could not load checks"
          error={q.error}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      )}

      {q.data && checks.length === 0 && (
        <EmptyState
          title="No checks yet"
          description="The first check runs shortly after the monitor is created. You can also use Check now."
        />
      )}

      {checks.length > 0 && (
        <>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    When
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Result
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Response
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 whitespace-nowrap" title={formatDateTime(c.checkedAt)}>
                      {formatRelative(c.checkedAt, now)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <OutcomeBadge outcome={c.outcome} />
                        {c.trigger === "MANUAL" && <ManualTag />}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{c.statusCode ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatMs(c.responseTimeMs)}</td>
                    <td className="py-2 text-fg-muted">
                      {c.errorMessage ?? (c.failureType ? FAILURE_LABEL[c.failureType] : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
