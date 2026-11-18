import { PLAN_LIMITS, allowedIntervals, type PlanName } from "../config/plans.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/errors.js";
import { hashPassword, publicUserSelect, verifyPassword } from "./auth.js";

export function updateName(userId: string, name: string) {
  return prisma.user.update({ where: { id: userId }, data: { name }, select: publicUserSelect });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Please log in to continue.");

  // 400, not 401: the frontend treats any 401 as "session expired" and logs the user out
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Your current password is incorrect.");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}

/**
 * Permanently deletes the account (Phase 9). The password is checked again first. One DELETE on the
 * user row removes everything it owns through ON DELETE CASCADE: monitors, and through them checks,
 * incidents, alert rules and notification logs. Nothing about the person is logged except the id.
 */
export async function deleteAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Please log in to continue.");

  // 400, not 401: a 401 makes the frontend think the session expired and log out
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(400, "INVALID_PASSWORD", "That password is not correct.");
  }

  const monitors = await prisma.monitor.count({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  logger.info({ userId, monitors }, "account deleted");
}

/** What this plan allows, straight from config/plans.ts, so the client never hard-codes the plan table. */
export async function getLimits(user: { id: string; plan: PlanName }) {
  const limits = PLAN_LIMITS[user.plan];
  return {
    plan: user.plan,
    maxMonitors: limits.maxMonitors,
    monitorCount: await prisma.monitor.count({ where: { userId: user.id } }),
    minIntervalSec: limits.minIntervalSec,
    allowedIntervalsSec: allowedIntervals(user.plan), // includes 10 s and 30 s outside production
    maxTimeoutMs: limits.maxTimeoutMs,
    retentionDays: limits.retentionDays,
  };
}
