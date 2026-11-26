import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

// Disabled under test unless a test opts in with RATE_LIMIT_TEST=1
const skip = () => env.NODE_ENV === "test" && process.env.RATE_LIMIT_TEST !== "1";

const handler = (_req: unknown, _res: unknown, next: (err?: unknown) => void) =>
  next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  handler,
});

// Phase 10. Applied only to /register and it counts the accounts that were created (failed attempts are not counted),
// so a bot minting accounts is stopped while a person who mistypes is not. REGISTER_LIMIT_PER_HOUR=0 switches it off.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: () => env.REGISTER_LIMIT_PER_HOUR,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipFailedRequests: true,
  skip: () => skip() || env.REGISTER_LIMIT_PER_HOUR === 0,
  handler,
});

// Applied only to register/login. Successful requests are not counted.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  handler,
});
