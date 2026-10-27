import type { MonitorRow } from "../services/monitors.js";
import { decrypt } from "./crypto.js";
import { decryptHeaders, maskHeaders } from "./headers.js";

/**
 * Public shape of a monitor. Never includes the encrypted columns.
 * `detail: true` (single-monitor endpoints) adds headers (sensitive values masked) and the body.
 */
export function serializeMonitor(m: MonitorRow, opts: { detail: boolean }) {
  const base = {
    id: m.id,
    name: m.name,
    description: m.description,
    url: m.url,
    method: m.method,
    expectedStatus: m.expectedStatus,
    followRedirects: m.followRedirects,
    intervalSec: m.intervalSec,
    timeoutMs: m.timeoutMs,
    responseThresholdMs: m.responseThresholdMs,
    failureThreshold: m.failureThreshold,
    slowThreshold: m.slowThreshold,
    status: m.status,
    isPaused: m.isPaused,
    failStreak: m.failStreak,
    lastCheckedAt: m.lastCheckedAt,
    lastStatusCode: m.lastStatusCode,
    lastResponseTimeMs: m.lastResponseTimeMs,
    lastStatusChangeAt: m.lastStatusChangeAt,
    nextCheckAt: m.nextCheckAt,
    tags: m.tags,
    hasBody: m.bodyEnc !== null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
  if (!opts.detail) return base;
  return {
    ...base,
    headers: maskHeaders(decryptHeaders(m.headersEnc)),
    body: m.bodyEnc ? decrypt(m.bodyEnc) : null,
  };
}
