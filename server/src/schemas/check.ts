import { z } from "zod";

export const CHECK_RANGES = ["1h", "24h", "7d", "30d"] as const;

/** The analytics endpoint has no 1 h range: its buckets (15 min, 1 h, 6 h) are for 24 h and longer (DAT-3). */
export const ANALYTICS_RANGES = ["24h", "7d", "30d"] as const;

export const listChecksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Check ids are BigInt in the database; on the wire they are digit strings
  cursor: z
    .string()
    .regex(/^\d{1,18}$/, "Invalid cursor")
    .optional(),
  range: z.enum(CHECK_RANGES).optional(),
});

export type ListChecksQuery = z.infer<typeof listChecksQuerySchema>;

export const statsQuerySchema = z.object({ range: z.enum(CHECK_RANGES).default("24h") });

export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const analyticsQuerySchema = z.object({ range: z.enum(ANALYTICS_RANGES).default("24h") });

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
