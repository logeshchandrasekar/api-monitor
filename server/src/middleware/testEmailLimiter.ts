import rateLimit from "express-rate-limit";
import { AppError } from "../utils/errors.js";

/**
 * 5 test emails per 10 minutes per USER. The recipient can be any address the person types, so without a
 * limit the button could be used to send mail to someone else over and over. Runs after requireAuth.
 */
export const testEmailLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  handler: (_req, _res, next) =>
    next(new AppError(429, "RATE_LIMITED", "Too many test emails. Try again in a few minutes.")),
});
