import type { AlertRule } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import type { UpdateAlertRuleInput } from "../schemas/alerts.js";
import type { Tx } from "./incidentLifecycle.js";
import { getMonitor } from "./monitors.js";

/** The settings every monitor starts with (the same numbers as the column defaults in schema.prisma). */
export const ALERT_DEFAULTS = {
  notifyOnDown: true,
  notifyOnRecovery: true,
  notifyOnSlow: true,
  cooldownMinutes: 30,
  recipientEmail: null,
} as const;

/**
 * The rule of a monitor, created with the defaults if it is somehow missing (a monitor made by a script, or
 * by an older build). One atomic upsert, so two callers racing cannot create two rows. Safe inside a transaction.
 */
export function ensureRule(db: Tx, monitorId: string): Promise<AlertRule> {
  return db.alertRule.upsert({
    where: { monitorId },
    update: {},
    create: { monitorId },
  });
}

export type AlertSettings = {
  notifyOnDown: boolean;
  notifyOnRecovery: boolean;
  notifyOnSlow: boolean;
  cooldownMinutes: number;
  /** What the person saved; null means "my account email". */
  recipientEmail: string | null;
  /** Where mail will really go: recipientEmail, or the account email. */
  effectiveRecipient: string;
};

export function serializeRule(rule: AlertRule, accountEmail: string): AlertSettings {
  return {
    notifyOnDown: rule.notifyOnDown,
    notifyOnRecovery: rule.notifyOnRecovery,
    notifyOnSlow: rule.notifyOnSlow,
    cooldownMinutes: rule.cooldownMinutes,
    recipientEmail: rule.recipientEmail,
    effectiveRecipient: rule.recipientEmail ?? accountEmail,
  };
}

type Account = { id: string; email: string };

export async function getAlertSettings(user: Account, monitorId: string): Promise<AlertSettings> {
  await getMonitor(user.id, monitorId); // 404 if the monitor is not yours (SEC-4)
  return serializeRule(await ensureRule(prisma, monitorId), user.email);
}

/** PUT replaces the whole rule: every field is required by the schema, so nothing is left half-updated. */
export async function updateAlertSettings(
  user: Account,
  monitorId: string,
  input: UpdateAlertRuleInput,
): Promise<AlertSettings> {
  await getMonitor(user.id, monitorId);
  const rule = await prisma.alertRule.upsert({
    where: { monitorId },
    update: input,
    create: { monitorId, ...input },
  });
  return serializeRule(rule, user.email);
}