import { env } from "../config/env.js";
import { onIncidentEvent } from "../lib/incidentEvents.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { renderAlertEmail } from "../services/alertTemplates.js";
import { describeSendError, getEmailService, type EmailService } from "../services/email.js";
import { monitorLink } from "../services/notifications.js";

/** One first try plus three retries (ALT-2: "retries up to 3 times"). */
export const MAX_ATTEMPTS = 4;
export const BATCH_SIZE = 10;
/** How long a claimed row is invisible to other dispatchers. If the process dies mid-send, the row is picked up again after this. */
export const CLAIM_LEASE_MS = 2 * 60_000;

/** Wait before retry n (n = 1, 2, 3): 1x, 4x and 20x the base delay. */
export const retryDelayMs = (failedAttempts: number) =>
  ([1, 4, 20][failedAttempts - 1] ?? 20) * env.ALERT_RETRY_BASE_MS;

/**
 * Takes up to `limit` due QUEUED rows and pushes their nextAttemptAt a lease into the future, in one
 * transaction (the same idea as the scheduler's claim, ENG-1). FOR UPDATE SKIP LOCKED means two dispatchers
 * (two ticks, two processes) never take the same row, so an email is never sent twice at once.
 */
export async function claimDueNotifications(limit = BATCH_SIZE): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM notification_logs
      WHERE status = 'QUEUED' AND "nextAttemptAt" <= now()
      ORDER BY "createdAt", id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    if (due.length === 0) return [];
    const ids = due.map((row) => row.id);
    await tx.$executeRaw`
      UPDATE notification_logs
      SET "nextAttemptAt" = now() + (${CLAIM_LEASE_MS} * interval '1 millisecond')
      WHERE id = ANY(${ids})`;
    return ids;
  });
}

export type DeliveryOutcome = "sent" | "retry" | "failed" | "suppressed" | "deferred" | "skipped";

/** Sends one claimed row and records the result. Never throws for a send problem: that is data, not a crash. */
export async function deliver(id: string, email: EmailService): Promise<DeliveryOutcome> {
  const log = await prisma.notificationLog.findUnique({
    where: { id },
    include: { monitor: { select: { id: true, name: true, url: true } }, incident: true },
  });
  if (!log || log.status !== "QUEUED") return "skipped";

  // The recovery mail is the second half of a pair: it never overtakes, and never exists without, its alert.
  if (log.type === "RECOVERED" && log.incident) {
    const alert = await prisma.notificationLog.findFirst({
      where: { incidentId: log.incident.id, type: log.incident.type },
    });
    if (alert?.status === "QUEUED") {
      // Still being retried: look again on the next tick instead of sending "recovered" before "down"
      await prisma.notificationLog.updateMany({
        where: { id, status: "QUEUED" },
        data: { nextAttemptAt: new Date(Date.now() + env.DISPATCH_TICK_MS) },
      });
      return "deferred";
    }
    if (alert?.status !== "SENT") {
      await prisma.notificationLog.updateMany({
        where: { id, status: "QUEUED" },
        data: {
          status: "SUPPRESSED",
          note: `The ${log.incident.type} alert for this incident was not delivered, so no recovery email is sent.`,
        },
      });
      return "suppressed";
    }
  }

  const message = renderAlertEmail({
    kind: log.type,
    monitorName: log.monitor.name,
    monitorUrl: log.monitor.url,
    monitorLink: monitorLink(log.monitor.id),
    incidentType: log.incident?.type,
    reason: log.incident?.reason,
    startedAt: log.incident?.startedAt,
    resolvedAt: log.incident?.resolvedAt,
    durationSec: log.incident?.durationSec,
  });

  try {
    await email.send({ to: log.recipient, ...message });
  } catch (err) {
    const attempts = log.attempts + 1;
    const reason = describeSendError(err);
    // The raw error (host, port, server banner) stays in the log; the row only gets the safe sentence
    logger.warn({ err, notificationId: id, attempts }, "alert email failed");
    if (attempts >= MAX_ATTEMPTS) {
      await prisma.notificationLog.updateMany({
        where: { id, status: "QUEUED" },
        data: { status: "FAILED", attempts, error: reason },
      });
      return "failed";
    }
    await prisma.notificationLog.updateMany({
      where: { id, status: "QUEUED" },
      data: {
        attempts,
        error: reason,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
      },
    });
    return "retry";
  }

  await prisma.notificationLog.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "SENT", attempts: log.attempts + 1, sentAt: new Date(), error: null },
  });
  return "sent";
}

/** One dispatcher pass: claim what is due, send it (a few at a time), record every outcome. Returns how many rows it took. */
export async function runDispatchPass(email: EmailService = getEmailService()): Promise<number> {
  const ids = await claimDueNotifications();
  // allSettled: one row blowing up never stops the others
  const results = await Promise.allSettled(ids.map((id) => deliver(id, email)));
  results.forEach((r, i) => {
    if (r.status === "rejected")
      logger.error({ err: r.reason, notificationId: ids[i] }, "dispatching an alert crashed");
  });
  return ids.length;
}

export type DispatcherHandle = { kick: () => void; stop: (waitMs?: number) => Promise<void> };

/**
 * Starts the polling loop: every DISPATCH_TICK_MS, and immediately after an incident event (a row was just
 * committed, so there is no reason to wait for the next tick). Rows are in the database, so a restart loses nothing.
 */
export function startDispatcher(
  opts: { tickMs?: number; email?: EmailService } = {},
): DispatcherHandle {
  const tickMs = opts.tickMs ?? env.DISPATCH_TICK_MS;
  let stopped = false;
  let current: Promise<void> | null = null;
  let again = false;

  const run = () => {
    if (stopped) return;
    if (current) {
      again = true; // something new arrived while a pass was running: go once more when it ends
      return;
    }
    current = runDispatchPass(opts.email)
      .then((n) => {
        if (n > 0) logger.debug({ claimed: n }, "dispatcher pass");
        if (n >= BATCH_SIZE) again = true; // a full batch: there may be more
      })
      .catch((err) => logger.error({ err }, "dispatcher pass failed")) // the loop must survive a DB hiccup
      .finally(() => {
        current = null;
        if (again && !stopped) {
          again = false;
          run();
        }
      });
  };

  run(); // right away: after a restart, queued mail goes out immediately
  const timer = setInterval(run, tickMs);
  const unsubscribe = onIncidentEvent(() => run());
  logger.info({ tickMs }, "alert dispatcher started");

  return {
    kick: run,
    async stop(waitMs = 10_000) {
      stopped = true;
      clearInterval(timer);
      unsubscribe();
      if (!current) return;
      const timedOut = await Promise.race([
        current.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), waitMs).unref()),
      ]);
      if (timedOut) logger.warn("dispatcher stopped while emails were still being sent");
    },
  };
}
