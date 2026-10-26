import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { publicUserSelect } from "../services/auth.js";
import { AUTH_COOKIE } from "../utils/cookies.js";
import { AppError } from "../utils/errors.js";
import { verifyToken } from "../utils/jwt.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  const userId = typeof token === "string" ? await verifyToken(token) : null;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect })
    : null;

  if (!user) return next(new AppError(401, "UNAUTHORIZED", "Please log in to continue."));
  req.user = user;
  next();
};
