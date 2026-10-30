import { z } from "zod";

export const listIncidentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  status: z.enum(["OPEN", "RESOLVED"]).optional(),
  type: z.enum(["DOWN", "DEGRADED"]).optional(),
  monitorId: z.uuid().optional(),
});

// The monitor is already in the URL for /api/monitors/:id/incidents
export const listMonitorIncidentsQuerySchema = listIncidentsQuerySchema.omit({ monitorId: true });

export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;
export type ListMonitorIncidentsQuery = z.infer<typeof listMonitorIncidentsQuerySchema>;
