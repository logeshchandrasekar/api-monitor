import rateLimit from "express-rate-limit";
import { AppError } from "../utils/errors.js";

/** 6 manual checks per minute per USER (not per IP), as SEC-5 asks. Runs after requireAuth. */
export const manualCheckLimiter = rateLimit({
  windowMs: 60_000,
  limit: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  handler: (_req, _res, next) =>
    next(new AppError(429, "RATE_LIMITED", "Too many manual checks. Try again in a minute.")),
});
