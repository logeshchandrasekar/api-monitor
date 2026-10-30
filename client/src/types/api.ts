// Hand-written API types. They must match what the server serializers return (progress summary, section 4).
// When a server serializer changes, change the matching type here.

export type Plan = "FREE" | "PRO" | "TEAM";

export interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  createdAt?: string;
}

/** PENDING | HEALTHY | DEGRADED | DOWN. "Paused" is NOT a status: it is the `isPaused` flag. */
export type MonitorStatus = "PENDING" | "HEALTHY" | "DEGRADED" | "DOWN";

export interface Monitor {
  id: string;
  name: string;
  description: string | null;
  url: string;
  method: string; // GET, POST, ...: the exact list is in server/src/schemas/monitor.ts
  expectedStatus: number;
  followRedirects: boolean;
  intervalSec: number;
  timeoutMs: number;
  responseThresholdMs: number;
  failureThreshold: number;
  slowThreshold: number;
  status: MonitorStatus;
  isPaused: boolean;
  failStreak: number; // lets the UI say "1 failed check" while the status is still HEALTHY
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastResponseTimeMs: number | null;
  lastStatusChangeAt: string | null;
  nextCheckAt: string | null;
  tags: string[];
  hasBody: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Header as returned by the single-monitor endpoints. Sensitive values are never returned (value is null). */
export interface MonitorHeader {
  name: string;
  value: string | null;
  sensitive: boolean;
}

/** GET/PATCH/POST of ONE monitor adds headers and body */
export interface MonitorDetail extends Monitor {
  headers: MonitorHeader[];
  body: string | null;
}

export type CheckTrigger = "SCHEDULED" | "MANUAL";
export type CheckOutcome = "SUCCESS" | "SLOW" | "FAILURE";
export type FailureType =
  "TIMEOUT" | "DNS" | "CONNECTION" | "TLS" | "UNEXPECTED_STATUS" | "BLOCKED_TARGET" | "OTHER";

export interface Check {
  id: string; // BigInt on the server, so a string here
  trigger: CheckTrigger;
  outcome: CheckOutcome;
  failureType: FailureType | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null; // human text, never a raw error code
  checkedAt: string;
}

export type IncidentType = "DOWN" | "DEGRADED";
export type IncidentStatus = "OPEN" | "RESOLVED";
export type IncidentResolution = "RECOVERED" | "PAUSED" | "CONFIG_CHANGED";

export interface Incident {
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
  durationSec: number; // live value while the incident is open
}

export interface DashboardSummary {
  monitors: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    pending: number;
    paused: number; // a paused monitor is counted only here
  };
  uptime24h: number | null; // percent, or null when there are no scheduled checks yet
  checks24h: number;
  activeIncidentCount: number;
  activeIncidents: Incident[]; // at most 10
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** The standard error body of the API (API-1) */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
