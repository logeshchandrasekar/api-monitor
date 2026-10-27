import { z } from "zod";
import { FORBIDDEN_HEADERS, HEADER_NAME_RE } from "../utils/headers.js";

export const MAX_BODY_BYTES = 64 * 1024;

const headerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Header name is required")
    .max(100, "Header name is too long")
    .regex(HEADER_NAME_RE, "Header name contains invalid characters")
    .refine(
      (n) => !FORBIDDEN_HEADERS.has(n.toLowerCase()) && !n.toLowerCase().startsWith("proxy-"),
      "This header is set by API Monitor and cannot be overridden",
    ),
  value: z
    .string()
    .max(4096, "Header value is too long")
    .refine((v) => !/[\r\n\0]/.test(v), "Header values cannot contain line breaks")
    .optional(),
  keepExisting: z.boolean().optional(),
});

const headersSchema = z
  .array(headerSchema)
  .max(20, "At most 20 headers")
  .refine(
    (hs) => new Set(hs.map((h) => h.name.toLowerCase())).size === hs.length,
    "Header names must be unique",
  );

const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, "Tags may use letters, numbers, spaces, - and _");

// No .default() anywhere on purpose: defaults are applied by the service on create only,
// so PATCH (the partial version of this schema) can never overwrite a field the client did not send.
export const createMonitorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().trim().max(500).nullable().optional(),
  url: z.string().trim().min(1, "URL is required").max(2048),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).optional(),
  headers: headersSchema.optional(),
  body: z
    .string()
    .refine((v) => Buffer.byteLength(v, "utf8") <= MAX_BODY_BYTES, "Body is too large (64 KB max)")
    .nullable()
    .optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  followRedirects: z.boolean().optional(),
  intervalSec: z.number().int().positive(),
  timeoutMs: z.number().int().min(1000).max(30_000).optional(),
  responseThresholdMs: z.number().int().min(50).max(60_000).optional(),
  tags: z.array(tagSchema).max(10, "At most 10 tags").optional(),
});

export const updateMonitorSchema = createMonitorSchema.partial();

export const listMonitorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  status: z.enum(["PENDING", "HEALTHY", "DEGRADED", "DOWN", "PAUSED"]).optional(),
});

export const idParamsSchema = z.object({ id: z.uuid() });

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
export type ListMonitorsQuery = z.infer<typeof listMonitorsQuerySchema>;
