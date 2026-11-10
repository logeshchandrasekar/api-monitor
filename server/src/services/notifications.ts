import { env } from "../config/env.js";
import type { Incident, NotificationLog, Monitor } from "../generated/prisma/client.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import type { ListNotificationsQuery } from "../schemas/alerts.js";
import { AppError } from "../utils/errors.js";
import { renderAlertEmail } from "./alertTemplates.js";
import { ensureRule } from "./alertRules.js";
import { describeSendError, getEmailService } from "./email.js";
import type { Tx } from "./incidentLifecycle.js";
import { getMonitor } from "./monitors.js";

type MonitorRef = Pick<Monitor, "id" | "userId">;

/** The link in every email. CLIENT_URL may or may not end with a slash. */
export const monitorLink = (monitorId: string) =>
  `${env.CLIENT_URL.replace(/\/+$/, "")}/monitors/${monitorId}`;

/**
 * Runs `work` inside a SAVEPOINT. If it throws, only its own writes are rolled back and the error is logged:
 * the surrounding transaction (the check row, the incident, the monitor's new status) still commits.
 * A plain try/catch is not enough in PostgreSQL: after any failed statement the whole transaction is poisoned
 * ("current transaction is aborted") until you roll back to a savepoint.
 */
export async function isolated(tx: Tx, label: string, work: () => Promise<void>): Promise<void> {
  await tx.$executeRaw`SAVEPOINT alert_enqueue`;
  try {
    await work();
    await tx.$executeRaw`RELEASE SAVEPOINT alert_enqueue`;
  } catch (err) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT alert_enqueue`;
    logger.error({ err, label }, "could not queue an alert; the check result was still stored");
  }
}

async function recipientFor(tx: Tx, monitor: MonitorRef, ruleRecipient: string | null) {
  if (ruleRecipient) return ruleRecipient;
  const user = await tx.user.findUniqueOrThrow({
    where: { id: monitor.userId },
    select: { email: true },
  });
  return user.email;
}

const minutesBetween = (later: Date, earlier: Date) =>
  Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60_000));

/**
 * An incident just opened. Writes at most one NotificationLog row, in the caller's transaction (ALT-2):
 *  - the matching checkbox is off      -> no row (nothing was ever going to be sent)
 *  - an alert of this type for this monitor is inside the cooldown -> a SUPPRESSED row that says why
 *  - otherwise                         -> a QUEUED row; the dispatcher sends it after the commit
 * The cooldown is measured between the CHECKS' times (eventAt), not wall-clock time of the insert. Only
 * rows that are QUEUED or SENT start a cooldown: an alert that FAILED never reached anyone.
 */
export async function enqueueOpened(tx: Tx, monitor: MonitorRef, incident: Incident) {
  const rule = await ensureRule(tx, monitor.id);
  const type = incident.type; // DOWN | DEGRADED, same names as the notification types
  const enabled = type === "DOWN" ? rule.notifyOnDown : rule.notifyOnSlow;
  if (!enabled) return;

  const eventAt = incident.startedAt;
  const windowStart = new Date(eventAt.getTime() - rule.cooldownMinutes * 60_000);
  const recent = await tx.notificationLog.findFirst({
    where: {
      monitorId: monitor.id,
      type,
      status: { in: ["QUEUED", "SENT"] },
      eventAt: { gt: windowStart },
    },
    orderBy: { eventAt: "desc" },
  });

  const recipient = await recipientFor(tx, monitor, rule.recipientEmail);
  const common = { monitorId: monitor.id, incidentId: incident.id, type, recipient, eventAt };

  if (recent) {
    await tx.notificationLog.create({
      data: {
        ...common,
        status: "SUPPRESSED",
        note: `Cooldown: a ${type} alert for this monitor was already raised ${minutesBetween(eventAt, recent.eventAt)} min earlier (cooldown is ${rule.cooldownMinutes} min).`,
      },
    });
    return;
  }
  await tx.notificationLog.create({ data: { ...common, status: "QUEUED" } });
}

/**
 * An incident just resolved because the monitor recovered. A RECOVERED mail is only ever the second half
 * of a pair: it exists only if the alert that opened this incident was actually raised.
 *  - the incident was replaced by a worse one (DEGRADED -> DOWN) -> nothing
 *  - "notify on recovery" is off, or no alert was raised (box off, cooldown) -> nothing
 *  - the alert FAILED for good -> a SUPPRESSED row that says so
 *  - the alert is QUEUED or SENT -> a QUEUED row, sent to the same address the alert went to.
 *    (If the alert is still being retried, the dispatcher holds the recovery back until it has an outcome.)
 * There is deliberately no cooldown on RECOVERED: it is already limited by the cooldown on the alert it pairs with.
 */
export async function enqueueRecovered(
  tx: Tx,
  monitor: MonitorRef,
  incident: Incident,
  escalated: boolean,
) {
  if (escalated || !incident.resolvedAt) return;
  const rule = await ensureRule(tx, monitor.id);
  if (!rule.notifyOnRecovery) return;

  const alert = await tx.notificationLog.findFirst({
    where: { incidentId: incident.id, type: incident.type },
  });
  if (!alert || alert.status === "SUPPRESSED") return;

  const common = {
    monitorId: monitor.id,
    incidentId: incident.id,
    type: "RECOVERED" as const,
    recipient: alert.recipient,
    eventAt: incident.resolvedAt,
  };
  if (alert.status === "FAILED") {
    await tx.notificationLog.create({
      data: {
        ...common,
        status: "SUPPRESSED",
        note: `The ${incident.type} alert for this incident could not be delivered, so no recovery email is sent.`,
      },
    });
    return;
  }
  await tx.notificationLog.create({ data: { ...common, status: "QUEUED" } });
}

export type NotificationItem = {
  id: string;
  incidentId: string | null;
  type: NotificationLog["type"];
  status: NotificationLog["status"];
  recipient: string;
  attempts: number;
  error: string | null;
  note: string | null;
  eventAt: Date;
  sentAt: Date | null;
  createdAt: Date;
};

export const serializeNotification = (n: NotificationLog): NotificationItem => ({
  id: n.id,
  incidentId: n.incidentId,
  type: n.type,
  status: n.status,
  recipient: n.recipient,
  attempts: n.attempts,
  error: n.error,
  note: n.note,
  eventAt: n.eventAt,
  sentAt: n.sentAt,
  createdAt: n.createdAt,
});

/** The monitor's notification history, newest first. */
export async function listNotifications(
  userId: string,
  monitorId: string,
  query: ListNotificationsQuery,
) {
  await getMonitor(userId, monitorId);
  const rows = await prisma.notificationLog.findMany({
    where: { monitorId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    items: items.map(serializeNotification),
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

/**
 * "Send test email": sent right now, not queued, so the person sees the real outcome. A test is logged
 * either way (SENT or FAILED, one attempt, no retries). A failure is a 502 with a safe sentence.
 */
export async function sendTestEmail(
  user: { id: string; email: string },
  monitorId: string,
): Promise<NotificationItem> {
  const monitor = await getMonitor(user.id, monitorId);
  const rule = await ensureRule(prisma, monitorId);
  const recipient = rule.recipientEmail ?? user.email;
  const now = new Date();

  const message = renderAlertEmail({
    kind: "TEST",
    monitorName: monitor.name,
    monitorUrl: monitor.url,
    monitorLink: monitorLink(monitor.id),
  });

  try {
    await getEmailService().send({ to: recipient, ...message });
  } catch (err) {
    logger.warn({ err, monitorId }, "test email failed");
    const reason = describeSendError(err);
    await prisma.notificationLog.create({
      data: {
        monitorId,
        type: "TEST",
        status: "FAILED",
        recipient,
        eventAt: now,
        attempts: 1,
        error: reason,
      },
    });
    throw new AppError(502, "EMAIL_SEND_FAILED", `Could not send the test email. ${reason}`);
  }

  const row = await prisma.notificationLog.create({
    data: {
      monitorId,
      type: "TEST",
      status: "SENT",
      recipient,
      eventAt: now,
      attempts: 1,
      sentAt: new Date(),
    },
  });
  return serializeNotification(row);
}