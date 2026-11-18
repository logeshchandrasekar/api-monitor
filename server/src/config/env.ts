import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().startsWith("postgres"),
  CLIENT_URL: z.url().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "ENCRYPTION_KEY must be 32 bytes, base64-encoded",
    ),
  ALLOW_PRIVATE_TARGETS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  ENABLE_SCHEDULER: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SCHEDULER_TICK_MS: z.coerce.number().int().min(500).max(60_000).default(15_000),
  // How many batches of 50 one scheduler tick may claim back to back while monitors are still due.
  // 1 is the original behavior (at most 50 checks per tick). 10 lets 200 monitors at 30 s keep up at a 15 s tick.
  SCHEDULER_MAX_BATCHES: z.coerce.number().int().min(1).max(100).default(10),
  // Phase 9: the daily job that deletes checks older than the plan's retention (DAT-3).
  ENABLE_RETENTION: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Email (Phase 8). Local development talks to Mailpit: host localhost, port 1025, no login.
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  // A blank value in .env (SMTP_USER=) means "no login"
  SMTP_USER: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SMTP_PASS: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  MAIL_FROM: z.string().min(3).default("API Monitor <alerts@apimonitor.local>"),
  // Like ENABLE_SCHEDULER: the dispatcher runs inside the API process, and can be switched off for a separate worker later.
  ENABLE_DISPATCHER: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DISPATCH_TICK_MS: z.coerce.number().int().min(250).max(60_000).default(5_000),
  // The first retry waits this long, the second 4x, the third 20x (30 s, 2 min, 10 min by default)
  ALERT_RETRY_BASE_MS: z.coerce.number().int().min(100).max(300_000).default(30_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

if (parsed.data.NODE_ENV === "production" && parsed.data.ALLOW_PRIVATE_TARGETS) {
  console.error("ALLOW_PRIVATE_TARGETS must not be true in production. Refusing to start.");
  process.exit(1);
}

if (parsed.data.NODE_ENV === "production" && !process.env.SMTP_HOST) {
  console.error("SMTP_HOST is required in production (alerts are emails). Refusing to start.");
  process.exit(1);
}

export const env = parsed.data;
