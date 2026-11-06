import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../services/auth.js";
import { openKeyOf } from "../services/incidentLifecycle.js";
import { DEMO_PROFILES, generateHistory } from "./demoHistory.js";

export const DEMO_EMAIL = "demo@apimonitor.dev";
export const DEMO_PASSWORD = "demo-password-123";

const BATCH = 5_000;

/**
 * The demo monitors are frozen: their next check is due in 2099, so the scheduler (which only claims monitors
 * whose nextCheckAt has passed) never runs them. Otherwise it would mix real checks into the synthetic history,
 * and turn the demo into fresh outages whenever the machine is offline. "Check now" still works on them.
 */
const FROZEN_NEXT_CHECK = new Date("2099-01-01T00:00:00.000Z");

/**
 * Creates (or rebuilds) the demo account: a PRO user with four monitors and 30 days of synthetic checks
 * and matching incidents.
 *
 * Idempotent: it upserts the user and DELETES that user's monitors (their checks and incidents go with
 * them, by cascade) before creating them again, so running it twice ends in exactly the same state and
 * never duplicates anything. Only the demo user is touched. All in one transaction: either the whole demo
 * is there or nothing changed.
 */
export async function seedDemo(options: { days?: number; nowMs?: number } = {}) {
  const days = options.days ?? 30;
  const nowMs = options.nowMs ?? Date.now();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.upsert({
        where: { email: DEMO_EMAIL },
        update: { name: "Demo User", passwordHash, plan: "PRO" },
        create: { name: "Demo User", email: DEMO_EMAIL, passwordHash, plan: "PRO" },
      });
      await tx.monitor.deleteMany({ where: { userId: user.id } });

      const summary: { name: string; checks: number; incidents: number }[] = [];
      for (const profile of DEMO_PROFILES) {
        const history = generateHistory(profile, nowMs, days);
        const { final } = history;

        const monitor = await tx.monitor.create({
          data: {
            userId: user.id,
            name: profile.name,
            url: profile.url,
            intervalSec: profile.intervalSec,
            timeoutMs: profile.timeoutMs,
            responseThresholdMs: profile.responseThresholdMs,
            status: final.status,
            failStreak: final.failStreak,
            slowStreak: final.slowStreak,
            okStreak: final.okStreak,
            lastCheckedAt: final.lastCheckedAt,
            lastStatusCode: final.lastStatusCode,
            lastResponseTimeMs: final.lastResponseTimeMs,
            lastStatusChangeAt: final.lastStatusChangeAt,
            nextCheckAt: FROZEN_NEXT_CHECK,
          },
        });

        for (let i = 0; i < history.checks.length; i += BATCH) {
          await tx.check.createMany({
            data: history.checks.slice(i, i + BATCH).map((c) => ({
              monitorId: monitor.id,
              trigger: "SCHEDULED" as const,
              outcome: c.outcome,
              failureType: c.failureType,
              statusCode: c.statusCode,
              responseTimeMs: c.responseTimeMs,
              errorMessage: c.errorMessage,
              checkedAt: c.checkedAt,
            })),
          });
        }

        await tx.incident.createMany({
          data: history.incidents.map((i) => ({
            monitorId: monitor.id,
            type: i.type,
            status: i.resolvedAt ? ("RESOLVED" as const) : ("OPEN" as const),
            resolution: i.resolvedAt ? ("RECOVERED" as const) : null,
            reason: i.reason,
            failureType: i.failureType,
            failedChecks: i.failedChecks,
            startedAt: i.startedAt,
            resolvedAt: i.resolvedAt,
            durationSec: i.durationSec,
            openKey: i.resolvedAt ? null : openKeyOf(monitor.id, i.type),
          })),
        });

        summary.push({
          name: profile.name,
          checks: history.checks.length,
          incidents: history.incidents.length,
        });
      }
      return { userId: user.id, monitors: summary };
    },
    { timeout: 180_000, maxWait: 10_000 },
  );
}
