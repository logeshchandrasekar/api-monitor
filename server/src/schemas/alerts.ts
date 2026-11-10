import { z } from "zod";

export const MIN_COOLDOWN_MINUTES = 1;
export const MAX_COOLDOWN_MINUTES = 1440; // one day

// PUT replaces the whole rule, so every field is required. recipientEmail: null means "my account email".
export const updateAlertRuleSchema = z.object({
  notifyOnDown: z.boolean(),
  notifyOnRecovery: z.boolean(),
  notifyOnSlow: z.boolean(),
  cooldownMinutes: z
    .number()
    .int("Cooldown must be a whole number of minutes")
    .min(MIN_COOLDOWN_MINUTES, "Cooldown must be at least 1 minute")
    .max(MAX_COOLDOWN_MINUTES, "Cooldown cannot be longer than 24 hours"),
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email address is too long")
    .pipe(z.email("Enter a valid email address"))
    .nullable(),
});

export type UpdateAlertRuleInput = z.infer<typeof updateAlertRuleSchema>;

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
