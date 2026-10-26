import { pino } from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "password",
      "*.password",
      "*.currentPassword",
      "*.newPassword",
    ],
    censor: "[redacted]",
  },
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});
