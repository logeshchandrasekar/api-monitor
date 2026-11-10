import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { POLL_DETAIL_MS } from "../config";
import { ApiError } from "../services/api";
import { monitorsApi } from "../services/monitorsApi";
import { queryKeys } from "../services/queryKeys";
import type { AlertSettingsInput } from "../types/api";
import { getErrorMessage } from "../utils/errors";

/** The monitor's alert rule. Not polled: nothing changes it except the person using this form. */
export function useAlertSettings(monitorId: string) {
  return useQuery({
    queryKey: queryKeys.monitorAlerts(monitorId),
    queryFn: ({ signal }) => monitorsApi.alerts(monitorId, signal),
  });
}

/** Saves the whole rule. The form shows field errors itself, so there is no error toast here. */
export function useSaveAlertSettings(monitorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AlertSettingsInput) => monitorsApi.saveAlerts(monitorId, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.monitorAlerts(monitorId), saved);
      toast.success("Alert settings saved");
    },
  });
}

/** "Send test email": the server answers only when the mail server did, so the toast tells the truth. */
export function useSendTestEmail(monitorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => monitorsApi.sendTestEmail(monitorId),
    onSuccess: async (n) => {
      toast.success(`Test email sent to ${n.recipient}`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.monitorNotifications(monitorId) });
    },
    onError: async (e) => {
      // 502 EMAIL_SEND_FAILED, 429 (rate limit): the server's sentence is written for people. Other 5xx are not.
      const readable =
        e instanceof ApiError && (e.code === "EMAIL_SEND_FAILED" || e.status === 429)
          ? e.message
          : getErrorMessage(e, "Could not send the test email.");
      toast.error(readable);
      await queryClient.invalidateQueries({ queryKey: queryKeys.monitorNotifications(monitorId) }); // a failed test is in the history too
    },
  });
}

/** What was sent, suppressed or failed for this monitor, newest first, 10 at a time. */
export function useMonitorNotifications(monitorId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.monitorNotifications(monitorId),
    queryFn: ({ pageParam, signal }) =>
      monitorsApi.notifications(monitorId, { cursor: pageParam, limit: 10 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: POLL_DETAIL_MS,
  });
}
