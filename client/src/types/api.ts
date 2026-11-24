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
/**
 * `recent` (the 24-hour strip) is only sent by GET /api/monitors/:id. The responses of create, update, pause,
 * resume and duplicate are the same type without it, hence optional.
 */
export type MonitorDetail = Monitor & {
  headers: MonitorHeader[];
  body: string | null;
  recent?: Tick[];
};

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
  /** Average response time of the answered scheduled checks in the last 24 h, or null when there were none. */
  avgResponseMs24h: number | null;
  activeIncidentCount: number;
  activeIncidents: Incident[];
};

/** Every list endpoint answers { items, nextCursor }. */
export type Paginated<T> = { items: T[]; nextCursor: string | null };

/** The standard error body (API-1). */
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

// ---- Phase 6 ------------------------------------------------------------------------------

/** One cell of the 24-hour strip: the worst thing that happened in that UTC hour ("none" = no scheduled check). */
export type Tick = "up" | "slow" | "down" | "none";

/**
 * GET /api/monitors adds two things to every item:
 * - uptime24h: percent with 2 decimals, null until there is a scheduled check.
 * - recent: exactly 24 ticks, one per hour, oldest first; the last one is the hour still in progress.
 */
export type MonitorListItem = Monitor & { uptime24h: number | null; recent: Tick[] };

/** GET /api/users/me/limits: what the plan allows and how much of it is used. */
export type PlanLimits = {
  plan: Plan;
  maxMonitors: number;
  monitorCount: number;
  minIntervalSec: number;
  /** Includes 10 s and 30 s outside production. */
  allowedIntervalsSec: number[];
  maxTimeoutMs: number;
  retentionDays: number;
};

export type StatsRange = "24h" | "7d" | "30d";

/** GET /api/monitors/:id/stats?range=. Scheduled checks only; "successful" includes slow ones. */
export type MonitorStats = {
  range: StatsRange;
  totalChecks: number;
  successfulChecks: number;
  slowChecks: number;
  failedChecks: number;
  uptimePct: number | null;
  avgResponseMs: number | null;
  minResponseMs: number | null;
  maxResponseMs: number | null;
};

/** What the create and edit endpoints accept. A saved sensitive header is sent as { name, keepExisting: true }. */
export type MonitorHeaderInput = { name: string; value?: string; keepExisting?: boolean };

export type MonitorInput = {
  name: string;
  url: string;
  method: string;
  intervalSec: number;
  expectedStatus: number;
  timeoutMs: number;
  responseThresholdMs: number;
  followRedirects: boolean;
  headers: MonitorHeaderInput[];
  /** null clears the body. */
  body: string | null;
  tags?: string[];
};

/** One entry of GET /api/monitors/tags. */
export type TagCount = { name: string; count: number };

export type MonitorSort = "created" | "name" | "status" | "lastChecked" | "responseTime";

// ---- Phase 7: analytics -------------------------------------------------------------------------

/** One chart point: all the scheduled checks that fell into one time bucket. total 0 is a gap. */
export type AnalyticsPoint = {
  /** Start of the bucket (UTC clock boundary), ISO 8601. */
  at: string;
  total: number;
  /** Includes slow ones, like AnalyticsStats.successfulChecks. */
  successful: number;
  slow: number;
  failed: number;
  /** null when the bucket has no checks. */
  uptimePct: number | null;
  /** null when no check in the bucket got an answer (a timeout has no response time). */
  avgMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type AnalyticsStats = {
  /** The last scheduled check, the same number the monitor header shows. */
  currentMs: number | null;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  /** 95 % of the checks were faster than this. */
  p95Ms: number | null;
  uptimePct: number | null;
  totalChecks: number;
  successfulChecks: number;
  slowChecks: number;
  failedChecks: number;
  /** Incidents that STARTED inside the range. */
  totalIncidents: number;
};

/** An incident that overlaps the range, for shading the uptime chart. */
export type AnalyticsIncident = {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
};

/** GET /api/monitors/:id/analytics?range= */
export type MonitorAnalytics = {
  range: StatsRange;
  /** Width of one point in seconds: 900 (24 h), 3600 (7 d) or 21600 (30 d). */
  bucketSec: number;
  from: string;
  to: string;
  stats: AnalyticsStats;
  /** Consecutive buckets, oldest first: 97, 169 or 121 points. */
  series: AnalyticsPoint[];
  incidents: AnalyticsIncident[];
};

/** GET and PUT /api/monitors/:id/alerts (Phase 8). */
export type AlertSettings = {
  notifyOnDown: boolean;
  notifyOnRecovery: boolean;
  notifyOnSlow: boolean;
  cooldownMinutes: number;
  /** What was saved. null means "my account email". */
  recipientEmail: string | null;
  /** Where mail will really go: the saved recipient, or the account email. */
  effectiveRecipient: string;
};

/** What PUT sends: every field, because PUT replaces the whole rule. */
export type AlertSettingsInput = Omit<AlertSettings, "effectiveRecipient">;

export type NotificationType = "DOWN" | "DEGRADED" | "RECOVERED" | "TEST";
export type NotificationStatus = "QUEUED" | "SENT" | "SUPPRESSED" | "FAILED";

/** One row of a monitor's notification history. */
export type NotificationItem = {
  id: string;
  incidentId: string | null;
  type: NotificationType;
  status: NotificationStatus;
  recipient: string;
  attempts: number;
  /** A short safe sentence for a failed or retrying send. */
  error: string | null;
  /** Why a row was suppressed. */
  note: string | null;
  eventAt: string;
  sentAt: string | null;
  createdAt: string;
};
