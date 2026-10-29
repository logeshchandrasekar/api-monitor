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

export const env = parsed.data;
