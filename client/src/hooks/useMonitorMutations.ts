import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { ApiError } from "../services/api";
import { monitorsApi } from "../services/monitorsApi";
import { queryKeys } from "../services/queryKeys";
import type { Check, MonitorDetail, MonitorInput } from "../types/api";
import { getErrorMessage } from "../utils/errors";
import { formatMs } from "../utils/time";

/** After any change to monitors, drop everything that shows them: lists, details, checks, stats, the dashboard, incidents and the usage counter. */
export function useRefreshMonitorData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents }),
      queryClient.invalidateQueries({ queryKey: queryKeys.limits }),
    ]);
}

export function useCreateMonitor() {
  const refresh = useRefreshMonitorData();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: MonitorInput) => monitorsApi.create(input),
    onSuccess: async (monitor) => {
      toast.success(`"${monitor.name}" created. The first check runs shortly.`);
      await refresh();
      void navigate(`/monitors/${monitor.id}`);
    },
    // The form shows the error next to the field (or in its banner), so no toast here
  });
}

export function useUpdateMonitor(id: string) {
  const refresh = useRefreshMonitorData();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: MonitorInput) => monitorsApi.update(id, input),
    onSuccess: async (monitor) => {
      toast.success("Changes saved");
      await refresh();
      void navigate(`/monitors/${monitor.id}`);
    },
  });
}

/** The toast text for a finished manual check: what happened, in words. */
export function describeCheck(check: Check): {
  tone: "success" | "warning" | "error";
  text: string;
} {
  if (check.outcome === "SUCCESS") {
    return {
      tone: "success",
      text: `Check passed: ${check.statusCode ?? "OK"} in ${formatMs(check.responseTimeMs)}`,
    };
  }
  if (check.outcome === "SLOW") {
    return {
      tone: "warning",
      text: `Slow response: ${check.statusCode ?? "OK"} took ${formatMs(check.responseTimeMs)}`,
    };
  }
  return { tone: "error", text: `Check failed: ${check.errorMessage ?? "no response"}` };
}

/** Rate-limit (429) and "already running" (409) messages are specific and useful: show them as the server wrote them. */
function actionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 429 || error.status === 409))
    return error.message;
  return getErrorMessage(error, fallback);
}

/** Check now, pause, resume, duplicate and delete for one monitor, each with loading state and a toast for success and failure (PRD section 38). */
export function useMonitorActions(id: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshMonitorData();
  const navigate = useNavigate();

  const checkNow = useMutation({
    mutationFn: () => monitorsApi.checkNow(id),
    onSuccess: async (check) => {
      const { tone, text } = describeCheck(check);
      toast[tone](text);
      // A manual check never changes the monitor row, so only the check list needs to refresh
      await queryClient.invalidateQueries({ queryKey: queryKeys.monitorChecks(id) });
    },
    onError: (e) => toast.error(actionError(e, "Could not run the check.")),
  });

  const afterStateChange = async (monitor: MonitorDetail) => {
    queryClient.setQueryData(queryKeys.monitor(id), monitor); // show the new state before the refetch lands
    await refresh();
  };

  const pause = useMutation({
    mutationFn: () => monitorsApi.pause(id),
    onSuccess: async (monitor) => {
      await afterStateChange(monitor);
      toast.success("Monitor paused. Open incidents were closed.");
    },
    onError: (e) => toast.error(actionError(e, "Could not pause the monitor.")),
  });

  const resume = useMutation({
    mutationFn: () => monitorsApi.resume(id),
    onSuccess: async (monitor) => {
      await afterStateChange(monitor);
      toast.success("Monitor resumed. The next check starts shortly.");
    },
    onError: (e) => toast.error(actionError(e, "Could not resume the monitor.")),
  });

  const duplicate = useMutation({
    mutationFn: () => monitorsApi.duplicate(id),
    onSuccess: async (copy) => {
      await refresh();
      toast.success(`Created "${copy.name}"`);
      void navigate(`/monitors/${copy.id}`);
    },
    // Most likely the plan limit: the server's message already says what to do
    onError: (e) => toast.error(actionError(e, "Could not duplicate the monitor.")),
  });

  const remove = useMutation({
    mutationFn: () => monitorsApi.remove(id),
    onSuccess: async () => {
      toast.success("Monitor deleted");
      void navigate("/monitors", { replace: true }); // leave the detail page first, so nothing refetches a monitor that is gone
      queryClient.removeQueries({ queryKey: queryKeys.monitor(id) });
      await refresh();
    },
    onError: (e) => toast.error(actionError(e, "Could not delete the monitor.")),
  });

  return { checkNow, pause, resume, duplicate, remove };
}
