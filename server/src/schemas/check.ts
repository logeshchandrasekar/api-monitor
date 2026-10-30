import { z } from "zod";

export const CHECK_RANGES = ["1h", "24h", "7d", "30d"] as const;

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
