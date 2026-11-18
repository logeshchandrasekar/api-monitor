import { pino } from "pino";
import { env } from "../config/env.js";

/**
 * Fields that must never reach a log line (SEC-2). Exported so a test can prove the list works.
 * Request headers carry the session cookie and any API keys; a monitor's stored headers and body are
 * ciphertext, and the plain versions only exist in memory while a check runs.
 */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.proxy-authorization",
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "headers",
  "body",
  "*.headersEnc",
  "*.bodyEnc",
  "monitor.headers",
  "monitor.body",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: LOG_REDACT_PATHS,
    censor: "[redacted]",
  },
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});
