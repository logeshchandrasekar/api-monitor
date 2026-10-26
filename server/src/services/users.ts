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
