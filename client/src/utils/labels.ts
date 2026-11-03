import type {
  CheckOutcome,
  FailureType,
  IncidentResolution,
  IncidentStatus,
  IncidentType,
} from "../types/api";

/** Plain-language names for the server's enums. Every enum shown to a person goes through here. */
export const OUTCOME_LABEL: Record<CheckOutcome, string> = {
  SUCCESS: "Success",
  SLOW: "Slow",
  FAILURE: "Failed",
};

export const FAILURE_LABEL: Record<FailureType, string> = {
  TIMEOUT: "Timeout",
  DNS: "DNS error",
  CONNECTION: "Connection error",
  TLS: "TLS error",
  UNEXPECTED_STATUS: "Unexpected status",
  BLOCKED_TARGET: "Blocked target",
  OTHER: "Other error",
};

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  DOWN: "Down",
  DEGRADED: "Degraded",
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: "Ongoing",
  RESOLVED: "Resolved",
};

export const RESOLUTION_LABEL: Record<IncidentResolution, string> = {
  RECOVERED: "Recovered",
  PAUSED: "Monitor was paused",
  CONFIG_CHANGED: "Monitor settings changed",
};
