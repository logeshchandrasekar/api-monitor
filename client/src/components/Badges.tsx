import type { CheckOutcome, IncidentStatus, IncidentType } from "../types/api";
import { cn } from "../utils/cn";
import { INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL, OUTCOME_LABEL } from "../utils/labels";

const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

// Whole class names on purpose (Tailwind scans for complete strings)
const outcomeStyle: Record<CheckOutcome, string> = {
  SUCCESS: "bg-healthy-soft text-healthy-ink",
  SLOW: "bg-degraded-soft text-degraded-ink",
  FAILURE: "bg-down-soft text-down-ink",
};

export function OutcomeBadge({ outcome }: { outcome: CheckOutcome }) {
  return <span className={cn(pill, outcomeStyle[outcome])}>{OUTCOME_LABEL[outcome]}</span>;
}

/** Marks a check someone started with "Check now". Manual checks never affect status or uptime. */
export function ManualTag() {
  return (
    <span
      title="Started with Check now. Manual checks do not change the status or uptime."
      className={cn(pill, "bg-subtle text-fg-muted ring-1 ring-line")}
    >
      Manual
    </span>
  );
}

const incidentTypeStyle: Record<IncidentType, string> = {
  DOWN: "bg-down-soft text-down-ink",
  DEGRADED: "bg-degraded-soft text-degraded-ink",
};

export function IncidentTypeBadge({ type }: { type: IncidentType }) {
  return <span className={cn(pill, incidentTypeStyle[type])}>{INCIDENT_TYPE_LABEL[type]}</span>;
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={cn(
        pill,
        status === "OPEN" ? "bg-down-soft text-down-ink" : "bg-healthy-soft text-healthy-ink",
      )}
    >
      {INCIDENT_STATUS_LABEL[status]}
    </span>
  );
}
