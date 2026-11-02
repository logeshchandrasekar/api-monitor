// Hand-written mirror of the server's response shapes (progress summary, section 4).
// When a serializer changes on the server, change it here too: this file is the only copy.

export type Plan = "FREE" | "PRO" | "TEAM";

export type User = {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  createdAt: string;
};

/** "Paused" is NOT a status: it is the `isPaused` flag. Use getDisplayStatus() to get all five UI states. */
export type MonitorStatus = "PENDING" | "HEALTHY" | "DEGRADED" | "DOWN";

export type FailureType =
  "TIMEOUT" | "DNS" | "CONNECTION" | "TLS" | "UNEXPECTED_STATUS" | "BLOCKED_TARGET" | "OTHER";

export type Monitor = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  method: string;
  expectedStatus: number;
  followRedirects: boolean;
  intervalSec: number;
  timeoutMs: number;
  responseThresholdMs: number;
  failureThreshold: number;
  slowThreshold: number;
  status: MonitorStatus;
  isPaused: boolean;
  /** Consecutive failed checks so far: lets the UI say "1 failed check" while the status is still HEALTHY. */
  failStreak: number;
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastResponseTimeMs: number | null;
  lastStatusChangeAt: string | null;
  nextCheckAt: string | null;
  tags: string[];
  hasBody: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Sensitive header values are never returned: value is null and sensitive is true. */
export type MonitorHeader = { name: string; value: string | null; sensitive: boolean };

/** Returned by the single-monitor endpoints (adds headers and body). */
export type MonitorDetail = Monitor & { headers: MonitorHeader[]; body: string | null };

export type CheckTrigger = "SCHEDULED" | "MANUAL";
export type CheckOutcome = "SUCCESS" | "SLOW" | "FAILURE";

export type Check = {
  /** BigInt on the server, so a string here. */
  id: string;
  trigger: CheckTrigger;
  outcome: CheckOutcome;
  failureType: FailureType | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  /** Human text, never a raw error code. */
  errorMessage: string | null;
  checkedAt: string;
};

export type IncidentType = "DOWN" | "DEGRADED";
export type IncidentStatus = "OPEN" | "RESOLVED";
export type IncidentResolution = "RECOVERED" | "PAUSED" | "CONFIG_CHANGED";

export type Incident = {
  id: string;
  monitorId: string;
  monitorName: string;
  type: IncidentType;
  status: IncidentStatus;
  ongoing: boolean;
  reason: string;
  failureType: FailureType | null;
  failedChecks: number;
  startedAt: string;
  resolvedAt: string | null;
  resolution: IncidentResolution | null;
  /** Live value while the incident is open. */
  durationSec: number;
};

export type DashboardSummary = {
  monitors: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    pending: number;
    paused: number;
  };
  /** Percent with 2 decimals, or null when there were no scheduled checks in the last 24 h. */
  uptime24h: number | null;
  checks24h: number;
  activeIncidentCount: number;
  activeIncidents: Incident[];
};

/** Every list endpoint answers { items, nextCursor }. */
export type Paginated<T> = { items: T[]; nextCursor: string | null };

/** The standard error body (API-1). */
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };
